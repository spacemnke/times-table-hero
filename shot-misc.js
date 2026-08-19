const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain' }); res.end(d); });
});
const SEED = () => {
  var facts = {}; for (var a = 2; a <= 12; a++) for (var b = 1; b <= 12; b++) { var n = 3 + Math.floor(Math.random() * 6); facts[a + '×' + b] = { n: n, c: Math.max(0, n - Math.floor(Math.random() * 2)), ms: n * 1400 }; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var days = {}; for (var o = 0; o < 9; o++) { var d = new Date(); d.setDate(d.getDate() - o); days[ymd(d)] = { q: 22, c: 19 }; }
  var prog = { v: 2, xp: 640, coins: 52, gems: 6, worldsUnlocked: 4, hero: 'fox', totalCorrect: 214, totalQ: 250, totalMs: 250 * 1800, fastCount: 44, bestStreak: 9, recent: [], facts: facts, days: days, badges: {}, secretsFound: {}, settings: { dailyGoal: 20, focusTables: [2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } };
  localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mario', avatar: '🦊' }] }));
  localStorage.setItem('tth.progress.v2.mia', JSON.stringify(prog));
};
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('ERR ' + e.message));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // BADGES
  await page.evaluate(() => window.__go('badges'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(root, 'shot-badges-desk.png') });
  // QUIZ
  await page.evaluate(() => window.__go('quiz-setup'));
  await page.waitForSelector('.screen[data-screen="quiz-setup"].is-active');
  await page.click('[data-select-all="quiz"]');
  await page.click('#quiz-mode .seg__btn[data-mode="type"]');
  await page.click('#quiz-length .seg__btn[data-len="25"]');
  await page.click('#quiz-start');
  await page.waitForSelector('.screen--play.is-active');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, 'shot-quiz-desk.png') });
  // ADVENTURE frame (overlays / map)
  await page.evaluate(() => window.__go('adventure'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(root, 'shot-adv-frame.png') });
  console.log('errs:', JSON.stringify(errs.slice(0, 6)));
  await browser.close(); server.close();
})();
