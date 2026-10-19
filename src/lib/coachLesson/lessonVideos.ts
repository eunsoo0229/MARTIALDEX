import type { Technique } from '../../types';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { videoInfoProvider, videoSearchProvider } from '../videoSearch/provider';
import type { VideoInfo, VideoSearchOutcome } from '../videoSearch/types';
import { findTutorVideos } from '../techniqueVideo/tutorVideoFinder';
import { ALLOWED_CONTENT_TYPES, MIN_NON_TITLE_EVIDENCE_CHARS, normalize } from '../techniqueVideo/urlVerification';
import { findOtherPlatformVideos, type PlatformVideo } from '../techniqueVideo/otherPlatformVideos';

// 수업 영상 — real YouTube videos for TODAY's lesson, shown inside the lesson.
//
//  - A named technique: the existing technique finder (saved/curated videos
//    first, then YouTube search + the "URL 직접 추가" verification).
//  - A topic lesson ("거리 조절", "키 큰 상대"): the lesson's own search terms
//    go through the SAME YouTube search transport (Electron IPC / Edge
//    Function / Android native HTTP — no key in the client), and every
//    candidate's REAL metadata (title, channel, description, keywords) is
//    judged against the lesson topic, then re-checked in code: quotes must
//    exist in the metadata, at least one must come from the description or
//    keywords (never the title alone) and name a topic term, and the video
//    must be instructional. Only such videos are shown; a search that finds
//    nothing says so.

export interface LessonVideo {
  videoId: string;
  title: string;
  channel: string;
  /** From the search result when available; otherwise YouTube's standard thumbnail URL for this real id. */
  thumbnailUrl: string;
  url: string;
  source: 'saved' | 'verified';
  reason?: string;
}

export interface LessonVideoResult {
  status: 'found' | 'none' | 'error';
  videos: LessonVideo[];
  queries: string[];
  /** Candidates whose metadata was actually checked. */
  checked: number;
  message: string | null;
  /** Found on other video platforms when YouTube had none (otherPlatformVideos.ts). */
  otherVideos?: PlatformVideo[];
}

export interface LessonVideoInput {
  technique: Technique | null;
  topic: string;
  /** Words that a matching video must really be about (topic words, concept labels, technique names). */
  terms: string[];
  martialArt: string | null;
  queries: string[];
  /**
   * Optional hard requirement checked on the video's REAL metadata before the AI judge: at least
   * `min` of these name groups (each = a technique's names/aliases) must appear in its title /
   * description / keywords — e.g. a combo video must name at least two of the combo's techniques.
   */
  mustMention?: { names: string[][]; min: number };
}

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

interface RawTopicVerdict {
  verdict: string;
  contentType: string;
  evidenceQuotes: string[];
  reason: string;
}
function isRawTopicVerdict(v: unknown): v is RawTopicVerdict {
  const o = v as RawTopicVerdict;
  return !!o && typeof o.verdict === 'string' && typeof o.contentType === 'string' && Array.isArray(o.evidenceQuotes) && o.evidenceQuotes.every((q) => typeof q === 'string') && typeof o.reason === 'string';
}

/** Topic terms long enough to be meaningful, normalised. */
function topicTerms(terms: string[]): string[] {
  const words = terms.flatMap((t) => normalize(t).split(' ')).filter((w) => w.length >= 2);
  return [...new Set(words)].filter((w) => !['the', 'and', 'how', 'for', '방법', '훈련', '연습', '기술', '수업', '오늘'].includes(w));
}

/** Code-level second opinion on the model's verdict (pure, testable). */
export function checkTopicEvidence(info: VideoInfo, terms: string[], raw: RawTopicVerdict): { ok: boolean; reason: string } {
  if (raw.verdict !== 'VERIFIED') return { ok: false, reason: raw.reason };
  const titleN = normalize(info.title);
  const bodyN = normalize([info.description, info.keywords.join(' ')].join(' \n '));
  const quotes = raw.evidenceQuotes.map(normalize).filter((q) => q.length >= 3);
  if (!quotes.length || !quotes.every((q) => titleN.includes(q) || bodyN.includes(q))) return { ok: false, reason: '영상 정보에서 판정 근거를 확인할 수 없었습니다.' };
  if (!quotes.some((q) => bodyN.includes(q) && !titleN.includes(q))) return { ok: false, reason: '제목 외의 설명·키워드에서 근거를 찾지 못했습니다.' };
  const words = topicTerms(terms);
  if (!quotes.some((q) => words.some((w) => q.includes(w)))) return { ok: false, reason: '근거 문구에 수업 주제가 나오지 않았습니다.' };
  if (!ALLOWED_CONTENT_TYPES.has(raw.contentType)) return { ok: false, reason: '설명·시연 영상이 아닌 것으로 판단되었습니다.' };
  return { ok: true, reason: raw.reason };
}

