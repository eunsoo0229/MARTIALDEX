// Mirrors homeTrainingDiscovery/service.ts's stage pipeline exactly in shape
// (search → AI duplicate check → AI verification → generate → second
// duplicate check) — reuses every domain-agnostic building block as-is
// (findNormalizedDuplicate, checkDuplicate, registerDiscoveredTechnique,
// generateUserTechniqueId) — only the gym-specific verification/generation
// prompts are new files.
import type { DuplicateCheckResult, UserTechniqueRecord, VerificationResult } from '../userTechniques/types';
import { checkDuplicate } from '../userTechniques/duplicateCheck';
import { findNormalizedDuplicate } from '../userTechniques/service';
import { generateUserTechniqueId } from '../userTechniques/idGenerator';
import { verifyGymExercise, passesGymVerificationGate } from './verification';
import { generateGymExerciseRecord } from './recordGenerator';
import { GYM_MARTIAL_ART_ID } from '../gymTraining/library';

export interface GymDuplicateStageOutcome {
  ok: true;
  duplicate: DuplicateCheckResult;
}
export type GymDuplicateStageResult = GymDuplicateStageOutcome | { ok: false; message: string };

export async function runGymDuplicateStage(input: { name: string; description?: string }): Promise<GymDuplicateStageResult> {
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
  const outcome = await checkDuplicate({ name: input.name, martialArt: GYM_MARTIAL_ART_ID, description: input.description });
  if (!outcome.ok) return outcome;
  return { ok: true, duplicate: outcome.result };
}

export interface GymVerificationStageSuccess {
  ok: true;
  accepted: true;
  verification: VerificationResult;
  record: UserTechniqueRecord;
}
export interface GymVerificationStageRejected {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  message: string;
}
export interface GymVerificationStageDuplicateFound {
  ok: true;
  accepted: false;
  verification: VerificationResult;
  duplicate: DuplicateCheckResult;
  message: string;
}
export type GymVerificationStageResult =
  | GymVerificationStageSuccess
  | GymVerificationStageRejected
  | GymVerificationStageDuplicateFound
  | { ok: false; message: string };

/**
 * Verification (Google Search grounding) → the elevated gym confidence gate
 * (verification.ts) → canonical-name duplicate re-check → record generation
 * → second duplicate check — in that order, each one able to stop the
 * pipeline. No separate manual/admin review step: passing the grounding
 * gate IS the review.
 */
export async function runGymVerificationStage(input: { name: string; description?: string; userId: string | null }): Promise<GymVerificationStageResult> {
  const verificationOutcome = await verifyGymExercise({ name: input.name, description: input.description });
  if (!verificationOutcome.ok) return { ok: false, message: verificationOutcome.message };
  const verification = verificationOutcome.result;

  if (!passesGymVerificationGate(verification)) {
    return {
      ok: true,
      accepted: false,
      verification,
      message:
        verification.verdict === 'alias_of_existing'
          ? '운동명은 확인되지만 표준 명칭이 아니라 별칭으로 보입니다.'
          : verification.verdict === 'insufficient_evidence'
            ? '검증할 수 있는 자료가 부족합니다.'
            : '이 운동이 실제 헬스/웨이트 트레이닝 운동인지 충분히 확인할 수 없습니다.',
    };
  }

  if (verification.canonicalName && verification.canonicalName.trim().toLowerCase() !== input.name.trim().toLowerCase()) {
    const canonicalCheck = await checkDuplicate({ name: verification.canonicalName, martialArt: GYM_MARTIAL_ART_ID, description: input.description });
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

  const generated = await generateGymExerciseRecord({
    id: generateUserTechniqueId(GYM_MARTIAL_ART_ID, input.name),
    name: input.name,
    description: input.description,
    verifiedCategory: verification.category,
  });
  if (!generated.ok) return { ok: false, message: generated.message };

  const secondCheck = await checkDuplicate({
    name: generated.record.technique.name,
    martialArt: GYM_MARTIAL_ART_ID,
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
