import { useCallback, useEffect, useRef, useState } from 'react';
import { startRecording, type Recorder, type SttEngineId, type SttResult, type SttPhase } from '../../lib/voice/stt';
import { detectSttEngine, engineInfo, localModelChoice, LOCAL_MODEL_KEY, type SttEngineInfo } from '../../lib/voice/sttEngines';
import type { LocalSttStatus } from '../../lib/voice/localSttTypes';
import { stopSpeaking } from '../../lib/voice/tts';

// One voice-input controller for every place the student can talk (AI 코치,
// AI 튜터, 마이크 테스트): engine detection, the Mac's one-time model
// download, live text, errors, retry, the web/APK "AI 받아쓰기" fallback, and
// the 말 끝나면 바로 보내기 option (off by default — the recognized text goes
// into the input box to be checked/edited, then sent with the normal button).

const AUTOSEND_KEY = 'martialdex:voice-autosend';

function readAutoSend(): boolean {
  try {
    return window.localStorage.getItem(AUTOSEND_KEY) === '1';
  } catch {
    return false;
  }
}

export interface VoiceInput {
  info: SttEngineInfo | null;
  phase: SttPhase;
  partial: string;
  error: { code: string; message: string } | null;
  level: number;
  recording: boolean;
  /** The engine's own fallback can be offered now (web/APK after an engine failure). */
  canFallback: boolean;
  local: LocalSttStatus | null;
  download: { received: number; total: number } | null;
  autoSend: boolean;
  setAutoSend: (on: boolean) => void;
  start: (engine?: SttEngineId) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => void;
  toggle: () => Promise<void>;
  downloadModel: () => Promise<void>;
  cancelDownload: () => void;
  deleteModel: () => Promise<void>;
  setModel: (id: string) => Promise<void>;
  refreshLocal: () => Promise<void>;
}

export function useVoiceInput(opts: {
  maxSeconds: number;
  hints?: string[];
  /** The recognized text, once the student stops. `autoSend` = the student chose 말 끝나면 바로 보내기. */
  onFinal: (text: string, autoSend: boolean) => void;
  /** While the mic is open the coach must not talk (and is never recorded as the answer). */
  onRecordingChange?: (recording: boolean) => void;
  /** false = never offer the Gemini "AI 받아쓰기" fallback (e.g. the MARTIALDEX 자체 AI 코치, which uses no external AI). */
  allowFallback?: boolean;
}): VoiceInput {
  const [info, setInfo] = useState<SttEngineInfo | null>(null);
  const [phase, setPhase] = useState<SttPhase>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [level, setLevel] = useState(0);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [local, setLocal] = useState<LocalSttStatus | null>(null);
  const [download, setDownload] = useState<{ received: number; total: number } | null>(null);
  const [autoSend, setAutoSendState] = useState(readAutoSend);
  const recRef = useRef<Recorder | null>(null);
  const busyRef = useRef(false); // start/stop in flight — a second tap never starts a second engine
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const refreshLocal = useCallback(async () => {
    const api = window.martialdex?.stt;
    if (!api) return;
    setLocal(await api.status(localModelChoice()).catch(() => null));
  }, []);

  useEffect(() => {
    let alive = true;
    void detectSttEngine().then((i) => alive && setInfo(i));
    void refreshLocal();
    const off = window.martialdex?.stt?.onDownloadProgress((p) => setDownload({ received: p.received, total: p.total }));
    return () => {
      alive = false;
      off?.();
      recRef.current?.cancel();
      recRef.current = null;
    };
  }, [refreshLocal]);

  // live level meter
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

  const finishWith = useCallback((r: SttResult) => {
    if (r.ok) {
      setPhase('result');
      setPartial(r.text);
      optsRef.current.onFinal(r.text, readAutoSend());
    } else {
      setPhase('error');
      setError({ code: r.code, message: r.message });
      if (r.code === 'NO_MODEL') void window.martialdex?.stt?.status(localModelChoice()).then(setLocal).catch(() => undefined);
    }
  }, []);

  const start = useCallback(
    async (engine?: SttEngineId) => {
      if (busyRef.current || recRef.current) return;
      busyRef.current = true;
      setError(null);
      setPartial('');
      stopSpeaking();
      optsRef.current.onRecordingChange?.(true);
      setPhase('requesting');
      const started = await startRecording(optsRef.current.maxSeconds, {
        engine,
        hints: optsRef.current.hints,
        onPartial: (t) => setPartial(t),
        onEnded: (r) => {
          // the engine gave up by itself (network, permission revoked …)
          recRef.current?.cancel();
          recRef.current = null;
          setRecorder(null);
          optsRef.current.onRecordingChange?.(false);
          finishWith(r);
        },
      });
      busyRef.current = false;
      if (started.ok) {
        recRef.current = started.recorder;
        setRecorder(started.recorder);
        setPhase('listening');
      } else {
        optsRef.current.onRecordingChange?.(false);
        setPhase('error');
        setError({ code: started.code, message: started.message });
        if (started.code === 'NO_MODEL') void refreshLocal();
      }
    },
    [finishWith, refreshLocal],
  );

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec || busyRef.current) return;
    busyRef.current = true;
    recRef.current = null;
    setRecorder(null);
    setPhase('recognizing');
    const r = await rec.stop(optsRef.current.hints);
    busyRef.current = false;
    optsRef.current.onRecordingChange?.(false);
    finishWith(r);
  }, [finishWith]);

  const cancel = useCallback(() => {
    recRef.current?.cancel();
    recRef.current = null;
    setRecorder(null);
    busyRef.current = false;
    setPhase('idle');
    setPartial('');
    optsRef.current.onRecordingChange?.(false);
  }, []);

  const toggle = useCallback(async () => {
    if (recRef.current) await stop();
    else await start();
  }, [start, stop]);

  const downloadModel = useCallback(async () => {
    const api = window.martialdex?.stt;
    if (!api) return;
    setError(null);
    setDownload({ received: 0, total: local?.sizeBytes ?? 0 });
    const r = await api.download(localModelChoice());
    setDownload(null);
    await refreshLocal();
    if (!r.ok && r.code !== 'CANCELLED') setError({ code: r.code, message: r.message });
    if (r.ok) setPhase('idle');
  }, [local?.sizeBytes, refreshLocal]);

  const setModel = useCallback(
    async (id: string) => {
      try {
        window.localStorage.setItem(LOCAL_MODEL_KEY, id);
      } catch {}
      await refreshLocal();
    },
    [refreshLocal],
  );

  const setAutoSend = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(AUTOSEND_KEY, on ? '1' : '0');
    } catch {}
    setAutoSendState(on);
  }, []);

  const canFallback = opts.allowFallback !== false && !!info?.fallback && !!error && ['ENGINE_FAILED', 'UNSUPPORTED', 'NOT_UNDERSTOOD'].includes(error.code) && !window.martialdex?.stt;

  return {
    info,
    phase,
    partial,
    error,
    level,
    recording: !!recorder,
    canFallback,
    local,
    download,
    autoSend,
    setAutoSend,
    start,
    stop,
    cancel,
    toggle,
    downloadModel,
    cancelDownload: () => void window.martialdex?.stt?.cancelDownload(),
    deleteModel: async () => {
      await window.martialdex?.stt?.deleteModel(localModelChoice());
      await refreshLocal();
    },
    setModel,
    refreshLocal,
  };
}

