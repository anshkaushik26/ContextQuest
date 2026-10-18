import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { PublicPlayer, QuestionId, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Icon } from '../components/Icon';
import { useInspect } from '../components/Inspector';
import { Pinboard } from '../components/Pinboard';
import { Timeline } from '../components/Timeline';
import { Avatar, seatColor, SectionHead } from '../components/ui';
import { send } from '../net/store';
import './board-phase.css';

export function BoardPhase({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const inspect = useInspect();
  const [toast, setToast] = useState<string | null>(null);
  const flashError = (msg: string) => {
    setToast(msg);
    sfx.error();
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="bp">
      <SectionHead eyebrow="Reconstruct" title="What actually happened?">
        <button
          className="btn btn--sm btn--ghost"
          onClick={() => inspect({ items: view.private!.cards.map((card) => ({ card })), index: 0 })}
          data-testid="my-cards"
        >
          <Icon name="lock" size={14} /> My private cards
        </button>
      </SectionHead>

      <Pinboard view={view} size="board" />

      <section className="bp__section">
        <div className="bp__sechead">
          <div>
            <div className="eyebrow eyebrow--brass">Shared timeline</div>
            <h3 className="display">Put the six events in order</h3>
          </div>
          <span className="muted bp__secnote">Everyone edits the same timeline live. The coloured tags show which pinned clue mentions each event — tap one to read it. Use team chat to talk it over.</span>
        </div>
        <Timeline
          view={view}
          me={me}
          onMove={async (eventId, toIndex) => {
            const r = await send('timeline:move', { eventId, toIndex });
            if (!r.ok) flashError(r.error);
            return r.ok;
          }}
        />
      </section>

      <Verdict view={view} me={me} onError={flashError} />

      <AnimatePresence>
        {toast && (
          <motion.div className="bp__toast" role="alert" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Verdict({ view, me, onError }: { view: RoomView; me: PublicPlayer; onError: (m: string) => void }) {
  const v = view.verdict!;
  const questions = view.case!.questions;
  const players = new Map(view.players.map((p) => [p.id, p]));
  const answered = questions.every((q) => v.answers[q.id]);
  const signed = v.signatures.includes(me.id);
  const live = view.players.filter((p) => p.connected);

  const prevSigs = useRef(v.signatures.length);
  useEffect(() => {
    if (v.signatures.length > prevSigs.current) sfx.stamp();
    prevSigs.current = v.signatures.length;
  }, [v.signatures.length]);

  const set = async (qid: QuestionId, optionId: string) => {
    sfx.select();
    const r = await send('verdict:set', { questionId: qid, optionId });
    if (!r.ok) onError(r.error);
  };
  const sign = async () => {
    const r = await send('verdict:sign', { signed: !signed });
    if (!r.ok) onError(r.error);
  };

  return (
    <section className="bp__section verdict" aria-labelledby="verdict-h">
      <div className="bp__sechead">
        <div>
          <div className="eyebrow eyebrow--brass">The team’s verdict</div>
          <h3 id="verdict-h" className="display">
            One explanation, signed by all three
          </h3>
        </div>
        <span className="muted bp__secnote">Anyone can change an answer. Any change clears the signatures.</span>
      </div>

      <div className="verdict__qs">
        {questions.map((q, qi) => {
          const a = v.answers[q.id];
          const setter = a ? players.get(a.by) : undefined;
          return (
            <fieldset key={q.id} className="vq">
              <legend className="vq__prompt">
                <span className="vq__n display">{qi + 1}</span>
                {q.prompt}
              </legend>
              <div className="vq__opts">
                {q.options.map((o) => {
                  const on = a?.optionId === o.id;
                  return (
                    <button
                      key={o.id}
                      className={`vopt ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => set(q.id, o.id)}
                      style={on && setter ? { ['--pc' as string]: seatColor(setter.seat) } : undefined}
                      data-testid={`opt-${o.id}`}
                    >
                      <span className="vopt__radio" />
                      <span className="vopt__label">{o.label}</span>
                      {on && setter && (
                        <span className="vopt__by" title={`Chosen by ${setter.name}`}>
                          <Avatar player={setter} size={18} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="sigs">
        <div className="sigs__lines">
          {view.players.map((p) => {
            const s = v.signatures.includes(p.id);
            return (
              <div key={p.id} className={`sig ${s ? 'is-signed' : ''} ${p.connected ? '' : 'is-away'}`} style={{ ['--pc' as string]: seatColor(p.seat) }}>
                <div className="sig__line">
                  <AnimatePresence>
                    {s && (
                      <motion.span
                        className="sig__ink hand"
                        initial={{ clipPath: 'inset(0 100% 0 0)' }}
                        animate={{ clipPath: 'inset(0 0% 0 0)' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                      >
                        {p.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <span className="sig__label">
                  {p.name}
                  {!p.connected ? ' · away (not required)' : s ? ' · signed' : ''}
                </span>
              </div>
            );
          })}
        </div>
        <div className="sigs__action">
          <button
            className={`btn btn--lg ${signed ? 'btn--ghost' : 'btn--brass'}`}
            onClick={sign}
            disabled={!answered && !signed}
            data-testid="sign"
          >
            <Icon name="pen" /> {signed ? 'Withdraw my signature' : 'Sign the case file'}
          </button>
          <span className="muted">
            {!answered
              ? 'Answer all three questions to sign.'
              : `${v.signatures.length}/${live.length} signed — the case is filed when everyone connected has signed.`}
          </span>
        </div>
      </div>
    </section>
  );
}
