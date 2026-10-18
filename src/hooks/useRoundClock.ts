import { useEffect, useState } from 'react';
import type { RoundInfo } from '../../shared/protocol';
import { serverNow } from '../net/clock';

export type ClockState = 'idle' | 'running' | 'closed';

export interface RoundClock {
  state: ClockState;
  /** Time spent on the case so far (frozen once the verdict is filed). */
  elapsed: number;
}

/** The stopwatch counts up from the server's start time; it stops when the case is filed. */
export function computeClock(round: RoundInfo | null, now: number): RoundClock {
  if (!round) return { state: 'idle', elapsed: 0 };
  const end = round.closedAt ?? now;
  return { state: round.closedAt ? 'closed' : 'running', elapsed: Math.max(0, end - round.startedAt) };
}

export function useRoundClock(round: RoundInfo | null): RoundClock {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!round || round.closedAt) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [round]);
  return computeClock(round, round ? now : 0);
}

export function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
