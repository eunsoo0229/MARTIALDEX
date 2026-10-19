import { useEffect, useState } from 'react';
import { getTtsState, isTtsSupported, pauseSpeaking, resumeSpeaking, speak, stopSpeaking, TTS_EVENT, type TtsState } from '../../lib/voice/tts';
import { isVoiceInputSupported } from '../../lib/voice/stt';
import { LevelMeter, PHASE_LABEL } from '../MicTestPanel';
import { useVoiceInput, VoiceInputPanel } from '../voice/useVoiceInput';
import TutorVoiceSettingsPanel from '../TutorVoiceSettingsPanel';

export function useTtsState(): TtsState {
  const [s, setS] = useState<TtsState>(getTtsState);
  useEffect(() => {
    const on = () => setS(getTtsState());
    window.addEventListener(TTS_EVENT, on);
    return () => window.removeEventListener(TTS_EVENT, on);
  }, []);
  return s;
}

const MAX_RECORD_SECONDS = 60;

/**
 * The AI 코치's voice controls in one place: what the coach's voice is doing
 * (really playing / paused / failed — from the engine's own events), pause /
 * resume / stop, a playback test, and the student's microphone (this
 * platform's speech engine → the recognized text goes to the input box via
 * `onDraft` to be checked and sent, or straight to `onTranscript` when the
 * student turned on 말이 끝나면 바로 보내기). Any voice failure is shown with
 * its reason; typing always works.
 */
export default function CoachVoiceBar(props: {
  voiceOn: boolean;
  onToggleVoice: (on: boolean) => void;
  onTranscript: (text: string) => void;
  /** Recognized text to put in the input box (checked/edited by the student, then sent). */
  onDraft?: (text: string) => void;
  /** Names likely to be said (technique names) — helps transcription spelling. */
  hints: string[];
  disabled?: boolean;
  /** While the mic is open, coach lines must wait (never talk over the student). */
  onRecordingChange?: (recording: boolean) => void;
  /** false = never offer the Gemini 받아쓰기 fallback (the MARTIALDEX 자체 AI 코치 uses no external AI). */
  allowFallback?: boolean;
}) {
  const tts = useTtsState();
  const [heard, setHeard] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const ttsOk = isTtsSupported();
  const micOk = isVoiceInputSupported();
  // The coach stops talking while the student speaks (and its voice is never recorded as the answer).
  const voice = useVoiceInput({
    maxSeconds: MAX_RECORD_SECONDS,
    hints: props.hints,
    allowFallback: props.allowFallback,
    onRecordingChange: props.onRecordingChange,
    onFinal: (text, autoSend) => {
      setHeard(text);
      if (autoSend || !props.onDraft) props.onTranscript(text);
      else props.onDraft(text);
    },
  });
  const phase = voice.phase;

  async function testVoice() {
    setTest('재생 중…');
    const r = await speak('음성 안내 테스트입니다. 이 말이 들리면 AI 코치의 음성이 정상입니다.', { interrupt: true });
    setTest(r.ok ? `재생됨 (${(r.playedMs / 1000).toFixed(1)}초)` : r.reason === 'failed' ? `재생 실패: ${r.message ?? ''}` : r.reason === 'unsupported' ? '이 기기는 음성 재생을 지원하지 않습니다.' : '중지되었습니다.');
  }

  const statusLabel = !ttsOk
    ? '이 기기에서는 음성 재생(TTS)을 지원하지 않아 글로만 안내합니다.'
    : !props.voiceOn
      ? '음성 안내 꺼짐'
      : tts.status === 'speaking'
        ? '🔊 AI 코치가 말하는 중'
        : tts.status === 'paused'
          ? '⏸ 음성 일시정지'
          : '음성 안내 켜짐';

  return (
    <div className="card info-card coach-voice-bar" data-testid="coach-voice-bar" data-tts={tts.status} data-voice-on={String(props.voiceOn)}>
      <div className="coach-voice-bar__row">
        <span className="coach-voice-bar__status" data-testid="coach-tts-status">
          {statusLabel}
        </span>
        {ttsOk && (
          <>
            <label className="coach-voice-bar__toggle">
              <input type="checkbox" checked={props.voiceOn} onChange={(e) => props.onToggleVoice(e.target.checked)} data-testid="coach-voice-toggle" /> 음성 안내
            </label>
            {tts.status === 'speaking' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={pauseSpeaking} data-testid="coach-tts-pause">
                ⏸ 일시정지
              </button>
            )}
            {tts.status === 'paused' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resumeSpeaking} data-testid="coach-tts-resume">
                ▶ 계속
              </button>
            )}
            {(tts.status === 'speaking' || tts.status === 'paused') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={stopSpeaking} data-testid="coach-tts-stop">
                ■ 그만 말하기
              </button>
            )}
          </>
        )}
      </div>
      {tts.lastError && props.voiceOn && (
        <p className="ai-inline-warning" data-testid="coach-tts-error" style={{ margin: '6px 0 0' }}>
          {tts.lastError}
        </p>
      )}

      <div className="coach-voice-bar__row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`btn ${voice.recording ? 'btn-primary coach-mic--on' : 'btn-secondary'} coach-mic`}
          disabled={!micOk || phase === 'recognizing' || phase === 'requesting' || props.disabled || !!voice.download}
          onClick={() => void voice.toggle()}
          data-testid="coach-mic"
          data-phase={phase}
        >
          {voice.recording ? '■ 말하기 끝' : phase === 'recognizing' ? '알아듣는 중…' : '🎙 말해서 답하기 · 질문하기'}
        </button>
        {voice.recording && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={voice.cancel} data-testid="coach-mic-cancel">
            취소
          </button>
        )}
      </div>
      {(phase === 'listening' || phase === 'requesting' || phase === 'recognizing') && (
        <p className="video-status-message" data-testid="coach-mic-phase" style={{ margin: '6px 0 0' }}>
          {PHASE_LABEL[phase]}
        </p>
      )}
      {phase === 'listening' && voice.level >= 0 && <LevelMeter level={voice.level} />}
      {heard && phase === 'result' && (
        <p className="video-status-message" data-testid="coach-heard" style={{ margin: '6px 0 0' }}>
          알아들은 말: “{heard}”{voice.autoSend || !props.onDraft ? '' : ' — 입력창에서 확인한 뒤 보내기를 눌러 주세요.'}
        </p>
      )}
      {!micOk && <p className="video-status-message">이 기기에서는 음성 입력을 사용할 수 없습니다. 아래 입력창에 적어서 대화해 주세요.</p>}
      <VoiceInputPanel voice={voice} testIdPrefix="coach-voice" showAutoSend={!!props.onDraft} />

      {ttsOk && (
        <details className="coach-voice-bar__settings">
          <summary>🔊 음성 설정 · 재생 테스트</summary>
          <div className="modal-actions modal-actions--start" style={{ margin: '6px 0' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void testVoice()} data-testid="coach-tts-test">
              음성 재생 테스트
            </button>
            {test && (
              <span className="video-status-message" data-testid="coach-tts-test-result">
                {test}
              </span>
            )}
          </div>
          <TutorVoiceSettingsPanel />
        </details>
      )}
    </div>
  );
}
