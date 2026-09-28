import { useCallback, useState } from 'react';
import type { ChatMessage } from './types';

// Plain module-scoped Map, not localStorage: conversations only need to
// survive opening/closing the modal within the current app run (per the
// spec — no persistence required across app restarts), and it resets
// automatically whenever the renderer reloads.
const sessions = new Map<string, ChatMessage[]>();

// How many past turns (user+model pairs) are actually sent to the AI on each
// new question. The UI still shows the full conversation — this only caps
// what gets re-sent as tokens on every request so a long-running chat on one
// technique doesn't grow unbounded and burn through the free-tier quota.
const MAX_HISTORY_TURNS = 6;

export function trimHistoryForRequest(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_HISTORY_TURNS * 2);
}

export function useChatSession(sessionKey: string) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => sessions.get(sessionKey) ?? []);

  const mutate = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        sessions.set(sessionKey, next);
        return next;
      });
    },
    [sessionKey]
  );

  const clear = useCallback(() => {
    sessions.delete(sessionKey);
    setMessages([]);
  }, [sessionKey]);

  return { messages, mutate, clear };
}
