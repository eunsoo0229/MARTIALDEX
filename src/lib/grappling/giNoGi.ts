import data from '../../../data/curated/gi-nogi.json';
import type { CuratedVideo, Technique } from '../../types';

// Gi / No-Gi — per-technique style data for grappling techniques, built by
// scripts/build-gi-nogi.mjs with its evidence (data/curated/gi-nogi.json).
// Kept OUT of the Technique record and its id: the same technique (same id,
// same history / favorites / relations) just gets a Gi and a No-Gi view.
// Imported only by the technique detail chunk, so the main bundle doesn't
// carry it.

export type { GrapplingStyle, GiNoGiClass, VideoStyle, StylePosture, GiNoGiRecord } from './types';
export { CLASS_LABEL, STYLE_LABEL } from './types';
import type { GrapplingStyle, VideoStyle, StylePosture, GiNoGiRecord } from './types';
import { STYLE_LABEL } from './types';

interface GiNoGiFile {
  version: number;
  generatedAt: string;
  techniques: Record<string, GiNoGiRecord>;
  videoStyles: Record<string, { techniqueId: string; style: VideoStyle; basis: string | null }>;
}

const file = data as unknown as GiNoGiFile;

export function getGiNoGi(techniqueId: string): GiNoGiRecord | null {
  return file.techniques[techniqueId] ?? null;
}

export function allGiNoGi(): Record<string, GiNoGiRecord> {
  return file.techniques;
}

export function giNoGiGeneratedAt(): string {
  return file.generatedAt;
}

const applicable = (r: GiNoGiRecord, s: GrapplingStyle) => (s === 'gi' ? r.gi.applicable : r.noGi.applicable);

/** Which style a technique opens on: its own style, else the viewer's last choice. */
export function defaultStyle(r: GiNoGiRecord, preferred: GrapplingStyle | null): GrapplingStyle {
  if (r.classification === 'gi_centric' || applicable(r, 'nogi') === false) return 'gi';
  if (r.classification === 'nogi_centric' || applicable(r, 'gi') === false) return 'nogi';
  return preferred ?? 'gi';
}

export type StyleView =
  | { kind: 'not_applicable'; reason: string }
  | { kind: 'style'; posture: StylePosture }
  | { kind: 'shared'; note: string }
  | { kind: 'missing'; note: string };

/**
 * What the posture area shows for one style. Never borrows the other
 * style's text: a style without its own (or a verified-shared) description
 * says so instead.
 */
export function styleView(r: GiNoGiRecord, s: GrapplingStyle, hasBasePosture: boolean): StyleView {
  if (applicable(r, s) === false) return { kind: 'not_applicable', reason: s === 'nogi' ? '도복 그립을 이용하는 기술이라 No-Gi에서는 적용되지 않습니다.' : 'Gi 경기에서는 사용하지 않는 기술로 분류되었습니다.' };
  const own = s === 'gi' ? r.postures.gi : r.postures.noGi;
  if (own) return { kind: 'style', posture: own };
  if (!hasBasePosture) return { kind: 'missing', note: `${STYLE_LABEL[s]} 자세 설명이 아직 등록되지 않았습니다.` };
  if (r.classification === 'same') return { kind: 'shared', note: 'Gi와 No-Gi에서 수행 방식이 같아 공통 자세 설명을 보여 드립니다.' };
  if (r.basePostureStyle === 'gi' && s === 'nogi') return { kind: 'missing', note: '등록된 자세 설명은 도복 그립을 전제로 해 No-Gi 설명으로 쓸 수 없습니다. No-Gi 자세 설명은 아직 등록되지 않았습니다(검토 필요).' };
  if (r.classification === 'gi_centric' && s === 'gi') return { kind: 'shared', note: 'Gi 중심 기술의 자세 설명입니다.' };
  if (r.classification === 'nogi_centric' && s === 'nogi') return { kind: 'shared', note: 'No-Gi 중심 기술의 자세 설명입니다.' };
  return { kind: 'shared', note: `${STYLE_LABEL[s]} 전용 자세 설명은 아직 없어, 스타일을 구분하지 않은 기본 자세 설명을 보여 드립니다(검토 필요).` };
}

// ---------------- videos

/** Style of a video: its own tag (added videos), else the curated title classification, else unknown. */
export function videoStyleOf(v: CuratedVideo): VideoStyle {
  if (v.style) return v.style;
  return file.videoStyles[v.videoId]?.style ?? 'unknown';
}

/** Style evidence in a video's own title/description — "Gi" in a search query alone proves nothing. */
export function detectVideoStyle(text: string): VideoStyle {
  const t = text ?? '';
  const both = /gi\s*(&|and|\/|or|vs\.?)\s*no[\s-]?gi|no[\s-]?gi\s*(&|and|\/|or|vs\.?)\s*gi/i.test(t);
  if (both) return 'both';
  if (/\bno[\s-]?gi\b|\bnogi\b|노\s?기/i.test(t)) return 'nogi';
  if (/\bgi\b|kimono|도복|(collar|lapel|sleeve)\s?(grip|choke|drag)/i.test(t)) return 'gi';
  return 'unknown';
}

/** Splits a technique's videos for one style tab: shown / not-yet-classified (the other style's are dropped). */
export function videosForStyle(videos: CuratedVideo[], s: GrapplingStyle, r: GiNoGiRecord): { shown: CuratedVideo[]; unknown: CuratedVideo[] } {
  const shown: CuratedVideo[] = [];
  const unknown: CuratedVideo[] = [];
  for (const v of videos) {
    const st = videoStyleOf(v);
    if (st === s || st === 'both') shown.push(v);
    // A technique done the same way in both styles: an unclassified video is valid for both.
    else if (st === 'unknown') (r.classification === 'same' ? shown : unknown).push(v);
  }
  return { shown, unknown };
}

const PREF_KEY = 'martialdex:grappling-style';
export function getPreferredStyle(): GrapplingStyle | null {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === 'gi' || v === 'nogi' ? v : null;
  } catch {
    return null;
  }
}
export function setPreferredStyle(s: GrapplingStyle): void {
  try {
    window.localStorage.setItem(PREF_KEY, s);
  } catch {
    // preference only
  }
}

export function isGrapplingTarget(t: Pick<Technique, 'id'>): boolean {
  return !!file.techniques[t.id];
}
