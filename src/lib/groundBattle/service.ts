import { computeAllSkillProgress, type TechniqueSkillEntry } from '../skillProgress/weaknessEngine';
import { listTrainingHistory, recordTrainingSession } from '../trainingHistory/service';
import { DIFFICULTY_LABEL, OUTCOME_LABEL } from './types';
import type { CuratedGroundTechnique, GroundBattleMatchRecord, GroundBattleRunState } from './types';
import { CURATED_GROUND_TECHNIQUES } from './curatedRoster';
import { groundBattleRepository } from './repository';

const GROUND_BATTLE_MARTIAL_ART = 'bjj';

/** Intersects the player's REAL learned BJJ techniques (SkillProgress.status !== 'not_started') with the curated ground-battle roster — never lets an unlearned technique through. Takes the entries so a React caller can pass useAllSkillProgress()'s reactive result. */
export function rosterFromSkillEntries(entries: TechniqueSkillEntry[]): CuratedGroundTechnique[] {
  const learnedIds = new Set(
    entries.filter(({ technique, progress }) => technique.martialArt === GROUND_BATTLE_MARTIAL_ART && progress.status !== 'not_started').map(({ technique }) => technique.id)
  );
  return CURATED_GROUND_TECHNIQUES.filter((t) => learnedIds.has(t.techniqueId));
}

export function getPlayerGroundBattleRoster(): CuratedGroundTechnique[] {
  return rosterFromSkillEntries(computeAllSkillProgress());
}

function buildRecordFrom(run: GroundBattleRunState): GroundBattleMatchRecord {
  const now = new Date().toISOString();
  return {
    id: run.id,
    difficulty: run.difficulty,
    mode: run.mode,
    outcome: run.outcome,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? now,
    turnCount: run.turnLog.length,
    turnLog: run.turnLog,
    createdAt: now,
    updatedAt: now,
  };
}

/** Mirrors sparringSession/service.ts's finalizeSparringSession() exactly: saves the local record, then links exactly ONE training_history entry (idempotent via groundBattleMatchId, so a double-call never double-writes). */
export function finalizeGroundBattleMatch(run: GroundBattleRunState): GroundBattleMatchRecord {
  const existing = groundBattleRepository.get(run.id);
  const record: GroundBattleMatchRecord = existing ? { ...buildRecordFrom(run), createdAt: existing.createdAt } : buildRecordFrom(run);
  groundBattleRepository.save(record);

  const alreadyLinked = listTrainingHistory().some((e) => e.groundBattleMatchId === record.id);
  if (!alreadyLinked && run.outcome) {
    const playerTechniqueIds = [...new Set(run.turnLog.filter((e) => e.actor === 'player').map((e) => e.techniqueId))];
    recordTrainingSession({
      curriculumId: null,
      dayNumber: null,
      techniqueIds: playerTechniqueIds,
      completed: true,
      estimatedMinutes: 1,
      actualMinutes: Math.max(1, Math.round(run.turnLog.length / 4)),
      notes: `그라운드 배틀 · ${OUTCOME_LABEL[run.outcome]} · ${DIFFICULTY_LABEL[run.difficulty]}`,
      source: 'ground_battle',
      groundBattleMatchId: record.id,
    });
  }
  return record;
}

export function listGroundBattleMatches(): GroundBattleMatchRecord[] {
  return groundBattleRepository.list();
}

export function getGroundBattleMatch(id: string): GroundBattleMatchRecord | undefined {
  return groundBattleRepository.get(id);
}

export function deleteGroundBattleMatch(id: string): void {
  groundBattleRepository.delete(id);
}
