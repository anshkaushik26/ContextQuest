import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { send } from '../net/store';
import { Icon } from './Icon';
import './demo-dock.css';

/** What the host's "next step" will do right now, or null when they're waiting on others. */
function nextStep(view: RoomView, me: PublicPlayer): string | null {
  switch (view.phase) {
    case 'lobby':
      return me.ready ? 'Open the case' : 'Get ready';
    case 'intro':
      return me.introDone ? null : 'Skip the briefing';
    case 'evidence':
      return me.theoryLocked ? null : 'Lock my theory';
    case 'reveal':
      return me.revealedCardId ? null : 'Pin my card';
    case 'board': {
      const answered = view.case!.questions.every((q) => view.verdict?.answers[q.id]);
      if (!answered) return 'Fill timeline & verdict';
      return me.signed ? null : 'Sign the case file';
    }
    default:
      return null;
  }
}

/** Host-only control, bottom-right: fills empty seats with demo players and steps through the game. */
export function DemoDock({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!me.isHost || view.phase === 'truth') return null;

  const run = async (event: 'demo:start' | 'demo:stop' | 'demo:step') => {
    setBusy(true);
    setErr(null);
    const r = await send(event);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      sfx.error();
    } else sfx.select();
  };

  if (!view.demo) {
    if (view.phase !== 'lobby' || view.players.length >= 3) return null;
    return (
      <div className="demo-dock">
        <button className="demo-dock__start" onClick={() => run('demo:start')} disabled={busy} title="Fill the empty seats with demo players and run the game on your own" data-testid="demo-start">
          <Icon name="spark" size={14} /> Demo mode
        </button>
      </div>
    );
  }

  const label = nextStep(view, me);
  const waiting = view.phase === 'reveal' ? 'Demo players are pinning…' : 'Demo players are thinking…';
  return (
    <div className={`demo-dock ${view.phase === 'board' ? 'has-chat' : ''}`}>
      <motion.div className="demo-dock__panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} role="group" aria-label="Demo controls">
        <div className="demo-dock__head">
          <span className="demo-dock__tag">Demo mode</span>
          {view.phase === 'lobby' && (
            <button className="demo-dock__end" onClick={() => run('demo:stop')} disabled={busy} title="Remove demo players and reopen the seats">
              End demo
            </button>
          )}
        </div>
        <AnimatePresence mode="wait">
          {label ? (
            <motion.button
              key={label}
              className="demo-dock__next"
              onClick={() => run('demo:step')}
              disabled={busy}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              data-testid="demo-step"
            >
              {label} <Icon name="right" size={14} />
            </motion.button>
          ) : (
            <motion.span key="wait" className="demo-dock__wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="live-dot" /> {waiting}
            </motion.span>
          )}
        </AnimatePresence>
        {err && <span className="demo-dock__err">{err}</span>}
      </motion.div>
    </div>
  );
}
