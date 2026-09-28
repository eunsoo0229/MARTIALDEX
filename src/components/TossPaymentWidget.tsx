import { useEffect, useRef, useState } from 'react';
import type { PendingOrder } from '../lib/payments/types';
import { buildTossResultUrl, loadTossWidgets, reportTossWidgetFailure } from '../lib/payments/tossCheckout';

interface TossPaymentWidgetProps {
  order: PendingOrder;
  curriculumTitle: string;
  customerKey: string;
  onError: (message: string) => void;
}

/**
 * Renders TossPayments' own payment-method + agreement UI inline (per their
 * widget SDK's required renderPaymentMethods/renderAgreement calls) and
 * submits via widgets.requestPayment() — this is Toss's own UI, not
 * PaymentModal, so nothing here decides whether the purchase succeeds;
 * requestPayment() redirects the whole page to /marketplace/payment/result,
 * where the server-side confirm actually happens.
 */
export default function TossPaymentWidget({ order, curriculumTitle, customerKey, onError }: TossPaymentWidgetProps) {
  const widgetsRef = useRef<Awaited<ReturnType<typeof loadTossWidgets>> | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const widgets = await loadTossWidgets(customerKey);
        if (cancelled) return;
        widgetsRef.current = widgets;
        await widgets.setAmount({ currency: 'KRW', value: order.priceKrw });
        await widgets.renderPaymentMethods({ selector: '#toss-payment-method' });
        await widgets.renderAgreement({ selector: '#toss-agreement' });
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : '결제 UI를 불러오지 못했습니다.');
      }
    }
    void setup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderId]);

  async function handleSubmit() {
    const widgets = widgetsRef.current;
    if (!widgets) return;
    setSubmitting(true);
    try {
      const resultUrl = buildTossResultUrl(order.curriculumId);
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: curriculumTitle.slice(0, 100),
        successUrl: resultUrl,
        failUrl: resultUrl,
      });
      // On success this redirects the page away before ever returning here.
    } catch (e) {
      const reason = await reportTossWidgetFailure(order.orderId, e);
      onError(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card info-card">
      <div id="toss-payment-method" />
      <div id="toss-agreement" />
      <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!ready || submitting}>
          {submitting ? '처리 중...' : `${order.priceKrw.toLocaleString()}원 결제하기`}
        </button>
      </div>
    </div>
  );
}
