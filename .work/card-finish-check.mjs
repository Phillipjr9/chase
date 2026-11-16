import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const errors = [];
const ok = (condition, message) => { assert.ok(condition, message); out.push(`PASS ${message}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // Real Chase full-blue loading screen while the API is slow.
  await page.route('**/api/health', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.continue().catch(() => {});
  });
  await page.goto('http://127.0.0.1:3100', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Chase Online…', { exact: true }).waitFor();
  ok(true, 'Chase blue full-page loader appears while the session loads');
  ok(await page.locator('.animate-spin').count() >= 1, 'Chase blue loader shows a spinning ring');
  await page.unroute('**/api/health');

  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();

  // Sign-in spinner while the request is in flight.
  await page.route('**/api/auth/login', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue().catch(() => {});
  });
  await page.locator('form').filter({ has: page.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Signing in…', { exact: true }).waitFor();
  ok(await page.locator('form .animate-spin').count() >= 1, 'Sign-in button shows a spinner while signing in');
  await page.unroute('**/api/auth/login');

  // Dashboard skeleton on first entry.
  await page.getByText('Loading account data…', { exact: true }).waitFor({ timeout: 15000 });
  ok(true, 'Dashboard shows Chase-style skeleton while accounts load');
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });

  // Card page skeleton.
  await page.getByRole('button', { name: /Chase Sapphire Preferred/ }).first().click();
  await page.getByText('Loading card activity…', { exact: true }).waitFor({ timeout: 5000 });
  ok(true, 'Credit card page shows a skeleton while the card loads');
  await page.locator('h1', { hasText: 'Chase Sapphire Preferred' }).waitFor({ timeout: 10000 });

  // Paperless spinner while saving.
  await page.route('**/api/cards/controls', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue().catch(() => {});
  });
  const paperlessBtn = page.getByRole('button', { name: /^Paperless \((on|off)\)$/ }).first();
  const beforeLabel = await paperlessBtn.innerText();
  await paperlessBtn.click();
  ok(await page.getByRole('button', { name: /Paperless \((on|off)\)/ }).first().locator('.animate-spin').count() === 1, 'Paperless shows a spinner while saving');
  await page.waitForFunction(
    (before) => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /^Paperless \((on|off)\)$/.test((b.textContent || '').trim()));
      return !!btn && (btn.textContent || '').trim() !== before;
    },
    beforeLabel.trim(),
    { timeout: 8000 }
  );
  ok(true, 'Paperless saves the new state');
  await page.unroute('**/api/cards/controls');

  // View card number with password verification.
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'View card number', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'View card number', exact: true }).last().click();
  await page.getByRole('alert').filter({ hasText: 'password is incorrect' }).waitFor();
  ok(true, 'View card number rejects an incorrect password');
  await page.getByLabel('Password', { exact: true }).fill('chase123');
  await page.getByRole('button', { name: 'View card number', exact: true }).last().click();
  await page.getByText(/^4117 8234 5690 \d{4}$/).waitFor();
  ok(true, 'Correct password reveals the demonstration card number');
  await page.getByRole('button', { name: 'Close card number', exact: true }).click();

  // Automatic payments setup persists.
  await page.getByRole('button', { name: /Set up|Manage/ }).first().click();
  await page.getByRole('heading', { name: 'Automatic payments', exact: true }).waitFor();
  await page.getByLabel('Amount', { exact: true }).selectOption('statement');
  await page.getByLabel('Payment date', { exact: true }).selectOption('12');
  await page.getByRole('button', { name: 'Turn on automatic payments', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Automatic payments are on' }).waitFor({ timeout: 5000 });
  ok((await page.locator('body').innerText()).includes('12'), 'Automatic payments saves amount and payment day');
  ok(await page.getByRole('button', { name: /On\s*\|\s*Manage/ }).count() === 1, 'Metric reflects automatic payments On');

  // Dispute a real transaction.
  await page.getByRole('button', { name: 'View transaction United Airlines', exact: true }).click();
  await page.getByRole('heading', { name: 'United Airlines', exact: true }).waitFor();
  await page.getByLabel('Problem with this transaction?').selectOption('Duplicate charge');
  await page.getByRole('button', { name: 'Dispute transaction', exact: true }).click();
  await page.getByRole('button', { name: 'Submit dispute', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Dispute submitted' }).waitFor({ timeout: 5000 });
  ok(true, 'Dispute submits with the selected reason');
  await page.getByText('Open disputes', { exact: true }).waitFor();
  ok((await page.locator('body').innerText()).includes('Duplicate charge'), 'Open disputes panel lists the dispute');
  ok((await page.getByText('· Disputed', { exact: true }).count()) >= 1, 'Activity labels the disputed transaction');

  // Statement CSV download.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download .* statement/ }).first().click();
  const download = await downloadPromise;
  ok(download.suggestedFilename().endsWith('-statement.csv'), 'Card statement CSV downloads');

  // Replace the card.
  const oldMask = await page.locator('h1').innerText();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Replace card', exact: true }).click();
  await page.getByLabel('Why do you need a new card?').selectOption('stolen');
  await page.getByRole('button', { name: 'Order replacement', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Replacement ordered' }).waitFor({ timeout: 5000 });
  const newMask = await page.locator('h1').innerText();
  ok(oldMask !== newMask, 'Replacing the card issues a new card number');
  ok((await page.locator('body').innerText()).includes('Locked'), 'Replacement locks the old card');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(overflow <= 1, 'Finished card page has no horizontal overflow');
  await page.screenshot({ path: '.work/card-finished.png' });
  await ctx.close();

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally {
  await browser.close();
}
