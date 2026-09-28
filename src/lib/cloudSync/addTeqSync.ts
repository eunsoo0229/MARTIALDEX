import { pullAddTeqFromCloud } from '../addTeq/service';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';

// Unlike every other cloudSync/* module, this is PULL-ONLY — add_teq is a
// shared/public library, not this user's own data, so there is nothing of
// theirs to push. Refreshing the local cache on every login keeps every
// synchronous resolver (resolveTechnique/searchAllTechniques, used all over
// the app's render paths) reasonably fresh with what OTHER users/devices
// have discovered, matching every other feature's "sync automatically on
// login" convention (see LocalDataMigrationPrompt.tsx).
export async function syncAddTeqFromCloud(): Promise<AuthResult<{ pulled: number }>> {
  const result = await pullAddTeqFromCloud();
  if (!result.ok) return { ok: false, message: toKoreanAuthMessage(result.message) };
  return { ok: true, data: { pulled: result.count } };
}
