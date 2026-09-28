import type { Technique } from '../../types';
import type { Curriculum, CurriculumDay } from '../curriculum/types';
import type { PoseAnalysisResult } from '../poseAnalysis/types';
import type { FighterStyleAnalysis, TechniqueMatch, UserLevel } from '../fighterStyle/types';
import { getMartialArt, getTechniquesByIds, martialArtSummaries, totalTechniqueCount } from '../loadData';
import { getTechniqueSkillSummary } from '../poseAnalysis/recordsService';
import { listMyActiveProgress, listMyCurricula } from '../curriculum/curriculumService';
import { listMyStyleCurricula } from '../fighterStyle/styleCurriculumService';
import { listRecentTrainingHistory } from '../trainingHistory/service';
import { computeAllSkillProgress, findRecentlyImproved, rankWeakness, summarizeByPosition, summarizeCoachStats } from '../skillProgress/weaknessEngine';
import { listSparringSessions } from '../sparringAnalysis/sparringSessionService';
import { getTechniqueConnections } from '../techniqueGraph/buildGraph';
import { RELATION_LABEL, type ConnectedTechnique, type RelationKind } from '../techniqueGraph/types';
import { computeReviewCandidates } from '../reviewSystem/reviewEngine';
import { REVIEW_TIER_LABEL } from '../reviewSystem/types';
import { getCachedMyStyleAnalysis } from '../myStyle/styleAnalysisEngine';
import { computeMonthlyStyleTrend } from '../myStyle/styleEvolution';
import { computeStyleComparison } from '../myStyle/comparisonEngine';
import { collectProfileStats } from '../profileStats/collectProfileStats';
import { computeLevelInfo } from '../level/levelEngine';


function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '(데이터 없음)';
}

// Everything the AI is told about the current technique comes straight from
// the app's own parsed data (data/processed/*.json + data/curated). No field
// here is invented — a missing value is rendered as "(데이터 없음)" so the
// model can see the gap instead of guessing.
export function buildTechniqueContext(technique: Technique): string {
  const art = getMartialArt(technique.martialArt);
  const relatedTechniqueNames = getTechniquesByIds(technique.relatedTechniques).map(
    (t) => `${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''}`
  );
  const relatedArtNames = technique.relatedMartialArts.map((id) => getMartialArt(id)?.nameKo ?? id);

  const lines = [
    '다음은 MARTIALDEX 앱에 저장된 이 기술의 실제 데이터입니다.',
    `무술: ${art?.nameKo ?? technique.martialArt}${art?.nameEn ? ` (${art.nameEn})` : ''}`,
    `기술명(영문/원어): ${technique.name}`,
    `한국어 이름: ${technique.koreanName ?? '(없음)'}`,
    technique.aliases.length ? `다른 이름: ${technique.aliases.join(', ')}` : '',
    `카테고리: ${technique.category}`,
    technique.positions.length ? `포지션: ${technique.positions.join(', ')}` : '',
    technique.difficulty ? `난이도: ${technique.difficulty}` : '',
    '',
    `설명: ${technique.description || '(데이터 없음)'}`,
    `목적/사용 상황: ${technique.purpose || '(데이터 없음)'}`,
    '',
    `핵심 원리:\n${list(technique.principles)}`,
    `변형:\n${list(technique.variations)}`,
    `방어:\n${list(technique.defenses)}`,
    `카운터:\n${list(technique.counters)}`,
    `연결 기술:\n${list(technique.transitions)}`,
    '',
    relatedTechniqueNames.length ? `관련 기술: ${relatedTechniqueNames.join(', ')}` : '',
    relatedArtNames.length ? `관련 무술: ${relatedArtNames.join(', ')}` : '',
    technique.tags.length ? `태그: ${technique.tags.join(', ')}` : '',
    '',
    buildConnectionSection(technique),
  ];

  return lines.filter((line) => line !== '').join('\n');
}

// 16단계 — 실제 기술 연결 그래프 데이터(techniqueGraph/buildGraph.ts, 검색
// 인덱스로 실제 다른 기술에만 매칭됨)를 그대로 노출한다. "이 기술 다음에
// 뭘 배우면 좋아?" 같은 질문에 AI가 진짜 존재하는 기술로만 답할 수 있도록—
// AI는 여기서도 기술을 스스로 지어내지 않고, 이미 계산된 실제 연결만 본다.
function buildConnectionSection(technique: Technique): string {
  const connections = getTechniqueConnections(technique);
  const kinds: RelationKind[] = ['prerequisite', 'next', 'counter', 'escape', 'samePosition'];
  const names = (items: ConnectedTechnique[]) => items.map((c) => c.techniqueName).join(', ');
  const sectionLines = kinds
    .map((k) => (connections[k].length ? `${RELATION_LABEL[k]}: ${names(connections[k])}` : ''))
    .filter(Boolean);
  if (sectionLines.length === 0) return '이 기술과 실제로 연결된 다른 기술 데이터는 아직 없습니다.';
  return ['실제 기술 연결 데이터(Martialdex 기술 그래프 — 여기 나열된 것만 실제로 존재하는 기술입니다):', ...sectionLines].join('\n');
}

