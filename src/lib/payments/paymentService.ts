import { supabase } from '../supabase/client';
import { toKoreanAuthMessage } from '../auth/authErrors';
import type { AuthResult } from '../auth/authService';
import { claimPurchasedCurriculumLocally, getMarketplaceCurriculumContent, getMarketplaceListing } from '../marketplace/service';
import type { Curriculum } from '../curriculum/types';
import { testPaymentProvider } from './testPaymentProvider';
import type { ConfirmedOrder, PaymentProvider, PaymentUiPrompt, PendingOrder } from './types';

const NOT_CONFIGURED = 'Supabase 설정이 필요합니다.';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * The single swap point (spec section 2/11) — every platform (Electron IPC
 * has no role here at all; this only ever talks to the payment-verify Edge
 * Function over plain HTTPS, so Electron/Android/Web behave identically).
 * Returns testPaymentProvider until a real PG is under contract — see
 * realPaymentProvider.ts's own comment for what changes here once one is.
 */
function getActivePaymentProvider(): PaymentProvider {
  return testPaymentProvider;
}

interface EdgeFunctionResult<T> {
  ok: boolean;
  code?: string;
  message?: string;
  order?: T;
}

async function callPaymentVerify<T>(action: string, params: Record<string, unknown>): Promise<AuthResult<T>> {
  if (!supabase || !SUPABASE_URL) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return { ok: false, message: '결제 기능을 사용하려면 먼저 로그인해주세요.' };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY ?? '', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action, ...params }),
    });
    const json = (await res.json()) as EdgeFunctionResult<T>;
    if (!json.ok) return { ok: false, message: json.message ?? '결제 요청을 처리하지 못했습니다.' };
    return { ok: true, data: json.order as T };
  } catch (e) {
    return { ok: false, message: toKoreanAuthMessage(e) };
  }
}

export type PurchaseFlowResult =
  | { status: 'already_purchased'; order: PendingOrder; curriculum: Curriculum | null }
  | { status: 'paid'; order: ConfirmedOrder; curriculum: Curriculum }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export type StartOrderResult =
  | { status: 'ready'; order: PendingOrder }
  | { status: 'already_purchased'; order: PendingOrder; curriculum: Curriculum | null }
  | { status: 'failed'; message: string };

/**
 * Step 1 of the pipeline in isolation — "결제창을 열기 위한 주문 생성" plus
 * the already-purchased short-circuit. Shared by the in-page test-payment
 * pipeline below AND tossCheckout.ts's redirect-based flow (Toss's own
 * checkout page owns everything after this point, so it needs order
 * creation without the rest of purchaseCurriculumWithPayment).
 */
export async function startPurchaseOrder(curriculumId: string): Promise<StartOrderResult> {
  const pendingResult = await callPaymentVerify<PendingOrder>('create_pending', { curriculumId });
  if (!pendingResult.ok) return { status: 'failed', message: pendingResult.message };
  const order = pendingResult.data;

  if (order.alreadyPurchased || order.status === 'paid' || order.status === 'completed') {
    const curriculum = await materializeIfNeeded(curriculumId, order);
    return { status: 'already_purchased', order, curriculum };
  }
  return { status: 'ready', order };
}

/**
 * The full UI → Payment Service → PG Provider → 결제승인 → 서버 검증 →
 * 주문 상태 변경 → 구매 권한 부여 pipeline (spec section 1), platform-agnostic.
 * `promptUi` is supplied by the calling page (renders PaymentModal) so this
 * function has zero React/DOM dependency — the exact contract a future
 * realPaymentProvider would also receive (and likely ignore, opening its
 * own PG checkout instead). Only used for TestPaymentProvider / free items —
 * a real Toss checkout goes through tossCheckout.ts + MarketplacePaymentResult
 * instead, since Toss's own checkout page requires a full-page redirect that
 * can't resolve a Promise in this same page load.
 */
