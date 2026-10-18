/**
 * Demo mode in a real browser: the host alone fills the room with demo players and
 * clicks only the bottom-right "next step" button until the truth screen.
 *   npm run build && npx tsx scripts/e2e-demo.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from '../server/index';

mkdirSync('e2e-shots', { recursive: true });

async function main() {
  const server = await startServer({ port: 4127, serveClient: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://localhost:${server.port}`);
  await page.fill('[data-testid=name-input]', 'Ansh');
  await page.click('[data-testid=create-room]');
  await page.waitForSelector('[data-testid=demo-start]');
  await page.screenshot({ path: 'e2e-shots/30-lobby-cases.png' });
  const locked = await page.locator('[data-testid=case-002]').isDisabled();
  console.log(`• upcoming case disabled: ${locked}`);
  if (!locked) errors.push('case 002 should be disabled');

  await page.click('[data-testid=demo-start]');
  await page.waitForSelector('[data-testid=demo-step]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e-shots/31-lobby-demo.png' });

  const seen: string[] = [];
  const t0 = Date.now();
  while (!(await page.locator('.truth__hero').count())) {
    if (Date.now() - t0 > 90_000) throw new Error(`stuck; steps so far: ${seen.join(' → ')}`);
    const btn = page.locator('[data-testid=demo-step]');
    if (await btn.count()) {
      const label = (await btn.innerText()).trim();
      if (seen[seen.length - 1] !== label) seen.push(label);
      if (label.startsWith('Pin my card')) await page.screenshot({ path: 'e2e-shots/32-demo-reveal.png' });
      await btn.click().catch(() => {});
      if (label.startsWith('Pin my card')) {
        await page.waitForTimeout(600);
        await page.screenshot({ path: 'e2e-shots/33-demo-flight.png' });
      }
      if (label.startsWith('Sign')) await page.screenshot({ path: 'e2e-shots/34-demo-board.png' });
    }
    await page.waitForTimeout(700);
  }
  console.log(`• steps: ${seen.join(' → ')}`);
  console.log(`• reached the truth in ${((Date.now() - t0) / 1000).toFixed(1)} s of clicking`);
  await page.waitForTimeout(13_000);
  const score = (await page.locator('.gauge__num').innerText()).replace(/\s/g, '');
  console.log(`• score: ${score}`);
  await page.screenshot({ path: 'e2e-shots/35-demo-truth.png' });

  await browser.close();
  await server.close();
  console.log(errors.length ? `problems:\n${errors.join('\n')}` : 'Demo E2E passed.');
  process.exit(errors.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
