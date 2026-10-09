import { formatClock, viewAt } from '../../lib/gymLive/timeline';
import type { LiveSession } from '../../lib/gymLive/types';

const PHASE_LABEL: Record<string, string> = {
  ready: '준비',
  work: '훈련',
  rest: '휴식',
  paused: '일시정지',
  done: '종료',
};

/** Big set/round + remaining time, computed from the session anchor at `now` (server time). */
export default function LiveTimer({ session, now, compact = false }: { session: LiveSession; now: number; compact?: boolean }) {
  const v = viewAt(session, now);
  const unit = session.kind === 'sparring' ? 'ROUND' : 'SET';
  const phaseKey = v.phase === 'paused' ? 'paused' : v.phase;
  const label = session.kind === 'sparring' && v.phase === 'work' ? 'SPARRING' : PHASE_LABEL[phaseKey];
  return (
    <div className={`live-timer live-timer--${phaseKey}${compact ? ' live-timer--compact' : ''}`} data-testid="live-timer">
      <div className="live-timer__set" data-testid="live-timer-set">
        {unit} {v.setIndex + 1} / {v.totalSets}
      </div>
      <div className="live-timer__clock" data-testid="live-timer-clock">
        {formatClock(v.remainingMs)}
      </div>
      <div className="live-timer__phase" data-testid="live-timer-phase">
        {label}
        {v.phase === 'paused' && v.underlyingPhase ? ` (${PHASE_LABEL[v.underlyingPhase]})` : ''}
      </div>
      {!compact && (v.phase === 'work' || v.phase === 'rest' || v.phase === 'paused') && (
        <div className="live-timer__next">
          다음{' '}
          {v.next.phase === 'done' ? '종료' : `${v.next.phase === 'rest' ? '휴식' : session.kind === 'sparring' ? '라운드' : '훈련'} ${formatClock(v.next.durationMs)}`}
        </div>
      )}
    </div>
  );
}
