import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; console.log(`PASS ${message}`); };

try {
  await page.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
  await Promise.race([page.evaluate(() => document.fonts.ready), page.waitForTimeout(5000)]);
  let footer = page.getByRole('contentinfo', { name: 'Website footer' });
  await footer.waitFor();
  check(await footer.getByRole('button', { name: 'Checking accounts', exact: true }).isVisible(), 'Desktop product directory is populated');
  check(await footer.locator('.footer-group').count() === 4, 'Four footer navigation columns');
  check(await footer.locator('.footer-social-link').count() === 6, 'Six real social logo links');
  check(await footer.locator('a[href^="#"]').count() === 0, 'No placeholder anchor links');
  check(await footer.locator('a[target="_blank"]:not([rel~="noopener"])').count() === 0, 'External links have safe new-tab attributes');
  const brokenImages = await footer.locator('img').evaluateAll((images) => images.filter((img) => !img.complete || !img.naturalWidth).map((img) => img.src));
  check(brokenImages.length === 0, 'Footer logo, social marks, and FDIC artwork load');
  await footer.screenshot({ path: '.work/footer-desktop.png' });

  await footer.getByRole('button', { name: 'Checking accounts', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  check((await page.getByRole('dialog').innerText()).includes('Checking'), 'Checking link opens its correct product details');
  await page.getByRole('button', { name: 'Close modal', exact: true }).click();

  const supportButton = footer.getByRole('button', { name: 'Contact & support', exact: true });
  await supportButton.click();
  await page.getByRole('dialog', { name: 'How can we help?' }).waitFor();
  check(await page.getByRole('button', { name: /Account access & statements/ }).isVisible(), 'Support dialog has working service choices');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(await supportButton.evaluate((el) => el === document.activeElement), 'Escape closes dialog and returns keyboard focus');

  await footer.getByRole('button', { name: 'Demo privacy', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your privacy in this demo' }).waitFor();
  check((await page.getByRole('dialog').innerText()).includes('local storage'), 'Privacy dialog explains actual demo data storage');
  await page.keyboard.press('Escape');

  await footer.getByRole('button', { name: 'Give feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Save feedback locally', exact: true }).click();
  check(await page.getByRole('alert').isVisible(), 'Feedback validates empty submissions');
  await page.getByRole('textbox', { name: 'Your feedback', exact: true }).fill('Footer verification: navigation and mobile sections work well.');
  await page.getByRole('button', { name: 'Save feedback locally', exact: true }).click();
  check((await page.getByRole('status').innerText()).includes('stored in this browser only'), 'Feedback confirmation accurately says local-only');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chase_demo_feedback_v1') || '[]'));
  check(saved.length === 1, 'Feedback is actually saved in local storage');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const bankingToggle = footer.getByRole('button', { name: 'Banking & borrowing', exact: true });
  check(await bankingToggle.isVisible(), 'Mobile shows accordion controls');
  check(await bankingToggle.getAttribute('aria-expanded') === 'false', 'Mobile banking column starts collapsed');
  await bankingToggle.click();
  check(await bankingToggle.getAttribute('aria-expanded') === 'true', 'Mobile accordion updates expanded state');
  check(await footer.getByRole('button', { name: 'Checking accounts', exact: true }).isVisible(), 'Mobile accordion reveals product links');
  check(await footer.evaluate((el) => el.scrollWidth <= window.innerWidth), 'Mobile footer has no horizontal overflow');
  await footer.screenshot({ path: '.work/footer-mobile.png' });
  await footer.getByRole('button', { name: 'Back to top', exact: true }).click();
  await page.waitForTimeout(100);
  check(await page.evaluate(() => window.scrollY < 5), 'Back to top works with reduced-motion preference');

  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  const form = page.locator('form').filter({ has: page.locator('#chase-username') });
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  footer = page.getByRole('contentinfo', { name: 'Online banking footer' });
  await footer.waitFor();
  check(await footer.locator('.footer-group').count() === 4, 'Dashboard renders the same complete footer');
  await footer.getByRole('button', { name: 'Spending & budgeting', exact: true }).click();
  await page.getByRole('heading', { name: 'Spending & Budgeting', exact: true }).waitFor();
  check(true, 'Dashboard footer routes to Spending & Budgeting');
  await footer.getByRole('button', { name: 'Statements & documents', exact: true }).click();
  await page.getByRole('heading', { name: 'Statements & Documents', exact: true }).waitFor();
  check(true, 'Dashboard footer routes to Statements');
  await footer.getByRole('button', { name: 'Find an ATM or branch', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Find an ATM or branch', exact: true }).waitFor();
  check(true, 'Dashboard footer opens branch locator');
  await footer.getByRole('button', { name: 'Schedule a meeting', exact: true }).click();
  await page.getByRole('dialog', { name: 'Schedule a meeting with a banker' }).waitFor();
  check(true, 'Dashboard meeting link opens actual scheduler');
  await page.getByRole('button', { name: 'Close scheduler', exact: true }).click();
  await footer.getByRole('button', { name: 'Back to accounts overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts', exact: true }).waitFor();
  check(true, 'Footer logo returns to dashboard overview');
  await footer.screenshot({ path: '.work/footer-dashboard.png' });

  check(errors.length === 0, `No browser runtime errors: ${errors.join('; ')}`);
  console.log(`\n${checks} footer checks passed. Desktop, mobile, and dashboard screenshots saved.`);
} finally {
  await browser.close();
}