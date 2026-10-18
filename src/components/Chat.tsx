import { AnimatePresence, motion } from 'motion/react';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EventId, PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { send } from '../net/store';
import { Icon } from './Icon';
import { Avatar, seatColor } from './ui';
import './chat.css';

interface Draft {
  text: string;
  eventId?: EventId;
  focus: number;
}
interface ChatCtx {
  draft: Draft;
  setDraft: (d: Draft) => void;
  sheetOpen: boolean;
  setSheetOpen: (o: boolean) => void;
  /** Start a message about a timeline event. */
  discuss: (eventId: EventId, title: string) => void;
}

const Ctx = createContext<ChatCtx | null>(null);
export const useChat = () => useContext(Ctx);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<Draft>({ text: '', focus: 0 });
  const [sheetOpen, setSheetOpen] = useState(false);
  const value = useMemo<ChatCtx>(
    () => ({
      draft,
      setDraft,
      sheetOpen,
      setSheetOpen,
      discuss: (eventId, title) => {
        setDraft((d) => ({ text: `About “${title}”: `, eventId, focus: d.focus + 1 }));
        setSheetOpen(true);
      },
    }),
    [draft, sheetOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const QUICK = ['I agree 👍', 'Not sure 🤔', 'Check my card', 'Ready to sign ✍️'];

function ChatBody({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const ctx = useChat()!;
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const players = new Map(view.players.map((p) => [p.id, p]));
  const events = new Map(view.case!.events.map((e) => [e.id, e]));

  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [view.chat.length]);

  useEffect(() => {
    if (!ctx.draft.focus) return;
    const el = input.current;
    if (el && el.offsetParent !== null) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [ctx.draft.focus]);

  const submit = async (text: string, eventId?: EventId) => {
    const t = text.trim();
    if (!t) return;
    const r = await send('chat:send', { text: t, ...(eventId ? { eventId } : {}) });
    if (!r.ok) {
      setErr(r.error);
      setTimeout(() => setErr(null), 2000);
    } else if (text === ctx.draft.text) ctx.setDraft({ text: '', focus: ctx.draft.focus });
  };

  return (
    <div className="chat__body">
      <div className="chat__list" ref={list} aria-live="polite">
        {view.chat.length === 0 && (
          <p className="chat__empty">
            Talk it through: which event came first? Who was the hooded person? Tap <Icon name="notice" size={13} /> on any timeline event to discuss it.
          </p>
        )}
        {view.chat.map((m, i) => {
          const p = players.get(m.playerId);
          const mine = m.playerId === me.id;
          const grouped = i > 0 && view.chat[i - 1].playerId === m.playerId;
          const ev = m.eventId ? events.get(m.eventId) : undefined;
          return (
            <div key={m.id} className={`msg ${mine ? 'msg--me' : ''} ${grouped ? 'msg--grouped' : ''}`} style={{ ['--pc' as string]: p ? seatColor(p.seat) : 'var(--brass)' }}>
              {!grouped && p && (
                <div className="msg__who">
                  <Avatar player={p} size={16} /> {mine ? 'You' : p.name}
                </div>
              )}
              <div className="msg__bubble">
                {ev && (
                  <span className="msg__event">
                    <Icon name={ev.icon} size={12} /> #{(view.timeline?.order.indexOf(ev.id) ?? 0) + 1}
                  </span>
                )}
                {ev ? m.text.replace(/^About “[^”]*”:\s*/, '') || ev.title : m.text}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chat__quick">
        {QUICK.map((q) => (
          <button key={q} className="chat__chip" onClick={() => submit(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(ctx.draft.text, ctx.draft.eventId);
        }}
      >
        {ctx.draft.eventId && (
          <span className="chat__about">
            <Icon name={events.get(ctx.draft.eventId)?.icon ?? 'notice'} size={12} /> {events.get(ctx.draft.eventId)?.title}
            <button type="button" aria-label="Clear event" onClick={() => ctx.setDraft({ text: '', focus: ctx.draft.focus })}>
              <Icon name="x" size={11} />
            </button>
          </span>
        )}
        <div className="chat__row">
          <input
            ref={input}
            type="text"
            maxLength={240}
            value={ctx.draft.text}
            placeholder="Message your team…"
            aria-label="Message your team"
            enterKeyHint="send"
            onChange={(e) => ctx.setDraft({ ...ctx.draft, text: e.target.value, eventId: e.target.value ? ctx.draft.eventId : undefined })}
            data-testid="chat-input"
          />
          <button className="chat__send" type="submit" aria-label="Send" disabled={!ctx.draft.text.trim()}>
            <Icon name="arrow" size={14} />
          </button>
        </div>
        {err && <span className="chat__err">{err}</span>}
      </form>
    </div>
  );
}

/** Host only. First tap arms it, second tap clears for everyone. */
function ClearChat({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!me.isHost || view.chat.length === 0) return null;
  return (
    <button
      className={`chat__clear ${armed ? 'is-armed' : ''}`}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void send('chat:clear');
      }}
      title="Host: clear the chat for everyone"
      data-testid="chat-clear"
    >
      {armed ? 'Clear for everyone?' : 'Clear chat'}
    </button>
  );
}

/** Desktop: fills the left rail. */
export function ChatRail({ view, me }: { view: RoomView; me: PublicPlayer }) {
  useChatSound(view, me);
  return (
    <section className="chat chat--rail" aria-label="Team chat">
      <div className="chat__head">
        <span className="eyebrow eyebrow--brass">Team chat</span>
        <ClearChat view={view} me={me} />
      </div>
      <ChatBody view={view} me={me} />
    </section>
  );
}

/** Phones: a floating button that opens a bottom sheet. */
export function ChatSheet({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const ctx = useChat()!;
  const [seen, setSeen] = useState(view.chat.length);
  useEffect(() => {
    if (ctx.sheetOpen) setSeen(view.chat.length);
  }, [ctx.sheetOpen, view.chat.length]);
  const unread = view.chat.slice(seen).filter((m) => m.playerId !== me.id).length;
  return (
    <div className="chat-mobile">
      <button className="chat-fab" onClick={() => ctx.setSheetOpen(true)} aria-label={`Open team chat${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="notice" size={20} />
        {unread > 0 && <span className="chat-fab__badge">{unread}</span>}
      </button>
      <AnimatePresence>
        {ctx.sheetOpen && (
          <>
            <motion.div className="chat-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => ctx.setSheetOpen(false)} />
            <motion.section
              className="chat chat--sheet"
              aria-label="Team chat"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <div className="chat__head">
                <span className="eyebrow eyebrow--brass">Team chat</span>
                <ClearChat view={view} me={me} />
                <button className="btn btn--ghost btn--sm" onClick={() => ctx.setSheetOpen(false)}>
                  Close
                </button>
              </div>
              <ChatBody view={view} me={me} />
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function useChatSound(view: RoomView, me: PublicPlayer) {
  const count = useRef(view.chat.length);
  useEffect(() => {
    const fresh = view.chat.slice(count.current);
    count.current = view.chat.length;
    if (fresh.some((m) => m.playerId !== me.id)) sfx.count(0.7);
  }, [view.chat, me.id]);
}
