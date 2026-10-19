import type { Technique } from '../../types';
import { getUnifiedMartialArt, normalizeTechniqueName } from '../userTechniques/service';
import { askGeminiForJsonWithGrounding } from '../userTechniques/geminiJson';
import { videoInfoProvider } from '../videoSearch/provider';
import type { VideoInfo } from '../videoSearch/types';

// "YouTube URL 직접 추가" — a pasted URL is NEVER added on the strength of its
// title alone. The flow is: parse the URL -> read the video's REAL public
// metadata (title/channel/description/keywords) -> ask Gemini to judge ONLY
// from that metadata (useSearchGrounding:false, same evidence-only pattern
// as martialArtDiscovery/aiVerification.ts) -> then re-check the model's
// answer in code, so a model that says "VERIFIED" without real supporting
// evidence is downgraded instead of trusted.

export type VideoVerificationVerdict = 'VERIFIED' | 'NOT_MATCHED' | 'INSUFFICIENT_EVIDENCE';

export interface VideoVerificationResult {
  verdict: VideoVerificationVerdict;
  videoId: string | null;
  info: VideoInfo | null;
  /** Short Korean reason shown to the user. */
  reason: string;
  identifiedTechnique: string | null;
  identifiedMartialArt: string | null;
  contentType: string | null;
  evidenceQuotes: string[];
  /** Set when the code-level checks overrode the model's own verdict. */
  downgradedFrom?: VideoVerificationVerdict;
}

