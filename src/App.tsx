import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { Atmosphere } from './components/ui';
import { useStore } from './net/store';
import { Home } from './screens/Home';
import { Shell } from './screens/Shell';

export function App() {
  const { view, status, resuming, kicked, session } = useStore();

  // Keep the address bar on the shareable invite URL while in a room.
  useEffect(() => {
    if (view?.code && location.pathname !== `/r/${view.code}`) history.replaceState(null, '', `/r/${view.code}`);
  }, [view?.code]);

  return (
    <MotionConfig reducedMotion="user">
      {view ? (
        <Shell view={view} status={status} />
      ) : resuming || (session && status !== 'offline') ? (
        <>
          <Atmosphere urgency="calm" />
          <div className="boot" role="status">
            <span className="boot__spinner" />
            Reopening your case file…
          </div>
        </>
      ) : (
        <Home status={status} kicked={kicked} />
      )}
    </MotionConfig>
  );
}
