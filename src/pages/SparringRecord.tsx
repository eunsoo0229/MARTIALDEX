import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PluginListenerHandle } from '@capacitor/core';
import BackButton from '../components/BackButton';
import {
  captureThumbnail,
  detectDualCameraSupport,
  openCamera,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopCameraStream,
  stopRecording,
  type CameraStreamHandle,
  type RecorderHandle,
} from '../lib/sparringVideo/camera';
import {
  deleteSparringVideo,
  resolvePlayableSrc,
  saveNativeRecording,
  saveRecording,
  updateSparringVideoNotes,
  updateSparringVideoThumbnail,
} from '../lib/sparringVideo/service';
import { acquireRecordingWakeLock, reacquireWakeLockOnVisible, releaseRecordingWakeLock } from '../lib/sparringVideo/wakeLock';
import { SparringCamera, isNativeAndroidRecordingAvailable, toNativeFacing } from '../lib/sparringVideo/nativeCameraPlugin';
import type { CameraFacing, SparringVideo } from '../lib/sparringVideo/types';

type Phase = 'checking' | 'permission-denied' | 'ready' | 'recording' | 'paused' | 'saving' | 'saved';
type CameraChoice = 'environment' | 'user' | 'dual';

interface Slot {
  facing: CameraFacing;
  streamHandle: CameraStreamHandle;
  recorderHandle: RecorderHandle | null;
  blob: Blob | null;
  thumbnailDataUrl?: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Set once handleStop() auto-saves this slot — lets the "saved" screen edit/delete the real persisted record. */
  savedVideoId?: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A recording page, not a modal — the "촬영 중" state needs to be
// unmissable and full-screen so it lives at its own route rather than
// layered over whatever the user was doing. Camera only ever opens once the
// user has navigated here AND explicitly tapped "촬영 시작" — never on mount.
//
// Two entirely different recording backends, picked once per mount via
// nativeMode:
//  - Native Android (nativeMode === true): drives SparringCamera, a custom
//    Capacitor plugin backed by a CameraX foreground Service
//    (android/.../BackgroundRecordingService.java). This is the ONLY path
//    that genuinely survives the screen turning off or the app being
//    backgrounded — Android suspends a WebView's getUserMedia() stream the
//    moment the app leaves the foreground (an OS media-session policy no
//    JS can override), but a proper camera-type foreground service is the
//    OS-sanctioned way around that, same mechanism dash-cam/screen-recorder
//    apps use. Trade-off: no live preview while recording (see the
//    "촬영 중" status card below) — only an elapsed-time readout.
//  - Everywhere else (web/Electron/iOS): the original getUserMedia()/
//    MediaRecorder path in camera.ts, kept exactly as before, with
//    wakeLock.ts doing its best to keep the screen from turning off (an
//    honest best-effort, not a guarantee, on those platforms).
export default function SparringRecord() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedTrainingEntryId = searchParams.get('trainingEntryId') ?? undefined;
  const linkedSparringSessionId = searchParams.get('sparringSessionId') ?? undefined;
  const nativeMode = isNativeAndroidRecordingAvailable();

  const [phase, setPhase] = useState<Phase>('checking');
  const [dualSupported, setDualSupported] = useState(false);
  const [cameraChoice, setCameraChoice] = useState<CameraChoice>('environment');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [nativeSavedVideo, setNativeSavedVideo] = useState<SparringVideo | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const tickRef = useRef<number | undefined>(undefined);
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = slots;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const nativeListenersRef = useRef<PluginListenerHandle[]>([]);

  async function detachNativeListeners() {
    const handles = nativeListenersRef.current;
    nativeListenersRef.current = [];
    for (const h of handles) await h.remove().catch(() => {});
  }

  async function attachNativeListeners() {
    await detachNativeListeners();
    const tickHandle = await SparringCamera.addListener('recordingTick', (e) => {
      setElapsedMs(e.elapsedMs);
    });
    const errorHandle = await SparringCamera.addListener('recordingError', (e) => {
      setError(e.message);
      // An error arriving while we're still in 'recording'/'paused' means the
      // service gave up (camera bind failure, disk error, etc.) and already
      // stopped itself — reflect that here instead of leaving the UI stuck
      // showing a "촬영 중" state for a recording that no longer exists.
      if (phaseRef.current === 'recording' || phaseRef.current === 'paused') {
        void detachNativeListeners();
        setPhase('ready');
      }
    });
    nativeListenersRef.current = [tickHandle, errorHandle];
  }

