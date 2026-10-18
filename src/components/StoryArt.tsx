import type { StoryArt as Art } from '../../shared/protocol';
import './story-art.css';

/** Hand-drawn style illustrations for each step of the truth story. Pure SVG, no image files. */

const BRASS = '#e2b66b';
const INK = '#efe6d0';
const DIM = '#5d6480';
const RED = '#ff5a4e';
const AMBER = '#ffb43a';

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg className="sart" viewBox="0 0 200 130" role="img" aria-label={label}>
      <rect x="1" y="1" width="198" height="128" rx="12" fill="#0c1222" stroke="rgba(226,182,107,.28)" />
      {children}
    </svg>
  );
}

function PowerBox({ x, y, screen, screenColor = AMBER }: { x: number; y: number; screen: string; screenColor?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="58" height="80" rx="6" fill="#1a2238" stroke={BRASS} strokeWidth="1.6" />
      <rect x="7" y="8" width="44" height="18" rx="3" fill="#1b1503" stroke="#000" />
      <text x="29" y="20.5" textAnchor="middle" className="sart__lcd" fill={screenColor}>
        {screen}
      </text>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={10 + c * 14} y={34 + r * 13} width="10" height="9" rx="2" fill="#2a3352" />),
      )}
      <text x="29" y="-5" textAnchor="middle" className="sart__label">
        POWER BOX
      </text>
    </g>
  );
}

function Generator({ x, y, flat = false }: { x: number; y: number; flat?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="70" height="44" rx="5" fill="#1a2238" stroke={BRASS} strokeWidth="1.6" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={8 + i * 7} y1="10" x2={8 + i * 7} y2="34" stroke={DIM} strokeWidth="2" />
      ))}
      <rect x="44" y="10" width="18" height="10" rx="2" fill="#1b1503" />
      {/* battery */}
      <rect x="44" y="26" width="16" height="9" rx="1.5" fill="none" stroke={flat ? RED : INK} strokeWidth="1.3" />
      <rect x="60" y="28.5" width="2" height="4" fill={flat ? RED : INK} />
      <rect x="45.5" y="27.5" width={flat ? 2.5 : 12} height="6" fill={flat ? RED : BRASS} />
      <rect x="6" y="44" width="10" height="5" fill={DIM} />
      <rect x="54" y="44" width="10" height="5" fill={DIM} />
      <text x="35" y="60" textAnchor="middle" className="sart__label">
        GENERATOR
      </text>
    </g>
  );
}

function StageLights({ on }: { on: boolean }) {
  return (
    <g>
      <rect x="22" y="14" width="156" height="5" rx="2" fill="#2a3352" />
      {[50, 100, 150].map((x) => (
        <g key={x}>
          {on && <path d={`M${x - 5} 22 L${x - 24} 100 L${x + 24} 100 L${x + 5} 22 Z`} fill="url(#sart-beam)" className="sart__beam" />}
          <rect x={x - 6} y="17" width="12" height="8" rx="2" fill={on ? '#fff3d4' : '#2a3352'} className={on ? 'sart__lamp-on' : ''} />
          {!on && (
            <path d={`M${x - 4} 32 L${x + 4} 40 M${x + 4} 32 L${x - 4} 40`} stroke={RED} strokeWidth="1.6" strokeLinecap="round" />
          )}
        </g>
      ))}
      <rect x="30" y="98" width="140" height="6" fill="#1a2238" />
      {Array.from({ length: 13 }, (_, i) => (
        <circle key={i} cx={22 + i * 13} cy={120 + (i % 2) * 3} r={7 + (i % 3)} fill="#05070d" />
      ))}
    </g>
  );
}

const BeamDefs = () => (
  <defs>
    <linearGradient id="sart-beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffe7b0" stopOpacity="0.55" />
      <stop offset="1" stopColor="#ffe7b0" stopOpacity="0" />
    </linearGradient>
  </defs>
);

