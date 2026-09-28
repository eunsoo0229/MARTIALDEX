import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMartialArt, getTechnique, getTechniquesByMartialArt, martialArtSummaries } from '../lib/loadData';
import { getTechniqueConnections } from '../lib/techniqueGraph/buildGraph';
import { RELATION_LABEL, type ConnectedTechnique, type RelationKind } from '../lib/techniqueGraph/types';
import { useAllSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import DifficultyBadge from '../components/DifficultyBadge';
import AiAskModal from '../components/AiAskModal';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const MASTERY_COLOR: Record<MasteryStatus, string> = {
  proficient: '#3fb950',
  average: '#d4a72c',
  needs_improvement: '#e2564c',
  learning: '#4a9eda',
  not_started: '#8b93a1',
};

interface Sector {
  angle: number;
  spread: number;
  radius: number;
  color: string;
}

const SECTORS: Record<RelationKind, Sector> = {
  next: { angle: 0, spread: 80, radius: 190, color: '#3fb950' },
  chain: { angle: 60, spread: 70, radius: 240, color: '#7c8bd8' },
  counter: { angle: 120, spread: 60, radius: 280, color: '#e2564c' },
  prerequisite: { angle: 180, spread: 80, radius: 190, color: '#8b93a1' },
  escape: { angle: 240, spread: 60, radius: 280, color: '#d4a72c' },
  samePosition: { angle: 300, spread: 70, radius: 240, color: '#5a9ed1' },
};

interface GraphNode {
  id: string;
  name: string;
  martialArt: string;
  kind: RelationKind;
  x: number;
  y: number;
}

function layoutNodes(connections: Record<RelationKind, ConnectedTechnique[]>): GraphNode[] {
  const nodes: GraphNode[] = [];
  (Object.keys(SECTORS) as RelationKind[]).forEach((kind) => {
    const items = connections[kind];
    const { angle, spread, radius } = SECTORS[kind];
    items.forEach((item, i) => {
      const a = items.length > 1 ? angle - spread / 2 + (spread * i) / (items.length - 1) : angle;
      const rad = (a * Math.PI) / 180;
      nodes.push({ id: item.techniqueId, name: item.techniqueName, martialArt: item.martialArt, kind, x: radius * Math.cos(rad), y: radius * Math.sin(rad) });
    });
  });
  return nodes;
}

export default function TechniqueGraph() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTechniqueId = searchParams.get('technique') ?? '';
  const initialTechnique = initialTechniqueId ? getTechnique(initialTechniqueId) : undefined;

  const [martialArt, setMartialArt] = useState(initialTechnique?.martialArt ?? '');
  const [position, setPosition] = useState('');
  const [query, setQuery] = useState('');
  const [centerId, setCenterId] = useState<string | null>(initialTechnique?.id ?? null);
  const [history, setHistory] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [aiOpen, setAiOpen] = useState(false);
  const draggingRef = useRef<{ startX: number; startY: number; origPan: { x: number; y: number } } | null>(null);

  const skillEntries = useAllSkillProgress();
  const progressMap = useMemo(() => new Map(skillEntries.map((e) => [e.technique.id, e.progress])), [skillEntries]);

  const centerTechnique = centerId ? getTechnique(centerId) : undefined;

  function centerOn(id: string) {
    if (centerId) setHistory((h) => [...h, centerId]);
    setCenterId(id);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSearchParams({ technique: id });
  }

  function goBack() {
    const prev = history[history.length - 1];
    if (!prev) return;
    // Every setter called directly in this handler (not nested inside
    // another setState's updater function) — nesting them inside
    // setHistory's updater previously triggered React's "Cannot update a
    // component while rendering a different component" warning, since
    // updater functions can run during render/reconciliation.
    setHistory((h) => h.slice(0, -1));
    setCenterId(prev);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSearchParams({ technique: prev });
  }

  function backToBrowse() {
    setCenterId(null);
    setHistory([]);
    setSearchParams({});
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(2.5, Math.max(0.4, Math.round((z + delta) * 10) / 10)));
  }
  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    draggingRef.current = { startX: e.clientX, startY: e.clientY, origPan: pan };
  }
  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    setPan({ x: draggingRef.current.origPan.x + dx, y: draggingRef.current.origPan.y + dy });
  }
  function handlePointerUp() {
    draggingRef.current = null;
  }

  const artTechniques = martialArt ? getTechniquesByMartialArt(martialArt) : [];
  const positions = useMemo(
    () => Array.from(new Set(artTechniques.flatMap((t) => t.positions))).sort((a, b) => a.localeCompare(b, 'ko')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [martialArt]
  );
  const browseList = artTechniques
    .filter((t) => !position || t.positions.includes(position))
    .filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()) || (t.koreanName ?? '').includes(query));

  const art = martialArt ? getMartialArt(martialArt) : undefined;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>기술 그래프</span>
        </div>

        <div className="section-title">
          <h2>🕸 기술 그래프</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          기술 사이의 실제 연결(선행/다음/카운터/탈출/같은 포지션/연결 기술)을 시각적으로 살펴봅니다. 노드
          색상은 나의 숙련도를 나타냅니다.
        </p>

        {!centerTechnique ? (
          <div className="card info-card">
            <h3>무술/포지션 선택 후 중심 기술을 고르세요</h3>
            <div className="filter-bar">
              <div className="filter-bar__left">
                <select
                  className="select"
                  value={martialArt}
                  onChange={(e) => {
                    setMartialArt(e.target.value);
                    setPosition('');
                  }}
                >
                  <option value="">무술 선택</option>
                  {martialArtSummaries.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameKo}
                    </option>
                  ))}
                </select>
                {martialArt && (
                  <select className="select" value={position} onChange={(e) => setPosition(e.target.value)}>
                    <option value="">전체 포지션</option>
                    {positions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
                {martialArt && (
                  <input className="select" placeholder="기술 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                )}
              </div>
              {martialArt && <span className="result-count">{browseList.length}개</span>}
            </div>

            {!martialArt ? (
              <EmptyState icon="🥋" text="무술을 선택하면 해당 무술의 기술 목록이 나타납니다." />
            ) : (
              <div className="chip-row">
                {browseList.slice(0, 150).map((t) => {
                  const progress = progressMap.get(t.id);
                  return (
                    <button key={t.id} className="chip" onClick={() => centerOn(t.id)}>
                      {progress ? MASTERY_ICON[progress.status] : MASTERY_ICON.not_started} {t.name}
                    </button>
                  );
                })}
                {browseList.length > 150 && <span className="chip">외 {browseList.length - 150}개 (검색으로 좁혀보세요)</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="card info-card">
            <div className="chip-row" style={{ justifyContent: 'space-between' }}>
              <div className="chip-row">
                <button className="btn btn-ghost btn-sm" onClick={backToBrowse}>
                  ← 목록으로
                </button>
                {history.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={goBack}>
                    ↩ 이전 기술
                  </button>
                )}
              </div>
              <div className="chip-row">
                <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>
                  확대 +
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
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
            </div>

            <div className="detail-hero" style={{ marginTop: 8 }}>
              <div>
                <h1>{centerTechnique.name}</h1>
                <div className="chip-row">
                  <span className="chip active">{getMartialArt(centerTechnique.martialArt)?.nameKo ?? centerTechnique.martialArt}</span>
                  <DifficultyBadge difficulty={centerTechnique.difficulty} />
                  {progressMap.get(centerTechnique.id) && (
                    <span className="chip">
                      {MASTERY_ICON[progressMap.get(centerTechnique.id)!.status]} {MASTERY_LABEL[progressMap.get(centerTechnique.id)!.status]}
                    </span>
                  )}
                </div>
              </div>
              <div className="detail-actions">
                <Link to={`/arts/${centerTechnique.martialArt}/techniques/${centerTechnique.id}`} className="btn btn-secondary">
                  기술 상세 보기
                </Link>
                <button className="btn btn-primary" onClick={() => setAiOpen(true)}>
                  ✦ AI에게 질문
                </button>
              </div>
            </div>

            <GraphCanvas
              centerTechnique={centerTechnique}
              progressMap={progressMap}
              zoom={zoom}
              pan={pan}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onNodeClick={centerOn}
            />

            <div className="chip-row" style={{ marginTop: 10 }}>
              {(Object.keys(SECTORS) as RelationKind[]).map((k) => (
                <span key={k} className="chip">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: SECTORS[k].color, marginRight: 4 }} />
                  {RELATION_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {aiOpen && centerTechnique && <AiAskModal onClose={() => setAiOpen(false)} technique={centerTechnique} />}
    </div>
  );
}

function GraphCanvas({
  centerTechnique,
  progressMap,
  zoom,
  pan,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onNodeClick,
}: {
  centerTechnique: NonNullable<ReturnType<typeof getTechnique>>;
  progressMap: Map<string, { status: MasteryStatus }>;
  zoom: number;
  pan: { x: number; y: number };
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onNodeClick: (id: string) => void;
}) {
  const connections = getTechniqueConnections(centerTechnique);
  const nodes = layoutNodes(connections);
  const centerProgress = progressMap.get(centerTechnique.id);

  if (nodes.length === 0) {
    return <EmptyState icon="🔗" text="이 기술은 아직 실제 데이터로 확인되는 연결 기술이 없습니다." />;
  }

  return (
    <svg
      viewBox="-380 -380 760 760"
      className="graph-svg"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {nodes.map((n) => (
          <line key={`line-${n.kind}-${n.id}`} x1={0} y1={0} x2={n.x} y2={n.y} stroke={SECTORS[n.kind].color} strokeWidth={1.5} opacity={0.55} />
        ))}
        {nodes.map((n) => {
          const progress = progressMap.get(n.id);
          const color = progress ? MASTERY_COLOR[progress.status] : MASTERY_COLOR.not_started;
          return (
            <g key={`${n.kind}-${n.id}`} transform={`translate(${n.x} ${n.y})`} className="graph-node" onClick={() => onNodeClick(n.id)}>
              <circle r={15} fill={color} stroke="#fff" strokeWidth={1.5} />
              <text y={28} textAnchor="middle" className="graph-node__label">
                {n.name}
              </text>
            </g>
          );
        })}
        <g>
          <circle r={22} fill={centerProgress ? MASTERY_COLOR[centerProgress.status] : MASTERY_COLOR.not_started} stroke="#f0c419" strokeWidth={3} />
          <text y={38} textAnchor="middle" className="graph-node__label graph-node__label--center">
            {centerTechnique.name}
          </text>
        </g>
      </g>
    </svg>
  );
}