  function attachNativeThumbnail(videoId: string, filePath: string): Promise<void> {
    // Native recordings have no live <video> element to grab a frame from
    // during capture (no preview — see the class doc comment above), so the
    // thumbnail is generated after the fact from the saved file, off-DOM,
    // and attached asynchronously — best-effort, never blocks the "저장됨"
    // transition.
    return new Promise((resolve) => {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener('loadeddata', onLoaded);
        el.removeEventListener('error', onError);
        resolve();
      };
      const onLoaded = () => {
        const thumb = captureThumbnail(el);
        if (thumb) {
          const updated = updateSparringVideoThumbnail(videoId, thumb);
          if (updated) setNativeSavedVideo((prev) => (prev && prev.id === videoId ? updated : prev));
        }
        finish();
      };
      const onError = () => finish();
      el.addEventListener('loadeddata', onLoaded);
      el.addEventListener('error', onError);
      el.src = resolvePlayableSrc(filePath);
      window.setTimeout(finish, 4000);
    });
  }

  // Capability probe — never assumes every device supports two
  // simultaneous camera streams. Opens/closes trial streams once, up front,
  // before any real recording stream exists. Native Android skips this
  // entirely: it never opens a getUserMedia() probe stream (would fight the
  // CameraX Service for the camera), and doesn't support simultaneous
  // dual-camera capture, so dualSupported stays false there — the "전면+후면
  // 동시" chip below is hidden automatically as a result.
  useEffect(() => {
    if (nativeMode) {
      setPhase('ready');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supported = await detectDualCameraSupport();
        if (cancelled) return;
        setDualSupported(supported);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('permission-denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-request the screen wake lock if it was released while the tab/app
  // was hidden (browser-mandated behavior) and we're still recording —
  // see wakeLock.ts.
  useEffect(() => {
    return reacquireWakeLockOnVisible(() => phaseRef.current === 'recording' || phaseRef.current === 'paused');
  }, []);

  // Release every camera stream/recorder + the wake lock on unmount,
  // whatever phase we're in.
  useEffect(() => {
    return () => {
      window.clearInterval(tickRef.current);
      if (nativeMode) {
        // Deliberately NOT stopping/discarding an active native recording
        // here — the entire point of the foreground service is that it
        // keeps running independent of this component's lifecycle (locking
        // the screen or switching apps does not unmount this page, it just
        // hides the WebView). Only drop this instance's own listeners so
        // they don't leak/double-fire if the page mounts again.
        void detachNativeListeners();
        return;
      }
      for (const slot of slotsRef.current) {
        if (slot.recorderHandle && slot.recorderHandle.recorder.state !== 'inactive') slot.recorderHandle.recorder.stop();
        stopCameraStream(slot.streamHandle);
      }
      void releaseRecordingWakeLock();
    };
  }, []);

  async function handleStart() {
    setError(null);
    if (nativeMode) {
      try {
        let status = await SparringCamera.checkPermissions();
        if (status.camera !== 'granted' || status.microphone !== 'granted' || status.notifications === 'denied') {
          status = await SparringCamera.requestPermissions();
        }
        if (status.camera !== 'granted' || status.microphone !== 'granted') {
          setPhase('permission-denied');
          setError('카메라/마이크 권한이 필요합니다. 시스템 설정에서 권한을 허용해주세요.');
          return;
        }
        await attachNativeListeners();
        const facing = toNativeFacing(cameraChoice === 'user' ? 'user' : 'environment');
        await SparringCamera.startRecording({ facing });
        startedAtRef.current = Date.now();
        pausedAccumRef.current = 0;
        setElapsedMs(0);
        setPhase('recording');
      } catch (e) {
        await detachNativeListeners();
        setPhase('permission-denied');
        setError(e instanceof Error ? e.message : '카메라를 시작할 수 없습니다.');
      }
      return;
    }

    try {
      const facings: CameraFacing[] = cameraChoice === 'dual' ? ['user', 'environment'] : [cameraChoice];
      const opened = await Promise.all(facings.map((f) => openCamera(f)));
      const newSlots: Slot[] = opened.map((streamHandle) => ({
        facing: streamHandle.facing,
        streamHandle,
        recorderHandle: null,
        blob: null,
        videoRef: { current: null },
      }));
      setSlots(newSlots);
      // Attach live preview once refs exist (next tick after render).
      requestAnimationFrame(() => {
        for (const slot of newSlots) {
          if (slot.videoRef.current) slot.videoRef.current.srcObject = slot.streamHandle.stream;
        }
      });
      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      const started = newSlots.map((slot) => ({ ...slot, recorderHandle: startRecording(slot.streamHandle) }));
      setSlots(started);
      setPhase('recording');
      void acquireRecordingWakeLock();
      tickRef.current = window.setInterval(() => {
        if (startedAtRef.current !== null) setElapsedMs(Date.now() - startedAtRef.current - pausedAccumRef.current);
      }, 250);
    } catch {
      setPhase('permission-denied');
      setError('카메라 권한이 필요합니다. 브라우저/시스템 설정에서 카메라 접근을 허용해주세요.');
    }
  }

  function handlePause() {
    if (phase !== 'recording') return;
    if (nativeMode) {
      void SparringCamera.pauseRecording();
    } else {
      for (const slot of slotsRef.current) if (slot.recorderHandle) pauseRecording(slot.recorderHandle);
    }
    pausedAtRef.current = Date.now();
    setPhase('paused');
  }

  function handleResume() {
    if (phase !== 'paused') return;
    if (pausedAtRef.current !== null) pausedAccumRef.current += Date.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    if (nativeMode) {
      void SparringCamera.resumeRecording();
    } else {
      for (const slot of slotsRef.current) if (slot.recorderHandle) resumeRecording(slot.recorderHandle);
    }
    setPhase('recording');
  }

  // Stops recording and immediately, automatically persists every slot to
  // disk (spec: "촬영본 자동 저장") — nothing is left as an unsaved blob
  // waiting on a manual "저장" tap. The following screen still lets the
  // user add notes (updates the now-real record) or delete a take they
  // don't want (deletes the now-real record) — auto-save just means the
  // clip can never be lost to an accidental navigation/crash between
  // "촬영 종료" and a separate save step.
  async function handleStop() {
    window.clearInterval(tickRef.current);
    void releaseRecordingWakeLock();

    if (nativeMode) {
      setPhase('saving');
      try {
        const result = await SparringCamera.stopRecording();
        await detachNativeListeners();
        if (!result.filePath) {
          setError('영상 저장에 실패했습니다.');
          setPhase('ready');
          return;
        }
        const { video } = saveNativeRecording({
          filePath: result.filePath,
          facing: cameraChoice === 'user' ? 'user' : 'environment',
          durationSeconds: result.durationSeconds,
          linkedTrainingEntryId,
          linkedSparringSessionId,
          notes: null,
          fileSizeBytes: result.fileSizeBytes,
        });
        setNativeSavedVideo(video);
        setElapsedMs(result.durationSeconds * 1000);
        setPhase('saved');
        void attachNativeThumbnail(video.id, result.filePath);
      } catch (e) {
        await detachNativeListeners();
        setError(e instanceof Error ? e.message : '영상 저장에 실패했습니다.');
        setPhase('ready');
      }
      return;
    }

    const durationSeconds = Math.round(elapsedMs / 1000);
    const pairId = slotsRef.current.length > 1 ? crypto.randomUUID() : undefined;

    const finished = await Promise.all(
      slotsRef.current.map(async (slot) => {
        const thumbnailDataUrl = slot.videoRef.current ? captureThumbnail(slot.videoRef.current) : undefined;
        const blob = slot.recorderHandle ? await stopRecording(slot.recorderHandle) : null;
        stopCameraStream(slot.streamHandle);
        return { ...slot, blob, thumbnailDataUrl };
      })
    );
    setPhase('saving');

    const saved = await Promise.all(
      finished.map(async (slot) => {
        if (!slot.blob) return { ...slot, savedVideoId: undefined };
        const result = await saveRecording({
          blob: slot.blob,
          facing: slot.facing,
          cameraMode: finished.length > 1 ? 'dual' : 'single',
          durationSeconds,
          thumbnailDataUrl: slot.thumbnailDataUrl,
          pairId,
          linkedTrainingEntryId,
          linkedSparringSessionId,
          notes: null,
        });
        return { ...slot, savedVideoId: result.ok ? result.video.id : undefined, saveError: result.ok ? undefined : result.message };
      })
    );

    const failedSlot = saved.find((s) => !s.savedVideoId);
    if (failedSlot) {
      setError((failedSlot as { saveError?: string }).saveError ?? '영상 저장에 실패했습니다.');
    }
    setSlots(saved);
    setPhase('saved');
  }

  function handleNotesBlur() {
    setNotesSaved(false);
    if (nativeMode && nativeSavedVideo) {
      const updated = updateSparringVideoNotes(nativeSavedVideo.id, notes);
      if (updated) setNativeSavedVideo(updated);
    } else {
      for (const slot of slotsRef.current) {
        if (slot.savedVideoId) updateSparringVideoNotes(slot.savedVideoId, notes);
      }
    }
    setNotesSaved(true);
  }

  // Deletes the already-auto-saved clip(s) for this take — unlike the old
  // "삭제" (which just discarded an in-memory, not-yet-saved blob), this now
  // has to actually remove the persisted file+record, since auto-save
  // already wrote it.
  async function handleDeleteSavedTake() {
    if (nativeMode && nativeSavedVideo) {
      const result = await deleteSparringVideo(nativeSavedVideo.id);
      if (!result.ok) {
        setError(result.message ?? '영상을 삭제하지 못했습니다.');
        return;
      }
      resetToReady();
      return;
    }
    for (const slot of slotsRef.current) {
      if (slot.savedVideoId) {
        const result = await deleteSparringVideo(slot.savedVideoId);
        // A dual-camera take has two independent files/records — if one
        // genuinely fails to delete, stop here rather than silently
        // resetting as if the whole take was cleanly removed.
        if (!result.ok) {
          setError(result.message ?? '영상을 삭제하지 못했습니다.');
          return;
        }
      }
    }
    resetToReady();
  }

  function resetToReady() {
    for (const slot of slotsRef.current) stopCameraStream(slot.streamHandle);
    setSlots([]);
    setNativeSavedVideo(null);
    setElapsedMs(0);
    setNotes('');
    setNotesSaved(false);
    setError(null);
    setPhase('ready');
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/sparring" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/sparring">스파링 분석</Link>
          <span>/</span>
          <span>스파링 촬영</span>
        </div>
        <div className="section-title">
          <h2>🎥 스파링 촬영</h2>
        </div>

        {phase === 'checking' && <p className="video-status-message">카메라 지원 여부를 확인하는 중...</p>}

        {phase === 'permission-denied' && (
          <div className="card info-card">
            <p className="video-status-message">{error ?? '카메라를 사용할 수 없습니다.'}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              다시 시도
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <div className="card info-card">
            <label className="field-label">촬영 카메라</label>
            <div className="chip-row" style={{ marginTop: 6, marginBottom: 10 }}>
              <button type="button" className={`chip ${cameraChoice === 'environment' ? 'active' : ''}`} onClick={() => setCameraChoice('environment')}>
                📷 후면
              </button>
              <button type="button" className={`chip ${cameraChoice === 'user' ? 'active' : ''}`} onClick={() => setCameraChoice('user')}>
                🤳 전면
              </button>
              {dualSupported && (
                <button type="button" className={`chip ${cameraChoice === 'dual' ? 'active' : ''}`} onClick={() => setCameraChoice('dual')}>
                  🎬 전면+후면 동시
                </button>
              )}
            </div>
            {!dualSupported && !nativeMode && (
              <p className="video-status-message">이 기기는 전면·후면 동시 촬영을 지원하지 않아 한 번에 하나의 카메라만 사용할 수 있습니다.</p>
            )}
            {nativeMode ? (
              <p className="video-status-message">
                촬영을 시작하면 카메라·마이크·알림 권한을 요청합니다(안드로이드는 카메라를 사용하는 동안 상태
                표시줄에 "촬영 중" 알림을 계속 표시해야 합니다 — 앱이 아닌 OS 정책입니다). 화면이 꺼지거나 다른
                앱으로 전환해도 촬영은 계속되며, 종료하면 자동으로 저장됩니다. 촬영 중에는 배터리 절약을 위해
                미리보기 화면 대신 경과 시간만 표시됩니다.
              </p>
            ) : (
              <p className="video-status-message">
                촬영을 시작하면 카메라 권한을 요청합니다. 화면이 꺼지지 않도록 자동으로 방지하며, 화면이 잠기거나
                앱이 백그라운드로 전환되어도 이 앱이 계속 실행되는 한 촬영은 계속됩니다(기기/운영체제 제약으로 완전히
                보장되지는 않을 수 있습니다). 촬영이 끝나면 자동으로 저장됩니다.
              </p>
            )}
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleStart}>
                촬영 시작
              </button>
              <Link className="btn btn-secondary" to="/sparring/videos">
                📼 촬영 목록
              </Link>
            </div>
            {error && <p className="video-status-message" style={{ color: 'var(--accent)' }}>{error}</p>}
          </div>
        )}

        {(phase === 'recording' || phase === 'paused') && (
          <div className="card info-card">
            <div className="chip-row" style={{ alignItems: 'center', marginBottom: 10 }}>
              {phase === 'recording' && (
                <span className="chip active" style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}>
                  ● REC {formatElapsed(elapsedMs)}
                </span>
              )}
              {phase === 'paused' && <span className="chip">⏸ 일시정지 {formatElapsed(elapsedMs)}</span>}
            </div>
            {nativeMode ? (
              <div className="card info-card text-center">
                <p style={{ fontSize: 40, margin: '4px 0' }}>🎥</p>
                <p className="video-status-message">카메라가 백그라운드에서도 계속 녹화 중입니다. 미리보기는 지원되지 않습니다.</p>
              </div>
            ) : (
              <div className="sparring-record-grid">
                {slots.map((slot, i) => (
                  <video key={i} ref={slot.videoRef} autoPlay muted playsInline className="sparring-record-video" />
                ))}
              </div>
            )}
            <div className="modal-actions">
              {phase === 'recording' ? (
                <button className="btn btn-secondary" onClick={handlePause}>
                  일시정지
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={handleResume}>
                  재개
                </button>
              )}
              <button className="btn btn-primary" onClick={handleStop}>
                촬영 종료
              </button>
            </div>
          </div>
        )}

        {phase === 'saving' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> 영상을 저장하는 중...
            </p>
          </div>
        )}

        {phase === 'saved' && (
          <div className="card info-card">
            <p className="video-status-message">✓ 자동으로 저장되었습니다. 촬영 시간: {formatElapsed(elapsedMs)}</p>
            <div className="sparring-record-grid">
              {nativeMode
                ? nativeSavedVideo && (
                    <video src={resolvePlayableSrc(nativeSavedVideo.localUri)} controls playsInline className="sparring-record-video" />
                  )
                : slots.map((slot, i) =>
                    slot.blob ? <video key={i} src={URL.createObjectURL(slot.blob)} controls playsInline className="sparring-record-video" /> : null
                  )}
            </div>
            <label className="field-label" style={{ display: 'block', marginTop: 10 }}>
              메모 (선택)
              <textarea
                style={{ width: '100%', minHeight: 60 }}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesSaved(false);
                }}
                onBlur={handleNotesBlur}
                placeholder="예: 3라운드, 상대 라이트급"
              />
            </label>
            {notesSaved && <p className="video-status-message">메모가 저장되었습니다.</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={handleDeleteSavedTake}>
                이 촬영본 삭제
              </button>
              <Link className="btn btn-secondary" to="/sparring/videos">
                촬영한 영상 목록
              </Link>
              <button className="btn btn-primary" onClick={resetToReady}>
                새로 촬영
              </button>
            </div>
            {error && <p className="video-status-message" style={{ color: 'var(--accent)' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
