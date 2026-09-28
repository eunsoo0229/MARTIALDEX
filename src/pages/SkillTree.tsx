import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTechniquesByMartialArt, martialArtSummaries } from '../lib/loadData';
import { getTechniqueConnections } from '../lib/techniqueGraph/buildGraph';
import type { RelationKind } from '../lib/techniqueGraph/types';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import { uniqueSorted } from '../lib/search';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

// Same node-color convention as TechniqueGraph.tsx (16단계) — kept as its
// own copy here rather than importing from that page, since a page-level
// const isn't exported and this page must never modify that existing file.
const MASTERY_COLOR: Record<MasteryStatus, string> = {
  proficient: '#3fb950',
  average: '#d4a72c',
  needs_improvement: '#e2564c',
  learning: '#4a9eda',
  not_started: '#8b93a1',
};

// Progression-relevant relation kinds only (RPG 스킬트리 feel) — counter/
// escape/samePosition are real data too but drawing all 6 kinds as tree
// edges for an entire martial art turns into an unreadable hairball, so
// this page focuses on the 3 kinds that actually represent "what unlocks
// what". Nothing here invents a relation the data doesn't already have —
// see techniqueGraph/buildGraph.ts, unchanged.
const TREE_RELATIONS: RelationKind[] = ['prerequisite', 'chain', 'next'];

type Tier = 'beginner' | 'intermediate' | 'advanced' | 'unclassified';
const TIER_ORDER: Tier[] = ['beginner', 'intermediate', 'advanced', 'unclassified'];
const TIER_LABEL: Record<Tier, string> = {
  beginner: '기초',
  intermediate: '중급',
  advanced: '고급',
  unclassified: '미분류',
};

const NODE_R = 9;
const COL_SPACING = 84;
const ROW_SPACING = 46;
const NODES_PER_ROW = 6;
const TIER_GAP = 60;

interface TreeNode {
  id: string;
  name: string;
  tier: Tier;
  x: number;
  y: number;
}

