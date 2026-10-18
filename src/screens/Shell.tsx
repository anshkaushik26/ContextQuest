import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '../../shared/protocol';
import { applyRoundMix } from '../audio/mix';
import { sfx } from '../audio/sfx';
import { ChatProvider, ChatRail, ChatSheet } from '../components/Chat';
import { DemoDock } from '../components/DemoDock';
import { InspectorProvider } from '../components/Inspector';
import { Stopwatch } from '../components/Stopwatch';
import { ActivityFeed, Atmosphere, MuteButton, PlayerSeat, StageRail } from '../components/ui';
import { fmt, useRoundClock } from '../hooks/useRoundClock';
import type { ConnStatus } from '../net/store';
import { leaveRoom } from '../net/store';
import { BoardPhase } from './BoardPhase';
import { EvidencePhase } from './EvidencePhase';
import { Intro } from './Intro';
import { Lobby } from './Lobby';
import { RevealPhase } from './RevealPhase';
import { TruthPhase } from './TruthPhase';
import './shell.css';

export function Shell({ view, status }: { view: RoomView; status: ConnStatus }) {
  const clock = useRoundClock(view.round);
  const [pressKey, setPressKey] = useState(0);
  const prev = useRef({ phase: view.phase, round: view.round?.number });

  // The crown clicks when the stopwatch starts and when the case is filed.
  useEffect(() => {
    const p = prev.current;
    if (view.round && p.round !== view.round.number) {
      setPressKey((k) => k + 1);
      // A round just started (not a refresh mid-game): music down, effects up.
      if (view.phase === 'intro') applyRoundMix();
    }
    if (p.phase === 'board' && view.phase === 'truth') {
      setPressKey((k) => k + 1);
      sfx.click();
    }
    prev.current = { phase: view.phase, round: view.round?.number };
  }, [view.phase, view.round]);

  const me = view.players.find((p) => p.id === view.you)!;
  const inRound = view.phase !== 'lobby';
  const chatOpen = view.phase === 'board' || view.phase === 'truth';
  const closed = clock.state === 'closed';

  return (
    <InspectorProvider>
      <ChatProvider>
        <Atmosphere urgency="calm" />
        <div className={`shell ${inRound ? 'shell--round' : 'shell--lobby'} ${chatOpen ? 'shell--chat' : ''}`} data-phase={view.phase}>
          <header className="topbar">
            <div className="topbar__brand">
              <span className="brandmark display">
                Context<em>Quest</em>
              </span>
              {view.case && inRound && (
                <span className="topbar__case">
                  <span className="eyebrow">Case {view.case.number}</span>
                  <span className="topbar__title display">{view.case.title}</span>
                </span>
              )}
            </div>
            {inRound && <StageRail view={view} />}
            <div className="topbar__tools">
              {status !== 'online' && (
                <span className="chip chip--warn" role="status">
                  <span className="live-dot" style={{ background: 'var(--miss)' }} /> Reconnecting…
                </span>
              )}
              <span className="chip topbar__room" title="Room code">
                Room <b>{view.code}</b>
              </span>
              <MuteButton />
              {view.phase === 'lobby' && (
                <button className="btn btn--ghost btn--sm" onClick={() => leaveRoom()}>
                  Leave
                </button>
              )}
            </div>
          </header>

          {inRound && (
            <div className="hud-mobile">
              <Stopwatch round={view.round} size="sm" pressKey={pressKey} />
              <div className="hud-mobile__time">
                <b>{fmt(clock.elapsed)}</b>
                <span>{closed ? 'solved in' : 'on the case'}</span>
              </div>
              <div className="hud-mobile__seats">
                {view.players.map((p) => (
                  <PlayerSeat key={p.id} view={view} player={p} compact />
                ))}
              </div>
            </div>
          )}

          <div className="shell__body">
            {inRound && (
              <aside className="rail">
                <div className="rail__watch">
                  <Stopwatch round={view.round} size={chatOpen ? 'md' : 'lg'} pressKey={pressKey} />
                  <div className={`rail__time ${closed ? 'is-closed' : ''}`}>
                    <span className="eyebrow">{closed ? 'Solved in' : 'Time on the case'}</span>
                    <b>{fmt(clock.elapsed)}</b>
                  </div>
                </div>
                <div className="rail__seats">
                  <div className="eyebrow">Investigators</div>
                  {view.players.map((p) => (
                    <PlayerSeat key={p.id} view={view} player={p} compact={chatOpen} />
                  ))}
                </div>
                {chatOpen ? <ChatRail view={view} me={me} /> : <ActivityFeed items={view.activity} players={view.players} />}
              </aside>
            )}

            <main className="stage" id="main">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view.phase}
                  className="stage__inner"
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                  transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {view.phase === 'lobby' && <Lobby view={view} me={me} />}
                  {view.phase === 'intro' && <Intro view={view} me={me} />}
                  {view.phase === 'evidence' && <EvidencePhase view={view} me={me} />}
                  {view.phase === 'reveal' && <RevealPhase view={view} me={me} />}
                  {view.phase === 'board' && <BoardPhase view={view} me={me} />}
                  {view.phase === 'truth' && <TruthPhase view={view} me={me} />}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
          {chatOpen && <ChatSheet view={view} me={me} />}
          <DemoDock view={view} me={me} />
        </div>
      </ChatProvider>
    </InspectorProvider>
  );
}
