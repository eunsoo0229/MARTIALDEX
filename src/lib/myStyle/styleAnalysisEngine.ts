import { askGeminiForJson } from '../fighterStyle/geminiJson';
import { POSITION_LABEL } from '../skillProgress/positionClassifier';
import { buildMyStyleDataSummary } from './dataAggregator';
import type { MyStyleAnalysis, MyStyleDataSummary } from './types';

const CACHE_KEY = 'martialdex:my-style-analysis';
const NOT_ENOUGH_DATA = '데이터 부족';

function readCache(): MyStyleAnalysis | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MyStyleAnalysis) : null;
  } catch {
    return null;
  }
}

function writeCache(analysis: MyStyleAnalysis): void {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(analysis));
  window.dispatchEvent(new CustomEvent('martialdex:my-style-updated'));
}

export function getCachedMyStyleAnalysis(): MyStyleAnalysis | null {
  return readCache();
}

interface AiStyleResponse {
  styleName: string;
  traits: string[];
  attackTendency: string;
  defenseTendency: string;
  distance: string;
  footwork: string;
  clinch: string;
  takedown: string;
  ground: string;
  techniqueSelection: string;
  transitionPattern: string;
}

function isAiStyleResponse(data: unknown): data is AiStyleResponse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const stringFields = [
    'styleName',
    'attackTendency',
    'defenseTendency',
    'distance',
    'footwork',
    'clinch',
    'takedown',
    'ground',
    'techniqueSelection',
    'transitionPattern',
  ];
  return stringFields.every((f) => typeof d[f] === 'string') && Array.isArray(d.traits) && d.traits.every((t) => typeof t === 'string');
}

function scoreLabel(score: number | null, highLabel: string, lowLabel: string, midLabel: string): string {
  if (score === null) return NOT_ENOUGH_DATA;
  if (score >= 70) return highLabel;
  if (score < 50) return lowLabel;
  return midLabel;
}

// Used both when the AI call fails AND as the honest baseline the AI prompt
// itself is grounded in — every field is either derived from a real
// computed number or explicitly "데이터 부족", never invented.
function buildFallbackAnalysis(summary: MyStyleDataSummary): Omit<MyStyleAnalysis, 'source' | 'generatedAt' | 'inputHash'> {
  const dominant = [...summary.positionBreakdown].sort((a, b) => b.analyzedCount - a.analyzedCount)[0];
  const clinchEntry = summary.positionBreakdown.find((p) => p.position === 'clinch');
  const groundEntries = summary.positionBreakdown.filter((p) => p.position === 'guard' || p.position === 'mount_top' || p.position === 'back_control');
  const topTechniques = summary.techniqueFrequency.slice(0, 3).map((t) => t.techniqueName);

  const styleName = dominant ? `${POSITION_LABEL[dominant.position === 'other' ? 'standing' : dominant.position]} 중심 스타일` : '분석 중';

  const attackTendency = scoreLabel(summary.avgOverallScores?.offense ?? null, '공격적인 성향이 관찰됩니다', '공격 빈도가 낮은 편입니다', '균형 잡힌 공격 빈도입니다');
  const defenseTendency = scoreLabel(summary.avgOverallScores?.defense ?? null, '방어가 안정적입니다', '방어 보완이 필요합니다', '평균적인 방어 수준입니다');
  const distance = scoreLabel(summary.avgOverallScores?.distance ?? null, '거리 유지가 양호합니다', '거리 관리 개선이 필요합니다', '보통 수준의 거리 관리입니다');
  const footwork = scoreLabel(summary.avgOverallScores?.movement ?? null, '풋워크/움직임이 활발합니다', '움직임이 다소 정적입니다', '보통 수준의 움직임입니다');
  const clinch = clinchEntry ? `클린치 포지션 기술 분석 ${clinchEntry.analyzedCount}회, 평균 ${clinchEntry.averageScore ?? '-'}점` : NOT_ENOUGH_DATA;
  const ground = groundEntries.length > 0 ? `그라운드/포지션 기술 분석 ${groundEntries.reduce((a, p) => a + p.analyzedCount, 0)}회` : NOT_ENOUGH_DATA;
  const techniqueSelection = topTechniques.length > 0 ? `자주 사용하는 기술: ${topTechniques.join(', ')}` : NOT_ENOUGH_DATA;

  const traits = [attackTendency, defenseTendency, distance, footwork, clinch, ground, techniqueSelection].filter((t) => t !== NOT_ENOUGH_DATA);

  return {
    styleName,
    traits: traits.length > 0 ? traits.slice(0, 6) : ['아직 뚜렷한 특징을 판단하기에 데이터가 부족합니다'],
    attackTendency,
    defenseTendency,
    distance,
    footwork,
    clinch,
    takedown: NOT_ENOUGH_DATA,
    ground,
    techniqueSelection,
    transitionPattern: NOT_ENOUGH_DATA,
  };
}

