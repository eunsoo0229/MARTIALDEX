// 16단계 — 기술 연결 그래프. Every edge here is resolved from a REAL other
// technique in the database (never an invented node) — see buildGraph.ts
// for exactly which existing field each relation kind is derived from.
export type RelationKind = 'prerequisite' | 'next' | 'chain' | 'counter' | 'escape' | 'samePosition';

export const RELATION_LABEL: Record<RelationKind, string> = {
  prerequisite: '선행 기술',
  next: '다음 기술 (전환)',
  chain: '연결 기술',
  counter: '카운터 기술',
  escape: '탈출 기술 (상대 대응)',
  samePosition: '같은 포지션 기술',
};

export interface ConnectedTechnique {
  techniqueId: string;
  techniqueName: string;
  martialArt: string;
}

export interface TechniqueConnections {
  prerequisite: ConnectedTechnique[];
  next: ConnectedTechnique[];
  chain: ConnectedTechnique[];
  counter: ConnectedTechnique[];
  escape: ConnectedTechnique[];
  samePosition: ConnectedTechnique[];
}
