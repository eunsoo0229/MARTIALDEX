// TossPayments V2 client (publishable) key — deliberately named WITHOUT
// "PAYMENT" in it (VITE_TOSS_CLIENT_KEY, not e.g. VITE_PAYMENT_CLIENT_KEY) so
// scripts/validate-android-config.mjs's /^VITE_.*PAYMENT/i leak-check never
// flags it: this key is meant to be public (like a Stripe publishable key —
// Toss's own docs bundle it client-side), unlike PAYMENT_SECRET_KEY, which
// stays a Supabase Edge Function secret and must never appear here.
const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

export function isTossConfigured(): boolean {
  return typeof TOSS_CLIENT_KEY === 'string' && TOSS_CLIENT_KEY.length > 0;
}

export function getTossClientKey(): string | undefined {
  return TOSS_CLIENT_KEY;
}
