import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const out = [];
const ok = (c, m) => { assert.ok(c, m); out.push('PASS ' + m); };
const errs = [];
try {
  for (const [name, vp] of [['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 1000 } }]]) {
    const ctx = await browser.newContext(vp);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
    await p.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
    await p.locator('form').filter({ has: p.locator('#chase-username') }).getByRole('button', { name: 'Sign in', exact: true }).click();
    await p.getByRole('heading', { name: 'Accounts', exact: true }).waitFor({ timeout: 10000 });
    // Open deposit page via quick action (Deposit a check) on phone uses the menu-less tile; desktop tile too.
    const tile = p.getByRole('button', { name: /Deposit a check/ }).first();
    if (await tile.count()) await tile.click();
    else { await p.getByRole('button', { name: 'Pay & Transfer', exact: true }).click(); await p.getByRole('button', { name: /Deposit a check/ }).first().click(); }
    await p.locator('h2', { hasText: 'Chase QuickDeposit' }).waitFor();
    ok(await p.locator('select').first().inputValue() !== '', `${name}: deposit page loads with an eligible account`);
    // Step 1 validation
    await p.getByRole('button', { name: 'Continue', exact: true }).click();
    ok((await p.getByRole('alert').innerText()).includes('Choose') || (await p.getByRole('alert').innerText()).includes('Enter an amount'), `${name}: step 1 blocks empty amount`);
    await p.getByPlaceholder('0.00').fill('350');
    await p.getByRole('button', { name: 'Continue', exact: true }).click();
    // Step 2 validation: submit without photos
    await p.getByRole('button', { name: /Deposit \$350/ }).click();
    ok((await p.getByRole('alert').innerText()).includes('front and the back'), `${name}: step 2 requires both photos`);
    // Upload photos
    const inputs = p.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles('.work/check/front.png');
    await inputs.nth(1).setInputFiles('.work/check/back.png');
    ok((await p.locator('img[alt="Front of check preview"]').count()) === 1 && (await p.locator('img[alt="Back of check preview"]').count()) === 1, `${name}: front and back previews appear`);
    // Confirm then submit
    await p.getByRole('button', { name: /Deposit \$350/ }).click();
    ok((await p.getByRole('alert').innerText()).includes('Confirm'), `${name}: requires endorsement confirmation`);
    await p.getByRole('checkbox').check();
    await p.getByRole('button', { name: /Deposit \$350/ }).click();
    await p.getByRole('heading', { name: 'Deposit received', exact: true }).waitFor({ timeout: 10000 });
    ok(true, `${name}: receipt shows after submission`);
    ok((await p.getByText('Under review').count()) >= 1 || (await p.locator('body').innerText()).includes('Under review'), `${name}: receipt status says under review`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `${name}: deposit flow has no sideways scroll`);
    await p.screenshot({ path: `.work/deposit-${name}.png`, fullPage: false });
    await ctx.close();
  }
  ok(errs.length === 0, 'No runtime errors: ' + errs.join('; '));
  console.log(out.join('\n') + `\n\n${out.length} checks passed.`);
} finally { await browser.close(); }
