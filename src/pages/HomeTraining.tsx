import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { martialArtSummaries } from '../lib/loadData';
import type { HomeExerciseEquipment } from '../types';
import { generateHomeCurriculumPreview, saveHomeCurriculumPreview, listMyHomeCurricula, type HomeCurriculumPreview } from '../lib/homeTraining/service';
import { HOME_TRAINING_MARTIAL_ART_ID } from '../lib/homeTraining/library';
import { useMyCurricula } from '../lib/curriculum/useCurriculum';
import BackButton from '../components/BackButton';

type Step = 'input' | 'generating' | 'clarifying' | 'preview' | 'saving' | 'error' | 'no_data';

const SESSIONS_PER_WEEK_PRESETS = [2, 3, 4, 5] as const;
const TOTAL_WEEKS_PRESETS = [1, 2, 4, 8] as const;
const MINUTES_PRESETS = [10, 20, 30, 45, 60] as const;

const EQUIPMENT_OPTIONS: { value: HomeExerciseEquipment; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'mat', label: '매트' },
  { value: 'jump_rope', label: '줄넘기' },
  { value: 'dumbbell', label: '덤벨' },
  { value: 'band', label: '밴드' },
  { value: 'pull_up_bar', label: '풀업바' },
  { value: 'other', label: '기타' },
];

const EXAMPLES = ['집에서 레슬링 테이크다운에 필요한 움직임과 하체 체력을 키우고 싶어', '복싱할 때 풋워크와 움직임을 개선하고 싶어', '전반적인 체력과 코어를 키우고 싶어'];