// The Day-detail assistant gets exactly what that day actually teaches —
// its real techniques (by id, same as buildTechniqueContext) plus the
// curriculum's own title/learning goals. Nothing about "what a good BJJ
// curriculum should cover in general" is added — only this day's data.
export function buildDayContext(curriculum: Curriculum, day: CurriculumDay): string {
  const techniques = getTechniquesByIds(day.techniqueIds);
  const reviewTechniques = getTechniquesByIds(day.reviewTechniqueIds);
  const art = getMartialArt(curriculum.martialArt);

  const describe = (t: Technique) =>
    `- ${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''} [${t.category}]: ${
      t.purpose || t.description || '(설명 데이터 없음)'
    }`;

  const lines = [
    `다음은 MARTIALDEX 학습 커리큘럼 "${curriculum.title}"(${art?.nameKo ?? curriculum.martialArt}) 중 Day ${day.day} "${day.title}"의 실제 데이터입니다.`,
    `오늘의 학습 목표: ${day.learningGoals.join(' / ') || '(없음)'}`,
    '',
    techniques.length ? '오늘 새로 배우는 기술:' : '오늘은 새 기술 없이 복습만 진행하는 날입니다.',
    ...techniques.map(describe),
  ];

  if (reviewTechniques.length) {
    lines.push('', '오늘 복습으로 다시 보는 이전 기술:', ...reviewTechniques.map(describe));
  }

  return lines.join('\n');
}

// The pose-analysis assistant explains a score the LOCAL scoring engine
// already computed (analyzeTechnique.ts) — the AI never calculates or
// second-guesses the number itself, only explains what was measured. The
// preamble makes that boundary explicit so the model doesn't imply it
// watched the video or ran the analysis.
export function buildPoseAnalysisContext(technique: Technique, result: PoseAnalysisResult): string {
  const lines = [
    `다음은 "${technique.name}" 기술에 대해 카메라 자세 분석 기능이 방금 로컬에서 계산한 결과입니다.`,
    '이 점수는 AI가 아니라 관절 각도/위치를 계산하는 코드가 산출했다 — 당신은 이 결과를 사용자가 이해하기 쉽게 설명하는 역할만 한다.',
    '이 분석은 카메라로 확인 가능한 자세 요소만 근사적으로 측정한 것이며, 실제 무술 실력이나 기술의 완성도를 완전히 평가하지 않는다는 점을 필요할 때 상기시킨다.',
    '',
    `종합 점수: ${result.overallScore} / 100`,
    '세부 지표:',
    ...result.metricScores.map((m) => `- ${m.name}: ${m.score}점 (${m.detail})`),
    result.strengths.length ? `잘한 부분: ${result.strengths.join(', ')}` : '',
    result.improvements.length ? `개선할 부분: ${result.improvements.join(', ')}` : '',
    '',
    buildTechniqueContext(technique),
  ];
  return lines.filter((line) => line !== '').join('\n');
}

const LEVEL_LABEL: Record<UserLevel, string> = {
  first_time: '처음 시작',
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
};

