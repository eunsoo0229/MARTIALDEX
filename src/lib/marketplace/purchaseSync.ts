import { curriculumRepository } from '../curriculum/repository';
import { getMarketplaceCurriculumContent, getMarketplaceListing, listMyPurchaseOrders, claimPurchasedCurriculumLocally } from './service';
import { isStillCurrentUser } from '../cloudSync/syncGuard';

/**
 * Restores purchased curricula on a fresh/other device after login — reads
 * the buyer's own completed orders (RLS already scopes this to just their
 * rows) and materializes any that aren't in this device's local curricula
 * yet. Safe to run on every login: claimPurchasedCurriculumLocally() itself
 * is idempotent (returns the existing local copy instead of duplicating).
 */
export async function syncPurchasedCurricula(userId: string): Promise<{ restored: number }> {
  const ordersResult = await listMyPurchaseOrders(userId);
  if (!ordersResult.ok) return { restored: 0 };

  const localListingIds = new Set(curriculumRepository.listCustom().map((c) => c.marketplaceMeta?.listingId).filter(Boolean));
  const missing = ordersResult.data.filter((o) => (o.status === 'completed' || o.status === 'paid') && !localListingIds.has(o.curriculumId));

  let restored = 0;
  for (const order of missing) {
    const listingResult = await getMarketplaceListing(order.curriculumId);
    if (!listingResult.ok || !listingResult.data) continue;
    const contentResult = await getMarketplaceCurriculumContent(order.curriculumId);
    if (!contentResult.ok || !contentResult.data) continue;
    // Account-switch race guard (see cloudSync/syncGuard.ts) — checked inside
    // the loop, right before the local write, since each iteration has its
    // own real network awaits above.
    if (!(await isStillCurrentUser(userId))) break;
    claimPurchasedCurriculumLocally(listingResult.data, contentResult.data, { orderId: order.id, priceKrw: order.priceKrw });
    restored++;
  }
  return { restored };
}
