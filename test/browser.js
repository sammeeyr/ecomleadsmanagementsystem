'use strict';
// Browser test: prospect submits the form, owner logs in, sees the lead, works it through the pipeline. Needs `node test/dev.js` running.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const assert = require('assert');
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];

  // --- prospect on a phone ---
  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push('prospect: ' + e.message));
  pp.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) errors.push('prospect console: ' + m.text()); });
  await pp.goto(BASE + '/');
  await pp.click('#f-form button[type=submit]');
  assert.ok((await pp.textContent('#f-err')).includes('Enter your name'), 'empty form shows an error');
  await pp.fill('#f-name', 'Ngozi Eze'); await pp.fill('#f-biz', 'Ngozi Herbs'); await pp.fill('#f-phone', '0802 555 1212');
  await pp.selectOption('#f-sell', 'Herbal and wellness'); await pp.selectOption('#f-vol', '50 to 300 orders a month');
  await pp.check('input[name="f-pain"][value="Orders get lost"]', { force: true });
  await pp.check('input[name="f-pain"][value="No order tracking"]', { force: true });
  await pp.fill('#f-notes', 'Please call after 4pm');
  const hScroll = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(hScroll <= 0, 'no horizontal scroll on phone, got ' + hScroll);
  await pp.screenshot({ path: '/tmp/claude-0/shot-form.png', fullPage: true });
  await pp.click('#f-form button[type=submit]');
  await pp.waitForSelector('text=Thank you, Ngozi');
  assert.ok(await pp.locator('a[href*="wa.me/2348071472213"]').count() === 1, 'thank-you page offers WhatsApp');

  // --- owner on a laptop ---
  const desk = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const op = await desk.newPage();
  op.on('pageerror', (e) => errors.push('owner: ' + e.message));
  op.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource|401/.test(m.text())) errors.push('owner console: ' + m.text()); });
  await op.goto(BASE + '/pipeline');
  await op.waitForSelector('#loginForm');
  await op.fill('#pw', 'wrong'); await op.click('#loginForm button');
  await op.waitForSelector('text=not right');
  await op.fill('#pw', 'preview-password'); await op.click('#loginForm button');
  await op.waitForSelector('article.lead');
  assert.strictEqual(await op.locator('article.lead').count(), 1, 'the submitted lead is in the pipeline');
  assert.ok((await op.textContent('article.lead')).includes('Ngozi Eze'));
  assert.ok((await op.textContent('article.lead')).includes('Due tomorrow'), 'new lead is due tomorrow');
  assert.ok((await op.textContent('article.lead')).includes('Prospect form'));
  await op.screenshot({ path: '/tmp/claude-0/shot-pipeline.png', fullPage: true });

  // follow up: moves to Contacted and pushes the next date
  await op.click('[data-act=done]');
  await op.waitForSelector('article.lead .pill:text("Contacted")');
  // open details, set a fee and hot interest, log a note
  await op.click('[data-act=toggle]');
  await op.waitForSelector('.detail');
  await op.fill('input[data-field=setupValue]', '750000'); await op.press('input[data-field=setupValue]', 'Tab');
  await op.selectOption('select[data-field=interest]', 'hot');
  await op.fill('input[id^=an-]', 'Asked for a Friday demo'); await op.click('[data-act=note]');
  await op.waitForSelector('.log >> text=Asked for a Friday demo');
  const wa = await op.getAttribute('a[data-wa]', 'href');
  assert.ok(wa.startsWith('https://wa.me/2348025551212?text='), 'WhatsApp link uses the +234 form of the number: ' + wa);
  assert.ok(decodeURIComponent(wa).includes('Ngozi'), 'message is addressed to the lead');
  await op.screenshot({ path: '/tmp/claude-0/shot-detail.png', fullPage: true });

  // reload: everything persisted in the database
  await op.reload();
  await op.waitForSelector('article.lead');
  assert.ok((await op.textContent('#summary')).includes('750,000'), 'open setup fees total shows after reload');
  const card = await op.textContent('article.lead');
  assert.ok(card.includes('Hot') && card.includes('Contacted'), 'stage and interest persisted');

  // add a lead by pasting a WhatsApp message
  await op.click('#addBtn');
  await op.fill('#o-paste', "Hello Cube Tech, I'm interested in eComCRM.\nName: Chidi Okafor\nBusiness: Chidi Gadgets\nWhatsApp: 0813 999 0000\nWe sell: Electronics and gadgets\nOrders: Over 1,000 orders a month\nBiggest problems: Slow replies to customers, Hard to see sales");
  await op.click('#o-fill');
  assert.strictEqual(await op.inputValue('#o-name'), 'Chidi Okafor');
  assert.strictEqual(await op.inputValue('#o-src'), 'WhatsApp');
  assert.ok(await op.isChecked('input[name="o-pain"][value="Hard to see sales"]'));
  await op.fill('#o-val', '1500000');
  await op.click('#o-form button[type=submit]');
  await op.waitForSelector('text=Chidi Okafor');
  assert.strictEqual(await op.locator('article.lead').count(), 2);

  // search and filter
  await op.fill('#q', 'chidi'); assert.strictEqual(await op.locator('article.lead').count(), 1);
  await op.fill('#q', '');
  await op.click('.fchip[data-f=contacted]'); assert.strictEqual(await op.locator('article.lead').count(), 1);
  await op.click('.fchip[data-f=all]');

  // dark mode renders
  await op.emulateMedia({ colorScheme: 'dark' });
  await op.screenshot({ path: '/tmp/claude-0/shot-dark.png', fullPage: true });

  // export downloads a CSV
  const [dl] = await Promise.all([op.waitForEvent('download'), op.click('#exportBtn')]);
  assert.ok(/^ecomcrm-leads-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()));

  // delete (two taps)
  await op.click('article.lead:has-text("Chidi") [data-act=toggle]');
  await op.click('article.lead:has-text("Chidi") [data-act=del]');
  await op.click('article.lead:has-text("Chidi") [data-act=delok]');
  await op.waitForFunction(() => document.querySelectorAll('article.lead').length === 1);

  // logout returns to the login form and the API refuses
  await op.click('#logoutBtn'); await op.waitForSelector('#loginForm');
  const r = await op.evaluate(async () => (await fetch('/api/leads')).status);
  assert.strictEqual(r, 401, 'API refuses after logout');

  await browser.close();
  assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
  console.log('Browser flow passed');
})().catch((e) => { console.error('BROWSER TEST FAILED:', e.message); process.exit(1); });
