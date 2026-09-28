import type { PoseAnalysisRecord } from './types';

const RECORDS_KEY = 'martialdex:pose-records';

// Same local-first, no-backend shape as curriculum/repository.ts. Only
// structured result data is ever stored here — never a video frame or image.
export interface PoseRecordsRepository {
  list(): PoseAnalysisRecord[];
  listForTechnique(techniqueId: string): PoseAnalysisRecord[];
  add(record: PoseAnalysisRecord): void;
  deleteRecord(recordId: string): void;
  deleteForTechnique(techniqueId: string): void;
  deleteAll(): void;
}

function readAll(): PoseAnalysisRecord[] {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: PoseAnalysisRecord[]) {
  window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('martialdex:pose-records-updated'));
}

class LocalPoseRecordsRepository implements PoseRecordsRepository {
  list(): PoseAnalysisRecord[] {
    return readAll();
  }
  listForTechnique(techniqueId: string): PoseAnalysisRecord[] {
    return readAll().filter((r) => r.techniqueId === techniqueId);
  }
  add(record: PoseAnalysisRecord): void {
    writeAll([...readAll(), record]);
  }
  deleteRecord(recordId: string): void {
    writeAll(readAll().filter((r) => r.recordId !== recordId));
  }
  deleteForTechnique(techniqueId: string): void {
    writeAll(readAll().filter((r) => r.techniqueId !== techniqueId));
  }
  deleteAll(): void {
    writeAll([]);
  }
}

export const poseRecordsRepository: PoseRecordsRepository = new LocalPoseRecordsRepository();
