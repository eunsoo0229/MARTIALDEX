// Gi / No-Gi types and labels — no data import, so anything (the add-technique
// flow, types.ts) can use them without pulling data/curated/gi-nogi.json into
// its bundle.

export type GrapplingStyle = 'gi' | 'nogi';
export type GiNoGiClass = 'both_differs' | 'gi_centric' | 'nogi_centric' | 'same' | 'undecided';
export type VideoStyle = 'gi' | 'nogi' | 'both' | 'unknown';

export const CLASS_LABEL: Record<GiNoGiClass, string> = {
  both_differs: 'Gi·No-Gi 공통 (수행 방식 차이 있음)',
  gi_centric: 'Gi 중심 기술',
  nogi_centric: 'No-Gi 중심 기술',
  same: 'Gi·No-Gi 공통 (수행 방식 동일)',
  undecided: 'Gi/No-Gi 분류 판단 보류',
};

export const STYLE_LABEL: Record<GrapplingStyle, string> = { gi: 'Gi', nogi: 'No-Gi' };

export interface StylePosture {
  grips: string;
  steps: string[];
  keyPoints: string[];
  safety: string | null;
  /** ai_researched = AI가 웹 자료로 정리, 사람 검토 전. */
  status: 'ai_researched' | 'verified';
  sources: { title: string; url: string }[];
}

export interface GiNoGiRecord {
  name: string;
  koreanName: string | null;
  arts: string[];
  category: string;
  classification: GiNoGiClass;
  gi: { applicable: boolean | null };
  noGi: { applicable: boolean | null };
  method: 'rule' | 'ai_grounded' | 'ai_web_sources' | 'ai_rejected' | 'pending' | 'user';
  reason: string | null;
  difference: string | null;
  confidence: string | null;
  evidence: { type: string; text: string }[];
  sources: { title: string; url: string }[];
  /** Does the existing (single) posture text mention gi grips? Then it's shown only under Gi. */
  basePostureStyle: 'gi' | 'neutral' | null;
  postures: { gi?: StylePosture; noGi?: StylePosture };
}
