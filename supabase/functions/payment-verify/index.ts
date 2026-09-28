// Supabase Edge Function — the ONLY place in the whole system that may push
// a marketplace order to 'paid' (see migration 0010_payments.sql's
// finalize_marketplace_order: that transition is rejected unless the caller
// holds the service_role key, which lives ONLY here — never in the
// Electron/Android/Web client bundle, per spec section 8/10/11).
//
// This mirrors gemini-ask/index.ts and youtube-search/index.ts's shape
// exactly: same CORS headers, same "verify the caller's own Supabase JWT
// before doing anything" gate, same jsonResponse/errorResult convention.
//
// TossPayments V2 server-side confirmation lives in verifyWithPg() below:
// when PAYMENT_SECRET_KEY (a Supabase Edge Function secret — never in any
// client bundle) is unset, this stays in test/sandbox no-op mode exactly as
// before (TestPaymentProvider); once it's set, verifyWithPg() calls Toss's
// POST /v1/payments/confirm and cross-checks orderId/amount/status before
// anything is allowed to reach 'paid'. Everything else (auth gate, order
// lookup, RPC calls, response shape) is unchanged either way.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PaymentErrorCode =
  | 'UNAUTHORIZED'
  | 'LISTING_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'NOT_YOUR_ORDER'
  | 'ORDER_NOT_PENDING'
  | 'PG_VERIFICATION_FAILED'
  | 'UNKNOWN';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
function errorResult(code: PaymentErrorCode, message: string) {
  return { ok: false, code, message };
}

interface RequestBody {
  action: 'create_pending' | 'confirm' | 'cancel' | 'simulate_failure' | 'refund';
  curriculumId?: string;
  orderId?: string;
  /** Opaque, provider-specific confirmation the client received from its PaymentProvider step — for the test provider this is a fixed placeholder; a real provider would put its transaction/receipt id here. Never trusted on its own, only used as a lookup key when a real PG's confirm API is wired in. */
  providerReceipt?: string;
  reason?: string;
}

function isRequestBody(v: unknown): v is RequestBody {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return typeof b.action === 'string';
}

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

/**
 * Where a real PG integration's server-to-server verification call goes.
 * Never trust the client's own "success" claim — always ask the PG itself.
 * PAYMENT_SECRET_KEY lives only in this function's Supabase secrets
 * (`supabase secrets set PAYMENT_SECRET_KEY=...`), never in .env's
 * VITE_-prefixed vars, never logged, never returned to the client.
 *
 * providerReceipt here is TossPayments' `paymentKey` (the client only ever
 * learns this from Toss's own successUrl redirect query params — it is
 * never derived or guessed client-side). orderId/expectedAmountKrw both
 * come from OUR OWN trusted order row (never from client input) — Toss's
 * response is cross-checked against them, not the other way around.
 */
