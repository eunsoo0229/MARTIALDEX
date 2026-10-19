import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Technique } from '../types';
import type { TrainingHistoryEntry } from '../lib/trainingHistory/types';
import type { LessonConcept } from '../lib/coachLesson/types';
import { resolveTechnique, searchAllTechniques } from '../lib/userTechniques/service';
import { lessonContextFor } from '../lib/coachLesson/service';
import { analyzeAnswer } from '../lib/coachLesson/analyzer';
import { getLessonLog, LESSON_LOG_EVENT } from '../lib/coachLesson/lessonLog';
import { buildTodayReviewPlan, computeReviewCandidates } from '../lib/reviewSystem/reviewEngine';
import {
  REVIEW_LOG_EVENT,
  REVIEW_MODE_LABEL,
  getReviewLog,
  listReviewLog,
  startReviewLog,
  updateReviewLog,
  type ReviewCheckResult,
  type ReviewMode,
} from '../lib/review/reviewLog';
import {
  gymReviewEntries,
  lessonReviewItems,
  recentlyImproved,
  storedVolume,
  trainingKind,
  trainingReviewEntries,
  trainingTypeLabel,
  weakTechniques,
  WEAK_SIGNAL_LABEL,
  type TrainingKind,
} from '../lib/review/sources';
import { addFocusTechnique, FOCUS_EVENT, removeFocusTechnique, listFocusTechniques } from '../lib/review/focusList';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';

// 복습 5종 — one main screen (/review) and one screen per mode. Each mode
// reads its own data source (lib/review/sources.ts). Every review goes
// through ReviewSession, which writes ONLY the review log (never training
// history), so a review never counts as having trained.

const STORE_EVENTS = ['martialdex:training-history-updated', REVIEW_LOG_EVENT, LESSON_LOG_EVENT, FOCUS_EVENT, 'martialdex:pose-records-updated', 'martialdex:skill-overrides-updated', 'storage'];

function useTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = () => setN((x) => x + 1);
    for (const e of STORE_EVENTS) window.addEventListener(e, on);
    return () => {
      for (const e of STORE_EVENTS) window.removeEventListener(e, on);
    };
  }, []);
  return n;
}

function sessionUrl(mode: ReviewMode, ids: string[], ref: string | null = null): string {
  const q = new URLSearchParams({ mode, ids: ids.join(',') });
  if (ref) q.set('ref', ref);
  return `/review/session?${q.toString()}`;
}

const fmtDate = (iso: string) => iso.slice(0, 10);

