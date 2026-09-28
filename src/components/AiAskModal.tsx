import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from './BottomSheet';
import type { Technique } from '../types';
import type { Curriculum, CurriculumDay } from '../lib/curriculum/types';
import type { PoseAnalysisResult } from '../lib/poseAnalysis/types';
import type { FighterStyleAnalysis, TechniqueMatch, UserLevel } from '../lib/fighterStyle/types';
import {
  buildCoachContext,
  buildDayContext,
  buildFighterStyleContext,
  buildHomeContext,
  buildPoseAnalysisContext,
  buildTechniqueContext,
} from '../lib/ai/context';
import { AI_SYSTEM_INSTRUCTION } from '../lib/ai/systemInstruction';
import { useAiChat } from '../lib/ai/useAiChat';

const EXAMPLE_QUESTIONS = [
  '이 기술은 어떤 상황에서 사용해?',
  '이 기술과 비슷한 기술은 뭐야?',
  '상대가 이 기술을 방어하면 어떻게 대응해?',
  '이 기술을 배우고 나면 다음에 뭘 배우면 좋아?',
];

const DAY_EXAMPLE_QUESTIONS = [
  '오늘 배우는 기술들의 차이점을 설명해줘.',
  '오늘 학습한 내용을 복습시켜줘.',
  '이 기술들이 어떤 포지션에서 연결되는지 설명해줘.',
];

const POSE_EXAMPLE_QUESTIONS = ['왜 이 지표 점수가 낮아?', '이 결과를 개선하려면 뭘 연습해야 해?'];

const FIGHTER_STYLE_EXAMPLE_QUESTIONS = [
  '이 스타일의 핵심은 뭐야?',
  '초보자인데 무엇부터 연습해야 해?',
  '내 점수가 낮은 기술은 무엇부터 연습해야 해?',
];

const HOME_EXAMPLE_QUESTIONS = [
  '그래플링과 타격 무술의 가장 큰 차이가 뭐야?',
  '초보자가 배우기 좋은 무술을 추천해줘',
];

const COACH_EXAMPLE_QUESTIONS = [
  '오늘 뭐 연습할까?',
  '내 약점이 뭐야?',
  '최근에 뭐가 좋아졌어?',
  '내가 가장 부족한 포지션은 뭐야?',
];

export interface FighterStyleAiContext {
  styleAnalysis: FighterStyleAnalysis;
  matchedTechniques: TechniqueMatch[];
  userLevel?: UserLevel;
  curriculum?: Curriculum;
}

