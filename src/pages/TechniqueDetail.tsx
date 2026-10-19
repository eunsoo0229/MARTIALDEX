import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getUnifiedAllTechniques, getUnifiedMartialArt, resolveTechnique, resolveTechniquesByIds } from '../lib/userTechniques/service';
import DifficultyBadge from '../components/DifficultyBadge';
import AiAskModal from '../components/AiAskModal';
import RelatedVideos from '../components/RelatedVideos';
import PoseAnalysisModal from '../components/PoseAnalysisModal';
import PoseHistoryModal from '../components/PoseHistoryModal';
// loaded only when opened (keeps this page's first load unchanged)
const FormCompareModal = lazy(() => import('../components/formCompare/FormCompareModal'));
import { recordRecentlyViewed, useFavorites } from '../lib/userData';
import { isPoseAnalysisSupported } from '../lib/poseAnalysis/poseAnalysisConfig';
import { useTechniqueRecords, useTechniqueSkillSummary } from '../lib/poseAnalysis/usePoseRecords';
import { STATUS_ICON, STATUS_LABEL } from '../lib/poseAnalysis/scoring';
import ScoreHistoryChart from '../components/ScoreHistoryChart';
import { useSkillProgress } from '../lib/skillProgress/useSkillProgress';
import { MASTERY_ICON, MASTERY_LABEL, type MasteryStatus } from '../lib/skillProgress/types';
import { clearOverride, setOverride } from '../lib/skillProgress/overrideStore';
import { formatRelativeDays } from '../lib/dateUtil';
import { getTechniqueConnections, hasAnyConnections } from '../lib/techniqueGraph/buildGraph';
import { RELATION_LABEL } from '../lib/techniqueGraph/types';
import { useAuth } from '../lib/auth/AuthProvider';
import { submitTechniqueReport } from '../lib/techniqueReports/service';
import { REPORT_REASON_ORDER, REPORT_REASON_LABEL, type ReportReason } from '../lib/techniqueReports/types';
import BackButton from '../components/BackButton';
import PostureSection from '../components/PostureSection';
import GrapplingStylePanel from '../components/GrapplingStylePanel';
import { getGiNoGi } from '../lib/grappling/giNoGi';
import { getLocalGiNoGi, isGiNoGiTarget, LOCAL_GI_NOGI_EVENT } from '../lib/grappling/analyzeNewTechnique';
import GiNoGiResearch from '../components/GiNoGiResearch';
import { isTechniqueInArt, techniqueArts, techniqueCategoryInArt, techniqueNameInArt } from '../lib/techniqueCanonical';

