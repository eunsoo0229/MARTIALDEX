import { useCallback, useEffect, useState } from 'react';
import { buildMyStyleDataSummary } from './dataAggregator';
import { computeMyStyleAnalysis, getCachedMyStyleAnalysis } from './styleAnalysisEngine';
import type { MyStyleAnalysis, MyStyleDataSummary } from './types';

const SUMMARY_EVENTS = [
  'martialdex:pose-records-updated',
  'martialdex:training-history-updated',
  'martialdex:sparring-sessions-updated',
  'martialdex:skill-overrides-updated',
  'storage',
];

function useSynced<T>(read: () => T, events: string[]): T {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const onUpdate = () => setValue(read());
    for (const e of events) window.addEventListener(e, onUpdate);
    return () => {
      for (const e of events) window.removeEventListener(e, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

// Mirrors the AI Coach / Fighter Style pattern: the AI narrative is never
// fetched silently — it's cached and only regenerated when the user presses
// "다시 분석" (or analyzes for the first time). The real-data summary itself
// stays live, so the page can immediately tell the user their analysis is
// stale ("새 스파링 기록이 있습니다") without spending another AI call.
export function useMyStyle() {
  const summary = useSynced<MyStyleDataSummary>(buildMyStyleDataSummary, SUMMARY_EVENTS);
  const [analysis, setAnalysis] = useState<MyStyleAnalysis | null>(() => getCachedMyStyleAnalysis());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onUpdate = () => setAnalysis(getCachedMyStyleAnalysis());
    window.addEventListener('martialdex:my-style-updated', onUpdate);
    return () => window.removeEventListener('martialdex:my-style-updated', onUpdate);
  }, []);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const result = await computeMyStyleAnalysis(force);
      setAnalysis(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const isStale = !!analysis && analysis.inputHash !== summary.inputHash;

  return { summary, analysis, loading, isStale, refresh };
}
