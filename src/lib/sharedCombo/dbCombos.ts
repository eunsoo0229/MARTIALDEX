import type { Technique } from '../../types';
import { allTechniques, categoryInArt, getMartialArt } from '../loadData';
import { libraryTechniques, techniqueArts, techniqueNameInArt } from '../techniqueCanonical';
import type { SharedComboStep } from './types';

// Every COMBINATION record in the MARTIALDEX technique DB (official + shared
// library) — "Jab → Cross → Low Kick", boxing "1--2--3", judo renraku waza
// "Ouchi Gari → Uchi Mata", BJJ chains "Kimura → Armbar" — turned into the
// shared-combo shape so the operator account can publish them in 사용자 콤보.
//
// A record is a combo only when its name is a sequence AND every part resolves
// to a real technique. Records that only look like one ("Teep to Leg" = a
// target, "Jab to Body", "Chest-to-Chest Defense", generic MMA "Strike to
// Takedown Transition", BJJ category "기본 움직임과 연결 기술") are returned as
// `skipped` with the reason — never published with an invented step.

export interface DbComboCandidate {
  /** Stable per record (and part, when one record lists several combos) — re-publishing updates instead of duplicating. */
  sourceRef: string;
  recordId: string;
  name: string;
  martialArt: string;
  category: string;
  purpose: string;
  description: string;
  steps: SharedComboStep[];
}

export interface DbComboSkip {
  recordId: string;
  name: string;
  reason: string;
}

const BOXING_NUMBERS: Record<string, string> = { '1': 'Jab', '2': 'Cross', '3': 'Lead Hook', '4': 'Rear Hook', '5': 'Lead Uppercut', '6': 'Rear Uppercut' };
/** Shorthand used inside chain names ("Single to Double", "Front Headlock to Ankle"). */
const SHORTHAND: Record<string, string> = { single: 'Single Leg', double: 'Basic Double Leg', ankle: 'Ankle Pick', back: 'Back Take' };
const SEQUENCE = /\s*(?:→|->|--|\s\bto\b\s|\s-\s)\s*/i;

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function namesOf(t: Technique): string[] {
  return [t.name, t.koreanName ?? '', ...t.aliases, ...Object.values(t.namesByArt ?? {}).flatMap((n) => [n.name, n.koreanName ?? ''])].filter(Boolean);
}

function buildIndex(pool: Technique[]): Map<string, Technique[]> {
  const idx = new Map<string, Technique[]>();
  for (const t of pool) for (const n of namesOf(t)) {
    const k = norm(n);
    if (!k) continue;
    idx.set(k, [...(idx.get(k) ?? []), t]);
  }
  return idx;
}

function resolvePart(raw: string, art: string, idx: Map<string, Technique[]>): Technique | null {
  const noTakedown = raw.replace(/\btakedown\b/i, '').trim();
  const cleaned = noTakedown.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  // "반대발(뒷발) 돌려차기" → "뒷발 돌려차기", "주먹(반대지르기)" → "반대지르기": the bracket names the real technique.
  const bracket = noTakedown.match(/^(.*?)(\S*)\(([^)]+)\)(.*)$/);
  const fromBracket = bracket ? [`${bracket[1]}${bracket[3]}${bracket[4]}`.trim(), bracket[3].trim()] : [];
  const tries = [cleaned, ...fromBracket, SHORTHAND[cleaned.toLowerCase()] ?? '', `Basic ${cleaned}`].filter(Boolean);
  for (const name of tries) {
    const hits = idx.get(norm(name)) ?? [];
    const inArt = hits.find((t) => techniqueArts(t).includes(art));
    if (inArt ?? hits[0]) return inArt ?? hits[0];
  }
  return null;
}

/** "Jab--Cross / Jab--Hook" holds several combos; boxing "1--2--3" uses numbers. */
function splitSequences(name: string, art: string): string[][] {
  return name
    .split(/\s\/\s|,\s/)
    .map((part) => part.split(SEQUENCE).map((x) => x.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 2)
    .map((parts) => (art === 'boxing' && parts.every((p) => BOXING_NUMBERS[p]) ? parts.map((p) => BOXING_NUMBERS[p]) : parts));
}

export function listDbCombosForSharing(): { combos: DbComboCandidate[]; skipped: DbComboSkip[] } {
  const library = libraryTechniques().addTeq;
  const pool = [...allTechniques, ...library];
  const idx = buildIndex(pool);
  const combos: DbComboCandidate[] = [];
  const skipped: DbComboSkip[] = [];
  const seenSteps = new Set<string>();
  // A record filed in its art's combination category is the reference copy of a sequence another art also lists.
  const isComboCategory = (t: Technique) => /조합|콤비|연결|Combination|Renraku|Renzoku/i.test(categoryInArt(t, t.martialArt));
  const ordered = [...pool].sort((a, b) => Number(isComboCategory(b)) - Number(isComboCategory(a)));
  for (const t of ordered) {
    if (!SEQUENCE.test(t.name) && !(t.martialArt === 'boxing' && /^\d(\s*-+\s*\d)+$/.test(t.name))) continue;
    const sequences = splitSequences(t.name, t.martialArt);
    if (!sequences.length) {
      skipped.push({ recordId: t.id, name: t.name, reason: '연결 동작 이름이 아님 (기술 2개 이상의 순서가 아님)' });
      continue;
    }
    sequences.forEach((parts, i) => {
      const resolved = parts.map((p) => resolvePart(p, t.martialArt, idx));
      const missing = parts.filter((_, j) => !resolved[j]);
      if (missing.length) {
        skipped.push({ recordId: t.id, name: t.name, reason: `실제 기술로 확인되지 않는 단계: ${missing.join(', ')} (대상·일반 개념이거나 DB에 없는 이름)` });
        return;
      }
      const techs = resolved as Technique[];
      if (new Set(techs.map((x) => x.id)).size < 2 && techs.length < 3) {
        skipped.push({ recordId: t.id, name: t.name, reason: '같은 기술 하나뿐인 연결' });
        return;
      }
      const key = techs.map((x) => x.id).join('>');
      if (seenSteps.has(key)) {
        skipped.push({ recordId: t.id, name: t.name, reason: '같은 순서의 콤보가 이미 있음' });
        return;
      }
      seenSteps.add(key);
      const art = t.martialArt;
      const artKo = getMartialArt(art)?.nameKo ?? art;
      const category = categoryInArt(t, art);
      const steps: SharedComboStep[] = techs.map((x) => ({ techniqueId: x.id, name: techniqueNameInArt(x, techniqueArts(x).includes(art) ? art : null).name, martialArt: techniqueArts(x).includes(art) ? art : x.martialArt }));
      const stepName = steps.map((s) => s.name).join(' → ');
      const name = (norm(stepName) === norm(t.name) ? stepName : `${stepName} (${t.name})`).slice(0, 80);
      const description = (t.description ?? '').trim();
      combos.push({
        sourceRef: `martialdex-db:${t.id}${sequences.length > 1 ? `#${i}` : ''}`,
        recordId: t.id,
        name,
        martialArt: art,
        category,
        purpose: `MARTIALDEX ${artKo} 기술 백과 「${category}」에 수록된 연결 동작`.slice(0, 300),
        description: [description, `출처: MARTIALDEX 기술 DB (${t.source ? '공유 라이브러리' : '공식 기술 문서'}) — ${t.name}`].filter(Boolean).join('\n').slice(0, 2000),
        steps,
      });
    });
  }
  return { combos, skipped };
}
