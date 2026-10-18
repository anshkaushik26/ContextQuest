import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { PublicPlayer, RoomView, Seat } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Icon } from '../components/Icon';
import { Stopwatch } from '../components/Stopwatch';
import { Avatar, seatColor } from '../components/ui';
import { send } from '../net/store';
import './lobby.css';

export function Lobby({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invite = `${location.origin}/r/${view.code}`;
  const isHost = me.isHost;
  const allReady = view.players.length === 3 && view.players.every((p) => p.ready && p.connected);
  const host = view.players.find((p) => p.isHost);

  const count = useRef(view.players.length);
  useEffect(() => {
    if (view.players.length > count.current) sfx.join();
    count.current = view.players.length;
  }, [view.players.length]);
  const readyCount = view.players.filter((p) => p.ready).length;
  const prevReady = useRef(readyCount);
  useEffect(() => {
    if (readyCount === 3 && prevReady.current < 3) sfx.chime();
    prevReady.current = readyCount;
  }, [readyCount]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const start = async () => {
    setBusy(true);
    const r = await send('game:start');
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      sfx.error();
    }
  };

  return (
    <div className="lobby">
      <section className="lobby__head">
        <div>
          <div className="eyebrow eyebrow--brass">Case room</div>
          <div className="lobby__code" aria-label={`Room code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((ch, i) => (
              <motion.span
                key={i}
                className="display"
                initial={{ rotateX: -90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 220, damping: 18 }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
          <div className="lobby__invite">
            <code>{invite}</code>
            <button className="btn btn--sm btn--live" onClick={copy} data-testid="copy-invite">
              <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy invite link'}
            </button>
          </div>
          <p className="lobby__lede">
            Share the code or link with two friends. Everyone — the host included — plays a witness with their own private evidence.
          </p>
        </div>
        <div className="lobby__watch">
          <Stopwatch round={null} size="md" />
          <span className="eyebrow">Stopwatch starts when the case opens</span>
        </div>
      </section>

      <CasePicker isHost={isHost} />

      <section className="lobby__seats" aria-label="Investigators">
        {([0, 1, 2] as Seat[]).map((seat) => {
          const p = view.players.find((x) => x.seat === seat);
          return (
            <AnimatePresence key={seat} mode="wait">
              {p ? <Dossier key={p.id} p={p} me={me} /> : <EmptySeat key={`e${seat}`} seat={seat} />}
            </AnimatePresence>
          );
        })}
      </section>

      <section className="lobby__go">
        {isHost ? (
          <>
            <button className="btn btn--brass btn--lg lobby__start" disabled={!allReady || busy} onClick={start} data-testid="start-game">
              <Icon name="crown" /> Open the case file
            </button>
            <span className="muted">
              {view.players.length < 3
                ? `Waiting for ${3 - view.players.length} more investigator${view.players.length === 2 ? '' : 's'}…`
                : allReady
                  ? 'Everyone is ready. The stopwatch starts the moment you open it.'
                  : 'Waiting for everyone to mark themselves ready.'}
            </span>
          </>
        ) : (
          <span className="lobby__wait">
            <span className="live-dot" />
            {allReady ? `Waiting for ${host?.name ?? 'the host'} to open the case…` : 'The host opens the case once all three are ready.'}
          </span>
        )}
        {error && (
          <p className="home__error" role="alert">
            {error}
          </p>
        )}
      </section>

      <ol className="lobby__rules">
        <li>
          <b>Read</b> your three private clues and <b>lock a theory</b> on your own.
        </li>
        <li>
          <b>Reveal exactly one</b> card to the shared board. It can’t be taken back.
        </li>
        <li>
          <b>Rebuild the timeline</b> together — talk it through in team chat.
        </li>
        <li>
          <b>All three sign</b> — then the truth comes out.
        </li>
      </ol>
    </div>
  );
}

const CASES = [
  { n: '001', title: 'The 11-Minute Blackout', blurb: 'A college fest stage goes dark for eleven minutes. Sabotage, failure, or a fix gone wrong?', ready: true },
  { n: '002', title: 'The Missing Delivery', blurb: 'The app says “delivered”. Nobody got the parcel. Three people saw part of its trip.', ready: false },
  { n: '003', title: 'The Swapped Trophy', blurb: 'The winning team’s trophy turns up in the wrong hands the morning after prize night.', ready: false },
  {
    n: 'custom',
    title: 'Custom Case',
    blurb: 'Write your own mystery: clues, timeline and answer. We check it’s solvable before you play.',
    ready: false,
  },
];

function CasePicker({ isHost }: { isHost: boolean }) {
  return (
    <section className="cases" aria-labelledby="cases-h">
      <div className="cases__head">
        <h3 id="cases-h" className="eyebrow eyebrow--brass">
          Choose your case
        </h3>
        <span className="muted cases__note">{isHost ? 'More cases are on the way.' : 'The host picks the case.'}</span>
      </div>
      <div className="cases__list" role="radiogroup" aria-label="Case">
        {CASES.map((c) => (
          <button
            key={c.n}
            className={`case ${c.ready ? 'is-selected' : 'is-locked'} ${c.n === 'custom' ? 'case--custom' : ''}`}
            role="radio"
            aria-checked={c.ready}
            aria-disabled={!c.ready}
            disabled={!c.ready || !isHost}
            title={c.ready ? 'Selected' : 'Coming soon'}
            data-testid={`case-${c.n}`}
          >
            <span className="case__top">
              <span className="case__num">{c.n === 'custom' ? 'Your own' : `Case ${c.n}`}</span>
              {c.ready ? (
                <span className="case__badge case__badge--on">
                  <Icon name="check" size={12} stroke={2.4} /> Selected
                </span>
              ) : (
                <span className="case__badge">
                  <Icon name="lock" size={12} /> Coming soon
                </span>
              )}
            </span>
            <span className="case__title display">
              {c.n === 'custom' && <Icon name="pen" size={15} />} {c.title}
            </span>
            <span className="case__blurb">{c.blurb}</span>
            <span className="case__meta">{c.ready ? '3 players · about 5 min' : 'Upcoming'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EmptySeat({ seat }: { seat: Seat }) {
  return (
    <motion.div className="dossier dossier--empty" style={{ ['--pc' as string]: seatColor(seat) }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <span className="dossier__tab">Seat {seat + 1}</span>
      <div className="dossier__open">
        <span className="live-dot" />
        Awaiting investigator
      </div>
    </motion.div>
  );
}

function Dossier({ p, me }: { p: PublicPlayer; me: PublicPlayer }) {
  const mine = p.id === me.id;
  const [name, setName] = useState(p.name);
  useEffect(() => setName(p.name), [p.name]);
  const commit = () => {
    if (name.trim() && name.trim() !== p.name) void send('player:rename', { name: name.trim() });
    else setName(p.name);
  };
  return (
    <motion.div
      className={`dossier ${mine ? 'is-mine' : ''} ${p.ready ? 'is-ready' : ''}`}
      style={{ ['--pc' as string]: seatColor(p.seat) }}
      initial={{ opacity: 0, y: 24, rotate: -2 }}
      animate={{ opacity: p.connected ? 1 : 0.55, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      data-testid={`seat-${p.seat}`}
    >
      <span className="dossier__tab">Seat {p.seat + 1}</span>
      <div className="dossier__who">
        <Avatar player={p} size={52} ring={mine} />
        <div className="dossier__id">
          {mine ? (
            <input
              className="dossier__name display"
              value={name}
              maxLength={18}
              aria-label="Your name"
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            />
          ) : (
            <span className="dossier__name display">{p.name}</span>
          )}
          <span className="dossier__meta">
            {p.isHost && <span className="seat__host">host · plays too</span>}
            {mine && <span className="seat__you">you</span>}
            {p.bot && <span className="dossier__demo">demo player</span>}
            {!p.connected && <span className="dossier__away">reconnecting…</span>}
          </span>
        </div>
      </div>
      {mine ? (
        <button
          className={`btn ${p.ready ? 'btn--live' : 'btn--brass'} dossier__ready`}
          onClick={() => {
            sfx.select();
            void send('player:ready', { ready: !p.ready });
          }}
          aria-pressed={p.ready}
          data-testid="ready-toggle"
        >
          <Icon name={p.ready ? 'check' : 'lock'} size={16} /> {p.ready ? 'Ready — tap to undo' : 'I’m ready'}
        </button>
      ) : (
        <div className={`dossier__state ${p.ready ? 'is-on' : ''}`}>{p.ready ? 'Ready' : 'Not ready yet'}</div>
      )}
      <AnimatePresence>
        {p.ready && (
          <motion.span
            className="stamp dossier__stamp"
            initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
            animate={{ scale: 1, opacity: 0.9, rotate: -9 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          >
            Ready
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
