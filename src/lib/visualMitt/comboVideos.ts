import type { Technique } from '../../types';
import { findLessonVideos, type LessonVideoResult } from '../coachLesson/lessonVideos';
import type { VideoSearchOutcome } from '../videoSearch/types';

// 미트 훈련 전 콤보 영상 — real YouTube videos of the combo about to be
// practised, found with the same keyless search + metadata verification as
// the AI 코치 수업 영상 (lessonVideos.ts):
//   - one technique  → that technique's saved / verified tutorial videos;
//   - a combo        → searched by its techniques in order, and a candidate
//                      must name at least two of them in its OWN title /
//                      description / keywords before the AI judge even looks
//                      (a "jab" video is not a "jab-cross-hook" video).
// Nothing found → said so; no stand-in videos.

const cache = new Map<string, LessonVideoResult>();

const namesOf = (t: Technique) => [t.name, t.koreanName ?? '', ...(t.aliases ?? [])].map((n) => n.trim()).filter((n) => n.length >= 2);
/** "Lead Hook (Boxing)" → "Lead Hook" — search with the plain name. */
const plain = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim();

export function comboVideoKey(techniques: Technique[]): string {
  return techniques.map((t) => t.id).join('>');
}

export function cachedComboVideos(techniques: Technique[]): LessonVideoResult | null {
  const r = cache.get(comboVideoKey(techniques));
  return r && r.status !== 'error' ? r : null;
}

export async function findComboVideos(
  techniques: Technique[],
  opts: { comboName?: string; onProgress?: (msg: string) => void; search?: (q: string) => Promise<VideoSearchOutcome> } = {}
): Promise<LessonVideoResult> {
  const key = comboVideoKey(techniques);
  const hit = cache.get(key);
  if (hit && hit.status !== 'error') return hit;
  const first = techniques[0];
  const art = first?.martialArt ?? null;
  let r: LessonVideoResult;
  if (techniques.length === 1) {
    r = await findLessonVideos({ technique: first, topic: plain(first.name), terms: namesOf(first), martialArt: art, queries: [`${plain(first.name)} tutorial`] }, { onProgress: opts.onProgress, search: opts.search });
  } else {
    const en = techniques.map((t) => plain(t.name));
    const ko = techniques.map((t) => t.koreanName?.trim()).filter((x): x is string => !!x);
    const queries = [`${en.join(' ')} combo`, `${en.join(' to ')} combination tutorial`, ...(ko.length === techniques.length ? [`${ko.join(' ')} 콤보`] : [])];
    r = await findLessonVideos(
      {
        technique: null,
        topic: `${opts.comboName ?? en.join(' → ')} 콤보 (${en.join(' → ')})`,
        terms: [...techniques.flatMap(namesOf), 'combo', 'combination', '콤보'],
        martialArt: art,
        queries,
        mustMention: { names: techniques.map(namesOf), min: Math.min(2, new Set(techniques.map((t) => t.id)).size) },
      },
      { onProgress: opts.onProgress, search: opts.search, want: 2, maxVerify: 6 }
    );
  }
  cache.set(key, r);
  return r;
}
