// 게시물 해시태그 (spec section 8) — deliberately NOT a separate DB column:
// hashtags are always derived from `content` itself (the single source of
// truth already stored/synced), so there is no separate write path that
// could drift out of sync with what the post text actually says. A post's
// hashtags are recomputed on read via extractHashtags(content).

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

/** Real hashtags found in a post's own content, in first-seen order, de-duplicated by normalized form (keeps the FIRST casing seen for display). */
export function extractHashtags(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of content.matchAll(HASHTAG_RE)) {
    const tag = m[1];
    const key = normalizeHashtag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** #BJJ / #bjj / #Bjj all treated as the same tag for search/filter/click purposes — display always keeps the author's original casing (extractHashtags above), only comparisons go through this. */
export function normalizeHashtag(tag: string): string {
  return tag.toLowerCase();
}

/** Does this post's content actually contain the given hashtag (case/mark-insensitive)? Used by listFeed's client-side hashtag filter. */
export function postHasHashtag(content: string, tag: string): boolean {
  const target = normalizeHashtag(tag);
  return extractHashtags(content).some((t) => normalizeHashtag(t) === target);
}
