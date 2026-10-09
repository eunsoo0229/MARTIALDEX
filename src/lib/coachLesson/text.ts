// Small text helpers shared by the lesson modules (pure — no DOM, no AI).

const PARTICLES = /(을|를|이|가|은|는|에|의|로|으로|와|과|도|만|에서|하기|하는|하고|해서|하여|합니다|입니다|한다|된다|하게|지|게)$/;

/** Content tokens of a Korean/English sentence, particles stripped. */
export function contentTokens(s: string): string[] {
  const raw = s.normalize('NFKC').toLowerCase().match(/[가-힣]{2,}|[a-z]{3,}/g) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    const base = w.replace(PARTICLES, '');
    if (base.length >= 2 && !STOP.has(base)) out.push(base);
  }
  return [...new Set(out)];
}

const STOP = new Set(['상대', '자신', '그리고', '하지', '않게', '않아', '것이', '때문', '있는', '없는', '정도', '상태', '기술', '동작', '자세']);

function tokenMatch(x: string, y: string): boolean {
  if (x === y || x.includes(y) || y.includes(x)) return true;
  // Conjugated short verb stems (조여 / 조이지 / 조이기) share only the first syllable.
  return x[0] === y[0] && x.length <= 3 && y.length <= 3;
}

/** Fuzzy shared-token count. */
export function overlap(a: string[], b: string[]): number {
  let n = 0;
  for (const x of a) if (b.some((y) => tokenMatch(x, y))) n++;
  return n;
}

export function firstSentence(s: string | null | undefined, max = 140): string {
  if (!s) return '';
  const line = s.split('\n')[0].trim();
  const m = line.match(/^(.+?[.!?。])(\s|$)/);
  const out = (m ? m[1] : line).trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** "1단계 — 시작 자세: ..." → "..." */
export function stripStepPrefix(s: string): string {
  return s.replace(/^\s*\d+\s*단계\s*[—\-:]\s*/, '').replace(/^[^:：]{1,10}[:：]\s*/, '').trim();
}

/** "무릎을 조여 팔이 빠지지 않게 하기" → "무릎을 조여 팔이 빠지지 않게 하는 것"; otherwise quoted. */
export function nounPhrase(kp: string): string {
  const t = kp.trim().replace(/[.。]$/, '');
  if (/하기$/.test(t)) return t.replace(/하기$/, '하는 것');
  return `"${t}"`;
}

/** Ensures a sentence ends with terminal punctuation. */
export function sentence(s: string): string {
  const t = s.trim();
  return /[.!?。]$/.test(t) ? t : `${t}.`;
}

/** Deterministic shuffle (so a resumed lesson shows the same option order). */
export function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const arr = items.map((x, i) => ({ x, k: Math.abs(Math.imul(h ^ (i + 1), 2654435761)) % 1000 }));
  return arr.sort((a, b) => a.k - b.k).map((a) => a.x);
}

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Attaches the right particle to a name/phrase read aloud: 잽(Jab)을, Armbar를,
 * "…넘기기"가, …하는 것이. Hangul uses the final consonant; quotes and a
 * trailing "(English)" are ignored; Latin uses how the last letter is read.
 */
export function josa(word: string, kind: '이/가' | '은/는' | '을/를' | '와/과' | '으로/로'): string {
  const base = word.replace(/\s*\([^)]*\)\s*$/, '').replace(/["'”’」』)\]\s]+$/, '');
  const last = base.at(-1) ?? '';
  const code = last.charCodeAt(0) - 0xac00;
  let batchim: boolean;
  let rieul = false;
  if (code >= 0 && code <= 11171) {
    batchim = code % 28 !== 0;
    rieul = code % 28 === 8;
  } else batchim = /[bklmnptg]/i.test(last);
  const [withB, without] = kind === '와/과' ? ['과', '와'] : (kind.split('/') as [string, string]);
  if (kind === '으로/로') return `${word}${batchim && !rieul ? '으로' : '로'}`;
  return `${word}${batchim ? withB : without}`;
}
