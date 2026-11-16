import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const ok = (c, m) => { assert.ok(c, m); out.push('PASS ' + m); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Product comparison pages from the homepage
  await page.getByRole('button', { name: 'Compare checking accounts', exact: true }).click();
  await page.getByRole('heading', { name: 'Compare checking accounts', exact: true }).waitFor();
  ok((await page.getByRole('table').count()) >= 1, 'Checking comparison table renders');
  ok((await page.locator('body').innerText()).includes('Chase Total Checking®'), 'Checking table lists accounts');
  await page.getByRole('tab', { name: 'Credit cards', exact: true }).click();
  await page.getByRole('heading', { name: 'Compare credit cards', exact: true }).waitFor();
  ok((await page.locator('body').innerText()).includes('Chase Sapphire Preferred®'), 'Card comparison lists cards');
  await page.getByRole('button', { name: /^Compare Chase Sapphire Preferred/ }).click();
  await page.getByRole('heading', { name: 'Side-by-side comparison', exact: true }).waitFor();
  ok(true, 'Card compare builds a side-by-side table');
  await page.getByRole('button', { name: /^Compare Chase Freedom Unlimited/ }).click();
  ok((await page.getByRole('table').last().locator('thead th').count()) === 3, 'Two cards produce two comparison columns');
  await page.getByRole('tab', { name: 'Rates & calculators', exact: true }).click();
  await page.getByRole('heading', { name: 'Mortgage rates', exact: true }).waitFor({ timeout: 10000 });
  ok((await page.locator('body').innerText()).includes('APR'), 'Live rates table loads APRs');
  ok((await page.getByText(/Estimated monthly principal/).count()) === 1, 'Mortgage calculator renders');
  const calcValue = page.locator('p.text-\\[26px\\]').first();
  const calcBefore = await calcValue.innerText();
  await page.getByLabel('Home price', { exact: true }).fill('600000');
  await page.waitForTimeout(200);
  ok((await calcValue.innerText()) !== calcBefore, 'Mortgage calculator responds to inputs');
  ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, 'Product pages have no horizontal overflow');
  await page.getByRole('button', { name: 'Back to chase.com', exact: true }).click();

  // Sign in and test Spanish + global search
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await page.locator('form').filter({ has: page.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  ok((await page.locator('header').innerText()).includes('Cuentas'), 'Spanish translates dashboard navigation');
  ok((await page.locator('body').innerText()).includes('Cosas que puede hacer'), 'Spanish translates account quick actions');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  ok((await page.locator('header').innerText()).includes('Accounts'), 'Language can switch back to English');

  await page.getByRole('button', { name: /Search accounts, payees, settings, offers/ }).click();
  const search = page.getByLabel('Search accounts, payees, settings, offers, or transactions', { exact: true });
  await search.fill('Con Edison');
  await page.locator('#dashboard-search').getByText('Payee', { exact: true }).waitFor();
  ok(true, 'Global search finds payees');
  await search.fill('privacy');
  await page.locator('#dashboard-search').getByRole('button', { name: /Privacy choices/ }).click();
  await page.getByRole('heading', { name: 'Privacy choices', exact: true }).waitFor();
  ok(true, 'Global search opens a settings section directly');
  await page.getByRole('button', { name: /Search accounts, payees, settings, offers/ }).click();
  await search.fill('score simulator');
  await page.locator('#dashboard-search').getByRole('button', { name: /Score simulator/ }).click();
  await page.getByRole('tab', { name: 'Score simulator' }).click();
  ok((await page.getByRole('heading', { name: 'Score simulator', exact: true }).count()) >= 1, 'Global search opens credit tools');

  ok(errors.length === 0, 'No runtime errors: ' + errors.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
  await ctx.close();
} finally {
  await browser.close();
}
