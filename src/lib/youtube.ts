import type { MartialArtSummary, Technique } from '../types';

// Builds the fallback "search on YouTube" query when a technique has no
// curated videos yet — e.g. "Brazilian Jiu-Jitsu Armbar tutorial". This is
// only ever used to open a normal youtube.com search-results page (see
// externalLink.ts's youtubeSearchUrl); it never calls the YouTube Data API
// and needs no key.
export function buildYoutubeQuery(technique: Technique, art?: MartialArtSummary): string {
  const artName = art?.nameEn || art?.nameKo || technique.martialArt;
  return `${artName} ${technique.name} tutorial`.replace(/\s+/g, ' ').trim();
}
