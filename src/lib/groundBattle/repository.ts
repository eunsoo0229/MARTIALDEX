import type { GroundBattleMatchRecord } from './types';

const KEY = 'martialdex:ground-battle-matches';
export const GROUND_BATTLE_MATCHES_EVENT = 'martialdex:ground-battle-matches-updated';

function readAll(): GroundBattleMatchRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GroundBattleMatchRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: GroundBattleMatchRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(GROUND_BATTLE_MATCHES_EVENT));
}

export const groundBattleRepository = {
  list(): GroundBattleMatchRecord[] {
    return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  get(id: string): GroundBattleMatchRecord | undefined {
    return readAll().find((r) => r.id === id);
  },
  save(record: GroundBattleMatchRecord): void {
    const all = readAll();
    const idx = all.findIndex((r) => r.id === record.id);
    if (idx >= 0) all[idx] = record;
    else all.push(record);
    writeAll(all);
  },
  delete(id: string): void {
    writeAll(readAll().filter((r) => r.id !== id));
  },
  upsertMany(records: GroundBattleMatchRecord[]): void {
    if (records.length === 0) return;
    const all = readAll();
    const byId = new Map(all.map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, r);
    writeAll([...byId.values()]);
  },
};
