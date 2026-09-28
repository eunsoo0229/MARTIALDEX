// Payment abstraction — see supabase/functions/payment-verify/index.ts for
// the server side. The shape here is deliberately PG-agnostic: swapping
// TestPaymentProvider for a real one later means writing one new file that
// implements PaymentProvider, never touching paymentService.ts, the Edge
// Function's request/response contract, or any UI page that calls
// purchaseCurriculumWithPayment().

export type OrderStatus = 'pending' | 'completed' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface PendingOrder {
  orderId: string;
  curriculumId: string;
  priceKrw: number;
  platformFeeKrw: number;
  sellerEarningKrw: number;
  status: OrderStatus;
  alreadyPurchased: boolean;
}

export interface ConfirmedOrder {
  orderId: string;
  curriculumId: string;
  priceKrw: number;
  platformFeeKrw: number;
  sellerEarningKrw: number;
  status: OrderStatus;
  paidAt: string | null;
}

export type PaymentOutcome =
  | { outcome: 'confirmed'; providerReceipt?: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; reason: string };

/**
 * UI callback the page supplies so PaymentProvider never depends on React
 * (or any specific UI framework) — for the test provider this shows
 * PaymentModal and resolves with the user's choice; a real provider would
 * instead open that PG's checkout SDK/redirect and resolve once the PG's
 * own flow completes, never calling this at all.
 */
export type PaymentUiPrompt = (order: PendingOrder) => Promise<PaymentOutcome>;

export interface PaymentProvider {
  readonly id: string;
  /** Drives whatever client-side PG interaction this provider needs and returns what the user/PG decided — NEVER treated as "payment succeeded" by itself; paymentService always sends the result to the server for verification before anything unlocks. */
  collectPayment(order: PendingOrder, promptUi: PaymentUiPrompt): Promise<PaymentOutcome>;
}
