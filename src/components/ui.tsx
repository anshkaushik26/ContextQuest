import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ActivityItem, Phase, PublicPlayer, RoleId, RoomView } from '../../shared/protocol';
import { setMusicOn, setMusicVolume, useMusic } from '../audio/music';
import { setMuted, setSfxVolume, unlockAudio, useMuted, useSfxVolume } from '../audio/sfx';
import { Icon } from './Icon';
import './ui.css';

export const seatColor = (seat: number) => `var(--p${seat})`;
export const ROLE_ICON: Record<RoleId, string> = { tech: 'tech', volunteer: 'volunteer', guard: 'guard' };
export const roleTitle = (v: RoomView, id: RoleId | null) => v.case?.roles.find((r) => r.id === id)?.title ?? '';

export function Avatar({ player, size = 40, ring = false }: { player: Pick<PublicPlayer, 'name' | 'seat'>; size?: number; ring?: boolean }) {
  const initial = (player.name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`avatar ${ring ? 'avatar--ring' : ''}`}
      style={{ width: size, height: size, ['--pc' as string]: seatColor(player.seat), fontSize: size * 0.44 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" className="avatar__seal">
        {player.seat === 0 && <circle cx="20" cy="20" r="17" />}
        {player.seat === 1 && <path d="M20 3 L36 20 L20 37 L4 20 Z" />}
        {player.seat === 2 && <path d="M20 3 L35 12 L35 28 L20 37 L5 28 L5 12 Z" />}
      </svg>
      <span className="avatar__letter display">{initial}</span>
    </span>
  );
}

export function Atmosphere({ urgency }: { urgency: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const motes = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: -Math.random() * 0.00008 - 0.00002,
      a: Math.random() * 0.35 + 0.08,
      p: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h);
        for (const m of motes) {
          m.x = (m.x + m.vx * dt + 1) % 1;
          m.y = (m.y + m.vy * dt + 1) % 1;
          const tw = 0.6 + 0.4 * Math.sin(t / 1400 + m.p);
          ctx.beginPath();
          ctx.fillStyle = `rgba(248, 223, 171, ${m.a * tw})`;
          ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <div className="atmos" data-urgency={urgency} aria-hidden="true">
      <div className="atmos__lamp" />
      <div className="atmos__grid" />
      <canvas ref={canvas} className="atmos__dust" />
      <div className="atmos__noise" />
      <div className="atmos__vignette" />
    </div>
  );
}

/** Sound controls: soundtrack on/off + volume, and sound effects on/off. */
export function MuteButton() {
  const muted = useMuted();
  const sfxVolume = useSfxVolume();
  const music = useMusic();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const silent = muted && (!music.on || music.status === 'unavailable');
  const note =
    music.status === 'unavailable'
      ? 'Soundtrack unavailable — effects still work.'
      : music.on && music.status === 'blocked'
        ? 'Tap anywhere to start the music.'
        : music.on && music.status === 'loading'
          ? 'Loading soundtrack…'
          : null;
  return (
    <div className="sound" ref={wrap}>
      <button
        className="btn btn--ghost btn--icon"
        onClick={() => {
          unlockAudio();
          setOpen((o) => !o);
        }}
        aria-label="Sound settings"
        aria-expanded={open}
        title="Sound"
        data-testid="sound-button"
      >
        <Icon name={silent ? 'mute' : 'sound'} />
      </button>
      {open && (
        <div className="sound__panel panel" role="dialog" aria-label="Sound settings">
          <div className="sound__row">
            <span>Soundtrack</span>
            <button
              className={`switch ${music.on && music.status !== 'unavailable' ? 'is-on' : ''}`}
              role="switch"
              aria-checked={music.on}
              disabled={music.status === 'unavailable'}
              onClick={() => setMusicOn(!music.on)}
              data-testid="music-toggle"
            >
              <span />
            </button>
          </div>
          <label className="sound__vol">
            <Icon name={music.volume === 0 ? 'mute' : 'sound'} size={15} />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(music.volume * 100)}
              onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
              disabled={music.status === 'unavailable'}
              aria-label="Soundtrack volume"
              data-testid="music-volume"
            />
            <span className="sound__pct">{Math.round(music.volume * 100)}%</span>
          </label>
          <div className="sound__row">
            <span>Sound effects</span>
            <button className={`switch ${!muted ? 'is-on' : ''}`} role="switch" aria-checked={!muted} onClick={() => setMuted(!muted)} data-testid="sfx-toggle">
              <span />
            </button>
          </div>
          <label className="sound__vol">
            <Icon name={sfxVolume === 0 || muted ? 'mute' : 'sound'} size={15} />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(sfxVolume * 100)}
              onChange={(e) => {
                setSfxVolume(Number(e.target.value) / 100);
                if (muted) setMuted(false);
              }}
              aria-label="Sound effects volume"
              data-testid="sfx-volume"
            />
            <span className="sound__pct">{Math.round(sfxVolume * 100)}%</span>
          </label>
          {note && <p className="sound__note">{note}</p>}
        </div>
      )}
    </div>
  );
}

