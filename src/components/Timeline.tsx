import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventId, PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Icon } from './Icon';
import { useInspect } from './Inspector';
import { Avatar, seatColor } from './ui';
import { send, signal } from '../net/store';
import { useChat } from './Chat';
import './timeline.css';

interface Drag {
  id: EventId;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  grabDX: number;
  grabDY: number;
  w: number;
  h: number;
  centers: { x: number; y: number }[];
}

function useVertical() {
  const q = '(max-width: 1100px)';
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}

const move = <T,>(arr: T[], from: number, to: number) => {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
};

export function Timeline({ view, me, onMove }: { view: RoomView; me: PublicPlayer; onMove: (id: EventId, to: number) => Promise<boolean> }) {
  const tl = view.timeline!;
  const events = view.case!.events;
  const vertical = useVertical();
  const inspect = useInspect();
  const chat = useChat();
  const listRef = useRef<HTMLOListElement>(null);

  // Optimistic order until the server confirms a newer version.
  const [optimistic, setOptimistic] = useState<{ order: EventId[]; base: number } | null>(null);
  useEffect(() => {
    if (optimistic && tl.version > optimistic.base) setOptimistic(null);
  }, [tl.version, optimistic]);
  const serverOrder = optimistic?.order ?? tl.order;

  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<EventId | null>(null);
  const [flash, setFlash] = useState<{ id: EventId; by: string; seq: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const justDragged = useRef(false);

  const order = drag?.active && preview !== null ? move(serverOrder, serverOrder.indexOf(drag.id), preview) : serverOrder;

  // Flash tiles moved by teammates.
  const lastSeq = useRef(tl.lastMove?.seq ?? 0);
  useEffect(() => {
    const lm = tl.lastMove;
    if (!lm || lm.seq === lastSeq.current) return;
    lastSeq.current = lm.seq;
    if (lm.by !== me.id) {
      sfx.place();
      setFlash({ id: lm.eventId, by: lm.by, seq: lm.seq });
      const t = setTimeout(() => setFlash((f) => (f?.seq === lm.seq ? null : f)), 1800);
      return () => clearTimeout(t);
    }
  }, [tl.lastMove, me.id]);

  const heldBy = (id: EventId) => {
    const h = tl.holds[id];
    return h && h !== me.id ? view.players.find((p) => p.id === h) : undefined;
  };

  const commit = async (id: EventId, to: number) => {
    const from = serverOrder.indexOf(id);
    if (from === to) return;
    setOptimistic({ order: move(serverOrder, from, to), base: tl.version });
    sfx.place();
    const ok = await onMove(id, to);
    if (!ok) setOptimistic(null);
  };

  const startPointer = (e: React.PointerEvent, id: EventId) => {
    if (e.button !== 0 || heldBy(id)) return;
    const fromHandle = (e.target as HTMLElement).closest('[data-grip]');
    if ((e.target as HTMLElement).closest('button:not([data-grip])')) return;
    // On touch, only the grip starts a drag so the page can still scroll.
    if (e.pointerType !== 'mouse' && !fromHandle) return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
    const centers = items.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      grabDX: e.clientX - el.left,
      grabDY: e.clientY - el.top,
      w: el.width,
      h: el.height,
      centers,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.active && dist < 6) return;
    if (!drag.active) {
      setDrag({ ...drag, active: true });
      setPicked(null);
      signal('timeline:hold', { eventId: drag.id });
      sfx.select();
    }
    setGhost({ x: e.clientX - drag.grabDX, y: e.clientY - drag.grabDY });
    // Nearest slot by axis.
    let best = 0;
    let bestD = Infinity;
    drag.centers.forEach((c, i) => {
      const d = vertical ? Math.abs(c.y - e.clientY) : Math.abs(c.x - e.clientX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setPreview(best);
  };

  const endPointer = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    setGhost(null);
    setPreview(null);
    if (d.active) {
      justDragged.current = true;
      signal('timeline:hold', { eventId: null });
      if (preview !== null) void commit(d.id, preview);
    }
  };

  const tapTile = (id: EventId) => {
    if (heldBy(id)) return;
    if (picked && picked !== id) {
      void commit(picked, serverOrder.indexOf(id));
      setPicked(null);
      setNote(null);
      return;
    }
    if (picked === id) {
      setPicked(null);
      setNote(null);
    } else {
      setPicked(id);
      sfx.select();
      setNote('Now tap the position to move it to.');
    }
  };

  // Keep tap-selection valid when the order changes underneath us.
  useLayoutEffect(() => {
    if (picked && heldBy(picked)) setPicked(null);
  });

  const ghostEvent = drag?.active ? events.find((x) => x.id === drag.id) : null;
  const playersById = new Map(view.players.map((p) => [p.id, p]));
  const cardOwner = (cardId: string) => view.revealed.find((r) => r.card.id === cardId);

  return (
    <div className={`tl ${vertical ? 'tl--v' : 'tl--h'}`}>
      <div className="tl__axis" aria-hidden="true">
        <span>Earlier</span>
        <span className="tl__axisline" />
        <span>Later</span>
      </div>
      <ol
        ref={listRef}
        className="tl__list"
        aria-label="Shared timeline, earliest first"
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {order.map((id, i) => {
          const ev = events.find((x) => x.id === id)!;
          const holder = heldBy(id);
          const isGhostSlot = drag?.active && drag.id === id;
          const support = tl.support[id] ?? [];
          const doubts = tl.doubts[id] ?? [];
          const iDoubt = doubts.includes(me.id);
          const flashBy = flash?.id === id ? playersById.get(flash.by) : undefined;
          return (
            <motion.li
              key={id}
              layout
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              data-tile={id}
              className={[
                'tile',
                isGhostSlot ? 'is-placeholder' : '',
                picked === id ? 'is-picked' : '',
                picked && picked !== id ? 'is-target' : '',
                holder ? 'is-held' : '',
                doubts.length ? 'is-disputed' : '',
                flashBy ? 'is-flash' : '',
              ].join(' ')}
              style={{
                ['--hc' as string]: holder ? seatColor(holder.seat) : flashBy ? seatColor(flashBy.seat) : undefined,
              }}
              onPointerDown={(e) => startPointer(e, id)}
              onClick={(e) => {
                if (justDragged.current) {
                  justDragged.current = false;
                  return;
                }
                if (!(e.target as HTMLElement).closest('button')) tapTile(id);
              }}
              data-testid={`tile-${id}`}
            >
              <div className="tile__top">
                <span className="tile__num display">{i + 1}</span>
                <button className="tile__grip" data-grip aria-label={`Drag ${ev.title}`} title="Drag to reorder">
                  <Icon name="grip" size={16} stroke={3} />
                </button>
                <span className="tile__icon">
                  <Icon name={ev.icon} size={18} />
                </span>
              </div>
              <div
                className="tile__title"
                role="button"
                tabIndex={0}
                aria-pressed={picked === id}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tapTile(id);
                  }
                }}
              >
                {ev.title}
              </div>
              <div className="tile__evidence">
                {ev.briefing && <span className="tchip tchip--brief">Briefing · {ev.briefing}</span>}
                {support.map((cid) => {
                  const r = cardOwner(cid);
                  if (!r) return null;
                  return (
                    <button
                      key={cid}
                      className="tchip"
                      style={{ ['--pc' as string]: seatColor(r.seat) }}
                      onClick={() =>
                        inspect({
                          items: view.revealed.map((x) => ({
                            card: x.card,
                            sharedBy: playersById.get(x.playerId) ? { name: playersById.get(x.playerId)!.name, seat: x.seat } : null,
                          })),
                          index: view.revealed.findIndex((x) => x.card.id === cid),
                          highlight: id,
                        })
                      }
                      title={`See what ${r.card.title} says about this`}
                    >
                      {r.card.code}
                    </button>
                  );
                })}
                {!ev.briefing && support.length === 0 && <span className="tchip tchip--none">No shared evidence</span>}
              </div>
              <div className="tile__foot">
                <div className="tile__moves">
                  <button className="tile__btn" onClick={() => commit(id, Math.max(0, i - 1))} disabled={i === 0 || !!holder} aria-label={`Move ${ev.title} earlier`}>
                    <Icon name={vertical ? 'up' : 'left'} size={15} />
                  </button>
                  <button
                    className="tile__btn"
                    onClick={() => commit(id, Math.min(order.length - 1, i + 1))}
                    disabled={i === order.length - 1 || !!holder}
                    aria-label={`Move ${ev.title} later`}
                  >
                    <Icon name={vertical ? 'down' : 'right'} size={15} />
                  </button>
                </div>
                {chat && (
                  <button className="tile__btn tile__discuss" onClick={() => chat.discuss(id, ev.title)} aria-label={`Discuss ${ev.title} in team chat`} title="Discuss in team chat">
                    <Icon name="notice" size={14} />
                  </button>
                )}
                <button
                  className={`tile__doubt ${iDoubt ? 'is-on' : ''}`}
                  onClick={() => void send('timeline:doubt', { eventId: id, on: !iDoubt })}
                  aria-pressed={iDoubt}
                  title={iDoubt ? 'Withdraw your doubt' : 'Flag this position as disputed'}
                >
                  <Icon name="question" size={14} />
                  {doubts.map((pid) => {
                    const p = playersById.get(pid);
                    return p ? <span key={pid} className="tile__doubtdot" style={{ background: seatColor(p.seat) }} /> : null;
                  })}
                </button>
              </div>
              <AnimatePresence>
                {(holder || flashBy) && (
                  <motion.span className="tile__who" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Avatar player={(holder ?? flashBy)!} size={16} />
                    {holder ? `${holder.name} is moving this` : `moved by ${flashBy!.name}`}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>
      <p className="tl__hint muted">
        {note ?? (vertical ? 'Drag a tile by its grip, tap a tile then tap a new spot, or use the arrows.' : 'Drag tiles, tap one then another to swap positions, or use the arrows.')}
      </p>
      {ghostEvent && ghost && drag && (
        <div className="tile tile--ghost" style={{ left: ghost.x, top: ghost.y, width: drag.w, height: drag.h }} aria-hidden="true">
          <div className="tile__top">
            <span className="tile__icon">
              <Icon name={ghostEvent.icon} size={18} />
            </span>
          </div>
          <div className="tile__title">{ghostEvent.title}</div>
        </div>
      )}
    </div>
  );
}
