import type { Tactic } from './types';
import { tacticRepository } from './repository';
import { resolveTechnique } from '../userTechniques/service';

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `tactic__${rand}`;
}

export function listMyTactics(): Tactic[] {
  return tacticRepository.list();
}

export function getTactic(id: string): Tactic | undefined {
  return tacticRepository.get(id);
}

export interface TacticValidationResult {
  ok: boolean;
  errors: string[];
}

/** Every technique id must resolve to a real technique (official or user-added) — never trusts a caller-supplied id blindly. */
export function validateTactic(name: string, situation: string, techniqueIds: string[]): TacticValidationResult {
  const errors: string[] = [];
  if (!name.trim()) errors.push('전술 이름을 입력해주세요.');
  if (!situation.trim()) errors.push('IF 상황을 입력해주세요.');
  if (techniqueIds.length === 0) errors.push('최소 1개 이상의 대응 기술을 추가해주세요.');
  for (const id of techniqueIds) {
    if (!resolveTechnique(id)) errors.push(`존재하지 않는 기술 id입니다: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function createTactic(input: { name: string; situation: string; techniqueIds: string[] }): Tactic {
  const now = new Date().toISOString();
  const tactic: Tactic = {
    id: newId(),
    userId: null,
    name: input.name.trim(),
    situation: input.situation.trim(),
    techniqueIds: input.techniqueIds,
    feedback: null,
    feedbackGeneratedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  tacticRepository.save(tactic);
  return tactic;
}

export function updateTactic(
  tactic: Tactic,
  patch: { name?: string; situation?: string; techniqueIds?: string[] }
): Tactic {
  // Editing the substance of a tactic invalidates any previously generated
  // feedback (it was commentary on the OLD situation/technique sequence) —
  // never leave stale AI commentary attached to content it never actually saw.
  const substanceChanged =
    (patch.situation !== undefined && patch.situation.trim() !== tactic.situation) ||
    (patch.techniqueIds !== undefined && JSON.stringify(patch.techniqueIds) !== JSON.stringify(tactic.techniqueIds));

  const updated: Tactic = {
    ...tactic,
    name: patch.name !== undefined ? patch.name.trim() : tactic.name,
    situation: patch.situation !== undefined ? patch.situation.trim() : tactic.situation,
    techniqueIds: patch.techniqueIds ?? tactic.techniqueIds,
    feedback: substanceChanged ? null : tactic.feedback,
    feedbackGeneratedAt: substanceChanged ? null : tactic.feedbackGeneratedAt,
    updatedAt: new Date().toISOString(),
  };
  tacticRepository.save(updated);
  return updated;
}

export function deleteTactic(id: string): void {
  tacticRepository.delete(id);
}

export function saveTacticFeedback(tactic: Tactic, feedback: string): Tactic {
  const updated: Tactic = { ...tactic, feedback, feedbackGeneratedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  tacticRepository.save(updated);
  return updated;
}
