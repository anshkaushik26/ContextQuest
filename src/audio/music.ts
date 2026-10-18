// Background soundtrack.
// - One <audio> element for the whole app (module singleton, survives HMR), so it never doubles up.
// - Lives outside React, so it plays continuously across every game stage.
// - Starts only from a user gesture (browser autoplay rules), fades in, loops.
// - Mute + volume persist in localStorage. Errors never throw; they show up as a status.

import { useSyncExternalStore } from 'react';

export const MUSIC_SRC = '/audio/context-quest.mp3';
const VOL_KEY = 'cq:musicVolume';
const ON_KEY = 'cq:musicOn';

export type MusicStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'unavailable';

export interface MusicState {
  on: boolean;
  volume: number; // 0..1
  status: MusicStatus;
}

const readNum = (k: string, d: number) => {
  try {
    const v = localStorage.getItem(k);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
  } catch {
    return d;
  }
};
const readBool = (k: string, d: boolean) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

let state: MusicState = { on: readBool(ON_KEY, true), volume: readNum(VOL_KEY, 0.35), status: 'idle' };
const listeners = new Set<() => void>();
const set = (patch: Partial<MusicState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

type Win = Window & { __cqMusic?: HTMLAudioElement };

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const w = window as Win;
  if (w.__cqMusic) return w.__cqMusic;
  const a = new Audio();
  a.src = MUSIC_SRC;
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  a.addEventListener('playing', () => set({ status: 'playing' }));
  a.addEventListener('pause', () => {
    if (state.status !== 'unavailable') set({ status: state.on ? 'blocked' : 'paused' });
  });
  a.addEventListener('waiting', () => state.status !== 'playing' && set({ status: 'loading' }));
  a.addEventListener('error', () => {
    set({ status: 'unavailable' });
    console.warn('[context-quest] soundtrack could not be loaded:', a.error?.message ?? a.error?.code);
  });
  w.__cqMusic = a;
  return a;
}

let fadeRaf = 0;
function fadeTo(target: number, ms = 1200, then?: () => void) {
  const a = element();
  if (!a) return;
  cancelAnimationFrame(fadeRaf);
  const from = a.volume;
  const t0 = performance.now();
  const step = (t: number) => {
    // rAF timestamps can precede t0; clamp so we never extrapolate outside [0, 1].
    const p = Math.min(1, Math.max(0, (t - t0) / ms));
    a.volume = Math.min(1, Math.max(0, from + (target - from) * p));
    if (p < 1) fadeRaf = requestAnimationFrame(step);
    else then?.();
  };
  fadeRaf = requestAnimationFrame(step);
}

function play() {
  const a = element();
  if (!a || state.status === 'unavailable') return;
  if (!a.paused) {
    fadeTo(state.volume, 400);
    return;
  }
  if (state.status !== 'playing') set({ status: 'loading' });
  a.volume = 0;
  a.play()
    .then(() => fadeTo(state.volume))
    .catch((e: DOMException) => {
      // NotAllowedError = autoplay policy; we'll retry on the next user gesture.
      if (e?.name === 'NotAllowedError') set({ status: 'blocked' });
      else if (e?.name !== 'AbortError') set({ status: 'unavailable' });
    });
}

/** Call from a user gesture. Safe to call any number of times. */
export function startMusic() {
  if (!state.on) return;
  const a = element();
  // Trust the element, not our status label: retry whenever it isn't actually playing.
  if (a && a.paused) play();
}

export function setMusicOn(on: boolean) {
  save(ON_KEY, on ? '1' : '0');
  set({ on });
  const a = element();
  if (!a) return;
  if (on) play();
  else fadeTo(0, 400, () => a.pause());
}

export function setMusicVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  save(VOL_KEY, String(v));
  set({ volume: v });
  const a = element();
  if (a && !a.paused) {
    cancelAnimationFrame(fadeRaf);
    a.volume = v;
  }
  if (v > 0 && !state.on) setMusicOn(true);
}

/**
 * Set the level without switching the soundtrack on (used when a round starts).
 * Fades if it is playing; the player can change it again afterwards.
 */
export function setMusicLevel(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  save(VOL_KEY, String(v));
  set({ volume: v });
  const a = element();
  if (a && !a.paused) fadeTo(v, 1500);
}

export function useMusic(): MusicState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
