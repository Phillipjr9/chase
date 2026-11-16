import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = []; const errors = [];
const ok = (c, m) => { assert.ok(c, m); out.push('PASS ' + m); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });

  // Loans group with real mortgage + auto loan
  const body = await p.locator('body').innerText();
  ok(body.includes('Chase Home Lending Mortgage'), 'Accounts overview lists the mortgage');
  ok(body.includes('Chase Auto Loan'), 'Accounts overview lists the auto loan');
  ok(body.includes('Loans & lines of credit'), 'Loans group heading present');
  ok((await p.getByRole('button', { name: /Pay a loan/ }).count()) >= 1, 'Quick actions include Pay a loan');

  // MyHome uses live mortgage data
  await p.getByRole('button', { name: 'MyHome®', exact: true }).first().click();
  await p.getByRole('heading', { name: 'Chase MyHome®', exact: true }).waitFor();
  const myhome = await p.locator('body').innerText();
  ok(myhome.includes('$412,400.00'), 'MyHome shows the real loan balance');
  ok(myhome.includes('Mortgage activity'), 'MyHome shows real mortgage activity');
  ok(!myhome.includes('Pay mortgage') === false, 'MyHome has a Pay mortgage action');

  // Pay mortgage -> loan page
  await p.getByRole('button', { name: 'Pay mortgage', exact: true }).click();
  await p.locator('h2', { hasText: 'Pay your mortgage' }).waitFor();
  ok(true, 'Pay mortgage opens the dedicated loan page');
  ok((await p.locator('body').innerText()).includes('$3,187'), 'Loan page preselects the monthly payment');

  await p.getByRole('button', { name: /Pay \$3,187/ }).click();
  await p.getByRole('heading', { name: 'Loan payment complete', exact: true }).waitFor({ timeout: 15000 });
  const receipt = await p.locator('body').innerText();
  ok(receipt.includes('$409,213.00'), 'Receipt shows the reduced remaining balance');
  ok(/CHLP-/.test(receipt), 'Receipt includes a confirmation number');

  // Scheduled payments panel + cancel
  await p.getByRole('button', { name: 'Make another', exact: true }).click();
  await p.getByRole('button', { name: 'All services', exact: true }).click();
  await p.getByText('Scheduled payments', { exact: true }).waitFor();
  ok((await p.locator('body').innerText()).includes('Con Edison'), 'Scheduled panel lists the seeded bill payment');
  await p.getByRole('button', { name: /Cancel scheduled payment to Con Edison/ }).click();
  await p.getByRole('status').filter({ hasText: 'cancelled' }).waitFor();
  ok((await p.locator('body').innerText()).includes('0 upcoming'), 'Cancelling updates the scheduled count');

  // Real transfer scheduling
  await p.getByRole('button', { name: /Transfer money/ }).first().click();
  await p.locator('h2', { hasText: 'Transfer between your accounts' }).waitFor();
  await p.getByPlaceholder('0.00').fill('250');
  const whenSelect = p.locator('select').filter({ has: p.locator('option', { hasText: 'Schedule for a future date' }) });
  await whenSelect.selectOption('scheduled');
  ok(await p.getByLabel('First delivery date', { exact: true }).isVisible(), 'Scheduling reveals a delivery date field');
  ok(await p.getByLabel('Repeat', { exact: true }).isVisible(), 'Scheduling reveals a repeat field');
  const future = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
  await p.getByLabel('First delivery date', { exact: true }).fill(future);
  await p.getByLabel('Repeat', { exact: true }).selectOption('monthly');
  await p.getByRole('button', { name: /Schedule \$250/ }).click();
  await p.getByRole('heading', { name: 'Recurring transfer scheduled', exact: true }).waitFor({ timeout: 15000 });
  ok(true, 'Recurring transfer schedules with a receipt');

  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov <= 1, 'No sideways scroll during loan and scheduling flows');
  await p.screenshot({ path: '.work/loan-flow.png' });
  await ctx.close();

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally { await browser.close(); }
