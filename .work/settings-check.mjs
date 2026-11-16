import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const ok = (c, m) => { assert.ok(c, m); out.push('PASS ' + m); };
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });

  await p.getByRole('button', { name: 'Profile & Settings', exact: true }).click();
  await p.getByRole('heading', { name: 'Profile & Settings', exact: true }).waitFor();
  ok(await p.getByRole('button', { name: 'Review details', exact: true }).isVisible(), 'Settings overview shows personal details card');
  ok(await p.getByRole('button', { name: 'Manage security', exact: true }).isVisible(), 'Settings overview shows security card');

  // Personal details save
  await p.getByRole('button', { name: /Personal details/ }).click();
  const email = p.getByLabel('Email address', { exact: true });
  await email.fill('alex.updated@example.com');
  await p.getByRole('button', { name: 'Save changes', exact: true }).click();
  await p.getByRole('status').filter({ hasText: 'Personal details saved' }).waitFor();
  ok(true, 'Personal details save and confirm');

  // Account settings: nickname + primary + favorite
  await p.getByRole('button', { name: /Account settings/ }).click();
  const nick = p.getByPlaceholder('Chase Total Checking®', { exact: true }).first();
  await nick.fill('Everyday Money');
  await p.getByRole('button', { name: 'Save nickname', exact: true }).first().click();
  await p.getByRole('status').filter({ hasText: 'Nickname saved' }).waitFor();
  ok(true, 'Account nickname saves');
  await p.getByRole('button', { name: 'Accounts', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
  ok((await p.locator('body').innerText()).includes('Everyday Money'), 'Nickname appears in the accounts overview');

  // Back to settings: travel notice
  await p.getByRole('button', { name: 'Profile & Settings', exact: true }).click();
  await p.locator('nav[aria-label="Settings sections"]').getByRole('button', { name: /Travel/ }).click();
  await p.getByPlaceholder('e.g. Paris, France').fill('Paris, France');
  await p.locator('input[type="date"]').nth(0).fill('2026-09-18');
  await p.locator('input[type="date"]').nth(1).fill('2026-09-25');
  await p.getByRole('button', { name: 'Add travel notice', exact: true }).click();
  await p.getByText('Paris, France', { exact: true }).waitFor();
  ok(true, 'Travel notice adds and lists');

  // Alerts toggle persists (status confirmation)
  await p.locator('nav[aria-label="Settings sections"]').getByRole('button', { name: /Alerts/ }).click();
  await p.getByRole('switch', { name: 'Low balance alerts', exact: true }).click();
  await p.getByRole('status').filter({ hasText: 'Low balance alerts turned off' }).waitFor();
  ok(true, 'Alert preference toggles and confirms');

  // Privacy toggle
  await p.locator('nav[aria-label="Settings sections"]').getByRole('button', { name: /Privacy/ }).click();
  await p.getByRole('switch', { name: 'Offers from other companies', exact: true }).click();
  await p.getByRole('status').filter({ hasText: 'Privacy choice saved' }).waitFor();
  ok(true, 'Privacy choice toggles and confirms');

  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, 'Settings page has no sideways scroll on desktop');
  await p.screenshot({ path: '.work/settings-desktop.png' });
  await ctx.close();

  // Phone: section dropdown works
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await mp.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await mp.locator('form').filter({ has: mp.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await mp.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  await mp.getByRole('button', { name: 'Open menu' }).click();
  await mp.getByRole('button', { name: 'Profile & Settings', exact: true }).click();
  await mp.getByRole('heading', { name: 'Profile & Settings', exact: true }).waitFor();
  await mp.locator('select').first().selectOption('security');
  ok(await mp.getByRole('switch', { name: '2-step verification', exact: true }).isVisible(), 'Phone settings dropdown opens Sign-in & security');
  const mo = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(mo <= 1, 'Settings page has no sideways scroll on phone');
  await mp.screenshot({ path: '.work/settings-mobile.png' });
  await m.close();

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally { await browser.close(); }
