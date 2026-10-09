import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BackButton from '../components/BackButton';
import TutorVoiceSettingsPanel from '../components/TutorVoiceSettingsPanel';
import CoachLocationPicker from '../components/CoachLocationPicker';
import AutoGrowTextarea from '../components/AutoGrowTextarea';
import { martialArtSummaries } from '../lib/loadData';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import { listMyCurricula, getProgress } from '../lib/curriculum/curriculumService';
import { resolveTechnique } from '../lib/userTechniques/service';
import type { Curriculum } from '../lib/curriculum/types';
import type { CoachLocation } from '../lib/aiCoachCurriculum/types';
import { equipmentLabel, LOCATION_ICON, LOCATION_LABEL } from '../lib/aiCoachCurriculum/location';
import { buildLearnerProfile, latestKnownGoal, learnedCountsByArt } from '../lib/aiCoachCurriculum/profile';
import { generateCoachClassCurriculum, ROLE_LABEL, type CoachClassResult } from '../lib/aiCoachCurriculum/service';

// "AI 코치 수업" — 장소(집/체육관) → 수업 설정 → AI 코치 전용 커리큘럼 생성 →
// Day를 AI 코치(말로/입력으로)와 진행. The generated curriculum is a normal
// custom curriculum, so its Day list / 혼자 하기 / training history all work.

const MINUTE_OPTIONS = [20, 30, 45, 60];
const DAY_OPTIONS = [3, 5, 7];

