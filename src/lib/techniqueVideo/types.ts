import type { CuratedVideo } from '../../types';

/**
 * A user's own YouTube pick for a technique that has no curated video —
 * spec "기술 상세보기/훈련 화면 영상 탐색" feature. Deliberately PER-USER, never
 * a mutation of the shared curated/add_teq technique data: two different
 * users picking different videos for the same technique (especially a
 * shared add_teq one) must never overwrite each other's choice or leak one
 * user's pick to everyone else. RelatedVideos.tsx reads this as an overlay
 * on top of `technique.videos`, never replacing the base data source.
 */
export interface TechniqueVideoPick {
  techniqueId: string;
  videos: CuratedVideo[];
  /** How this pick was found — always 'user_selected' today (search-and-choose); kept as a literal union (not a bare boolean) so a future source (e.g. an AI recommendation the user didn't manually browse) can be distinguished without a breaking change. */
  source: 'user_selected';
  updatedAt: string;
}
