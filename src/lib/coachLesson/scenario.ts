import type { Technique } from '../../types';
import { lessonName } from './concepts';
import type { ScenarioItem } from './types';
import { contentTokens, josa, nounPhrase } from './text';

// 상황 판단 문제 — built only from a technique's own data (documented
// mistakes ↔ key points, MARTIALDEX transitions, counters/defenses). Kept
// independent of the lesson engine so a future standalone 상황 퀴즈 /
// 상황판단 훈련 can call buildScenarios() directly.

function pairMistakes(t: Technique): ScenarioItem[] {
  const p = t.posture;
  if (!p?.keyPoints?.length || !p.commonMistakes?.length) return [];
  const out: ScenarioItem[] = [];
  p.commonMistakes.forEach((m, i) => {
    const mt = contentTokens(m);
    const kp = p.keyPoints!.find((k) => contentTokens(k).some((x) => mt.some((y) => x === y || x.includes(y) || y.includes(x))));
    if (!kp) return;
    const clean = m.replace(/[.。]$/, '');
    out.push({
      id: `${t.id}:mistake-${i}`,
      situation: `${josa(lessonName(t), '을/를')} 연습하는데 "${clean}" 상황이 생겼습니다.`,
      question: '무엇이 문제였고, 무엇을 고쳐야 할까요?',
      answer: kp,
      why: `${josa(nounPhrase(kp), '을/를')} 지키면 바로 이 문제를 막을 수 있기 때문입니다`,
      cue: `"${clean}"${josa(clean, '이/가').endsWith('이') ? '이라는' : '라는'} 결과`,
      keywords: contentTokens(kp).slice(0, 8),
    });
  });
  return out;
}

function fromTransitions(t: Technique): ScenarioItem[] {
  const names = [t.name, t.koreanName].filter(Boolean).map((n) => n!.toLowerCase());
  const next = t.transitions
    .map((s) => s.split(/→|->/).map((x) => x.trim()))
    .filter((parts) => parts.length === 2 && names.includes(parts[0].toLowerCase()))
    .map((parts) => parts[1]);
  if (!next.length) return [];
  return [
    {
      id: `${t.id}:transition`,
      situation: `${josa(lessonName(t), '을/를')} 시도했지만 상대가 방어해서 완성되지 않았습니다.`,
      question: '여기서 끝내지 않고 이어서 연결할 수 있는 기술은 무엇일까요?',
      answer: next.join(', '),
      why: `MARTIALDEX의 연결 흐름에서 ${josa(lessonName(t), '은/는')} ${josa(next.join(', '), '으로/로')} 이어지기 때문입니다`,
      cue: '기술이 막혔지만 아직 같은 포지션을 유지하고 있다는 점',
      keywords: next.flatMap((n) => contentTokens(n)),
    },
  ];
}

function fromCounters(t: Technique): ScenarioItem[] {
  const list = [...t.defenses, ...t.counters].filter(Boolean);
  if (!list.length) return [];
  return [
    {
      id: `${t.id}:counter`,
      situation: `상대가 나에게 ${josa(lessonName(t), '을/를')} 걸어 오고 있습니다.`,
      question: '어떻게 막거나 대응할 수 있을까요?',
      answer: list.slice(0, 3).join(', '),
      why: `MARTIALDEX 자료에 ${lessonName(t)}의 방어·카운터로 ${josa(list.slice(0, 3).join(', '), '이/가')} 정리되어 있기 때문입니다`,
      cue: '상대가 기술을 시작하는 순간',
      keywords: list.slice(0, 3).flatMap((n) => contentTokens(n)),
    },
  ];
}

/** Situational items for a technique, most lesson-relevant first. */
export function buildScenarios(t: Technique): ScenarioItem[] {
  return [...pairMistakes(t), ...fromTransitions(t), ...fromCounters(t)];
}

/** Coach-style explanation after a scenario answer: 정답 → 왜 → 상황의 단서. */
export function scenarioDebrief(s: ScenarioItem, correct: boolean): string {
  const head = correct ? '맞습니다.' : `이 상황의 답은 ${nounPhrase(s.answer)}입니다.`;
  return `${head} ${s.why}. 이 상황에서의 단서는 ${s.cue}였습니다.`;
}
