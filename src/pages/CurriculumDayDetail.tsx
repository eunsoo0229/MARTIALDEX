import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Technique } from '../types';
import { getUnifiedMartialArt, resolveTechniquesByIds as getTechniquesByIds } from '../lib/userTechniques/service';
import { getCurriculum } from '../lib/curriculum/curriculumService';
import { useCurriculumProgress } from '../lib/curriculum/useCurriculum';
import DifficultyBadge from '../components/DifficultyBadge';
import RelatedVideos from '../components/RelatedVideos';
import AiAskModal from '../components/AiAskModal';
import PoseAnalysisModal from '../components/PoseAnalysisModal';
import EmptyState from '../components/EmptyState';
import BackButton from '../components/BackButton';
import { isPoseAnalysisSupported } from '../lib/poseAnalysis/poseAnalysisConfig';
import { useTechniqueSkillSummary } from '../lib/poseAnalysis/usePoseRecords';
import { STYLE_CURRICULUM_MARTIAL_ART } from '../lib/fighterStyle/styleCurriculumService';
import { mmaCurriculumLabel, mmaCurriculumLinkTarget } from '../lib/mmaCurriculum/breadcrumb';
import { recordTrainingSession } from '../lib/trainingHistory/service';

function TechniqueAnalyzeButton({ technique, onOpen }: { technique: Technique; onOpen: (t: Technique) => void }) {
  const summary = useTechniqueSkillSummary(technique.id);
  if (!isPoseAnalysisSupported(technique.id)) return null;
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen(technique);
      }}
    >
      📷 {summary.analysisCount > 0 ? `최근 분석 ${summary.latestScore}점` : '자세 분석'}
    </button>
  );
}

