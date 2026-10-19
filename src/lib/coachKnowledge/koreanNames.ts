import type { Technique } from '../../types';
import { getPostureInfo } from '../posture/postureConfig';

// Korean names a technique can be looked up by, taken ONLY from MARTIALDEX's
// own data — never guessed:
//   1. the record's koreanName / aliases (already in the technique),
//   2. the Korean name its own hand-curated posture overview gives it as the
//      sentence subject ("암바는 클로즈드 가드에서 …" → 암바), for the record
//      itself and for every record merged into it (mergedIds — e.g. the judo
//      Juji Gatame record merged into Armbar).
// A subject is accepted only when
//   - it is a plain name (Hangul words, no "…에서의 …", "…로의 전환"), and
//   - it SOUNDS like that record's English name (consonant skeleton match:
//     "암바" ~ "Armbar", "리어 네이키드 초크" ~ "Rear Naked Choke") — an overview
//     that opens with a different technique ("마운트에서의 암바는 …" on Mount)
//     or a description is never taken as a name.
// These names only feed the coach's lookup; technique ids and records are unchanged.

const INITIAL = ['K', 'K', 'N', 'T', 'T', 'L', 'M', 'P', 'P', 'S', 'S', '', 'S', 'S', 'S', 'K', 'T', 'P', 'H'];
const FINAL = ['', 'K', 'K', 'K', 'N', 'N', 'N', 'T', 'L', 'K', 'M', 'L', 'L', 'L', 'P', 'L', 'M', 'P', 'P', 'S', 'S', 'N', 'S', 'S', 'K', 'T', 'P', 'H'];

/** Consonant skeleton of a Hangul name (initial + final consonant classes, ㅎ dropped). */
export function hangulSkeleton(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) continue;
    out += INITIAL[Math.floor(c / 588)] + FINAL[c % 28];
  }
  return out.replace(/H/g, '').replace(/(.)\1+/g, '$1');
}

/** Consonant skeleton of a romanized name, in the same classes (b/p/f/v → P, l/r → L, …). */
export function latinSkeleton(s: string): string {
  const t = s
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/tch|ch|sh/g, 's')
    .replace(/ck|qu?/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/th/g, 't')
    .replace(/ng/g, 'n');
  let out = '';
  for (const ch of t) {
    out += /[bpfv]/.test(ch) ? 'P' : /[kgc]/.test(ch) ? 'K' : /[dt]/.test(ch) ? 'T' : /[szj]/.test(ch) ? 'S' : /[lr]/.test(ch) ? 'L' : ch === 'm' ? 'M' : ch === 'n' ? 'N' : '';
  }
  return out.replace(/(.)\1+/g, '$1');
}

function lcs(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
}

/**
 * Does a Hangul name read as a transliteration of a romanized name? Korean
 * drops many r/l sounds ("Armbar" → 암바), so the English l/r the Hangul does
 * not have are not counted against it. Threshold 0.8 of both skeletons.
 */
export function soundsLike(hangul: string, latin: string): boolean {
  const k = hangulSkeleton(hangul);
  const e = latinSkeleton(latin);
  if (!k || !e) return false;
  const common = lcs(k, e);
  const extraL = Math.max(0, (e.match(/L/g)?.length ?? 0) - (k.match(/L/g)?.length ?? 0));
  return Math.min(common / k.length, common / Math.max(1, e.length - extraL)) >= 0.8;
}

const GRAMMAR = /(에서|에게|으로|로의|의|하는|및|또는|에서의)$/;

/** The plain Hangul name an overview opens with ("암바는 …" → "암바"), or null. */
export function overviewSubject(overview: string | null | undefined): string | null {
  if (!overview) return null;
  const words = overview.replace(/\s*\([^)]*\)/g, '').trim().split(/\s+/);
  const k = words.slice(0, 4).findIndex((w) => /[은는]$/.test(w));
  if (k < 0) return null;
  const subject = [...words.slice(0, k), words[k].replace(/[은는]$/, '')];
  if (!subject.every((w) => /^[가-힣]+$/.test(w)) || subject.some((w) => GRAMMAR.test(w))) return null;
  return subject.join(' ');
}

/**
 * Korean names the data gives this technique (rule 2 above): the overview
 * subject of the technique and of every record merged into it (mergedIds),
 * kept only when it sounds like one of the technique's registered
 * romanized names (its name or aliases — merged records' names are aliases).
 */
export function dataKoreanNames(t: Technique): string[] {
  const latin = [t.name, ...(t.aliases ?? [])].filter((n) => /[a-z]/i.test(n));
  const out: string[] = [];
  for (const id of t.mergedIds ?? [t.id]) {
    const subject = overviewSubject(getPostureInfo(id)?.overview);
    if (subject && latin.some((n) => soundsLike(subject, n))) out.push(subject);
  }
  return [...new Set(out)];
}
