import { useEffect, useRef, useState } from 'react';
import { isVoiceInputSupported, type Recorder, type SttPhase } from '../lib/voice/stt';
import { useVoiceInput, VoiceInputPanel } from './voice/useVoiceInput';

// 🎤 마이크 테스트 — the SAME speech engine the lesson uses (useVoiceInput →
// stt.ts), so a pass here means the lesson's mic answer will work too. On the
// Mac it is also where the local recognition model is chosen / removed.

export function useInputLevel(recorder: Recorder | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!recorder) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLevel(recorder.level());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recorder]);
  return level;
}

export function LevelMeter({ level }: { level: number }) {
  return (
    <div className="mic-meter" aria-label={`입력 레벨 ${Math.round(level * 100)}%`} data-testid="mic-level" data-level={level.toFixed(2)}>
      <div className="mic-meter__fill" style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}

export const PHASE_LABEL: Record<SttPhase, string> = {
  idle: '대기 중',
  requesting: '마이크 권한을 확인하는 중입니다…',
  listening: '듣고 있습니다. 말씀하신 뒤 "말하기 끝"을 눌러 주세요.',
  recognizing: '말씀하신 내용을 인식하는 중입니다…',
  result: '인식이 끝났습니다.',
  error: '문제가 있습니다.',
};

export default function MicTestPanel({ hints = [], allowFallback }: { hints?: string[]; /** false = never offer the Gemini 받아쓰기 fallback. */ allowFallback?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const voice = useVoiceInput({ maxSeconds: 15, hints, allowFallback, onFinal: (t) => setText(t) });
  const { phase, local } = voice;

  if (!isVoiceInputSupported() && voice.info?.id !== 'android') return <p className="video-status-message">이 기기에서는 음성 입력을 사용할 수 없습니다.</p>;
  return (
    <div className="mic-test" data-testid="mic-test" data-phase={phase}>
      <p className="video-status-message" style={{ margin: '0 0 6px' }}>
        버튼을 누르고 "안녕하세요"처럼 짧게 말씀하신 뒤 다시 눌러 주세요. 수업과 같은 방식으로 인식합니다.
      </p>
      <div className="modal-actions modal-actions--start">
        <button
          className={`btn btn-sm ${voice.recording ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            if (!voice.recording) setText(null);
            void voice.toggle();
          }}
          disabled={phase === 'requesting' || phase === 'recognizing' || !!voice.download}
          data-testid="mic-test-button"
        >
          {voice.recording ? '■ 말하기 끝' : '🎤 마이크 테스트'}
        </button>
        <span className="video-status-message" data-testid="mic-test-phase">
          {PHASE_LABEL[phase]}
        </span>
      </div>
      {phase === 'listening' && voice.level >= 0 && <LevelMeter level={voice.level} />}
      {text && phase === 'result' && (
        <p className="mic-test__result" data-testid="mic-test-result">
          인식된 내용: "{text}"
        </p>
      )}
      <VoiceInputPanel voice={voice} testIdPrefix="mic-test" showAutoSend={false} />
      {voice.info?.id === 'local' && local && (
        <details className="mic-test__model" data-testid="mic-test-model-settings">
          <summary>🧠 음성인식 모델 (이 Mac)</summary>
          <div className="chip-row" style={{ marginTop: 6 }}>
            {local.models.map((m) => (
              <label key={m.id} className="chip" style={{ cursor: 'pointer' }}>
                <input type="radio" name="stt-model" checked={local.model === m.id} onChange={() => void voice.setModel(m.id)} disabled={voice.recording || !!voice.download} /> {m.label}
                {m.downloaded ? ' ✓' : ''}
              </label>
            ))}
          </div>
          <p className="technique-row__sub" style={{ margin: '4px 0' }}>
            저장 위치: {local.path} · {local.downloaded ? '내려받음' : '아직 내려받지 않음'}
          </p>
          {local.downloaded && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void voice.deleteModel()} disabled={voice.recording} data-testid="mic-test-model-delete">
              이 모델 삭제
            </button>
          )}
        </details>
      )}
    </div>
  );
}
