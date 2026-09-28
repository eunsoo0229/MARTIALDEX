import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { runGymDuplicateStage, runGymVerificationStage, type GymVerificationStageResult } from '../lib/gymTrainingDiscovery/service';
import { registerDiscoveredTechnique } from '../lib/techniqueDiscovery/service';
import type { DuplicateCheckResult, UserTechniqueRecord } from '../lib/userTechniques/types';
import { GYM_BODY_PART_LABEL } from '../lib/gymTraining/recovery';
import BackButton from '../components/BackButton';

// Mirrors RequestHomeExercise.tsx's Step state machine exactly — same
// steps, same flow — with copy changed from "운동"(홈트) to "헬스 운동" and
// the preview card showing gym-specific fields (부위/주요 근육/장비/난이도)
// instead of posture/수행 방법.
type Step = 'input' | 'checking' | 'duplicate' | 'rejected' | 'preview' | 'saved' | 'error';

const VERDICT_LABEL: Record<string, string> = {
  confirmed: '✅ 실제로 사용되는 헬스 운동으로 확인되었습니다.',
  alias_of_existing: '⚠️ 운동명은 확인되지만 표준 명칭이 아닌 별칭으로 보입니다.',
  uncertain: '❌ 실제 헬스 운동으로 확인하기 어렵습니다.',
  fictional: '❌ 실제 헬스 운동으로 확인하기 어렵습니다.',
  insufficient_evidence: '⚠️ 검증할 수 있는 자료가 부족합니다.',
};

export default function RequestGymExercise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCheckResult | null>(null);
  const [verificationOutcome, setVerificationOutcome] = useState<GymVerificationStageResult | null>(null);
  const [record, setRecord] = useState<UserTechniqueRecord | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCheck() {
    if (!name.trim()) {
      setErrorMessage('운동 이름을 입력해주세요.');
      setStep('error');
      return;
    }
    setStep('checking');
    setErrorMessage(null);

    const dupResult = await runGymDuplicateStage({ name, description: description.trim() || undefined });
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

    const verification = await runGymVerificationStage({ name, description: description.trim() || undefined, userId: user?.id ?? null });
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
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      // Same registration path techniqueDiscovery/homeTrainingDiscovery
      // already use — martial-art agnostic, works unchanged for
      // GYM_MARTIAL_ART_ID: logged in -> add_teq (Supabase, shared with
      // every user), logged out -> local-only user_techniques fallback.
      await registerDiscoveredTechnique(record, user?.id ?? null);
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
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton fallback="/training/exercises" />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/training/exercises">헬스 운동 목록</Link>
          <span>/</span>
          <span>운동 추가 요청</span>
        </div>
        <div className="section-title">
          <h2>➕ 새로운 헬스 운동 추가</h2>
        </div>

        {step === 'input' && (
          <div className="card info-card">
            <p className="video-status-message">앱 헬스 운동 목록에서 찾을 수 없는 운동이 있다면 운동 이름을 입력해주세요.</p>
            <label className="field-label">운동 이름</label>
            <input
              className="select"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="예: 펜들레이 로우"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="field-label">추가 설명 (선택)</label>
            <textarea
              style={{ width: '100%', minHeight: 70, marginBottom: 12 }}
              placeholder="예: 매 반복마다 바벨을 바닥에 완전히 내려놓는 바벨 로우 변형"
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
            <h3>이미 Martialdex 헬스 운동 목록에 있는 운동입니다.</h3>
            <p>{duplicate.reason}</p>
            <div className="modal-actions modal-actions--start">
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
            <p className="video-status-message">⚠️ 실제 헬스 운동인지 확인하기 어려워 자동 등록하지 않았습니다.</p>
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
                  <strong>{record.technique.gymBodyPart ? GYM_BODY_PART_LABEL[record.technique.gymBodyPart] : '-'}</strong>
                  <span>부위</span>
                </div>
                <div>
                  <strong>{record.technique.gymDifficulty ?? '-'}</strong>
                  <span>난이도</span>
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
              </p>
              <p style={{ whiteSpace: 'pre-line' }}>
                <strong>설명</strong>
                <br />
                {record.technique.description}
              </p>
              <p>
                <strong>주요 근육</strong>
                <br />
                {record.technique.primaryMuscle ?? '-'}
                {record.technique.secondaryMuscles && record.technique.secondaryMuscles.length > 0 ? ` (보조: ${record.technique.secondaryMuscles.join(', ')})` : ''}
              </p>
              <p>
                <strong>필요 장비</strong>
                <br />
                {record.technique.gymEquipment && record.technique.gymEquipment.length > 0 ? record.technique.gymEquipment.join(', ') : '맨몸'}
              </p>
              <p>
                <strong>운동 유형</strong>
                <br />
                {record.technique.gymExerciseKind ?? '-'}
              </p>
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
                ? '실제 존재 여부 검증을 통과해 공용 헬스 운동 라이브러리에 즉시 등록되었습니다. 다른 사용자도 검색·사용할 수 있습니다.'
                : '로그인하지 않은 상태라 이 기기에만 저장되었습니다. 로그인하면 공용 헬스 운동 라이브러리에 등록되어 모든 사용자가 사용할 수 있습니다.'}
            </p>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-secondary" onClick={reset}>
                다른 운동 추가하기
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/training/exercises')}>
                헬스 운동 목록으로 이동
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
