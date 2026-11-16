import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const desktop = { viewport: { width: 1440, height: 1000 } };
const results = [];
const check = (ok, msg) => { assert.ok(ok, msg); results.push('PASS ' + msg); };

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

try {
  // ---------- Phone: homepage ----------
  const m = await browser.newContext(phone);
  const p = await m.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  check((await overflow(p)) <= 1, 'Homepage has no horizontal scroll at 390px');
  await p.screenshot({ path: '.work/mobile-home.png', fullPage: false });

  // ---------- Phone: sign in ----------
  await p.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  check((await overflow(p)) <= 1, 'Dashboard has no horizontal scroll at 390px');

  const nav = p.locator('header nav');
  const navText = await nav.innerText();
  check(!/Pay & Transfer/.test(navText), 'Phone nav has NO "Pay & Transfer" tab');
  check(/Accounts/.test(navText), 'Phone nav still has the Accounts tab');

  const quick = await p.getByRole('button', { name: /Transfer money/ }).count();
  check(quick === 0, 'Phone quick actions have NO "Transfer money" tile');
  check((await p.getByRole('button', { name: /Send with Zelle/ }).count()) === 1, 'Phone still shows Zelle quick action');
  await p.screenshot({ path: '.work/mobile-dashboard.png', fullPage: false });

  // ---------- Phone: account detail ----------
  await p.getByRole('button', { name: /Chase Total Checking/ }).first().click();
  await p.getByText('Available balance', { exact: false }).first().waitFor();
  const detailOutline = await p.getByRole('button', { name: 'Transfer money', exact: true }).count();
  check(detailOutline === 0, 'Phone account page has NO "Transfer money" button');
  check((await overflow(p)) <= 1, 'Account detail has no horizontal scroll at 390px');

  // ---------- Phone: deep link into hub stays usable ----------
  await p.getByRole('button', { name: 'Accounts', exact: true }).first().click().catch(() => {});
  await p.getByRole('button', { name: /Send with Zelle/ }).click();
  await p.locator('h1', { hasText: 'Send money with Zelle' }).waitFor();
  check((await overflow(p)) <= 1, 'Zelle page has no horizontal scroll at 390px');
  const hubSelect = p.locator('select').filter({ has: p.locator('option[value="transfer"]') });
  check((await hubSelect.count()) === 0, 'Phone pay hub menu does NOT offer the Transfer option');
  check((await p.locator('select option[value="zelle"]').count()) === 1, 'Phone pay hub menu offers Zelle');
  await p.screenshot({ path: '.work/mobile-zelle.png', fullPage: false });
  await m.close();

  // ---------- Desktop: everything still present ----------
  const d = await browser.newContext(desktop);
  const dp = await d.newPage();
  await dp.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await dp.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await dp.locator('form').filter({ has: dp.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await dp.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  check((await dp.locator('header nav').innerText()).includes('Pay & Transfer'), 'Desktop nav still shows "Pay & Transfer"');
  check((await dp.getByRole('button', { name: /Transfer money/ }).count()) >= 1, 'Desktop still shows "Transfer money" tile');
  await d.close();

  check(errors.length === 0, 'No runtime errors on phone: ' + errors.join('; '));
  console.log(results.join('\n'));
  console.log(`\n${results.length} checks passed.`);
} finally {
  await browser.close();
}