function buildContextText(summary: MyStyleDataSummary): string {
  const lines: string[] = [
    `스파링 분석 영상 수: ${summary.sparringSessionCount}개`,
    `완료한 훈련 세션 수: ${summary.trainingSessionCount}회`,
    `실제로 연습/분석한 기술 수: ${summary.practicedTechniqueCount}개 (카메라 자세 분석 완료 ${summary.analyzedTechniqueCount}개)`,
  ];
  if (summary.martialArtsPracticed.length) {
    lines.push(`주로 연습한 무술: ${summary.martialArtsPracticed.map((m) => `${m.nameKo}(${m.count})`).join(', ')}`);
  }
  if (summary.positionBreakdown.length) {
    lines.push(
      '포지션별 자세 분석 평균 점수:',
      ...summary.positionBreakdown.map((p) => `- ${POSITION_LABEL[p.position === 'other' ? 'standing' : p.position]}: ${p.averageScore}점 (분석 ${p.analyzedCount}/${p.totalCount})`)
    );
  }
  if (summary.techniqueFrequency.length) {
    lines.push(`자주 사용/연습한 기술: ${summary.techniqueFrequency.map((t) => `${t.techniqueName}(${t.count}회)`).join(', ')}`);
  }
  if (summary.avgOverallScores) {
    const s = summary.avgOverallScores;
    const parts: string[] = [];
    if (s.offense !== null) parts.push(`공격 ${s.offense}점`);
    if (s.defense !== null) parts.push(`방어 ${s.defense}점`);
    if (s.distance !== null) parts.push(`거리 관리 ${s.distance}점`);
    if (s.movement !== null) parts.push(`움직임 ${s.movement}점`);
    if (s.posture !== null) parts.push(`자세 ${s.posture}점`);
    if (parts.length) lines.push(`스파링 영상 평균 점수: ${parts.join(', ')}`);
  }
  if (summary.recentStyleObservations.length) {
    lines.push('최근 스파링 관찰 내용:', ...summary.recentStyleObservations.map((o) => `- ${o}`));
  }
  if (summary.recentWeakAreaLabels.length) {
    lines.push(`최근 스파링에서 개선이 필요하다고 관찰된 부분: ${summary.recentWeakAreaLabels.join(', ')}`);
  }
  return lines.join('\n');
}

// The AI is only ever asked to phrase a style narrative around numbers
// dataAggregator.ts already computed — it is explicitly told to answer
// "데이터 부족" for anything not covered by the numbers, and never to invent
// a technique, position, or trend that isn't in the context text.
export async function computeMyStyleAnalysis(forceRefresh = false): Promise<MyStyleAnalysis | null> {
  const summary = buildMyStyleDataSummary();
  if (!summary.hasEnoughData) return null;

  if (!forceRefresh) {
    const cached = readCache();
    if (cached && cached.inputHash === summary.inputHash) return cached;
  }

  const generatedAt = new Date().toISOString();
  const aiResult = await askGeminiForJson<AiStyleResponse>({
    systemInstruction: [
      '사용자의 실제 무술 학습/스파링 데이터를 요약한 아래 수치만 근거로 "나의 무술 스타일"을 분석하는 역할이다.',
      '아래 제공된 수치와 목록에 없는 사실을 절대 지어내지 않는다.',
      '특정 항목(공격/방어/거리/풋워크/클린치/테이크다운/그라운드/기술 선택/전환 패턴)에 대해 근거가 될 실제 데이터가 없으면',
      '반드시 그 항목의 값을 정확히 "데이터 부족"이라는 문자열로 답한다 — 임의로 지어내지 않는다.',
      'styleName은 짧은 영문 또는 한글 스타일 이름(예: "Pressure Grappling", "아웃복싱형")으로 작성한다.',
      'traits는 실제 근거가 있는 특징만 4~6개의 짧은 구로 작성한다.',
      '이 분석은 참고용 학습 데이터이며 실제 실력이나 대회 성적을 평가하지 않는다는 것을 항상 전제로 한다.',
      '출력 형식: {"styleName": string, "traits": string[], "attackTendency": string, "defenseTendency": string, "distance": string, "footwork": string, "clinch": string, "takedown": string, "ground": string, "techniqueSelection": string, "transitionPattern": string}',
    ].join('\n'),
    contextText: buildContextText(summary),
    question: '이 사용자의 무술 스타일을 분석해줘.',
    validate: isAiStyleResponse,
  });

  const analysis: MyStyleAnalysis = aiResult.ok
    ? { ...aiResult.data, source: 'ai', generatedAt, inputHash: summary.inputHash }
    : { ...buildFallbackAnalysis(summary), source: 'fallback', generatedAt, inputHash: summary.inputHash };

  writeCache(analysis);
  return analysis;
}
