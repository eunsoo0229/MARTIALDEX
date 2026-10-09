import { useEffect, useRef, useState } from 'react';
import { isVoiceInputSupported, startRecording, type Recorder, type SttPhase } from '../lib/voice/stt';
import { stopSpeaking } from '../lib/voice/tts';

// 🎤 마이크 테스트 — the SAME recording + transcription path the lesson uses
// (stt.ts), so a pass here means the lesson's mic answer will work too.
// Shows each stage (권한 요청 → 듣는 중 + 입력 레벨 → 인식 중 → 결과/오류).

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

export default function MicTestPanel({ hints = [] }: { hints?: string[] }) {
  const [phase, setPhase] = useState<SttPhase>('idle');
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const level = useInputLevel(phase === 'listening' ? recorder : null);
  const recRef = useRef<Recorder | null>(null);
  useEffect(() => () => recRef.current?.cancel(), []);

  async function toggle() {
    if (phase === 'listening' && recorder) {
      setPhase('recognizing');
      const r = await recorder.stop(hints);
      recRef.current = null;
      setRecorder(null);
      if (r.ok) {
        setText(r.text);
        setPhase('result');
      } else {
        setError(r.message);
        setPhase('error');
      }
      return;
    }
    stopSpeaking();
    setText(null);
    setError(null);
    setPhase('requesting');
    const s = await startRecording(8);
    if (!s.ok) {
      setError(s.message);
      setPhase('error');
      return;
    }
    recRef.current = s.recorder;
    setRecorder(s.recorder);
    setPhase('listening');
  }

  if (!isVoiceInputSupported()) return <p className="video-status-message">이 기기에서는 음성 입력을 사용할 수 없습니다.</p>;
  return (
    <div className="mic-test" data-testid="mic-test" data-phase={phase}>
      <p className="video-status-message" style={{ margin: '0 0 6px' }}>
        버튼을 누르고 "안녕하세요"처럼 짧게 말씀하신 뒤 다시 눌러 주세요. 수업과 같은 방식으로 인식합니다.
      </p>
      <div className="modal-actions modal-actions--start">
        <button className={`btn btn-sm ${phase === 'listening' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => void toggle()} disabled={phase === 'requesting' || phase === 'recognizing'} data-testid="mic-test-button">
          {phase === 'listening' ? '■ 말하기 끝' : '🎤 마이크 테스트'}
        </button>
        <span className="video-status-message" data-testid="mic-test-phase">
          {PHASE_LABEL[phase]}
        </span>
      </div>
      {phase === 'listening' && <LevelMeter level={level} />}
      {text && (
        <p className="mic-test__result" data-testid="mic-test-result">
          인식된 내용: "{text}"
        </p>
      )}
      {error && (
        <p className="ai-inline-warning" data-testid="mic-test-error">
          {error}
        </p>
      )}
    </div>
  );
}
