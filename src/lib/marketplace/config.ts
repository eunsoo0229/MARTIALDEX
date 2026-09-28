import { supabase } from '../supabase/client';

// The platform fee rate is NOT hardcoded here (spec section 8) — it lives in
// exactly one place, the marketplace_config table's single row, readable by
// both this client (for showing an accurate fee/earning preview before a
// sale) and the purchase_marketplace_curriculum() RPC (for computing the
// real fee at purchase time). This constant is only the safe fallback used
// if that row is somehow unreachable (e.g. offline) — never the value
// actually charged, since the RPC always recomputes server-side regardless
// of what the client believes the rate is.
const FALLBACK_FEE_RATE_BP = 1000; // 10.00%

let cachedFeeRateBp: number | null = null;

export async function getPlatformFeeRateBp(): Promise<number> {
  if (cachedFeeRateBp !== null) return cachedFeeRateBp;
  if (!supabase) return FALLBACK_FEE_RATE_BP;
  try {
    const { data, error } = await supabase.from('marketplace_config').select('fee_rate_bp').eq('id', 1).maybeSingle();
    if (error || !data) return FALLBACK_FEE_RATE_BP;
    cachedFeeRateBp = data.fee_rate_bp as number;
    return cachedFeeRateBp;
  } catch {
    return FALLBACK_FEE_RATE_BP;
  }
}

export interface FeeSplit {
  priceKrw: number;
  platformFeeKrw: number;
  sellerEarningKrw: number;
}

/** Integer-only (원 has no fractional subunit) — floor division, same formula the server-side RPC uses, so the client's "예상 수수료/수익" preview always matches what will actually be charged. */
export function computeFeeSplit(priceKrw: number, feeRateBp: number): FeeSplit {
  const price = Math.max(0, Math.round(priceKrw));
  const fee = Math.floor((price * feeRateBp) / 10000);
  return { priceKrw: price, platformFeeKrw: fee, sellerEarningKrw: price - fee };
}
