import { BODY_LABEL, FIELD_LABEL, type BodyPart, type EvidenceField, type EvidenceItem, type TechniqueEvidence } from './evidence';

// 답변 가능 여부 판정 — which pieces of information a question ASKS for, and
// whether the technique's data really holds each of them. A keyword hit is
// not enough: "발은 어떻게 해요?" needs evidence about the feet, so a
// technique with only an overview is NOT answerable for it. When a body part
// has no dedicated field, a data sentence (step / key point / starting
// position) that explicitly names that body part is accepted as a quote —
// still the technique's own text, never another technique's.

export interface InfoNeed {
  id: string;
  /** What the student asked about, in words ("발 위치"). */
  label: string;
  /** Any of these fields answers it. */
  fields: EvidenceField[];
  /** For body-part needs: words that let a step/key-point sentence count as a quote. */
  mention?: RegExp;
}

export interface CoveredNeed {
  need: InfoNeed;
  /** Evidence actually found (empty = missing). */
  evidence: EvidenceItem[];
  /** True when the evidence is a quoted sentence that mentions the body part, not a dedicated field. */
  viaMention: boolean;
}

export type AnswerStatus = 'answerable' | 'partial' | 'unanswerable';

export interface Answerability {
  status: AnswerStatus;
  needs: CoveredNeed[];
  /** Labels of what the data does not hold. */
  missing: string[];
  /** Labels of what it does hold for this question. */
  confirmed: string[];
}

const BODY_NEEDS: { part: BodyPart; ask: RegExp; mention: RegExp }[] = [
  { part: 'feet', ask: /발(?!차|사|전|표|음|견|생|휘)|발끝|발뒤꿈치|스탠스|feet|foot|stance/i, mention: /발(?!차|사|전|표|음|견|생|휘)|발끝|뒤꿈치|스탠스/ },
  { part: 'arms', ask: /팔(?!굽)|손(?!목\s*잡)|주먹|팔꿈치|가드|arm|hand|elbow/i, mention: /팔|손|주먹|팔꿈치|가드/ },
  { part: 'head', ask: /머리|턱|시선|눈|head|chin/i, mention: /머리|턱|시선/ },
  { part: 'upperBody', ask: /상체|어깨|몸통|등|가슴|shoulder|torso/i, mention: /상체|어깨|몸통|가슴/ },
  { part: 'hips', ask: /고관절|골반|엉덩이|허리|힙|hip/i, mention: /고관절|골반|엉덩이|허리|힙/ },
  { part: 'legs', ask: /다리|무릎|leg|knee/i, mention: /다리|무릎/ },
  { part: 'weightDistribution', ask: /체중|무게|중심|balance|weight/i, mention: /체중|무게|중심/ },
  { part: 'distance', ask: /거리|간격|사거리|range|distance/i, mention: /거리|간격/ },
];

const TOPIC_NEEDS: { id: string; ask: RegExp; label: string; fields: EvidenceField[] }[] = [
  { id: 'start', ask: /시작\s*자세|준비\s*자세|처음\s*자세|어디서\s*시작/, label: FIELD_LABEL.startingPosition, fields: ['startingPosition'] },
  { id: 'steps', ask: /순서|단계|방법|how\s*to/i, label: FIELD_LABEL.steps, fields: ['steps'] },
  { id: 'keypoints', ask: /핵심|포인트|중요|요령|팁|비결|key\s*point|tip/i, label: FIELD_LABEL.keyPoints, fields: ['keyPoints'] },
  { id: 'mistakes', ask: /실수|주의|잘못|조심|흔한|mistake|error/i, label: FIELD_LABEL.commonMistakes, fields: ['commonMistakes'] },
  { id: 'purpose', ask: /언제|상황|왜|목적|이유|용도|쓰는\s*(때|이유)|쓰나요|써요|when|why/i, label: '사용 목적·상황', fields: ['purpose', 'positions', 'principles'] },
  { id: 'difficulty', ask: /난이도|어려워|어렵|쉬워|쉬운|초보|수준|레벨|difficult|level/i, label: FIELD_LABEL.difficulty, fields: ['difficulty'] },
  { id: 'related', ask: /관련|연결|다음에|이어서|콤보|비슷한|카운터|막는|대처|related|combo|counter/i, label: FIELD_LABEL.related, fields: ['related'] },
  { id: 'what', ask: /뭐야|뭔가요|무엇|어떤\s*기술|설명해|개요|정의|what\s*is/i, label: '기술 설명', fields: ['overview', 'description', 'purpose'] },
];

/** Usage questions that stay usage questions even when a body part is named ("언제 써요", "어떤 상황"). */
const PURPOSE_STRICT = /언제|상황|목적|용도|when/i;

