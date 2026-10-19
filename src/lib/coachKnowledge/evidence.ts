import type { PostureBodyPosition, Technique } from '../../types';

// 기술 근거 묶음 — what MARTIALDEX's technique data REALLY says about one
// technique, field by field, with every field marked present or absent.
// Pure (no data loading): the caller resolves the technique and its related
// techniques (lookup.ts). Nothing is borrowed from another technique and no
// field is filled with a default — an empty / placeholder / generic value is
// recorded as ABSENT, never as evidence.

export type BodyPart = keyof PostureBodyPosition;
export const BODY_PARTS: BodyPart[] = ['head', 'upperBody', 'arms', 'hips', 'legs', 'feet', 'weightDistribution', 'distance'];
export const BODY_LABEL: Record<BodyPart, string> = {
  head: '머리·시선',
  upperBody: '상체',
  arms: '팔·손',
  hips: '골반·엉덩이',
  legs: '다리·무릎',
  feet: '발 위치',
  weightDistribution: '체중 분배',
  distance: '거리',
};

export type EvidenceField =
  | 'overview'
  | 'description'
  | 'purpose'
  | 'startingPosition'
  | 'steps'
  | 'keyPoints'
  | 'commonMistakes'
  | 'difficulty'
  | 'positions'
  | 'principles'
  | 'related'
  | `body.${BodyPart}`;

export const FIELD_LABEL: Record<EvidenceField, string> = {
  overview: '자세 개요',
  description: '기술 설명',
  purpose: '사용 목적',
  startingPosition: '시작 자세',
  steps: '동작 단계',
  keyPoints: '핵심 포인트',
  commonMistakes: '흔한 실수',
  difficulty: '난이도',
  positions: '사용 상황·포지션',
  principles: '원리',
  related: '관련 기술',
  ...(Object.fromEntries(BODY_PARTS.map((b) => [`body.${b}`, BODY_LABEL[b]])) as Record<`body.${BodyPart}`, string>),
};

export const ALL_FIELDS = Object.keys(FIELD_LABEL) as EvidenceField[];

export interface EvidenceItem {
  field: EvidenceField;
  label: string;
  /** The data's own text, verbatim (trimmed). */
  values: string[];
  /** Where it came from in the Technique record ("posture.keyPoints[0]" …). */
  source: string;
}

export interface RelatedTechniqueRef {
  techniqueId: string;
  name: string;
  /** How the data links them (relatedTechniques / graph edge kind). */
  relation: 'related' | 'prerequisite' | 'next' | 'chain' | 'counter' | 'escape';
}

export interface TechniqueEvidence {
  techniqueId: string;
  name: string;
  /** "잽(Jab)" style name for speech. */
  displayName: string;
  martialArt: string;
  fields: Partial<Record<EvidenceField, EvidenceItem>>;
  present: EvidenceField[];
  absent: EvidenceField[];
  /** Fields that had a value the data filters rejected (placeholder / generic), with the reason. */
  rejected: { field: EvidenceField; reason: string }[];
}

const PLACEHOLDER = /^(?:-+|—+|n\/?a|null|undefined|none|tbd|todo|없음|미정|준비\s*중.*|자세\s*설명\s*준비\s*중.*|정보\s*없음|\.+|\?+)$/i;

/** A value counts as evidence only when it is real text, not an empty/placeholder default. */
export function meaningful(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (t.length < 2 || PLACEHOLDER.test(t)) return false;
  return /[\p{L}]/u.test(t);
}

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

export interface EvidenceOptions {
  /** Related techniques that really exist (resolved by the caller). */
  related?: RelatedTechniqueRef[];
  /**
   * Texts the corpus repeats across several techniques (a category's
   * paragraph pasted into every punch's `purpose`, …): they say nothing about
   * THIS technique, so they are rejected as evidence. Normalised with genericKey().
   */
  genericTexts?: Set<string>;
}

export function genericKey(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function displayNameOf(t: Pick<Technique, 'name' | 'koreanName'>): string {
  return t.koreanName && t.koreanName !== t.name ? `${t.koreanName}(${t.name})` : t.name;
}

export function buildEvidence(t: Technique, opts: EvidenceOptions = {}): TechniqueEvidence {
  const fields: Partial<Record<EvidenceField, EvidenceItem>> = {};
  const rejected: TechniqueEvidence['rejected'] = [];
  const generic = opts.genericTexts ?? new Set<string>();

  const put = (field: EvidenceField, raw: unknown[], source: string) => {
    const values: string[] = [];
    for (const r of raw) {
      if (!meaningful(r)) continue;
      const v = clean(r);
      if (generic.has(genericKey(v))) {
        rejected.push({ field, reason: '여러 기술에 똑같이 들어 있는 일반 문단 (이 기술만의 근거가 아님)' });
        continue;
      }
      if (!values.includes(v)) values.push(v);
    }
    if (values.length) fields[field] = { field, label: FIELD_LABEL[field], values, source };
  };

  const p = t.posture;
  put('overview', [p?.overview], 'posture.overview');
  put('description', [t.description], 'description');
  put('purpose', [t.purpose], 'purpose');
  put('startingPosition', [p?.startingPosition], 'posture.startingPosition');
  put('steps', p?.steps ?? [], 'posture.steps');
  put('keyPoints', p?.keyPoints ?? [], 'posture.keyPoints');
  put('commonMistakes', p?.commonMistakes ?? [], 'posture.commonMistakes');
  for (const b of BODY_PARTS) put(`body.${b}`, [p?.bodyPosition?.[b]], `posture.bodyPosition.${b}`);
  put('positions', t.positions.filter((x) => !/자주 등장|노기/.test(x)), 'positions');
  put('principles', t.principles, 'principles');
  if (t.difficulty) fields.difficulty = { field: 'difficulty', label: FIELD_LABEL.difficulty, values: [DIFFICULTY_LABEL[t.difficulty]], source: 'difficulty' };
  const related = (opts.related ?? []).filter((r) => r.techniqueId !== t.id && meaningful(r.name));
  if (related.length) fields.related = { field: 'related', label: FIELD_LABEL.related, values: [...new Set(related.map((r) => r.name))], source: 'relatedTechniques + techniqueGraph' };

  const present = ALL_FIELDS.filter((f) => !!fields[f]);
  return {
    techniqueId: t.id,
    name: t.name,
    displayName: displayNameOf(t),
    martialArt: t.martialArt,
    fields,
    present,
    absent: ALL_FIELDS.filter((f) => !fields[f]),
    rejected,
  };
}

export const DIFFICULTY_LABEL: Record<NonNullable<Technique['difficulty']>, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };
