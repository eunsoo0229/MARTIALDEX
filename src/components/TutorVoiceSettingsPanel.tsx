import { useEffect, useState } from 'react';
import { isKoreanVoice, isTtsSupported, listVoices, speak, stopSpeaking } from '../lib/voice/tts';
import {
  clampRate,
  formatRate,
  getTutorVoiceSettings,
  RATE_PRESETS,
  saveTutorVoiceSettings,
  TUTOR_RATE_MAX,
  TUTOR_RATE_MIN,
  TUTOR_RATE_STEP,
  type TutorVoiceSettings,
} from '../lib/voice/tutorVoiceSettings';

// "AI 튜터 음성 / 말하기 속도". Lists ONLY the voices this device's TTS
// (Web Speech API) really provides — Korean voices first, since the tutor
// speaks Korean; other-language voices only on request, with a warning.
// `autoSave` (before a lesson) saves on every change; otherwise (during a
// lesson) changes are a draft until [적용], and apply from the next line.

const PREVIEW_TEXT = '안녕하세요. 저는 MARTIALDEX AI 튜터입니다. 이 목소리와 속도로 수업을 진행하겠습니다.';

export default function TutorVoiceSettingsPanel({ autoSave = false, onApplied }: { autoSave?: boolean; onApplied?: () => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [draft, setDraft] = useState<TutorVoiceSettings>(getTutorVoiceSettings);
  const [showOther, setShowOther] = useState(false);
  const [applied, setApplied] = useState(false);
  const supported = isTtsSupported();

  useEffect(() => {
    let active = true;
    void listVoices().then((v) => {
      if (active) setVoices(v);
    });
    const onChange = () => void listVoices().then((v) => active && setVoices(v));
    if (supported) window.speechSynthesis.addEventListener('voiceschanged', onChange);
    return () => {
      active = false;
      if (supported) window.speechSynthesis.removeEventListener('voiceschanged', onChange);
    };
  }, [supported]);

  if (!supported) {
    return (
      <div className="tutor-voice" data-testid="tutor-voice-settings" data-supported="false">
        <p className="video-status-message">이 기기에서는 음성 출력(TTS)을 지원하지 않아 음성·속도를 바꿀 수 없습니다. 코치 답변은 글로 표시됩니다.</p>
      </div>
    );
  }

  const korean = (voices ?? []).filter(isKoreanVoice);
  const other = (voices ?? []).filter((v) => !isKoreanVoice(v));
  const savedMissing = !!draft.aiTutorVoice && voices !== null && !voices.some((v) => v.voiceURI === draft.aiTutorVoice);
  const chosenIsOther = !!draft.aiTutorVoice && other.some((v) => v.voiceURI === draft.aiTutorVoice);

  function update(next: Partial<TutorVoiceSettings>) {
    const merged = { ...draft, ...next };
    setDraft(merged);
    setApplied(false);
    if (autoSave) saveTutorVoiceSettings(merged);
  }

  function preview() {
    stopSpeaking();
    speak(PREVIEW_TEXT, { interrupt: true, settings: draft });
  }

  function apply() {
    saveTutorVoiceSettings(draft);
    setApplied(true);
    onApplied?.();
  }

  return (
    <div className="tutor-voice" data-testid="tutor-voice-settings" data-supported="true">
      <label className="field-label" htmlFor="tutor-voice-select">
        AI 튜터 음성
      </label>
      <div className="tutor-voice__row">
        <select
          id="tutor-voice-select"
          className="select"
          data-testid="tutor-voice-select"
          value={savedMissing ? '' : (draft.aiTutorVoice ?? '')}
          onChange={(e) => update({ aiTutorVoice: e.target.value || null })}
          disabled={voices === null}
        >
          <option value="">기본 음성 (시스템 한국어)</option>
          {korean.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
              {v.default ? ' · 기본' : ''}
              {v.localService ? '' : ' · 온라인'}
            </option>
          ))}
          {(showOther || chosenIsOther) && other.length > 0 && (
            <optgroup label="다른 언어 음성 (한국어 발음이 부정확할 수 있음)">
              {other.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" data-testid="tutor-voice-preview" onClick={preview}>
          ▶ 미리듣기
        </button>
      </div>
      <p className="video-status-message" data-testid="tutor-voice-count">
        {voices === null
          ? '이 기기의 음성 목록을 불러오는 중…'
          : `이 기기에서 쓸 수 있는 한국어 음성 ${korean.length}개${korean.length <= 1 ? ' · 운영체제 설정에서 한국어 음성을 추가로 설치하면 여기에 나타납니다.' : ''}`}
      </p>
      {savedMissing && <p className="ai-inline-warning">저장된 음성이 이 기기에 없어 기본 음성으로 읽습니다.</p>}
      {other.length > 0 && (
        <label className="tutor-voice__check">
          <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} data-testid="tutor-voice-show-other" /> 다른 언어 음성도 보기
        </label>
      )}

      <label className="field-label" htmlFor="tutor-rate">
        말하기 속도 <strong data-testid="tutor-rate-value">{formatRate(draft.aiTutorSpeechRate)}</strong>
      </label>
      <div className="tutor-voice__row">
        <span className="tutor-voice__bound">{formatRate(TUTOR_RATE_MIN)}</span>
        <input
          id="tutor-rate"
          type="range"
          min={TUTOR_RATE_MIN}
          max={TUTOR_RATE_MAX}
          step={TUTOR_RATE_STEP}
          value={draft.aiTutorSpeechRate}
          data-testid="tutor-rate-slider"
          onChange={(e) => update({ aiTutorSpeechRate: clampRate(Number(e.target.value)) })}
          style={{ flex: 1 }}
        />
        <span className="tutor-voice__bound">{formatRate(TUTOR_RATE_MAX)}</span>
      </div>
      <div className="chip-row">
        {RATE_PRESETS.map((p) => (
          <button key={p.rate} type="button" className={`chip ${draft.aiTutorSpeechRate === p.rate ? 'active' : ''}`} data-testid={`tutor-rate-preset-${p.rate}`} onClick={() => update({ aiTutorSpeechRate: p.rate })}>
            {p.label} {formatRate(p.rate)}
          </button>
        ))}
      </div>

      {!autoSave && (
        <div className="modal-actions modal-actions--start" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn-primary btn-sm" data-testid="tutor-voice-apply" onClick={apply}>
            적용
          </button>
          {applied && (
            <span className="video-status-message" data-testid="tutor-voice-applied">
              다음 음성부터 적용됩니다.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
