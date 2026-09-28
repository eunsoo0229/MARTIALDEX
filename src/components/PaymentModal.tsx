import type { PaymentOutcome, PendingOrder } from '../lib/payments/types';

// The test-mode "결제창" — visually distinct and explicitly labeled so no
// one mistakes this for a real charge (spec section 5/9). This is also the
// exact UI contract a real PG would replace (redirect or its own SDK popup
// instead of this modal) — see realPaymentProvider.ts.
export default function PaymentModal({ order, onResult }: { order: PendingOrder; onResult: (outcome: PaymentOutcome) => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>🧪 테스트 결제</h3>
        <p className="video-status-message">
          실제 결제 서비스가 연결되기 전까지는 실제 돈이 빠져나가지 않는 테스트 결제만 진행됩니다.
        </p>
        <div className="curriculum-stat-row">
          <div>
            <strong>{order.priceKrw.toLocaleString()}원</strong>
            <span>결제 금액</span>
          </div>
          <div>
            <strong>{order.platformFeeKrw.toLocaleString()}원</strong>
            <span>플랫폼 수수료</span>
          </div>
          <div>
            <strong>{order.sellerEarningKrw.toLocaleString()}원</strong>
            <span>판매자 정산 예정액</span>
          </div>
        </div>
        <p className="video-status-message">주문번호: {order.orderId}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => onResult({ outcome: 'cancelled' })}>
            취소
          </button>
          <button className="btn btn-secondary" onClick={() => onResult({ outcome: 'failed', reason: '테스트: 결제 실패 시뮬레이션' })}>
            결제 실패 시뮬레이션
          </button>
          <button className="btn btn-primary" onClick={() => onResult({ outcome: 'confirmed' })}>
            테스트 결제 진행
          </button>
        </div>
      </div>
    </div>
  );
}
