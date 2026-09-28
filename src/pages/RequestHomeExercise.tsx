import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { runExerciseDuplicateStage, runExerciseVerificationStage, type ExerciseVerificationStageResult } from '../lib/homeTrainingDiscovery/service';
import { registerDiscoveredTechnique } from '../lib/techniqueDiscovery/service';
import type { DuplicateCheckResult, UserTechniqueRecord } from '../lib/userTechniques/types';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../lib/homeTraining/library';
import { videoSearchProvider } from '../lib/videoSearch/provider';
import type { VideoSearchItem } from '../lib/videoSearch/types';
import BackButton from '../components/BackButton';

// Mirrors RequestTechnique.tsx's Step state machine exactly — same steps,
// same flow — with the martial-art picker removed (always home-training)
// and copy changed from "기술" to "운동".
type Step = 'input' | 'checking' | 'duplicate' | 'rejected' | 'preview' | 'saved' | 'error';

const VERDICT_LABEL: Record<string, string> = {
  confirmed: '✅ 실제로 사용되는 운동/훈련으로 확인되었습니다.',
  alias_of_existing: '⚠️ 운동명은 확인되지만 표준 명칭이 아닌 별칭으로 보입니다.',
  uncertain: '❌ 실제 운동으로 확인하기 어렵습니다.',
  fictional: '❌ 실제 운동으로 확인하기 어렵습니다.',
  insufficient_evidence: '⚠️ 검증할 수 있는 자료가 부족합니다.',
};