/** The information a question asks for. A question that names nothing specific asks "what is it". */
export function needsOf(question: string): InfoNeed[] {
  const q = question.normalize('NFKC');
  const out: InfoNeed[] = [];
  for (const b of BODY_NEEDS) if (b.ask.test(q)) out.push({ id: `body.${b.part}`, label: BODY_LABEL[b.part], fields: [`body.${b.part}`], mention: b.mention });
  const bodyAsked = out.length > 0;
  for (const t of TOPIC_NEEDS) {
    if (!t.ask.test(q)) continue;
    // "고관절은 왜 들어요?" asks why THAT body part does it — the body-part evidence answers it, not the technique's usage situations.
    if (t.id === 'purpose' && bodyAsked && !PURPOSE_STRICT.test(q)) continue;
    out.push({ id: t.id, label: t.label, fields: t.fields });
  }
  // "어떻게 해요?" asks for the movement — unless a body part was named ("발은 어떻게 해요?" asks about the feet only).
  if (!out.some((n) => n.id === 'steps' || n.id.startsWith('body.')) && /어떻게\s*(해|하|치|차|들어|잡|걸|넘기|빠져|움직)/.test(q)) {
    out.push({ id: 'steps', label: FIELD_LABEL.steps, fields: ['steps'] });
  }
  if (out.length === 0) {
    const what = TOPIC_NEEDS.find((t) => t.id === 'what')!;
    out.push({ id: what.id, label: what.label, fields: what.fields });
  }
  return out;
}

/** Sentences of the technique's own steps / key points / starting position that explicitly mention `re`. */
function mentionQuotes(ev: TechniqueEvidence, re: RegExp): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const f of ['startingPosition', 'steps', 'keyPoints'] as EvidenceField[]) {
    const item = ev.fields[f];
    if (!item) continue;
    const hits = item.values.filter((v) => re.test(v));
    if (hits.length) out.push({ ...item, values: hits });
  }
  return out;
}

export function judgeAnswerability(ev: TechniqueEvidence, needs: InfoNeed[]): Answerability {
  const covered: CoveredNeed[] = needs.map((need) => {
    const direct = need.fields.map((f) => ev.fields[f]).filter((x): x is EvidenceItem => !!x);
    if (direct.length) return { need, evidence: direct, viaMention: false };
    if (need.mention) {
      const quotes = mentionQuotes(ev, need.mention);
      if (quotes.length) return { need, evidence: quotes, viaMention: true };
    }
    return { need, evidence: [], viaMention: false };
  });
  const missing = covered.filter((c) => c.evidence.length === 0).map((c) => c.need.label);
  const confirmed = covered.filter((c) => c.evidence.length > 0).map((c) => c.need.label);
  const status: AnswerStatus = missing.length === 0 ? 'answerable' : confirmed.length ? 'partial' : 'unanswerable';
  return { status, needs: covered, missing, confirmed };
}

/** Polite list: "A, B와 C" style without guessing particles — uses " · ". */
const list = (xs: string[]) => xs.join(' · ');

/**
 * The deterministic answer: the data's own text for what is confirmed, and a
 * plain statement of what MARTIALDEX does not have. Never adds anything else.
 */
export function evidenceAnswerText(ev: TechniqueEvidence, a: Answerability): string {
  if (a.status === 'unanswerable') {
    const have = ev.present.filter((f) => f !== 'related').slice(0, 4).map((f) => FIELD_LABEL[f]);
    return [
      `MARTIALDEX 기술 자료에는 ${ev.displayName}의 ${list(a.missing)}에 대한 내용이 없습니다. 확인되지 않은 내용을 추측해서 말씀드리지 않겠습니다.`,
      have.length ? `자료에 있는 것은 ${list(have)}입니다. 그중에서 궁금한 것을 물어봐 주세요.` : '이 기술은 아직 자료가 거의 없습니다. 영상이나 직접 지도해 주는 코치에게 확인해 주세요.',
    ].join(' ');
  }
  const parts: string[] = [];
  for (const c of a.needs) {
    if (!c.evidence.length) continue;
    const texts = c.evidence.flatMap((e) => e.values).slice(0, 3);
    const head = c.viaMention ? `${c.need.label} (동작 설명 중 언급된 부분)` : c.need.label;
    parts.push(`${head}: ${texts.join(' / ')}`);
  }
  const body = `MARTIALDEX 자료에 따르면 ${parts.join('. ')}.`.replace(/\.\./g, '.');
  if (a.status === 'partial') return `${body} 다만 ${list(a.missing)}은(는) 자료에 없어 확인되지 않았습니다. 추측하지 않겠습니다.`;
  return body;
}
