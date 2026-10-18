import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Hand } from '../components/Hand';
import { Icon } from '../components/Icon';
import { Pinboard } from '../components/Pinboard';
import { SectionHead } from '../components/ui';
import { send, signal } from '../net/store';
import './reveal-phase.css';

export function RevealPhase({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const priv = view.private!;
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revealed = me.revealedCardId;
  const pinned = view.revealed.length;

  // Live presence: teammates see that you're choosing, never which card.
  useEffect(() => {
    if (!revealed) signal('reveal:selecting', { on: !!selected });
  }, [selected, revealed]);
  useEffect(() => () => signal('reveal:selecting', { on: false }), []);

  const card = priv.cards.find((c) => c.id === selected);

  const reveal = async () => {
    if (!selected || busy) return;
    setBusy(true);
    // Bring the board into view first so the card's flight lands where you can see it.
    const board = document.querySelector('[data-testid=pinboard]');
    const top = board?.getBoundingClientRect().top ?? 0;
    if (board && (top < 0 || top > window.innerHeight * 0.4)) {
      board.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await new Promise((r) => setTimeout(r, 420));
    }
    const r = await send('reveal:card', { cardId: selected });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      sfx.error();
    } else setSelected(null);
  };

  return (
    <div className="rvp">
      <SectionHead eyebrow="The one-card reveal" title={revealed ? 'Your evidence is on the board' : 'Share exactly one clue'}>
        <span className="chip">{pinned}/3 pinned</span>
      </SectionHead>

      <Pinboard view={view} size="reveal" />

      <div className="rvp__hand">
        <div className="rvp__handhead">
          <div className="eyebrow eyebrow--brass">Your private hand</div>
          <p className="muted">
            {revealed
              ? 'Your other two cards stay private. You can still read them — and talk about them.'
              : 'Choose the card you think the team most needs. Once it’s pinned, it can’t be replaced or withdrawn.'}
          </p>
        </div>
        <Hand
          cards={priv.cards}
          selectable={!revealed}
          locked={!!revealed}
          selectedId={selected}
          goneId={revealed}
          onSelect={(id) => setSelected((s) => (s === id ? null : id))}
        />
      </div>

      <AnimatePresence>
        {card && !revealed && (
          <motion.div
            className="rvp__confirm panel panel--brass"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            role="dialog"
            aria-label="Confirm reveal"
          >
            <div>
              <div className="eyebrow">Pin to the shared board?</div>
              <b className="display rvp__ctitle">
                {card.code} · {card.title}
              </b>
              <span className="muted">All three investigators will see it. This is your only reveal.</span>
            </div>
            <div className="rvp__cbtns">
              <button className="btn btn--ghost" onClick={() => setSelected(null)}>
                Keep looking
              </button>
              <button className="btn btn--brass btn--lg" onClick={reveal} disabled={busy} data-testid="confirm-reveal">
                <Icon name="pin" /> Pin it — no take-backs
              </button>
            </div>
            {error && <p className="home__error">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
