import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { deleteCurriculaVerified } from '../lib/curriculum/deleteCurriculum';
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
  const { user } = useAuth();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!art) return <Navigate to="/learning" replace />;

  const { official, custom } = getCurriculumsForMartialArt(martialArtId);
  const myArtCurricula = myCurricula.filter((c) => c.martialArt === martialArtId);
  const visibleIds = myArtCurricula.map((c) => c.id);
  const chosen = selected.filter((id) => visibleIds.includes(id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  // Multi-delete: each curriculum goes through the same verified delete as
  // the single "삭제" button; anything that fails stays listed and selected.
  async function handleBulkDelete() {
    if (chosen.length === 0 || deleting) return;
    const titles = myArtCurricula.filter((c) => chosen.includes(c.id)).map((c) => c.title);
    if (!window.confirm(`선택한 커리큘럼 ${chosen.length}개를 삭제할까요? 되돌릴 수 없습니다.\n\n${titles.join('\n')}\n\n(훈련 기록·학습한 기술·스파링 기록은 그대로 유지됩니다.)`)) return;
    setNotice(null);
    setDeleting({ done: 0, total: chosen.length });
    const result = await deleteCurriculaVerified(chosen, user?.id ?? null, (done, total) => setDeleting({ done, total }));
    setDeleting(null);
    if (result.failed.length === 0) {
      setNotice(`${result.deletedIds.length}개 커리큘럼을 삭제했습니다.`);
      exitSelecting();
      return;
    }
    const failedTitles = myArtCurricula.filter((c) => result.failed.some((f) => f.id === c.id)).map((c) => c.title);
    setSelected(result.failed.map((f) => f.id));
    setNotice(`${result.deletedIds.length}개 삭제, ${result.failed.length}개는 삭제하지 못했습니다: ${failedTitles.join(', ')}. 잠시 후 다시 시도해주세요.`);
  }

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
            <div className="chip-row" style={{ gap: 12 }}>
              {myArtCurricula.length > 0 && !selecting && (
                <button type="button" className="see-all" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSelecting(true)} data-testid="curriculum-select-mode">
                  선택 삭제
                </button>
              )}
              <Link to={`/learning/new?martialArt=${art.id}`} className="see-all">
                + 새 커리큘럼 만들기
              </Link>
            </div>
          </div>
          {selecting && (
            <div className="chip-row" style={{ marginBottom: 10 }} data-testid="curriculum-select-bar">
              <button type="button" className="chip" onClick={() => setSelected(chosen.length === visibleIds.length ? [] : visibleIds)} disabled={!!deleting}>
                {chosen.length === visibleIds.length ? '전체 해제' : '전체 선택'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleBulkDelete()} disabled={chosen.length === 0 || !!deleting} data-testid="curriculum-bulk-delete">
                {deleting ? `삭제 중… (${deleting.done}/${deleting.total})` : `${chosen.length}개 삭제`}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={exitSelecting} disabled={!!deleting}>
                취소
              </button>
            </div>
          )}
          {notice && (
            <p className="video-status-message" role="status" data-testid="curriculum-bulk-notice">
              {notice}
            </p>
          )}
          {myArtCurricula.length === 0 && custom.length === 0 ? (
            <EmptyState icon="✏️" text="아직 만든 커리큘럼이 없습니다. 나만의 학습 순서를 만들어보세요." />
          ) : (
            <div className="stack gap-2">
              {myArtCurricula.map((c) =>
                selecting ? (
                  <label key={c.id} className={`technique-row curriculum-select-row${chosen.includes(c.id) ? ' is-selected' : ''}`} data-testid="curriculum-select-row">
                    <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} disabled={!!deleting} />
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {c.coverIcon ? `${c.coverIcon} ` : ''}
                        {c.title}
                      </div>
                      <div className="technique-row__sub">
                        {c.totalDays}일 · {c.techniqueCount}개 기술
                      </div>
                    </div>
                  </label>
                ) : (
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
                )
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
