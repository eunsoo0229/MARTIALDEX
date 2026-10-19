import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Technique } from '../../types';
import { createPoseLandmarker, type PoseLandmarker } from '../../lib/poseAnalysis/poseEstimator';
import { LiveClipCollector, sampleVideoBlob } from '../../lib/formCompare/clipCapture';
import { blockingIssues, isFullBodyFrame, isUsableFrame, VIEW_LABEL } from '../../lib/formCompare/motion';
import { deleteReference, FORM_COMPARE_EVENT, getMedia, listCompareRecords, listReferences } from '../../lib/formCompare/referenceStore';
import { compareAttempt, ensureProfile, MAX_REFERENCE_SECONDS, registerFileReference, registerYoutubeReference, type CompareOutcome } from '../../lib/formCompare/service';
import { RELIABILITY_LABEL } from '../../lib/formCompare/scoring';
import { ASPECT_LABEL, CAPTURE_ISSUE_LABEL, type CameraView, type CaptureIssue, type PreparedClip, type ReferenceVideo } from '../../lib/formCompare/types';
import { STATUS_ICON, STATUS_LABEL, classifyScore } from '../../lib/poseAnalysis/scoring';
import ScoreHistoryChart from '../ScoreHistoryChart';

// 🎬 기준 영상 비교 자세 평가 — reference video ↔ the user's attempt.
// Steps: reference (pick / register — criteria built automatically) →
// capture (camera or a video file) → AI comparison → result + history.
// The user's video stays in memory for playback on this screen only.

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
const VERDICT_LABEL = { match: '일치', partial: '부분 일치', mismatch: '다름', not_observable: '판단 불가' } as const;
const VERDICT_ICON = { match: '🟢', partial: '🟡', mismatch: '🔴', not_observable: '⚪' } as const;
const IMPORTANCE_LABEL = { core: '핵심', support: '중요', minor: '세부' } as const;
const VIEW_OPTIONS: CameraView[] = ['front', 'side', 'diagonal', 'back', 'unknown'];
const RECORD_SECONDS = [4, 6, 10];

/** "1:05" / "65" / "65.5" → seconds */
export function parseTime(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const m = v.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${s % 1 ? `.${Math.round((s % 1) * 10)}` : ''}`;

function YouTubeSegment({ videoId, start, end, title }: { videoId: string; start: number; end: number; title: string }) {
  return (
    <div className="video-embed form-compare__embed" data-testid="form-ref-embed">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(start)}&end=${Math.ceil(end)}&rel=0`}
        title={title}
        allow={IFRAME_ALLOW}
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}

function useReferences(techniqueId: string) {
  const [refs, setRefs] = useState(() => listReferences(techniqueId));
  useEffect(() => {
    const on = () => setRefs(listReferences(techniqueId));
    window.addEventListener(FORM_COMPARE_EVENT, on);
    return () => window.removeEventListener(FORM_COMPARE_EVENT, on);
  }, [techniqueId]);
  return refs;
}

type Step = 'reference' | 'capture' | 'analyzing' | 'result';

