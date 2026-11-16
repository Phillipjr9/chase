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

  // Remember me persists only the username after a successful sign-in/sign-out.
  await p.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await p.getByLabel('Remember me').check();
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: 'Sign out', exact: true }).click();
  await p.locator('#chase-username').waitFor();
  ok((await p.locator('#chase-username').inputValue()) === 'demo', 'Remember me restores the username only');
  ok(await p.getByLabel('Remember me').isChecked(), 'Remember me stays selected for the saved username');

  // Real demo password reset (no fake email claim).
  await p.getByRole('button', { name: 'Forgot username/password?', exact: true }).click();
  await p.locator('#chase-reset-username').fill('demo');
  await p.locator('#chase-reset-email').fill('alex.rivera@example.com');
  await p.locator('#chase-reset-password').fill('brandnew123');
  await p.locator('#chase-reset-confirm').fill('brandnew123');
  await p.getByRole('button', { name: 'Reset password', exact: true }).click();
  await p.getByRole('heading', { name: 'Password updated', exact: true }).waitFor();
  ok(true, 'Password reset verifies account details and updates the password');
  await p.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await p.locator('#chase-password').fill('chase123');
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  ok((await p.getByRole('alert').innerText()).includes('incorrect'), 'Old password is rejected after reset');
  await p.locator('#chase-password').fill('brandnew123');
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  ok(true, 'New password signs in after reset');

  // Dashboard search finds accounts and sections.
  await p.getByRole('button', { name: 'Search accounts, payees, settings, offers, and transactions', exact: true }).click();
  await p.getByLabel('Search accounts, payees, settings, offers, or transactions').fill('Sapphire');
  await p.locator('#dashboard-search button').filter({ hasText: 'Sapphire Preferred' }).first().click();
  await p.locator('h1').filter({ hasText: 'Sapphire Preferred' }).waitFor();
  ok(true, 'Dashboard search opens the matching card account');
  await p.getByRole('button', { name: 'Search accounts, payees, settings, offers, and transactions', exact: true }).click();
  await p.getByLabel('Search accounts, payees, settings, offers, or transactions').fill('Statements');
  await p.locator('#dashboard-search button').filter({ hasText: 'Statements' }).first().click();
  await p.getByRole('heading', { name: 'Statements & Documents', exact: true }).waitFor();
  ok(true, 'Dashboard search opens the matching section');

  // Alerts are derived from the signed-in accounts and can be marked read.
  const alertsButton = p.getByRole('button', { name: /Alerts, \d+ unread/ });
  ok(await alertsButton.count() === 1, 'Alerts button shows an unread count');
  await alertsButton.click();
  await p.locator('#dashboard-alerts').waitFor();
  ok((await p.locator('#dashboard-alerts').innerText()).includes('Credit card payment due'), 'Alerts include upcoming card payments');
  await p.getByRole('button', { name: 'Mark all read', exact: true }).click();
  ok((await p.getByRole('button', { name: 'Alerts', exact: true }).count()) === 1, 'Mark all read clears the alert badge');
  await ctx.close();

  // Phone menu closes with Escape and returns focus.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await mp.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await mp.locator('form').filter({ has: mp.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await mp.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
  const menuButton = mp.getByRole('button', { name: 'Open menu', exact: true });
  await menuButton.click();
  await mp.locator('#dashboard-menu').waitFor();
  await mp.keyboard.press('Escape');
  ok((await mp.locator('#dashboard-menu').count()) === 0, 'Escape closes the phone menu');
  ok(await menuButton.evaluate((el) => el === document.activeElement), 'Escape returns focus to the phone menu button');
  await mobile.close();

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally {
  await browser.close();
}
