// AI 튜터 말투 — one register everywhere: 합쇼체 statements ("-습니다/-ㅂ니다")
// and polite requests ("-해 주세요/-하세요"). No 반말 ("해줘", "할게") and no
// casual 해요체 statements mixed in ("할게요", "있어요").
//
// Every fixed coach line in the app is written this way; AI-generated lines
// are asked to follow it (TUTOR_SPEECH_RULE) and then passed through
// politeFix(), which rewrites the common sentence-final 해요체/반말 endings the
// model still sometimes produces. Rewrites only whole, well-known endings at
// a sentence end — never words in the middle of a sentence.

export const TUTOR_SPEECH_RULE =
  '말투: 모든 문장은 "-습니다/-ㅂ니다"로 끝나는 존댓말(합쇼체)로 쓰고, 요청은 "~해 주세요"로 쓴다. "-요"로 끝나는 해요체 문장(예: "할게요", "있어요")과 반말(예: "해줘", "할게", "했어")은 절대 섞지 않는다.';

// [pattern at sentence end, replacement] — order matters (longer first).
const ENDINGS: [RegExp, string][] = [
  [/해\s?줄게요?(?=[.!?\s]|$)/g, '해 드리겠습니다'],
  [/줄게요?(?=[.!?\s]|$)/g, '드리겠습니다'],
  [/할게요?(?=[.!?\s]|$)/g, '하겠습니다'],
  [/볼게요?(?=[.!?\s]|$)/g, '보겠습니다'],
  [/갈게요?(?=[.!?\s]|$)/g, '가겠습니다'],
  [/(말해|알려|해|보여|들려)줘(?=[.!?\s]|$)/g, '$1 주세요'],
  [/했어요(?=[.!?\s]|$)/g, '했습니다'],
  [/됐어요(?=[.!?\s]|$)/g, '되었습니다'],
  [/있어요(?=[.!?\s]|$)/g, '있습니다'],
  [/없어요(?=[.!?\s]|$)/g, '없습니다'],
  [/해요(?=[.!?\s]|$)/g, '합니다'],
  [/돼요(?=[.!?\s]|$)/g, '됩니다'],
  [/(이)?에요(?=[.!?\s]|$)/g, '입니다'],
  [/예요(?=[.!?\s]|$)/g, '입니다'],
  [/좋아요(?=[.!?\s]|$)/g, '좋습니다'],
  [/맞아요(?=[.!?\s]|$)/g, '맞습니다'],
  [/거예요(?=[.!?\s]|$)/g, '것입니다'],
];

export function politeFix(text: string): string {
  let out = text;
  for (const [re, rep] of ENDINGS) out = out.replace(re, rep);
  return out;
}

/**
 * Technique data (posture steps, key points) is written in plain written
 * style ("~잡는다.", "~돌린다."). When the tutor SPEAKS it, it becomes 합쇼체:
 * 잡는다 → 잡습니다, 돌린다 → 돌립니다, 한다 → 합니다, 있다 → 있습니다.
 * Only sentence-final verb forms are changed.
 */
export function politeData(text: string): string {
  const end = '(?=[.!?,]|\\s*$|\\s*\\n)';
  return text
    .replace(new RegExp(`한다${end}`, 'g'), '합니다')
    .replace(new RegExp(`된다${end}`, 'g'), '됩니다')
    .replace(new RegExp(`(있|없|좋|않|같|낮|높|넓|좁)다${end}`, 'g'), '$1습니다')
    .replace(new RegExp(`는다${end}`, 'g'), '습니다')
    .replace(new RegExp(`이다${end}`, 'g'), '입니다')
    .replace(new RegExp(`([가-힣])다${end}`, 'g'), (m, syl: string) => {
      // vowel stem + ㄴ다 (둔다, 늘린다, 편다): the ㄴ batchim becomes ㅂ + 니다.
      const code = syl.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171 || code % 28 !== 4) return m; // jongseong ㄴ only
      return `${String.fromCharCode(syl.charCodeAt(0) - 4 + 17)}니다`;
    });
}

/** Sentence endings that break the register — used by QA to audit every spoken/written coach line. */
export function informalEndings(text: string): string[] {
  const hits: string[] = [];
  const re = /([가-힣]+(?:어요|아요|해요|예요|에요|게요|래요|네요|죠|줘|할게|볼게|했어|거야|이야))(?=[.!?\s]|$)/g;
  for (const m of text.matchAll(re)) hits.push(m[1]);
  return hits;
}

/**
 * Object particle for a name read aloud: "Jab을", "Cross를", "콤보를".
 * Hangul uses the final consonant; a trailing "(English)" is ignored; Latin
 * names use how the last letter is read in Korean (b/k/l/m/n/p/t/g → 받침).
 */
export function objectParticle(name: string): string {
  const base = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const last = base.at(-1) ?? '';
  const code = last.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return code % 28 === 0 ? '를' : '을';
  return /[bklmnptg]/i.test(last) ? '을' : '를';
}

/** `${name}을` / `${name}를` */
export function withObject(name: string): string {
  return `${name}${objectParticle(name)}`;
}
