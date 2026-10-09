import type { CuratedVideo, PostureInfo, Technique } from '../../types';

// Pure merge of several records of the SAME technique into one canonical
// technique (see data/curated/technique-canonical.json). Lossless by
// design: lists are unioned, the canonical record's own scalar values win
// and only gaps are filled from the others, every member's name/Korean name
// becomes an alias, and a member's differing description is kept as that
// art's usage note instead of being dropped.

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function uniqText(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

function mergeVideos(lists: CuratedVideo[][]): CuratedVideo[] {
  const seen = new Set<string>();
  const out: CuratedVideo[] = [];
  for (const v of lists.flat()) {
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    out.push(v);
  }
  return out;
}

function mergePosture(primary: PostureInfo | undefined, others: (PostureInfo | undefined)[]): PostureInfo | undefined {
  const all = [primary, ...others].filter((p): p is PostureInfo => !!p);
  if (all.length === 0) return undefined;
  const base = { ...all[0] };
  for (const p of all.slice(1)) {
    base.startingPosition ??= p.startingPosition;
    base.bodyPosition ??= p.bodyPosition;
    base.steps = base.steps?.length ? base.steps : p.steps;
    base.keyPoints = uniqText([...(base.keyPoints ?? []), ...(p.keyPoints ?? [])]);
    base.commonMistakes = uniqText([...(base.commonMistakes ?? []), ...(p.commonMistakes ?? [])]);
  }
  return base;
}

export function mergeTechniqueGroup(primary: Technique, members: Technique[]): Technique {
  const others = members.filter((m) => m.id !== primary.id);
  const ordered = [primary, ...others];
  const arts = uniq(ordered.map((m) => m.martialArt));
  const categoryByArt: Record<string, string> = {};
  for (const m of ordered) categoryByArt[m.martialArt] ??= m.category;
  const namesByArt: Record<string, { name: string; koreanName: string | null }> = {};
  for (const m of ordered) namesByArt[m.martialArt] ??= { name: m.name, koreanName: m.koreanName };
  const usageByArt: Record<string, string> = {};
  for (const m of ordered) {
    const d = m.description?.trim();
    if (d && d !== primary.description?.trim() && !usageByArt[m.martialArt]) usageByArt[m.martialArt] = d;
  }
  const nameKey = primary.name.trim().toLowerCase();
  return {
    ...primary,
    koreanName: primary.koreanName ?? others.find((m) => m.koreanName)?.koreanName ?? null,
    aliases: uniqText([
      ...ordered.flatMap((m) => m.aliases),
      ...others.map((m) => m.name).filter((n) => n.trim().toLowerCase() !== nameKey),
      ...others.map((m) => m.koreanName ?? '').filter((n) => n && n !== primary.koreanName),
    ]),
    description: primary.description?.trim() ? primary.description : (others.find((m) => m.description?.trim())?.description ?? ''),
    purpose: primary.purpose ?? others.find((m) => m.purpose)?.purpose ?? null,
    positions: uniqText(ordered.flatMap((m) => m.positions)),
    principles: uniqText(ordered.flatMap((m) => m.principles)),
    variations: uniqText(ordered.flatMap((m) => m.variations)),
    counters: uniqText(ordered.flatMap((m) => m.counters)),
    defenses: uniqText(ordered.flatMap((m) => m.defenses)),
    transitions: uniqText(ordered.flatMap((m) => m.transitions)),
    relatedTechniques: uniq(ordered.flatMap((m) => m.relatedTechniques)),
    relatedMartialArts: uniq([...ordered.flatMap((m) => m.relatedMartialArts), ...arts.slice(1)]).filter((a) => a !== primary.martialArt),
    difficulty: primary.difficulty ?? others.find((m) => m.difficulty)?.difficulty ?? null,
    tags: uniq([...ordered.flatMap((m) => m.tags), ...arts.map((a) => `martialArt:${a}`)]),
    videos: mergeVideos(ordered.map((m) => m.videos ?? [])),
    posture: mergePosture(primary.posture, others.map((m) => m.posture)),
    martialArts: arts,
    categoryByArt,
    mergedIds: ordered.map((m) => m.id),
    namesByArt,
    ...(Object.keys(usageByArt).length ? { usageByArt } : {}),
  };
}
