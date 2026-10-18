import type { EventId, EvidenceCard as Card, RefLine } from '../../../shared/protocol';
import './evidence.css';

const hl = (l: RefLine, h?: EventId | null) => (h && l.refs?.includes(h) ? ' is-hl' : '');

function CctvScene() {
  return (
    <svg viewBox="0 0 300 170" className="cctv__scene" aria-hidden="true">
      <rect width="300" height="170" fill="#2b2f2c" />
      <path d="M0 0 L95 45 L95 125 L0 170 Z" fill="#3c413d" />
      <path d="M300 0 L205 45 L205 125 L300 170 Z" fill="#353a36" />
      <path d="M95 125 L205 125 L300 170 L0 170 Z" fill="#232624" />
      <path d="M95 45 L205 45 L205 125 L95 125 Z" fill="#1b1e1c" />
      {[0.2, 0.45, 0.7].map((t, i) => (
        <line key={i} x1={95 - 95 * t} y1={125 + 45 * t} x2={205 + 95 * t} y2={125 + 45 * t} stroke="#2e322f" />
      ))}
      <rect x="132" y="50" width="36" height="5" fill="#555c57" />
      {/* door on the right wall, wedged open */}
      <path d="M232 30 L270 12 L270 150 L232 136 Z" fill="#4a504b" stroke="#6b726c" />
      <path d="M232 30 L214 40 L214 128 L232 136 Z" fill="#101211" />
      <rect x="238" y="40" width="24" height="10" fill="#c9cfc9" transform="skewY(-25)" opacity="0.8" />
      <rect x="226" y="122" width="7" height="18" rx="2" fill="#8e9590" />
      <rect x="228" y="118" width="3" height="5" fill="#6f7672" />
      {/* figure in hoodie */}
      <g transform="translate(196 58)">
        <path d="M14 0 C4 0 0 9 1 17 C2 22 5 24 6 26 L2 60 L26 60 L23 26 C25 23 28 20 27 14 C27 6 22 0 14 0 Z" fill="#0d0f0e" />
        <path d="M6 26 L-6 46 L-2 48 L9 32 Z" fill="#0d0f0e" />
        <path d="M5 60 L4 86 L10 86 L13 62 Z M16 62 L18 86 L24 86 L23 60 Z" fill="#0d0f0e" />
        <text x="8" y="44" fontSize="5" fill="#7a817c" fontFamily="monospace">CREW</text>
      </g>
      <rect width="300" height="170" fill="url(#cctv-lines)" />
      <defs>
        <pattern id="cctv-lines" width="2" height="3" patternUnits="userSpaceOnUse">
          <rect width="2" height="1" fill="#000" opacity="0.25" />
        </pattern>
      </defs>
      <circle cx="244" cy="96" r="30" fill="none" stroke="#e8463b" strokeWidth="2" strokeDasharray="5 3" />
    </svg>
  );
}

