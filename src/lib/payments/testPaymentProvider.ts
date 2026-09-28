import type { PaymentOutcome, PaymentProvider, PaymentUiPrompt, PendingOrder } from './types';

/**
 * Sandbox provider — real money never moves. All it does is hand control to
 * whatever UI the caller supplies (PaymentModal, in this app) and forward
 * that UI's result unchanged. The "결제 승인" step a real PG's SDK would
 * perform client-side happens entirely on the SERVER instead, in
 * payment-verify's 'confirm' action — this provider never marks anything as
 * paid itself, it only produces the same-shaped result a real provider
 * would (confirmed/cancelled/failed) for paymentService to send for
 * verification.
 */
export const testPaymentProvider: PaymentProvider = {
  id: 'test',
  async collectPayment(order: PendingOrder, promptUi: PaymentUiPrompt): Promise<PaymentOutcome> {
    const result = await promptUi(order);
    if (result.outcome === 'confirmed') {
      return { outcome: 'confirmed', providerReceipt: 'TEST_RECEIPT' };
    }
    return result;
  },
};
