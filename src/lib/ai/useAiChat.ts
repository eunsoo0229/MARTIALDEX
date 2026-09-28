import { useCallback, useRef, useState } from 'react';
import { aiProvider } from './provider';
import { trimHistoryForRequest, useChatSession } from './chatStore';
import type { AiErrorCode, ChatMessage } from './types';
import { recordAiQuestion } from '../aiHistory/service';
import type { AiHistoryFeature } from '../aiHistory/types';

export interface UseAiChatOptions {
  sessionKey: string;
  systemInstruction: string;
  contextText: string;
  /** AI 질문 기록에 남길 메타데이터 — 없으면(예: 향후 다른 AI 채팅 화면) 그냥 기록하지 않는다. */
  historyMeta?: {
    feature: AiHistoryFeature;
    relatedTechniqueId?: string | null;
    relatedCurriculumId?: string | null;
  };
}

export interface AiChatError {
  code: AiErrorCode;
  message: string;
}

// If this exact question was already asked earlier in the same session,
// return the answer that followed it instead of making a fresh request —
// covers both "sent the same thing twice by accident" and "scrolled up and
// asked it again", without spending another free-tier call either way.
function findCachedAnswer(messages: ChatMessage[], question: string): string | null {
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'user' && messages[i].text.trim() === question) {
      const next = messages[i + 1];
      if (next?.role === 'model') return next.text;
    }
  }
  return null;
}

export function useAiChat({ sessionKey, systemInstruction, contextText, historyMeta }: UseAiChatOptions) {
  const { messages, mutate, clear } = useChatSession(sessionKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiChatError | null>(null);
  const inFlightRef = useRef(false);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || inFlightRef.current) return;

      const cached = findCachedAnswer(messages, question);
      if (cached) {
        setError(null);
        mutate((prev) => [...prev, { role: 'user', text: question }, { role: 'model', text: cached }]);
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      const history = trimHistoryForRequest(messages);
      mutate((prev) => [...prev, { role: 'user', text: question }]);

      const result = await aiProvider.ask({ systemInstruction, contextText, history, question });

      if (result.ok) {
        mutate((prev) => [...prev, { role: 'model', text: result.text }]);
        if (historyMeta) {
          void recordAiQuestion({
            feature: historyMeta.feature,
            question,
            answer: result.text,
            relatedTechniqueId: historyMeta.relatedTechniqueId,
            relatedCurriculumId: historyMeta.relatedCurriculumId,
          });
        }
      } else {
        setError({ code: result.code, message: result.message });
      }
      setLoading(false);
      inFlightRef.current = false;
    },
    [messages, mutate, systemInstruction, contextText, historyMeta]
  );

  const clearAll = useCallback(() => {
    setError(null);
    clear();
  }, [clear]);

  return { messages, loading, error, ask, clear: clearAll };
}