export default function SkillTree() {
  const navigate = useNavigate();
  const [martialArt, setMartialArt] = useState(martialArtSummaries[0]?.id ?? '');
  const [category, setCategory] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origPan: { x: number; y: number }; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const skillEntries = useAllSkillProgress();
  const progressMap = useMemo(() => new Map(skillEntries.map((e) => [e.technique.id, e.progress])), [skillEntries]);

  // artTechniques/scoped MUST be memoized with real primitive deps
  // (martialArt/category), not recomputed as plain `const`s — otherwise
  // every render (including every pointermove while dragging, since
  // handlePointerMove calls setPan()) produces a NEW array reference, which
  // makes the tier/node/edge useMemo below (keyed on [scoped]) recompute on
  // literally every render since Object.is(prevScoped, scoped) is always
  // false. That was a real, confirmed bug (mobile performance audit) —
  // dozens of full graph-layout recomputations per second during a drag.
  const artTechniques = useMemo(() => (martialArt ? getTechniquesByMartialArt(martialArt) : []), [martialArt]);
  const categoryOptions = useMemo(() => uniqueSorted(artTechniques.map((t) => t.category)), [artTechniques]);
  const scoped = useMemo(() => artTechniques.filter((t) => !category || t.category === category), [artTechniques, category]);

  const { nodes, edges, tierCounts } = useMemo(() => {
    const byTier: Record<Tier, typeof scoped> = { beginner: [], intermediate: [], advanced: [], unclassified: [] };
    for (const t of scoped) {
      const tier: Tier = t.difficulty ?? 'unclassified';
      byTier[tier].push(t);
    }
    for (const tier of TIER_ORDER) byTier[tier].sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category, 'ko')));

    const nodeById = new Map<string, TreeNode>();
    let xOffset = 0;
    for (const tier of TIER_ORDER) {
      const items = byTier[tier];
      const rows = Math.ceil(items.length / NODES_PER_ROW) || 1;
      items.forEach((t, i) => {
        const col = i % NODES_PER_ROW;
        const row = Math.floor(i / NODES_PER_ROW);
        nodeById.set(t.id, { id: t.id, name: t.name, tier, x: xOffset + col * COL_SPACING, y: row * ROW_SPACING });
      });
      xOffset += NODES_PER_ROW * COL_SPACING + TIER_GAP;
      void rows;
    }

    const nodes = [...nodeById.values()];
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const t of scoped) {
      const from = nodeById.get(t.id);
      if (!from) continue;
      const connections = getTechniqueConnections(t);
      for (const kind of TREE_RELATIONS) {
        for (const c of connections[kind]) {
          const to = nodeById.get(c.techniqueId);
          if (to) edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
      }
    }

    const tierCounts = TIER_ORDER.map((tier) => ({ tier, count: byTier[tier].length }));
    return { nodes, edges, tierCounts };
  }, [scoped]);

  const { total, started, proficient, progressPct } = useMemo(() => {
    const total = scoped.length;
    const started = scoped.filter((t) => progressMap.get(t.id) && progressMap.get(t.id)!.status !== 'not_started').length;
    const proficient = scoped.filter((t) => progressMap.get(t.id)?.status === 'proficient').length;
    return { total, started, proficient, progressPct: total > 0 ? Math.round((started / total) * 100) : 0 };
  }, [scoped, progressMap]);

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(2.5, Math.max(0.3, Math.round((z + delta) * 10) / 10)));
  }
  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origPan: pan, moved: false };
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
    setPan({ x: dragRef.current.origPan.x + dx, y: dragRef.current.origPan.y + dy });
  }
  function handlePointerUp() {
    justDraggedRef.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
  }
  function handleNodeClick(id: string) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    navigate(`/arts/${martialArt}/techniques/${id}`);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>비주얼 기술 트리</span>
        </div>
        <div className="section-title">
          <h2>🌳 비주얼 기술 트리</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          난이도(기초→중급→고급) 순으로 기술을 배치하고, 실제 선행/연결/전환 기술 데이터로 이어줍니다. 노드
          색상은 나의 실제 숙련도입니다.
        </p>

        <div className="filter-bar">
          <div className="filter-bar__left">
            <select
              className="select"
              value={martialArt}
              onChange={(e) => {
                setMartialArt(e.target.value);
                setCategory('');
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              {martialArtSummaries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nameKo}
                </option>
              ))}
            </select>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">전체 카테고리</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <span className="result-count">{total}개</span>
        </div>

        <div className="curriculum-stat-row">
          <div>
            <strong>{total}개</strong>
            <span>전체 기술</span>
          </div>
          <div>
            <strong>{started}개</strong>
            <span>학습 시작</span>
          </div>
          <div>
            <strong>{proficient}개</strong>
            <span>숙련</span>
          </div>
          <div>
            <strong>{progressPct}%</strong>
            <span>진행률</span>
          </div>
        </div>

        {total === 0 ? (
          <EmptyState icon="🌳" text="선택한 조건에 해당하는 기술이 없습니다." />
        ) : (
          <>
            <div className="chip-row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>
                확대 +
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>
                축소 −
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                보기 초기화
              </button>
            </div>

            <svg
              viewBox="-40 -40 900 640"
              className="graph-svg"
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {tierCounts.map((tc, i) => {
                  if (tc.count === 0) return null;
                  const xStart = i * (NODES_PER_ROW * COL_SPACING + TIER_GAP) - 20;
                  return (
                    <text key={tc.tier} x={xStart} y={-14} className="graph-node__label" style={{ fontWeight: 700 }}>
                      {TIER_LABEL[tc.tier]} ({tc.count})
                    </text>
                  );
                })}
                {edges.map((e, i) => (
                  <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#8b93a1" strokeWidth={1} opacity={0.35} />
                ))}
                {nodes.map((n) => {
                  const progress = progressMap.get(n.id);
                  const color = progress ? MASTERY_COLOR[progress.status] : MASTERY_COLOR.not_started;
                  return (
                    <g key={n.id} transform={`translate(${n.x} ${n.y})`} className="graph-node" onClick={() => handleNodeClick(n.id)}>
                      <circle r={NODE_R} fill={color} stroke="#fff" strokeWidth={1.2} />
                      <text y={NODE_R + 12} textAnchor="middle" className="graph-node__label">
                        {n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="chip-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              {(Object.keys(MASTERY_ICON) as MasteryStatus[]).map((status) => (
                <span key={status} className="chip">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: MASTERY_COLOR[status], marginRight: 4 }} />
                  {MASTERY_ICON[status]} {MASTERY_LABEL[status]}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
