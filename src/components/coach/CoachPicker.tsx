import { useEffect, useState } from 'react';
import { getLocalModelStatus, localStatusText } from '../../lib/coachProvider/localModel';
import { getCoachPreference, saveCoachPreference } from '../../lib/coachProvider/preference';
import { COACH_LABEL, type CoachKind, type LocalModelStatus } from '../../lib/coachProvider/types';

// "어떤 코치와 수업할까요?" — shown before a lesson starts (and when the coach
// is changed mid-lesson). Both coaches are always listed with what they
// really can do on THIS device; nothing is chosen for the user and a coach
// that can't use its model here is labelled as such — never silently swapped.

const IS_ELECTRON = () => typeof window !== 'undefined' && !!window.martialdex?.askAi;

export default function CoachPicker({
  onPick,
  confirmLabel = '이 코치로 시작',
  note,
  showRemember = true,
}: {
  onPick: (kind: CoachKind) => void;
  confirmLabel?: string;
  /** Extra line above the cards (e.g. what happens to the current lesson). */
  note?: string;
  showRemember?: boolean;
}) {
  const pref = getCoachPreference();
  const [choice, setChoice] = useState<CoachKind | null>(pref.last);
  const [remember, setRemember] = useState(pref.remember);
  const [local, setLocal] = useState<LocalModelStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void getLocalModelStatus().then((s) => alive && setLocal(s));
    return () => {
      alive = false;
    };
  }, []);

  const electron = IS_ELECTRON();
  const localLine = local === null ? '로컬 모델 상태를 확인하는 중…' : localStatusText(local);
  const localUsable = !!local?.ok;

  const card = (kind: CoachKind, title: string, lines: string[], env: string, warn: string | null) => (
    <button
      type="button"
      className={`choice-card ${choice === kind ? 'choice-card--active' : ''}`}
      onClick={() => setChoice(kind)}
      aria-pressed={choice === kind}
      data-testid={`coach-pick-${kind}`}
      data-local-status={kind === 'martialdex' ? (local ? (local.ok ? 'ready' : local.reason ?? 'unavailable') : 'checking') : undefined}
    >
      <span className="choice-card__radio">{choice === kind ? '●' : '○'}</span>
      <span>
        <span className="choice-card__title">{title}</span>
        {lines.map((l) => (
          <span key={l} className="choice-card__sub">
            · {l}
          </span>
        ))}
        <span className="choice-card__sub">
          <strong>실행 환경:</strong> {env}
        </span>
        {warn && (
          <span className="choice-card__sub" style={{ color: 'var(--warning, #b45309)' }} data-testid={`coach-pick-${kind}-warning`}>
            ⚠ {warn}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <div data-testid="coach-picker">
      <p style={{ margin: '0 0 8px' }}>
        수업을 시작하기 전에
        <br />
        <strong>어떤 AI 코치와 수업할까요?</strong>
      </p>
      {note && (
        <p className="video-status-message" style={{ margin: '0 0 8px' }} data-testid="coach-picker-note">
          {note}
        </p>
      )}
      <div className="stack gap-1">
        {card(
          'martialdex',
          `🥋 ${COACH_LABEL.martialdex}`,
          ['MARTIALDEX 기술 데이터와 정해진 수업 순서로 진행', '자료에 없는 내용은 추측하지 않고 "자료에 없음"으로 안내', '답변 채점은 기술 자료의 정답 요소로 판정 (외부 AI 없음)', '실시간 웹 검색·영상 자동 검증은 사용하지 않음 · 음성 인식은 이 기기의 엔진 사용 (Gemini 아님)'],
          electron ? `이 컴퓨터의 로컬 모델(Ollama) — ${localLine}` : '이 기기에서는 로컬 모델을 쓸 수 없어 기술 자료만으로 진행',
          local && !localUsable ? `${localLine}. 로컬 모델 없이 기술 자료 문장 그대로 안내합니다 (Gemini로 바뀌지 않음).` : null
        )}
        {card(
          'gemini',
          `✨ ${COACH_LABEL.gemini}`,
          ['지금까지 사용하던 Gemini 기반 수업 그대로', '자유로운 설명·질문 답변, 웹 검색 기반 오늘의 수업', '답변 채점은 Gemini 판단을 기술 자료 정답 요소 범위 안에서 반영'],
          electron ? 'Google Gemini API (인터넷 연결 필요)' : 'Google Gemini API — 로그인과 인터넷 연결 필요',
          null
        )}
      </div>
      {showRemember && (
        <label className="tutor-voice__check" style={{ marginTop: 8, display: 'block' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="coach-pick-remember" /> 다음 수업부터 묻지 않고 이 코치 사용 (수업 화면에서 언제든 바꿀 수 있음)
        </label>
      )}
      <div className="modal-actions modal-actions--start" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!choice}
          data-testid="coach-pick-confirm"
          onClick={() => {
            if (!choice) return;
            saveCoachPreference({ last: choice, remember: showRemember ? remember : pref.remember });
            onPick(choice);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
