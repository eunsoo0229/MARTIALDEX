import { generateCombo } from '../aiCombo/service';
import { createCombo } from '../combo/service';
import type { Combo } from '../combo/types';
import { computeAllSkillProgress } from '../skillProgress/weaknessEngine';
import type { MasteryStatus } from '../skillProgress/types';
import type { SparringSession } from './types';

// Reuses aiCombo/service.ts's generateCombo() (Gemini goal-analysis -> per-
// step real-technique resolution, with Discovery Service fallback for a
// genuinely missing technique) and combo/service.ts's createCombo() wholesale
// — zero new combo-generation logic. The only new thing here is WHERE the
// goal text comes from: deterministic "problem -> solution" seeds built from
// this session's own real patterns/weak areas, never a free-form or random
// combo idea (spec section 10's required 분석→패턴→문제→해결→셋업 order,
// enforced in code below rather than left to an AI prompt's discretion).

const MAX_SETUPS = 5;

interface SetupSeed {
  goalText: string;
  /** The real pattern/weak-area this seed addresses — shown in the saved combo's description so the "why" stays traceable. */
  reasonLabel: string;
}

function buildSeeds(session: SparringSession): SetupSeed[] {
  const seeds: SetupSeed[] = [];
  const seen = new Set<string>();
  function add(goalText: string, reasonLabel: string) {
    if (seen.has(goalText)) return;
    seen.add(goalText);
    seeds.push({ goalText, reasonLabel });
  }

  const patterns = session.sequenceAnalysis?.repeatedPatterns ?? [];
  for (const p of patterns.filter((p) => p.toTechniqueId === null).slice(0, 3)) {
    add(`${p.fromTechniqueName} 다음에 연결할 후속 공격과 각도 변경을 포함한 셋업`, `${p.fromTechniqueName} 후속 공격 부족 (${p.count}회 반복 관찰)`);
  }
  for (const p of patterns.filter((p) => p.toTechniqueId !== null).slice(0, 2)) {
    add(`${p.fromTechniqueName} → ${p.toTechniqueName} 연결을 심화하는 추가 후속 셋업`, `${p.fromTechniqueName} → ${p.toTechniqueName} 연결이 이미 자주 관찰됨 (${p.count}회)`);
  }

  const seq = session.sequenceAnalysis;
  if (seq?.reactiveRatio !== null && seq?.reactiveRatio !== undefined) {
    if (seq.reactiveRatio >= 0.6) {
      add('상대의 움직임을 유도한 뒤 반격하는 카운터 셋업', `상대 동작 직후 반응형으로 공격한 비율 ${Math.round(seq.reactiveRatio * 100)}%`);
    } else if (seq.initiatingRatio !== null && seq.initiatingRatio !== undefined && seq.initiatingRatio >= 0.6) {
      add('선제 공격 이후 상대 반응에 따른 연결 셋업', `선제적으로 먼저 공격한 비율 ${Math.round(seq.initiatingRatio * 100)}%`);
    }
  }

  for (const area of session.weakAreas.slice(0, 3)) {
    add(`${area.label}을(를) 개선하는 실전 셋업`, `약점: ${area.label}${area.score !== null ? ` (${area.score}점)` : ''}`);
  }

  return seeds.slice(0, MAX_SETUPS);
}

function inferDifficulty(techniqueIds: string[], masteryByTechniqueId: Map<string, MasteryStatus>): 'basic' | 'intermediate' | 'advanced' {
  const statuses = techniqueIds.map((id) => masteryByTechniqueId.get(id) ?? 'not_started');
  const unlearned = statuses.filter((s) => s === 'not_started' || s === 'learning').length;
  const ratio = techniqueIds.length > 0 ? unlearned / techniqueIds.length : 0;
  if (ratio >= 0.6) return 'advanced';
  if (ratio >= 0.3) return 'intermediate';
  return 'basic';
}

export interface GeneratedSetup {
  combo: Combo;
  reasonLabel: string;
}

/**
 * Generates up to 5 real, DB-technique-grounded combos seeded from this
 * session's own detected patterns/weak areas, saving each via the existing
 * Combo system so it also shows up in the regular "AI 콤비네이션" list. A
 * seed whose generateCombo() call fails or resolves fewer than 2 real
 * techniques is skipped — never fatal to the other seeds.
 */
export async function generateSparringSetups(session: SparringSession, userId: string | null): Promise<GeneratedSetup[]> {
  const seeds = buildSeeds(session);
  if (seeds.length === 0) return [];

  const masteryByTechniqueId = new Map<string, MasteryStatus>();
  for (const { technique, progress } of computeAllSkillProgress()) masteryByTechniqueId.set(technique.id, progress.status);

  const results: GeneratedSetup[] = [];
  for (const seed of seeds) {
    const outcome = await generateCombo({ freeText: seed.goalText, martialArt: session.martialArt, userId }).catch(() => null);
    if (!outcome || !outcome.ok) continue;
    const preview = outcome.preview;
    const resolvedResults = preview.results.filter((r) => r.techniqueId);
    if (resolvedResults.length < 2) continue;

    const techniqueIds = resolvedResults.map((r) => r.techniqueId!);
    const combo = createCombo({
      name: preview.analysis.summary.replace(/^목적:\s*/, '').slice(0, 40) || seed.goalText.slice(0, 40),
      description: `${seed.reasonLabel} — ${preview.goalText}`,
      techniqueIds,
      aiComboMeta: {
        goalText: preview.goalText,
        stepReasons: resolvedResults.map((r) => r.reason),
        generatedAt: preview.generatedAt,
        analysis: {
          offenseOrDefense: preview.analysis.offenseOrDefense,
          startingSituation: preview.analysis.startingSituation,
          range: preview.analysis.range,
          position: preview.analysis.position,
          finalGoal: preview.analysis.finalGoal,
          stepDetails: resolvedResults.map((r) => ({ opponentReaction: r.step.opponentReaction, followUpIfReacts: r.step.followUpIfReacts })),
          pros: preview.analysis.pros,
          cautions: preview.analysis.cautions,
          complementaryFollowUps: preview.complementaryFollowUps.map((s) => ({ techniqueId: s.techniqueId, techniqueName: s.techniqueName })),
          alternativeTechniques: preview.alternativeTechniques.map((s) => ({ techniqueId: s.techniqueId, techniqueName: s.techniqueName })),
        },
      },
      sourceMeta: { source: 'sparring', sparringSessionId: session.id, difficulty: inferDifficulty(techniqueIds, masteryByTechniqueId) },
    });
    results.push({ combo, reasonLabel: seed.reasonLabel });
  }

  return results;
}