export function StoryArt({ art }: { art: Art }) {
  switch (art) {
    case 'schedule':
      return (
        <Frame label="A calendar marked Friday 9 PM next to the power box">
          <g transform="translate(22 22)">
            <rect width="76" height="86" rx="6" fill="#efe6d0" />
            <rect width="76" height="22" rx="6" fill="#b02a20" />
            <rect y="14" width="76" height="8" fill="#b02a20" />
            <text x="38" y="15.5" textAnchor="middle" className="sart__cal-head">
              FRIDAY
            </text>
            <text x="38" y="52" textAnchor="middle" className="sart__cal-big">
              9:00
            </text>
            <text x="38" y="66" textAnchor="middle" className="sart__cal-small">
              PM · CHECK-UP
            </text>
            <ellipse cx="38" cy="54" rx="32" ry="22" fill="none" stroke="#b02a20" strokeWidth="1.6" className="sart__circle" />
            <text x="38" y="80" textAnchor="middle" className="sart__cal-tiny">
              every week
            </text>
          </g>
          <path d="M104 64 L124 64" stroke={BRASS} strokeWidth="1.6" strokeDasharray="3 3" />
          <path d="M120 60 L126 64 L120 68" fill="none" stroke={BRASS} strokeWidth="1.6" />
          <PowerBox x={130} y={30} screen="FRI 9:00" />
        </Frame>
      );
    case 'charger':
      return (
        <Frame label="The generator's warning light blinks and its battery is flat">
          <g transform="translate(22 52)">
            <Generator x={0} y={0} flat />
          </g>
          {/* warning light */}
          <rect x="52" y="40" width="8" height="12" fill={DIM} />
          <circle cx="56" cy="34" r="8" fill={AMBER} className="sart__blink" />
          <g className="sart__waves" stroke={AMBER} strokeWidth="1.4" fill="none">
            <path d="M40 26 Q36 34 40 42" />
            <path d="M72 26 Q76 34 72 42" />
          </g>
          {/* broken charger plug */}
          <path d="M150 34 L150 52 M144 52 L156 52 L156 62 L144 62 Z" stroke={INK} strokeWidth="1.5" fill="none" />
          <path d="M150 62 L150 72 L144 78 L152 82 L146 90" stroke={RED} strokeWidth="1.8" fill="none" />
          <path d="M146 90 Q120 96 96 84" stroke={DIM} strokeWidth="1.6" fill="none" strokeDasharray="2 3" />
          <text x="150" y="26" textAnchor="middle" className="sart__label">
            CHARGER
          </text>
          <text x="166" y="108" textAnchor="middle" className="sart__time">
            6:40 PM
          </text>
        </Frame>
      );
    case 'warning':
      return (
        <Frame label="A warning popup on the sound desk screen is closed">
          {/* sound desk */}
          <path d="M20 108 L40 72 L160 72 L180 108 Z" fill="#1a2238" stroke={BRASS} strokeWidth="1.4" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i}>
              <line x1={52 + i * 12} y1="80" x2={50 + i * 12.5} y2="102" stroke={DIM} strokeWidth="1.5" />
              <rect x={47 + i * 12.3} y={86 + ((i * 7) % 12)} width="7" height="4" rx="1" fill={INK} />
            </g>
          ))}
          {/* screen with popup */}
          <rect x="56" y="14" width="88" height="52" rx="4" fill="#05070d" stroke={DIM} />
          <g className="sart__popup">
            <rect x="64" y="22" width="72" height="36" rx="3" fill="#efe6d0" />
            <rect x="64" y="22" width="72" height="8" rx="3" fill={AMBER} />
            <text x="100" y="40" textAnchor="middle" className="sart__pop-text">
              Check-up in
            </text>
            <text x="100" y="48" textAnchor="middle" className="sart__pop-text sart__pop-strong">
              4 minutes
            </text>
            <rect x="110" y="50" width="20" height="6" rx="1.5" fill="#1a2238" />
            <text x="120" y="54.6" textAnchor="middle" className="sart__pop-btn">
              CLOSE
            </text>
          </g>
          {/* cursor clicking close */}
          <path d="M124 55 L124 67 L127 64 L130 70 L132 69 L129 63 L133 63 Z" fill={INK} stroke="#000" strokeWidth="0.6" className="sart__cursor" />
          <text x="30" y="30" className="sart__time">
            9:00 PM
          </text>
        </Frame>
      );
    case 'blackout':
      return (
        <Frame label="The stage goes dark and the generator fails three times">
          <BeamDefs />
          <g className="sart__stage-out">
            <StageLights on />
          </g>
          <g className="sart__stage-dark">
            <StageLights on={false} />
            <text x="88" y="68" textAnchor="middle" className="sart__dark-text">
              STAGE DARK
            </text>
          </g>
          <g transform="translate(140 60)">
            <rect width="44" height="28" rx="4" fill="#1a2238" stroke={BRASS} strokeWidth="1.2" />
            <text x="22" y="18" textAnchor="middle" className="sart__fail">
              ✕ ✕ ✕
            </text>
            <text x="22" y="38" textAnchor="middle" className="sart__label">
              GENERATOR
            </text>
          </g>
          <text x="16" y="44" className="sart__time">
            9:04 PM
          </text>
        </Frame>
      );
    case 'visitor':
      return (
        <Frame label="Kabir runs into the unlocked electrical room">
          {/* corridor */}
          <path d="M10 10 L60 36 L60 100 L10 124 Z" fill="#141b2e" />
          <path d="M60 100 L150 100 L190 124 L10 124 Z" fill="#0a0f1c" />
          {/* door */}
          <rect x="120" y="30" width="40" height="70" fill="#05070d" stroke={BRASS} strokeWidth="1.4" />
          <path d="M120 30 L102 38 L102 104 L120 100 Z" fill="#2a3352" stroke={BRASS} strokeWidth="1.2" />
          <text x="140" y="26" textAnchor="middle" className="sart__label">
            ELECTRICAL ROOM
          </text>
          {/* open padlock */}
          <g transform="translate(166 50)">
            <rect width="16" height="13" rx="2" fill={BRASS} />
            <path d="M3 0 V-5 a5 5 0 0 1 10 0" fill="none" stroke={BRASS} strokeWidth="2" transform="rotate(-25 3 0)" />
          </g>
          <text x="174" y="76" textAnchor="middle" className="sart__label">
            UNLOCKED
          </text>
          {/* running hooded figure */}
          <g transform="translate(76 46)" className="sart__runner">
            <path d="M12 0 C4 0 1 7 2 13 C3 17 5 18 6 20 L4 44 L22 44 L20 20 C22 18 25 15 24 10 C24 4 19 0 12 0 Z" fill={INK} />
            <path d="M6 22 L-6 34 L-3 36 L9 26 Z" fill={INK} />
            <path d="M20 22 L32 30 L30 33 L18 26 Z" fill={INK} />
            <path d="M5 44 L-2 62 L4 63 L11 46 Z M15 46 L24 62 L29 59 L21 44 Z" fill={INK} />
            <text x="13" y="34" textAnchor="middle" className="sart__crew">
              CREW
            </text>
          </g>
          <path d="M60 70 L70 70 M56 80 L68 80 M60 90 L70 90" stroke={DIM} strokeWidth="1.5" />
          <text x="18" y="22" className="sart__time">
            9:06 PM
          </text>
        </Frame>
      );
    case 'fix':
      return (
        <Frame label="Kabir enters the code and the stage lights come back on">
          <BeamDefs />
          <g transform="translate(-6 0)" className="sart__lights-back">
            <g transform="scale(0.62) translate(0 6)">
              <StageLights on />
            </g>
          </g>
          <PowerBox x={128} y={30} screen="CANCELLED" screenColor="#8fe3b0" />
          <text x="157" y="122" textAnchor="middle" className="sart__code">
            • • • •
          </text>
          <path d="M108 68 L118 68" stroke={BRASS} strokeWidth="1.6" />
          <path d="M104 60 L96 74 L102 74 L98 86 L108 70 L102 70 Z" fill={AMBER} className="sart__bolt" />
          <text x="18" y="104" className="sart__time">
            9:15 PM
          </text>
        </Frame>
      );
  }
}