// The fighter-style assistant gets the AI-generated style analysis (clearly
// labeled as such, not app-official data), the deterministically-matched
// REAL techniques with their pose-analysis scores when available, and the
// user's stated level/curriculum — so it can answer things like "왜 이
// 기술이 포함됐어?" or "내 점수가 낮은 기술부터 뭘 연습해야 해?" without
// re-deriving anything the app hasn't already computed.
export function buildFighterStyleContext(params: {
  styleAnalysis: FighterStyleAnalysis;
  matchedTechniques: TechniqueMatch[];
  userLevel?: UserLevel;
  curriculum?: Curriculum;
}): string {
  const { styleAnalysis: a, matchedTechniques, userLevel, curriculum } = params;

  const techniqueLines = matchedTechniques.slice(0, 20).map((m) => {
    const summary = getTechniqueSkillSummary(m.techniqueId);
    const scoreNote = summary.status === 'not_analyzed' ? '아직 카메라 자세 분석 안 함' : `AI 자세 분석 점수 ${summary.latestScore}점`;
    return `- ${m.techniqueName} [관련도 ${m.relevanceScore}] (${scoreNote})`;
  });

  const lines = [
    `다음은 "${a.fighterName}" 선수의 공개 정보 기반 스타일 분석(Martialdex AI가 생성, 확정된 사실이 아님)입니다.`,
    `스타일 요약: ${a.styleSummary}`,
    `주요 스타일: ${a.primaryStyles.join(', ') || '(없음)'}`,
    `핵심 강점: ${a.keyStrengths.join(', ') || '(없음)'}`,
    `선호 포지션: ${a.preferredPositions.join(', ') || '(없음)'}`,
    `핵심 기술: ${a.keyTechniques.join(', ') || '(없음)'}`,
    '',
    '이 스타일과 매칭된 Martialdex의 실제 기술(관련도 점수는 검색 매칭 기반으로 계산된 값):',
    ...techniqueLines,
  ];

  if (userLevel) lines.push('', `사용자가 밝힌 현재 수준: ${LEVEL_LABEL[userLevel]}`);

  if (curriculum) {
    lines.push(
      '',
      `사용자가 저장한 커리큘럼 "${curriculum.title}": 총 ${curriculum.totalDays}일, 강도 ${curriculum.styleMeta?.intensity ?? '보통'}.`
    );
  }

  lines.push(
    '',
    '중요: 이 스타일 분석은 공개 경기 기록과 일반적으로 알려진 평가를 바탕으로 한 학습용 참고 자료이며,',
    '선수의 실력이나 스타일을 공식적으로 확정하는 자료가 아니다. AI 자세 분석 점수 역시 카메라 기반 근사',
    '측정치일 뿐, 사용자의 실제 실력을 확정하지 않는다.'
  );

  return lines.filter(Boolean).join('\n');
}

