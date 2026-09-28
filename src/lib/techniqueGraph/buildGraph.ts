import type { Technique } from '../../types';
import { allTechniques, getTechniquesByIds, getTechniquesByMartialArt } from '../loadData';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../fighterStyle/styleCurriculumService';
import type { ConnectedTechnique, TechniqueConnections } from './types';

// 기존 데이터 재확인: transitions/counters/defenses는 무술당 평균 0.5/0.02/0.07개
// 뿐인 아주 희소한 자유 텍스트 필드다 — 즉 대부분 기술은 이 그래프에서 연결이
// 적거나 없는 것이 "버그"가 아니라 실제 원본 데이터의 특성이다. 이 모듈은
// 그 텍스트를 새 기술로 지어내지 않고, 실제 존재하는 다른 기술에만 연결한다.
//
// 검색창의 Fuse.js 퍼지 매칭(search.ts)은 재사용하지 않는다 — 시도해본 결과
// 두 가지 문제가 있었다: (1) 성능 — 이 필드들은 짧은 기술명 스타일 문구
// ("Hip Bump → Kimura")와 긴 서술형 문장(최대 100자 이상, 예: "상대가 뒤로
// 물러난다 → 거리 재확보, 잽으로 재압박...")이 섞여 있는데, 긴 한국어 문장을
// 퍼지 검색에 반복적으로 넣으면 앱 시작이 수십 초씩 걸릴 정도로 느려졌다.
// (2) 정확도 — 애초에 문장 전체는 기술 하나를 가리키지 않으므로, 퍼지 매칭은
// 우연히 비슷한 다른 기술과 잘못 연결될 위험(사실상의 오탐 생성)이 있었다.
// 대신 그 무술의 실제 기술 목록 안에서 "문구가 그 기술의 실제 이름을 문자
// 그대로 포함하는가"만 확인하는 단순 부분 문자열 매칭을 쓴다 — 더 빠르고,
// 더 보수적이며(느슨한 유사도로 억지 연결을 만들지 않음), 여전히 실제
// 존재하는 기술에만 연결한다.
const MAX_PHRASES = 4;
const MAX_PHRASE_LENGTH = 80; // longer than this is a narrative sentence, not a technique-name reference

function toConnected(t: Technique): ConnectedTechnique {
  return { techniqueId: t.id, techniqueName: t.name, martialArt: t.martialArt };
}

function candidatePool(martialArt: string): Technique[] {
  return martialArt === STYLE_CURRICULUM_MARTIAL_ART ? allTechniques : getTechniquesByMartialArt(martialArt);
}

function resolvePhrases(phrases: string[], excludeId: string, martialArt: string): ConnectedTechnique[] {
  const pool = candidatePool(martialArt);
  const seen = new Map<string, ConnectedTechnique>();
  const shortPhrases = phrases.filter((p) => p.length > 0 && p.length <= MAX_PHRASE_LENGTH).slice(0, MAX_PHRASES);
  for (const phrase of shortPhrases) {
    const lower = phrase.toLowerCase();
    for (const t of pool) {
      if (t.id === excludeId || seen.has(t.id)) continue;
      const nameHit = t.name.length >= 3 && lower.includes(t.name.toLowerCase());
      const koreanHit = !!t.koreanName && t.koreanName.length >= 2 && phrase.includes(t.koreanName);
      if (nameHit || koreanHit) seen.set(t.id, toConnected(t));
    }
  }
  return [...seen.values()];
}

interface ForwardEntry {
  next: ConnectedTechnique[];
  chain: ConnectedTechnique[];
  counter: ConnectedTechnique[];
  escape: ConnectedTechnique[];
}

const forwardGraph = new Map<string, ForwardEntry>();
const prerequisiteGraph = new Map<string, ConnectedTechnique[]>();
const positionIndex = new Map<string, Technique[]>();

// Computed once at module load, like martialArtSummaries in loadData.ts —
// the underlying technique data is static for the life of the app, so this
// never needs to be recomputed at runtime. Real query volume is small
// (~600-700 total search calls across all 1,253 techniques combined, given
// how sparse transitions/counters/defenses actually are), so this is cheap
// enough to do eagerly rather than lazily.
function build() {
  for (const t of allTechniques) {
    const next = resolvePhrases(t.transitions, t.id, t.martialArt);
    const chain = getTechniquesByIds(t.relatedTechniques)
      .filter((r) => r.id !== t.id)
      .map(toConnected);
    const counter = resolvePhrases(t.counters, t.id, t.martialArt);
    const escape = resolvePhrases(t.defenses, t.id, t.martialArt);
    forwardGraph.set(t.id, { next, chain, counter, escape });

    for (const p of t.positions) {
      const key = `${t.martialArt}::${p}`;
      const list = positionIndex.get(key) ?? [];
      list.push(t);
      positionIndex.set(key, list);
    }
  }

  // 다음 기술(next) 엣지를 뒤집으면 선행 기술(prerequisite)이 된다 — A의
  // transitions가 B를 가리키면, B 입장에서 A는 선행 기술이다.
  for (const t of allTechniques) {
    const entry = forwardGraph.get(t.id);
    if (!entry) continue;
    for (const target of entry.next) {
      const list = prerequisiteGraph.get(target.techniqueId) ?? [];
      list.push(toConnected(t));
      prerequisiteGraph.set(target.techniqueId, list);
    }
  }
}

build();

export function getSamePosition(technique: Technique, limit = 8): ConnectedTechnique[] {
  const seen = new Map<string, ConnectedTechnique>();
  for (const p of technique.positions) {
    const list = positionIndex.get(`${technique.martialArt}::${p}`) ?? [];
    for (const t of list) {
      if (t.id === technique.id || seen.has(t.id)) continue;
      seen.set(t.id, toConnected(t));
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

export function getTechniqueConnections(technique: Technique): TechniqueConnections {
  const forward = forwardGraph.get(technique.id) ?? { next: [], chain: [], counter: [], escape: [] };
  return {
    prerequisite: prerequisiteGraph.get(technique.id) ?? [],
    next: forward.next,
    chain: forward.chain,
    counter: forward.counter,
    escape: forward.escape,
    samePosition: getSamePosition(technique),
  };
}

export function hasAnyConnections(connections: TechniqueConnections): boolean {
  return (
    connections.prerequisite.length > 0 ||
    connections.next.length > 0 ||
    connections.chain.length > 0 ||
    connections.counter.length > 0 ||
    connections.escape.length > 0 ||
    connections.samePosition.length > 0
  );
}