const mb = (b: number) => `${Math.round(b / 1e6)}MB`;

/** Live text, model download, errors + fallback, engine label, auto-send option. */
export function VoiceInputPanel({ voice, testIdPrefix = 'voice', showAutoSend = true }: { voice: VoiceInput; testIdPrefix?: string; showAutoSend?: boolean }) {
  const { info, phase, partial, error, local, download } = voice;
  const needsModel = info?.id === 'local' && local && !local.downloaded;
  return (
    <div className="voice-input" data-testid={`${testIdPrefix}-panel`} data-engine={info?.id ?? ''} data-phase={phase}>
      {(phase === 'listening' || phase === 'recognizing') && (
        <p className="voice-input__live" data-testid={`${testIdPrefix}-partial`} aria-live="polite">
          {phase === 'listening' ? '🎙 듣는 중' : '⏳ 마무리하는 중'}
          {partial ? `: ${partial}` : '…'}
        </p>
      )}
      {needsModel && (
        <div className="voice-input__model" data-testid={`${testIdPrefix}-model`}>
          {download ? (
            <>
              <span>
                음성인식 모델 내려받는 중… {mb(download.received)} / {mb(download.total || local.sizeBytes)}
              </span>
              <div className="mic-meter">
                <div className="mic-meter__fill" style={{ width: `${download.total ? Math.round((download.received / download.total) * 100) : 0}%` }} />
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={voice.cancelDownload} data-testid={`${testIdPrefix}-model-cancel`}>
                취소
              </button>
            </>
          ) : (
            <>
              <span>이 Mac에서 직접 한국어를 인식하려면 음성인식 모델을 처음 한 번 내려받아야 합니다 ({mb(local.sizeBytes)}). 이후에는 인터넷 없이 동작합니다.</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void voice.downloadModel()} data-testid={`${testIdPrefix}-model-download`}>
                모델 내려받기
              </button>
            </>
          )}
        </div>
      )}
      {error && (error.code !== 'NO_MODEL' || /손상/.test(error.message)) && (
        <div className="ai-inline-warning" data-testid={`${testIdPrefix}-error`} data-code={error.code}>
          {error.message}
          <span className="chip-row" style={{ marginTop: 4 }}>
            {phase === 'error' && !voice.recording && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void voice.start()} data-testid={`${testIdPrefix}-retry`}>
                다시 시도
              </button>
            )}
            {voice.canFallback && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void voice.start('gemini')} data-testid={`${testIdPrefix}-fallback`}>
                {engineInfo('gemini').label}로 말하기
              </button>
            )}
          </span>
        </div>
      )}
      <p className="technique-row__sub" style={{ margin: '4px 0 0' }} data-testid={`${testIdPrefix}-engine`}>
        음성인식: {info ? info.label : '확인 중…'}
        {info?.id === 'local' ? ' · 모델을 받은 뒤에는 인터넷 없이 동작하고, 음성은 이 Mac 밖으로 나가지 않습니다' : info?.id === 'web' ? ' · 브라우저가 자체 음성 서버를 쓸 수 있어 오프라인은 보장되지 않습니다' : info?.id === 'android' ? ' · 기기 설정에 따라 서버를 쓸 수 있어 오프라인은 보장되지 않습니다' : ''}
      </p>
      {showAutoSend && (
        <label className="tutor-voice__check" style={{ marginTop: 2 }}>
          <input type="checkbox" checked={voice.autoSend} onChange={(e) => voice.setAutoSend(e.target.checked)} data-testid={`${testIdPrefix}-autosend`} /> 말이 끝나면 바로 보내기 (끄면 입력창에서 확인·수정 후 보내기)
        </label>
      )}
    </div>
  );
}