function Crumb({ title }: { title: string }) {
  return (
    <>
      <BackButton />
      <div className="breadcrumb">
        <Link to="/">홈</Link>
        <span>/</span>
        <Link to="/review">복습</Link>
        <span>/</span>
        <span>{title}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- hub

export function ReviewHub() {
  useTick();
  const counts = {
    training: trainingReviewEntries().length,
    lesson: lessonReviewItems().length,
    gym: gymReviewEntries().length,
    weak: weakTechniques().length,
    ai: buildTodayReviewPlan(computeReviewCandidates()).actionable.length,
  };
  const recent = listReviewLog().slice(0, 6);
  const cards: { mode: ReviewMode; to: string; icon: string; desc: string; unit: string }[] = [
    { mode: 'training', to: '/review/training', icon: '📒', desc: '개인 훈련 · AI 코치 · 체육관에서 실제로 기록된 훈련을 다시 봅니다.', unit: '개 훈련 기록' },
    { mode: 'lesson', to: '/review/lessons', icon: '🎓', desc: 'AI 코치 수업에서 배운 설명, 질문과 답, 이해가 부족했던 개념을 다시 봅니다.', unit: '개 수업' },
    { mode: 'gym', to: '/review/gym', icon: '🥋', desc: '체육관 수업 · 실시간 훈련 · 스파링 기록만 따로 봅니다.', unit: '개 체육관 기록' },
    { mode: 'weak', to: '/review/weak', icon: '🩹', desc: '복습 확인 결과, 수업 기록, 직접 지정, 자세 점수에서 확인된 부족 기술만 모읍니다.', unit: '개 부족 기술' },
    { mode: 'ai', to: '/review/ai', icon: '🤖', desc: '복습 예정일 · 점수 추세 · 스파링 사용 · 부족 기술을 함께 계산한 오늘의 추천입니다.', unit: '개 추천' },
  ];
  return (
    <div className="page" data-testid="review-hub">
      <div className="container">
        <BackButton />
        <div className="section-title">
          <h2>🔁 복습</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          복습은 훈련 기록과 따로 저장됩니다. 복습했다고 해서 훈련 횟수나 연습 기록이 늘어나지 않습니다.
        </p>
        <div className="review-mode-grid">
          {cards.map((c) => (
            <Link key={c.mode} to={c.to} className="card review-mode-card" data-testid={`review-mode-${c.mode}`}>
              <div className="review-mode-card__head">
                <span aria-hidden>{c.icon}</span>
                <strong>{REVIEW_MODE_LABEL[c.mode]}</strong>
              </div>
              <p>{c.desc}</p>
              <span className="review-mode-card__count" data-testid={`review-count-${c.mode}`}>
                {counts[c.mode]}
                {c.unit}
              </span>
            </Link>
          ))}
        </div>

        <div className="card info-card" style={{ marginTop: 16 }}>
          <h3>최근 복습</h3>
          {recent.length === 0 ? (
            <p className="video-status-message">아직 복습 기록이 없습니다.</p>
          ) : (
            <ul className="review-log-list" data-testid="review-log-recent">
              {recent.map((e) => {
                const understood = e.results.filter((r) => r.verdict === 'understood').length;
                return (
                  <li key={e.id}>
                    <span className="chip">{REVIEW_MODE_LABEL[e.mode]}</span> {fmtDate(e.startedAt)} · 기술 {e.completedTechniqueIds.length}/{e.techniqueIds.length}개 확인
                    {e.results.length > 0 && ` · 확인 질문 ${understood}/${e.results.length} 이해`}
                    {e.difficultTechniqueIds.length > 0 && ` · 어려움 ${e.difficultTechniqueIds.length}개`}
                    {!e.finishedAt && ' · 진행 중'}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mode 1 / 3

function TechniqueChips({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="video-status-message">기록된 기술 없음</span>;
  return (
    <span className="chip-row">
      {ids.map((id) => {
        const t = resolveTechnique(id);
        return t ? (
          <Link key={id} to={`/technique/${id}`} className="chip">
            {t.name}
          </Link>
        ) : (
          <span key={id} className="chip" title="라이브러리에서 찾을 수 없는 기술">
            {id}
          </span>
        );
      })}
    </span>
  );
}

function TrainingEntryCard({ e, mode }: { e: TrainingHistoryEntry; mode: 'training' | 'gym' }) {
  const vol = storedVolume(e);
  const reviewable = e.techniqueIds.filter((id) => resolveTechnique(id));
  return (
    <div className="card review-entry" data-testid="review-entry" data-kind={trainingKind(e)}>
      <div className="review-entry__head">
        <strong>{trainingTypeLabel(e)}</strong>
        <span className="video-status-message">{fmtDate(e.completedAt)}</span>
      </div>
      {e.gymClassMeta && (
        <p className="video-status-message">
          {e.gymClassMeta.gymName} · {e.gymClassMeta.classTitle}
        </p>
      )}
      <TechniqueChips ids={e.techniqueIds} />
      <p className="video-status-message">
        {e.actualMinutes !== null ? `실제 ${e.actualMinutes}분` : `예상 ${e.estimatedMinutes}분 (실제 시간 기록 없음)`}
        {vol.sets !== null && ` · 완료 세트 ${vol.sets}`}
        {vol.reps !== null && ` · 반복 ${vol.reps}회`}
        {vol.seconds !== null && ` · 운동 시간 ${Math.round(vol.seconds / 60)}분`}
        {e.gymLive && ` · ${e.gymLive.status === 'completed' ? '완료' : '일부 미완료'}`}
        {!e.completed && ' · 미완료로 기록됨'}
      </p>
      {e.notes && <p className="video-status-message">메모: {e.notes}</p>}
      {reviewable.length > 0 ? (
        <Link className="btn btn-secondary btn-sm" to={sessionUrl(mode, reviewable, e.id)} data-testid="review-entry-start">
          이 훈련 복습하기
        </Link>
      ) : (
        <p className="video-status-message">이 기록에는 복습할 기술 정보가 없습니다.</p>
      )}
    </div>
  );
}

const PERIODS: { label: string; days: number | null }[] = [
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
  { label: '전체', days: null },
];

export function ReviewTraining() {
  useTick();
  const [days, setDays] = useState<number | null>(30);
  const [kind, setKind] = useState<TrainingKind | 'all'>('all');
  const entries = trainingReviewEntries({ sinceDays: days, kind });
  const kinds: { k: TrainingKind | 'all'; label: string }[] = [
    { k: 'all', label: '전체' },
    { k: 'personal', label: '개인 훈련' },
    { k: 'ai_coach', label: 'AI 코치' },
    { k: 'gym', label: '체육관' },
  ];
  return (
    <div className="page" data-testid="review-training">
      <div className="container">
        <Crumb title={REVIEW_MODE_LABEL.training} />
        <div className="section-title">
          <h2>📒 {REVIEW_MODE_LABEL.training}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          저장된 훈련 기록 그대로 보여 줍니다. 기록되지 않은 세트·시간은 표시하지 않습니다.
        </p>
        <div className="chip-row">
          {PERIODS.map((p) => (
            <button key={p.label} className={`chip${days === p.days ? ' active' : ''}`} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="chip-row" style={{ marginTop: 6 }}>
          {kinds.map((x) => (
            <button key={x.k} className={`chip${kind === x.k ? ' active' : ''}`} onClick={() => setKind(x.k)} data-testid={`review-kind-${x.k}`}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="stack gap-2" style={{ marginTop: 12 }}>
          {entries.length === 0 ? <EmptyState icon="📒" text="이 기간에 기록된 훈련이 없습니다." /> : entries.map((e) => <TrainingEntryCard key={e.id} e={e} mode="training" />)}
        </div>
      </div>
    </div>
  );
}

export function ReviewGym() {
  useTick();
  const [days, setDays] = useState<number | null>(null);
  const entries = gymReviewEntries(days);
  return (
    <div className="page" data-testid="review-gym">
      <div className="container">
        <Crumb title={REVIEW_MODE_LABEL.gym} />
        <div className="section-title">
          <h2>🥋 {REVIEW_MODE_LABEL.gym}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          체육관 수업 완료 · 실시간 훈련 · 체육관 스파링으로 저장된 내 기록만 보여 줍니다. 코치 피드백은 현재 앱에 저장되는 항목이 없어 표시하지 않습니다.
        </p>
        <div className="chip-row">
          {PERIODS.map((p) => (
            <button key={p.label} className={`chip${days === p.days ? ' active' : ''}`} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="stack gap-2" style={{ marginTop: 12 }}>
          {entries.length === 0 ? <EmptyState icon="🥋" text="체육관 훈련 기록이 없습니다." /> : entries.map((e) => <TrainingEntryCard key={e.id} e={e} mode="gym" />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mode 2

const STATUS_TEXT: Record<string, string> = { understood: '이해함', partial: '부분 이해', weak: '이해 부족', unknown: '확인 안 됨' };

export function ReviewLessons() {
  useTick();
  const items = lessonReviewItems();
  return (
    <div className="page" data-testid="review-lessons">
      <div className="container">
        <Crumb title={REVIEW_MODE_LABEL.lesson} />
        <div className="section-title">
          <h2>🎓 {REVIEW_MODE_LABEL.lesson}</h2>
        </div>
        <div className="stack gap-2">
          {items.length === 0 && <EmptyState icon="🎓" text="AI 코치 수업 기록이 없습니다." />}
          {items.map((it) => {
            const weak = it.log?.techniques.flatMap((t) => t.concepts.filter((c) => c.status === 'weak' || c.status === 'partial')) ?? [];
            return (
              <div key={it.id} className="card review-entry" data-testid="review-lesson">
                <div className="review-entry__head">
                  <strong>{it.title}</strong>
                  <span className="video-status-message">{it.date}</span>
                </div>
                {it.log ? (
                  <>
                    <p className="video-status-message">
                      {it.techniqueNames.join(', ')} · 질문 {it.log.qa.length}개{weak.length > 0 && ` · 다시 볼 개념 ${weak.length}개`}
                    </p>
                    <Link className="btn btn-secondary btn-sm" to={`/review/lessons/${encodeURIComponent(it.id)}`}>
                      수업 내용 보기
                    </Link>
                  </>
                ) : (
                  <p className="video-status-message" data-testid="review-lesson-legacy">
                    이 수업은 수업 요약 저장 기능 이전에 진행되어 설명·질문 내용이 남아 있지 않습니다. (훈련 기록만 있음)
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReviewLessonDetail() {
  const { id = '' } = useParams();
  useTick();
  const log = getLessonLog(decodeURIComponent(id));
  if (!log)
    return (
      <div className="page">
        <div className="container">
          <Crumb title="수업 내용" />
          <EmptyState icon="🎓" text="수업 기록을 찾을 수 없습니다." />
        </div>
      </div>
    );
  const ids = log.techniques.map((t) => t.techniqueId ?? `topic:${t.name}`);
  return (
    <div className="page" data-testid="review-lesson-detail">
      <div className="container">
        <Crumb title={log.title} />
        <div className="section-title">
          <h2>🎓 {log.title}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          {log.date} 수업 · 수업에서 실제로 설명한 내용과 이해 확인 결과입니다.
        </p>
        {log.techniques.map((t) => (
          <div key={t.techniqueId ?? t.name} className="card info-card">
            <h3>
              {t.techniqueId ? <Link to={`/technique/${t.techniqueId}`}>{t.name}</Link> : t.name} <span className="chip">{STATUS_TEXT[t.overall]}</span>
            </h3>
            <ul className="review-concepts">
              {t.concepts.map((c) => (
                <li key={c.id} data-status={c.status}>
                  <strong>{c.label}</strong> <span className="chip">{STATUS_TEXT[c.status]}</span>
                  <p>{c.explain}</p>
                  {c.evidence && <p className="video-status-message">내 답: {c.evidence}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {log.qa.length > 0 && (
          <div className="card info-card">
            <h3>수업 중 질문과 답</h3>
            {log.qa.map((q, i) => (
              <div key={i} className="review-qa">
                <p>
                  <strong>Q.</strong> {q.question}
                </p>
                <p className="video-status-message">
                  <strong>A.</strong> {q.answer}
                </p>
              </div>
            ))}
          </div>
        )}
        {log.recap && (
          <div className="card info-card">
            <h3>마무리 정리</h3>
            <p>{log.recap.question}</p>
            <p className="video-status-message">{log.recap.feedback}</p>
          </div>
        )}
        <Link className="btn btn-primary" to={sessionUrl('lesson', ids, log.id)} data-testid="review-lesson-start">
          확인 질문으로 복습하기
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mode 4

export function ReviewWeak() {
  useTick();
  const weak = weakTechniques();
  const improved = recentlyImproved();
  const focus = listFocusTechniques();
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim().length >= 1 ? searchAllTechniques(query, 8) : []), [query]);
  return (
    <div className="page" data-testid="review-weak">
      <div className="container">
        <Crumb title={REVIEW_MODE_LABEL.weak} />
        <div className="section-title">
          <h2>🩹 {REVIEW_MODE_LABEL.weak}</h2>
        </div>
        <p className="video-status-message" style={{ marginTop: -8 }}>
          기록으로 확인된 근거가 있는 기술만 보여 줍니다. 근거가 없으면 아래에서 직접 골라 추가할 수 있습니다.
        </p>
        {weak.length === 0 ? (
          <EmptyState icon="🩹" text="기록에서 확인된 부족 기술이 없습니다." />
        ) : (
          <>
            <Link className="btn btn-primary" to={sessionUrl('weak', weak.slice(0, 8).map((w) => w.techniqueId))} data-testid="review-weak-start">
              상위 {Math.min(8, weak.length)}개 보완 복습 시작
            </Link>
            <div className="stack gap-2" style={{ marginTop: 12 }}>
              {weak.map((w) => {
                const t = resolveTechnique(w.techniqueId);
                return (
                  <div key={w.techniqueId} className="card review-entry" data-testid="review-weak-item" data-signal={w.signal}>
                    <div className="review-entry__head">
                      <strong>{t ? <Link to={`/technique/${w.techniqueId}`}>{t.name}</Link> : w.techniqueId}</strong>
                      <span className="chip">{WEAK_SIGNAL_LABEL[w.signal]}</span>
                    </div>
                    <ul className="review-reasons">
                      {w.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    {w.focusConcepts.length > 0 && <p className="video-status-message">집중할 개념: {w.focusConcepts.join(', ')}</p>}
                    <div className="chip-row">
                      <Link className="btn btn-secondary btn-sm" to={sessionUrl('weak', [w.techniqueId])}>
                        이 기술 보완하기
                      </Link>
                      {focus.some((f) => f.techniqueId === w.techniqueId) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => removeFocusTechnique(w.techniqueId)}>
                          목록에서 빼기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {improved.length > 0 && (
          <div className="card info-card" style={{ marginTop: 12 }}>
            <h3>최근 보완됨</h3>
            <p className="video-status-message">마지막 확인 질문에서 이해한 것으로 확인되어 우선순위에서 내려간 기술입니다.</p>
            <TechniqueChips ids={improved.map((x) => x.techniqueId)} />
          </div>
        )}
        <div className="card info-card" style={{ marginTop: 12 }}>
          <h3>직접 추가</h3>
          <input className="input" placeholder="기술 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="review-weak-search" />
          <div className="chip-row" style={{ marginTop: 6 }}>
            {results.map((t) => (
              <button
                key={t.id}
                className="chip"
                onClick={() => {
                  addFocusTechnique(t.id);
                  setQuery('');
                }}
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the review walkthrough (all modes)

interface SessionItem {
  key: string;
  technique: Technique | null;
  name: string;
  concepts: LessonConcept[];
  /** One-off lesson topic: its own lesson material, used for grading instead of technique data. */
  material?: string;
}

function asConcept(c: { id: string; label: string; explain: string; reference: string }): LessonConcept {
  return { id: c.id, label: c.label, importance: 'core', explain: c.explain, variants: [], reference: c.reference, keywords: [], questions: {}, choice: null };
}

function questionFor(c: LessonConcept): string {
  return c.questions.explain ?? c.questions.why ?? c.questions.confirm ?? `"${c.label}"에 대해 기억나는 대로 설명해 보세요.`;
}

function buildItems(mode: ReviewMode, ids: string[], ref: string | null): SessionItem[] {
  const log = mode === 'lesson' && ref ? getLessonLog(ref) : null;
  const weak = mode === 'weak' ? new Map(weakTechniques().map((w) => [w.techniqueId, w])) : null;
  const out: SessionItem[] = [];
  for (const id of ids) {
    if (id.startsWith('topic:')) {
      const lt = log?.techniques.find((t) => !t.techniqueId && `topic:${t.name}` === id);
      if (lt) out.push({ key: id, technique: null, name: lt.name, concepts: lt.concepts.map(asConcept), material: lt.concepts.map((c) => `${c.label}: ${c.explain}`).join('\n') });
      continue;
    }
    const t = resolveTechnique(id);
    if (!t) continue;
    let concepts = lessonContextFor(t).concepts;
    const lt = log?.techniques.find((x) => x.techniqueId === id);
    if (lt) {
      // Lesson review asks about what that lesson taught — weak ones first.
      const order = { weak: 0, partial: 1, unknown: 2, understood: 3 } as const;
      concepts = [...lt.concepts].sort((a, b) => order[a.status] - order[b.status]).map((c) => concepts.find((x) => x.id === c.id) ?? asConcept(c));
    }
    const focus = weak?.get(id)?.focusConcepts ?? [];
    if (focus.length) concepts = [...concepts.filter((c) => focus.includes(c.label)), ...concepts.filter((c) => !focus.includes(c.label))];
    out.push({ key: id, technique: t, name: t.name, concepts });
  }
  return out;
}

export function ReviewSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const modeParam = params.get('mode') as ReviewMode | null;
  const mode: ReviewMode = modeParam && modeParam in REVIEW_MODE_LABEL ? modeParam : 'training';
  const ref = params.get('ref');
  const ids = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const items = useMemo(() => buildItems(mode, ids, ref), [mode, ids, ref]);
  const [logId, setLogId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; verdict: string | null } | null>(null);
  const log = logId ? getReviewLog(logId) : null;
  useTick();

  const item = items[index];
  const concept = item?.concepts[0] ?? null;
  const done = !!log?.finishedAt;

  function ensureLog(): string {
    if (logId) return logId;
    const e = startReviewLog(mode, ref, items.map((i) => i.key));
    setLogId(e.id);
    return e.id;
  }

  function next(difficult: boolean) {
    const id = ensureLog();
    const updated = updateReviewLog(id, (e) => ({
      ...e,
      completedTechniqueIds: [...new Set([...e.completedTechniqueIds, item.key])],
      difficultTechniqueIds: difficult ? [...new Set([...e.difficultTechniqueIds, item.key])] : e.difficultTechniqueIds.filter((x) => x !== item.key),
    }));
    setAnswer('');
    setFeedback(null);
    if (index + 1 >= items.length) updateReviewLog(id, (e) => ({ ...e, finishedAt: new Date().toISOString() }));
    else setIndex(index + 1);
    return updated;
  }

  async function check(dontKnow = false) {
    if (!concept || !item) return;
    const id = ensureLog();
    const question = questionFor(concept);
    let result: ReviewCheckResult;
    if (dontKnow) {
      result = { techniqueId: item.key, conceptId: concept.id, conceptLabel: concept.label, question, answer: '', verdict: 'weak', missing: [concept.reference], method: 'self' };
      setFeedback({ text: `괜찮습니다. 핵심은 이렇습니다: ${concept.explain}`, verdict: 'weak' });
    } else {
      setGrading(true);
      try {
        const a = await analyzeAnswer({
          technique: item.technique,
          material: item.material,
          concept,
          reference: concept.reference,
          pending: { conceptId: concept.id, type: 'explain', purpose: 'check', text: question, choice: null, tries: 0 },
          answer,
          level: 'normal',
          alreadyExplained: [concept.explain],
        });
        if (a.kind === 'question') {
          setFeedback({ text: a.reply ?? '질문으로 이해했습니다. 확인 질문에 대한 답을 적어 주세요.', verdict: null });
          return;
        }
        result = { techniqueId: item.key, conceptId: concept.id, conceptLabel: concept.label, question, answer: answer.slice(0, 400), verdict: a.verdict, missing: a.missing, method: a.method === 'ai' ? 'ai' : 'keyword' };
        setFeedback({ text: [a.feedback, a.reexplain].filter(Boolean).join(' '), verdict: a.verdict });
      } finally {
        setGrading(false);
      }
    }
    updateReviewLog(id, (e) => ({ ...e, results: [...e.results.filter((r) => !(r.techniqueId === result.techniqueId && r.conceptId === result.conceptId)), result] }));
  }

  if (!items.length)
    return (
      <div className="page">
        <div className="container">
          <Crumb title="복습" />
          <EmptyState icon="🔁" text="복습할 기술을 찾을 수 없습니다." />
        </div>
      </div>
    );

  if (done && log) {
    const understood = log.results.filter((r) => r.verdict === 'understood').length;
    return (
      <div className="page" data-testid="review-session-done">
        <div className="container">
          <Crumb title={REVIEW_MODE_LABEL[mode]} />
          <div className="section-title">
            <h2>✅ 복습 완료</h2>
          </div>
          <p className="video-status-message">
            {REVIEW_MODE_LABEL[mode]} · 기술 {log.completedTechniqueIds.length}개 · 확인 질문 {understood}/{log.results.length} 이해
            {log.difficultTechniqueIds.length > 0 && ` · 어려움 표시 ${log.difficultTechniqueIds.length}개 (부족 기술 보완 복습에 반영)`}
          </p>
          <p className="video-status-message">복습 기록에 저장했습니다. 훈련 기록에는 추가되지 않습니다.</p>
          <div className="chip-row">
            <button className="btn btn-secondary" onClick={() => navigate('/review')}>
              복습 메인으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  const t = item.technique;
  const answeredHere = log?.results.find((r) => r.techniqueId === item.key && r.conceptId === concept?.id);
  return (
    <div className="page" data-testid="review-session" data-mode={mode}>
      <div className="container">
        <Crumb title={REVIEW_MODE_LABEL[mode]} />
        <div className="section-title">
          <h2>
            {REVIEW_MODE_LABEL[mode]} · {index + 1}/{items.length}
          </h2>
        </div>
        <div className="card info-card" data-testid="review-session-item">
          <h3>{t ? <Link to={`/technique/${t.id}`}>{item.name}</Link> : item.name}</h3>
          {t?.posture?.overview && <p>{t.posture.overview}</p>}
          {!!t?.posture?.keyPoints?.length && (
            <>
              <strong>핵심 포인트</strong>
              <ul>
                {t.posture.keyPoints.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </>
          )}
          {!!t?.posture?.commonMistakes?.length && (
            <>
              <strong>자주 하는 실수</strong>
              <ul>
                {t.posture.commonMistakes.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </>
          )}
          {!t && item.concepts.map((c) => <p key={c.id}>{c.label}: {c.explain}</p>)}
          {t && !t.posture && <p className="video-status-message">이 기술에는 등록된 자세 설명이 없습니다.</p>}
        </div>

        {concept && (
          <div className="card info-card" data-testid="review-check">
            <h3>이해 확인</h3>
            <p>{questionFor(concept)}</p>
            <textarea className="input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="내 말로 짧게 적어 보세요" data-testid="review-check-answer" />
            <div className="chip-row" style={{ marginTop: 6 }}>
              <button className="btn btn-primary btn-sm" disabled={grading || !answer.trim()} onClick={() => void check()} data-testid="review-check-submit">
                {grading ? '확인 중…' : '답 확인'}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={grading} onClick={() => void check(true)} data-testid="review-check-dontknow">
                모르겠어요
              </button>
            </div>
            {feedback && (
              <p className="video-status-message" data-testid="review-check-feedback" data-verdict={feedback.verdict ?? ''}>
                {feedback.verdict && <span className="chip">{STATUS_TEXT[feedback.verdict]}</span>} {feedback.text}
              </p>
            )}
            {!feedback && answeredHere && <p className="video-status-message">이미 답했습니다: {STATUS_TEXT[answeredHere.verdict]}</p>}
          </div>
        )}

        <div className="modal-actions modal-actions--start">
          <button className="btn btn-secondary" onClick={() => next(false)} data-testid="review-next">
            {index + 1 >= items.length ? '복습 마치기' : '다음 기술'}
          </button>
          <button className="btn btn-ghost" onClick={() => next(true)} data-testid="review-difficult">
            아직 어려워요
          </button>
        </div>
      </div>
    </div>
  );
}
