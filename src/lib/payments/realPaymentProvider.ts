import type { PaymentOutcome, PaymentProvider, PaymentUiPrompt, PendingOrder } from './types';

/**
 * SCAFFOLD ONLY — not wired up, not selectable yet (see paymentService.ts's
 * getActivePaymentProvider(), which always returns testPaymentProvider
 * today). This exists to prove the swap point is real: once a PG is under
 * contract, implement collectPayment() below to open that PG's checkout
 * SDK/redirect with order.priceKrw (the SERVER-computed amount — never
 * invent or accept a different one here), and return { outcome: 'confirmed',
 * providerReceipt } with whatever transaction id the PG hands back. Nothing
 * else in the app changes — paymentService.ts, the Edge Function's request
 * shape, the Postgres RPCs, and every page that calls
 * purchaseCurriculumWithPayment() all stay exactly as they are.
 *
 * The `promptUi` parameter is intentionally UNUSED here — a real PG almost
 * always supplies its own checkout UI (redirect or SDK popup) instead of
 * this app's PaymentModal, so this provider would drive that PG's own flow
 * directly rather than calling promptUi at all.
 */
export const realPaymentProvider: PaymentProvider = {
  id: 'real',
  async collectPayment(_order: PendingOrder, _promptUi: PaymentUiPrompt): Promise<PaymentOutcome> {
    throw new Error('실제 결제 서비스가 아직 연결되지 않았습니다. PG 사업자 선정 및 계약 후 구현이 필요합니다.');
  },
};
