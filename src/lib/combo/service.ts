import type { Combo } from './types';
import { comboRepository } from './repository';
import { resolveTechnique } from '../userTechniques/service';

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `combo__${rand}`;
}

export function listMyCombos(): Combo[] {
  return comboRepository.list();
}

export function getCombo(id: string): Combo | undefined {
  return comboRepository.get(id);
}

export interface ComboValidationResult {
  ok: boolean;
  errors: string[];
}

/** Every id must resolve to a real technique (official or user-added) — never trusts a caller-supplied id blindly (spec section 1/6). */
export function validateCombo(name: string, techniqueIds: string[]): ComboValidationResult {
  const errors: string[] = [];
  if (!name.trim()) errors.push('콤보 이름을 입력해주세요.');
  if (techniqueIds.length < 2) errors.push('최소 2개 이상의 기술을 연결해주세요.');
  for (const id of techniqueIds) {
    if (!resolveTechnique(id)) errors.push(`존재하지 않는 기술 id입니다: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function createCombo(input: {
  name: string;
  description: string;
  techniqueIds: string[];
  aiComboMeta?: Combo['aiComboMeta'];
  sourceMeta?: Combo['sourceMeta'];
  visualMittMeta?: Combo['visualMittMeta'];
  sharedMeta?: Combo['sharedMeta'];
}): Combo {
  const now = new Date().toISOString();
  const combo: Combo = {
    id: newId(),
    userId: null,
    name: input.name.trim(),
    description: input.description.trim(),
    techniqueIds: input.techniqueIds,
    createdAt: now,
    updatedAt: now,
    ...(input.aiComboMeta ? { aiComboMeta: input.aiComboMeta } : {}),
    ...(input.sourceMeta ? { sourceMeta: input.sourceMeta } : {}),
    ...(input.visualMittMeta ? { visualMittMeta: input.visualMittMeta } : {}),
    ...(input.sharedMeta ? { sharedMeta: input.sharedMeta } : {}),
  };
  comboRepository.save(combo);
  return combo;
}

export function updateCombo(combo: Combo, patch: { name?: string; description?: string; techniqueIds?: string[] }): Combo {
  const updated: Combo = {
    ...combo,
    name: patch.name !== undefined ? patch.name.trim() : combo.name,
    description: patch.description !== undefined ? patch.description.trim() : combo.description,
    techniqueIds: patch.techniqueIds ?? combo.techniqueIds,
    updatedAt: new Date().toISOString(),
  };
  comboRepository.save(updated);
  return updated;
}

export function deleteCombo(id: string): void {
  comboRepository.delete(id);
}
