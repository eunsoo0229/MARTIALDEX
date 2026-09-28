import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmTossPayment, reportTossPaymentFailure } from '../lib/payments/paymentService';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

type ResultState = { phase: 'processing' } | { phase: 'success' } | { phase: 'failed'; message: string };

/**
 * successUrl AND failUrl both point here (tossCheckout.ts) — Toss appends
 * paymentKey/orderId/amount on success, or code/message/orderId on
 * failure/cancel, as query params after the full-page redirect back from
 * its own checkout page. This is the ONLY place a Toss-driven order can
 * reach 'paid' — confirmTossPayment sends paymentKey to the server for
 * verification (payment-verify's verifyWithPg), never trusting this page's
 * own read of the URL as proof of anything.
 */
export default function MarketplacePaymentResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ResultState>({ phase: 'processing' });

  useEffect(() => {
    const curriculumId = searchParams.get('curriculumId') ?? '';
    const orderId = searchParams.get('orderId') ?? '';
    const paymentKey = searchParams.get('paymentKey');
    const failCode = searchParams.get('code');
    const failMessage = searchParams.get('message');

    async function run() {
      if (!curriculumId || !orderId) {
        setState({ phase: 'failed', message: '결제 정보가 올바르지 않습니다.' });
        return;
      }
      if (failCode) {
        await reportTossPaymentFailure(orderId, failMessage ?? failCode);
        setState({ phase: 'failed', message: failMessage ?? '결제가 실패했습니다.' });
        return;
      }
      if (!paymentKey) {
        setState({ phase: 'failed', message: '결제 승인 정보를 받지 못했습니다.' });
        return;
      }

      const result = await confirmTossPayment(curriculumId, orderId, paymentKey);
      if (result.status !== 'paid') {
        setState({ phase: 'failed', message: result.message });
        return;
      }
      setState({ phase: 'success' });
      setTimeout(() => navigate(`/learning/${result.curriculum.martialArt}/${result.curriculum.id}`), 1500);
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/marketplace" />
        {state.phase === 'processing' && <EmptyState icon="💳" text="결제 승인을 서버에서 확인하는 중입니다..." />}
        {state.phase === 'success' && (
          <div className="card info-card">
            <p className="video-status-message">결제 승인이 서버에서 확인되어 커리큘럼 구매가 완료되었습니다! 잠시 후 이동합니다.</p>
          </div>
        )}
        {state.phase === 'failed' && (
          <div className="card info-card">
            <p className="ai-error" role="alert">
              결제를 완료하지 못했습니다: {state.message}
            </p>
            <a className="btn btn-primary" href="/marketplace">
              마켓플레이스로 돌아가기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