export async function purchaseCurriculumWithPayment(curriculumId: string, promptUi: PaymentUiPrompt): Promise<PurchaseFlowResult> {
  const start = await startPurchaseOrder(curriculumId);
  if (start.status === 'failed') return start;
  if (start.status === 'already_purchased') return start;
  const order = start.order;

  const provider = getActivePaymentProvider();
  const outcome = await provider.collectPayment(order, promptUi);

  if (outcome.outcome === 'cancelled') {
    await callPaymentVerify('cancel', { orderId: order.orderId, reason: '사용자가 결제를 취소함' });
    return { status: 'cancelled' };
  }
  if (outcome.outcome === 'failed') {
    await callPaymentVerify('simulate_failure', { orderId: order.orderId, reason: outcome.reason });
    return { status: 'failed', message: outcome.reason };
  }

  const confirmResult = await callPaymentVerify<ConfirmedOrder>('confirm', { orderId: order.orderId, providerReceipt: outcome.providerReceipt });
  if (!confirmResult.ok) return { status: 'failed', message: confirmResult.message };
  if (confirmResult.data.status !== 'paid' && confirmResult.data.status !== 'completed') {
    return { status: 'failed', message: '결제 승인 확인에 실패했습니다.' };
  }

  const curriculum = await materializeIfNeeded(curriculumId, order);
  if (!curriculum) return { status: 'failed', message: '결제는 완료되었지만 커리큘럼 내용을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' };
  return { status: 'paid', order: confirmResult.data, curriculum };
}

async function materializeIfNeeded(curriculumId: string, order: { orderId: string; priceKrw: number }): Promise<Curriculum | null> {
  const listingResult = await getMarketplaceListing(curriculumId);
  if (!listingResult.ok || !listingResult.data) return null;
  const contentResult = await getMarketplaceCurriculumContent(curriculumId);
  if (!contentResult.ok || !contentResult.data) return null;
  return claimPurchasedCurriculumLocally(listingResult.data, contentResult.data, order);
}

export async function requestRefund(orderId: string): Promise<AuthResult<{ status: string }>> {
  return callPaymentVerify('refund', { orderId });
}

export type TossConfirmResult = { status: 'paid'; curriculum: Curriculum } | { status: 'failed'; message: string };

/**
 * Called from MarketplacePaymentResult.tsx after Toss redirects the browser
 * back to successUrl with `paymentKey`/`orderId`/`amount` query params —
 * this is the ONLY place a Toss-driven purchase reaches 'paid': it hands
 * paymentKey to the SAME 'confirm' edge-function action the test-payment
 * pipeline above uses (as providerReceipt), so the server-side
 * paymentKey/orderId/amount verification (payment-verify's verifyWithPg)
 * is identical regardless of which provider produced the receipt. Never
 * grants access itself — materializeIfNeeded only runs after the server
 * confirms 'paid'/'completed'.
 */
export async function confirmTossPayment(curriculumId: string, orderId: string, paymentKey: string): Promise<TossConfirmResult> {
  const confirmResult = await callPaymentVerify<ConfirmedOrder>('confirm', { orderId, providerReceipt: paymentKey });
  if (!confirmResult.ok) return { status: 'failed', message: confirmResult.message };
  if (confirmResult.data.status !== 'paid' && confirmResult.data.status !== 'completed') {
    return { status: 'failed', message: '결제 승인 확인에 실패했습니다.' };
  }
  const curriculum = await materializeIfNeeded(curriculumId, { orderId, priceKrw: confirmResult.data.priceKrw });
  if (!curriculum) return { status: 'failed', message: '결제는 완료되었지만 커리큘럼 내용을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' };
  return { status: 'paid', curriculum };
}

/** Toss redirected to failUrl, or requestPayment() itself rejected before any redirect (e.g. the user closed the checkout overlay) — either way, mark the order failed server-side so it never lingers as 'pending'. */
export async function reportTossPaymentFailure(orderId: string, reason: string): Promise<void> {
  await callPaymentVerify('simulate_failure', { orderId, reason });
}
