// Mirrors userTechniques/service.ts's runDuplicateStage/runVerificationStage
// pipeline (search → AI duplicate check → AI verification → generate →
// second duplicate check) exactly in shape — split into stages, not one
// atomic call, so the UI can show a distinct "이미 있음"/"확인 어려움"/
// "미리보기" step before the user explicitly registers anything, same as
// RequestTechnique.tsx. Reuses every domain-agnostic building block as-is
// (findNormalizedDuplicate, checkDuplicate, registerDiscoveredTechnique,
// generateUserTechniqueId, pullAddTeqFromCloud) — only the exercise-specific
// verification/generation prompts are new files.
import type { DuplicateCheckResult, UserTechniqueRecord, VerificationResult } from '../userTechniques/types';
import { checkDuplicate } from '../userTechniques/duplicateCheck';
import { findNormalizedDuplicate } from '../userTechniques/service';
import { generateUserTechniqueId } from '../userTechniques/idGenerator';
import { verifyExercise, passesExerciseVerificationGate } from './verification';
import { generateExerciseRecord } from './recordGenerator';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../homeTraining/library';

export interface ExerciseDuplicateStageOutcome {
  ok: true;
  duplicate: DuplicateCheckResult;
}
export type ExerciseDuplicateStageResult = ExerciseDuplicateStageOutcome | { ok: false; message: string };

export async function runExerciseDuplicateStage(input: { name: string; description?: string }): Promise<ExerciseDuplicateStageResult> {
  // Free exhaustive local search first (built-in library + add_teq +
  // user_techniques, zero API cost) — mirrors checkDuplicate's own first
  // step, but short-circuits before even calling it.
  const exact = findNormalizedDuplicate(input.name);
  if (exact) {
    return {
      ok: true,
      duplicate: {
        isDuplicate: true,
        matchedTechniqueId: exact.id,
        matchedTechniqueName: exact.name,
        reason: `기존 운동 '${exact.name}'과 이름이 일치합니다.`,
      },
    };
  }
  const outcome = await checkDuplicate({ name: input.name, martialArt: HOME_TRAINING_MARTIAL_ART_ID, description: input.description });
  if (!outcome.ok) return outcome;
  return { ok: true, duplicate: outcome.result };
}

export interface ExerciseVerificationStageSuccess {
  ok: true;
  accepted: true;
  verification: VerificationResult;
  record: UserTechniqueRecord;
}
export interface ExerciseVerificationStageRejected {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  message: string;
}
export interface ExerciseVerificationStageDuplicateFound {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  duplicate: DuplicateCheckResult;
  message: string;
}
export type ExerciseVerificationStageResult =
  | ExerciseVerificationStageSuccess
  | ExerciseVerificationStageRejected
  | ExerciseVerificationStageDuplicateFound
  | { ok: false; message: string };

/**
 * Verification (Google Search grounding) → the higher exercise confidence
 * gate (verification.ts) → canonical-name duplicate re-check → record
 * generation → second duplicate check — in that order, each one able to
 * stop the pipeline. No separate manual/admin review step: passing the
 * grounding gate IS the review, so a record that reaches the success case
 * is already built with status 'approved'.
 */
export async function runExerciseVerificationStage(input: { name: string; description?: string; userId: string | null }): Promise<ExerciseVerificationStageResult> {
  const verificationOutcome = await verifyExercise({ name: input.name, description: input.description });
  if (!verificationOutcome.ok) return { ok: false, message: verificationOutcome.message };
  const verification = verificationOutcome.result;

  if (!passesExerciseVerificationGate(verification)) {
    return {
      ok: true,
      accepted: false,
      verification,
      message:
        verification.verdict === 'alias_of_existing'
          ? '운동명은 확인되지만 표준 명칭이 아니라 별칭으로 보입니다.'
          : verification.verdict === 'insufficient_evidence'
            ? '검증할 수 있는 자료가 부족합니다.'
            : '이 운동이 실제로 존재하는지 충분히 확인할 수 없습니다.',
    };
  }

  if (verification.canonicalName && verification.canonicalName.trim().toLowerCase() !== input.name.trim().toLowerCase()) {
    const canonicalCheck = await checkDuplicate({ name: verification.canonicalName, martialArt: HOME_TRAINING_MARTIAL_ART_ID, description: input.description });
    if (canonicalCheck.ok && canonicalCheck.result.isDuplicate) {
      return {
        ok: true,
        accepted: false,
        verification,
        duplicate: canonicalCheck.result,
        message: `입력하신 운동명("${input.name}")은 기존 운동 "${canonicalCheck.result.matchedTechniqueName}"의 다른 표기로 보입니다.`,
      };
    }
  }

  const generated = await generateExerciseRecord({
    id: generateUserTechniqueId(HOME_TRAINING_MARTIAL_ART_ID, input.name),
    name: input.name,
    description: input.description,
    verifiedCategory: verification.category,
  });
  if (!generated.ok) return { ok: false, message: generated.message };

  const secondCheck = await checkDuplicate({
    name: generated.record.technique.koreanName || generated.record.technique.name,
    martialArt: HOME_TRAINING_MARTIAL_ART_ID,
    description: generated.record.technique.description,
  });
  if (secondCheck.ok && secondCheck.result.isDuplicate) {
    return {
      ok: true,
      accepted: false,
      verification,
      duplicate: secondCheck.result,
      message: '검증된 운동명이 기존 운동과 매우 유사합니다. 새 운동으로 등록하지 않습니다.',
    };
  }

  const record: UserTechniqueRecord = {
    id: generated.record.technique.id,
    technique: generated.record.technique,
    status: 'approved',
    addedByUserId: input.userId,
    duplicateCheck: secondCheck.ok ? secondCheck.result : { isDuplicate: false, matchedTechniqueId: null, matchedTechniqueName: null, reason: '' },
    verification,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { ok: true, accepted: true, verification, record };
}
