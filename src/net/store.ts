import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { Ack, ClientToServer, RoomView, ServerToClient, SessionInfo } from '../../shared/protocol';
import { addSample, hintServerTime, resetClock } from './clock';

export type ConnStatus = 'connecting' | 'online' | 'offline';

interface StoreState {
  status: ConnStatus;
  view: RoomView | null;
  session: SessionInfo | null;
  /** True while we hold a saved session but haven't heard back from the server yet. */
  resuming: boolean;
  kicked: string | null;
}

const SESSION_KEY = 'cq:session';
const LAST_KEY = 'cq:last';

const read = (s: Storage, k: string) => {
  try {
    const raw = s.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const write = (s: Storage, k: string, v: unknown) => {
  try {
    if (v === null) s.removeItem(k);
    else s.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable — sessions just won't survive refresh */
  }
};

// sessionStorage is per tab, so three tabs in one browser are three independent players.
const saved: SessionInfo | null = read(sessionStorage, SESSION_KEY);

let state: StoreState = {
  status: 'connecting',
  view: null,
  session: saved,
  resuming: !!saved,
  kicked: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<StoreState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const socket: Socket<ServerToClient, ClientToServer> = io({
  transports: ['websocket', 'polling'],
  reconnectionDelay: 400,
  reconnectionDelayMax: 3000,
});

function syncClock() {
  resetClock();
  let n = 0;
  const ping = () => {
    const t0 = Date.now();
    socket.emit('time:sync', { t0 }, (r) => {
      addSample(r.t0, r.server, Date.now());
      if (++n < 6) setTimeout(ping, 120);
    });
  };
  ping();
}

function remember(s: SessionInfo | null, name?: string) {
  write(sessionStorage, SESSION_KEY, s);
  if (s) write(localStorage, LAST_KEY, { ...s, name, savedAt: Date.now() });
}

function resume() {
  const s = state.session;
  if (!s) return;
  set({ resuming: true });
  socket.emit('room:resume', { code: s.code, token: s.token }, (r) => {
    if (r.ok) set({ resuming: false, kicked: null });
    else {
      remember(null);
      set({ session: null, view: null, resuming: false });
    }
  });
}

socket.on('connect', () => {
  set({ status: 'online' });
  syncClock();
  resume();
});
socket.on('disconnect', () => set({ status: 'offline' }));
socket.io.on('reconnect_attempt', () => set({ status: 'connecting' }));
socket.on('state', (view) => {
  hintServerTime(view.serverNow);
  set({ view });
  const me = view.players.find((p) => p.id === view.you);
  if (me && state.session) write(localStorage, LAST_KEY, { ...state.session, name: me.name, savedAt: Date.now() });
});
socket.on('kicked', ({ reason }) => {
  remember(null);
  set({ kicked: reason, view: null, session: null });
});

export function useStore(): StoreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Emit with an ack, as a promise. Times out instead of hanging if the server is unreachable. */
export function send<E extends keyof ClientToServer>(
  event: E,
  ...payload: Parameters<ClientToServer[E]> extends [infer P, unknown] ? [P] : []
): Promise<Ack> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, code: 'TIMEOUT', error: 'The server did not answer. Check your connection.' }), 6000);
    const done = (r: Ack) => {
      clearTimeout(timer);
      resolve(r);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.emit as any)(event, ...payload, done);
  });
}

/** Fire-and-forget presence signals (selecting, holding a tile). */
export function signal<E extends 'reveal:selecting' | 'timeline:hold'>(event: E, payload: Parameters<ClientToServer[E]>[0]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (socket.emit as any)(event, payload);
}

function enter(r: Ack<SessionInfo>, name: string) {
  if (r.ok) {
    const s = { code: r.code, token: r.token, playerId: r.playerId };
    remember(s, name);
    set({ session: s, kicked: null });
  }
  return r;
}

export function createRoom(name: string): Promise<Ack<SessionInfo>> {
  return new Promise((resolve) => socket.emit('room:create', { name }, (r) => resolve(enter(r, name))));
}

export function joinRoom(code: string, name: string): Promise<Ack<SessionInfo>> {
  return new Promise((resolve) => socket.emit('room:join', { code, name }, (r) => resolve(enter(r, name))));
}

/** Re-open the seat this browser last held (e.g. after closing the tab). */
export function rejoinLast(): Promise<Ack<SessionInfo>> {
  const last = lastSession();
  if (!last) return Promise.resolve({ ok: false, code: 'NO_SESSION', error: 'Nothing to rejoin.' });
  return new Promise((resolve) =>
    socket.emit('room:resume', { code: last.code, token: last.token }, (r) => {
      if (!r.ok) write(localStorage, LAST_KEY, null);
      resolve(enter(r, last.name ?? ''));
    }),
  );
}

export function lastSession(): (SessionInfo & { name?: string; savedAt: number }) | null {
  const l = read(localStorage, LAST_KEY);
  if (!l || Date.now() - l.savedAt > 2 * 60 * 60_000) return null;
  return l;
}

export async function leaveRoom() {
  await send('room:leave');
  remember(null);
  write(localStorage, LAST_KEY, null);
  history.replaceState(null, '', '/');
  set({ session: null, view: null });
}

export function clearKicked() {
  set({ kicked: null });
}
