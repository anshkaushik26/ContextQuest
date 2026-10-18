// Every sound is synthesised with WebAudio: no files to load, nothing to 404.
// Audio only starts after a user gesture, and the game never relies on it.

import { useSyncExternalStore } from 'react';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const MUTE_KEY = 'cq:muted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const VOL_KEY = 'cq:sfxVolume';
/** Sound-effects volume, 0..1. Default matches the original mix. */
let volume = (() => {
  try {
    const n = Number(localStorage.getItem(VOL_KEY));
    return localStorage.getItem(VOL_KEY) !== null && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.55;
  } catch {
    return 0.55;
  }
})();
const muteListeners = new Set<() => void>();
const gainNow = () => (muted ? 0 : volume);

export function useMuted() {
  return useSyncExternalStore(
    (l) => {
      muteListeners.add(l);
      return () => muteListeners.delete(l);
    },
    () => muted,
  );
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master && ctx) master.gain.setTargetAtTime(gainNow(), ctx.currentTime, 0.05);
  muteListeners.forEach((l) => l());
}

export function useSfxVolume() {
  return useSyncExternalStore(
    (l) => {
      muteListeners.add(l);
      return () => muteListeners.delete(l);
    },
    () => volume,
  );
}

export function setSfxVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOL_KEY, String(volume));
  } catch {
    /* ignore */
  }
  if (master && ctx) master.gain.setTargetAtTime(gainNow(), ctx.currentTime, 0.05);
  muteListeners.forEach((l) => l());
}

/** Call from any user gesture. Safe to call repeatedly. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = gainNow();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready() {
  return ctx && master && !muted && ctx.state === 'running' ? { c: ctx, out: master } : null;
}

function env(c: AudioContext, g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, opts: { type?: OscillatorType; at?: number; peak?: number; attack?: number; decay?: number; to?: number } = {}) {
  const r = ready();
  if (!r) return;
  const { c, out } = r;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.attack ?? 0.005) + (opts.decay ?? 0.2));
  env(c, g, t, opts.peak ?? 0.2, opts.attack ?? 0.005, opts.decay ?? 0.2);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + (opts.attack ?? 0.005) + (opts.decay ?? 0.2) + 0.05);
}

function noise(opts: { at?: number; dur?: number; peak?: number; type?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number }) {
  const r = ready();
  if (!r || !noiseBuf) return;
  const { c, out } = r;
  const t = c.currentTime + (opts.at ?? 0);
  const dur = opts.dur ?? 0.05;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 3000, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  env(c, g, t, opts.peak ?? 0.3, opts.attack ?? 0.002, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + dur + (opts.attack ?? 0.002) + 0.05);
}

export const sfx = {
  /** Escapement tick of the stopwatch. */
  tick(strong = false) {
    noise({ freq: strong ? 2400 : 3600, q: 8, dur: 0.025, peak: strong ? 0.5 : 0.22 });
    tone(strong ? 1800 : 2600, { decay: 0.03, peak: strong ? 0.08 : 0.03 });
  },
  /** Crown pressed. */
  click() {
    noise({ freq: 1800, q: 5, dur: 0.02, peak: 0.45 });
    noise({ freq: 2600, q: 6, dur: 0.02, peak: 0.35, at: 0.07 });
  },
  hover() {
    noise({ type: 'highpass', freq: 5000, dur: 0.04, peak: 0.04 });
  },
  select() {
    noise({ type: 'highpass', freq: 2500, dur: 0.12, peak: 0.12, attack: 0.02 });
    tone(520, { to: 700, decay: 0.12, peak: 0.05 });
  },
  lock() {
    tone(180, { type: 'triangle', decay: 0.18, peak: 0.25, to: 90 });
    noise({ freq: 1200, q: 3, dur: 0.05, peak: 0.4, at: 0.02 });
    noise({ freq: 3200, q: 9, dur: 0.02, peak: 0.3, at: 0.11 });
  },
  whoosh() {
    noise({ type: 'bandpass', freq: 400, to: 2400, q: 0.8, dur: 0.55, peak: 0.22, attack: 0.25 });
  },
  pin() {
    tone(110, { to: 48, decay: 0.22, peak: 0.45 });
    noise({ freq: 900, q: 2, dur: 0.06, peak: 0.35 });
    noise({ freq: 4200, q: 10, dur: 0.02, peak: 0.25, at: 0.015 });
  },
  place() {
    tone(330, { type: 'triangle', decay: 0.09, peak: 0.12 });
    noise({ freq: 1600, q: 2, dur: 0.03, peak: 0.12 });
  },
  join() {
    tone(523, { decay: 0.25, peak: 0.08 });
    tone(784, { decay: 0.35, peak: 0.07, at: 0.09 });
  },
  stamp() {
    tone(70, { to: 40, decay: 0.3, peak: 0.6 });
    noise({ type: 'lowpass', freq: 900, dur: 0.12, peak: 0.6 });
  },
  /** The one-minute warning: a struck bell with inharmonic partials. */
  bell() {
    const partials = [1, 2.01, 2.76, 3.98, 5.4];
    partials.forEach((p, i) => tone(392 * p, { decay: 2.6 - i * 0.35, peak: 0.16 / (i + 1), attack: 0.003 }));
    this.click();
  },
  powerDown() {
    tone(240, { type: 'sawtooth', to: 30, decay: 1.4, peak: 0.08, attack: 0.01 });
    noise({ type: 'lowpass', freq: 1400, to: 80, dur: 1.2, peak: 0.12 });
  },
  drone() {
    tone(55, { type: 'triangle', decay: 3.5, peak: 0.12, attack: 0.8 });
    tone(82.4, { type: 'sine', decay: 3.2, peak: 0.06, attack: 1.2 });
  },
  /** Truth reveal swell. */
  swell() {
    [220, 277.18, 329.63, 440].forEach((f, i) =>
      tone(f, { type: i % 2 ? 'triangle' : 'sine', attack: 1.1, decay: 2.4, peak: 0.07, at: i * 0.08 }),
    );
  },
  count(progress: number) {
    tone(600 + progress * 900, { decay: 0.04, peak: 0.04 });
  },
  chime() {
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, { decay: 0.9, peak: 0.08, at: i * 0.09 }));
  },
  error() {
    tone(220, { type: 'square', decay: 0.12, peak: 0.04 });
    tone(196, { type: 'square', decay: 0.14, peak: 0.04, at: 0.1 });
  },
};
