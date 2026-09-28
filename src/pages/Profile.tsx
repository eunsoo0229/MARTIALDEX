import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProfileStats } from '../lib/profileStats/useProfileStats';
import { useMyStyle } from '../lib/myStyle/useMyStyle';
import { useAuth } from '../lib/auth/AuthProvider';
import { signOutUser } from '../lib/auth/authService';
import { backupLocalDataToCloud, restoreLocalDataFromCloud, hasLocalDataToBackup } from '../lib/cloudSync/dataBackup';
import { pushCurriculaToCloud, pullCurriculaFromCloud } from '../lib/cloudSync/curriculumSync';
import { useAutoProgress } from '../lib/todayTraining/autoProgressSetting';
import { useMyCurricula, useCurriculumProgress } from '../lib/curriculum/useCurriculum';
import { listMySalesOrders, listMySellingListings } from '../lib/marketplace/service';
import type { MarketplaceListing, MarketplaceOrder } from '../lib/marketplace/types';
import { requestRefund } from '../lib/payments/paymentService';
import BackButton from '../components/BackButton';
import MyCommunityPostsCard from '../components/community/MyCommunityPostsCard';

function PurchasedCurriculumRow({ curriculum }: { curriculum: import('../lib/curriculum/types').Curriculum }) {
  const { progress } = useCurriculumProgress(curriculum);
  const [refunding, setRefunding] = useState(false);
  const [refunded, setRefunded] = useState(false);

  async function handleRefund() {
    if (!curriculum.marketplaceMeta) return;
    if (!window.confirm('이 커리큘럼을 환불(테스트)할까요? 환불 후에는 마켓 콘텐츠 접근 권한이 사라집니다.')) return;
    setRefunding(true);
    const result = await requestRefund(curriculum.marketplaceMeta.orderId);
    setRefunding(false);
    if (result.ok) setRefunded(true);
  }

  return (
    <div className="technique-row">
      <div className="technique-row__main">
        <div className="technique-row__name">
          {curriculum.coverIcon ? `${curriculum.coverIcon} ` : ''}
          {curriculum.title} {refunded && <span className="chip">환불됨</span>}
        </div>
        <div className="technique-row__sub">
          판매자 {curriculum.marketplaceMeta?.sellerNickname} · {curriculum.marketplaceMeta?.priceKrw ? `${curriculum.marketplaceMeta.priceKrw.toLocaleString()}원` : '무료'} · 진행률{' '}
          {progress?.progress ?? 0}%
        </div>
      </div>
      <div className="technique-row__right" style={{ display: 'flex', gap: 6 }}>
        <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="btn btn-secondary btn-sm">
          커리큘럼 보기
        </Link>
        <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}/train`} className="btn btn-primary btn-sm">
          훈련하기
        </Link>
        {!!curriculum.marketplaceMeta?.priceKrw && !refunded && (
          <button className="btn btn-ghost btn-sm" onClick={handleRefund} disabled={refunding}>
            {refunding ? '처리 중...' : '환불(테스트)'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Profile() {
  const { stats, level, rank, achievements } = useProfileStats();
  const { summary, analysis } = useMyStyle();
  const { isConfigured, user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [autoProgress, setAutoProgress] = useAutoProgress();

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const myCurricula = useMyCurricula();
  const purchasedCurricula = myCurricula.filter((c) => !!c.marketplaceMeta);
  const [sellingListings, setSellingListings] = useState<MarketplaceListing[] | null>(null);
  const [sellingOrders, setSellingOrders] = useState<MarketplaceOrder[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([listMySellingListings(user.id), listMySalesOrders(user.id)]).then(([listingsResult, ordersResult]) => {
      if (!active) return;
      if (listingsResult.ok) setSellingListings(listingsResult.data);
      if (ordersResult.ok) setSellingOrders(ordersResult.data);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const topMartialArt = summary.martialArtsPracticed[0];
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  async function handleLogout() {
    await signOutUser();
    navigate('/login');
  }

  async function handleBackup() {
    if (!user) return;
    setSyncing(true);
    setSyncMessage(null);
    const curriculumResult = await pushCurriculaToCloud(user.id);
    const backupResult = await backupLocalDataToCloud(user.id);
    setSyncing(false);
    if (!curriculumResult.ok) {
      setSyncMessage(curriculumResult.message);
      return;
    }
    if (!backupResult.ok) {
      setSyncMessage(backupResult.message);
      return;
    }
    setSyncMessage(`계정에 저장했습니다 (커리큘럼 ${curriculumResult.data.curriculumCount}개, 데이터 ${backupResult.data.keyCount}개 항목).`);
  }

  async function handleRestore() {
    if (!user) return;
    if (!window.confirm('계정에 저장된 데이터로 이 기기의 데이터를 덮어씁니다. 계속할까요?')) return;
    setSyncing(true);
    setSyncMessage(null);
    const curriculumResult = await pullCurriculaFromCloud(user.id);
    const restoreResult = await restoreLocalDataFromCloud(user.id);
    setSyncing(false);
    if (!curriculumResult.ok) {
      setSyncMessage(curriculumResult.message);
      return;
    }
    if (!restoreResult.ok) {
      setSyncMessage(restoreResult.message);
      return;
    }
    window.alert('복원이 완료되었습니다. 앱을 다시 불러옵니다.');
    window.location.reload();
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>프로필</span>
        </div>

        <div className="section-title">
          <h2>👤 프로필</h2>
          <Link to="/dashboard" className="see-all">
            대시보드 (최근 훈련·통계) →
          </Link>
        </div>

        {isConfigured && !authLoading && (
          <div className="card info-card">
            <h3>계정</h3>
            {user && profile ? (
              <>
                <div className="curriculum-stat-row">
                  <div>
                    <strong>{profile.nickname}</strong>
                    <span>닉네임</span>
                  </div>
                  <div>
                    <strong>{profile.created_at.slice(0, 10)}</strong>
                    <span>가입일</span>
                  </div>
                </div>
                <div className="modal-actions modal-actions--start">
                  {hasLocalDataToBackup() && (
                    <button className="btn btn-secondary" onClick={handleBackup} disabled={syncing}>
                      {syncing ? '처리 중…' : '☁️ 계정에 백업하기'}
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={handleRestore} disabled={syncing}>
                    {syncing ? '처리 중…' : '계정에서 복원하기'}
                  </button>
                  <button className="btn btn-ghost" onClick={handleLogout}>
                    로그아웃
                  </button>
                </div>
                {syncMessage && <p className="video-status-message">{syncMessage}</p>}
                <p className="video-status-message">커리큘럼·훈련 기록·스파링 기록 등 이 기기의 데이터를 계정에 백업하거나, 다른 기기에 백업해둔 데이터를 이 기기로 복원할 수 있습니다.</p>
              </>
            ) : (
              <>
                <p className="video-status-message">로그인하면 닉네임·가입일이 표시되고, 학습 데이터를 계정에 백업해 다른 기기에서도 이어서 사용할 수 있습니다.</p>
                <div className="modal-actions modal-actions--start">
                  <Link to="/login" className="btn btn-primary">
                    로그인
                  </Link>
                  <Link to="/signup" className="btn btn-secondary">
                    회원가입
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {user && (
          <div className="card info-card">
            <h3>🕑 AI 질문 기록</h3>
            <p className="video-status-message">기술/자세 분석/커리큘럼/선수 스타일/AI 코치 화면에서 나눈 AI 질문·답변을 확인하고 삭제할 수 있습니다.</p>
            <div className="modal-actions modal-actions--start">
              <Link to="/ai-history" className="btn btn-secondary btn-sm">
                기록 보기 →
              </Link>
            </div>
          </div>
        )}

        {user && profile && <MyCommunityPostsCard userId={user.id} nickname={profile.nickname} />}

        <div className="card info-card">
          <h3>학습 요약</h3>
          <div className="curriculum-stat-row">
            <div>
              <strong>{stats.learnedCount}</strong>
              <span>학습 기술</span>
            </div>
            <div>
              <strong>{stats.proficientCount}</strong>
              <span>숙련 기술</span>
            </div>
            <div>
              <strong>{stats.sparringSessionCount}</strong>
              <span>스파링 분석</span>
            </div>
            <div>
              <strong>{stats.completedTrainingSessions}</strong>
              <span>훈련 횟수</span>
            </div>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{topMartialArt ? topMartialArt.nameKo : '-'}</strong>
              <span>주요 무술</span>
            </div>
            <div>
              <strong>{analysis ? analysis.styleName : '분석 전'}</strong>
              <span>현재 스타일</span>
            </div>
            <div>
              <strong>{stats.longestStreak}일</strong>
              <span>최장 연속 학습</span>
            </div>
          </div>
          <div className="curriculum-stat-row">
            <div>
              <strong>{stats.poseAnalysisCount}</strong>
              <span>자세 분석 완료</span>
            </div>
            <div>
              <strong>{stats.comboCount}</strong>
              <span>내 콤보</span>
            </div>
            <div>
              <strong>{stats.comboTrainingSessionCount}</strong>
              <span>콤보 훈련 횟수</span>
            </div>
            <div>
              <strong>{stats.tacticCount}</strong>
              <span>내 전술</span>
            </div>
          </div>
          <div className="modal-actions modal-actions--start">
            <Link to="/my-style" className="btn btn-secondary">
              나의 스타일 보기 →
            </Link>
          </div>
        </div>

        <div className="card info-card">
          <div className="chip-row">
            <span className="chip active">🥋 {rank.title}</span>
            <span className="chip">Level {level.level}</span>
            <span className="chip">{level.label}</span>
            {stats.currentStreak > 0 && <span className="chip">🔥 {stats.currentStreak}일 연속 학습</span>}
          </div>
          {level.xpForNextLevel !== null && (
            <>
              <div className="progress-track" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((level.xpIntoLevel / level.xpForNextLevel) * 100))}%` }} />
              </div>
              <p className="video-status-message">
                다음 랭크까지 {Math.max(0, level.xpForNextLevel - level.xpIntoLevel)} XP
              </p>
            </>
          )}
          <p className="video-status-message">
            랭크·레벨은 MARTIALDEX 앱 내 학습 진행도를 보여주는 자체 게임형 지표이며, 실제 무술 단증·승급이나 대회
            성적을 인증하지 않습니다.
          </p>
        </div>

        {user && (
          <div className="card info-card">
            <h3>🛍 구매한 커리큘럼</h3>
            {purchasedCurricula.length === 0 ? (
              <p className="video-status-message">아직 마켓에서 받거나 구매한 커리큘럼이 없습니다.</p>
            ) : (
              <div className="stack gap-2">
                {purchasedCurricula.map((c) => (
                  <PurchasedCurriculumRow key={c.id} curriculum={c} />
                ))}
              </div>
            )}
            <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
              <Link to="/marketplace" className="btn btn-secondary btn-sm">
                커리큘럼 마켓 가기 →
              </Link>
            </div>
          </div>
        )}

        {user && sellingListings !== null && sellingListings.length > 0 && (
          <div className="card info-card">
            <h3>💰 내 판매 커리큘럼</h3>
            <div className="stack gap-2">
              {sellingListings.map((l) => {
                // Only paid/completed orders count toward settlement math — pending/failed/cancelled never did, and refunded no longer does (spec section 13).
                const listingOrders = sellingOrders.filter((o) => o.curriculumId === l.id && (o.status === 'paid' || o.status === 'completed'));
                const totalRevenue = listingOrders.reduce((sum, o) => sum + o.priceKrw, 0);
                const totalFee = listingOrders.reduce((sum, o) => sum + o.platformFeeKrw, 0);
                const totalEarning = listingOrders.reduce((sum, o) => sum + o.sellerEarningKrw, 0);
                return (
                  <div key={l.id} className="technique-row">
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {l.coverIcon ? `${l.coverIcon} ` : ''}
                        {l.title} {l.status === 'unpublished' && <span className="chip">게시 중단</span>}
                      </div>
                      <div className="technique-row__sub">
                        판매 {l.purchaseCount}회 · 총 판매 금액 {totalRevenue.toLocaleString()}원 · 플랫폼 수수료 {totalFee.toLocaleString()}원 · 예상 수익{' '}
                        {totalEarning.toLocaleString()}원 · 평점 {l.ratingCount > 0 ? l.ratingAvg.toFixed(1) : '-'} ({l.ratingCount}개 리뷰)
                      </div>
                    </div>
                    <div className="technique-row__right">
                      <Link to={`/marketplace/${l.id}`} className="btn btn-secondary btn-sm">
                        보기
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="card info-card">
          <h3>훈련 설정</h3>
          <label className="chip-row" style={{ alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoProgress} onChange={(e) => setAutoProgress(e.target.checked)} />
            오늘의 훈련: 세트/운동 완료 시 다음으로 자동 진행
          </label>
        </div>

        <div className="card info-card">
          <h3>
            🏆 업적 ({unlockedCount}/{achievements.length})
          </h3>
          <div className="stack gap-2">
            {achievements.map((a) => (
              <div key={a.id} className="technique-row" style={{ opacity: a.unlocked ? 1 : 0.55 }}>
                <div className="technique-row__main">
                  <div className="technique-row__name">
                    {a.icon} {a.title}
                  </div>
                  <div className="technique-row__sub">{a.description}</div>
                  {!a.unlocked && (
                    <div className="progress-track" style={{ marginTop: 4 }}>
                      <div className="progress-fill" style={{ width: `${Math.round((a.progressCurrent / a.progressTarget) * 100)}%` }} />
                    </div>
                  )}
                </div>
                <div className="technique-row__right">
                  {a.unlocked ? (
                    <span className="chip active">달성 {a.unlockedAt ? `· ${a.unlockedAt.slice(0, 10)}` : ''}</span>
                  ) : (
                    <span className="chip">
                      {a.progressCurrent}/{a.progressTarget}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
