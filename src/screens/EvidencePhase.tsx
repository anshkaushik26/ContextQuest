import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { ConfidenceId, PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Hand } from '../components/Hand';
import { Icon } from '../components/Icon';
import { SectionHead } from '../components/ui';
import { send } from '../net/store';
import './evidence-phase.css';

const HYP_ICON: Record<string, string> = { 'h-sabotage': 'flame', 'h-failure': 'power', 'h-repair': 'pen', 'h-system': 'notice' };

export function EvidencePhase({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const priv = view.private!;
  const c = view.case!;
  const [hyp, setHyp] = useState<string | null>(null);
  const [conf, setConf] = useState<ConfidenceId>('fairly');
  const [error, setError] = useState<string | null>(null);
  const locked = priv.theory;
  const lockedCount = view.players.filter((p) => p.theoryLocked).length;

  const lock = async () => {
    if (!hyp) return;
    const r = await send('theory:lock', { hypothesisId: hyp, confidence: conf });
    if (r.ok) sfx.lock();
    else {
      setError(r.error);
      sfx.error();
    }
  };

  return (
    <div className="evp">
      <SectionHead eyebrow={`Private evidence · ${priv.role.title}`} title="What did you see?">
        <span className="chip">
          <Icon name="lock" size={13} /> Only you can see these
        </span>
      </SectionHead>
      <p className="evp__lede">
        {priv.role.post}. Read your three clues (tap any card to zoom in), then pick your first guess on your own. Nobody sees it until the end.
      </p>

      <Hand cards={priv.cards} />

      <section className={`theory panel ${locked ? 'is-locked' : ''}`} aria-labelledby="theory-h">
        <div className="theory__head">
          <div>
            <div className="eyebrow eyebrow--brass">Your first theory</div>
            <h3 id="theory-h" className="display theory__q">
              Your first guess: what caused the blackout?
            </h3>
          </div>
          <span className="chip">
            {lockedCount}/3 locked {me.theoryLocked ? '' : '· yours is still open'}
          </span>
        </div>

        <div className="theory__options" role="radiogroup" aria-label="Theory">
          {c.hypotheses.map((h) => {
            const chosen = (locked ? locked.hypothesisId : hyp) === h.id;
            return (
              <button
                key={h.id}
                role="radio"
                aria-checked={chosen}
                disabled={!!locked}
                className={`hyp ${chosen ? 'is-chosen' : ''}`}
                onClick={() => {
                  sfx.select();
                  setHyp(h.id);
                }}
                data-testid={`hyp-${h.id}`}
              >
                <span className="hyp__icon">
                  <Icon name={HYP_ICON[h.id]} size={20} />
                </span>
                <span className="hyp__title display">{h.title}</span>
                <span className="hyp__blurb">{h.blurb}</span>
              </button>
            );
          })}
        </div>

        <div className="theory__foot">
          <div className="conf" role="radiogroup" aria-label="Confidence">
            <span className="eyebrow">Confidence</span>
            {c.confidences.map((cf) => (
              <button
                key={cf.id}
                role="radio"
                aria-checked={(locked?.confidence ?? conf) === cf.id}
                disabled={!!locked}
                className={`conf__opt ${(locked?.confidence ?? conf) === cf.id ? 'is-on' : ''}`}
                onClick={() => setConf(cf.id)}
              >
                {cf.label}
              </button>
            ))}
          </div>
          {!locked ? (
            <button className="btn btn--brass btn--lg" disabled={!hyp} onClick={lock} data-testid="lock-theory">
              <Icon name="lock" /> Lock my theory
            </button>
          ) : (
            <span className="theory__wait">
              <span className="live-dot" /> {lockedCount < 3 ? `Waiting for ${3 - lockedCount} more…` : 'Opening the reveal…'}
            </span>
          )}
        </div>
        {error && <p className="home__error">{error}</p>}

        <AnimatePresence>
          {locked && (
            <motion.div
              className="theory__stamp stamp"
              initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 0.92, rotate: -8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            >
              Locked · sealed until the truth
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
