import { Link } from 'react-router-dom';
import type { PersonalCoachResult } from '../../lib/personalCoach/service';

// 바로가기 — carried over from the former AI Personal Coach page.
const SHORTCUTS: { to: string; label: string }[] = [
  { to: '/learning', label: '📘 커리큘럼' },
  { to: '/today-training', label: '🔥 훈련하기' },
  { to: '/my-skills', label: '📷 자세 분석' },
  { to: '/sparring', label: '🥊 스파링 분석' },
  { to: '/combos', label: '🥋 콤보' },
  { to: '/tactics', label: '🧩 전술' },
  { to: '/training-analytics', label: '📊 훈련 기록' },
];

/**
 * 내 기록 분석·추천 — the former AI Personal Coach result (same service:
 * personalCoach/service.ts, real saved training data only), now inside the
 * AI 코치. Its next step is a lesson right here, or the existing curriculum
 * generator.
 */
export default function PersonalCoachPanel(props: { result: PersonalCoachResult; onStartLesson: (request: string) => void; onMakeCurriculum: () => void; onClose: () => void }) {
  const r = props.result;
  const lessonRequest = [r.nextTraining, r.recommendedTechniques.length ? `(${r.recommendedTechniques.slice(0, 3).map((t) => t.koreanName || t.name).join(', ')})` : ''].filter(Boolean).join(' ');
  return (
    <div className="card info-card" data-testid="personal-coach-result" data-source={r.source}>
      <h3 style={{ marginTop: 0 }}>📊 내 기록 분석 · 추천</h3>
      <p>{r.analysisSummary}</p>
      {r.source === 'fallback' && <p className="video-status-message">AI 분석을 불러오지 못해 기본 안내를 표시하고 있습니다.</p>}
      {r.recommendedTechniques.length > 0 && (
        <div className="chip-row" data-testid="personal-coach-techniques">
          <span className="field-label">🎯 추천 기술</span>
          {r.recommendedTechniques.map((t) => (
            <Link key={t.id} to={`/arts/${t.martialArt}/techniques/${t.id}`} className="chip active">
              {t.koreanName || t.name}
            </Link>
          ))}
        </div>
      )}
      <div className="stack gap-2" style={{ marginTop: 8 }}>
        <div>
          <div className="field-label">추천 훈련</div>
          <p style={{ margin: 0 }}>{r.recommendedTraining}</p>
        </div>
        {r.underTrainedAreas && (
          <div>
            <div className="field-label">부족한 영역</div>
            <p style={{ margin: 0 }}>{r.underTrainedAreas}</p>
          </div>
        )}
        <div>
          <div className="field-label">커리큘럼 방향</div>
          <p style={{ margin: 0 }}>{r.curriculumDirection}</p>
        </div>
        <div>
          <div className="field-label">다음 훈련</div>
          <p style={{ margin: 0 }}>{r.nextTraining}</p>
        </div>
      </div>
      <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => props.onStartLesson(lessonRequest)} data-testid="personal-coach-start-lesson">
          이 추천으로 오늘 수업 받기
        </button>
        <button type="button" className="btn btn-secondary" onClick={props.onMakeCurriculum} data-testid="personal-coach-curriculum">
          이 추천으로 커리큘럼 만들기
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onClose}>
          닫기
        </button>
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="chip">
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
