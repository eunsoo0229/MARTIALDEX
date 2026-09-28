import { aiProvider } from '../ai/provider';
import { resolveTechniquesByIds } from '../userTechniques/service';
import type { Tactic } from './types';

export interface TacticFeedbackOutcome {
  ok: boolean;
  text?: string;
  message?: string;
}

/**
 * Short (2-4 sentence) tactical feedback on a user-authored IF/THEN tactic —
 * spec section 9. Reuses the EXACT same Gemini plumbing as every other AI
 * feature (aiProvider.ask -> Electron IPC or the gemini-ask Edge Function),
 * no new API-key handling. The prompt is built ONLY from the tactic's own
 * situation text and the REAL technique records it references (name/
 * category/purpose/description, all straight from the encyclopedia via
 * resolveTechniquesByIds) — the model is explicitly told not to invent
 * details beyond what's given (spec section 9's "실제 데이터에 없는 내용을
 * 분석했다고 주장하지 않는다").
 */
export async function generateTacticFeedback(tactic: Tactic): Promise<TacticFeedbackOutcome> {
  const techniques = resolveTechniquesByIds(tactic.techniqueIds);
  if (techniques.length === 0) {
    return { ok: false, message: '피드백을 생성할 기술 정보를 찾을 수 없습니다.' };
  }

  const techniqueList = techniques
    .map((t, i) => `${i + 1}. ${t.name}${t.koreanName && t.koreanName !== t.name ? ` (${t.koreanName})` : ''} — ${t.category}${t.purpose ? ` · ${t.purpose}` : ''}`)
    .join('\n');

  const systemInstruction = [
    '사용자가 IF(상황) -> THEN(대응 기술 순서) 형태의 전술을 직접 만들었다. 아래 제공된 실제 기술 정보만',
    '근거로 짧은 전술 피드백을 작성한다.',
    '',
    '피드백은 한국어로 2~4문장이며 다음을 다룬다: 이 기술 순서가 주어진 상황에 실제로 적절한지, 순서상',
    '아쉬운 점이나 보완하면 좋을 부분(있다면), 잘 짜여진 경우 어떤 점이 좋은지.',
    '',
    '중요: 아래 제공된 기술 정보(이름/분류/목적)에 없는 내용을 사실인 것처럼 지어내지 않는다. 확인할 수',
    '없는 세부사항(예: 실제 대회 데이터, 통계)은 언급하지 않는다. 이것은 참고용 학습 피드백이며 실전을',
    '보장하지 않는다는 점을 마지막에 짧게 덧붙인다.',
  ].join('\n');

  const contextText = [`전술 이름: ${tactic.name}`, `IF (상황): ${tactic.situation}`, `THEN (대응 기술 순서):`, techniqueList].join('\n');

  const result = await aiProvider.ask({
    systemInstruction,
    contextText,
    history: [],
    question: '이 전술에 대해 짧은 피드백을 해줘.',
  });

  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, text: result.text };
}
