import { useCallback, useEffect, useRef, useState } from 'react';
import type { Technique } from '../types';
import type { PoseFrame } from '../lib/poseAnalysis/types';
import { POSE_CONNECTIONS } from '../lib/poseAnalysis/landmarks';
import { createPoseLandmarker, type PoseLandmarker } from '../lib/poseAnalysis/poseEstimator';
import { analyzeTechnique, type AnalyzeOutcome } from '../lib/poseAnalysis/analyzeTechnique';
import { saveAnalysisResult } from '../lib/poseAnalysis/recordsService';
import { STATUS_ICON, STATUS_LABEL } from '../lib/poseAnalysis/scoring';
import AiAskModal from './AiAskModal';

const RECORDING_MS = 4000;
const COUNTDOWN_SECONDS = 5;

type Phase = 'requesting' | 'denied' | 'loading-model' | 'model-error' | 'ready' | 'countdown' | 'recording' | 'result';

export default function PoseAnalysisModal({ technique, onClose }: { technique: Technique; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('requesting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AnalyzeOutcome | null>(null);
  const [recordingMsLeft, setRecordingMsLeft] = useState(RECORDING_MS);
  const [countdownSecondsLeft, setCountdownSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [aiOpen, setAiOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const recordingRef = useRef(false);
  const recordingEndAtRef = useRef(0);
  const countdownActiveRef = useRef(false);
  const countdownEndAtRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    landmarkerRef.current?.close();
    streamRef.current = null;
    landmarkerRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Draws the live camera frame + detected skeleton every animation frame,
  // and — while recording — appends each detected frame to the buffer that
  // gets scored once the recording window ends. Nothing here is ever
  // written to disk; frames live only in memory and are discarded on close.
  const drawLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(drawLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const frame = landmarker.detect(video, performance.now());
      if (frame) {
        ctx.strokeStyle = '#e2564c';
        ctx.lineWidth = 3;
        for (const [a, b] of POSE_CONNECTIONS) {
          const pa = frame[a];
          const pb = frame[b];
          if (!pa || !pb) continue;
          ctx.beginPath();
          ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
          ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
          ctx.stroke();
        }
        ctx.fillStyle = '#f0c419';
        for (const key of Object.keys(frame)) {
          if (key === 'timestampMs') continue;
          const p = (frame as any)[key];
          if (!p || p.visibility < 0.5) continue;
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (recordingRef.current) framesRef.current.push(frame);
      }

      // The recording window must end on a wall-clock deadline regardless of
      // whether a pose was detected on this particular tick — otherwise bad
      // lighting, the user stepping out of frame, or (as in automated tests)
      // a camera with no real person in it would leave "recording" running
      // forever with no way out except closing the modal.
      if (recordingRef.current) {
        const msLeft = Math.max(0, recordingEndAtRef.current - performance.now());
        setRecordingMsLeft(msLeft);
        if (msLeft <= 0) {
          finishRecording();
          return;
        }
      } else if (countdownActiveRef.current) {
        // Same wall-clock-deadline pattern as the recording window above —
        // driven off the existing rAF loop rather than a new setTimeout/
        // setInterval, so it shares the loop's single cleanup path
        // (cancelAnimationFrame in `cleanup()`) with no new timer resource
        // to leak. The camera feed + skeleton overlay keep drawing normally
        // throughout the countdown so the user can position themselves;
        // only `recordingRef` (untouched here) gates whether frames are
        // actually captured for analysis.
        const msLeft = countdownEndAtRef.current - performance.now();
        const secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));
        setCountdownSecondsLeft(secondsLeft);
        if (msLeft <= 0) {
          countdownActiveRef.current = false;
          // No early `return` here (unlike finishRecording() above) — the
          // rAF loop must keep running into the recording phase itself
          // (finishRecording() is what eventually stops it), so this falls
          // through to the normal reschedule at the bottom of drawLoop.
          startRecording();
        }
      }
    }
    rafRef.current = requestAnimationFrame(drawLoop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestCamera = useCallback(async () => {
    setPhase('requesting');
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const name = (err as DOMException)?.name;
      setPhase('denied');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMessage('카메라 접근 권한이 거부되었습니다. 시스템/브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해주세요.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setErrorMessage('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요.');
      } else {
        setErrorMessage('카메라를 여는 중 문제가 발생했습니다.');
      }
      return;
    }

    setPhase('loading-model');
    try {
      landmarkerRef.current = await createPoseLandmarker();
    } catch {
      setPhase('model-error');
      setErrorMessage('자세 분석 모듈을 불러오지 못했습니다. 앱을 다시 시작한 뒤 시도해주세요.');
      return;
    }
    setPhase('ready');
    rafRef.current = requestAnimationFrame(drawLoop);
  }, [drawLoop]);

  useEffect(() => {
    void requestCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starts the 5-second countdown — the actual analysis-recording logic
  // below (startRecording/finishRecording/analyzeTechnique) is untouched;
  // this only delays when startRecording() gets called, and drawLoop calls
  // it exactly once when the countdown deadline passes (guarded by setting
  // countdownActiveRef to false in the same tick, before returning).
  function startCountdown() {
    countdownActiveRef.current = true;
    countdownEndAtRef.current = performance.now() + COUNTDOWN_SECONDS * 1000;
    setCountdownSecondsLeft(COUNTDOWN_SECONDS);
    setPhase('countdown');
  }

  function cancelCountdown() {
    countdownActiveRef.current = false;
    setPhase('ready');
  }

  function startRecording() {
    framesRef.current = [];
    recordingRef.current = true;
    recordingEndAtRef.current = performance.now() + RECORDING_MS;
    setRecordingMsLeft(RECORDING_MS);
    setPhase('recording');
  }

  function finishRecording() {
    recordingRef.current = false;
    const result = analyzeTechnique(technique.id, framesRef.current);
    setOutcome(result);
    if (result.ok) saveAnalysisResult(technique.martialArt, result.result);
    setPhase('result');
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }

  function handleRetry() {
    setOutcome(null);
    setPhase('ready');
    rafRef.current = requestAnimationFrame(drawLoop);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel pose-modal" onClick={(e) => e.stopPropagation()}>
        <h3>📷 {technique.name} 자세 분석</h3>
        <div className="modal-note" style={{ marginTop: 0, marginBottom: 14 }}>
          카메라로 확인 가능한 자세 요소를 기준으로 분석한 참고용 결과입니다. 실제 무술 실력이나 기술의 완성도를
          완전히 평가하는 결과는 아니며, 실제 훈련에서는 전문 지도자의 피드백이 필요합니다. 카메라 영상은 저장되지
          않고, 분석 결과만 이 기기에 저장됩니다.
        </div>

        <div className="pose-camera-frame">
          <video ref={videoRef} className="pose-video" muted playsInline />
          <canvas ref={canvasRef} className="pose-canvas" />
          {phase === 'requesting' && <div className="pose-overlay-message">카메라 권한을 요청하는 중…</div>}
          {phase === 'loading-model' && <div className="pose-overlay-message">분석 모듈을 불러오는 중…</div>}
          {(phase === 'denied' || phase === 'model-error') && (
            <div className="pose-overlay-message pose-overlay-message--error">{errorMessage}</div>
          )}
          {phase === 'ready' && <div className="pose-overlay-message">카메라 앞에 서서 자세를 준비해주세요.</div>}
          {phase === 'countdown' && (
            <div className="pose-countdown-overlay">
              <div className="pose-countdown-overlay__label">분석을 시작합니다</div>
              <div key={countdownSecondsLeft} className="pose-countdown-overlay__number">
                {countdownSecondsLeft > 0 ? countdownSecondsLeft : '시작!'}
              </div>
            </div>
          )}
          {phase === 'recording' && (
            <>
              <div className="pose-overlay-message">자세를 분석하고 있습니다…</div>
              <div className="pose-overlay-badge">● 촬영 중 {(recordingMsLeft / 1000).toFixed(1)}초</div>
            </>
          )}
        </div>

        {phase === 'ready' && (
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={startCountdown}>
              ▶ 촬영/분석 시작
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" disabled>
              ▶ 촬영/분석 시작
            </button>
            <button className="btn btn-ghost" onClick={cancelCountdown}>
              취소
            </button>
          </div>
        )}
        {phase === 'recording' && (
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={finishRecording}>
              ■ 분석 종료
            </button>
          </div>
        )}
        {(phase === 'denied' || phase === 'model-error') && (
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={requestCamera}>
              다시 시도
            </button>
          </div>
        )}

        {phase === 'result' && outcome && (
          <div className="pose-result">
            {outcome.ok ? (
              <>
                <div className="pose-result__score">
                  <div className="pose-result__score-num">{outcome.result.overallScore} / 100</div>
                  <div className="pose-result__status">
                    {STATUS_ICON[outcome.result.status]} {STATUS_LABEL[outcome.result.status]}
                  </div>
                </div>
                <div className="pose-metric-list">
                  {outcome.result.metricScores.map((m) => (
                    <div key={m.id} className="pose-metric-row">
                      <span className="pose-metric-row__name">{m.name}</span>
                      <div className="progress-track pose-metric-row__bar">
                        <div className="progress-fill" style={{ width: `${m.score}%` }} />
                      </div>
                      <span className="pose-metric-row__score">{m.score}</span>
                    </div>
                  ))}
                </div>
                {outcome.result.strengths.length > 0 && (
                  <p className="pose-result__line">✓ 잘한 부분: {outcome.result.strengths.join(', ')}</p>
                )}
                {outcome.result.improvements.length > 0 && (
                  <p className="pose-result__line">△ 개선할 부분: {outcome.result.improvements.join(', ')}</p>
                )}
              </>
            ) : (
              <div className="ai-error" role="alert">
                {outcome.reason === 'no_pose_detected'
                  ? '카메라에서 자세를 충분히 인식하지 못했습니다. 몸 전체(어깨~발목)가 프레임에 나오도록 하고 다시 시도해주세요.'
                  : '이 기술은 현재 카메라 자세 분석을 지원하지 않습니다.'}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={handleRetry}>
                다시 분석
              </button>
              {outcome.ok && (
                <button className="btn btn-secondary" onClick={() => setAiOpen(true)}>
                  ✦ AI에게 질문하기
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        )}

        {phase !== 'result' && (
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        )}
      </div>
      {aiOpen && outcome?.ok && (
        <AiAskModal onClose={() => setAiOpen(false)} technique={technique} poseResult={outcome.result} />
      )}
    </div>
  );
}
