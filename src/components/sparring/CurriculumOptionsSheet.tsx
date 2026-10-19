import { useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '../BottomSheet';
import { createSparringImprovementCurriculum } from '../../lib/sparringAnalysis/sparringToCurriculum';
import type { SparringSession } from '../../lib/sparringAnalysis/types';
import type { Curriculum } from '../../lib/curriculum/types';

const WEEK_PRESETS = [1, 2, 4, 8];
const SESSIONS_PER_WEEK_PRESETS = [2, 3, 4, 5];
const MINUTES_PRESETS = [15, 30, 45, 60];

interface CurriculumOptionsSheetProps {
  session: SparringSession;
  userId: string | null;
  onClose: () => void;
  onCreated: (curriculum: Curriculum) => void;
}

/**
 * Spec 12's "훈련 기간/주당 훈련 횟수/한 세션 예상 시간/집중하고 싶은 약점"
 * selector, with defaults so a user can generate immediately without
 * touching anything. "기간"×"주당 횟수" is what actually becomes the
 * curriculum's Day count — curricula here are a sequence of training Days,
 * not calendar dates, so "주당 3회 × 2주" naturally becomes 6 content Days
 * rather than 14 consecutive ones.
 */
export default function CurriculumOptionsSheet({ session, userId, onClose, onCreated }: CurriculumOptionsSheetProps) {
  const [weeks, setWeeks] = useState(2);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [focusAreas, setFocusAreas] = useState<Set<string>>(new Set(session.weakAreas.map((a) => a.label)));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleArea(label: string) {
    setFocusAreas((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const curriculum = await createSparringImprovementCurriculum(session, userId, {
        durationDays: Math.max(1, weeks * sessionsPerWeek),
        dailyMinutes,
        focusAreaLabels: focusAreas.size > 0 ? [...focusAreas] : undefined,
      });
      onCreated(curriculum);
    } catch (e) {
      setError(e instanceof Error ? e.message : '커리큘럼 생성 중 문제가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  return createPortal(
    <BottomSheet onClose={onClose}>
      <h3>🎯 맞춤 커리큘럼 생성</h3>
      <p className="video-status-message">
        스파링 분석에서 발견된 약점 장면을 바탕으로, 실시간 웹 검색으로 훈련 자료를 찾고 Martialdex 기술 데이터로
        커리큘럼을 만듭니다(이미 배운 기술은 복습으로 배치). 기본값 그대로 바로 생성해도 됩니다.
      </p>

      <div className="chip-row" style={{ marginTop: 10 }}>
        <div>
          <label className="field-label">훈련 기간</label>
          <br />
          <select className="select" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {WEEK_PRESETS.map((w) => (
              <option key={w} value={w}>
                {w}주
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">주당 훈련 횟수</label>
          <br />
          <select className="select" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(Number(e.target.value))}>
            {SESSIONS_PER_WEEK_PRESETS.map((n) => (
              <option key={n} value={n}>
                주 {n}회
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">한 세션 예상 시간</label>
          <br />
          <select className="select" value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))}>
            {MINUTES_PRESETS.map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
          </select>
        </div>
      </div>

      {session.weakAreas.length > 0 && (
        <>
          <label className="field-label" style={{ marginTop: 12, display: 'block' }}>
            집중하고 싶은 약점 (선택 안 하면 전체 반영)
          </label>
          <div className="chip-row" style={{ marginTop: 6 }}>
            {session.weakAreas.map((a) => (
              <button key={a.label} type="button" className={`chip ${focusAreas.has(a.label) ? 'active' : ''}`} onClick={() => toggleArea(a.label)}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="ai-error" role="alert">
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={generating}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? '생성 중…' : '커리큘럼 생성하기'}
        </button>
      </div>
    </BottomSheet>,
    document.body
  );
}
