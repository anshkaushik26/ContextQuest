/**
 * Soundtrack check in a real browser against the production build.
 *   npm run build && npx tsx scripts/e2e-music.ts
 */
import { chromium, type Page } from 'playwright';
import { startServer } from '../server/index';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) problems.push(msg);
};

type Probe = { exists: boolean; paused: boolean; time: number; volume: number; error: number | null; created: number; src: string };
const probe = (p: Page) =>
  p.evaluate((): Probe => {
    const w = window as unknown as { __cqMusic?: HTMLAudioElement; __audioCount?: number };
    const a = w.__cqMusic;
    return {
      exists: !!a,
      paused: a ? a.paused : true,
      time: a ? a.currentTime : 0,
      volume: a ? a.volume : 0,
      error: a?.error ? a.error.code : null,
      created: w.__audioCount ?? 0,
      src: a?.src ?? '',
    };
  });

async function main() {
  const server = await startServer({ port: 4125, serveClient: true });
  const base = `http://localhost:${server.port}`;
  const browser = await chromium.launch();

  // Count every Audio element the page constructs.
  const countAudio = () => {
    const Orig = window.Audio;
    const w = window as unknown as { __audioCount: number };
    w.__audioCount = 0;
    window.Audio = function (...args: ConstructorParameters<typeof Audio>) {
      w.__audioCount++;
      return new Orig(...args);
    } as unknown as typeof Audio;
  };

  // ── Happy path ──
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(countAudio);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForTimeout(1500);
  let s = await probe(page);
  check(!s.exists || s.paused, 'silent before any user interaction');

  await page.click('h1');
  await page.waitForTimeout(2500);
  s = await probe(page);
  check(s.exists && !s.paused, 'starts after the first click');
  check(s.time > 0.5, `playing (currentTime ${s.time.toFixed(2)}s)`);
  check(s.error === null, 'no media error');
  check(s.src.endsWith('/audio/context-quest.mp3'), 'loads /audio/context-quest.mp3');
  check(Math.abs(s.volume - 0.35) < 0.05, `faded in to default volume (${s.volume.toFixed(2)})`);
  const t1 = s.time;

  // Change screen: create a room → lobby. Music must carry on, same instance.
  await page.fill('[data-testid=name-input]', 'Asha');
  await page.click('[data-testid=create-room]');
  await page.waitForSelector('[data-testid=ready-toggle]');
  await page.click('[data-testid=ready-toggle]');
  await page.waitForTimeout(1500);
  s = await probe(page);
  check(!s.paused && s.time > t1, `continuous across screens (${t1.toFixed(1)}s → ${s.time.toFixed(1)}s)`);
  check(s.created === 1, `exactly one audio instance created (${s.created})`);

  // Controls.
  await page.click('[data-testid=sound-button]');
  await page.locator('[data-testid=music-volume]').fill('20');
  await page.waitForTimeout(200);
  s = await probe(page);
  check(Math.abs(s.volume - 0.2) < 0.02, `volume slider sets 20% (${s.volume.toFixed(2)})`);
  await page.click('[data-testid=music-toggle]');
  await page.waitForTimeout(900);
  s = await probe(page);
  check(s.paused, 'mute pauses the soundtrack');
  await page.click('[data-testid=music-toggle]');
  await page.waitForTimeout(900);
  s = await probe(page);
  check(!s.paused, 'unmute resumes it');
  check(s.created === 1, 'still one instance after toggling');

  // Preferences persist across reload, and reload doesn't auto-play without a gesture.
  await page.reload();
  await page.waitForTimeout(1200);
  s = await probe(page);
  check(!s.exists || s.paused, 'no autoplay after reload until the user interacts');
  await page.click('body', { position: { x: 20, y: 400 } });
  await page.waitForTimeout(1800);
  s = await probe(page);
  check(!s.paused && Math.abs(s.volume - 0.2) < 0.03, `volume preference kept after reload (${s.volume.toFixed(2)})`);
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);

  // ── Round start: music drops to 20%, effects rise to 90%; players can change both after ──
  const ctxs = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })));
  const [h, b, c] = await Promise.all(ctxs.map((x) => x.newPage()));
  await h.goto(base);
  await h.click('h1');
  await h.fill('[data-testid=name-input]', 'Host');
  await h.click('[data-testid=create-room]');
  await h.waitForURL(/\/r\/[A-Z]{4}$/);
  for (const [p, n] of [
    [b, 'Bea'],
    [c, 'Cy'],
  ] as const) {
    await p.goto(h.url());
    await p.fill('[data-testid=name-input]', n);
    await p.click('[data-testid=join-room]');
    await p.waitForSelector('[data-testid=ready-toggle]');
  }
  await h.waitForTimeout(1500);
  s = await probe(h);
  check(!s.paused && Math.abs(s.volume - 0.35) < 0.05, `lobby: music at default ${Math.round(s.volume * 100)}%`);
  for (const p of [h, b, c]) await p.click('[data-testid=ready-toggle]');
  await h.click('[data-testid=start-game]:not([disabled])');
  await h.waitForTimeout(2200);
  s = await probe(h);
  check(!s.paused && Math.abs(s.volume - 0.2) < 0.02, `game started: music faded to ${Math.round(s.volume * 100)}%`);
  await h.click('[data-testid=sound-button]');
  const sfxPct = Number(await h.locator('[data-testid=sfx-volume]').inputValue());
  check(sfxPct === 90, `game started: sound effects raised to ${sfxPct}%`);
  check(Number(await h.locator('[data-testid=music-volume]').inputValue()) === 20, 'music slider shows 20%');
  // Player adjusts after the start — their choice sticks.
  await h.locator('[data-testid=music-volume]').fill('45');
  await h.locator('[data-testid=sfx-volume]').fill('60');
  await h.click('[data-testid=intro-done]').catch(() => {});
  await h.waitForTimeout(1200);
  s = await probe(h);
  check(Math.abs(s.volume - 0.45) < 0.02, `player raised music to ${Math.round(s.volume * 100)}% and it stays`);
  await h.click('[data-testid=sound-button]').catch(() => {});
  const after = Number(await h.locator('[data-testid=sfx-volume]').inputValue().catch(() => '0'));
  check(after === 60, `player set effects to ${after}% and it stays`);
  for (const x of ctxs) await x.close();

  // ── Missing file is handled gracefully ──
  const bad = await browser.newContext();
  await bad.route('**/audio/context-quest.mp3', (r) => r.fulfill({ status: 404, body: 'nope' }));
  const p2 = await bad.newPage();
  const errors2: string[] = [];
  p2.on('pageerror', (e) => errors2.push(e.message));
  await p2.goto(base);
  await p2.click('h1');
  await p2.waitForTimeout(1500);
  await p2.click('[data-testid=sound-button]');
  const note = await p2.locator('.sound__note').innerText().catch(() => '');
  check(/unavailable/i.test(note), `missing file shows "${note}"`);
  check(errors2.length === 0, 'missing file causes no page errors');
  await p2.fill('[data-testid=name-input]', 'Bo');
  await p2.click('[data-testid=create-room]');
  check(await p2.waitForSelector('[data-testid=ready-toggle]').then(() => true).catch(() => false), 'game still works without the soundtrack');

  await browser.close();
  await server.close();
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nSoundtrack checks passed.');
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