export default function CurriculumDayDetail() {
  const { martialArtId = '', curriculumId = '', day: dayParam = '' } = useParams();
  const dayNumber = Number(dayParam);
  const curriculum = getCurriculum(curriculumId);
  const { progress, setDayComplete, start } = useCurriculumProgress(curriculum);
  const [aiOpen, setAiOpen] = useState(false);
  const [poseTechnique, setPoseTechnique] = useState<Technique | null>(null);

  if (!curriculum || curriculum.martialArt !== martialArtId) {
    return <Navigate to={`/learning/${martialArtId}`} replace />;
  }
  const day = curriculum.days.find((d) => d.day === dayNumber);
  if (!day) return <Navigate to={`/learning/${curriculum.martialArt}/${curriculum.id}`} replace />;

  const art = getUnifiedMartialArt(curriculum.martialArt);
  const techniques = getTechniquesByIds(day.techniqueIds);
  const reviewTechniques = getTechniquesByIds(day.reviewTechniqueIds);
  // 실제 posture 데이터(이미 존재하는 필드)에서만 뽑는다 — 새 AI 호출/허위 생성
  // 없이, 이 Day가 실제로 복습하는 기술들의 진짜 핵심 포인트만 모아 중복 제거.
  // 데이터가 없는 기술은 그냥 건너뛴다.
  const reviewKeyPoints = [...new Set(reviewTechniques.flatMap((t) => t.posture?.keyPoints ?? []))].slice(0, 8);
  const isComplete = progress?.completedDays.includes(day.day) ?? false;
  const prevDay = curriculum.days.find((d) => d.day === day.day - 1);
  const nextDay = curriculum.days.find((d) => d.day === day.day + 1);
  const linkBase = `/learning/${curriculum.martialArt}/${curriculum.id}`;

  return (
    <div className="page">
      <div className="container">
        <BackButton />
        <div className="breadcrumb">
          <Link to="/">홈</Link>
          <span>/</span>
          <Link to="/learning">학습</Link>
          <span>/</span>
          <Link to={curriculum.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? mmaCurriculumLinkTarget(curriculum) : `/learning/${curriculum.martialArt}`}>
            {curriculum.martialArt === STYLE_CURRICULUM_MARTIAL_ART ? mmaCurriculumLabel(curriculum) : art?.nameKo ?? curriculum.martialArt}
          </Link>
          <span>/</span>
          <Link to={linkBase}>{curriculum.title}</Link>
          <span>/</span>
          <span>Day {day.day}</span>
        </div>

        <div className="detail-hero">
          <div>
            <h1>
              Day {day.day} · {day.title}
            </h1>
            <div className="chip-row">
              <DifficultyBadge difficulty={day.difficulty} />
              <span className="chip">⏱ 약 {day.estimatedMinutes}분</span>
              {isComplete && <span className="chip active">완료됨 ✓</span>}
            </div>
          </div>
          <div className="detail-actions">
            <button
              className={`btn ${isComplete ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => {
                start();
                setDayComplete(day.day, !isComplete);
                // 13-6/15: every existing "Day 완료" action also feeds the
                // shared training-history log so skillProgress's
                // practiceCount reflects it — additive only, doesn't change
                // curriculum progress behavior at all.
                if (!isComplete) {
                  recordTrainingSession({
                    curriculumId: curriculum.id,
                    dayNumber: day.day,
                    techniqueIds: day.techniqueIds,
                    completed: true,
                    estimatedMinutes: day.estimatedMinutes,
                    source: 'curriculum',
                  });
                }
              }}
            >
              {isComplete ? '✓ 학습 완료됨 (취소하기)' : '학습 완료로 표시'}
            </button>
            <button className="btn btn-secondary" onClick={() => setAiOpen(true)}>
              ✦ AI에게 질문
            </button>
          </div>
        </div>

        <div className="detail-grid">
          <div>
            {day.description && (
              <div className="card info-card">
                <h3>📖 오늘의 학습</h3>
                <p>{day.description}</p>
              </div>
            )}

            {day.learningGoals.length > 0 && (
              <div className="card info-card">
                <h3>🎯 학습 목표</h3>
                <ul>
                  {day.learningGoals.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}

            {techniques.length > 0 && (
              <div className="card info-card">
                <h3>🥋 오늘 배울 기술</h3>
                <div className="stack gap-2">
                  {techniques.map((t) => (
                    <Link key={t.id} to={`/arts/${t.martialArt}/techniques/${t.id}`} className="technique-row">
                      <div className="technique-row__main">
                        <div className="technique-row__name">
                          {t.name}
                          {t.koreanName && t.koreanName !== t.name && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>
                              {' '}
                              {t.koreanName}
                            </span>
                          )}
                        </div>
                        <div className="technique-row__sub">{t.category}</div>
                      </div>
                      <div className="technique-row__right">
                        <DifficultyBadge difficulty={t.difficulty} />
                        <TechniqueAnalyzeButton technique={t} onOpen={setPoseTechnique} />
                        <span className="chip">기술 상세 →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {techniques.length === 0 && (
              <EmptyState icon="🔁" text="오늘은 새 기술 없이 이전 내용을 복습하는 날입니다." />
            )}

            {techniques.map((t) => (
              <RelatedVideos key={t.id} technique={t} />
            ))}

            <div className="modal-note">
              관절기, 조르기, 던지기, 타격 등 부상 위험이 있는 기술은 이 페이지만 보고 혼자 연습하지 말고, 반드시
              전문 지도자의 지도와 안전한 훈련 환경(매트, 준비운동, 파트너와의 합의)에서 연습하세요. 이 커리큘럼은
              학습·이론 정리용 추천 순서입니다.
            </div>
          </div>

          <div>
            {reviewTechniques.length > 0 && (
              <div className="card info-card">
                <h3>🔁 이전 학습 내용 복습</h3>
                <div className="related-link-list">
                  {reviewTechniques.map((t) => (
                    <Link key={t.id} to={`/arts/${t.martialArt}/techniques/${t.id}`} className="related-link">
                      <span className="related-link__name">
                        {t.name}
                        {t.koreanName ? ` · ${t.koreanName}` : ''}
                      </span>
                    </Link>
                  ))}
                </div>
                {reviewKeyPoints.length > 0 && (
                  <>
                    <div className="field-label" style={{ marginTop: 12 }}>
                      🔑 핵심 포인트
                    </div>
                    <ul style={{ marginTop: 4 }}>
                      {reviewKeyPoints.map((kp, i) => (
                        <li key={i}>{kp}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="card info-card">
              <h3>📅 Day 이동</h3>
              <div className="stack gap-1">
                {prevDay ? (
                  <Link to={`${linkBase}/day/${prevDay.day}`} className="btn btn-secondary">
                    ← Day {prevDay.day}
                  </Link>
                ) : null}
                <Link to={linkBase} className="btn btn-secondary">
                  전체 Day 목록
                </Link>
                {nextDay ? (
                  <Link to={`${linkBase}/day/${nextDay.day}`} className="btn btn-secondary">
                    Day {nextDay.day} →
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {aiOpen && <AiAskModal onClose={() => setAiOpen(false)} dayContext={{ curriculum, day }} />}
      {poseTechnique && <PoseAnalysisModal technique={poseTechnique} onClose={() => setPoseTechnique(null)} />}
    </div>
  );
}
