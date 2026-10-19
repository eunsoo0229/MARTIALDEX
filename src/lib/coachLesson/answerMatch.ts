// Word matching for the deterministic grader (evidenceGrader.ts) — pure.
//
// Kept separate from text.ts (whose looser `overlap` the Gemini path's
// offline fallback still uses) so the 자체 AI 코치's grading can be stricter
// about WHICH words match and smarter about HOW an answer is phrased:
//  - stems: particles and verb endings are removed ("넘겨야" → "넘겨",
//    "조이기" → "조이"), and a contracted conjugation of the same verb
//    matches ("넘기/넘겨", "조이/조여", "빠지/빠져", "올리/올려"); two words
//    that only share a first syllable ("다리/다른") no longer do,
//  - a SMALL table of expressions confirmed to mean the same thing in the
//    technique data ("엉덩이" = "고관절"),
//  - clause polarity: which words of the answer are said as "do this",
//    "don't do this / avoid this", or "if you don't …" (a consequence).

/** Content words: Hangul (2+) or Latin (3+), particles and endings stripped, filler removed. */
export function answerTokens(s: string): string[] {
  const raw = s.normalize('NFKC').toLowerCase().match(/[가-힣]+|[a-z]{3,}/g) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    // One-syllable body parts ("등을 곧게", "턱을 당겨") are answer content in this domain.
    const body = w.match(BODY_1);
    if (body) {
      out.push(body[1]);
      continue;
    }
    if (w.length < 2) continue;
    const st = stem(w);
    if (st.length >= 2 && !STOP.has(st)) out.push(st);
  }
  return [...new Set(out)];
}

const BODY_1 = /^([등팔손발턱목배몸힘])(을|를|이|가|은|는|도|만|으로|로|에|의|과|와|에서|까지)?$/;

const STOP = new Set(['상대', '상대가', '자신', '그리고', '그래서', '그러면', '하지', '정도', '상태', '기술', '동작', '자세', '것이', '때문', '있는', '있어', '없는', '해요', '하면', '돼요', '되요', '같아', '같아요', '그냥', '이렇게', '이거', '그거', '거요', '것을', '합니다', '입니다', '있습니다', '됩니다', '않아', '않고', '않게', '않음', '않는', '않도록', '못해', '못하', '하기', '하게', '하는', '하고', '해서', '하면', '해도', '괜찮', '괜찮아', '않기',
  // Key-point phrasing that is not the content ("…감각 기르기", "…으로 사용하기", "압박 만들기").
  '부분', '감각', '기르', '사용', '만들']);

/** Words that say WHERE (body part, side, direction) but not WHAT to do — an element is not met by these alone. */
export const NON_CORE = new Set(['등', '팔', '손', '발', '턱', '목', '배', '몸', '반대', '한쪽', '양쪽', '위로', '아래로', '앞으로', '뒤로', '바깥', '안쪽', '리드', '뒷발', '앞발', '다리', '머리', '무릎', '어깨', '허리', '팔꿈치']);
export const isCore = (t: string) => !NON_CORE.has(t);

// Longest first. A stem shorter than 2 syllables is never produced (the word is kept whole).
const ENDINGS = [
  '해야해요', '해야돼요', '하도록', '합니다', '입니다', '시켜서', '시키기', '시키는', '시켜요',
  '해야', '해서', '하면', '하고', '하기', '하는', '하게', '해요', '했어', '시켜', '시키',
  '어야', '아야', '여야', '으면', '어서', '아서', '여서', '어요', '아요', '여요', '지만', '면서', '도록', '니까', '으로', '에서', '에게', '까지', '부터', '이랑',
  '을', '를', '이', '가', '은', '는', '에', '의', '로', '와', '과', '도', '만', '랑',
  '게', '고', '기', '면', '서', '야', '요', '지', '며', '함', '됨', '음',
];

export function stem(w: string): string {
  let s = w;
  for (let pass = 0; pass < 2; pass++) {
    const e = ENDINGS.find((x) => s.endsWith(x) && s.length - x.length >= 2);
    if (!e) break;
    s = s.slice(0, -e.length);
  }
  return s;
}

// ---------------------------------------------------------------- syllables

function parts(ch: string): { i: number; v: number; f: number } | null {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return null;
  return { i: Math.floor(c / 588), v: Math.floor((c % 588) / 28), f: c % 28 };
}

// Vowel pairs a verb stem's last vowel turns into when an ending is attached
// (기+어 → 겨, 오+아 → 와, 우+어 → 워, 쓰+어 → 써, 하+여 → 해).
const V = { a: 0, ae: 1, eo: 4, yeo: 6, o: 8, wa: 9, u: 13, wo: 14, eu: 18, i: 20 };
const CONTRACT: [number, number][] = [
  [V.i, V.yeo],
  [V.o, V.wa],
  [V.u, V.wo],
  [V.eu, V.eo],
  [V.a, V.ae],
];

function sameVerbSyllable(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parts(a);
  const y = parts(b);
  if (!x || !y || x.i !== y.i) return false;
  // 휘두르 / 휘둘러: same initial and vowel, only the final consonant differs (ㄹ-irregular).
  if (x.v === y.v) return true;
  return CONTRACT.some(([p, q]) => (x.v === p && y.v === q) || (x.v === q && y.v === p));
}

