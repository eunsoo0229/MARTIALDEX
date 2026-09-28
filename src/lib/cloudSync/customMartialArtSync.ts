import { pullCustomMartialArtsFromCloud } from '../customMartialArt/service';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';

// Same PULL-ONLY shape as cloudSync/addTeqSync.ts — custom_martial_arts is a
// shared/public registry, not this user's own data. Refreshing the local
// cache on every login keeps getUnifiedMartialArtSummaries()/
// getUnifiedMartialArt() (called synchronously all over the app's render
// paths) reasonably fresh with martial arts other users have added.
export async function syncCustomMartialArtsFromCloud(): Promise<AuthResult<{ pulled: number }>> {
  const result = await pullCustomMartialArtsFromCloud();
  if (!result.ok) return { ok: false, message: toKoreanAuthMessage(result.message) };
  return { ok: true, data: { pulled: result.count } };
}
