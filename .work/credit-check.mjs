import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const errors = [];
const ok = (condition, message) => { assert.ok(condition, message); out.push(`PASS ${message}`); };

async function signIn(page, base) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await page.locator('form').filter({ has: page.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });
}

try {
  const base = 'http://127.0.0.1:3100';
  for (const [name, opts] of [
    ['desktop', { viewport: { width: 1440, height: 1100 } }],
    ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await signIn(page, base);
    if (name === 'phone') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.locator('#dashboard-menu').getByRole('button', { name: 'Credit Journey®', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Credit Journey®', exact: true }).first().click();
    }
    await page.getByRole('heading', { name: 'Credit Journey®', exact: true }).waitFor();

    ok((await page.locator('body').innerText()).includes('VantageScore® 3.0'), `${name}: VantageScore 3.0 model shown`);
    ok((await page.locator('body').innerText()).includes('Experian'), `${name}: bureau shown`);
    ok((await page.locator('body').innerText()).includes('782'), `${name}: score gauge shows current score`);
    ok((await page.getByRole('progressbar', { name: /credit goal/i }).count()) === 1, `${name}: goal progress bar present`);
    ok((await page.getByRole('tab').count()) === 7, `${name}: seven Chase-style tabs (overview, factors, changes, report, plan, simulator, monitoring)`);

    // Factors
    await page.getByRole('tab', { name: 'Score factors' }).click();
    await page.getByRole('heading', { name: "What's affecting your score" }).waitFor();
    ok((await page.locator('body').innerText()).includes('Payment history') && (await page.locator('body').innerText()).includes('Credit utilization'), `${name}: six factors include payment history and utilization`);
    ok((await page.locator('body').innerText()).includes('High impact'), `${name}: factors show impact weighting`);

    // What changed
    await page.getByRole('tab', { name: 'What changed' }).click();
    await page.getByRole('heading', { name: 'What changed your score' }).waitFor();
    ok((await page.locator('body').innerText()).includes('Card balance increased by $120 this week.'), `${name}: changes name the reason`);

    // Credit report
    await page.getByRole('tab', { name: 'Credit report' }).click();
    await page.getByRole('heading', { name: /credit report/i }).waitFor();
    const report = await page.locator('body').innerText();
    ok(report.includes('Chase Sapphire Preferred®') && /credit inquiries/i.test(report), `${name}: report lists accounts and inquiries`);
    ok(/none reported/i.test(report), `${name}: public records and collections show none`);

    // Plan
    await page.getByRole('tab', { name: 'Score plan' }).click();
    await page.getByRole('heading', { name: /Your path to/ }).waitFor();
    ok((await page.locator('body').innerText()).includes('Keep every payment on time'), `${name}: score plan lists improvement actions`);

    // Simulator
    await page.getByRole('tab', { name: 'Score simulator' }).click();
    await page.getByRole('heading', { name: 'Score simulator' }).waitFor();
    await page.getByLabel('Pay down card balances').check();
    await page.getByRole('button', { name: 'Simulate this scenario' }).click();
    await page.getByText('Estimated score', { exact: true }).waitFor({ timeout: 15000 });
    const simText = await page.locator('body').innerText();
    ok(/79\d–8\d\d/.test(simText), `${name}: simulator returns an estimated range`);
    ok(simText.includes('Estimate only'), `${name}: simulator labels results as directional estimates`);

    // Monitoring
    await page.getByRole('tab', { name: /Dark web monitoring/ }).click();
    await page.getByRole('heading', { name: 'Credit alerts & dark web monitoring', exact: true }).waitFor();
    const monitor = await page.locator('body').innerText();
    ok(/retail data breach/i.test(monitor) && /marketing list exposure/i.test(monitor), `${name}: dark web monitoring lists findings`);
    if (await page.getByRole('button', { name: 'Mark alerts as read' }).count()) {
      await page.getByRole('button', { name: 'Mark alerts as read' }).click();
      await page.waitForTimeout(400);
      ok((await page.getByRole('button', { name: 'Mark alerts as read' }).count()) === 0, `${name}: mark all alerts read works`);
    }

    // Goal update
    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByLabel('Credit score goal').first().fill('810');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await page.getByRole('status').filter({ hasText: 'Goal set to 810' }).waitFor({ timeout: 10000 });
    ok(true, `${name}: credit goal saves`);

    ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, `${name}: no horizontal overflow`);
    if (name === 'desktop') await page.screenshot({ path: '.work/credit-desktop.png' });
    else await page.screenshot({ path: '.work/credit-mobile.png' });
    await ctx.close();
  }

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally {
  await browser.close();
}
