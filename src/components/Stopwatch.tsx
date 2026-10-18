import { createContext, memo, useContext, useEffect, useId, useMemo, useRef } from 'react';
import type { RoundInfo } from '../../shared/protocol';
import { serverNow } from '../net/clock';
import { computeClock, fmt, type ClockState } from '../hooks/useRoundClock';
import { useReducedMotion } from 'motion/react';
import './stopwatch.css';

const CX = 120;
const CY = 168;

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
}

const SUB = { cx: CX, cy: CY + 34, r: 21 };
/** Per-instance SVG id prefix: several stopwatches can be on the page (one may be display:none). */
const IdCtx = createContext('sw');
function subPolar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [SUB.cx + r * Math.cos(a), SUB.cy + r * Math.sin(a)] as const;
}

/** Static dial artwork — rendered once. */
const Dial = memo(function Dial() {
  const uid = useContext(IdCtx);
  const ticks = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < 300; i++) {
      const deg = i * 1.2;
      const major = i % 25 === 0;
      const sec = i % 5 === 0;
      const r1 = 85;
      const r2 = major ? 74 : sec ? 79 : 82.2;
      const [x1, y1] = polar(r1, deg);
      const [x2, y2] = polar(r2, deg);
      out.push(
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#2a2216"
          strokeWidth={major ? 1.6 : sec ? 0.9 : 0.35}
          strokeLinecap="round"
        />,
      );
    }
    return out;
  }, []);

  const numerals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const n = (i + 1) * 5;
        const [x, y] = polar(64, n * 6);
        return (
          <text key={n} x={x} y={y + 4} textAnchor="middle" className="sw-numeral">
            {n}
          </text>
        );
      }),
    [],
  );

  const sub = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let m = 0; m < 15; m++) {
      const deg = m * 24;
      const major = m % 5 === 0;
      const [x1, y1] = subPolar(SUB.r - 1, deg);
      const [x2, y2] = subPolar(SUB.r - (major ? 6 : 3), deg);
      out.push(<line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2216" strokeWidth={major ? 1.1 : 0.45} />);
    }
    for (const n of [5, 10, 15]) {
      const [x, y] = subPolar(SUB.r - 11, (n % 15) * 24);
      out.push(
        <text key={`n${n}`} x={x} y={y + 2.6} textAnchor="middle" className="sw-subnum">
          {n}
        </text>,
      );
    }
    return out;
  }, []);

  return (
    <g>
      <circle cx={CX} cy={CY} r={87} fill={`url(#${uid}-dial)`} />
      <circle cx={CX} cy={CY} r={87} fill={`url(#${uid}-dial-grain)`} opacity={0.5} />
      <circle cx={CX} cy={CY} r={85.4} fill="none" stroke="#2a2216" strokeWidth={0.6} />
      <circle cx={CX} cy={CY} r={71.5} fill="none" stroke="#2a2216" strokeWidth={0.35} opacity={0.6} />
      {ticks}
      {numerals}
      <text x={CX} y={CY - 38} textAnchor="middle" className="sw-brand">
        CONTEXT QUEST
      </text>
      <text x={CX} y={CY - 29} textAnchor="middle" className="sw-sub">
        CASE CHRONOMETER · 1/5 SEC
      </text>
      <circle cx={SUB.cx} cy={SUB.cy} r={SUB.r + 1.5} fill={`url(#${uid}-sub)`} stroke="#2a2216" strokeWidth={0.6} />
      {/* pace zones on the minute register: 0–5 well done, 5–10 fair, 10–15 slow */}
      {[
        ['#3f9c6a', 0],
        ['#c9922f', 120],
        ['#c0392b', 240],
      ].map(([color, start]) => {
        const r = SUB.r - 0.8;
        const [x1, y1] = subPolar(r, (start as number) + 2);
        const [x2, y2] = subPolar(r, (start as number) + 118);
        return <path key={color as string} d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={color as string} strokeWidth={1.8} opacity={0.85} />;
      })}
      {sub}
      <text x={SUB.cx} y={SUB.cy + 13} textAnchor="middle" className="sw-sub">
        MIN
      </text>
    </g>
  );
});

