const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const path = require('path');
const FILE = '/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/home-redesign.html';
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('ERR ' + e.message));
  await page.goto('file://' + FILE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/home/user/times-table-hero/shot-redesign.png', fullPage: true });
  // phone-only crop
  const phone = await page.$('.phone');
  if (phone) await phone.screenshot({ path: '/home/user/times-table-hero/shot-redesign-phone.png' });
  console.log('errs:', JSON.stringify(errs.slice(0, 8)));
  await browser.close();
})();
