import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { PublicPlayer, RoomView } from '../../shared/protocol';
import { sfx } from '../audio/sfx';
import { Icon } from '../components/Icon';
import { ROLE_ICON } from '../components/ui';
import { send } from '../net/store';
import './intro.css';

export function Intro({ view, me }: { view: RoomView; me: PublicPlayer }) {
  const c = view.case!;
  const role = view.private?.role;
  const [dark, setDark] = useState(false);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    sfx.drone();
    const t = setTimeout(() => {
      setDark(true);
      sfx.powerDown();
    }, 1700);
    return () => clearTimeout(t);
  }, []);

  const d = (s: number) => (skip ? 0 : s);
  const done = view.players.filter((p) => p.introDone).length;

  return (
    <div className={`intro ${dark ? 'is-dark' : ''}`}>
      <div className="intro__stage" aria-hidden="true">
        <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice">
          <defs>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe7b0" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffe7b0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="intro__beams">
            {[150, 300, 500, 650].map((x, i) => (
              <path key={x} d={`M${x} 30 L${x - 90 + i * 20} 300 L${x + 90 + i * 10} 300 Z`} fill="url(#beam)" />
            ))}
          </g>
          <rect x="60" y="22" width="680" height="10" fill="#1b2030" />
          {[150, 300, 500, 650].map((x) => (
            <rect key={x} x={x - 9} y="28" width="18" height="12" rx="2" fill="#2a3045" className="intro__lamp" />
          ))}
          <rect x="120" y="215" width="560" height="14" fill="#141826" />
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={10 + i * 20 + (i % 3) * 4} cy={282 + (i % 4) * 5} r={13 + (i % 3) * 2} fill="#070a12" />
          ))}
        </svg>
      </div>

      <div className="intro__copy">
        <motion.div className="intro__casenum" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d(0.2) }}>
          <span className="eyebrow">Case {c.number}</span>
          <span className="eyebrow">{c.festival}</span>
        </motion.div>
        <motion.h1
          className="intro__title display"
          initial={{ opacity: 0, letterSpacing: '0.2em', filter: 'blur(10px)' }}
          animate={{ opacity: 1, letterSpacing: '-0.02em', filter: 'blur(0px)' }}
          transition={{ delay: d(2.1), duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {c.title}
        </motion.h1>
        <motion.p className="intro__meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d(2.8) }}>
          {c.venue} · {c.date}
        </motion.p>

        <ul className="intro__symptoms">
          {c.symptoms.map((s, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: d(3.3 + i * 0.35) }}>
              <span className="intro__time">{s.time}</span>
              {s.label}
            </motion.li>
          ))}
        </ul>
        <motion.p className="intro__brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d(4.9) }}>
          {c.briefing[3]}
        </motion.p>
        <motion.p className="intro__dilemma display" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: d(5.5) }}>
          {c.dilemma}
        </motion.p>

        {role && (
          <motion.div
            className="intro__role panel panel--brass"
            initial={{ opacity: 0, y: 30, rotateX: 25 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: d(6.4), type: 'spring', stiffness: 160, damping: 20 }}
          >
            <span className="intro__roleicon" style={{ ['--pc' as string]: `var(--p${me.seat})` }}>
              <Icon name={ROLE_ICON[role.id]} size={30} />
            </span>
            <div>
              <div className="eyebrow">Your perspective</div>
              <div className="intro__rolename display">You are the {role.title}</div>
              <p className="muted">
                {role.post}. {role.perspective}
              </p>
            </div>
            {me.introDone ? (
              <span className="intro__waiting">
                <span className="live-dot" /> Opening… {done}/3 ready
              </span>
            ) : (
              <button
                className="btn btn--brass btn--lg"
                onClick={() => {
                  sfx.select();
                  void send('intro:done');
                }}
                data-testid="intro-done"
              >
                Open my evidence <Icon name="arrow" />
              </button>
            )}
          </motion.div>
        )}
      </div>

      {!skip && (
        <button className="intro__skip btn btn--ghost btn--sm" onClick={() => setSkip(true)}>
          Skip intro
        </button>
      )}
    </div>
  );
}