async function verifyWithPg(orderId: string, providerReceipt: string | undefined, expectedAmountKrw: number): Promise<{ ok: true; paymentKey: string } | { ok: false; message: string }> {
  const secretKey = Deno.env.get('PAYMENT_SECRET_KEY');
  if (!secretKey) {
    // No PG under contract yet — test/sandbox mode (TestPaymentProvider).
    // The order itself was already created server-side with the real
    // listing price (see create_pending_marketplace_order), so there is
    // nothing further to "verify" against here; this branch is what the
    // real Toss call below replaces once PAYMENT_SECRET_KEY is set.
    return { ok: true, paymentKey: providerReceipt ?? 'TEST_RECEIPT' };
  }
  if (!providerReceipt) {
    return { ok: false, message: '결제 승인에 필요한 정보(paymentKey)가 없습니다.' };
  }

  let json: Record<string, unknown>;
  let res: Response;
  try {
    res = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${secretKey}:`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey: providerReceipt, orderId, amount: expectedAmountKrw }),
    });
    json = await res.json();
  } catch {
    return { ok: false, message: '결제 승인 서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.' };
  }

  if (!res.ok) {
    const message = typeof json.message === 'string' ? json.message : '결제 승인에 실패했습니다.';
    return { ok: false, message };
  }
  // Cross-check Toss's own response against OUR trusted values — never
  // trust orderId/amount the client sent, only what's in orderRow already.
  if (json.orderId !== orderId || json.totalAmount !== expectedAmountKrw || json.status !== 'DONE') {
    return { ok: false, message: '결제 승인 정보가 주문 내용과 일치하지 않습니다.' };
  }
  return { ok: true, paymentKey: providerReceipt };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse(errorResult('UNKNOWN', 'POST 요청만 허용됩니다.'), 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse(errorResult('UNAUTHORIZED', '결제 기능을 사용하려면 로그인이 필요합니다.'), 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(errorResult('UNKNOWN', '서버 설정 오류입니다. 관리자에게 문의해주세요.'), 500);
  }

  // Acts AS the calling user for reads/writes that must stay scoped to them
  // (RLS + auth.uid() inside the RPCs below resolve to this user).
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse(errorResult('UNAUTHORIZED', '로그인 세션이 유효하지 않습니다. 다시 로그인해주세요.'), 401);
  }

  // Holds the service_role key — the ONLY caller that can ever push an order
  // to 'paid' (finalize_marketplace_order rejects that transition from
  // anyone else, see migration 0010). Used exclusively for the 'confirm'
  // action's final write, after this function's own PG-approval check above.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(errorResult('UNKNOWN', '요청 형식이 올바르지 않습니다.'), 400);
  }
  if (!isRequestBody(body)) return jsonResponse(errorResult('UNKNOWN', '요청 형식이 올바르지 않습니다.'), 400);

  try {
    if (body.action === 'create_pending') {
      if (!body.curriculumId) return jsonResponse(errorResult('UNKNOWN', '커리큘럼 id가 필요합니다.'), 400);
      const { data, error } = await userClient.rpc('create_pending_marketplace_order', { p_curriculum_id: body.curriculumId });
      if (error) return jsonResponse(mapRpcError(error.message), 400);
      const row = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ ok: true, order: rowToOrder(row) });
    }

    if (body.action === 'confirm') {
      if (!body.orderId) return jsonResponse(errorResult('UNKNOWN', '주문 id가 필요합니다.'), 400);

      // Look up the pending order (scoped to this user via RLS) to know the
      // real amount to verify against — never trust anything the client
      // sends about price here.
      const { data: orderRow, error: orderErr } = await userClient.from('marketplace_orders').select('*').eq('id', body.orderId).maybeSingle();
      if (orderErr) return jsonResponse(errorResult('UNKNOWN', '주문을 조회하지 못했습니다.'), 400);
      if (!orderRow) return jsonResponse(errorResult('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.'), 404);
      if (orderRow.status === 'paid' || orderRow.status === 'completed') {
        return jsonResponse({ ok: true, order: rowToOrder(orderRow) }); // already finalized — idempotent
      }
      if (orderRow.status !== 'pending') {
        return jsonResponse(errorResult('ORDER_NOT_PENDING', '이미 처리된 주문입니다.'), 409);
      }

      const pgResult = await verifyWithPg(body.orderId, body.providerReceipt, orderRow.price_krw);
      if (!pgResult.ok) {
        await serviceClient.rpc('finalize_marketplace_order', { p_order_id: body.orderId, p_new_status: 'failed', p_reason: pgResult.message });
        return jsonResponse(errorResult('PG_VERIFICATION_FAILED', pgResult.message), 402);
      }

      const { data, error } = await serviceClient.rpc('finalize_marketplace_order', { p_order_id: body.orderId, p_new_status: 'paid', p_payment_key: pgResult.paymentKey });
      if (error) return jsonResponse(mapRpcError(error.message), 400);
      const row = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ ok: true, order: { ...rowToOrder(orderRow), status: row.status, paidAt: row.paid_at } });
    }

    if (body.action === 'cancel' || body.action === 'simulate_failure') {
      if (!body.orderId) return jsonResponse(errorResult('UNKNOWN', '주문 id가 필요합니다.'), 400);
      const newStatus = body.action === 'cancel' ? 'cancelled' : 'failed';
      const { data, error } = await userClient.rpc('finalize_marketplace_order', { p_order_id: body.orderId, p_new_status: newStatus, p_reason: body.reason ?? null });
      if (error) return jsonResponse(mapRpcError(error.message), 400);
      const row = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ ok: true, order: { orderId: row.order_id, status: row.status } });
    }

    if (body.action === 'refund') {
      if (!body.orderId) return jsonResponse(errorResult('UNKNOWN', '주문 id가 필요합니다.'), 400);
      const { data, error } = await userClient.rpc('request_marketplace_refund', { p_order_id: body.orderId });
      if (error) return jsonResponse(mapRpcError(error.message), 400);
      const row = Array.isArray(data) ? data[0] : data;
      return jsonResponse({ ok: true, order: { orderId: row.order_id, status: row.status } });
    }

    return jsonResponse(errorResult('UNKNOWN', '알 수 없는 요청입니다.'), 400);
  } catch (e) {
    return jsonResponse(errorResult('UNKNOWN', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'), 500);
  }
});

function rowToOrder(row: Record<string, unknown>) {
  return {
    orderId: row.order_id ?? row.id,
    curriculumId: row.curriculum_id,
    priceKrw: row.price_krw,
    platformFeeKrw: row.platform_fee_krw,
    sellerEarningKrw: row.seller_earning_krw,
    status: row.status,
    alreadyPurchased: row.already_purchased ?? false,
    paidAt: row.paid_at ?? null,
  };
}

function mapRpcError(message: string) {
  if (message.includes('LISTING_NOT_FOUND')) return errorResult('LISTING_NOT_FOUND', '존재하지 않거나 판매가 중단된 커리큘럼입니다.');
  if (message.includes('ORDER_NOT_FOUND')) return errorResult('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
  if (message.includes('NOT_YOUR_ORDER')) return errorResult('NOT_YOUR_ORDER', '본인의 주문이 아닙니다.');
  if (message.includes('ORDER_NOT_PENDING')) return errorResult('ORDER_NOT_PENDING', '이미 처리된 주문입니다.');
  if (message.includes('ORDER_NOT_REFUNDABLE')) return errorResult('UNKNOWN', '환불할 수 없는 주문 상태입니다.');
  if (message.includes('FORBIDDEN_DIRECT_PAID_TRANSITION')) return errorResult('UNAUTHORIZED', '허용되지 않은 요청입니다.');
  if (message.includes('AUTH_REQUIRED')) return errorResult('UNAUTHORIZED', '로그인이 필요합니다.');
  return errorResult('UNKNOWN', '요청을 처리하지 못했습니다.');
}