export default function AiAskModal({
  onClose,
  technique,
  dayContext,
  poseResult,
  fighterStyleContext,
  coach,
}: {
  onClose: () => void;
  technique?: Technique;
  dayContext?: { curriculum: Curriculum; day: CurriculumDay };
  poseResult?: PoseAnalysisResult;
  fighterStyleContext?: FighterStyleAiContext;
  coach?: boolean;
}) {
  const sessionKey =
    technique && poseResult
      ? `pose:${technique.id}:${poseResult.overallScore}`
      : technique
        ? `technique:${technique.id}`
        : dayContext
          ? `day:${dayContext.curriculum.id}:${dayContext.day.day}`
          : fighterStyleContext
            ? `fighterStyle:${fighterStyleContext.styleAnalysis.fighterId}`
            : coach
              ? 'coach'
              : 'global';
  const contextText =
    technique && poseResult
      ? buildPoseAnalysisContext(technique, poseResult)
      : technique
        ? buildTechniqueContext(technique)
        : dayContext
          ? buildDayContext(dayContext.curriculum, dayContext.day)
          : fighterStyleContext
            ? buildFighterStyleContext(fighterStyleContext)
            : coach
              ? buildCoachContext()
              : buildHomeContext();
  const historyMeta = {
    feature:
      technique && poseResult
        ? ('pose_analysis' as const)
        : technique
          ? ('technique' as const)
          : dayContext
            ? ('curriculum_day' as const)
            : fighterStyleContext
              ? ('fighter_style' as const)
              : coach
                ? ('coach' as const)
                : ('global' as const),
    relatedTechniqueId: technique?.id ?? null,
    relatedCurriculumId: dayContext?.curriculum.id ?? fighterStyleContext?.curriculum?.id ?? null,
  };
  const { messages, loading, error, ask, clear } = useAiChat({
    sessionKey,
    systemInstruction: AI_SYSTEM_INSTRUCTION,
    contextText,
    historyMeta,
  });

  const [input, setInput] = useState('');
  const [emptyWarning, setEmptyWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  const examples = poseResult
    ? POSE_EXAMPLE_QUESTIONS
    : technique
      ? EXAMPLE_QUESTIONS
      : dayContext
        ? DAY_EXAMPLE_QUESTIONS
        : fighterStyleContext
          ? FIGHTER_STYLE_EXAMPLE_QUESTIONS
          : coach
            ? COACH_EXAMPLE_QUESTIONS
            : HOME_EXAMPLE_QUESTIONS;

  function handleSend() {
    if (loading) return;
    if (!input.trim()) {
      setEmptyWarning(true);
      return;
    }
    setEmptyWarning(false);
    const question = input;
    setInput('');
    void ask(question);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Portaled to document.body — mounting this fixed-position overlay under
  // Header.tsx's <header> (which has backdrop-filter: blur(10px) for the
  // sticky glass effect) would otherwise make it position:fixed relative to
  // the header's own 64px box instead of the viewport (backdrop-filter, like
  // transform/filter, creates a new containing block for fixed descendants
  // per the CSS spec) — squeezing/cutting off the modal exactly as reported.
  // Home.tsx's own copy has no such ancestor, which is why only the
  // header-opened one showed the bug even though it's the same component.
  // Portaling makes position:fixed behave identically (viewport-relative) no
  // matter which ancestor tree renders this component.
  return createPortal(
    <BottomSheet onClose={onClose} className="ai-modal">
        <h3>✦ AI에게 질문하기</h3>
        <p>
          {poseResult && technique
            ? `방금 "${technique.name}" 자세 분석 결과(${poseResult.overallScore}점)에 대해 궁금한 점을 물어보세요.`
            : technique
              ? `"${technique.name}${technique.koreanName && technique.koreanName !== technique.name ? ` · ${technique.koreanName}` : ''}" 기술에 대해 궁금한 점을 물어보세요.`
              : dayContext
                ? `"${dayContext.curriculum.title}" Day ${dayContext.day.day} (${dayContext.day.title})에 대해 궁금한 점을 물어보세요.`
                : fighterStyleContext
                  ? `"${fighterStyleContext.styleAnalysis.fighterName}" 스타일에 대해 궁금한 점을 물어보세요.`
                  : coach
                    ? '당신의 학습 기록을 기반으로 궁금한 점을 물어보세요.'
                    : '무술 기술에 대해 무엇이든 물어보세요.'}
        </p>

        <div className="ai-chat" ref={scrollRef}>
          {messages.length === 0 && !loading && (
            <div className="ai-chat__examples">
              {examples.map((q) => (
                <button key={q} className="ai-chat__example" onClick={() => void ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg--${m.role}`}>
              <div className="ai-msg__bubble">{m.text}</div>
            </div>
          ))}

          {loading && (
            <div className="ai-msg ai-msg--model">
              <div className="ai-msg__bubble ai-msg__bubble--loading">
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
              </div>
            </div>
          )}

          {error && (
            <div className="ai-error" role="alert">
              {error.message}
            </div>
          )}
        </div>

        {emptyWarning && <div className="ai-inline-warning">질문을 입력해주세요.</div>}

        <textarea
          placeholder="예: 이 기술을 상대할 때 가장 흔한 방어법이 뭐야?"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (emptyWarning) setEmptyWarning(false);
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus
        />

        <div className="modal-note">
          위험할 수 있는 기술은 전문 지도자의 감독과 안전한 훈련 환경에서 연습하세요. AI 답변은
          참고용이며, 앱에 등록된 실제 데이터를 우선 근거로 답변합니다.
        </div>

        <div className="modal-actions">
          {messages.length > 0 && (
            <button className="btn btn-ghost" onClick={clear} disabled={loading}>
              대화 지우기
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            닫기
          </button>
          <button className="btn btn-primary" onClick={handleSend} disabled={loading}>
            {loading ? '답변 생성 중…' : '질문 보내기'}
          </button>
        </div>
    </BottomSheet>,
    document.body
  );
}