// 12-2 "AI 코칭 데이터": everything here comes from the user's own real
// records (pose analysis, training history, curriculum progress) — no name,
// email, or other personal info is ever included, only learning data. Empty
// sections are omitted rather than asserting "사용자는 아무것도 하지
// 않았습니다" as if that were confirmed fact.
export function buildCoachContext(): string {
  const skillEntries = computeAllSkillProgress();
  const stats = summarizeCoachStats(skillEntries);
  const weakness = rankWeakness(skillEntries, { limit: 5 });
  const improved = findRecentlyImproved(skillEntries, 5);
  const positionBreakdown = summarizeByPosition(skillEntries).filter((p) => p.analyzedCount > 0);
  const activeProgress = listMyActiveProgress();
  const myCurricula = listMyCurricula();
  const myStyleCurricula = listMyStyleCurricula();
  const recentHistory = listRecentTrainingHistory(5);

  const lines: string[] = [
    '다음은 사용자의 실제 학습 기록을 요약한 데이터입니다(개인정보는 포함하지 않으며, 학습 관련 데이터만 담고 있습니다).',
    `분석/학습 신호가 있는 기술: ${stats.learnedCount}개 (숙련 ${stats.proficientCount} · 보통 ${stats.averageCount} · 개선 필요 ${stats.needsImprovementCount})`,
    stats.lastPracticedAt ? `최근 학습: ${stats.lastPracticedAt.slice(0, 10)}` : '최근 학습 기록 없음',
  ];

  if (weakness.length) {
    lines.push('', '개선이 필요한 기술 TOP:', ...weakness.map((w) => `- ${w.techniqueName} (${w.score}점) — ${w.reason}`));
  }
  if (improved.length) {
    lines.push('', '최근 향상된 기술:', ...improved.map((i) => `- ${i.techniqueName}: ${i.latestScore}점 (+${i.scoreDelta})`));
  }
  if (positionBreakdown.length) {
    lines.push(
      '',
      '포지션별 평균 점수(분석 기록이 있는 기술 기준):',
      ...positionBreakdown.map((p) => `- ${p.label}: ${p.averageScore}점 (분석 ${p.analyzedCount}/${p.totalCount})`)
    );
  }
  if (activeProgress.length) {
    lines.push(
      '',
      '진행 중인 커리큘럼:',
      ...activeProgress
        .slice(0, 3)
        .map(({ curriculum, progress }) => `- "${curriculum.title}": Day ${progress.currentDay}/${curriculum.totalDays}, 진행률 ${progress.progress}%`)
    );
  }
  if (myStyleCurricula.length) {
    lines.push('', `저장한 선수 스타일 커리큘럼: ${myStyleCurricula.map((c) => c.title).join(', ')}`);
  }
  lines.push('', `저장한 커리큘럼 총 ${myCurricula.length}개`);
  if (recentHistory.length) {
    lines.push(
      '',
      '최근 학습 기록:',
      ...recentHistory.map((h) => `- ${h.date}: 기술 ${h.techniqueIds.length}개 (${h.curriculumId ? '커리큘럼 학습' : '오늘의 훈련'})`)
    );
  }

  const reviewCandidates = computeReviewCandidates(skillEntries);
  const reviewToday = reviewCandidates.filter((c) => c.tier === 'today');
  const reviewSoon = reviewCandidates.filter((c) => c.tier === 'soon');
  if (reviewToday.length || reviewSoon.length) {
    lines.push('', '복습이 필요한 기술(19단계 복습 시스템이 이미 계산한 실제 우선순위):');
    if (reviewToday.length) {
      lines.push(`- ${REVIEW_TIER_LABEL.today}: ${reviewToday.map((c) => c.techniqueName).join(', ')}`);
    }
    if (reviewSoon.length) {
      lines.push(`- ${REVIEW_TIER_LABEL.soon}: ${reviewSoon.map((c) => c.techniqueName).join(', ')}`);
    }
  }

  // 20단계 — 나의 스타일 분석(이미 캐시된 실제 요약), 목표 스타일과의 격차,
  // 월별 스타일 변화, 레벨/스트릭까지 더해 "다음에 무엇을 해야 하는지"를
  // 코치가 더 넓은 맥락에서 답할 수 있게 한다. 전부 이미 계산된 실제 값이며
  // 이 함수 자체는 어떤 새 판단도 하지 않는다.
  const myStyleAnalysis = getCachedMyStyleAnalysis();
  if (myStyleAnalysis) {
    lines.push(
      '',
      `나의 현재 스타일 분석(${myStyleAnalysis.source === 'ai' ? 'AI 분석' : '실제 데이터 기반 기본 요약'}): ${myStyleAnalysis.styleName}`,
      ...myStyleAnalysis.traits.map((t) => `- ${t}`)
    );
  }
  const monthlyStyleTrend = computeMonthlyStyleTrend();
  if (monthlyStyleTrend.length >= 2) {
    lines.push('', `최근 스타일 변화 추이(월별): ${monthlyStyleTrend.map((m) => `${m.month} ${m.label}`).join(' → ')}`);
  }
  if (myStyleCurricula.length && myStyleCurricula[0].styleMeta) {
    const meta = myStyleCurricula[0].styleMeta;
    const comparison = computeStyleComparison(positionBreakdown, meta.matchedTechniques);
    const gapRows = comparison.filter((r) => r.targetStars !== null && (r.currentStars ?? 0) < (r.targetStars ?? 0));
    if (gapRows.length) {
      lines.push(
        '',
        `목표 스타일("${meta.fighterName}")과 비교했을 때 격차가 있는 영역:`,
        ...gapRows.map((r) => `- ${r.label}: 현재 ${r.currentStars ?? '데이터 부족'} vs 목표 ${r.targetStars}(5점 만점 환산)`)
      );
    }
  }
  const profileStats = collectProfileStats(skillEntries);
  const level = computeLevelInfo(profileStats);
  lines.push('', `학습 레벨: Level ${level.level}(${level.label}, 앱 내부 학습 진행도 지표) · 연속 학습 ${profileStats.currentStreak}일`);

  const latestSparring = listSparringSessions()[0];
  if (latestSparring) {
    lines.push(
      '',
      `최근 스파링 분석(${latestSparring.date.slice(0, 10)}, ${latestSparring.videoDurationSec}초 영상, 실제 영상 분석 결과이며 참고용):`,
      ...(latestSparring.styleObservations.length ? latestSparring.styleObservations.map((o) => `- ${o}`) : []),
      ...(latestSparring.weakAreas.length
        ? [`개선이 필요하다고 관찰된 부분: ${latestSparring.weakAreas.map((w) => w.label).join(', ')}`]
        : [])
    );
  }

  lines.push(
    '',
    '중요: 이 요약은 AI 자세 분석 기록과 학습 기록을 기반으로 한 참고 자료이며, 사용자의 실제 무술 실력을',
    '공식적으로 확정하지 않는다. "AI 분석 기록을 기반으로 한 학습 추천"이라는 취지를 유지하고,',
    '전문 지도자의 지도를 대체한다고 말하지 않는다.'
  );

  return lines.join('\n');
}

// The Home/Header "global" assistant has no single technique selected, so it
// only gets a roster of what the app covers instead of one technique's data.
export function buildHomeContext(): string {
  const roster = martialArtSummaries
    .map((art) => `- ${art.nameKo}${art.nameEn ? ` (${art.nameEn})` : ''}: 기술 ${art.techniqueCount}개`)
    .join('\n');

  return [
    '현재는 특정 기술이 선택되지 않은 상태이며, 아래는 MARTIALDEX 앱에 등록된 전체 무술 목록입니다.',
    `전체 무술 ${martialArtSummaries.length}개, 전체 기술 ${totalTechniqueCount}개`,
    roster,
    '사용자가 특정 기술을 지정하지 않으면 일반적인 무술 지식으로 답하되, 가능하면 위 목록의 무술/기술과 연결해 답한다.',
  ].join('\n');
}
