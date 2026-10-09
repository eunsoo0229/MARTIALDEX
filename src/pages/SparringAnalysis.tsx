import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SPARRING_SPORTS } from '../lib/sparringAnalysis/martialArtCriteria';
import { formatDuration, readVideoMeta, validateVideoFile, type VideoMeta } from '../lib/sparringAnalysis/videoMeta';
import { createMultiPoseLandmarker } from '../lib/poseAnalysis/poseEstimator';
import { ALL_LANDMARK_NAMES } from '../lib/poseAnalysis/landmarks';
import { point } from '../lib/poseAnalysis/geometry';
import type { PoseFrame } from '../lib/poseAnalysis/types';
import { buildSampleTimestamps, samplePosesFromVideo, seekTo } from '../lib/sparringAnalysis/frameSampler';
import { centroidOf, trackSelectedPerson, trackOpponent, trackingLossRatio } from '../lib/sparringAnalysis/personTracker';
import { computePostureSegments } from '../lib/sparringAnalysis/postureMetrics';
import { detectMotionEvents } from '../lib/sparringAnalysis/motionEventDetector';
import { hypothesizeTechniques } from '../lib/sparringAnalysis/techniqueHypothesis';
import { buildStyleObservations } from '../lib/sparringAnalysis/styleObservationEngine';
import { compareWithFighterStyle, getLatestStyleCurriculum } from '../lib/sparringAnalysis/fighterStyleComparison';
import { computeOverallScores, computeWeakAreas, detectLimitations } from '../lib/sparringAnalysis/scoringEngine';
import { analyzeSequences } from '../lib/sparringAnalysis/sequenceAnalysis';
import { analyzeKeyMomentsVisually } from '../lib/sparringAnalysis/visualEventAnalysis';
import { synthesizeCoaching } from '../lib/sparringAnalysis/coachingSynthesis';
import { applySportProfile, getSportAnalysisProfile } from '../lib/sparringAnalysis/sportAnalysisProfiles';
import { saveSparringSession } from '../lib/sparringAnalysis/sparringSessionService';
import { useSparringSessions } from '../lib/sparringAnalysis/useSparringSessions';
import { ANALYSIS_SCOPE_LABEL, type PersonCandidate, type SparringAnalysisScope, type SparringSession } from '../lib/sparringAnalysis/types';
import SparringResultView from '../components/SparringResultView';
import EmptyState from '../components/EmptyState';
import LoginToBackupBanner from '../components/auth/LoginToBackupBanner';
import BackButton from '../components/BackButton';

const ALL_SCOPES: SparringAnalysisScope[] = ['overall', 'posture', 'technique', 'movement', 'attackDefense', 'distance', 'style'];
const NUM_POSES = 3;

type Step = 'hub' | 'sportSelect' | 'upload' | 'preview' | 'personLoading' | 'personSelect' | 'personNotFound' | 'scopeSelect' | 'analyzing' | 'result';

