import { Link } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import { getOfficialCurriculum } from '../lib/curriculum/officialData';
import { useMyActiveProgress } from '../lib/curriculum/useCurriculum';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

export default function LearningHub() {
  const active = useMyActiveProgress();

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>학습</span>
        </div>

        <div className="section-title">
          <h2>학습</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8, marginBottom: 20 }}>
          Martialdex 추천 학습 순서를 따라가거나, 나만의 커리큘럼을 만들어 단계적으로 배워보세요. 이 커리큘럼은
          학습·이론 정리용 추천 순서이며, 실제 훈련은 반드시 전문 지도자의 지도와 안전한 환경에서 진행해야 합니다.
        </p>
        <LoginToBackupBanner featureName="내 커리큘럼" />

        <section>
          <Link to="/ai-curriculum" className="card info-card" style={{ display: 'block' }}>
            <h3>🧠 AI 맞춤 커리큘럼</h3>
            <p style={{ margin: 0 }}>목표나 부족한 부분을 자유롭게 입력하면 AI가 나에게 맞는 커리큘럼을 만들어줍니다.</p>
          </Link>
        </section>

        <section>
          <div className="section-title">
            <h2>이어서 학습하기</h2>
          </div>
          {active.length === 0 ? (
            <EmptyState icon="📘" text="아직 시작한 커리큘럼이 없습니다. 아래에서 무술을 선택해 학습을 시작해보세요." />
          ) : (
            <div className="stack gap-2">
              {active.map(({ curriculum, progress }) => (
                <Link
                  key={curriculum.id}
                  to={`/learning/${curriculum.martialArt}/${curriculum.id}`}
                  className="technique-row"
                >
                  <div className="technique-row__main">
                    <div className="technique-row__name">{curriculum.title}</div>
                    <div className="technique-row__sub">
                      Day {progress.currentDay} / {curriculum.totalDays} · 진행률 {progress.progress}%
                    </div>
                  </div>
                  <div className="technique-row__right">
                    <span className="chip active">계속하기 →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-title">
            <h2>무술 선택</h2>
          </div>
          <div className="card-grid">
            {martialArtSummaries.map((art) => {
              const official = getOfficialCurriculum(art.id);
              return (
                <Link key={art.id} to={`/learning/${art.id}`} className="art-card">
                  <div className="art-card__badge" aria-hidden="true" />
                  <div className="art-card__initial">{art.nameKo.slice(0, 1)}</div>
                  <div className="art-card__name-ko">{art.nameKo}</div>
                  <div className="art-card__name-en">{art.nameEn ?? art.id}</div>
                  <div className="art-card__count">
                    {official ? (
                      <>
                        추천 커리큘럼 <strong>{official.totalDays}</strong>일
                      </>
                    ) : (
                      '추천 커리큘럼 준비 중'
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