export default function AiCoachClass() {
  const navigate = useNavigate();
  const [place, setPlace] = useState<{ location: CoachLocation; equipment: string[] } | null>(null);
  const artCounts = useMemo(() => learnedCountsByArt(), []);
  const [martialArt, setMartialArt] = useState(() => (artCounts[0]?.count ? artCounts[0].martialArt : martialArtSummaries[0]?.id ?? 'bjj'));
  const [goal, setGoal] = useState(latestKnownGoal);
  const [minutes, setMinutes] = useState(30);
  const [days, setDays] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CoachClassResult | null>(null);
  const [startDay, setStartDay] = useState<number | null>(null);
  const profile = useMemo(() => buildLearnerProfile(martialArt), [martialArt]);
  const statusCounts = useMemo(() => {
    const c: Partial<Record<MasteryStatus, number>> = {};
    for (const l of profile.learned) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [profile]);
  const myCoachCurricula = useMemo(() => listMyCurricula().filter((c) => c.aiCoachMeta).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [result]);

  async function generate() {
    if (!place) return;
    setGenerating(true);
    try {
      const r = await generateCoachClassCurriculum({ martialArt, location: place.location, equipment: place.equipment, goal, sessionMinutes: minutes, days });
      setResult(r);
    } finally {
      setGenerating(false);
    }
  }

  function startCoach(c: Curriculum, day: number, mode: 'voice' | 'text') {
    navigate(`/learning/${c.martialArt}/${c.id}/coach/${day}?mode=${mode}`);
  }

  const curriculum = result?.curriculum;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/coach">AI 코치</Link>
          <span>/</span>
          <span>AI 코치 수업</span>
        </div>
        <div className="section-title">
          <h2>🧑‍🏫 AI 코치 수업</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          운동 장소와 지금까지 배운 기술·숙련도를 바탕으로 AI 코치가 수업 커리큘럼을 만들고, 코치와 함께 진행합니다.
        </p>

        {!curriculum && (
          <div className="card info-card" data-testid="coach-class-setup">
            {!place ? (
              <CoachLocationPicker confirmLabel="이 환경으로 수업 만들기" onConfirm={(location, equipment) => setPlace({ location, equipment })} />
            ) : (
              <div className="stack gap-2">
                <p style={{ margin: 0 }} data-testid="coach-class-place" data-location={place.location}>
                  {LOCATION_ICON[place.location]} <strong>{LOCATION_LABEL[place.location]}</strong>
                  {place.equipment.length ? ` · ${place.equipment.map((e) => equipmentLabel(place.location, e)).join(', ')}` : ' · 확인된 장비 없음'}{' '}
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlace(null)} disabled={generating}>
                    변경
                  </button>
                </p>
                <label className="field-label">
                  무술
                  <select className="select" data-testid="coach-class-art" value={martialArt} onChange={(e) => setMartialArt(e.target.value)} disabled={generating}>
                    {martialArtSummaries.map((a) => {
                      const n = artCounts.find((c) => c.martialArt === a.id)?.count ?? 0;
                      return (
                        <option key={a.id} value={a.id}>
                          {a.nameKo}
                          {n ? ` (배운 기술 ${n})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="video-status-message" data-testid="coach-class-learned">
                  이 무술에서 배운 기술 {profile.learned.length}개
                  {profile.learned.length > 0 &&
                    ` — ${(['proficient', 'average', 'learning', 'needs_improvement', 'not_started'] as MasteryStatus[])
                      .filter((s) => statusCounts[s])
                      .map((s) => `${MASTERY_ICON[s]} ${MASTERY_LABEL[s]} ${statusCounts[s]}`)
                      .join(' · ')}`}{' '}
                  <Link to={`/learned-techniques?martialArt=${martialArt}`}>배운 기술 보기</Link>
                </div>
                {/* Label and field stacked, field full width — a long goal wraps and grows instead of being cut off. */}
                <div className="field-block">
                  <label className="field-label" htmlFor="coach-class-goal">
                    운동 목표
                  </label>
                  <AutoGrowTextarea
                    id="coach-class-goal"
                    className="select"
                    data-testid="coach-class-goal"
                    minRows={3}
                    value={goal}
                    placeholder="예: 잽-크로스 연결을 빠르게, 가드에서 서브미션 이어가기"
                    onChange={(e) => setGoal(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <div className="chip-row">
                  <span className="field-label">하루 운동 시간</span>
                  {MINUTE_OPTIONS.map((m) => (
                    <button key={m} className={`chip ${minutes === m ? 'active' : ''}`} onClick={() => setMinutes(m)} disabled={generating}>
                      {m}분
                    </button>
                  ))}
                </div>
                <div className="chip-row">
                  <span className="field-label">수업 일수</span>
                  {DAY_OPTIONS.map((d) => (
                    <button key={d} className={`chip ${days === d ? 'active' : ''}`} onClick={() => setDays(d)} disabled={generating}>
                      {d}일
                    </button>
                  ))}
                </div>
                <div className="modal-actions modal-actions--start">
                  <button className="btn btn-primary" data-testid="coach-class-generate" onClick={() => void generate()} disabled={generating}>
                    {generating ? 'AI 코치가 수업을 구성하는 중…' : 'AI 코치 수업 만들기'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {curriculum && curriculum.aiCoachMeta && (
          <div className="card info-card" data-testid="coach-class-result" data-source={result.source} data-curriculum-id={curriculum.id}>
            <h3>
              {curriculum.coverIcon} {curriculum.title}
            </h3>
            <p style={{ margin: '4px 0' }}>{curriculum.aiCoachMeta.summary}</p>
            <p className="video-status-message">
              {LOCATION_LABEL[curriculum.aiCoachMeta.location]} · 하루 {curriculum.aiCoachMeta.sessionMinutes}분 · {curriculum.totalDays}일 ·{' '}
              {result.source === 'ai' ? 'AI 코치가 구성' : '기본 구성(AI 응답 없음)'}
            </p>
            {result.notices.map((n) => (
              <div key={n} className="ai-inline-warning">
                {n}
              </div>
            ))}
            {curriculum.aiCoachMeta.equipmentQuestions.length > 0 && (
              <div className="ai-inline-warning" data-testid="coach-class-questions">
                코치가 확인하고 싶은 것: {curriculum.aiCoachMeta.equipmentQuestions.join(' / ')}
              </div>
            )}
            <div className="stack gap-2" style={{ marginTop: 8 }}>
              {curriculum.days.map((d) => (
                <div key={d.day} className="coach-class-day" data-testid="coach-class-day">
                  <strong>
                    Day {d.day} · {d.title}
                  </strong>{' '}
                  <span className="video-status-message">약 {d.estimatedMinutes}분</span>
                  {d.coachNotes && <div className="video-status-message">{d.coachNotes}</div>}
                  <ol className="coach-class-steps">
                    {(d.coachPlan ?? []).map((i, idx) => {
                      const t = resolveTechnique(i.techniqueId);
                      return (
                        <li key={`${i.techniqueId}-${idx}`} data-testid="coach-class-step" data-role={i.role} data-technique-id={i.techniqueId} data-needs-partner={String(i.needsPartner)}>
                          <span className="chip">{ROLE_LABEL[i.role]}</span> <strong>{t?.name ?? i.techniqueId}</strong> · {i.minutes}분 — {i.instruction}
                          {i.soloAlternative && <span className="video-status-message"> (없으면: {i.soloAlternative})</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
            {startDay === null ? (
              <div className="modal-actions modal-actions--start">
                <button className="btn btn-primary" data-testid="coach-class-start" onClick={() => setStartDay(1)}>
                  Day 1 AI 코치와 시작
                </button>
                <Link to={`/learning/${curriculum.martialArt}/${curriculum.id}`} className="btn btn-secondary">
                  커리큘럼 보기
                </Link>
                <button className="btn btn-ghost" onClick={() => setResult(null)}>
                  다시 만들기
                </button>
              </div>
            ) : (
              <div className="day-start-options" style={{ marginTop: 10 }}>
                <details className="coach-voice-settings" data-testid="prestart-voice-settings">
                  <summary>🔊 말로 대화할 때의 AI 튜터 음성 · 말하기 속도</summary>
                  <TutorVoiceSettingsPanel autoSave />
                </details>
                <button className="btn btn-primary day-start-option" onClick={() => startCoach(curriculum, startDay, 'voice')}>
                  🎙 말로 대화
                  <span className="day-start-option__desc">마이크로 질문하고 코치의 답을 음성으로 듣습니다.</span>
                </button>
                <button className="btn btn-secondary day-start-option" onClick={() => startCoach(curriculum, startDay, 'text')}>
                  ⌨️ 입력으로 대화
                  <span className="day-start-option__desc">채팅처럼 입력하고 글로 답을 받습니다.</span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setStartDay(null)}>
                  ← 뒤로
                </button>
              </div>
            )}
          </div>
        )}

        {myCoachCurricula.length > 0 && (
          <div className="card info-card">
            <h3>내 AI 코치 수업</h3>
            <div className="stack gap-1">
              {myCoachCurricula.map((c) => {
                const p = getProgress(c.id);
                return (
                  <Link key={c.id} to={`/learning/${c.martialArt}/${c.id}/train`} className="technique-row" data-testid="coach-class-mine">
                    <div className="technique-row__main">
                      <div className="technique-row__name">
                        {c.coverIcon} {c.title}
                      </div>
                      <div className="technique-row__sub">
                        {LOCATION_LABEL[c.aiCoachMeta!.location]} · {p?.completedDays.length ?? 0}/{c.totalDays} Day 완료
                      </div>
                    </div>
                    <div className="technique-row__right">이어서 하기 →</div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