function bboxOf(pose: PoseFrame) {
  const pts = ALL_LANDMARK_NAMES.map((n) => point(pose, n)).filter((p): p is NonNullable<typeof p> => !!p);
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export default function SparringAnalysis() {
  const sessions = useSparringSessions();
  const [step, setStep] = useState<Step>('hub');
  const [sport, setSport] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PersonCandidate[]>([]);
  const [referenceTimestamp, setReferenceTimestamp] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scopes, setScopes] = useState<Set<SparringAnalysisScope>>(new Set(ALL_SCOPES));
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [resultSession, setResultSession] = useState<SparringSession | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  function resetWizard() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setSport(null);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMeta(null);
    setError(null);
    setCandidates([]);
    setSelectedIndex(null);
    setScopes(new Set(ALL_SCOPES));
    setAnalyzeProgress(null);
    setResultSession(null);
    setStep('hub');
  }

  function handleFile(file: File) {
    const err = validateVideoFile(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setVideoFile(file);
    setVideoUrl(url);
    setStep('preview');
  }

  async function handleVideoLoaded() {
    const video = videoRef.current;
    if (!video || !videoFile) return;
    try {
      const meta = await readVideoMeta(video, videoFile);
      setVideoMeta(meta);
    } catch {
      setError('영상 정보를 읽을 수 없습니다. 다른 영상으로 다시 시도해주세요.');
    }
  }

  // Previously silent: if the <video> element itself fails to load (CSP
  // block, corrupt file, unsupported codec), no error ever appeared —
  // videoMeta just stayed null forever and "분석할 사람 지정" silently did
  // nothing when clicked. This surfaces that failure immediately instead.
  function handleVideoError() {
    setError('영상을 불러올 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다. 다른 영상으로 다시 시도해주세요.');
  }

  async function handleDetectPeople() {
    const video = videoRef.current;
    if (!video || !videoMeta) return;
    setStep('personLoading');
    setError(null);
    const t = Math.min(videoMeta.durationSec / 2, Math.max(0, videoMeta.durationSec - 0.1));
    try {
      const landmarker = await createMultiPoseLandmarker(NUM_POSES);
      await seekTo(video, t);
      const poses = landmarker.detect(video);
      landmarker.close();

      const list: PersonCandidate[] = [];
      poses.forEach((pose, i) => {
        const bbox = bboxOf(pose);
        const centroid = centroidOf(pose);
        if (bbox && centroid) list.push({ index: i, label: `사람 ${String.fromCharCode(65 + i)}`, centroid, bbox });
      });

      setReferenceTimestamp(t);
      if (list.length === 0) {
        setStep('personNotFound');
        return;
      }
      setCandidates(list);
      setStep('personSelect');
    } catch {
      setError('사람 감지 모듈을 불러오지 못했습니다. 앱을 다시 시작한 뒤 시도해주세요.');
      setStep('preview');
    }
  }

  function toggleScope(scope: SparringAnalysisScope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleStartAnalysis() {
    const video = videoRef.current;
    if (!video || !videoMeta || selectedIndex === null || !sport) return;
    setStep('analyzing');
    setError(null);
    setAnalyzeProgress({ done: 0, total: 1 });
    try {
      const timestamps = buildSampleTimestamps(videoMeta.durationSec);
      const samples = await samplePosesFromVideo(video, timestamps, NUM_POSES, (done, total) => setAnalyzeProgress({ done, total }));
      const selectedCandidate = candidates[selectedIndex];
      const tracked = trackSelectedPerson(samples, referenceTimestamp, selectedCandidate.centroid);
      const lossRatio = trackingLossRatio(tracked);
      const usableCount = tracked.filter((t) => t.matched).length;
      const maxPeopleAtOnce = samples.reduce((m, s) => Math.max(m, s.poses.length), 0);

      const wantPosture = scopes.has('overall') || scopes.has('posture');
      const wantMotion = ALL_SCOPES.some((s) => s !== 'posture' && scopes.has(s));
      const wantStyle = scopes.has('overall') || scopes.has('style');
      const wantTechnique = scopes.has('overall') || scopes.has('technique');

      const postureSegments = wantPosture ? computePostureSegments(tracked) : [];
      const rawMotionEvents = wantMotion ? detectMotionEvents(tracked, samples) : [];
      const sportProfile = getSportAnalysisProfile(sport);
      const { events: motionEvents, excludedCounts: excludedMotionCounts } = applySportProfile(rawMotionEvents, sportProfile);
      const techniqueGuesses = wantTechnique ? await hypothesizeTechniques(sport, motionEvents).catch(() => []) : [];
      const styleObservations = wantStyle ? buildStyleObservations(motionEvents, postureSegments) : [];
      const styleCurriculum = wantStyle ? getLatestStyleCurriculum() : undefined;
      const styleComparison = wantStyle ? compareWithFighterStyle(motionEvents, styleCurriculum) : null;

      // Opponent tracking/motion (deterministic, cheap) — feeds sequenceAnalysis's
      // reactive/initiating ratio. A single-person clip just yields an empty
      // opponentMotionEvents array, which sequenceAnalysis.ts already treats as
      // "no opponent data" (null ratios) rather than a false 0%.
      const opponentTracked = wantMotion ? trackOpponent(samples, tracked) : [];
      const opponentMotionEvents = wantMotion ? detectMotionEvents(opponentTracked, samples) : [];
      const sequenceAnalysis = wantTechnique ? analyzeSequences(techniqueGuesses, motionEvents, tracked, samples, opponentMotionEvents.length > 0 ? opponentMotionEvents : null) : undefined;

      const overallScores = computeOverallScores(postureSegments, motionEvents, usableCount, videoMeta.durationSec, sportProfile);
      const weakAreas = computeWeakAreas(overallScores, postureSegments, sportProfile);
      const limitations = detectLimitations({ width: videoMeta.width, height: videoMeta.height }, videoMeta.durationSec, lossRatio, maxPeopleAtOnce);

      // Best-effort AI stages — never throw, never block the pipeline. Gated
      // on 'overall'/'attackDefense' since these are the two scopes whose
      // labels ("전체 분석"/"공격·방어 분석") actually promise this depth.
      const wantVisual = scopes.has('overall') || scopes.has('attackDefense');
      const visualInsights = wantVisual && motionEvents.length > 0 ? await analyzeKeyMomentsVisually(video, sport, motionEvents).catch(() => []) : [];
      const wantSynthesis = scopes.has('overall');
      const coachingSynthesis =
        // No longer gated on sequenceAnalysis: motion + posture data alone
        // are enough for grounded strengths/weaknesses (coachingFacts.ts).
        wantSynthesis && (motionEvents.length > 0 || postureSegments.length > 0)
          ? await synthesizeCoaching({
              martialArt: sport,
              techniqueGuesses,
              motionEvents,
              opponentMotionEvents,
              sequenceAnalysis,
              visualInsights,
              postureSegments,
              styleObservations,
              weakAreas,
              videoDurationSec: videoMeta.durationSec,
              overallScores,
              limitations,
            }).catch(() => null)
          : null;

      const session = saveSparringSession({
        martialArt: sport,
        videoName: videoMeta.fileName,
        videoDurationSec: videoMeta.durationSec,
        videoResolution: { width: videoMeta.width, height: videoMeta.height },
        analysisScopes: [...scopes],
        overallScores,
        motionEvents,
        techniqueGuesses,
        postureSegments,
        styleObservations,
        styleComparison,
        limitations,
        savedMoments: [],
        weakAreas,
        notes: null,
        excludedMotionCounts,
        sequenceAnalysis,
        opponentMotionEvents: opponentMotionEvents.length > 0 ? opponentMotionEvents : undefined,
        visualInsights: visualInsights.length > 0 ? visualInsights : undefined,
        coachingSynthesis,
      });

      setResultSession(session);
      setStep('result');
    } catch {
      setError('영상 분석 중 문제가 발생했습니다. 다시 시도해주세요.');
      setStep('scopeSelect');
    }
  }

  function handleSeekResult(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    void video.play();
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>스파링 분석</span>
        </div>

        <div className="section-title">
          <h2>🥊 스파링 분석</h2>
        </div>

        {step === 'hub' && (
          <>
            <p className="video-status-message" style={{ marginTop: -8 }}>
              실제 스파링/대련 영상을 업로드하고, 영상 속에서 본인을 직접 지정하면 자세·움직임·스타일을
              분석합니다. 영상은 이 기기에서만 처리되며 저장되거나 외부로 전송되지 않습니다.
            </p>
            <div className="chip-row" style={{ marginBottom: 8 }}>
              <Link to="/sparring/record" className="chip">
                📹 직접 촬영하기
              </Link>
              <Link to="/sparring/videos" className="chip">
                🎥 촬영한 영상 보기
              </Link>
            </div>
            <LoginToBackupBanner featureName="스파링 기록" />

            {sessions.length >= 2 && (
              <div className="card info-card">
                <h3>스파링 분석 변화</h3>
                {(
                  [
                    ['posture', '자세'],
                    ['distance', '거리 조절'],
                    ['movement', '움직임'],
                  ] as const
                ).map(([key, label]) => {
                  const points = [...sessions]
                    .reverse()
                    .map((s) => s.overallScores[key])
                    .filter((v): v is number => v !== null);
                  if (points.length < 2) return null;
                  return (
                    <p key={key}>
                      {label}: {points.join(' → ')}
                    </p>
                  );
                })}
              </div>
            )}

            {sessions.length >= 2 && sessions[0].sequenceAnalysis && sessions[1].sequenceAnalysis && (
              <div className="card info-card">
                <h3>이전 스파링과 비교</h3>
                <p className="video-status-message" style={{ marginTop: -6 }}>
                  최신 스파링과 바로 이전 스파링의 실제 분석 데이터만 비교합니다(점수 변화가 아닌 실측 데이터 변화 우선).
                </p>
                {(() => {
                  const latest = sessions[0].sequenceAnalysis!;
                  const prev = sessions[1].sequenceAnalysis!;
                  const connectionRatio = (seq: typeof latest) => {
                    const total = seq.soloCount + seq.combinationCount;
                    return total > 0 ? Math.round((seq.combinationCount / total) * 100) : null;
                  };
                  const rows: { label: string; from: number; to: number; unit: string }[] = [];
                  const latestRatio = connectionRatio(latest);
                  const prevRatio = connectionRatio(prev);
                  if (latestRatio !== null && prevRatio !== null) rows.push({ label: '공격 연결 비율', from: prevRatio, to: latestRatio, unit: '%' });

                  const latestTop = [...latest.perTechnique].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
                  if (latestTop) {
                    const prevSame = prev.perTechnique.find((t) => t.techniqueId === latestTop.techniqueId);
                    if (prevSame) rows.push({ label: `${latestTop.techniqueName} 후속 공격`, from: prevSame.followUpCount, to: latestTop.followUpCount, unit: '회' });
                  }

                  if (rows.length === 0) return <p className="video-status-message">비교할 실측 데이터가 아직 충분하지 않습니다.</p>;
                  return (
                    <div className="stack gap-1">
                      {rows.map((r, i) => (
                        <p key={i}>
                          {r.label}: {r.from}
                          {r.unit} → {r.to}
                          {r.unit} {r.to > r.from ? '↑' : r.to < r.from ? '↓' : ''}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {sessions.length > 0 && (
              <div className="stack gap-2" style={{ marginBottom: 16 }}>
                {sessions.map((s) => (
                  <Link key={s.id} to={`/sparring/${s.id}`} className="technique-row">
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {new Date(s.date).toLocaleDateString('ko-KR')} · {s.martialArt.toUpperCase()}
                      </div>
                      <div className="technique-row__sub">영상 {formatDuration(s.videoDurationSec)}</div>
                    </div>
                    <div className="technique-row__right">
                      {s.overallScores.posture !== null && <span className="chip">자세 {s.overallScores.posture}</span>}
                      <span className="chip">결과 보기 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setStep('sportSelect')}>
              스파링 분석 시작
            </button>
          </>
        )}

        {step === 'sportSelect' && (
          <div className="card info-card">
            <h3>종목 선택</h3>
            <div className="stack gap-1">
              {SPARRING_SPORTS.map((s) => (
                <button
                  key={s.id}
                  className={`choice-card ${sport === s.id ? 'choice-card--active' : ''}`}
                  onClick={() => setSport(s.id)}
                >
                  <span className="choice-card__radio">{sport === s.id ? '●' : '○'}</span>
                  <span className="choice-card__title">
                    {s.icon} {s.nameKo}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" disabled={!sport} onClick={() => setStep('upload')}>
                다음
              </button>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="card info-card">
            <h3>🎥 스파링 영상 분석</h3>
            <div className="field-label">선택한 종목</div>
            <p>{SPARRING_SPORTS.find((s) => s.id === sport)?.nameKo}</p>
            <div className="field-label" style={{ marginTop: 10 }}>
              영상 업로드
            </div>
            <div
              className="video-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
            >
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <p className="video-status-message">또는 파일을 이 영역으로 드래그하여 업로드하세요. (MP4 / MOV / WebM)</p>
            </div>
            <p className="video-status-message">※ 영상에 다른 사람이 함께 나오는 경우, 분석할 사람을 직접 지정해야 합니다.</p>
            {error && <div className="ai-inline-warning">{error}</div>}
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-ghost" onClick={() => setStep('sportSelect')}>
                이전
              </button>
            </div>
          </div>
        )}

        {/* One persistent <video> element from "preview" all the way through "result" — samplePosesFromVideo
            (during 'analyzing') and the result view's scene-seeking both need a real, mounted video element,
            so this is never unmounted just because the surrounding step card changes. */}
        {videoUrl && step !== 'hub' && step !== 'sportSelect' && step !== 'upload' && (
          <div className="card info-card">
            <h3>영상 미리보기</h3>
            <div className="video-preview-frame">
              <video ref={videoRef} src={videoUrl} controls onLoadedMetadata={handleVideoLoaded} onError={handleVideoError} className="video-preview-el" />
              {step === 'personSelect' && (
                <div className="person-picker-overlay">
                  {candidates.map((c) => (
                    <button
                      key={c.index}
                      className={`person-picker-marker ${selectedIndex === c.index ? 'person-picker-marker--active' : ''}`}
                      style={{
                        left: `${c.bbox.minX * 100}%`,
                        top: `${c.bbox.minY * 100}%`,
                        width: `${Math.max(4, (c.bbox.maxX - c.bbox.minX) * 100)}%`,
                        height: `${Math.max(4, (c.bbox.maxY - c.bbox.minY) * 100)}%`,
                      }}
                      onClick={() => setSelectedIndex(c.index)}
                    >
                      {selectedIndex === c.index ? '🔵' : '⚪'} {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {videoMeta && (step === 'preview' || step === 'personLoading' || step === 'personSelect' || step === 'personNotFound') && (
              <div className="curriculum-stat-row">
                <div>
                  <strong>{formatDuration(videoMeta.durationSec)}</strong>
                  <span>영상 길이</span>
                </div>
                <div>
                  <strong>
                    {videoMeta.width}×{videoMeta.height}
                  </strong>
                  <span>해상도</span>
                </div>
                <div>
                  <strong>{SPARRING_SPORTS.find((s) => s.id === sport)?.nameKo}</strong>
                  <span>종목</span>
                </div>
              </div>
            )}
            <p className="video-status-message">{videoFile?.name}</p>

            {step === 'preview' && (
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={handleDetectPeople}>
                  분석할 사람 지정
                </button>
              </div>
            )}

            {step === 'personLoading' && <p className="video-status-message">사람을 감지하는 중… (로컬 처리, 잠시 걸릴 수 있습니다)</p>}

            {step === 'personNotFound' && (
              <>
                <div className="ai-inline-warning">
                  이 장면에서 사람을 찾지 못했습니다. 영상의 다른 구간으로 이동한 뒤 다시 시도해주세요.
                </div>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-secondary" onClick={() => setStep('preview')}>
                    다른 장면 선택
                  </button>
                  <button className="btn btn-primary" onClick={handleDetectPeople}>
                    같은 장면에서 다시 시도
                  </button>
                </div>
              </>
            )}

            {step === 'personSelect' && (
              <>
                <p>영상에서 사람을 클릭하세요.</p>
                {selectedIndex !== null && <p>선택한 사람: {candidates[selectedIndex]?.label}</p>}
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-secondary" onClick={handleDetectPeople}>
                    이 장면에서 다시 찾기
                  </button>
                  <button className="btn btn-primary" disabled={selectedIndex === null} onClick={() => setStep('scopeSelect')}>
                    이 사람이 나입니다
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'scopeSelect' && (
          <div className="card info-card">
            <h3>무엇을 분석할까요?</h3>
            <div className="stack gap-1">
              {ALL_SCOPES.map((s) => (
                <label key={s} className="choice-card" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={scopes.has(s)} onChange={() => toggleScope(s)} />
                  <span className="choice-card__title">{ANALYSIS_SCOPE_LABEL[s]}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-ghost" onClick={() => setStep('personSelect')}>
                이전
              </button>
              <button className="btn btn-primary" disabled={scopes.size === 0} onClick={handleStartAnalysis}>
                분석 시작
              </button>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="card info-card">
            <h3>분석 중…</h3>
            <p className="video-status-message">
              영상을 프레임 단위로 살펴보며 지정하신 분이 맞는지 추적하고 있습니다. 영상 길이에 따라 시간이 걸릴 수
              있습니다.
            </p>
            {analyzeProgress && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round((analyzeProgress.done / analyzeProgress.total) * 100)}%` }} />
              </div>
            )}
            {error && <div className="ai-inline-warning">{error}</div>}
          </div>
        )}

        {step === 'result' && resultSession && (
          <>
            <SparringResultView session={resultSession} videoUrl={videoUrl} onSeek={handleSeekResult} />
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-secondary" onClick={resetWizard}>
                새 영상 분석하기
              </button>
            </div>
          </>
        )}

        {step === 'hub' && sessions.length === 0 && (
          <EmptyState icon="🥊" text="아직 분석한 스파링 영상이 없습니다." />
        )}
      </div>
    </div>
  );
}
