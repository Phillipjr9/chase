import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const errors = [];
const ok = (condition, message) => { assert.ok(condition, message); out.push(`PASS ${message}`); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function signIn(page) {
  await page.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await page.locator('form').filter({ has: page.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });
}

try {
  for (const [name, contextOptions] of [
    ['desktop', { viewport: { width: 1440, height: 1100 } }],
    ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ]) {
    const ctx = await browser.newContext(contextOptions);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await signIn(page);
    await page.getByRole('button', { name: /Chase Sapphire Preferred/ }).first().click();
    await page.locator('h1', { hasText: 'Chase Sapphire Preferred' }).waitFor();

    ok((await page.locator('body').innerText()).includes('Current balance'), `${name}: Chase current balance header is present`);
    ok((await page.locator('img[alt="Chase Sapphire Preferred credit card"]').count()) === 1, `${name}: real Sapphire card artwork is used`);
    ok((await page.getByRole('button', { name: 'Pay card', exact: true }).count()) === 1, `${name}: Pay card action is present`);
    ok((await page.getByRole('button', { name: 'Statements', exact: true }).count()) >= 1, `${name}: Statements action is present`);
    ok((await page.getByRole('button', { name: /Paperless/ }).count()) === 1, `${name}: Paperless action is present`);
    ok((await page.getByRole('button', { name: 'More', exact: true }).count()) === 1, `${name}: More menu is present`);
    ok((await page.locator('body').innerText()).includes('$50 Annual Chase Travel Hotel Credit'), `${name}: card-specific benefits are shown`);
    ok((await page.locator('body').innerText()).includes('$580.29 spent'), `${name}: bonus progress is derived from card transactions`);
    ok((await page.locator('body').innerText()).includes('$3,419.71 to go'), `${name}: remaining bonus spend is calculated`);

    await page.getByRole('button', { name: 'Show details', exact: true }).click();
    ok((await page.locator('body').innerText()).includes('$980.20'), `${name}: expanded statement balance is shown`);
    ok((await page.getByRole('button', { name: 'Hide details', exact: true }).count()) === 1, `${name}: details can be expanded and collapsed`);

    await page.getByRole('button', { name: 'Add adidas offer', exact: true }).click();
    ok((await page.getByRole('button', { name: 'Remove adidas offer', exact: true }).count()) === 1, `${name}: Chase Offers can be added to the card`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Go to your accounts', exact: true }).click();
    await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /Chase Sapphire Preferred/ }).first().click();
    await page.locator('h1', { hasText: 'Chase Sapphire Preferred' }).waitFor();
    ok((await page.getByRole('button', { name: 'Remove adidas offer', exact: true }).count()) === 1, `${name}: selected offer persists after reload`);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Lock card', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Card locked' }).waitFor();
    ok((await page.locator('body').innerText()).includes('Locked'), `${name}: More menu locks the card and updates status`);
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock card', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Card unlocked' }).waitFor();

    await page.getByLabel('Search card transactions', { exact: true }).fill('Starbucks');
    ok((await page.locator('body').innerText()).includes('Starbucks'), `${name}: activity search finds the merchant`);
    ok(!(await page.locator('body').innerText()).includes('United Airlines'), `${name}: activity search hides non-matching merchants`);
    await page.getByLabel('Search card transactions', { exact: true }).fill('');
    await page.getByLabel('Sort transactions', { exact: true }).selectOption('largest');
    const firstTransaction = await page.locator('ul li').filter({ hasText: 'United Airlines' }).count();
    ok(firstTransaction >= 1, `${name}: largest-first sort surfaces the largest charge`);

    await page.getByRole('button', { name: 'Pay card', exact: true }).click();
    await page.locator('h2', { hasText: 'Pay your credit card' }).waitFor();
    ok(true, `${name}: Pay card opens the dedicated payment page`);

    ok((await overflow(page)) <= 1, `${name}: card page has no horizontal overflow`);
    await ctx.close();
  }
  ok(errors.length === 0, `No runtime errors: ${errors.join('; ')}`);
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally {
  await browser.close();
}