export default function FormCompareModal({ technique, onClose }: { technique: Technique; onClose: () => void }) {
  const refs = useReferences(technique.id);
  const [refId, setRefId] = useState<string | null>(() => refs.find((r) => r.profile)?.id ?? refs[0]?.id ?? null);
  const reference = refs.find((r) => r.id === refId) ?? null;
  const [step, setStep] = useState<Step>('reference');
  const [registering, setRegistering] = useState(refs.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CompareOutcome | null>(null);
  const [userVideoUrl, setUserVideoUrl] = useState<string | null>(null);
  const [refFileUrl, setRefFileUrl] = useState<string | null>(null);
  const [retake, setRetake] = useState<CaptureIssue[] | null>(null);

  // Reference file playback (file references keep the file on this device).
  useEffect(() => {
    let url: string | null = null;
    if (reference?.source.kind === 'file') {
      void getMedia(reference.id).then((m) => {
        if (m?.file) {
          url = URL.createObjectURL(m.file);
          setRefFileUrl(url);
        } else setRefFileUrl(null);
      });
    } else setRefFileUrl(null);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [reference?.id]);
  useEffect(() => () => {
    if (userVideoUrl) URL.revokeObjectURL(userVideoUrl);
  }, [userVideoUrl]);

  async function buildCriteria(r: ReferenceVideo, force = false) {
    setBusy('기준 영상을 분석해 평가 기준을 만드는 중… (기술 단계와 확인할 점을 자동으로 정합니다)');
    setError(null);
    const res = await ensureProfile(technique, r, force);
    setBusy(null);
    if (!res.ok) setError(res.message);
  }

  async function runCompare(clip: PreparedClip, videoBlob: Blob | null) {
    if (!reference) return;
    if (videoBlob) setUserVideoUrl(URL.createObjectURL(videoBlob));
    setRetake(null);
    setError(null);
    const block = blockingIssues(clip.signals);
    if (block.length) {
      setRetake(block);
      setStep('capture');
      return;
    }
    setStep('analyzing');
    const res = await compareAttempt(technique, reference, clip);
    if (!res.ok) {
      if ('retake' in res && res.retake) setRetake(res.retake);
      else setError(res.message);
      setStep('capture');
      return;
    }
    setOutcome(res.outcome);
    setStep('result');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel pose-modal form-compare" onClick={(e) => e.stopPropagation()} data-testid="form-compare" data-step={step}>
        <h3>🎬 {technique.name} — 기준 영상과 비교해 자세 평가</h3>
        <div className="modal-note" style={{ marginTop: 0, marginBottom: 12 }}>
          기준 시연 영상과 내 수행 영상을 AI가 단계·평가 기준별로 비교합니다. 배경·복장·체격 차이는 평가하지 않습니다. 참고용 결과이며 실제 지도자의 피드백을 대신하지 않습니다. 내 영상은 이 화면에서만 재생되고 저장되지 않으며, 분석에 쓰인 몇 장의 정지 프레임만 AI에 전달됩니다.
        </div>

        {step === 'reference' && (
          <ReferenceStep
            technique={technique}
            refs={refs}
            reference={reference}
            registering={registering}
            setRegistering={setRegistering}
            onPick={(id) => {
              setRefId(id);
              setError(null);
            }}
            onRegistered={async (r) => {
              setRefId(r.id);
              setRegistering(false);
              await buildCriteria(r);
            }}
            onRebuild={(r) => void buildCriteria(r, true)}
            onDelete={async (r) => {
              if (!window.confirm('이 기준 영상을 삭제할까요? 이 기준으로 한 이전 평가 기록은 남습니다.')) return;
              await deleteReference(r.id);
              setRefId(null);
            }}
            onNext={() => setStep('capture')}
            refFileUrl={refFileUrl}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}

        {step === 'capture' && reference?.profile && (
          <CaptureStep
            reference={reference}
            retake={retake}
            onClip={runCompare}
            onBack={() => {
              setRetake(null);
              setStep('reference');
            }}
          />
        )}

        {step === 'analyzing' && (
          <div className="card info-card text-center" data-testid="form-analyzing">
            <p style={{ margin: 0 }}>기준 영상과 내 수행을 단계별로 맞춰 비교하는 중입니다…</p>
          </div>
        )}

        {step === 'result' && outcome && reference && (
          <ResultView
            technique={technique}
            reference={reference}
            outcome={outcome}
            userVideoUrl={userVideoUrl}
            refFileUrl={refFileUrl}
            onRetry={() => {
              setOutcome(null);
              setStep('capture');
            }}
          />
        )}

        {busy && (
          <p className="video-status-message" data-testid="form-busy">
            {busy}
          </p>
        )}
        {error && (
          <div className="ai-error" role="alert" data-testid="form-error">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} data-testid="form-close">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reference step

function ReferenceStep(props: {
  technique: Technique;
  refs: ReferenceVideo[];
  reference: ReferenceVideo | null;
  registering: boolean;
  setRegistering: (v: boolean) => void;
  onPick: (id: string) => void;
  onRegistered: (r: ReferenceVideo) => Promise<void>;
  onRebuild: (r: ReferenceVideo) => void;
  onDelete: (r: ReferenceVideo) => Promise<void>;
  onNext: () => void;
  refFileUrl: string | null;
  busy: string | null;
  setBusy: (v: string | null) => void;
  setError: (v: string | null) => void;
}) {
  const { technique, refs, reference } = props;
  const [kind, setKind] = useState<'youtube' | 'file'>('youtube');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [view, setView] = useState<CameraView>('front');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const curatedVideos = technique.videos ?? [];

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const u = URL.createObjectURL(file);
    setFilePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function register() {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s === null || e === null) {
      props.setError('기술이 나오는 구간의 시작·끝 시간을 입력해 주세요 (예: 0:12 ~ 0:18).');
      return;
    }
    props.setError(null);
    props.setBusy(kind === 'youtube' ? '영상이 재생 가능한지 확인하는 중…' : '영상에서 자세를 추출하는 중… (이 기기에서만 처리)');
    const res =
      kind === 'youtube'
        ? await registerYoutubeReference(technique, { url, startSeconds: s, endSeconds: e, cameraView: view, replaceId })
        : file
          ? await registerFileReference(technique, { file, startSeconds: s, endSeconds: e, cameraView: view, replaceId, onProgress: (d, t) => props.setBusy(`영상에서 자세를 추출하는 중… ${Math.round((d / t) * 100)}%`) })
          : { ok: false as const, message: '영상 파일을 선택해 주세요.' };
    props.setBusy(null);
    if (!res.ok) {
      props.setError(res.message);
      return;
    }
    setReplaceId(null);
    await props.onRegistered(res.reference);
  }

  if (props.registering) {
    return (
      <div className="card info-card" data-testid="form-ref-register">
        <h4 style={{ marginTop: 0 }}>{replaceId ? '기준 영상 교체' : '기준 시연 영상 등록'}</h4>
        <div className="chip-row">
          <button type="button" className={`chip${kind === 'youtube' ? ' active' : ''}`} onClick={() => setKind('youtube')} data-testid="form-ref-kind-youtube">
            YouTube 주소
          </button>
          <button type="button" className={`chip${kind === 'file' ? ' active' : ''}`} onClick={() => setKind('file')} data-testid="form-ref-kind-file">
            영상 파일 (사용 권한이 있는 영상)
          </button>
        </div>
        {kind === 'youtube' ? (
          <>
            <input className="select" style={{ marginTop: 8 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." data-testid="form-ref-url" />
            {curatedVideos.length > 0 && (
              <div className="chip-row" style={{ marginTop: 6 }}>
                <span className="field-label" style={{ margin: 0 }}>MARTIALDEX 등록 영상:</span>
                {curatedVideos.slice(0, 4).map((v) => (
                  <button key={v.videoId} type="button" className="chip" onClick={() => setUrl(`https://www.youtube.com/watch?v=${v.videoId}`)} data-testid="form-ref-curated">
                    {v.title.slice(0, 40)}
                  </button>
                ))}
              </div>
            )}
            <p className="video-status-message" style={{ margin: '6px 0 0' }}>
              공개된 YouTube 영상만 사용할 수 있습니다. 영상은 내려받지 않으며, 분석 때 Gemini가 YouTube 영상을 직접 읽습니다.
            </p>
          </>
        ) : (
          <>
            <input type="file" accept="video/*" style={{ marginTop: 8 }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="form-ref-file" />
            {filePreview && <video src={filePreview} controls muted playsInline className="form-compare__video" data-testid="form-ref-file-preview" />}
          </>
        )}
        <div className="chip-row" style={{ marginTop: 8 }}>
          <label className="field-label" style={{ margin: 0 }}>
            기술 구간 시작 <input className="select form-compare__time" value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:12" data-testid="form-ref-start" />
          </label>
          <label className="field-label" style={{ margin: 0 }}>
            끝 <input className="select form-compare__time" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="0:18" data-testid="form-ref-end" />
          </label>
          <label className="field-label" style={{ margin: 0 }}>
            촬영 방향
            <select className="select" value={view} onChange={(e) => setView(e.target.value as CameraView)} data-testid="form-ref-view">
              {VIEW_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {VIEW_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="video-status-message" style={{ margin: '4px 0 0' }}>
          기술 한 번(또는 몇 번)이 보이는 {MAX_REFERENCE_SECONDS}초 이하 구간을 골라 주세요. 평가 기준은 이 구간에서 자동으로 만들어집니다.
        </p>
        {kind === 'youtube' && parseYoutubeIdForPreview(url) && parseTime(end) !== null && (
          <YouTubeSegment videoId={parseYoutubeIdForPreview(url)!} start={parseTime(start) ?? 0} end={parseTime(end)!} title="기준 영상 미리보기" />
        )}
        <div className="modal-actions modal-actions--start">
          <button className="btn btn-primary" onClick={() => void register()} disabled={!!props.busy} data-testid="form-ref-save">
            확인하고 평가 기준 만들기
          </button>
          {refs.length > 0 && (
            <button className="btn btn-ghost" onClick={() => props.setRegistering(false)}>
              취소
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="form-ref-step">
      {refs.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {refs.map((r) => (
            <button key={r.id} type="button" className={`chip${r.id === reference?.id ? ' active' : ''}`} onClick={() => props.onPick(r.id)} data-testid="form-ref-pick">
              {r.source.kind === 'youtube' ? `▶ ${r.source.title.slice(0, 24)}` : `📁 ${r.source.fileName.slice(0, 24)}`} · {fmtTime(r.startSeconds)}~{fmtTime(r.endSeconds)}
            </button>
          ))}
        </div>
      )}
      {reference && (
        <div className="card info-card" data-testid="form-ref-current" data-has-profile={String(!!reference.profile)}>
          <h4 style={{ marginTop: 0 }}>
            기준 영상: {reference.source.kind === 'youtube' ? `${reference.source.title} (${reference.source.channel})` : reference.source.fileName} · {fmtTime(reference.startSeconds)}~{fmtTime(reference.endSeconds)} · {VIEW_LABEL[reference.profile?.cameraView ?? reference.cameraView]}
          </h4>
          {reference.source.kind === 'youtube' ? (
            <YouTubeSegment videoId={reference.source.videoId} start={reference.startSeconds} end={reference.endSeconds} title={reference.source.title} />
          ) : props.refFileUrl ? (
            <video src={`${props.refFileUrl}#t=${reference.startSeconds},${reference.endSeconds}`} controls muted playsInline className="form-compare__video" />
          ) : (
            <p className="video-status-message">영상 파일은 이 기기에 저장되지 않았습니다(용량 초과). 추출한 프레임으로 평가합니다.</p>
          )}
          {reference.profile ? (
            <div data-testid="form-profile">
              <p style={{ margin: '8px 0 4px' }}>
                <strong>자동으로 만든 평가 기준</strong> — {reference.profile.summary}
              </p>
              <p className="video-status-message" style={{ margin: 0 }}>
                단계: {reference.profile.phases.map((p) => p.name).join(' → ')}
              </p>
              <ul className="form-compare__criteria" data-testid="form-profile-criteria">
                {reference.profile.criteria.map((c) => (
                  <li key={c.id}>
                    <span className="chip">{IMPORTANCE_LABEL[c.importance]}</span> {c.description} <span className="video-status-message">({ASPECT_LABEL[c.aspect]})</span>
                  </li>
                ))}
              </ul>
              {reference.profile.excluded.length > 0 && (
                <p className="video-status-message" data-testid="form-profile-excluded">
                  기준 영상으로 판단할 수 없어 평가하지 않는 것: {reference.profile.excluded.map((x) => `${x.aspect}(${x.reason})`).join(', ')}
                </p>
              )}
              {!reference.profile.matchesTechnique && (
                <div className="ai-error" role="alert">
                  이 영상은 {technique.name}가 아닌 것으로 분석되었습니다({reference.profile.observedTechnique}). 다른 기준 영상을 등록해 주세요.
                </div>
              )}
            </div>
          ) : (
            <p className="video-status-message">아직 평가 기준이 없습니다.</p>
          )}
          <div className="modal-actions modal-actions--start">
            {reference.profile?.matchesTechnique ? (
              <button className="btn btn-primary" onClick={props.onNext} disabled={!!props.busy} data-testid="form-ref-next">
                이 기준으로 내 자세 촬영하기
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => props.onRebuild(reference)} disabled={!!props.busy} data-testid="form-ref-build">
                평가 기준 만들기
              </button>
            )}
            {reference.profile && (
              <button className="btn btn-ghost btn-sm" onClick={() => props.onRebuild(reference)} disabled={!!props.busy}>
                기준 다시 만들기
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setReplaceId(reference.id);
                props.setRegistering(true);
              }}
              data-testid="form-ref-replace"
            >
              기준 영상 교체
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void props.onDelete(reference)} data-testid="form-ref-delete">
              삭제
            </button>
          </div>
        </div>
      )}
      <button className="btn btn-secondary btn-sm" onClick={() => props.setRegistering(true)} data-testid="form-ref-add">
        + 다른 기준 영상 등록
      </button>
    </div>
  );
}

function parseYoutubeIdForPreview(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

// ---------------------------------------------------------------- capture step

function CaptureStep({ reference, retake, onClip, onBack }: { reference: ReferenceVideo; retake: CaptureIssue[] | null; onClip: (clip: PreparedClip, blob: Blob | null) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'camera' | 'file'>('camera');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'ready' | 'countdown' | 'recording' | 'processing' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(6);
  const [count, setCount] = useState(0);
  const [live, setLive] = useState<{ person: boolean; full: boolean }>({ person: false, full: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lmRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const collectorRef = useRef<LiveClipCollector | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endAtRef = useRef(0);
  const view = reference.profile?.cameraView ?? reference.cameraView;

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    lmRef.current?.close();
    lmRef.current = null;
  }, []);
  useEffect(() => stopAll, [stopAll]);

  const loop = useCallback(() => {
    const v = videoRef.current;
    const lm = lmRef.current;
    if (v && lm && v.readyState >= 2) {
      const now = performance.now();
      const pose = lm.detect(v, now);
      setLive({ person: !!pose && isUsableFrame(pose), full: !!pose && isFullBodyFrame(pose) });
      if (collectorRef.current) {
        collectorRef.current.add(v, pose, now);
        if (now >= endAtRef.current) {
          finishRecording();
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setPhase('starting');
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      lmRef.current = await createPoseLandmarker();
    } catch (err) {
      const name = (err as DOMException)?.name;
      setPhase('error');
      setMessage(name === 'NotAllowedError' ? '카메라 접근 권한이 거부되었습니다. 설정에서 카메라 권한을 허용해 주세요.' : name === 'NotFoundError' ? '카메라를 찾을 수 없습니다.' : '카메라 또는 자세 분석 모듈을 열지 못했습니다.');
      stopAll();
      return;
    }
    setPhase('ready');
    rafRef.current = requestAnimationFrame(loop);
  }

  function startCountdown() {
    setPhase('countdown');
    let n = 3;
    setCount(n);
    const id = window.setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        window.clearInterval(id);
        startRecording();
      }
    }, 1000);
  }

  function startRecording() {
    collectorRef.current = new LiveClipCollector(100);
    chunksRef.current = [];
    try {
      if (streamRef.current && typeof MediaRecorder !== 'undefined') {
        const rec = new MediaRecorder(streamRef.current);
        rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        rec.start();
        recorderRef.current = rec;
      }
    } catch {
      recorderRef.current = null; // playback is optional; the analysis does not need it
    }
    endAtRef.current = performance.now() + seconds * 1000;
    setPhase('recording');
  }

  function finishRecording() {
    const collector = collectorRef.current;
    collectorRef.current = null;
    if (!collector) return;
    setPhase('processing');
    const clip = collector.finish();
    const rec = recorderRef.current;
    recorderRef.current = null;
    const done = (blob: Blob | null) => {
      stopAll();
      onClip(clip, blob);
    };
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => done(chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' }) : null);
      rec.stop();
    } else done(null);
  }

  async function useFile(file: File) {
    setPhase('processing');
    setMessage('영상에서 자세를 추출하는 중…');
    try {
      const clip = await sampleVideoBlob(file, { fps: 12, onProgress: (d, t) => setMessage(`영상에서 자세를 추출하는 중… ${Math.round((d / t) * 100)}%`) });
      setMessage(null);
      onClip(clip, file);
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : '영상을 분석하지 못했습니다.');
    }
  }

  return (
    <div data-testid="form-capture" data-phase={phase}>
      <div className="card info-card">
        <p style={{ margin: 0 }} data-testid="form-capture-guide">
          📐 기준 영상은 <strong>{VIEW_LABEL[view]}</strong>에서 촬영되었습니다. 같은 방향에서, 머리부터 발까지 몸 전체가 화면에 들어오게 서 주세요. 준비 자세({reference.profile?.phases[0]?.name ?? '시작 자세'})에서 시작해 기술을 {reference.profile ? '기준 영상처럼' : ''} 수행하고, 끝난 뒤 자세를 회복해 주세요.
        </p>
      </div>
      {retake && (
        <div className="ai-error" role="alert" data-testid="form-retake">
          다시 촬영해 주세요: {retake.map((i) => CAPTURE_ISSUE_LABEL[i]).join(' ')}
        </div>
      )}
      <div className="chip-row" style={{ margin: '8px 0' }}>
        <button type="button" className={`chip${mode === 'camera' ? ' active' : ''}`} onClick={() => setMode('camera')} data-testid="form-capture-camera">
          📷 카메라로 촬영
        </button>
        <button
          type="button"
          className={`chip${mode === 'file' ? ' active' : ''}`}
          onClick={() => {
            stopAll();
            setPhase('idle');
            setMode('file');
          }}
          data-testid="form-capture-file-mode"
        >
          📁 촬영한 영상 파일 올리기
        </button>
      </div>
      {mode === 'camera' ? (
        <>
          <div className="pose-camera-frame">
            <video ref={videoRef} className="pose-video" muted playsInline />
            {phase === 'countdown' && (
              <div className="pose-countdown-overlay">
                <div className="pose-countdown-overlay__label">곧 촬영을 시작합니다</div>
                <div className="pose-countdown-overlay__number">{count > 0 ? count : '시작!'}</div>
              </div>
            )}
            {phase === 'recording' && <div className="pose-overlay-badge">● 촬영 중 — 지금 기술을 수행하세요</div>}
            {(phase === 'ready' || phase === 'recording') && (
              <div className="form-compare__live" data-testid="form-live-check" data-person={String(live.person)} data-full={String(live.full)}>
                {live.full ? '✓ 전신이 보입니다' : live.person ? '⚠ 발까지 보이도록 조금 뒤로 가 주세요' : '⚠ 사람이 보이지 않습니다'}
              </div>
            )}
          </div>
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            {phase === 'idle' || phase === 'error' ? (
              <button className="btn btn-primary" onClick={() => void startCamera()} data-testid="form-camera-start">
                카메라 켜기
              </button>
            ) : phase === 'ready' ? (
              <>
                <select className="select" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} data-testid="form-record-seconds">
                  {RECORD_SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {s}초 촬영
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" onClick={startCountdown} data-testid="form-record-start">
                  ▶ 촬영 시작
                </button>
              </>
            ) : phase === 'recording' ? (
              <button className="btn btn-secondary" onClick={finishRecording} data-testid="form-record-stop">
                ■ 촬영 끝
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="card info-card">
          <input type="file" accept="video/*" capture="environment" onChange={(e) => e.target.files?.[0] && void useFile(e.target.files[0])} data-testid="form-capture-file" />
          <p className="video-status-message" style={{ margin: '6px 0 0' }}>
            휴대폰 카메라 앱 등으로 촬영한 영상을 올릴 수 있습니다. 영상은 이 기기에서만 처리됩니다.
          </p>
        </div>
      )}
      {message && <p className="video-status-message">{message}</p>}
      <button className="btn btn-ghost btn-sm" onClick={onBack}>
        ← 기준 영상으로
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- result

function ResultView({ technique, reference, outcome, userVideoUrl, refFileUrl, onRetry }: { technique: Technique; reference: ReferenceVideo; outcome: CompareOutcome; userVideoUrl: string | null; refFileUrl: string | null; onRetry: () => void }) {
  const { record, userFrames, refFrames } = outcome;
  const b = record.breakdown;
  const j = record.judgement;
  const crit = new Map(record.criteria.map((c) => [c.id, c]));
  const history = useMemo(() => listCompareRecords(technique.id).filter((r) => r.breakdown.score !== null), [technique.id, record.id]);
  const chartRecords = history.map((r) => ({ recordId: r.id, techniqueId: r.techniqueId, martialArtId: r.martialArt, score: r.breakdown.score!, status: classifyScore(r.breakdown.score!), metricScores: {}, analyzedAt: r.createdAt }));
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const statusText =
    b.status === 'scored'
      ? null
      : b.status === 'insufficient'
        ? '평가 불가 — 근거가 부족해 점수를 매기지 않았습니다.'
        : b.status === 'different_technique'
          ? '평가 불가 — 기준 영상과 다른 기술을 수행한 것으로 보입니다.'
          : '평가 불가 — 기술 수행 동작이 보이지 않습니다.';
  const phasesById = new Map(reference.profile?.phases.map((p) => [p.id, p]) ?? []);

  return (
    <div className="pose-result" data-testid="form-result" data-status={b.status} data-score={b.score ?? ''} data-reliability={b.reliability}>
      <div className="pose-result__score">
        {b.score !== null ? (
          <>
            <div className="pose-result__score-num" data-testid="form-score">
              {b.score} / 100
            </div>
            <div className="pose-result__status">
              {STATUS_ICON[classifyScore(b.score)]} {STATUS_LABEL[classifyScore(b.score)]}
              {prev?.breakdown.score != null && ` · 지난번 ${prev.breakdown.score}점 (${b.score - prev.breakdown.score >= 0 ? '+' : ''}${b.score - prev.breakdown.score})`}
            </div>
          </>
        ) : (
          <div className="pose-result__score-num" data-testid="form-score-none">
            {statusText}
          </div>
        )}
      </div>
      <p className="video-status-message" data-testid="form-reliability">
        분석 신뢰도: <strong>{RELIABILITY_LABEL[b.reliability]}</strong> ({Math.round(b.reliabilityValue * 100)}%) · 관찰 가능한 기준 {Math.round(b.coverage * 100)}% · 사람 인식 {Math.round(record.signals.visibleRatio * 100)}% ·{' '}
        {record.alignment.method === 'dtw' ? `시간 정렬(DTW) · 수행 시간 기준 대비 ${record.alignment.speedRatio}배` : '수행 구간 기준 시간 정렬'}
        {b.cap && ` · ${b.cap.reason} → 최대 ${b.cap.value}점`}
      </p>
      {b.reasons.map((r) => (
        <p key={r} className="video-status-message">
          {r}
        </p>
      ))}
      {record.viewWarning && (
        <div className="ai-error" role="alert" data-testid="form-view-warning">
          {record.viewWarning}
        </div>
      )}

      {b.phaseScores.some((p) => p.score !== null) && (
        <div className="pose-metric-list" data-testid="form-phase-scores">
          {b.phaseScores.map((p) => (
            <div key={p.phaseId} className="pose-metric-row">
              <span className="pose-metric-row__name">{p.name}</span>
              <div className="progress-track pose-metric-row__bar">
                <div className="progress-fill" style={{ width: `${p.score ?? 0}%` }} />
              </div>
              <span className="pose-metric-row__score">{p.score ?? '–'}</span>
            </div>
          ))}
        </div>
      )}

      <h4>기준 영상 ↔ 내 수행</h4>
      <div className="form-compare__side" data-testid="form-side-by-side">
        <div>
          <div className="field-label">기준</div>
          {reference.source.kind === 'youtube' ? (
            <YouTubeSegment videoId={reference.source.videoId} start={reference.startSeconds} end={reference.endSeconds} title={reference.source.title} />
          ) : refFileUrl ? (
            <video src={`${refFileUrl}#t=${reference.startSeconds},${reference.endSeconds}`} controls muted playsInline className="form-compare__video" />
          ) : null}
        </div>
        <div>
          <div className="field-label">나</div>
          {userVideoUrl ? <video src={userVideoUrl} controls muted playsInline className="form-compare__video" data-testid="form-user-video" /> : <p className="video-status-message">재생할 영상이 없습니다.</p>}
        </div>
      </div>
      <div className="form-compare__frames" data-testid="form-frames">
        {userFrames.map((f, i) => {
          const r = refFrames.length === userFrames.length ? refFrames[i] : (refFrames.find((x) => x.note === f.note) ?? null);
          return (
            <figure key={i} className="form-compare__pair">
              {r && <img src={r.image} alt={`기준 ${f.note}`} />}
              <img src={f.image} alt={`나 ${f.note}`} />
              <figcaption>
                U{i + 1} · {f.note} · {(f.tMs / 1000).toFixed(1)}초
              </figcaption>
            </figure>
          );
        })}
      </div>

      <h4>평가 기준별 비교</h4>
      <ul className="form-compare__criteria" data-testid="form-criteria-results">
        {j.criteria.map((c) => {
          const def = crit.get(c.criterionId);
          return (
            <li key={c.criterionId} data-verdict={c.verdict}>
              {VERDICT_ICON[c.verdict]} <strong>{VERDICT_LABEL[c.verdict]}</strong> · {def ? `${IMPORTANCE_LABEL[def.importance]} · ${def.description}` : c.criterionId}
              {def?.phaseId && phasesById.get(def.phaseId) ? ` (${phasesById.get(def.phaseId)!.name})` : ''}
              <div className="video-status-message">
                나: {c.observation}
                {c.referenceObservation ? ` · 기준: ${c.referenceObservation}` : ''} · 확신도 {c.confidence === 'high' ? '높음' : c.confidence === 'medium' ? '보통' : '낮음'}
              </div>
            </li>
          );
        })}
      </ul>
      {j.strengths.length > 0 && <p className="pose-result__line" data-testid="form-strengths">✓ 잘한 부분: {j.strengths.join(' / ')}</p>}
      {j.differences.length > 0 && (
        <div data-testid="form-differences">
          <p className="pose-result__line">△ 기준 영상과 다른 부분</p>
          <ul>
            {j.differences.map((d, i) => (
              <li key={i}>
                {d.what}
                {d.why && <span className="video-status-message"> — 이유: {d.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {j.focus.length > 0 && <p className="pose-result__line" data-testid="form-focus">🎯 다음에 집중할 점: {j.focus.join(' / ')}</p>}
      {j.drills.length > 0 && <p className="pose-result__line" data-testid="form-drills">🏋 연습 제안: {j.drills.join(' / ')}</p>}
      {j.limitations.length > 0 && <p className="video-status-message">평가 한계: {j.limitations.join(' / ')}</p>}
      {(record.poseHints?.length ?? 0) > 0 && (
        <p className="video-status-message" data-testid="form-pose-hints">
          자세 추정 보조 신호(시간 정렬 후 기준과 위치 차이가 큰 부위, 점수에는 직접 쓰지 않음): {record.poseHints!.join(' / ')}
        </p>
      )}

      {chartRecords.length >= 2 && (
        <>
          <h4>점수 변화 (기준 영상 비교)</h4>
          <ScoreHistoryChart records={chartRecords} />
        </>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onRetry} data-testid="form-retry">
          다시 촬영해 비교
        </button>
      </div>
    </div>
  );
}
