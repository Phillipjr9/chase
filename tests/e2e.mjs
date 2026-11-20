/**
 * End-to-end browser flow: sign in -> transfer -> pay card -> verify balances.
 *
 * Requirements:
 *   npm run build
 *   node server/index.js            (PORT defaults to 3000)
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Run: BASE_URL=http://127.0.0.1:3000 TEST_ROOT_PASSWORD=... node tests/e2e.mjs
 *
 * The suite provisions its own Super Administrator, customer and accounts, so it
 * no longer depends on the retired sample-seeding endpoint (POST /api/seed now
 * returns 410 and there is no built-in demo login).
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const ROOT_USER = process.env.CHASE_ADMIN_USERNAME || 'dianasmith6525@gmail.com';
const ROOT_PASS =
  process.env.CHASE_ADMIN_PASSWORD ||
  process.env.TEST_ROOT_PASSWORD ||
  'Temporary-test-password-92!';

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

const post = (path, body, token) =>
  api(path, { method: 'POST', body: JSON.stringify(body) }, token);

/* ---------------------------------------------------------------- fixtures */
const suffix = Math.random().toString(36).slice(2, 8);
const ADMIN = (await post('/api/admin/login', { username: ROOT_USER, password: ROOT_PASS })).token;

const username = `e2e.customer.${suffix}`;
const password = 'E2eCustomer123!';
const created = await post(
  '/api/admin/users',
  { username, fullName: 'E2E Customer', email: `${username}@example.test`, password },
  ADMIN
);
const userId = created.user.id;

for (const [type, name, balance, extra] of [
  ['checking', 'Everyday Checking', 5000, {}],
  ['savings', 'Savings', 2000, {}],
  ['credit-card', 'Credit Card', 800, { creditLimit: 5000 }],
]) {
  await post(`/api/admin/users/${userId}/accounts`, { type, name, balance, ...extra }, ADMIN);
}

/* ------------------------------------------------------------------- flow */
// CHROMIUM_EXECUTABLE lets environments without Playwright's own download
// (e.g. a bundled/system Chromium) point at a specific browser binary.
const executablePath = process.env.CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [];
const step = (message) => {
  results.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
};

try {
  const login = await post('/api/auth/login', { username, password });
  const token = login.token;
  const before = (await api('/api/auth/me', {}, token)).user;
  const checking = before.accounts.find((a) => a.type === 'checking');
  const savings = before.accounts.find((a) => a.type === 'savings');
  const card = before.accounts.find((a) => a.type === 'credit-card');
  assert.ok(checking && savings && card, 'provisioned customer has checking, savings and a card');

  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Sign in with the provisioned credentials (the old "Fill demo credentials"
  // shortcut no longer exists).
  await page.locator('#chase-username').fill(username);
  await page.locator('#chase-password').fill(password);
  await page.locator('form').filter({ has: page.locator('#chase-username') })
    .getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 20000 });
  step('sign in reaches the accounts overview');

  // ---- Transfer ----
  await page.getByRole('button', { name: /Transfer money/ }).first().click();
  await page.locator('h2', { hasText: 'Transfer between your accounts' }).waitFor();
  await page.getByPlaceholder('0.00').fill('125.50');
  await page.getByPlaceholder('e.g. Monthly savings').fill('E2E transfer');
  await page.getByRole('button', { name: /^Transfer/ }).last().click();
  await page.getByRole('heading', { name: 'Transfer complete', exact: true }).waitFor({ timeout: 20000 });
  step('transfer submits and shows a receipt');

  const afterTransfer = (await api('/api/auth/me', {}, token)).user;
  const checkingAfter = afterTransfer.accounts.find((a) => a.id === checking.id);
  const savingsAfter = afterTransfer.accounts.find((a) => a.id === savings.id);
  assert.equal(checkingAfter.balance, Math.round((checking.balance - 125.5) * 100) / 100);
  assert.equal(savingsAfter.balance, Math.round((savings.balance + 125.5) * 100) / 100);
  step('transfer debits and credits the correct accounts');

  // ---- Pay card ----
  await page.getByRole('button', { name: 'Make another', exact: true }).click();
  await page.getByRole('button', { name: /Pay credit card/ }).first().click();
  await page.locator('h2', { hasText: 'Pay your credit card' }).waitFor();
  await page.getByRole('button', { name: /Custom/ }).first().click();
  const customAmount = page.locator('main input[inputmode="decimal"]').first();
  await customAmount.fill('75');
  await page.getByRole('button', { name: /^Pay \$75/ }).click();
  await page.getByRole('heading', { name: /Paid \$75\.00/ }).waitFor({ timeout: 20000 });
  step('card payment submits and shows a receipt');

  const finalUser = (await api('/api/auth/me', {}, token)).user;
  const finalCard = finalUser.accounts.find((a) => a.id === card.id);
  const finalChecking = finalUser.accounts.find((a) => a.id === checking.id);
  assert.equal(finalCard.balance, Math.round((card.balance - 75) * 100) / 100);
  assert.equal(finalChecking.balance, Math.round((checkingAfter.balance - 75) * 100) / 100);
  step('card payment reduces the card and funding balances');

  // ---- Reload restores the session and preserves balances ----
  // After a reload the app deliberately returns to the marketing homepage and
  // shows the signed-in "welcome back" panel rather than auto-opening the
  // dashboard; reaching that panel proves the stored session was restored.
  await page.reload({ waitUntil: 'networkidle' });
  const goToAccounts = page.getByRole('button', { name: 'Go to your accounts', exact: true });
  await goToAccounts.waitFor({ timeout: 20000 });
  step('session is restored after reload');

  await goToAccounts.click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 20000 });
  const finalAgain = (await api('/api/auth/me', {}, token)).user;
  assert.equal(finalAgain.accounts.find((a) => a.id === card.id).balance, finalCard.balance);
  step('balances persist after reload');

  assert.deepEqual(errors, [], `runtime errors: ${errors.join('; ')}`);
  step('no runtime errors during the flow');
  console.log(`\n${results.length} e2e checks passed against ${BASE}`);
  await context.close();
} finally {
  await browser.close();
  // Remove this run's provisioned customer so repeat runs stay clean.
  try {
    await api(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    }, ADMIN);
  } catch {
    /* best-effort cleanup */
  }
}
