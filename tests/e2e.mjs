/**
 * End-to-end: sign in -> transfer -> pay card -> verify balances.
 *
 * Requirements:
 *   npm run build
 *   node server/index.js            (PORT defaults to 3000)
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Run: BASE_URL=http://127.0.0.1:3000 node tests/e2e.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const USER = process.env.E2E_USER || 'demo';
const PASS = process.env.E2E_PASS || 'chase123';

const money = (text) => Number(String(text).replace(/[^0-9.-]/g, ''));

async function api(path, options = {}, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  assert.ok(res.ok, `${path} failed: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
const step = (message) => {
  results.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
};

try {
  await api('/api/seed', { method: 'POST' });
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const token = login.token;
  const before = (await api('/api/auth/me', {}, token)).user;
  const checking = before.accounts.find((a) => a.type === 'checking');
  const savings = before.accounts.find((a) => a.type === 'savings');
  const card = before.accounts.find((a) => a.type === 'credit-card');
  assert.ok(checking && savings && card, 'demo user has checking, savings and a card');

  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await page.locator('form').filter({ has: page.locator('#chase-username') })
    .getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });
  step('sign in reaches the accounts overview');

  // ---- Transfer ----
  await page.getByRole('button', { name: /Transfer money/ }).first().click();
  await page.locator('h2', { hasText: 'Transfer between your accounts' }).waitFor();
  await page.getByPlaceholder('0.00').fill('125.50');
  await page.getByPlaceholder('e.g. Monthly savings').fill('E2E transfer');
  await page.getByRole('button', { name: /^Transfer/ }).last().click();
  await page.getByRole('heading', { name: 'Transfer complete', exact: true }).waitFor({ timeout: 15000 });
  step('transfer submits and shows a receipt');

  const afterTransfer = (await api('/api/auth/me', {}, token)).user;
  const checkingAfter = afterTransfer.accounts.find((a) => a.id === checking.id);
  const savingsAfter = afterTransfer.accounts.find((a) => a.id === savings.id);
  assert.equal(checkingAfter.balance, Math.round((checking.balance - 125.5) * 100) / 100);
  assert.equal(savingsAfter.balance, Math.round((savings.balance + 125.5) * 100) / 100);
  step('transfer debits and credits the correct accounts');

  // ---- Pay card ----
  await page.getByRole('button', { name: 'Make another', exact: true }).click();
  const serviceMenu = page.getByRole('button', { name: /Pay credit card/ });
  await serviceMenu.first().click();
  await page.locator('h2', { hasText: 'Pay your credit card' }).waitFor();
  await page.getByRole('button', { name: 'Custom You choose', exact: true }).click();
  const customAmount = page.locator('main input[inputmode="decimal"]').first();
  await customAmount.fill('75');
  await page.getByRole('button', { name: /^Pay \$75/ }).click();
  await page.getByRole('heading', { name: /Paid \$75\.00/, exact: false }).waitFor({ timeout: 15000 });
  step('card payment submits and shows a receipt');

  const finalUser = (await api('/api/auth/me', {}, token)).user;
  const finalCard = finalUser.accounts.find((a) => a.id === card.id);
  const finalChecking = finalUser.accounts.find((a) => a.id === checking.id);
  assert.equal(finalCard.balance, Math.round((card.balance - 75) * 100) / 100);
  assert.equal(finalChecking.balance, Math.round((checkingAfter.balance - 75) * 100) / 100);
  step('card payment reduces the card and funding balances');

  // ---- Reload persists state ----
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Go to your accounts', exact: true }).waitFor({ timeout: 15000 });
  const finalAgain = (await api('/api/auth/me', {}, token)).user;
  assert.equal(finalAgain.accounts.find((a) => a.id === card.id).balance, finalCard.balance);
  step('balances persist after reload');

  assert.deepEqual(errors, [], `runtime errors: ${errors.join('; ')}`);
  step('no runtime errors during the flow');
  console.log(`\n${results.length} e2e checks passed against ${BASE}`);
  await context.close();
} finally {
  await browser.close();
}