/** Same word, the same word with more attached, or a contracted conjugation of the same verb. */
export function stemMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 2 && l.startsWith(s)) return true;
  // 넘기 / 넘겨(서) · 조이 / 조여 · 빠지 / 빠져(나감): first syllable equal, second a contraction of it.
  if (s.length >= 2 && a[0] === b[0] && sameVerbSyllable(a[1], b[1])) return true;
  // One-syllable verb stems with an ending kept ("펴고" / "펴서", "차고" / "차요").
  if (a.length === 2 && b.length === 2 && a[0] === b[0] && VERB_ENDING_1.has(a[1]) && VERB_ENDING_1.has(b[1])) return true;
  return false;
}

const VERB_ENDING_1 = new Set(['고', '서', '요', '기', '게', '는', '면', '야', '도', '지', '며', '어', '아']);

// ---------------------------------------------------------------- same-meaning expressions

// Only pairs the technique data itself uses for the same thing (posture
// keyPoints / steps / bodyPosition say "고관절", students say "엉덩이"/"골반").
// Matching is by stem prefix. Kept deliberately small: a wrong entry here
// would let a wrong answer pass.
const SAME_MEANING: string[][] = [
  ['고관절', '엉덩이', '골반', '힙'],
  ['즉시', '바로', '곧바로', '빨리', '재빨리'],
  ['회수', '거둬', '거두', '되돌', '돌아오', '돌아와'],
  ['유지', '계속', '지키', '지켜'],
  ['끝까지', '계속', '항상', '내내'],
  ['타격', '펀치', '때리', '때려'],
  ['상체', '몸통', '상반신'],
  ['좁게', '좁혀', '좁히'],
  ['밀착', '붙여', '붙이', '붙어'],
  ['회전', '돌려', '돌리'],
  ['체중', '몸무게', '무게'],
  ['펜트레이션', '페네트레이션', '파고드', '파고들'],
  ['부상', '다치', '다쳐'],
  ['중앙', '가운데', '정중앙', '한가운데'],
  ['늦게', '천천히', '느리', '느리게'],
];

function meaningGroup(t: string): number {
  return SAME_MEANING.findIndex((g) => g.some((w) => t === w || (w.length >= 2 && t.startsWith(w))));
}

export function tokenMatch(a: string, b: string): boolean {
  if (stemMatch(a, b)) return true;
  const g = meaningGroup(a);
  return g >= 0 && SAME_MEANING[g].some((w) => b === w || b.startsWith(w)) && meaningGroup(b) >= 0;
}

/** How many of `ref` tokens the answer tokens cover. */
export function hitsOf(answer: string[], ref: string[]): number {
  let n = 0;
  for (const r of ref) if (answer.some((a) => tokenMatch(a, r))) n++;
  return n;
}

// ---------------------------------------------------------------- clause polarity

/**
 * Splits an answer into what it ASSERTS, what it says is NOT done ("안 조여도
 * 돼요", "들지 않고"), and what it says to AVOID or explains as a consequence
 * ("팔로만 당기지 말고", "빠지지 않게", "안 넘기면 …"). An avoid marker covers
 * everything before it in the same sentence ("…넘기지 못해 공간을 허용하지
 * 않게 해요" avoids the whole mistake).
 */
export interface Polarity {
  asserted: string[];
  negated: string[];
  avoided: string[];
}

const AVOID = /(안\s+\S+게(?![가-힣])|못\s+\S+게(?![가-힣])|않게|않도록|없게|없도록|지\s*말고|지\s*말아|지\s*마세요|지\s*마|말고|면\s*안\s*돼|면\s*안\s*됩|면\s*안\s*되|피하|피해|막아|막는|막으|고치|고쳐|조심|주의|금지)/;
const COND = /(않으면|못하면|안\s*하면|안\s+\S+면|못\s+\S+면|지\s*않을\s*때|않을\s*때)/;
const NEG = /(지\s*않고|지\s*않아|지\s*않는|지\s*않음|지\s*않습|지\s*않아도|않고|않아|못해|못하고|못하|안\s+\S+|못\s+\S+)/;

export function polarityOf(answer: string): Polarity {
  const out: Polarity = { asserted: [], negated: [], avoided: [] };
  for (const sentence of answer.normalize('NFKC').split(/[.!?。\n]+/)) {
    let rest = sentence;
    let pending: string[] = [];
    // Walk the sentence marker by marker (earliest first).
    for (let guard = 0; guard < 12 && rest.trim(); guard++) {
      const found = [
        { kind: 'avoid' as const, m: rest.match(AVOID) },
        { kind: 'cond' as const, m: rest.match(COND) },
        { kind: 'neg' as const, m: rest.match(NEG) },
      ]
        .filter((x) => x.m && x.m.index !== undefined)
        .sort((x, y) => x.m!.index! - y.m!.index! || (x.kind === 'neg' ? 1 : -1));
      if (!found.length) break;
      const { kind, m } = found[0];
      const end = m!.index! + m![0].length;
      // "안 조여도" / "못 넘겨서": the negated word is part of the marker.
      const clause = rest.slice(0, end);
      if (kind === 'neg') {
        pending.push(clause);
      } else {
        // avoid / condition: this clause and every pending "not" clause before it are not asserted.
        out.avoided.push(...answerTokens([...pending, clause].join(' ')));
        pending = [];
      }
      rest = rest.slice(end);
    }
    out.negated.push(...answerTokens(pending.join(' ')));
    out.asserted.push(...answerTokens(rest));
  }
  return { asserted: [...new Set(out.asserted)], negated: [...new Set(out.negated)], avoided: [...new Set(out.avoided)] };
}