export default function HomeTraining() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');
  const [freeText, setFreeText] = useState('');
  const [relatedMartialArt, setRelatedMartialArt] = useState('');
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [totalWeeks, setTotalWeeks] = useState<number>(4);
  const [minutesPerSession, setMinutesPerSession] = useState<number>(30);
  const [equipment, setEquipment] = useState<HomeExerciseEquipment[]>(['none']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [clarifyingAnswerInput, setClarifyingAnswerInput] = useState('');
  const [preview, setPreview] = useState<HomeCurriculumPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [noGoalMode, setNoGoalMode] = useState(false);

  const myCurricula = useMyCurricula();
  const myHomeCurricula = useMemo(() => myCurricula.filter((c) => !!c.homeTrainingMeta), [myCurricula]);

  function toggleEquipment(value: HomeExerciseEquipment) {
    setEquipment((prev) => {
      if (value === 'none') return ['none'];
      const withoutNone = prev.filter((e) => e !== 'none');
      return withoutNone.includes(value) ? withoutNone.filter((e) => e !== value) : [...withoutNone, value];
    });
  }

  async function runGenerate(textOverride?: string | null) {
    setStep('generating');
    setErrorMessage(null);
    const result = await generateHomeCurriculumPreview({
      freeText: textOverride === undefined ? (noGoalMode ? null : freeText) : textOverride,
      relatedMartialArt: relatedMartialArt || null,
      sessionsPerWeek,
      totalWeeks,
      minutesPerSession,
      equipment: equipment.length > 0 ? equipment : ['none'],
    });
    if (!result.ok) {
      if (result.code === 'CLARIFYING_NEEDED') {
        setClarifyingQuestion(result.question);
        setStep('clarifying');
        return;
      }
      if (result.code === 'NO_TRAINING_DATA') {
        setStep('no_data');
        return;
      }
      const message = result.code === 'VALIDATION_FAILED' ? `커리큘럼 생성 결과에 문제가 있어 저장하지 않았습니다:\n${result.errors.join('\n')}` : result.message;
      setErrorMessage(message);
      setStep('error');
      return;
    }
    setPreview(result.preview);
    setStep('preview');
  }

  function handleGenerateClick() {
    setNoGoalMode(false);
    if (!freeText.trim()) {
      setErrorMessage('원하는 목표를 입력하거나, 아래 "목적 없이 훈련 기록으로 추천받기"를 눌러주세요.');
      setStep('error');
      return;
    }
    void runGenerate();
  }

  function handleNoGoalClick() {
    setNoGoalMode(true);
    setFreeText('');
    void runGenerate(null);
  }

  function handleClarifyingAnswer() {
    const answered = clarifyingAnswerInput.trim() ? `${freeText} (${clarifyingAnswerInput.trim()})` : freeText;
    void runGenerate(noGoalMode ? null : answered);
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const curriculum = saveHomeCurriculumPreview(preview);
      navigate(`/learning/${HOME_TRAINING_MARTIAL_ART_ID}/${curriculum.id}`);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep('input');
    setErrorMessage(null);
    setClarifyingQuestion(null);
    setClarifyingAnswerInput('');
    setPreview(null);
    setNoGoalMode(false);
  }

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <span>홈트</span>
        </div>
        <div className="section-title">
          <h2>💪 홈트레이닝</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          일반 체력 운동뿐 아니라 격투기 훈련에 필요한 움직임(레벨체인지, 풋워크 등)을 함께 다루는 홈트레이닝입니다. 목적을 입력하면 AI가 맞춤 커리큘럼을 만들고,
          목적을 입력하지 않으면 실제 훈련 기록을 분석해 추천합니다.
        </p>
        <div className="chip-row" style={{ marginBottom: 16 }}>
          <Link to={`/arts/${HOME_TRAINING_MARTIAL_ART_ID}/techniques`} className="chip">
            📋 전체 홈트 운동 보기
          </Link>
          <Link to="/home-training/request" className="chip">
            ➕ 없는 운동 추가하기
          </Link>
        </div>

        {step === 'input' && (
          <>
            {myHomeCurricula.length > 0 && (
              <div className="card info-card">
                <h3>내가 만든 홈트 커리큘럼</h3>
                <div className="stack gap-2">
                  {myHomeCurricula.map((c) => (
                    <Link key={c.id} to={`/learning/${HOME_TRAINING_MARTIAL_ART_ID}/${c.id}`} className="technique-row">
                      <div className="technique-row__main">
                        <div className="technique-row__name">
                          {c.coverIcon ? `${c.coverIcon} ` : ''}
                          {c.title}
                        </div>
                        <div className="technique-row__sub">
                          {c.homeTrainingMeta?.sessionsPerWeek}회/주 · {c.homeTrainingMeta?.totalWeeks}주 · {c.totalDays}세션
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="card info-card ai-step--input">
              <label className="field-label">원하는 목표</label>
              <textarea
                className="field-full"
                style={{ minHeight: 70, marginBottom: 8 }}
                placeholder="원하는 목표를 입력하세요..."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="chip" onClick={() => setFreeText(ex)}>
                    {ex}
                  </button>
                ))}
              </div>

              <div className="chip-row" style={{ marginTop: 16 }}>
                <div>
                  <label className="field-label">관련 무술 (선택)</label>
                  <br />
                  <select className="select" value={relatedMartialArt} onChange={(e) => setRelatedMartialArt(e.target.value)}>
                    <option value="">없음 / 일반 체력</option>
                    {martialArtSummaries.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nameKo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">기간</label>
                  <br />
                  <select className="select" value={totalWeeks} onChange={(e) => setTotalWeeks(Number(e.target.value))}>
                    {TOTAL_WEEKS_PRESETS.map((w) => (
                      <option key={w} value={w}>
                        {w}주
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">주당 훈련 횟수</label>
                  <br />
                  <select className="select" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(Number(e.target.value))}>
                    {SESSIONS_PER_WEEK_PRESETS.map((s) => (
                      <option key={s} value={s}>
                        {s}일
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">1회 훈련 시간</label>
                  <br />
                  <select className="select" value={minutesPerSession} onChange={(e) => setMinutesPerSession(Number(e.target.value))}>
                    {MINUTES_PRESETS.map((m) => (
                      <option key={m} value={m}>
                        {m}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="field-label" style={{ marginTop: 12 }}>
                사용 가능 장비
              </label>
              <div className="chip-row" style={{ marginBottom: 16 }}>
                {EQUIPMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`chip${equipment.includes(opt.value) ? ' active' : ''}`}
                    onClick={() => toggleEquipment(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" onClick={handleGenerateClick}>
                  AI에게 홈트 커리큘럼 만들기
                </button>
                <button className="btn btn-secondary" onClick={handleNoGoalClick}>
                  목적 없이 훈련 기록으로 추천받기
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'generating' && (
          <div className="card info-card text-center">
            <p className="video-status-message row gap-1" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> AI가 {noGoalMode ? '훈련 기록을 분석하고' : '입력하신 목표를 분석하고'} 홈트 커리큘럼을 만들고 있습니다...
            </p>
          </div>
        )}

        {step === 'no_data' && (
          <div className="card info-card">
            <h3>아직 분석할 훈련 기록이 없습니다.</h3>
            <p className="video-status-message">기록된 훈련 데이터가 없어 부족한 부분을 판단할 수 없습니다. 원하는 목표를 직접 입력해주세요.</p>
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={reset}>
                목표 입력하기
              </button>
            </div>
          </div>
        )}

        {step === 'clarifying' && clarifyingQuestion && (
          <div className="card info-card ai-step--input">
            <h3>추가로 하나만 확인할게요</h3>
            <p>{clarifyingQuestion}</p>
            <input
              className="select field-full"
              style={{ marginBottom: 12 }}
              placeholder="답변을 입력하세요 (건너뛰어도 괜찮습니다)"
              value={clarifyingAnswerInput}
              onChange={(e) => setClarifyingAnswerInput(e.target.value)}
            />
            <div className="modal-actions modal-actions--start">
              <button className="btn btn-primary" onClick={handleClarifyingAnswer}>
                답변하고 계속하기
              </button>
              <button className="btn btn-ghost" onClick={() => runGenerate(noGoalMode ? null : freeText)}>
                건너뛰기 (기본값 사용)
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="card info-card">
            <div className="banner banner--error" style={{ whiteSpace: 'pre-line' }}>
              {errorMessage}
            </div>
            <div className="modal-actions modal-actions--start" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={reset}>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="card info-card">
              <h3>AI 분석 결과</h3>
              <p>
                <strong>당신의 목표:</strong> {preview.analysis.summary}
              </p>
              {preview.analysis.trainingRecordAnalysis && (
                <p className="video-status-message" style={{ whiteSpace: 'pre-line' }}>
                  {preview.analysis.trainingRecordAnalysis}
                </p>
              )}
              <div className="curriculum-stat-row">
                <div>
                  <strong>{preview.totalWeeks}주</strong>
                  <span>기간</span>
                </div>
                <div>
                  <strong>{preview.sessionsPerWeek}회/주</strong>
                  <span>훈련 빈도</span>
                </div>
                <div>
                  <strong>{preview.minutesPerSession}분</strong>
                  <span>1회 훈련</span>
                </div>
                <div>
                  <strong>{preview.matchedExercises.length}개</strong>
                  <span>매칭된 운동</span>
                </div>
              </div>
            </div>

            <div className="section-title">
              <h2>세션별 커리큘럼</h2>
            </div>
            <div className="stack gap-2">
              {preview.days.map((d) => (
                <div key={d.day} className="card info-card">
                  <strong>{d.day}회차</strong> — {d.title.replace(/^\d+회차 · /, '')}
                  {d.techniqueIds.length > 0 && <p style={{ margin: 0 }}>운동: {d.techniqueIds.length}개 · {d.estimatedMinutes}분</p>}
                </div>
              ))}
            </div>

            <div className="modal-actions modal-actions--start" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장하기'}
              </button>
              <button className="btn btn-ghost" onClick={reset}>
                처음부터 다시
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
