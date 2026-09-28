import { Link, Navigate, useParams } from 'react-router-dom';
import { getUnifiedMartialArt } from '../lib/userTechniques/service';
import { getCurriculumsForMartialArt, resolveTodayDay } from '../lib/curriculum/curriculumService';
import { useCurriculumProgress, useMyCurricula } from '../lib/curriculum/useCurriculum';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import type { Curriculum } from '../lib/curriculum/types';

function OfficialCurriculumCard({ curriculum }: { curriculum: Curriculum }) {
  const { progress, start } = useCurriculumProgress(curriculum);
  const todayDay = resolveTodayDay(curriculum);

  return (
    <div className="card info-card curriculum-hero">
      <h3>
        <span aria-hidden="true">🏆</span> {curriculum.title}
      </h3>
      <div className="chip-row">
        <span className="chip active">Martialdex 추천 학습 순서</span>
      </div>
      <p>{curriculum.description}</p>
      <div className="curriculum-stat-row">
        <div>
          <strong>{curriculum.totalDays}</strong>
          <span>전체 Day</span>
        </div>
        <div>
          <strong>{progress ? progress.currentDay : '-'}</strong>
          <span>현재 진행 Day</span>
        </div>
        <div>
          <strong>{progress ? `${progress.progress}%` : '0%'}</strong>
          <span>전체 진행률</span>
        </div>
        <div>
          <strong>약 {curriculum.estimatedWeeks}주</strong>
          <span>예상 학습 기간</span>
        </div>
      </div>
      {progress && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
        </div>
      )}
      <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}/train`} className="btn btn-primary">
        🔥 훈련하기
      </Link>{' '}
      <Link
        to={`/learning/${curriculum.martialArt}/${curriculum.id}/day/${todayDay}`}
        className="btn btn-secondary"
        onClick={start}
      >
        ▶ 오늘 학습하기 (Day {todayDay})
      </Link>{' '}
      <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="btn btn-secondary">
        전체 Day 목록 보기
      </Link>
    </div>
  );
}

export default function CurriculumList() {
  const { martialArtId = '' } = useParams();
  const art = getUnifiedMartialArt(martialArtId);
  const myCurricula = useMyCurricula();

  if (!art) return <Navigate to="/learning" replace />;

  const { official, custom } = getCurriculumsForMartialArt(martialArtId);
  const myArtCurricula = myCurricula.filter((c) => c.martialArt === martialArtId);

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/learning">학습</Link>
          <span>/</span>
          <span>{art.nameKo}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>{art.nameKo} 학습</h1>
            <div className="detail-hero__korean">{art.nameEn ?? art.id}</div>
          </div>
        </div>

        <section>
          <div className="section-title">
            <h2>추천 커리큘럼</h2>
          </div>
          {official ? (
            <OfficialCurriculumCard curriculum={official} />
          ) : (
            <EmptyState icon="🏗" text="이 무술의 추천 커리큘럼은 아직 준비 중입니다." />
          )}
        </section>

        <section>
          <div className="section-title">
            <h2>내 커리큘럼</h2>
            <Link to={`/learning/new?martialArt=${art.id}`} className="see-all">
              + 새 커리큘럼 만들기
            </Link>
          </div>
          {myArtCurricula.length === 0 && custom.length === 0 ? (
            <EmptyState icon="✏️" text="아직 만든 커리큘럼이 없습니다. 나만의 학습 순서를 만들어보세요." />
          ) : (
            <div className="stack gap-2">
              {myArtCurricula.map((c) => (
                <Link key={c.id} to={`/learning/${c.martialArt}/${c.id}`} className="technique-row">
                  <div className="technique-row__main">
                    <div className="technique-row__name">
                      {c.coverIcon ? `${c.coverIcon} ` : ''}
                      {c.title}
                    </div>
                    <div className="technique-row__sub">
                      {c.totalDays}일 · {c.techniqueCount}개 기술 ·{' '}
                      {c.visibility === 'public' ? '공개' : c.visibility === 'unlisted' ? '링크 공개' : '비공개'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
