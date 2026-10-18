import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RevealedCard, RoomView, Seat } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { EvidenceCard } from './evidence/EvidenceCard';
import { useInspect } from './Inspector';
import { roleTitle, seatColor } from './ui';
import './pinboard.css';

interface Flight {
  r: RevealedCard;
  from: DOMRect;
  to: DOMRect;
  rot: number;
}

const ROT = [-2.2, 1.4, -0.8];

function visibleRect(selector: string): DOMRect | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/**
 * The shared evidence board. Cards arrive by server state; the flight is purely local
 * presentation and never gates game logic.
 */
export function Pinboard({ view, size = 'reveal' }: { view: RoomView; size?: 'reveal' | 'board' }) {
  const reduced = useReducedMotion();
  const inspect = useInspect();
  // Cards already on the board when this component mounted don't fly again.
  const [landed, setLanded] = useState<Set<string>>(() => new Set(view.revealed.map((r) => r.card.id)));
  const [flights, setFlights] = useState<Flight[]>([]);
  const [impact, setImpact] = useState<string | null>(null);
  const seen = useRef(new Set(view.revealed.map((r) => r.card.id)));
  const boardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const fresh = view.revealed.filter((r) => !seen.current.has(r.card.id));
    if (!fresh.length) return;
    const add: Flight[] = [];
    for (const r of fresh) {
      seen.current.add(r.card.id);
      const to = document.querySelector(`[data-slot="${r.seat}"] .pin-slot__target`)?.getBoundingClientRect();
      const from =
        (r.playerId === view.you && visibleRect(`[data-hand-card="${r.card.id}"] .ev`)) ||
        visibleRect(`[data-seat-anchor="${r.playerId}"] .avatar`) ||
        null;
      if (reduced || !to || !from || to.width === 0) {
        setLanded((s) => new Set(s).add(r.card.id));
        continue;
      }
      add.push({ r, from, to, rot: ROT[r.seat] });
    }
    if (add.length) {
      setFlights((f) => [...f, ...add]);
      sfx.whoosh();
    }
  }, [view.revealed, view.you, reduced]);

  const land = (id: string) => {
    setFlights((f) => f.filter((x) => x.r.card.id !== id));
    setLanded((s) => new Set(s).add(id));
    setImpact(id);
    sfx.pin();
    setTimeout(() => setImpact((x) => (x === id ? null : x)), 500);
  };

  const allLanded = view.revealed.length === 3 && view.revealed.every((r) => landed.has(r.card.id));
  const items = view.revealed
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((r) => {
      const p = view.players.find((x) => x.id === r.playerId);
      return { card: r.card, sharedBy: p ? { name: p.name, seat: p.seat } : null };
    });

  return (
    <div ref={boardRef} className={`pinboard pinboard--${size} ${impact ? 'is-impact' : ''}`} data-testid="pinboard">
      <div className="pinboard__felt" aria-hidden="true" />
      <div className="pinboard__label eyebrow">
        Shared evidence board · {view.revealed.length}/3 pinned
      </div>
      <div className="pinboard__slots">
        {([0, 1, 2] as Seat[]).map((seat) => {
          const p = view.players.find((x) => x.seat === seat);
          const r = view.revealed.find((x) => x.seat === seat);
          const isLanded = r && landed.has(r.card.id);
          return (
            <div key={seat} className="pin-slot" data-slot={seat} style={{ ['--pc' as string]: seatColor(seat), ['--rot' as string]: `${ROT[seat]}deg` }}>
              <div className="pin-slot__target">
                <AnimatePresence>
                  {r && isLanded ? (
                    <motion.button
                      key={r.card.id}
                      className={`pin-slot__card ${impact === r.card.id ? 'is-hit' : ''}`}
                      initial={false}
                      onClick={() => inspect({ items, index: items.findIndex((x) => x.card.id === r.card.id) })}
                      aria-label={`Read ${r.card.title}, shared by ${p?.name}`}
                      data-testid={`pinned-${r.card.id}`}
                    >
                      <EvidenceCard card={r.card} size="board" sharedBy={p ? { name: p.name, seat } : null} />
                      <motion.svg
                        className="pin"
                        viewBox="0 0 30 40"
                        initial={{ y: -40, opacity: 0, scale: 1.6 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.05 }}
                        aria-hidden="true"
                      >
                        <ellipse cx="17" cy="36" rx="7" ry="2.4" fill="rgba(0,0,0,.35)" />
                        <path d="M15 20 L15 36" stroke="#9aa0ad" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="15" cy="12" r="10" fill="var(--pc)" />
                        <circle cx="12" cy="9" r="3.4" fill="#fff" opacity="0.55" />
                      </motion.svg>
                      {r.auto && <span className="pin-slot__auto">pulled at time-up</span>}
                    </motion.button>
                  ) : r ? (
                    <div className="pin-slot__incoming" aria-live="polite">
                      Incoming…
                    </div>
                  ) : (
                    <div className={`pin-slot__empty ${p?.selecting ? 'is-live' : ''}`}>
                      {p?.selecting ? (
                        <>
                          <span className="live-dot" /> {p.name} is choosing…
                        </>
                      ) : (
                        <>Awaiting {p ? `${p.name}’s` : 'their'} evidence</>
                      )}
                    </div>
                  )}
                </AnimatePresence>
              </div>
              <div className="pin-slot__who">
                <span className="pin-slot__dot" />
                {p?.name ?? '—'} · {roleTitle(view, p?.roleId ?? null)}
              </div>
            </div>
          );
        })}
      </div>
      {allLanded && <Threads boardRef={boardRef} />}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="flights" aria-hidden="true">
            {flights.map((f) => (
              <FlyingCard key={f.r.card.id} flight={f} onLand={() => land(f.r.card.id)} sharedBy={view.players.find((p) => p.id === f.r.playerId)} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function FlyingCard({ flight, onLand, sharedBy }: { flight: Flight; onLand: () => void; sharedBy?: { name: string; seat: number } }) {
  const { from, to, rot } = flight;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s0 = Math.max(0.12, from.width / to.width);
  const done = useRef(false);
  const landRef = useRef(onLand);
  landRef.current = onLand;
  useEffect(() => {
    // Safety: never leave a card stuck mid-air (e.g. tab hidden during the animation).
    const t = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        landRef.current();
      }
    }, 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div
      className="flight"
      style={{ left: to.left, top: to.top, width: to.width }}
      initial={{ x: dx, y: dy, scale: s0, rotate: 0, rotateX: 0 }}
      animate={{
        x: [dx, dx, dx * 0.42, 0],
        y: [dy, dy - 60, dy * 0.42 - 130, 0],
        scale: [s0, s0 * 1.08, 1.12, 1],
        rotate: [0, -5, 6, rot],
        rotateX: [0, 16, 8, 0],
        boxShadow: [
          '0 10px 20px -8px rgba(0,0,0,.6)',
          '0 50px 70px -20px rgba(0,0,0,.85)',
          '0 70px 90px -24px rgba(0,0,0,.8)',
          '0 6px 14px -4px rgba(0,0,0,.5)',
        ],
      }}
      transition={{ duration: 1.15, times: [0, 0.2, 0.62, 1], ease: [0.45, 0, 0.2, 1] }}
      onAnimationComplete={() => {
        if (!done.current) {
          done.current = true;
          onLand();
        }
      }}
    >
      <EvidenceCard card={flight.r.card} size="board" sharedBy={sharedBy ?? null} />
    </motion.div>
  );
}

/** Red thread joining the three pins once the board is complete. */
function Threads({ boardRef }: { boardRef: React.RefObject<HTMLDivElement | null> }) {
  const [d, setD] = useState<string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const b = boardRef.current?.getBoundingClientRect();
      if (!b) return;
      const pins = [...(boardRef.current?.querySelectorAll('.pin') ?? [])].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left + r.width / 2 - b.left, r.top + r.height * 0.3 - b.top] as const;
      });
      if (pins.length < 3 || pins.some(([x]) => x === 0)) return;
      // Pins on one row: sagging catenary-ish curves. Stacked (mobile): skip.
      if (Math.abs(pins[0][1] - pins[2][1]) > 80) return setD(null);
      const seg = (a: readonly [number, number], c: readonly [number, number]) =>
        `M${a[0]} ${a[1]} Q${(a[0] + c[0]) / 2} ${Math.max(a[1], c[1]) + 46} ${c[0]} ${c[1]}`;
      setD(`${seg(pins[0], pins[1])} ${seg(pins[1], pins[2])}`);
    };
    const t = setTimeout(measure, 450);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [boardRef]);
  if (!d) return null;
  return (
    <svg className="threads" aria-hidden="true">
      <motion.path d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
    </svg>
  );
}
