import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PublicPlayer, ResultView, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { EvidenceCard } from '../components/evidence/EvidenceCard';
import { Icon } from '../components/Icon';
import { StoryArt } from '../components/StoryArt';
import { useInspect } from '../components/Inspector';
import { Avatar, ROLE_ICON, roleTitle, seatColor } from '../components/ui';
import { fmt } from '../hooks/useRoundClock';
import { leaveRoom, send } from '../net/store';
import './truth.css';

const STEP_AT = [0, 2300, 6200, 9200, 12500];

export function TruthPhase({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const res = view.result!;
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? 4 : 0);

  useEffect(() => {
    if (reduced) return;
    sfx.swell();
    const ts = STEP_AT.slice(1).map((at, i) => setTimeout(() => setStep((s) => Math.max(s, i + 1)), at));
    return () => ts.forEach(clearTimeout);
  }, [reduced]);

  const playersById = new Map(view.players.map((p) => [p.id, p]));

  return (
    <div className="truth">
      <header className="truth__hero">
        <motion.span
          className="stamp truth__stamp"
          initial={{ scale: 2.6, opacity: 0, rotate: -24 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.2 }}
          onAnimationComplete={() => sfx.stamp()}
        >
          Case closed · solved in {fmt(res.elapsedMs)}
        </motion.span>
        <motion.div className="eyebrow eyebrow--brass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          The truth
        </motion.div>
        <motion.h1
          className="truth__headline display"
          initial={{ opacity: 0, y: 20, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.8, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {res.headline}
        </motion.h1>
        <motion.p className="truth__moral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
          {res.moral}
        </motion.p>
        <motion.div
          className={`pace-badge pace-badge--${res.pace.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 }}
          data-testid="pace"
        >
          <Icon name="spark" size={15} /> <b>{res.pace.title}</b> · solved in {fmt(res.elapsedMs)}
        </motion.div>
        {step < 4 && (
          <button className="btn btn--ghost btn--sm truth__skip" onClick={() => setStep(4)} data-testid="skip-reveal">
            Skip to results
          </button>
        )}
      </header>

      {step >= 1 && <TimelineCompare res={res} view={view} />}
      {step >= 2 && <VerdictCompare res={res} playersById={playersById} />}
      {step >= 3 && <Score res={res} />}
      {step >= 4 && (
        <>
          <Story res={res} />
          <Insights res={res} view={view} />
          <Theories res={res} view={view} />
          <Unsealed res={res} view={view} />
          <Again view={view} me={me} />
        </>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
  className = '',
  follow = false,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Scroll to this section when it appears (only the timed reveal beats do). */
  follow?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (follow) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [follow]);
  return (
    <motion.section
      ref={ref}
      className={`tsec ${className}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="eyebrow eyebrow--brass">{eyebrow}</div>
      <h2 className="display tsec__title">{title}</h2>
      {children}
    </motion.section>
  );
}

function TimelineCompare({ res, view }: { res: ResultView; view: RoomView }) {
  const events = view.case!.events;
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; ok: boolean; id: string }[]>([]);
  const truthIdx = new Map(res.official.map((e, i) => [e.id, i]));

  useLayoutEffect(() => {
    const measure = () => {
      const w = wrap.current;
      if (!w) return;
      const b = w.getBoundingClientRect();
      const out: { d: string; ok: boolean; id: string }[] = [];
      for (const id of res.teamOrder) {
        const a = w.querySelector(`[data-team="${id}"]`)?.getBoundingClientRect();
        const c = w.querySelector(`[data-truth="${id}"]`)?.getBoundingClientRect();
        if (!a || !c) continue;
        const x1 = a.left + a.width / 2 - b.left;
        const y1 = a.bottom - b.top;
        const x2 = c.left + c.width / 2 - b.left;
        const y2 = c.top - b.top;
        const my = (y1 + y2) / 2;
        out.push({ id, ok: res.teamOrder.indexOf(id) === truthIdx.get(id), d: `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` });
      }
      setLines(out);
    };
    measure();
    const t = setTimeout(measure, 700);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [res]);

  const placedRight = res.teamOrder.filter((id, i) => truthIdx.get(id) === i).length;

  return (
    <Section follow eyebrow="Timeline" title={`${res.correctPairs} of ${res.totalPairs} event pairs in the right order`}>
      <p className="muted tsec__lede">
        {placedRight} of 6 events sit in exactly the right slot. Straight gold threads are right; crossed red threads show where the order diverged.
      </p>
      <div className="tcmp" ref={wrap}>
        <div className="tcmp__label eyebrow">Your timeline</div>
        <div className="tcmp__row">
          {res.teamOrder.map((id, i) => {
            const ok = truthIdx.get(id) === i;
            return (
              <motion.div
                key={id}
                className={`tct ${ok ? 'is-ok' : 'is-off'}`}
                data-team={id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className="tct__n">{i + 1}</span>
                {events.find((e) => e.id === id)!.title}
                {!ok && (
                  <span className="tct__off">
                    actually #{truthIdx.get(id)! + 1}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
        <svg className="tcmp__lines" aria-hidden="true">
          {lines.map((l, i) => (
            <motion.path
              key={l.id}
              d={l.d}
              className={l.ok ? 'is-ok' : 'is-off'}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.9 + i * 0.18, duration: 0.6 }}
            />
          ))}
        </svg>
        <div className="tcmp__label eyebrow">What happened</div>
        <div className="tcmp__row">
          {res.official.map((e, i) => (
            <motion.div
              key={e.id}
              className="tct tct--truth"
              data-truth={e.id}
              initial={{ opacity: 0, y: 26, rotateX: -40 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.3 + i * 0.16, type: 'spring', stiffness: 200, damping: 18 }}
            >
              <span className="tct__time">{e.time}</span>
              <b>{e.title}</b>
              <span className="tct__detail">{e.detail}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function VerdictCompare({ res, playersById }: { res: ResultView; playersById: Map<string, PublicPlayer> }) {
  return (
    <Section follow eyebrow="Verdict" title="Your explanation, against the record">
      <div className="vcmp">
        {res.verdict.map((v, i) => {
          const by = v.team?.by ? playersById.get(v.team.by) : undefined;
          return (
            <motion.div
              key={v.questionId}
              className={`vrow ${v.correct ? 'is-ok' : 'is-off'}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.35 }}
              onAnimationComplete={() => (v.correct ? sfx.place() : undefined)}
            >
              <div className="vrow__mark">
                <Icon name={v.correct ? 'check' : 'x'} size={22} stroke={2.4} />
              </div>
              <div className="vrow__body">
                <div className="vrow__q">{v.prompt}</div>
                <div className="vrow__answers">
                  <span className="vrow__team">
                    <span className="eyebrow">You said</span>
                    {v.team ? v.team.label : 'No answer'}
                    {by && <Avatar player={by} size={16} />}
                  </span>
                  {!v.correct && (
                    <span className="vrow__truth">
                      <span className="eyebrow">Truth</span>
                      {v.truth.label}
                    </span>
                  )}
                </div>
                <p className="vrow__why">{v.explanation}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

function Score({ res }: { res: ResultView }) {
  const reduced = useReducedMotion();
  const val = useMotionValue(0);
  const [shown, setShown] = useState(0);
  const arc = useTransform(val, [0, 100], [0, 1]);
  const last = useRef(0);
  useMotionValueEvent(val, 'change', (v) => {
    const n = Math.round(v);
    setShown(n);
    if (n - last.current >= 4) {
      last.current = n;
      sfx.count(n / 100);
    }
  });
  useEffect(() => {
    if (reduced) {
      val.set(res.score.total);
      return;
    }
    const c = animate(val, res.score.total, { duration: 2.2, ease: [0.2, 0.8, 0.2, 1], delay: 0.4, onComplete: () => sfx.chime() });
    return () => c.stop();
  }, [res.score.total, reduced, val]);

  return (
    <Section follow eyebrow="Match" title={res.band.title} className="score">
      <div className="score__grid">
        <div className="gauge" role="img" aria-label={`Team match ${res.score.total} percent`}>
          <svg viewBox="0 0 240 150">
            <defs>
              <linearGradient id="g-brass" x1="0" x2="1">
                <stop offset="0" stopColor="#8f6a2f" />
                <stop offset="0.5" stopColor="#f6d99e" />
                <stop offset="1" stopColor="#b88a40" />
              </linearGradient>
            </defs>
            <path d="M20 130 A100 100 0 0 1 220 130" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="16" strokeLinecap="round" />
            <motion.path
              d="M20 130 A100 100 0 0 1 220 130"
              fill="none"
              stroke="url(#g-brass)"
              strokeWidth="16"
              strokeLinecap="round"
              style={{ pathLength: arc }}
            />
            {Array.from({ length: 11 }, (_, i) => {
              const a = (Math.PI * (180 - i * 18)) / 180;
              return (
                <line
                  key={i}
                  x1={120 + 82 * Math.cos(a)}
                  y1={130 - 82 * Math.sin(a)}
                  x2={120 + 74 * Math.cos(a)}
                  y2={130 - 74 * Math.sin(a)}
                  stroke="rgba(248,223,171,.5)"
                  strokeWidth={i % 5 === 0 ? 2 : 1}
                />
              );
            })}
            <g transform={`rotate(${-90 + shown * 1.8} 120 130)`}>
              <path d="M117 130 L120 52 L123 130 Z" fill="#c0392b" />
            </g>
            <circle cx="120" cy="130" r="8" fill="url(#g-brass)" />
          </svg>
          <div className="gauge__num display">
            {shown}
            <span>%</span>
          </div>
          <div className="gauge__band">{res.band.line}</div>
        </div>
        <div className="breakdown">
          {res.score.parts.map((p, i) => (
            <div key={p.id} className="bd">
              <div className="bd__top">
                <span>{p.label}</span>
                <b>
                  {p.earned}
                  <span>/{p.max}</span>
                </b>
              </div>
              <div className="bd__bar">
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: p.earned / p.max }}
                  transition={{ delay: 0.6 + i * 0.25, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                  className={p.earned === p.max ? 'is-full' : p.earned === 0 ? 'is-zero' : ''}
                />
              </div>
              <div className="bd__detail">{p.detail}</div>
            </div>
          ))}
          <div className={`pace pace--${res.pace.id}`}>
            <div className="bd__top">
              <span>Time taken</span>
              <b>{fmt(res.elapsedMs)}</b>
            </div>
            <div className="pace__bar" aria-hidden="true">
              <span className="pace__zone pace__zone--swift">under 5 min</span>
              <span className="pace__zone pace__zone--fair">under 10</span>
              <span className="pace__zone pace__zone--slow">under 15</span>
              <motion.span
                className="pace__marker"
                initial={{ left: '0%' }}
                animate={{ left: `${Math.min(100, (res.elapsedMs / 900_000) * 100)}%` }}
                transition={{ delay: 1.2, duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
            <div className="bd__detail">
              <b>{res.pace.title}</b> — {res.pace.line} Speed doesn’t change your match %.
            </div>
          </div>
          <p className="bd__note muted">
            Scored only against the case’s answer key: 30 + 20 + 20 for the three verdict questions, 2 points per correctly ordered event pair. Unshared cards
            never affect the score.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Story({ res }: { res: ResultView }) {
  return (
    <Section eyebrow="What really happened" title="The full sequence">
      <ol className="story">
        {res.narrative.map((n, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}>
            <span className="story__time">{n.time}</span>
            <div className="story__art">
              <StoryArt art={n.art} />
            </div>
            <div>
              <span className="story__step">Step {i + 1}</span>
              <b className="display">{n.title}</b>
              <p>{n.text}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </Section>
  );
}

function Insights({ res, view }: { res: ResultView; view: RoomView }) {
  const code = (id: string) => res.cards.find((c) => c.card.id === id)?.card.code ?? id;
  const shareSeat = (id: string) => view.revealed.find((r) => r.card.id === id)?.seat ?? 0;
  return (
    <Section eyebrow="The crucial links" title="Which connections you made — and missed">
      <div className="insights">
        {res.insights.map((k) => (
          <div key={k.id} className={`ins ${k.found ? 'is-ok' : 'is-off'}`}>
            <div className="ins__head">
              <Icon name={k.found ? 'check' : 'x'} size={16} stroke={2.4} />
              <b>{k.title}</b>
            </div>
            <p>{k.text}</p>
            <div className="ins__ev">
              {k.boardCards.length > 0 ? (
                <>
                  <span className="muted">
                    Your board {k.level === 'proved' ? 'proved this' : k.level === 'suggested' ? 'suggested this' : 'didn’t show this'}:
                  </span>
                  {k.boardCards.map((id) => (
                    <span key={id} className="tchip" style={{ ['--pc' as string]: seatColor(shareSeat(id)) }}>
                      {code(id)}
                    </span>
                  ))}
                </>
              ) : (
                <span className="muted">No shared card spoke to this.</span>
              )}
              {!k.found && k.hiddenCards.length > 0 && (
                <span className="muted ins__hidden">
                  Also in unshared cards: {k.hiddenCards.map(code).join(', ')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Theories({ res, view }: { res: ResultView; view: RoomView }) {
  const hypTitle = (id: string | null) => view.case!.hypotheses.find((h) => h.id === id)?.title ?? '—';
  const conf = (id: string | null) => view.case!.confidences.find((c) => c.id === id)?.label;
  return (
    <Section eyebrow="How your thinking moved" title="First theories → team verdict → truth">
      <div className="theories">
        {res.theories.map((t, i) => (
          <motion.div
            key={t.playerId}
            className="thc"
            style={{ ['--pc' as string]: seatColor(t.seat) }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15 }}
          >
            <div className="thc__who">
              <Avatar player={{ name: t.name, seat: t.seat }} size={36} />
              <div>
                <b>{t.name}</b>
                <span className="muted">
                  <Icon name={ROLE_ICON[t.roleId]} size={13} /> {roleTitle(view, t.roleId)}
                </span>
              </div>
            </div>
            <ol className="thc__path">
              <li className={t.matchesTruth ? 'is-ok' : ''}>
                <span className="eyebrow">Alone</span>
                {t.hypothesisTitle}
                {t.confidence && <em> · {conf(t.confidence)}</em>}
              </li>
              <li className={res.teamHypothesisId === res.truthHypothesisId ? 'is-ok' : ''}>
                <span className="eyebrow">Together</span>
                {res.teamHypothesisId ? hypTitle(res.teamHypothesisId) : 'No cause chosen'}
                {t.hypothesisId && !t.matchesTeam && <em> · changed mind</em>}
              </li>
              <li className="is-ok">
                <span className="eyebrow">Truth</span>
                {hypTitle(res.truthHypothesisId)}
              </li>
            </ol>
            <p className="thc__reflect">{t.reflection}</p>
            <p className="thc__role muted">{t.roleNote}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

function Unsealed({ res, view }: { res: ResultView; view: RoomView }) {
  const inspect = useInspect();
  const players = new Map(view.players.map((p) => [p.id, p]));
  const items = res.cards.map((c) => {
    const p = c.revealedBy ? players.get(c.revealedBy) : undefined;
    return { card: c.card, sharedBy: p ? { name: p.name, seat: p.seat } : null };
  });
  const notes = Object.fromEntries(
    res.cards.map((c) => [
      c.card.id,
      <div className="unseal__notes" key={c.card.id}>
        <div>
          <span className="eyebrow eyebrow--brass">Establishes</span>
          <ul>{c.establishes.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <span className="eyebrow">Suggests</span>
          <ul>{c.suggests.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <p className="muted">
          <b>Careful:</b> {c.caution}
        </p>
      </div>,
    ]),
  );
  return (
    <Section eyebrow="Case files unsealed" title="All nine clues — and what each could prove">
      <p className="muted tsec__lede">The six cards nobody shared are shown for curiosity only. They never touched your score.</p>
      <div className="unseal">
        {res.cards.map((c, i) => {
          const p = c.revealedBy ? players.get(c.revealedBy) : undefined;
          return (
            <button key={c.card.id} className={`unseal__item ${p ? 'is-shared' : ''}`} onClick={() => inspect({ items, index: i, notes })} style={p ? { ['--pc' as string]: seatColor(p.seat) } : undefined}>
              <div className="unseal__card">
                <EvidenceCard card={c.card} size="mini" />
              </div>
              <span className="unseal__label">
                {p ? (
                  <>
                    <span className="unseal__dot" /> Shared by {p.name}
                  </>
                ) : (
                  'Kept private'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function Again({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const host = view.players.find((p) => p.isHost);
  const canStart = me.isHost || !host?.connected;
  const [err, setErr] = useState<string | null>(null);
  return (
    <motion.section className="again" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h2 className="display">Same case, new eyes?</h2>
      <p className="muted">Roles rotate each round, so everyone sees the incident from a different post.</p>
      <div className="again__btns">
        {canStart ? (
          <button
            className="btn btn--brass btn--lg"
            onClick={async () => {
              const r = await send('round:again');
              if (!r.ok) setErr(r.error);
            }}
            data-testid="play-again"
          >
            <Icon name="spark" /> Start a new round
          </button>
        ) : (
          <span className="lobby__wait">
            <span className="live-dot" /> Waiting for {host?.name} to start a new round…
          </span>
        )}
        <button className="btn btn--ghost" onClick={() => leaveRoom()}>
          Leave room
        </button>
      </div>
      {err && <p className="home__error">{err}</p>}
    </motion.section>
  );
}