function Body({ card, highlight }: { card: Card; highlight?: EventId | null }) {
  const b = card.body;
  switch (b.kind) {
    case 'log':
      return (
        <div className="log">
          <div className="log__head">{b.header}</div>
          {b.lines.map((l, i) => (
            <div key={i} className={`log__line${hl(l, highlight)}`}>
              <span className="log__t">{l.time}</span>
              <span className="log__tag">{l.tag}</span>
              <span className="log__x">{l.text}</span>
            </div>
          ))}
        </div>
      );
    case 'cuesheet':
      return (
        <div className="cues">
          <div className="cues__head">{b.header}</div>
          <table>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.cue}>
                  <td>{r.cue}</td>
                  <td>{r.item}</td>
                  <td>{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cues__notes">
            {b.notes.map((n, i) => (
              <p key={i} className={`pen${hl(n, highlight)}`} style={{ transform: `rotate(${(i % 3) - 1}deg)` }}>
                {n.text}
              </p>
            ))}
          </div>
        </div>
      );
    case 'email':
      return (
        <div className="mail">
          <dl>
            <dt>From</dt>
            <dd>{b.from}</dd>
            <dt>To</dt>
            <dd>{b.to}</dd>
            <dt>Date</dt>
            <dd>{b.date}</dd>
            <dt>Subject</dt>
            <dd>
              <b>{b.subject}</b>
            </dd>
          </dl>
          {b.paragraphs.map((p, i) => (
            <p key={i} className={hl(p, highlight).trim()}>
              {p.text}
            </p>
          ))}
          <p className="mail__sig">{b.signature}</p>
          <span className="stamp mail__stamp">{b.stamp}</span>
        </div>
      );
    case 'notebook':
      return (
        <div className="note">
          <div className="note__head">{b.heading}</div>
          {b.lines.map((l, i) => (
            <p key={i} className={hl(l, highlight).trim()}>
              {l.text}
            </p>
          ))}
        </div>
      );
    case 'panel':
      return (
        <div className="polaroid">
          <div className="polaroid__photo">
            <div className="lcd">
              <div className="lcd__device">{b.device}</div>
              <div className="lcd__status">{b.status}</div>
              {b.lines.map((l, i) => (
                <div key={i} className={`lcd__line${hl(l, highlight)}`}>
                  {l.text}
                </div>
              ))}
            </div>
            <div className="lcd__leds">
              <span className="led led--red" />
              <span className="led led--amber" />
              <span className="led" />
            </div>
          </div>
          <p className="polaroid__note">{b.annotation} ↖</p>
        </div>
      );
    case 'chat':
      return (
        <div className="phone">
          <div className="phone__bar">
            <span>{b.group}</span>
            <span>5 members</span>
          </div>
          <div className="phone__msgs">
            {b.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.mine ? 'bubble--me' : ''}${hl(m, highlight)}`}>
                {!m.mine && <span className="bubble__who">{m.who}</span>}
                <span>{m.text}</span>
                <span className="bubble__t">{m.time}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'cctv':
      return (
        <div className="cctv">
          <div className="cctv__frame">
            <CctvScene />
            <span className="cctv__cam">{b.camera}</span>
            <span className="cctv__stamp">{b.stamp}</span>
            <span className="cctv__rec">● REC</span>
            <div className="cctv__inset">
              <span>{b.inset.stamp}</span>
              {b.inset.caption}
            </div>
          </div>
          <ul className="cctv__notes">
            {b.annotations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="cctv__log">
            <div className="cctv__loghead">ACCESS LOG · ELEC RM DOOR</div>
            {b.log.map((l, i) => (
              <div key={i} className={`cctv__logline${hl(l, highlight)}`}>
                <span>{l.time}</span> {l.text}
              </div>
            ))}
          </div>
        </div>
      );
    case 'radio':
      return (
        <div className="radio">
          <div className="radio__head">{b.channel}</div>
          {b.entries.map((e, i) => (
            <div key={i} className={`radio__row${hl(e, highlight)}`}>
              <span className="radio__t">{e.time}</span>
              <span className="radio__who">{e.who}</span>
              <span className="radio__x">{e.text}</span>
            </div>
          ))}
        </div>
      );
    case 'report':
      return (
        <div className="form">
          <div className="form__head">INCIDENT REPORT · SECURITY</div>
          <div className="form__fields">
            {b.fields.map((f) => (
              <div key={f.label} className="form__field">
                <span>{f.label}</span>
                <b className="pen">{f.value}</b>
              </div>
            ))}
          </div>
          <div className="form__lines">
            {b.narrative.map((n, i) => (
              <p key={i} className={`pen${hl(n, highlight)}`}>
                {n.text}
              </p>
            ))}
          </div>
          <span className="stamp form__stamp">{b.recommendation}</span>
        </div>
      );
  }
}

export interface EvidenceCardProps {
  card: Card;
  size?: 'hand' | 'board' | 'full' | 'mini';
  highlight?: EventId | null;
  sharedBy?: { name: string; seat: number } | null;
  className?: string;
}

export function EvidenceCard({ card, size = 'hand', highlight, sharedBy, className = '' }: EvidenceCardProps) {
  return (
    <article
      className={`ev ev--${card.body.kind} ev--${size} ${className}`}
      data-card={card.id}
      style={sharedBy ? { ['--pc' as string]: `var(--p${sharedBy.seat})` } : undefined}
    >
      <header className="ev__tag">
        <span className="ev__code">{card.code}</span>
        <span className="ev__src">{card.source}</span>
      </header>
      <h3 className="ev__title">{card.title}</h3>
      <div className="ev__when">{card.when}</div>
      <div className="ev__body">
        <Body card={card} highlight={highlight} />
      </div>
      {sharedBy && (
        <footer className="ev__by">
          <span className="ev__by-dot" /> Shared by {sharedBy.name}
        </footer>
      )}
    </article>
  );
}
