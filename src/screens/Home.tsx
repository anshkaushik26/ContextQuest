import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { sfx } from '../audio/sfx';
import { Icon } from '../components/Icon';
import { Stopwatch } from '../components/Stopwatch';
import { Atmosphere, MuteButton } from '../components/ui';
import { clearKicked, createRoom, joinRoom, lastSession, rejoinLast, type ConnStatus } from '../net/store';
import './home.css';

const NAME_KEY = 'cq:name';

export function Home({ status, kicked }: { status: ConnStatus; kicked: string | null }) {
  const inviteCode = useMemo(() => location.pathname.match(/^\/r\/([A-Za-z]{4})/)?.[1]?.toUpperCase() ?? '', []);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(inviteCode);
  const [busy, setBusy] = useState<'create' | 'join' | 'rejoin' | null>(null);
  const [error, setError] = useState<string | null>(kicked);
  const last = lastSession();

  const saveName = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* ignore */
    }
  };

  const run = async (kind: 'create' | 'join' | 'rejoin') => {
    if (busy) return;
    setError(null);
    clearKicked();
    if (kind !== 'rejoin' && !name.trim()) {
      setError('Give yourself a name first — your teammates will see it.');
      sfx.error();
      return;
    }
    if (kind === 'join' && code.trim().length !== 4) {
      setError('Room codes are four letters.');
      sfx.error();
      return;
    }
    saveName();
    setBusy(kind);
    const r = kind === 'create' ? await createRoom(name.trim()) : kind === 'join' ? await joinRoom(code.trim(), name.trim()) : await rejoinLast();
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      sfx.error();
    } else sfx.join();
  };

  const offline = status !== 'online';

  return (
    <>
      <Atmosphere urgency="calm" />
      <div className="home">
        <header className="home__top">
          <span className="brandmark display">
            Context<em>Quest</em>
          </span>
          <MuteButton />
        </header>

        <section className="home__hero">
          <motion.div className="home__copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="eyebrow eyebrow--brass">A three-player mystery · about five minutes</div>
            <h1 className="home__title display">
              Three witnesses.
              <br />
              Nine clues.
              <br />
              <em>One shared truth.</em>
            </h1>
            <p className="home__lede">
              Each of you sees a different slice of the same incident. Form a theory alone, share <b>exactly one</b> clue, then rebuild what
              really happened together. The stopwatch records how fast you solve it.
            </p>

            <form
              className="home__form panel panel--brass"
              onSubmit={(e) => {
                e.preventDefault();
                void run(inviteCode || code ? 'join' : 'create');
              }}
            >
              <label className="home__label" htmlFor="name">
                Your investigator name
              </label>
              <input
                id="name"
                className="field"
                value={name}
                maxLength={18}
                autoComplete="nickname"
                placeholder="e.g. Asha"
                onChange={(e) => setName(e.target.value)}
                data-testid="name-input"
              />

              <div className="home__actions">
                {!inviteCode && (
                  <button
                    type="button"
                    className="btn btn--brass btn--lg"
                    disabled={offline || !!busy}
                    onClick={() => run('create')}
                    data-testid="create-room"
                  >
                    <Icon name="spark" /> {busy === 'create' ? 'Opening room…' : 'Create a case room'}
                  </button>
                )}
                <div className="home__join">
                  <input
                    className="field field--code"
                    value={code}
                    maxLength={4}
                    placeholder="CODE"
                    aria-label="Room code"
                    onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
                    data-testid="code-input"
                  />
                  <button
                    type="button"
                    className={`btn btn--lg ${inviteCode ? 'btn--brass' : ''}`}
                    disabled={offline || !!busy}
                    onClick={() => run('join')}
                    data-testid="join-room"
                  >
                    {busy === 'join' ? 'Joining…' : inviteCode ? `Join room ${inviteCode}` : 'Join'}
                    <Icon name="arrow" />
                  </button>
                </div>
              </div>

              {last && !busy && (
                <button type="button" className="home__rejoin" onClick={() => run('rejoin')}>
                  <Icon name="link" size={14} /> Rejoin room <b>{last.code}</b>
                  {last.name ? ` as ${last.name}` : ''}
                </button>
              )}
              {error && (
                <p className="home__error" role="alert">
                  {error}
                </p>
              )}
              {offline && <p className="home__status">Connecting to the game server…</p>}
            </form>
          </motion.div>

          <div className="home__side">
          <motion.figure
            className="home__proverb"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5 }}
          >
            <blockquote className="display">A little knowledge is a dangerous thing.</blockquote>
            <figcaption>— Alexander Pope</figcaption>
          </motion.figure>
          <motion.div
            className="home__art"
            initial={{ opacity: 0, scale: 0.92, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
            aria-hidden="true"
          >
            <div className="home__cards">
              <div className="home__card home__card--a">
                <span>A·1</span>Console log
              </div>
              <div className="home__card home__card--b">
                <span>B·2</span>Generator panel
              </div>
              <div className="home__card home__card--c">
                <span>C·1</span>CCTV · Cam 07
              </div>
            </div>
            <Stopwatch round={null} size="lg" className="home__watch" />
          </motion.div>
          </div>
        </section>

        <ol className="home__steps">
          {[
            ['Read', 'Three private clues each'],
            ['Commit', 'Lock a theory alone'],
            ['Reveal', 'Share exactly one card'],
            ['Rebuild', 'Order the timeline together'],
            ['Truth', 'See what really happened'],
          ].map(([t, d], i) => (
            <li key={t}>
              <span className="home__stepnum display">{i + 1}</span>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
