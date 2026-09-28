import type { Technique } from '../../types';
import type { DuplicateCheckResult, UserTechniqueStatus, VerificationResult } from '../userTechniques/types';

/** Same pending/approved/rejected union as UserTechniqueRecord — reused as-is, not a parallel status type. */
export type AddTeqStatus = UserTechniqueStatus;

/**
 * A technique in the SHARED public library (Supabase `add_teq`, migration
 * 0014) — same "Technique + provenance metadata" shape as
 * UserTechniqueRecord (src/lib/userTechniques/types.ts), deliberately
 * mirrored field-for-field so callers that already know how to render/use
 * a UserTechniqueRecord need no new logic for this one. The difference is
 * purely about WHERE it lives and WHO can see it: this is not scoped to
 * the discovering user — any authenticated user can resolve it.
 */
export interface AddTeqRecord {
  id: string;
  technique: Technique;
  status: AddTeqStatus;
  duplicateCheck: DuplicateCheckResult;
  verification: VerificationResult;
  createdAt: string;
  updatedAt: string;
}
