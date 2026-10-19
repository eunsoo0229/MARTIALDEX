import type { Technique } from '../../types';
import { getTechniqueConnections } from '../techniqueGraph/buildGraph';
import { getUnifiedAllTechniques, normalizeTechniqueName, resolveTechnique, resolveTechniquesByIds, searchAllTechniques } from '../userTechniques/service';
import { buildEvidence, genericKey, type RelatedTechniqueRef, type TechniqueEvidence } from './evidence';
import { dataKoreanNames, soundsLike } from './koreanNames';

// Technique lookup for the coach — by id (exact) or by what the student
// typed. A query only RESOLVES when a technique's own name / Korean name /
// alias — or a Korean name its own data gives it (koreanNames.ts: "암바" for
// Armbar) — equals it (normalised). Several techniques with that name →
// "ambiguous" (the student picks); fuzzy search results are only candidates,
// never silently treated as "the" technique.

export type LookupResult =
  | { status: 'found'; technique: Technique; evidence: TechniqueEvidence; matchedBy: 'id' | 'exact_name' }
  | { status: 'ambiguous'; candidates: { techniqueId: string; name: string; martialArt: string }[]; message: string }
  | { status: 'not_found'; candidates: { techniqueId: string; name: string; martialArt: string }[]; message: string };

let genericCache: { count: number; texts: Set<string> } | null = null;

/** purpose / principles / description texts the corpus repeats on 3+ techniques (category paragraphs). */
export function genericTexts(): Set<string> {
  const all = getUnifiedAllTechniques();
  if (genericCache && genericCache.count === all.length) return genericCache.texts;
  const seen = new Map<string, number>();
  for (const t of all) {
    const own = new Set([t.purpose ?? '', t.description ?? '', ...t.principles].map((x) => x.trim()).filter((x) => x.length >= 20).map(genericKey));
    for (const k of own) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const texts = new Set([...seen].filter(([, n]) => n >= 3).map(([k]) => k));
  genericCache = { count: all.length, texts };
  return texts;
}

/** Related techniques that really exist: the record's relatedTechniques + the relation graph's edges. */
export function relatedOf(t: Technique): RelatedTechniqueRef[] {
  const out: RelatedTechniqueRef[] = resolveTechniquesByIds(t.relatedTechniques).map((r) => ({ techniqueId: r.id, name: r.name, relation: 'related' }));
  try {
    const c = getTechniqueConnections(t);
    for (const kind of ['prerequisite', 'next', 'chain', 'counter', 'escape'] as const) {
      for (const x of c[kind]) out.push({ techniqueId: x.techniqueId, name: x.techniqueName, relation: kind });
    }
  } catch {
    // graph unavailable for this record (e.g. a user technique) — relatedTechniques only
  }
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.techniqueId) && seen.add(r.techniqueId));
}

export function evidenceFor(t: Technique): TechniqueEvidence {
  const ev = buildEvidence(t, { related: relatedOf(t), genericTexts: genericTexts() });
  // No Korean name in the record → the Korean name its own data gives it ("리어 네이키드 초크(Rear Naked Choke)").
  const korean = t.koreanName ? null : (nameIndex().dataNames.get(t.id) ?? [])[0];
  return korean ? { ...ev, displayName: `${korean}(${t.name})` } : ev;
}

const brief = (t: Technique) => ({ techniqueId: t.id, name: t.koreanName && t.koreanName !== t.name ? `${t.koreanName}(${t.name})` : t.name, martialArt: t.martialArt });

interface NameIndex {
  count: number;
  /** normalised name → techniques registered or verified under it. */
  byName: Map<string, Technique[]>;
  /** technique id → Korean names taken from its own data (not in the record). */
  dataNames: Map<string, string[]>;
}
let indexCache: NameIndex | null = null;

function registeredNames(t: Technique): string[] {
  return [t.name, t.koreanName ?? '', ...(t.aliases ?? [])].filter((n) => !!n && n.trim().length > 0);
}

function nameIndex(): NameIndex {
  const all = getUnifiedAllTechniques();
  if (indexCache && indexCache.count === all.length) return indexCache;
  const byName = new Map<string, Technique[]>();
  const add = (n: string, t: Technique) => {
    const k = normalizeTechniqueName(n);
    if (!k) return;
    const list = byName.get(k) ?? [];
    if (!list.some((x) => x.id === t.id)) list.push(t);
    byName.set(k, list);
  };
  for (const t of all) for (const n of registeredNames(t)) add(n, t);
  // A data name that is ANOTHER technique's registered name (a different English name) is not added:
  // it names that technique, not this one. Same English name in another art ("Jab") → both listed (ambiguous).
  const dataNames = new Map<string, string[]>();
  for (const t of all) {
    const own = normalizeTechniqueName(t.name);
    const names = dataKoreanNames(t).filter((k) => (byName.get(normalizeTechniqueName(k)) ?? []).every((o) => o.id === t.id || normalizeTechniqueName(o.name) === own));
    if (names.length) dataNames.set(t.id, names);
  }
  // Two different techniques claiming one data name ("오버언더": Over-Under, and Over-Under Pass by alias):
  // only those whose MAIN name it transliterates keep it (if none or several do, all keep it → the student picks).
  const claims = new Map<string, Technique[]>();
  for (const t of all) for (const n of dataNames.get(t.id) ?? []) claims.set(normalizeTechniqueName(n), [...(claims.get(normalizeTechniqueName(n)) ?? []), t]);
  for (const t of all) {
    for (const n of dataNames.get(t.id) ?? []) {
      const rivals = claims.get(normalizeTechniqueName(n)) ?? [];
      const differentNames = new Set(rivals.map((r) => normalizeTechniqueName(r.name))).size > 1;
      if (differentNames) {
        const main = rivals.filter((r) => soundsLike(n, r.name));
        if (main.length > 0 && !main.includes(t)) continue;
      }
      add(n, t);
    }
  }
  indexCache = { count: all.length, byName, dataNames };
  return indexCache;
}

