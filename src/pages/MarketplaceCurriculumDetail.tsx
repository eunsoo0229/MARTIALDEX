import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import {
  computeFeeSplit,
  getMarketplaceCurriculumContent,
  getMarketplaceListing,
  getPlatformFeeRateBp,
  listReviews,
  submitReview,
} from '../lib/marketplace/service';
import type { MarketplaceCurriculumContent, MarketplaceListing, MarketplaceReview } from '../lib/marketplace/types';
import { curriculumRepository } from '../lib/curriculum/repository';
import { resolveTechniquesByIds } from '../lib/userTechniques/service';
import { purchaseCurriculumWithPayment } from '../lib/payments/paymentService';
import { beginTossOrder } from '../lib/payments/tossCheckout';
import { isTossConfigured } from '../lib/payments/tossConfig';
import type { PaymentOutcome, PendingOrder } from '../lib/payments/types';
import PaymentModal from '../components/PaymentModal';
import TossPaymentWidget from '../components/TossPaymentWidget';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';

const DIFFICULTY_LABEL: Record<string, string> = { beginner: '초급', intermediate: '중급', advanced: '고급', mixed: '혼합' };

export default function MarketplaceCurriculumDetail() {
  const { curriculumId = '' } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [listing, setListing] = useState<MarketplaceListing | null | undefined>(undefined);
  const [content, setContent] = useState<MarketplaceCurriculumContent | null>(null);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [feeRateBp, setFeeRateBp] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [pendingOrderForModal, setPendingOrderForModal] = useState<PendingOrder | null>(null);
  const [tossOrder, setTossOrder] = useState<PendingOrder | null>(null);
  const paymentResolverRef = useRef<((outcome: PaymentOutcome) => void) | null>(null);

  const localCopy = curriculumRepository.listCustom().find((c) => c.marketplaceMeta?.listingId === curriculumId);
  const isOwner = !!listing && user?.id === listing.sellerUserId;
  const hasAccess = !!content || isOwner || !!localCopy;
  const alreadyReviewed = reviews.some((r) => r.reviewerUserId === user?.id);

  async function loadAll() {
    const [listingResult, contentResult, reviewsResult, feeRate] = await Promise.all([
      getMarketplaceListing(curriculumId),
      getMarketplaceCurriculumContent(curriculumId),
      listReviews(curriculumId),
      getPlatformFeeRateBp(),
    ]);
    if (listingResult.ok) setListing(listingResult.data);
    else setError(listingResult.message);
    if (contentResult.ok) setContent(contentResult.data);
    if (reviewsResult.ok) setReviews(reviewsResult.data);
    setFeeRateBp(feeRate);
  }

  useEffect(() => {
    if (!user) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, curriculumId]);

  // Handed to paymentService as the "결제창" step — has zero payment logic
  // of its own, it just shows PaymentModal and resolves once the user picks
  // an option there. Nothing here decides whether the purchase succeeds;
  // that only ever happens after payment-verify's server-side check.
  function promptPaymentUi(order: PendingOrder): Promise<PaymentOutcome> {
    return new Promise((resolve) => {
      paymentResolverRef.current = resolve;
      setPendingOrderForModal(order);
    });
  }

  function handleModalResult(outcome: PaymentOutcome) {
    setPendingOrderForModal(null);
    paymentResolverRef.current?.(outcome);
    paymentResolverRef.current = null;
  }

  async function handlePurchase() {
    if (!listing) return;
    setPurchasing(true);
    setPurchaseNotice(null);
    try {
      // TossPayments V2 test-mode checkout when configured — renders Toss's
      // own widget UI inline (see tossOrder/TossPaymentWidget below) instead
      // of immediately redirecting. Falls back to the existing
      // TestPaymentProvider/PaymentModal flow for free items or when no Toss
      // test client key is configured, so nothing already working changes.
      if (!listing.isFree && isTossConfigured() && user) {
        const outcome = await beginTossOrder(listing.id);
        if (outcome.outcome === 'ready') {
          setTossOrder(outcome.order);
          return;
        }
        if (outcome.outcome === 'already_purchased') {
          setPurchaseNotice('이미 구매한 커리큘럼입니다. 내 커리큘럼에서 확인하세요.');
          if (outcome.curriculum) setTimeout(() => navigate(`/learning/${outcome.curriculum!.martialArt}/${outcome.curriculum!.id}`), 1200);
          return;
        }
        setPurchaseNotice(`결제에 실패했습니다: ${outcome.message}`);
        return;
      }

      const result = await purchaseCurriculumWithPayment(listing.id, promptPaymentUi);
      if (result.status === 'cancelled') {
        setPurchaseNotice('결제가 취소되었습니다.');
        return;
      }
      if (result.status === 'failed') {
        setPurchaseNotice(`결제에 실패했습니다: ${result.message}`);
        return;
      }
      if (result.status === 'already_purchased') {
        setPurchaseNotice('이미 구매한 커리큘럼입니다. 내 커리큘럼에서 확인하세요.');
        if (result.curriculum) setTimeout(() => navigate(`/learning/${result.curriculum!.martialArt}/${result.curriculum!.id}`), 1200);
        return;
      }
      const contentResult = await getMarketplaceCurriculumContent(listing.id);
      if (contentResult.ok) setContent(contentResult.data);
      setPurchaseNotice(listing.isFree ? '무료 커리큘럼을 받았습니다!' : '서버 검증을 마친 테스트 결제가 완료되었습니다!');
      setTimeout(() => navigate(`/learning/${result.curriculum.martialArt}/${result.curriculum.id}`), 1200);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleSubmitReview() {
    if (!user || !profile) return;
    setSubmittingReview(true);
    try {
      const result = await submitReview(curriculumId, user.id, profile.nickname, reviewRating, reviewText);
      if (result.ok) {
        setReviewText('');
        await loadAll();
      } else {
        setError(result.message);
      }
    } finally {
      setSubmittingReview(false);
    }
  }

  if (!user) {
    return (
      <div className="page">
        <div className="container">
          <BackButton fallback="/marketplace" />
          <div className="card info-card">
            <p className="video-status-message">마켓플레이스는 로그인 후 이용할 수 있습니다.</p>
            <Link to="/login" className="btn btn-primary">
              로그인
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (listing === undefined) return <EmptyState icon="🛒" text="불러오는 중..." />;
  if (listing === null) return <EmptyState icon="🛒" text="커리큘럼을 찾을 수 없습니다." />;

  const feeSplit = feeRateBp !== null ? computeFeeSplit(listing.priceKrw, feeRateBp) : null;

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/marketplace" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/marketplace">커리큘럼 마켓</Link>
          <span>/</span>
          <span>{listing.title}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>
              {listing.coverIcon ? `${listing.coverIcon} ` : ''}
              {listing.title}
            </h1>
            <div className="detail-hero__korean">제작자 {listing.sellerNickname}</div>
            <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>{listing.description}</p>
          </div>
        </div>

        {error && <div className="ai-error" role="alert">{error}</div>}
        {purchaseNotice && <p className="video-status-message">{purchaseNotice}</p>}

        <div className="card info-card">
          <div className="curriculum-stat-row">
            <div>
              <strong>{listing.martialArt}</strong>
              <span>무술</span>
            </div>
            <div>
              <strong>{DIFFICULTY_LABEL[listing.difficulty] ?? listing.difficulty}</strong>
              <span>난이도</span>
            </div>
            <div>
              <strong>{listing.totalDays}일</strong>
              <span>총 훈련 기간</span>
            </div>
            <div>
              <strong>{listing.techniqueCount}개</strong>
              <span>포함 기술</span>
            </div>
            <div>
              <strong>{listing.ratingCount > 0 ? listing.ratingAvg.toFixed(1) : '-'}</strong>
              <span>평점 ({listing.ratingCount}개)</span>
            </div>
            <div>
              <strong>{listing.purchaseCount}회</strong>
              <span>구매 횟수</span>
            </div>
          </div>

          {listing.tags.length > 0 && (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {listing.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
            </div>
          )}
          {listing.targetAudience && (
            <p style={{ marginTop: 8 }}>
              <strong>추천 대상:</strong> {listing.targetAudience}
            </p>
          )}
          {listing.learningGoals.length > 0 && (
            <>
              <div className="field-label" style={{ marginTop: 8 }}>
                학습 목표
              </div>
              <ul style={{ marginTop: 4 }}>
                {listing.learningGoals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          )}

          {!hasAccess && (
            <>
              <p className="video-status-message" style={{ marginTop: 10 }}>
                구매 전에는 Day별 상세 내용과 포함 기술 목록이 공개되지 않습니다. 위 요약 정보만 미리보기로 제공됩니다.
              </p>
              {feeSplit && !listing.isFree && (
                <p className="video-status-message">
                  {isTossConfigured()
                    ? `가격 ${feeSplit.priceKrw.toLocaleString()}원 중 플랫폼 수수료 ${feeSplit.platformFeeKrw.toLocaleString()}원, 판매자 수익 ${feeSplit.sellerEarningKrw.toLocaleString()}원 (토스페이먼츠 테스트 환경 — 실제 카드가 청구되지 않습니다).`
                    : `🧪 테스트 결제 안내: 가격 ${feeSplit.priceKrw.toLocaleString()}원 중 플랫폼 수수료 ${feeSplit.platformFeeKrw.toLocaleString()}원, 판매자 수익 ${feeSplit.sellerEarningKrw.toLocaleString()}원 (실제 결제는 이루어지지 않습니다).`}
                </p>
              )}
              {!tossOrder && (
                <div className="modal-actions modal-actions--start" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary btn-lg" onClick={handlePurchase} disabled={purchasing}>
                    {purchasing
                      ? '처리 중...'
                      : listing.isFree
                        ? '무료로 받기'
                        : isTossConfigured()
                          ? `💳 결제하기 (${listing.priceKrw.toLocaleString()}원)`
                          : `🧪 테스트 구매 (${listing.priceKrw.toLocaleString()}원)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {tossOrder && user && (
          <TossPaymentWidget
            order={tossOrder}
            curriculumTitle={listing.title}
            customerKey={user.id}
            onError={(message) => {
              setTossOrder(null);
              setPurchaseNotice(`결제에 실패했습니다: ${message}`);
            }}
          />
        )}

        {hasAccess && content && (
          <>
            <div className="section-title">
              <h2>Day별 커리큘럼</h2>
            </div>
            <div className="stack gap-2">
              {content.days.map((d) => {
                const techniques = resolveTechniquesByIds(d.techniqueIds);
                return (
                  <div key={d.day} className="card info-card">
                    <strong>Day {d.day}</strong> — {d.title}
                    {d.learningGoals.length > 0 && (
                      <p className="video-status-message" style={{ marginTop: 4, marginBottom: 4 }}>
                        목표: {d.learningGoals.join(' / ')}
                      </p>
                    )}
                    {techniques.length > 0 && <p style={{ margin: 0 }}>기술: {techniques.map((t) => t.koreanName || t.name).join(', ')}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="card info-card">
          <h3>리뷰 ({reviews.length})</h3>
          {hasAccess && !isOwner && !alreadyReviewed && (
            <div className="stack gap-2" style={{ marginBottom: 12 }}>
              <div className="chip-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`chip ${reviewRating === n ? 'active' : ''}`} onClick={() => setReviewRating(n)}>
                    {n}점
                  </button>
                ))}
              </div>
              <textarea className="field-full" style={{ minHeight: 60 }} placeholder="리뷰를 남겨주세요" value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-secondary" onClick={handleSubmitReview} disabled={submittingReview}>
                  {submittingReview ? '등록 중...' : '리뷰 등록'}
                </button>
              </div>
            </div>
          )}
          {!hasAccess && <p className="video-status-message">구매한 사용자만 리뷰를 작성할 수 있습니다.</p>}
          {reviews.length === 0 ? (
            <EmptyState icon="✍️" text="아직 리뷰가 없습니다." />
          ) : (
            <div className="stack gap-2">
              {reviews.map((r) => (
                <div key={r.id} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">
                      {'⭐'.repeat(r.rating)} · {r.reviewerNickname}
                    </div>
                    <div className="technique-row__sub">{r.reviewText}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {pendingOrderForModal && <PaymentModal order={pendingOrderForModal} onResult={handleModalResult} />}
    </div>
  );
}