/** How many of the name groups (one per technique) appear as whole words in the video's own title / description / keywords. */
export function mentionHits(info: Pick<VideoInfo, 'title' | 'description' | 'keywords'>, names: string[][]): number {
  const all = ` ${normalize([info.title, info.description, info.keywords.join(' ')].join(' \n '))} `;
  return names.filter((group) => group.some((n) => n && all.includes(` ${normalize(n)} `))).length;
}

async function verifyTopicVideo(input: LessonVideoInput, videoId: string): Promise<{ ok: boolean; info: VideoInfo | null; reason: string }> {
  const got = await videoInfoProvider.get(videoId);
  if (!got.ok) return { ok: false, info: null, reason: got.message };
  const info = got.info;
  if (!info.playable) return { ok: false, info, reason: '재생할 수 없는 영상입니다.' };
  if ([info.description, info.keywords.join(' ')].join(' ').trim().length < MIN_NON_TITLE_EVIDENCE_CHARS) return { ok: false, info, reason: '설명·키워드가 거의 없어 내용을 확인할 수 없습니다.' };
  if (input.mustMention) {
    const hits = mentionHits(info, input.mustMention.names);
    if (hits < input.mustMention.min) return { ok: false, info, reason: `영상 정보에 이 콤보의 기술 이름이 ${hits}개만 나옵니다(필요 ${input.mustMention.min}개).` };
  }
  const r = await askGeminiForJsonWithGrounding<RawTopicVerdict>({
    systemInstruction: [
      '무술 수업에 참고 영상으로 보여줄 YouTube 영상을 고른다. [영상 정보]에 실제로 적힌 내용만 근거로, 이 영상이 [수업 주제]를 가르치거나 시연하는 교육용 영상인지 엄격하게 판정한다.',
      '당신이 이 영상에 대해 안다고 생각하는 내용은 쓰지 않는다.',
      'verdict: "VERIFIED"(설명/키워드에 이 주제를 가르치거나 시연한다는 근거가 명확), "NOT_MATCHED"(다른 주제·다른 무술·경기 하이라이트·무관), "INSUFFICIENT_EVIDENCE"(판단 근거 부족).',
      'contentType: "tutorial" | "demonstration" | "instructional_breakdown" | "competition_highlight" | "shorts_clip" | "unrelated" | "other"',
      'evidenceQuotes: [영상 정보]에서 글자 그대로 짧게 인용(1~4개). 제목이 아닌 설명 또는 키워드 인용을 1개 이상 포함하고, 그중 하나는 수업 주제 단어를 포함해야 한다.',
      'reason: 한국어 1문장.',
      '출력: {"verdict","contentType","evidenceQuotes","reason"}',
    ].join('\n'),
    contextText: '',
    question: [
      `[수업 주제] ${input.topic}${input.martialArt ? ` (무술: ${input.martialArt})` : ''}`,
      `[주제 단어] ${input.terms.slice(0, 12).join(', ')}`,
      '',
      '[영상 정보]',
      `제목: ${info.title}`,
      `채널: ${info.channel}`,
      `길이: ${info.lengthSeconds}초`,
      info.keywords.length ? `키워드: ${info.keywords.join(', ')}` : '키워드: (없음)',
      `설명:\n${info.description.slice(0, 2500)}`,
    ].join('\n'),
    useSearchGrounding: false,
    validate: isRawTopicVerdict,
  });
  if (!r.ok) return { ok: false, info, reason: `AI 확인 실패: ${r.message}` };
  const checked = checkTopicEvidence(info, input.terms, r.data);
  return { ok: checked.ok, info, reason: checked.reason };
}