/** Every name the coach may call this technique by: registered names + Korean names from its own data. */
export function namesOf(t: Technique): string[] {
  const index = nameIndex();
  const data = (index.dataNames.get(t.id) ?? []).filter((n) => (index.byName.get(normalizeTechniqueName(n)) ?? []).some((x) => x.id === t.id));
  return [...new Set([...registeredNames(t), ...data])];
}

const inArt = (t: Technique, art: string | null | undefined) => !art || t.martialArt === art || (t.martialArts ?? []).includes(art);

export function lookupTechnique(input: { id?: string | null; query?: string | null; martialArt?: string | null }): LookupResult {
  if (input.id) {
    const t = resolveTechnique(input.id);
    if (t) return { status: 'found', technique: t, evidence: evidenceFor(t), matchedBy: 'id' };
    return { status: 'not_found', candidates: [], message: `MARTIALDEX에 "${input.id}" 기술이 없습니다.` };
  }
  const q = (input.query ?? '').trim();
  if (!q) return { status: 'not_found', candidates: [], message: '찾을 기술 이름이 비어 있습니다.' };
  const target = normalizeTechniqueName(q);
  const index = nameIndex();
  const exact = (index.byName.get(target) ?? []).filter((t) => inArt(t, input.martialArt));
  if (exact.length === 1) return { status: 'found', technique: exact[0], evidence: evidenceFor(exact[0]), matchedBy: 'exact_name' };
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact.map(brief), message: `"${q}"라는 이름의 기술이 ${exact.length}개 있습니다. 어떤 것인지 골라 주세요.` };
  // Candidates must really contain what was typed (fuzzy search also returns unrelated techniques).
  const seen = new Set<string>();
  const containing: Technique[] = [];
  const consider = (t: Technique) => {
    if (seen.has(t.id) || !inArt(t, input.martialArt)) return;
    seen.add(t.id);
    containing.push(t);
  };
  if (target.length >= 2) {
    for (const t of searchAllTechniques(q, 12, input.martialArt ? { martialArt: input.martialArt } : {})) if (namesOf(t).some((n) => normalizeTechniqueName(n).includes(target))) consider(t);
    for (const [k, list] of index.byName) if (k.includes(target)) list.forEach(consider);
  }
  return {
    status: 'not_found',
    candidates: containing.slice(0, 5).map(brief),
    message: containing.length
      ? `MARTIALDEX에 "${q}"와 이름이 같은 기술은 없습니다. 이름이 비슷한 기술은 있지만 같은 기술인지 확인할 수 없어 대신 쓰지 않았습니다.`
      : `MARTIALDEX에 "${q}" 기술이 없습니다.`,
  };
}

const PARTICLE = /(으로|에서|이랑|하고|까지|부터|을|를|이|가|은|는|로|와|과|도|만|의|랑)$/;

export interface TextTechniques {
  /** Techniques a phrase of the text names exactly (one technique per phrase). */
  matches: Technique[];
  /** Phrases that name several techniques ("잽" — boxing and kickboxing): the student must pick. */
  ambiguous: { phrase: string; candidates: { techniqueId: string; name: string; martialArt: string }[] }[];
  words: string[];
}

/**
 * Techniques a phrase of the request names EXACTLY ("오늘 암바를 배우고 싶어" →
 * Armbar), longest phrase first: the words of "리어 네이키드 초크" are not
 * looked up again on their own ("리어" alone is another record). Particles are
 * stripped. Nothing fuzzy: a word that is no technique's name matches nothing.
 */
export function exactTechniquesInText(text: string, martialArt: string | null = null): TextTechniques {
  const raw = text.normalize('NFKC').split(/[\s,.!?·/]+/).filter(Boolean);
  const bare = raw.map((w) => w.replace(PARTICLE, '') || w);
  const used = new Array(raw.length).fill(false);
  const found = new Map<string, Technique>();
  const ambiguous: TextTechniques['ambiguous'] = [];
  for (let n = Math.min(3, raw.length); n >= 1; n--) {
    for (let i = 0; i + n <= raw.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      // Inner words keep their form; only the last word of a phrase loses its particle.
      const forms = [...new Set([[...raw.slice(i, i + n - 1), bare[i + n - 1]].join(' '), raw.slice(i, i + n).join(' ')])];
      for (const phrase of forms) {
        const r = lookupTechnique({ query: phrase, martialArt });
        if (r.status === 'not_found') continue;
        for (let j = i; j < i + n; j++) used[j] = true;
        if (r.status === 'found') found.set(r.technique.id, r.technique);
        else ambiguous.push({ phrase, candidates: r.candidates });
        break;
      }
    }
  }
  return { matches: [...found.values()], ambiguous, words: [...new Set([...raw, ...bare])] };
}
