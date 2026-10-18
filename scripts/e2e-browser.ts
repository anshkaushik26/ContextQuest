/**
 * End-to-end: three independent browser sessions (two desktop, one touch phone) play a full
 * round against the production build. Screenshots land in ./e2e-shots.
 *
 *   npm run build && npm run e2e
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices, type Page } from 'playwright';
import { startServer } from '../server/index';

const SCALE = Number(process.env.CQ_E2E_SCALE ?? 1);
const OUT = 'e2e-shots';
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];
const step = (msg: string) => console.log(`• ${msg}`);

async function shot(page: Page, name: string, full = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

async function main() {
  const server = await startServer({ port: 4123, serveClient: true, timeScale: SCALE });
  const base = `http://localhost:${server.port}`;
  const browser = await chromium.launch();
  const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const ctxs = [
    await browser.newContext(desk),
    await browser.newContext(desk),
    await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 }),
  ];
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  pages.forEach((p, i) => {
    p.on('pageerror', (e) => errors.push(`[p${i + 1}] ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`[p${i + 1}] console: ${m.text()}`));
  });
  const [asha, bilal, chen] = pages;

  step('host creates a room');
  await asha.goto(base);
  await shot(asha, '00-home');
  await asha.fill('[data-testid=name-input]', 'Asha');
  await asha.click('[data-testid=create-room]');
  await asha.waitForURL(/\/r\/[A-Z]{4}$/);
  const code = asha.url().split('/').pop()!;
  step(`room ${code}; two players join by invite link`);
  for (const [p, name] of [
    [bilal, 'Bilal'],
    [chen, 'Chen'],
  ] as const) {
    await p.goto(`${base}/r/${code}`);
    await p.fill('[data-testid=name-input]', name);
    await p.click('[data-testid=join-room]');
    await p.waitForSelector('[data-testid=ready-toggle]');
  }
  for (const p of pages) await p.click('[data-testid=ready-toggle]');
  await asha.waitForSelector('[data-testid=start-game]:not([disabled])');
  await asha.waitForTimeout(600);
  await shot(asha, '01-lobby');
  await shot(chen, '01-lobby-mobile', true);

  step('host opens the case');
  await asha.click('[data-testid=start-game]');
  await asha.waitForTimeout(3200);
  await shot(asha, '02-intro-blackout');
  for (const p of pages) await p.waitForSelector('[data-testid=intro-done]', { timeout: 15000 });
  await shot(asha, '03-intro-role');
  for (const p of pages) await p.click('[data-testid=intro-done]');

  step('private evidence + locked theories');
  for (const p of pages) await p.waitForSelector('[data-testid=lock-theory]', { timeout: 30000 });
  await asha.waitForTimeout(900);
  await shot(asha, '04-evidence');
  await shot(chen, '04-evidence-mobile');
  // Inspector
  await asha.click('.hand__slot:nth-child(1) .hand__actions button');
  await asha.waitForTimeout(500);
  await shot(asha, '05-inspector');
  await asha.keyboard.press('Escape');
  const theories = ['h-sabotage', 'h-failure', 'h-system'];
  for (let i = 0; i < 3; i++) {
    await pages[i].click(`[data-testid=hyp-${theories[i]}]`);
    await pages[i].click('[data-testid=lock-theory]');
  }
  await asha.waitForTimeout(300);
  await shot(asha, '06-theory-locked');

  step('one-card reveal with flights');
  for (const p of pages) await p.waitForSelector('.hand--select', { timeout: 30000 });
  await asha.waitForTimeout(700);
  // Bilal selects (Asha should see "choosing…")
  await bilal.click('.hand__slot:nth-child(2) .hand__hit');
  await asha.waitForTimeout(300);
  await shot(asha, '07-reveal-choosing');
  await bilal.click('[data-testid=confirm-reveal]');
  await asha.waitForTimeout(550);
  await shot(asha, '08-reveal-flight');
  await asha.waitForTimeout(1200);
  await asha.click('.hand__slot:nth-child(1) .hand__hit');
  await asha.waitForTimeout(400);
  await shot(asha, '09-reveal-selected');
  await asha.click('[data-testid=confirm-reveal]');
  // Phone taps
  await shot(chen, '09b-reveal-mobile', true);
  await chen.locator('.hand__slot').nth(2).locator('.hand__hit').scrollIntoViewIfNeeded();
  await chen.locator('.hand__slot').nth(2).locator('.hand__hit').tap();
  await chen.locator('[data-testid=confirm-reveal]').tap();
  await asha.waitForTimeout(1500);
  await shot(asha, '10-board-complete');
  // Second reveal is impossible from the UI: hand is locked.
  const selectable = await asha.locator('.hand--select').count();
  if (selectable) errors.push('hand still selectable after reveal');

  step('timeline + verdict');
  for (const p of pages) await p.waitForSelector('[data-testid=sign]', { timeout: 15000 });
  await asha.waitForTimeout(900);
  await shot(asha, '11-board');
  // Mouse drag e1 into first slot.
  const t = asha.locator('[data-testid=tile-e1] .tile__title');
  const first = asha.locator('[data-tile]').first();
  const a = (await t.boundingBox())!;
  const b = (await first.boundingBox())!;
  await asha.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await asha.mouse.down();
  await asha.mouse.move(a.x + 40, a.y + 10, { steps: 4 });
  await asha.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await asha.waitForTimeout(150);
  await shot(asha, '12-dragging');
  await asha.mouse.up();
  await asha.waitForTimeout(500);
  const order1 = await asha.locator('[data-tile]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile')));
  step(`after drag: ${order1.join(' ')}`);
  if (order1[0] !== 'e1') errors.push(`drag failed: ${order1.join(',')}`);

  // Bilal uses tap-to-place: pick e2, tap the tile at slot 2.
  const target = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
  for (let i = 0; i < 6; i++) {
    const cur = await bilal.locator('[data-tile]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile')));
    if (cur[i] === target[i]) continue;
    await bilal.click(`[data-testid=tile-${target[i]}] .tile__title`);
    await bilal.click(`[data-tile="${cur[i]}"] .tile__title`);
    await bilal.waitForTimeout(350);
  }
  await asha.waitForTimeout(500);
  const order2 = await chen.locator('[data-tile]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile')));
  step(`synced order on phone: ${order2.join(' ')}`);
  if (order2.join() !== target.join()) errors.push(`timeline not synced: ${order2.join(',')}`);

  // Chen (phone) uses arrows to swap e3/e4 and back
  await chen.locator('[data-testid=tile-e3] [aria-label^="Move"][aria-label$="later"]').tap();
  await asha.waitForTimeout(400);
  await shot(asha, '13-moved-by-teammate');
  await chen.locator('[data-testid=tile-e3] [aria-label^="Move"][aria-label$="earlier"]').tap();

  step('team chat: discuss an event from its tile');
  await asha.click('[data-testid=tile-e2] .tile__discuss');
  await asha.keyboard.type('this is the 4-minute warning, right?');
  await asha.keyboard.press('Enter');
  await bilal.waitForSelector('.chat--rail .msg__bubble:has-text("4-minute warning")', { timeout: 5000 });
  await bilal.fill('.chat--rail [data-testid=chat-input]', 'Yes, and my generator card says the battery was flat');
  await bilal.keyboard.press('Enter');
  await chen.locator('.chat-fab').tap();
  await chen.waitForSelector('.chat--sheet .msg__bubble:has-text("battery was flat")', { timeout: 5000 });
  await chen.waitForTimeout(400);
  await shot(chen, '13b-chat-mobile');
  await chen.locator('.chat--sheet button:has-text("Close")').tap();
  await asha.waitForTimeout(300);
  await shot(asha, '13c-chat-desktop');
  // Host clears the chat (two taps); it empties for everyone.
  await asha.click('.chat--rail [data-testid=chat-clear]');
  await asha.click('.chat--rail [data-testid=chat-clear]');
  await bilal.waitForSelector('.chat--rail .chat__empty', { timeout: 5000 });
  if (await bilal.locator('.chat--rail [data-testid=chat-clear]').count()) errors.push('non-host sees clear button');

  await asha.click('[data-testid=opt-cause-maintenance]');
  await bilal.click('[data-testid=opt-gen-blocked]');
  await chen.locator('[data-testid=opt-vis-restorer]').tap();
  await asha.waitForTimeout(500);
  await asha.click('[data-testid=sign]');
  await bilal.click('[data-testid=sign]');
  await asha.locator('.verdict').scrollIntoViewIfNeeded();
  await asha.waitForTimeout(800);
  await shot(asha, '14-verdict-signing');
  await shot(chen, '14-board-mobile');
  await chen.locator('[data-testid=sign]').tap();

  step('truth reveal');
  await asha.waitForSelector('.truth__hero', { timeout: 10000 });
  await asha.waitForTimeout(1800);
  await shot(asha, '15-truth-hero');
  await asha.waitForTimeout(3600);
  await shot(asha, '16-truth-timeline');
  await asha.waitForTimeout(9000);
  await shot(asha, '17-truth-score');
  await asha.waitForTimeout(1500);
  await shot(asha, '18-truth-full', true);
  await chen.waitForTimeout(500);
  await shot(chen, '18-truth-mobile', true);
  const score = await asha.locator('.gauge__num').innerText();
  step(`score shown: ${score.replace(/\s/g, '')}`);
  if (!score.startsWith('80')) errors.push(`unexpected score ${score}`);
  const pace = await asha.locator('[data-testid=pace]').innerText();
  step(`pace: ${pace}`);
  if (!/Well done/.test(pace)) errors.push(`unexpected pace ${pace}`);
  await asha.locator('.story').scrollIntoViewIfNeeded();
  await asha.waitForTimeout(1600);
  await shot(asha, '19-story-art');
  await chen.locator('.story').scrollIntoViewIfNeeded();
  await chen.waitForTimeout(1200);
  await shot(chen, '19-story-art-mobile');

  step('reconnect: Bilal reloads and keeps his seat');
  await bilal.reload();
  await bilal.waitForSelector('.truth__hero', { timeout: 10000 });

  step('new round rotates roles');
  await asha.click('[data-testid=play-again]');
  await asha.waitForSelector('[data-testid=ready-toggle]');

  await browser.close();
  await server.close();
  console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nE2E passed with no page errors.');
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