/** Real lesson videos (≤ 3). Progress messages are for the UI ("검색 중", "확인 중"). */
/** YouTube found nothing → look on other video platforms (web search, real page text must name a lesson term). */
async function withOtherPlatforms(input: LessonVideoInput, r: LessonVideoResult, onProgress?: (msg: string) => void): Promise<LessonVideoResult> {
  if (r.status === 'found') return r;
  const t = input.technique;
  const terms = [...input.terms, ...(t ? [t.name, t.koreanName ?? '', ...(t.aliases ?? [])] : [])].filter(Boolean);
  const queries = input.queries.length ? input.queries : t ? [`${t.name} ${input.martialArt ?? ''} tutorial`.trim(), t.koreanName ? `${t.koreanName} 기술 설명` : ''].filter(Boolean) : [input.topic];
  const other = await findOtherPlatformVideos({ terms, queries, onProgress }).catch(() => ({ videos: [] as PlatformVideo[], queries: [] as string[] }));
  if (!other.videos.length) return r;
  return { status: 'found', videos: [], queries: [...r.queries, ...other.queries], checked: r.checked, message: null, otherVideos: other.videos };
}

export async function findLessonVideos(
  input: LessonVideoInput,
  opts: { maxVerify?: number; want?: number; onProgress?: (msg: string) => void; /** Search transport (tests inject a failing one). */ search?: (query: string) => Promise<VideoSearchOutcome> } = {}
): Promise<LessonVideoResult> {
  return withOtherPlatforms(input, await findYoutubeLessonVideos(input, opts), opts.onProgress);
}

async function findYoutubeLessonVideos(
  input: LessonVideoInput,
  opts: { maxVerify?: number; want?: number; onProgress?: (msg: string) => void; search?: (query: string) => Promise<VideoSearchOutcome> } = {}
): Promise<LessonVideoResult> {
  const search = opts.search ?? ((q: string) => videoSearchProvider.search(q));
  if (input.technique) {
    const r = await findTutorVideos(input.technique, { onProgress: opts.onProgress });
    const videos = r.videos.map((v) => ({ videoId: v.video.videoId, title: v.video.title, channel: v.video.channel, thumbnailUrl: thumb(v.video.videoId), url: watchUrl(v.video.videoId), source: v.source, reason: v.reason }));
    if (videos.length) return { status: 'found', videos, queries: r.queries, checked: r.checked, message: null };
    // Fall through to the topic search (the lesson topic may be broader than the technique).
    if (r.error && !input.queries.length) return { status: 'error', videos: [], queries: r.queries, checked: r.checked, message: r.error };
  }

  const maxVerify = opts.maxVerify ?? 5;
  const want = opts.want ?? 2;
  const queries = [...new Set(input.queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 4);
  const seen = new Set<string>();
  const videos: LessonVideo[] = [];
  let checked = 0;
  let lastError: string | null = null;
  let searchedOk = false;
  for (const query of queries) {
    if (videos.length >= want || checked >= maxVerify) break;
    opts.onProgress?.(`"${query}" 영상을 검색하는 중입니다…`);
    const found = await search(query);
    if (!found.ok) {
      lastError = found.message;
      continue;
    }
    searchedOk = true;
    for (const item of found.results.slice(0, 4)) {
      if (videos.length >= want || checked >= maxVerify) break;
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      checked++;
      opts.onProgress?.(`후보 영상 ${checked}개째가 오늘 수업 주제와 맞는지 확인하는 중입니다…`);
      let v: Awaited<ReturnType<typeof verifyTopicVideo>>;
      try {
        v = await verifyTopicVideo(input, item.videoId);
      } catch {
        continue;
      }
      if (v.ok && v.info) {
        videos.push({ videoId: item.videoId, title: v.info.title || item.title, channel: v.info.channel || item.channel, thumbnailUrl: item.thumbnailUrl || thumb(item.videoId), url: watchUrl(item.videoId), source: 'verified', reason: v.reason });
      }
    }
  }
  if (videos.length) return { status: 'found', videos, queries, checked, message: null };
  if (!searchedOk) return { status: 'error', videos: [], queries, checked, message: lastError ?? '영상 검색을 사용할 수 없습니다.' };
  return { status: 'none', videos: [], queries, checked, message: checked ? `후보 영상 ${checked}개를 확인했지만 오늘 수업 주제와 맞는 교육 영상을 찾지 못했습니다.` : '검색 결과가 없었습니다.' };
}