const MASTERY_OPTIONS: MasteryStatus[] = ['not_started', 'learning', 'average', 'proficient', 'needs_improvement'];

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card info-card">
      <h3>
        <span aria-hidden="true">{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

// Renders nothing when there's no real content for this field — step 2 never
// invents a description/principle/counter etc. for a technique the source
// text doesn't cover, and this page follows the same rule on the way out.
function ListCard({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <InfoCard title={title} icon={icon}>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </InfoCard>
  );
}

export default function TechniqueDetail() {
  const { martialArtId = '', techniqueId = '' } = useParams();
  const technique = resolveTechnique(techniqueId);
  // A merged-away id (e.g. bjj__granby-roll) opens its canonical technique;
  // every per-technique record (mastery, pose records) is keyed by that id.
  const canonicalId = technique?.id ?? techniqueId;
  // Official techniques: the curated file. Added techniques: a re-research on this device, else the record saved when it was added.
  const [, setLocalTick] = useState(0);
  useEffect(() => {
    const on = () => setLocalTick((n) => n + 1);
    window.addEventListener(LOCAL_GI_NOGI_EVENT, on);
    return () => window.removeEventListener(LOCAL_GI_NOGI_EVENT, on);
  }, []);
  const curatedGiNoGi = getGiNoGi(canonicalId);
  const addedGiNoGi = curatedGiNoGi ? null : (getLocalGiNoGi(canonicalId) ?? technique?.giNoGi ?? null);
  const giNoGi = curatedGiNoGi ?? (addedGiNoGi && addedGiNoGi.method !== 'pending' ? addedGiNoGi : null);
  const canResearchGiNoGi = !!technique && !curatedGiNoGi && isGiNoGiTarget(technique) && (!addedGiNoGi || addedGiNoGi.method === 'pending' || addedGiNoGi.method === 'ai_rejected');
  const [aiOpen, setAiOpen] = useState(false);
  const [poseOpen, setPoseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const skillSummary = useTechniqueSkillSummary(canonicalId);
  const skillProgress = useSkillProgress(canonicalId);
  const scoreRecords = useTechniqueRecords(canonicalId);
  const [changingMastery, setChangingMastery] = useState(false);

  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('duplicate');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  async function handleSubmitReport() {
    if (!technique) return;
    setReportSubmitting(true);
    const outcome = await submitTechniqueReport({
      techniqueId: technique.id,
      userId: user?.id ?? null,
      reason: reportReason,
      description: reportDescription,
    });
    setReportSubmitting(false);
    if (outcome.ok) {
      setReportMessage('신고가 접수되었습니다.');
      setReportOpen(false);
      setReportDescription('');
    } else {
      setReportMessage(outcome.message);
    }
  }

  useEffect(() => {
    if (technique) recordRecentlyViewed(technique.id);
  }, [technique?.id]);

  const relatedTechniques = useMemo(
    () => (technique ? resolveTechniquesByIds(technique.relatedTechniques) : []),
    [technique]
  );

  // "다른 무술의 유사 기술": step 2 only links two techniques across martial
  // arts when they share the exact same (normalized) name — e.g. "Osoto
  // Gari" shows up verbatim in bjj/judo/sambo. It does NOT try to equate
  // differently-named techniques that happen to be the same real-world move
  // (e.g. BJJ's "Armbar" and Judo's "Juji Gatame") unless the source text
  // itself states that equivalence — none of the 9 files do, so that link
  // simply won't appear here. This avoids asserting a fact the data doesn't
  // actually contain; it's not a bug, just the honest limit of name-based
  // matching.
  const crossArtMatches = useMemo(() => {
    if (!technique) return [];
    const normalized = technique.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    const ownArts = techniqueArts(technique);
    // Arts this technique itself belongs to are shown as its own art chips, not as "다른 무술".
    return technique.relatedMartialArts.filter((artId) => !ownArts.includes(artId)).map((artId) => {
      const match = getUnifiedAllTechniques().find(
        (t) =>
          t.martialArt === artId &&
          t.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '') === normalized
      );
      return { artId, match };
    });
  }, [technique]);

  if (!technique || !isTechniqueInArt(technique, martialArtId)) {
    return <Navigate to={`/arts/${martialArtId || ''}`} replace />;
  }

  // Shown in the art it was opened from — a canonical technique is listed under every linked art.
  const viewArt = martialArtId;
  const art = getUnifiedMartialArt(viewArt);
  const arts = techniqueArts(technique);
  const viewCategory = techniqueCategoryInArt(technique, viewArt);
  const nameInArt = techniqueNameInArt(technique, viewArt);
  const fav = isFavorite(technique.id);
  const displayTags = technique.tags.filter((tag) => tag.startsWith('#'));
  const poseSupported = isPoseAnalysisSupported(technique.id);
  const connections = getTechniqueConnections(technique);
  const CONNECTION_SECTIONS = ['prerequisite', 'next', 'counter', 'escape', 'samePosition'] as const;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/arts">무술 목록</Link>
          <span>/</span>
          <Link to={`/arts/${viewArt}`}>{art?.nameKo ?? viewArt}</Link>
          <span>/</span>
          <Link to={`/arts/${viewArt}/techniques`}>전체 기술</Link>
          <span>/</span>
          <span>{nameInArt.name}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1 data-testid="technique-title">{nameInArt.name}</h1>
            {nameInArt.koreanName && <div className="detail-hero__korean">{nameInArt.koreanName}</div>}
            {nameInArt.otherNames.length > 0 && (
              <div className="detail-hero__korean" data-testid="technique-other-names">
                다른 이름: {nameInArt.otherNames.join(' · ')}
              </div>
            )}
            <div className="chip-row">
              {arts.map((a) => (
                <Link key={a} to={`/arts/${a}/techniques/${technique.id}`} className={`chip ${a === viewArt ? 'active' : ''}`} data-testid="technique-art-chip" data-art={a}>
                  {getUnifiedMartialArt(a)?.nameKo ?? a}
                </Link>
              ))}
              <span className="chip" data-testid="technique-category">{viewCategory}</span>
              <DifficultyBadge difficulty={technique.difficulty} />
              {technique.source === 'user_added' && <span className="chip">🧑‍🤝‍🧑 사용자 추가 기술</span>}
              {technique.source === 'ai_web_research' && <span className="chip">🔎 웹 검색 기반 추가 기술</span>}
              {technique.aliases.slice(0, 4).map((a) => (
                <span className="chip" key={a}>
                  {a}
                </span>
              ))}
            </div>
          </div>
          <div className="detail-actions">
            <button className="btn btn-secondary" onClick={() => toggleFavorite(technique.id)}>
              {fav ? '★ 즐겨찾기 됨' : '☆ 즐겨찾기'}
            </button>
            <button className="btn btn-primary" onClick={() => setAiOpen(true)}>
              ✦ AI에게 질문
            </button>
            {poseSupported ? (
              <>
                <button className="btn btn-primary" onClick={() => setPoseOpen(true)}>
                  📷 내 자세 분석하기
                </button>
                <button className="btn btn-secondary" onClick={() => setHistoryOpen(true)}>
                  📊 분석 기록{skillSummary.analysisCount > 0 ? ` (${skillSummary.analysisCount})` : ''}
                </button>
              </>
            ) : (
              <>
                <span className="pose-unsupported-note">관절 지표 자세 분석은 이 기술을 지원하지 않습니다 — 기준 영상 비교 평가를 이용해 주세요.</span>
                {skillSummary.analysisCount > 0 && (
                  <button className="btn btn-secondary" onClick={() => setHistoryOpen(true)}>
                    📊 분석 기록 ({skillSummary.analysisCount})
                  </button>
                )}
              </>
            )}
            {/* 기준 시연 영상 ↔ 내 수행 영상 AI 비교 — every technique (criteria are built from the reference video). */}
            <button className="btn btn-primary" onClick={() => setCompareOpen(true)} data-testid="form-compare-open">
              🎬 기준 영상과 비교해 평가
            </button>
          </div>
        </div>

        {poseSupported && skillSummary.analysisCount > 0 && (
          <div className="chip-row" style={{ marginTop: -10, marginBottom: 16 }}>
            <span className="chip">
              {STATUS_ICON[skillSummary.status]} AI 자세 분석: {skillSummary.latestScore}점 ({STATUS_LABEL[skillSummary.status]})
            </span>
          </div>
        )}

        {technique.positions.length > 0 && (
          <div className="info-card-inline">
            <span className="field-label">포지션</span>
            <div className="chip-row">
              {technique.positions.map((p) => (
                <span key={p} className={`chip ${p === viewCategory ? 'active' : ''}`}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="detail-grid">
          <div>
            {technique.purpose && (
              <InfoCard title="목적 · 언제 쓰는가" icon="🎯">
                <p>{technique.purpose}</p>
              </InfoCard>
            )}
            {technique.splitInto && technique.splitInto.length > 0 && (
              <InfoCard title="여러 기술을 묶은 항목" icon="🔀">
                <div data-testid="technique-split-into">
                  <p className="video-status-message" style={{ marginTop: 0 }}>
                    이 항목은 원문에서 서로 다른 기술을 한 줄로 묶어 적은 것이어서, 각 기술로 나누어 정리했습니다. 이전 학습 기록은 이 항목에 그대로 남아 있습니다.
                  </p>
                  <div className="chip-row">
                    {technique.splitInto.map((id) => {
                      const part = resolveTechnique(id);
                      return part ? (
                        <Link key={id} className="chip" to={`/arts/${part.martialArt}/techniques/${encodeURIComponent(part.id)}`}>
                          {part.name}
                        </Link>
                      ) : null;
                    })}
                  </div>
                </div>
              </InfoCard>
            )}
            {technique.notTechnique && (
              <InfoCard title="기술이 아닌 항목" icon="ℹ️">
                <p className="video-status-message" data-testid="technique-not-technique">
                  {technique.notTechnique} — 기술 목록에는 표시하지 않습니다.
                </p>
              </InfoCard>
            )}
            {technique.description && (
              <InfoCard title="설명" icon="📖">
                <p>{technique.description}</p>
              </InfoCard>
            )}
            {arts.length > 1 && (
              <InfoCard title="이 기술을 사용하는 무술" icon="🌐">
                <p data-testid="technique-arts">{arts.map((a) => getUnifiedMartialArt(a)?.nameKo ?? a).join(' · ')}</p>
                {technique.namesByArt && Object.keys(technique.namesByArt).length > 1 && (
                  <p className="video-status-message" data-testid="technique-names-by-art">
                    {arts
                      .filter((a) => technique.namesByArt?.[a])
                      .map((a) => {
                        const n = technique.namesByArt![a];
                        return `${getUnifiedMartialArt(a)?.nameKo ?? a}: ${n.name}${n.koreanName && n.koreanName !== n.name ? ` (${n.koreanName})` : ''}`;
                      })
                      .join(' · ')}
                  </p>
                )}
                {technique.usageByArt &&
                  Object.entries(technique.usageByArt).map(([a, text]) => (
                    <p key={a} className="video-status-message">
                      <strong>{getUnifiedMartialArt(a)?.nameKo ?? a}:</strong> {text}
                    </p>
                  ))}
              </InfoCard>
            )}
            {canResearchGiNoGi && <GiNoGiResearch technique={technique} failedReason={addedGiNoGi?.reason ?? null} />}
            {/* Grappling techniques: one Gi / No-Gi panel switches posture + videos together. Others: unchanged. */}
            {giNoGi ? (
              <GrapplingStylePanel key={technique.id} technique={technique} record={giNoGi} />
            ) : technique.posture ? (
              <PostureSection posture={technique.posture} />
            ) : (
              <InfoCard title="자세 잡기" icon="🧍">
                <p className="posture-pending-note video-status-message">자세 설명 준비 중입니다.</p>
              </InfoCard>
            )}
            <ListCard title="핵심 원리" icon="🧭" items={technique.principles} />
            <ListCard title="변형" icon="🔀" items={technique.variations} />
            <ListCard title="방어" icon="🛡" items={technique.defenses} />
            <ListCard title="카운터" icon="⚔" items={technique.counters} />
            <ListCard title="연결 기술" icon="➡" items={technique.transitions} />

            {!giNoGi && <RelatedVideos technique={technique} />}
          </div>

          <div>
            <div className="card info-card">
              <h3>📈 숙련도</h3>
              <div className="chip-row">
                <span className="chip active">
                  {MASTERY_ICON[skillProgress.status]} {MASTERY_LABEL[skillProgress.status]}
                </span>
                {skillProgress.userOverride && <span className="chip">사용자 지정</span>}
              </div>
              <div className="curriculum-stat-row">
                <div>
                  <strong>{skillProgress.latestScore ?? '-'}</strong>
                  <span>AI 자세 분석</span>
                </div>
                <div>
                  <strong>{skillProgress.practiceCount}회</strong>
                  <span>학습 횟수</span>
                </div>
                <div data-testid="skill-coach-lessons">
                  <strong>{skillProgress.coachLessonCount}회</strong>
                  <span>AI 코치 수업 (이해+연습 {skillProgress.coachMasteredDays}일)</span>
                </div>
                <div>
                  <strong>{formatRelativeDays(skillProgress.lastPracticedAt)}</strong>
                  <span>최근 학습</span>
                </div>
                <div>
                  <strong>{skillProgress.lastAnalyzedAt ? skillProgress.lastAnalyzedAt.slice(0, 10) : '-'}</strong>
                  <span>최근 분석</span>
                </div>
              </div>

              {skillProgress.analysisCount === 0 && skillProgress.coachLessonCount > 0 && !skillProgress.userOverride && (
                <p className="video-status-message" style={{ margin: '4px 0' }} data-testid="skill-coach-basis">
                  AI 코치 수업 기록으로 정한 숙련도입니다 — 수업에서 이해하고 연습까지 마친 날이 1일 이상이면 보통, 3일 이상이면 숙련. 카메라 자세 분석을 하면 그 측정 결과가 우선합니다.
                </p>
              )}
              {scoreRecords.length >= 2 ? (
                <>
                  <div className="field-label" style={{ marginTop: 8 }}>
                    분석 점수 변화
                  </div>
                  <ScoreHistoryChart records={scoreRecords} />
                </>
              ) : (
                <p className="video-status-message">아직 분석 기록이 없습니다.</p>
              )}

              {skillProgress.nextReviewAt && (
                <p className="video-status-message">다음 복습 권장: {skillProgress.nextReviewAt.slice(0, 10)}</p>
              )}

              {!changingMastery ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setChangingMastery(true)}>
                  숙련도 변경
                </button>
              ) : (
                <div className="stack gap-1" style={{ marginTop: 6 }}>
                  {MASTERY_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className={`choice-card ${skillProgress.status === s ? 'choice-card--active' : ''}`}
                      onClick={() => {
                        setOverride(technique.id, s);
                        setChangingMastery(false);
                      }}
                    >
                      <span className="choice-card__radio">{skillProgress.status === s ? '●' : '○'}</span>
                      <span className="choice-card__title">
                        {MASTERY_ICON[s]} {MASTERY_LABEL[s]}
                      </span>
                    </button>
                  ))}
                  <div className="modal-actions modal-actions--start">
                    {skillProgress.userOverride && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          clearOverride(technique.id);
                          setChangingMastery(false);
                        }}
                      >
                        자동 계산으로 되돌리기
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setChangingMastery(false)}>
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            {relatedTechniques.length > 0 && (
              <div className="card info-card">
                <h3>🔗 관련 기술</h3>
                <div className="related-link-list">
                  {relatedTechniques.map((t) => {
                    const relArt = getUnifiedMartialArt(t.martialArt);
                    return (
                      <Link
                        key={t.id}
                        to={`/arts/${t.martialArt}/techniques/${t.id}`}
                        className="related-link"
                      >
                        <span className="related-link__name">
                          {t.name}
                          {t.koreanName ? ` · ${t.koreanName}` : ''}
                        </span>
                        {t.martialArt !== technique.martialArt && (
                          <span className="related-link__art">{relArt?.nameKo ?? t.martialArt}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {hasAnyConnections(connections) && (
              <div className="card info-card">
                <h3>🔗 기술 연결</h3>
                {CONNECTION_SECTIONS.map((kind) => {
                  const items = connections[kind];
                  if (items.length === 0) return null;
                  return (
                    <div key={kind} style={{ marginBottom: 10 }}>
                      <div className="field-label">{RELATION_LABEL[kind]}</div>
                      <div className="chip-row">
                        {items.map((c) => (
                          <Link key={c.techniqueId} to={`/arts/${c.martialArt}/techniques/${c.techniqueId}`} className="chip">
                            {c.techniqueName}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="modal-actions modal-actions--start" style={{ marginTop: 4 }}>
                  <Link to={`/graph?technique=${technique.id}`} className="btn btn-secondary btn-sm">
                    🕸 그래프로 보기
                  </Link>
                </div>
              </div>
            )}

            {crossArtMatches.length > 0 && (
              <div className="card info-card">
                <h3>🌐 다른 무술의 유사 기술</h3>
                <div className="stack gap-1">
                  {crossArtMatches.map(({ artId, match }) => {
                    const otherArt = getUnifiedMartialArt(artId);
                    const label = otherArt?.nameKo ?? artId;
                    return match ? (
                      <Link
                        key={artId}
                        to={`/arts/${match.martialArt}/techniques/${match.id}`}
                        className="cross-art-badge"
                      >
                        {label} · {match.name} →
                      </Link>
                    ) : (
                      <span key={artId} className="cross-art-badge">
                        {label}에도 동일한 이름의 기술이 있음
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {displayTags.length > 0 && (
              <div className="card info-card">
                <h3>🏷 태그</h3>
                <div className="chip-row">
                  {displayTags.map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              {!reportOpen ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setReportOpen(true);
                    setReportMessage(null);
                  }}
                >
                  이 기술에 문제가 있나요? 기술 신고
                </button>
              ) : (
                <div className="card info-card">
                  <h3>기술 신고</h3>
                  <label className="field-label">신고 사유</label>
                  <select
                    className="select field-full"
                    style={{ marginBottom: 8 }}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                  >
                    {REPORT_REASON_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {REPORT_REASON_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <label className="field-label">추가 설명 (선택)</label>
                  <textarea
                    className="field-full"
                    style={{ minHeight: 60, marginBottom: 8 }}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="문제가 무엇인지 간단히 설명해주세요."
                  />
                  <div className="modal-actions modal-actions--start">
                    <button type="button" className="btn btn-primary btn-sm" disabled={reportSubmitting} onClick={handleSubmitReport}>
                      {reportSubmitting ? '신고 중...' : '신고하기'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportOpen(false)} disabled={reportSubmitting}>
                      취소
                    </button>
                  </div>
                </div>
              )}
              {reportMessage && <p className="video-status-message">{reportMessage}</p>}
            </div>
          </div>
        </div>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} technique={technique} />}
      {poseOpen && <PoseAnalysisModal technique={technique} onClose={() => setPoseOpen(false)} />}
      {historyOpen && <PoseHistoryModal technique={technique} onClose={() => setHistoryOpen(false)} />}
      {compareOpen && (
        <Suspense fallback={null}>
          <FormCompareModal technique={technique} onClose={() => setCompareOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