/** Accepts watch?v=, youtu.be/, /shorts/, /embed/, /live/, m./music. hosts, or a bare 11-char id. Returns null for anything else. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '').toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export const ALLOWED_CONTENT_TYPES = new Set(['tutorial', 'demonstration', 'instructional_breakdown']);
export const MIN_NON_TITLE_EVIDENCE_CHARS = 40;
const RETRYABLE = new Set(['EMPTY_RESPONSE', 'PARSE_ERROR', 'UNKNOWN']);

interface RawVerdict {
  verdict: string;
  identifiedTechnique: string | null;
  identifiedMartialArt: string | null;
  contentType: string;
  evidenceQuotes: string[];
  reason: string;
}

function isRawVerdict(v: unknown): v is RawVerdict {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.verdict === 'string' &&
    (o.identifiedTechnique === null || typeof o.identifiedTechnique === 'string') &&
    (o.identifiedMartialArt === null || typeof o.identifiedMartialArt === 'string') &&
    typeof o.contentType === 'string' &&
    Array.isArray(o.evidenceQuotes) &&
    o.evidenceQuotes.every((q) => typeof q === 'string') &&
    typeof o.reason === 'string'
  );
}

/** Every name this technique is really known by in MARTIALDEX's own data. */
function techniqueNames(technique: Technique): string[] {
  return [technique.name, technique.koreanName ?? '', ...technique.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
}

/** Case/punctuation/Unicode-form-insensitive word sequence — a quote still has to be a real run of words from the metadata, but a model re-typing "armbar, its" as "armbar its" or dropping an emoji doesn't count as fabrication. */
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function mentionsTechnique(text: string, names: string[]): boolean {
  const flat = normalizeTechniqueName(text);
  return names.some((n) => {
    const key = normalizeTechniqueName(n);
    return key.length >= 3 && flat.includes(key);
  });
}

function build(videoId: string | null, info: VideoInfo | null, verdict: VideoVerificationVerdict, reason: string, extra: Partial<VideoVerificationResult> = {}): VideoVerificationResult {
  return { verdict, videoId, info, reason, identifiedTechnique: null, identifiedMartialArt: null, contentType: null, evidenceQuotes: [], ...extra };
}

/**
 * The code-level second opinion on a model verdict. Pure (no network) so it
 * can be tested directly. VERIFIED survives only if ALL hold:
 *  1. every evidence quote really appears in the video's own metadata;
 *  2. at least one quote names THIS technique (name/koreanName/alias);
 *  3. at least one quote comes from the description/keywords, not only the
 *     title (a title alone is never enough — see spec 18);
 *  4. the content is a tutorial/demonstration, not a highlight/short clip/
 *     unrelated upload.
 */
export function applyEvidenceChecks(technique: Technique, info: VideoInfo, raw: RawVerdict): VideoVerificationResult {
  const verdict: VideoVerificationVerdict = raw.verdict === 'VERIFIED' || raw.verdict === 'NOT_MATCHED' ? raw.verdict : 'INSUFFICIENT_EVIDENCE';
  const base = {
    identifiedTechnique: raw.identifiedTechnique,
    identifiedMartialArt: raw.identifiedMartialArt,
    contentType: raw.contentType,
    evidenceQuotes: raw.evidenceQuotes.slice(0, 6),
  };
  if (verdict !== 'VERIFIED') return build(info.videoId, info, verdict, raw.reason, base);

  const titleN = normalize(info.title);
  const bodyN = normalize([info.description, info.keywords.join(' ')].join(' \n '));
  const quotes = raw.evidenceQuotes.map(normalize).filter((q) => q.length >= 3);
  const names = techniqueNames(technique);
  const downgrade = (to: VideoVerificationVerdict, reason: string) => build(info.videoId, info, to, reason, { ...base, downgradedFrom: 'VERIFIED' });

  if (quotes.length === 0 || !quotes.every((q) => titleN.includes(q) || bodyN.includes(q))) {
    return downgrade('INSUFFICIENT_EVIDENCE', '영상 정보에서 판정 근거를 확인할 수 없었습니다.');
  }
  if (!quotes.some((q) => mentionsTechnique(q, names))) {
    return downgrade('INSUFFICIENT_EVIDENCE', '영상 정보에서 현재 기술 이름을 확인할 수 없었습니다.');
  }
  if (!quotes.some((q) => bodyN.includes(q) && !titleN.includes(q))) {
    return downgrade('INSUFFICIENT_EVIDENCE', '제목 외에 영상 설명·키워드에서 근거를 찾지 못해 제목만으로는 확인할 수 없습니다.');
  }
  if (!ALLOWED_CONTENT_TYPES.has(raw.contentType)) {
    return downgrade('NOT_MATCHED', '기술을 설명하거나 시연하는 영상이 아닌 것으로 판단되었습니다(경기 하이라이트·짧은 클립 등).');
  }
  return build(info.videoId, info, 'VERIFIED', raw.reason, base);
}

export async function verifyTechniqueVideoUrl(technique: Technique, url: string): Promise<VideoVerificationResult> {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) return build(null, null, 'INSUFFICIENT_EVIDENCE', '올바른 YouTube 영상 주소가 아닙니다.');

  const infoOutcome = await videoInfoProvider.get(videoId);
  if (!infoOutcome.ok) return build(videoId, null, 'INSUFFICIENT_EVIDENCE', `영상 정보를 가져올 수 없습니다: ${infoOutcome.message}`);
  const info = infoOutcome.info;
  if (!info.playable) return build(videoId, info, 'INSUFFICIENT_EVIDENCE', '재생할 수 없는 영상이라 내용을 확인할 수 없습니다.');

  // Nothing beyond a title to judge from -> never auto-verify (spec 18).
  const nonTitleText = [info.description, info.keywords.join(' ')].join(' ').trim();
  if (nonTitleText.length < MIN_NON_TITLE_EVIDENCE_CHARS) {
    return build(videoId, info, 'INSUFFICIENT_EVIDENCE', '영상 설명·키워드가 거의 없어 제목만으로는 기술 일치 여부를 확인할 수 없습니다.');
  }

  const art = getUnifiedMartialArt(technique.martialArt);
  const artLabel = art ? `${art.nameKo}${art.nameEn ? ` (${art.nameEn})` : ''}` : technique.martialArt;
  const systemInstruction = [
    '사용자가 무술 기술 백과사전의 특정 기술에 YouTube 영상을 "관련 영상"으로 등록하려고 한다.',
    '아래 [영상 정보]에 실제로 적혀 있는 내용만 근거로, 이 영상이 정확히 [현재 기술]을 설명하거나 시연하는 영상인지 엄격하게 판정한다.',
    '당신이 이 영상에 대해 알고 있다고 생각하는 내용은 사용하지 않는다. 영상 정보에 없는 내용은 모르는 것이다.',
    '',
    '판정(verdict):',
    '- "VERIFIED": 영상 정보(특히 설명/키워드)에 현재 기술 그 자체를 가르치거나 시연한다는 근거가 명확하고, 무술도 일치한다.',
    '- "NOT_MATCHED": 다른 기술(예: 현재 기술이 Armbar인데 Triangle 영상), 다른 무술, 경기 하이라이트, 무관한 영상이다.',
    '- "INSUFFICIENT_EVIDENCE": 영상 정보만으로는 판단할 근거가 부족하다.',
    '',
    '주의:',
    '- 제목에 무술 이름(예: "BJJ")만 들어 있다고 일치로 보지 않는다. 기술 자체가 일치해야 한다.',
    '- 여러 기술을 다루는 영상이면, 현재 기술이 영상의 주된 내용일 때만 VERIFIED로 본다.',
    '- 쇼츠(짧은 클립)나 하이라이트는 기술명이 잘못 붙은 경우가 많으므로 설명에 기술을 가르친다는 근거가 없으면 VERIFIED로 보지 않는다.',
    '- 같은 기술의 다른 이름(별칭, 한국어/영어/일본어 표기)은 같은 기술로 본다.',
    '',
    'contentType: "tutorial"(강좌) | "demonstration"(시연) | "instructional_breakdown"(분석/해설) | "competition_highlight"(경기/하이라이트) | "shorts_clip"(짧은 클립) | "unrelated" | "other"',
    'evidenceQuotes: 판정 근거가 된 문구를 [영상 정보]에서 글자 그대로 짧게 인용(1~4개). 반드시 제목 외에 설명 또는 키워드에서 나온 인용을 1개 이상 포함한다. 지어내지 않는다.',
    'reason: 판정 이유 한국어 1~2문장.',
    '',
    '출력 형식: {"verdict": string, "identifiedTechnique": string|null, "identifiedMartialArt": string|null, "contentType": string, "evidenceQuotes": string[], "reason": string}',
  ].join('\n');

  const question = [
    '[현재 기술]',
    `무술: ${artLabel}`,
    `기술명: ${technique.name}${technique.koreanName ? ` / ${technique.koreanName}` : ''}`,
    technique.aliases.length ? `별칭: ${technique.aliases.join(', ')}` : '',
    `분류/포지션: ${[technique.category, ...technique.positions].filter(Boolean).join(', ')}`,
    technique.description ? `설명: ${technique.description.slice(0, 400)}` : '',
    technique.purpose ? `목적: ${technique.purpose.slice(0, 300)}` : '',
    '',
    '[영상 정보]',
    `제목: ${info.title}`,
    `채널: ${info.channel}`,
    `길이: ${info.lengthSeconds}초`,
    info.category ? `분류: ${info.category}` : '',
    info.keywords.length ? `키워드: ${info.keywords.join(', ')}` : '키워드: (없음)',
    `설명${info.descriptionIsExcerpt ? '(검색 결과에 표시된 앞부분 일부만 확인 가능)' : ''}:\n${info.description.slice(0, 3000)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');

  const attempt = () => askGeminiForJsonWithGrounding<RawVerdict>({ systemInstruction, contextText: '', question, useSearchGrounding: false, validate: isRawVerdict });
  let result = await attempt();
  if (!result.ok && RETRYABLE.has(result.code)) result = await attempt();
  if (!result.ok) return build(videoId, info, 'INSUFFICIENT_EVIDENCE', `AI 검증을 완료하지 못했습니다: ${result.message}`);

  return applyEvidenceChecks(technique, info, result.data);
}