const STAGES: { id: string; label: string; phases: Phase[] }[] = [
  { id: 'intro', label: 'Briefing', phases: ['intro'] },
  { id: 'evidence', label: 'Evidence', phases: ['evidence'] },
  { id: 'reveal', label: 'Reveal', phases: ['reveal'] },
  { id: 'board', label: 'Reconstruct', phases: ['board'] },
  { id: 'verdict', label: 'Verdict', phases: [] },
  { id: 'truth', label: 'Truth', phases: ['truth'] },
];

export function StageRail({ view }: { view: RoomView }) {
  const answered = view.case && view.verdict ? view.case.questions.every((q) => view.verdict!.answers[q.id]) : false;
  const verdictActive = view.phase === 'board' && ((view.verdict?.signatures.length ?? 0) > 0 || answered);
  const activeId = verdictActive ? 'verdict' : STAGES.find((s) => s.phases.includes(view.phase))?.id;
  const activeIdx = STAGES.findIndex((s) => s.id === activeId);
  return (
    <ol className="stagerail" aria-label="Round stages">
      {STAGES.map((s, i) => (
        <li key={s.id} className={i < activeIdx ? 'is-done' : i === activeIdx ? 'is-active' : ''} aria-current={i === activeIdx ? 'step' : undefined}>
          <span className="stagerail__dot" />
          <span className="stagerail__label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function PlayerSeat({ view, player, compact = false }: { view: RoomView; player: PublicPlayer; compact?: boolean }) {
  const status = seatStatus(view, player);
  return (
    <div
      className={`seat ${compact ? 'seat--compact' : ''} ${player.connected ? '' : 'is-away'} ${player.id === view.you ? 'is-you' : ''}`}
      data-seat={player.seat}
      data-seat-anchor={player.id}
      style={{ ['--pc' as string]: seatColor(player.seat) }}
    >
      <Avatar player={player} size={compact ? 30 : 38} />
      <div className="seat__body">
        <div className="seat__name">
          {player.name}
          {player.id === view.you && <span className="seat__you">you</span>}
          {player.bot && <span className="seat__demo">demo</span>}
          {player.isHost && !compact && <span className="seat__host" title="Host — plays like everyone else">host</span>}
        </div>
        {!compact && <div className="seat__role">{player.roleId ? roleTitle(view, player.roleId) : 'Awaiting assignment'}</div>}
        <div className={`seat__status seat__status--${status.tone}`}>
          {status.tone === 'live' && <span className="live-dot" />}
          {status.text}
        </div>
      </div>
      <span className={`seat__conn ${player.connected ? 'is-on' : ''}`} title={player.connected ? 'Connected' : 'Reconnecting…'} />
    </div>
  );
}

function seatStatus(view: RoomView, p: PublicPlayer): { text: string; tone: 'idle' | 'live' | 'done' | 'away' } {
  if (!p.connected) return { text: 'Reconnecting…', tone: 'away' };
  switch (view.phase) {
    case 'lobby':
      return p.ready ? { text: 'Ready', tone: 'done' } : { text: 'Not ready', tone: 'idle' };
    case 'intro':
      return p.introDone ? { text: 'Reading evidence', tone: 'done' } : { text: 'In the briefing', tone: 'idle' };
    case 'evidence':
      return p.theoryLocked ? { text: 'Theory locked', tone: 'done' } : { text: 'Weighing the clues…', tone: 'live' };
    case 'reveal':
      if (p.revealedCardId) return { text: 'Evidence pinned', tone: 'done' };
      return p.selecting ? { text: 'Choosing a card…', tone: 'live' } : { text: 'Deciding what to share', tone: 'idle' };
    case 'board':
      return p.signed ? { text: 'Signed the verdict', tone: 'done' } : { text: 'Investigating', tone: 'live' };
    case 'truth':
      return { text: 'Case closed', tone: 'done' };
  }
}

export function ActivityFeed({ items, players }: { items: ActivityItem[]; players: PublicPlayer[] }) {
  const recent = items.slice(-4).reverse();
  return (
    <div className="feed" aria-live="polite">
      <div className="eyebrow">Live activity</div>
      <ul>
        <AnimatePresence initial={false}>
          {recent.map((a) => {
            const p = players.find((x) => x.id === a.playerId);
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span className="feed__dot" style={{ background: p ? seatColor(p.seat) : 'var(--brass)' }} />
                {a.text}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="sect-head">
      <div>
        <div className="eyebrow eyebrow--brass">{eyebrow}</div>
        <h2 className="display sect-head__title">{title}</h2>
      </div>
      {children && <div className="sect-head__aside">{children}</div>}
    </header>
  );
}
