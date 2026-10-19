// 목적 태그 — what a combo/setup is FOR, read from its purpose text (and its
// steps), deterministically (no AI call). These tags are what the
// recommendation learns from: "잽을 맞추기 위한 셋업" and "Jab to land the
// cross" both become [strike_setup, tech:jab]; "테이크다운을 위한 셋업" becomes
// [takedown].

export interface PurposeTagDef {
  tag: string;
  label: string;
  patterns: RegExp[];
}

export const INTENT_TAGS: PurposeTagDef[] = [
  { tag: 'strike_setup', label: '타격 적중', patterns: [/맞추|맞히|적중|꽂|넣기|넣는|들어가|land|hit\b|connect/i] },
  { tag: 'takedown', label: '테이크다운', patterns: [/테이크\s?다운|태클|넘기|넘어뜨|더블\s?레그|싱글\s?레그|takedown|double\s?leg|single\s?leg|shoot/i] },
  { tag: 'counter', label: '카운터', patterns: [/카운터|받아치|역습|counter/i] },
  { tag: 'feint', label: '페인트', patterns: [/페인트|속임|속이|fake|feint/i] },
  { tag: 'pressure', label: '압박', patterns: [/압박|몰아|코너|pressure|cut\s?off/i] },
  { tag: 'distance', label: '거리 조절', patterns: [/거리|간격|리치|distance|range|footwork|풋워크/i] },
  { tag: 'defense', label: '방어·탈출', patterns: [/방어|막|회피|피하|탈출|이스케이프|escape|defen[cs]e|block/i] },
  { tag: 'submission', label: '서브미션', patterns: [/서브미션|관절|조르|초크|암바|트라이앵글|기무라|submission|choke|armbar|triangle|kimura/i] },
  { tag: 'clinch', label: '클린치', patterns: [/클린치|clinch|빰/i] },
  { tag: 'body', label: '바디', patterns: [/바디|복부|몸통|body/i] },
  { tag: 'sweep', label: '스윕', patterns: [/스윕|sweep/i] },
  { tag: 'guard_pass', label: '가드 패스', patterns: [/가드\s?패스|패스|guard\s?pass/i] },
  { tag: 'finish', label: '마무리·KO', patterns: [/마무리|피니시|KO|녹아웃|끝내|finish|knock\s?out/i] },
];

/** Common techniques named in Korean or English in a purpose ("잽을 맞추기 위한"). */
export const TECH_WORDS: { tag: string; label: string; pattern: RegExp }[] = [
  { tag: 'tech:jab', label: '잽', pattern: /잽|jab/i },
  { tag: 'tech:cross', label: '크로스', pattern: /크로스|스트레이트|cross|straight/i },
  { tag: 'tech:hook', label: '훅', pattern: /훅|hook/i },
  { tag: 'tech:uppercut', label: '어퍼컷', pattern: /어퍼|uppercut/i },
  { tag: 'tech:low_kick', label: '로우킥', pattern: /로우\s?킥|low\s?kick|leg\s?kick/i },
  { tag: 'tech:middle_kick', label: '미들킥', pattern: /미들\s?킥|middle\s?kick|body\s?kick/i },
  { tag: 'tech:high_kick', label: '하이킥', pattern: /하이\s?킥|헤드\s?킥|high\s?kick|head\s?kick/i },
  { tag: 'tech:knee', label: '니킥', pattern: /니\s?킥|무릎|knee/i },
  { tag: 'tech:elbow', label: '팔꿈치', pattern: /엘보|팔꿈치|elbow/i },
  { tag: 'tech:double_leg', label: '더블 레그', pattern: /더블\s?레그|double\s?leg/i },
  { tag: 'tech:single_leg', label: '싱글 레그', pattern: /싱글\s?레그|single\s?leg/i },
  { tag: 'tech:armbar', label: '암바', pattern: /암바|armbar/i },
  { tag: 'tech:triangle', label: '트라이앵글', pattern: /트라이앵글|triangle/i },
  { tag: 'tech:rear_naked', label: '리어 네이키드 초크', pattern: /리어\s?네이키드|rear\s?naked|RNC/i },
];

const ALL_LABELS = new Map<string, string>([...INTENT_TAGS.map((t) => [t.tag, t.label] as const), ...TECH_WORDS.map((t) => [t.tag, t.label] as const)]);

export function tagLabel(tag: string): string {
  return ALL_LABELS.get(tag) ?? tag;
}

/**
 * Tags for a combo/setup. Intent comes from the purpose (and description);
 * named techniques from purpose + step names. A setup with no recognised
 * intent still gets the techniques it ends on, so it is never tag-less.
 */
export function derivePurposeTags(input: { purpose: string; description?: string; stepNames?: string[] }): string[] {
  const text = `${input.purpose} ${input.description ?? ''}`;
  const tags = new Set<string>();
  for (const d of INTENT_TAGS) if (d.patterns.some((p) => p.test(text))) tags.add(d.tag);
  for (const w of TECH_WORDS) if (w.pattern.test(input.purpose)) tags.add(w.tag);
  const last = input.stepNames?.at(-1);
  if (last) for (const w of TECH_WORDS) if (w.pattern.test(last)) tags.add(w.tag);
  return [...tags];
}

/** Intent tags only (for "목적" chips), in display order. */
export function intentTags(tags: string[]): string[] {
  return INTENT_TAGS.map((d) => d.tag).filter((t) => tags.includes(t));
}