interface Props {
  round: RoundInfo | null;
  size?: 'lg' | 'md' | 'sm';
  /** Increment to make the crown click (start, one-minute, case filed). */
  pressKey?: number;
  className?: string;
}

export function Stopwatch({ round, size = 'lg', pressKey = 0, className = '' }: Props) {
  const secHand = useRef<SVGGElement>(null);
  const minHand = useRef<SVGGElement>(null);
  const crown = useRef<SVGGElement>(null);
  const digits = useRef<SVGTextElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const live = useRef({ round });
  live.current = { round };

  // Drive the hands straight from the server-synced clock every frame (no React renders).
  useEffect(() => {
    let raf = 0;
    let lastText = '';
    let lastState: ClockState | '' = '';
    const mountedAt = Date.now();
    const frame = () => {
      const r = live.current.round;
      const c = computeClock(r, serverNow());
      // With no round, the hand still sweeps (decoratively) from when the watch appeared.
      const elapsed = r ? c.elapsed : Date.now() - mountedAt;
      const e = elapsed / 1000;
      // Continuous sweep; reduced-motion users get a once-a-second step instead.
      const sec = reduced ? Math.floor(e) : e;
      secHand.current?.setAttribute('transform', `rotate(${(sec % 60) * 6} ${CX} ${CY})`);
      // Minute register: one turn = 15 minutes.
      const minAngle = ((elapsed / 60_000) * 24) % 360;
      minHand.current?.setAttribute('transform', `rotate(${minAngle} ${SUB.cx} ${SUB.cy})`);
      const text = r ? fmt(c.elapsed) : 'READY';
      if (text !== lastText && digits.current) {
        digits.current.textContent = text;
        lastText = text;
      }
      const state: ClockState = r ? c.state : 'idle';
      if (state !== lastState && root.current) {
        root.current.dataset.state = state;
        lastState = state;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Crown press.
  useEffect(() => {
    if (!pressKey || !crown.current) return;
    const el = crown.current;
    el.classList.remove('is-pressed');
    void el.getBoundingClientRect();
    el.classList.add('is-pressed');
  }, [pressKey]);

  const label = round ? 'Time spent on the case' : 'Stopwatch';

  return (
    <div ref={root} className={`sw sw--${size} ${className}`} data-state="idle" role="timer" aria-label={label}>
      <svg viewBox="0 0 240 284" className="sw-svg" aria-hidden="true">
        <defs>
          <radialGradient id={`${uid}-case`} cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#fff1c9" />
            <stop offset="0.18" stopColor="#e9c27a" />
            <stop offset="0.5" stopColor="#b58434" />
            <stop offset="0.82" stopColor="#6c4b17" />
            <stop offset="1" stopColor="#3b2808" />
          </radialGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7dca2" />
            <stop offset="0.35" stopColor="#a87a2f" />
            <stop offset="0.65" stopColor="#5b3f12" />
            <stop offset="1" stopColor="#d6aa5c" />
          </linearGradient>
          <radialGradient id={`${uid}-dial`} cx="45%" cy="38%" r="70%">
            <stop offset="0" stopColor="#fbf4e3" />
            <stop offset="0.7" stopColor="#ece0c2" />
            <stop offset="1" stopColor="#cdbb93" />
          </radialGradient>
          <radialGradient id={`${uid}-sub`} cx="50%" cy="40%" r="70%">
            <stop offset="0" stopColor="#efe4c8" />
            <stop offset="1" stopColor="#d9c9a2" />
          </radialGradient>
          <pattern id={`${uid}-dial-grain`} width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.35" fill="#b9a67c" opacity="0.35" />
          </pattern>
          <linearGradient id={`${uid}-glass`} x1="0.15" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.28" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0f1d48" />
            <stop offset="0.5" stopColor="#2f4fa8" />
            <stop offset="1" stopColor="#0f1d48" />
          </linearGradient>
          <filter id={`${uid}-hand-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="1.2" dy="2" stdDeviation="1.1" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <filter id={`${uid}-case-shadow`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#000" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* bow, crown, pushers */}
        <g filter={`url(#${uid}-case-shadow)`}>
          <circle cx={CX} cy={20} r={14} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth={6.5} />
          <circle cx={CX} cy={20} r={14} fill="none" stroke="#fff3cf" strokeOpacity={0.35} strokeWidth={1} />
          <rect x={CX - 9} y={46} width={18} height={20} rx={2} fill={`url(#${uid}-rim)`} />
          <g ref={crown} className="sw-crown">
            <rect x={CX - 17} y={32} width={34} height={17} rx={4} fill={`url(#${uid}-rim)`} stroke="#4a3310" strokeWidth={0.8} />
            {Array.from({ length: 10 }, (_, i) => (
              <line key={i} x1={CX - 14 + i * 3.1} y1={34} x2={CX - 14 + i * 3.1} y2={47} stroke="#4a3310" strokeOpacity={0.55} strokeWidth={0.9} />
            ))}
          </g>
          <rect x={CX - 6} y={52} width={12} height={16} rx={2.5} fill={`url(#${uid}-rim)`} transform={`rotate(-40 ${CX} ${CY})`} />
          <rect x={CX - 6} y={52} width={12} height={16} rx={2.5} fill={`url(#${uid}-rim)`} transform={`rotate(40 ${CX} ${CY})`} />
          <circle cx={CX} cy={CY} r={106} fill={`url(#${uid}-case)`} />
        </g>
        <circle cx={CX} cy={CY} r={100.5} fill="none" stroke="#3a2707" strokeWidth={1.4} opacity={0.7} />
        <circle cx={CX} cy={CY} r={96} fill={`url(#${uid}-rim)`} />
        <circle cx={CX} cy={CY} r={96} fill="none" stroke="#fff4d6" strokeOpacity={0.3} strokeWidth={0.8} />
        <circle cx={CX} cy={CY} r={89.5} fill="#2b1d07" />

        <IdCtx.Provider value={uid}>
          <Dial />
        </IdCtx.Provider>

        {/* minute register hand */}
        <g ref={minHand} filter={`url(#${uid}-hand-shadow)`}>
          <path d={`M${SUB.cx - 1.3} ${SUB.cy + 4} L${SUB.cx} ${SUB.cy - SUB.r + 2.5} L${SUB.cx + 1.3} ${SUB.cy + 4} Z`} fill="#8b1c14" />
          <circle cx={SUB.cx} cy={SUB.cy} r={2.4} fill="#8b1c14" />
        </g>

        {/* seconds hand */}
        <g ref={secHand} filter={`url(#${uid}-hand-shadow)`}>
          <path
            d={`M${CX - 2.2} ${CY + 22} L${CX - 0.9} ${CY - 82} L${CX} ${CY - 85} L${CX + 0.9} ${CY - 82} L${CX + 2.2} ${CY + 22} Z`}
            fill={`url(#${uid}-steel)`}
          />
          <circle cx={CX} cy={CY + 22} r={4.6} fill="none" stroke={`url(#${uid}-steel)`} strokeWidth={2.2} />
          <path d={`M${CX - 1.1} ${CY - 70} L${CX} ${CY - 85} L${CX + 1.1} ${CY - 70} Z`} fill="#c0392b" />
        </g>
        <circle cx={CX} cy={CY} r={5.4} fill={`url(#${uid}-rim)`} stroke="#3a2707" strokeWidth={0.6} />
        <circle cx={CX} cy={CY} r={1.8} fill="#1c1408" />

        {/* aperture with the remaining time */}
        <g className="sw-aperture">
          <rect x={CX - 31} y={CY + 9 - 26} width={62} height={21} rx={3.5} fill="#0b0f1a" stroke="#8f6a2f" strokeWidth={1.2} />
          <rect x={CX - 31} y={CY + 9 - 26} width={62} height={8} rx={3.5} fill="#fff" opacity={0.05} />
          <text ref={digits} x={CX} y={CY + 9 - 10.2} textAnchor="middle" className="sw-digits">
            READY
          </text>
        </g>

        {/* glass */}
        <circle cx={CX} cy={CY} r={89.5} fill={`url(#${uid}-glass)`} pointerEvents="none" />
        <path
          d={`M${CX - 70} ${CY - 30} A 78 78 0 0 1 ${CX + 18} ${CY - 84}`}
          fill="none"
          stroke="#fff"
          strokeOpacity={0.35}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