export default function RequestHomeExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [verificationOutcome, setVerificationOutcome] = useState<ExerciseVerificationStageResult | null>(null);
  const [record, setRecord] = useState<UserTechniqueRecord | null>(null);
  const [videoResults, setVideoResults] = useState<VideoSearchItem[] | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCheck() {
    if (!name.trim()) {
      setErrorMessage('운동 이름을 입력해주세요.');
      setStep('error');
      return;
    }
    setStep('checking');
    setErrorMessage(null);

    const dupResult = await runExerciseDuplicateStage({ name, description: description.trim() || undefined });
    if (!dupResult.ok) {
      setErrorMessage(dupResult.message);
      setStep('error');
      return;
    }
    if (dupResult.duplicate.isDuplicate) {
      setDuplicate(dupResult.duplicate);
      setStep('duplicate');
      return;
    }

    const verification = await runExerciseVerificationStage({ name, description: description.trim() || undefined, userId: user?.id ?? null });
    setVerificationOutcome(verification);
    if (!verification.ok) {
      setErrorMessage(verification.message);
      setStep('error');
      return;
    }
    if (!verification.accepted) {
      if ('duplicate' in verification) {
        setDuplicate(verification.duplicate);
        setStep('duplicate');
      } else {
        setStep('rejected');
      }
      return;
    }

    setRecord(verification.record);
    setStep('preview');

    setVideoResults(null);
    videoSearchProvider.search(`${name} exercise tutorial`).then((outcome) => {
      if (outcome.ok) setVideoResults(outcome.results);
      else setVideoResults([]);
    });
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      const withVideo: UserTechniqueRecord = selectedVideoId
        ? {
            ...record,
            technique: {
              ...record.technique,
              videos: videoResults?.filter((v) => v.videoId === selectedVideoId).map((v) => ({ title: v.title, videoId: v.videoId, channel: v.channel })) ?? [],
            },
          }
        : record;
      // Same registration path techniqueDiscovery already uses — martial-art
      // agnostic, so it works unchanged for HOME_TRAINING_MARTIAL_ART_ID too.
      await registerDiscoveredTechnique(withVideo, user?.id ?? null);
      setRecord(withVideo);
      setStep('saved');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep('input');
    setName('');
    setDescription('');
    setDuplicate(null);
    setVerificationOutcome(null);
    setRecord(null);
    setVideoResults(null);
    setSelectedVideoId(null);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to={`/arts/${HOME_TRAINING_MARTIAL_ART_ID}/techniques`}>홈트 전체 운동</Link>
          <span>/</span>
          <span>운동 추가 요청</span>
        </div>
        <div className="section-title">
          <h2>➕ 새로운 홈트 운동 추가</h2>
        </div>

        {step === 'input' && (
          <div className="card info-card">
            <p className="video-status-message">앱 홈트 목록에서 찾을 수 없는 운동이 있다면 운동 이름을 입력해주세요.</p>
            <label className="field-label">운동 이름</label>
            <input className="select" style={{ width: '100%', marginBottom: 12 }} placeholder="예: Sprawl Drill" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="field-label">추가 설명 (선택)</label>
            <textarea
              style={{ width: '100%', minHeight: 70, marginBottom: 12 }}
              placeholder="예: 스프롤 자세로 반복해서 내려갔다 일어나는 컨디셔닝 드릴"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleCheck}>
                AI로 운동 확인
              </button>
            </div>
          </div>
        )}

        {step === 'checking' && (
          <div className="card info-card text-center">
            <p className="video-status-message">AI가 운동을 확인하고 있습니다...</p>
          </div>
        )}

        {step === 'duplicate' && duplicate && (
          <div className="card info-card">
            <h3>이미 Martialdex 홈트 목록에 있는 운동입니다.</h3>
            <p>{duplicate.reason}</p>
            <div className="modal-actions modal-actions--start">
              {duplicate.matchedTechniqueId && (
                <Link to={`/arts/${HOME_TRAINING_MARTIAL_ART_ID}/techniques/${duplicate.matchedTechniqueId}`} className="btn btn-primary">
                  운동 보기
                </Link>
              )}
              <button className="btn btn-ghost" onClick={reset}>
                다른 운동 입력
              </button>
            </div>
          </div>
        )}

        {step === 'rejected' && verificationOutcome?.ok === true && !verificationOutcome.accepted && (
          <div className="card info-card">
            <h3>"{name}"</h3>
            <p>
              <strong>검증 결과:</strong> {VERDICT_LABEL[verificationOutcome.verification.verdict] ?? verificationOutcome.message}
            </p>
            <p className="video-status-message">{verificationOutcome.message}</p>
            {verificationOutcome.verification.reason && <p className="video-status-message">{verificationOutcome.verification.reason}</p>}
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>확신도: {verificationOutcome.verification.confidence}%</p>
            <p className="video-status-message">⚠️ 실제 운동인지 확인하기 어려워 자동 등록하지 않았습니다.</p>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={reset}>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="card info-card">
            <p className="video-status-message">{errorMessage}</p>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={() => setStep('input')}>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && record && (
          <>
            <div className="card info-card">
              <h3>"{name}"</h3>
              <p>
                <strong>검증 결과:</strong> {VERDICT_LABEL[record.verification.verdict]}
              </p>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{record.technique.category}</strong>
                  <span>분류</span>
                </div>
                <div>
                  <strong>{record.technique.exerciseType ?? '-'}</strong>
                  <span>유형</span>
                </div>
                <div>
                  <strong>{record.verification.confidence}%</strong>
                  <span>확신도</span>
                </div>
              </div>
              {record.verification.evidenceNotes.length > 0 && (
                <>
                  <p style={{ marginBottom: 4 }}>
                    <strong>확인된 정보</strong>
                  </p>
                  <ul style={{ marginTop: 0 }}>
                    {record.verification.evidenceNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </>
              )}
              {record.verification.groundingSources.length > 0 && (
                <p className="video-status-message">출처: {record.verification.groundingSources.map((s) => s.title || s.uri).join(', ')}</p>
              )}
              {!record.verification.usedSearchGrounding && <p className="video-status-message">※ 실시간 검색 자료 없이 AI 자체 지식으로만 검증되었습니다.</p>}
            </div>

            <div className="card info-card">
              <h3>새로운 운동 등록 미리보기</h3>
              <p>
                <strong>운동명</strong>
                <br />
                {record.technique.name}
                {record.technique.koreanName && record.technique.koreanName !== record.technique.name ? ` (${record.technique.koreanName})` : ''}
              </p>
              <p>
                <strong>목적</strong>
                <br />
                {record.technique.purpose || '-'}
              </p>
              <p style={{ whiteSpace: 'pre-line' }}>
                <strong>설명</strong>
                <br />
                {record.technique.description}
              </p>
              <p>
                <strong>필요 장비</strong>
                <br />
                {record.technique.equipment && record.technique.equipment.length > 0 ? record.technique.equipment.join(', ') : '없음'}
              </p>
              {record.technique.posture ? (
                <div>
                  <strong>수행 방법</strong>
                  <p style={{ whiteSpace: 'pre-line' }}>{record.technique.posture.overview}</p>
                  {record.technique.posture.steps && record.technique.posture.steps.length > 0 && (
                    <ol>
                      {record.technique.posture.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : (
                <p className="video-status-message">수행 방법 정보가 충분하지 않아 이번에는 생성하지 않았습니다.</p>
              )}
            </div>

            <div className="card info-card">
              <h3>🎥 참고 영상</h3>
              {videoResults === null && <p className="video-status-message">영상을 검색하는 중...</p>}
              {videoResults?.length === 0 && <p className="video-status-message">관련 영상을 찾지 못했습니다.</p>}
              {videoResults && videoResults.length > 0 && (
                <div className="video-embed-grid">
                  {videoResults.map((v) => (
                    <label key={v.videoId} className="video-search-result" style={{ cursor: 'pointer' }}>
                      <div className="video-search-result__thumb-wrap">
                        <img src={v.thumbnailUrl} alt={v.title} className="video-search-result__thumb" loading="lazy" />
                      </div>
                      <div className="video-embed__title">
                        <input type="radio" name="selectedVideo" checked={selectedVideoId === v.videoId} onChange={() => setSelectedVideoId(v.videoId)} /> {v.title}
                      </div>
                      <div className="video-embed__channel">{v.channel}</div>
                    </label>
                  ))}
                </div>
              )}
              {videoResults && videoResults.length > 0 && <p className="video-status-message">등록 시 선택한 영상을 함께 저장합니다 (선택 안 해도 등록 가능).</p>}
            </div>

            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '등록 중...' : '등록하기'}
              </button>
              <button className="btn btn-ghost" onClick={reset} disabled={saving}>
                취소
              </button>
            </div>
          </>
        )}

        {step === 'saved' && record && (
          <div className="card info-card">
            <h3>✅ 운동이 등록되었습니다.</h3>
            <p className="video-status-message">
              {user
                ? '실제 존재 여부 검증을 통과해 공용 홈트 라이브러리에 즉시 등록되었습니다. 다른 사용자도 검색·사용할 수 있습니다.'
                : '로그인하지 않은 상태라 이 기기에만 저장되었습니다. 로그인하면 공용 홈트 라이브러리에 등록되어 모든 사용자가 사용할 수 있습니다.'}
            </p>
            <div className="modal-actions modal-actions--start">
              <Link to={`/arts/${HOME_TRAINING_MARTIAL_ART_ID}/techniques/${record.id}`} className="btn btn-primary">
                운동 상세 보기
              </Link>
              <button className="btn btn-secondary" onClick={reset}>
                다른 운동 추가하기
              </button>
              <button className="btn btn-ghost" onClick={() => navigate(`/arts/${HOME_TRAINING_MARTIAL_ART_ID}/techniques`)}>
                전체 홈트 운동으로 이동
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
