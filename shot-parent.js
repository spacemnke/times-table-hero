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
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var facts = {};
  for (var a = 2; a <= 12; a++) for (var b = 1; b <= 12; b++) { var n = 2 + Math.floor(Math.random() * 8); var miss = Math.floor(Math.random() * (a > 8 ? 4 : 2)); var c = Math.max(0, n - miss); facts[a + '×' + b] = { n: n, c: c, ms: c * 1100 + (n - c) * 3200 }; }
  var days = {};
  for (var o = 0; o < 14; o++) { var d = new Date(); d.setDate(d.getDate() - o); var q = (o % 5 === 3) ? 6 : (12 + Math.floor(Math.random() * 16)); days[ymd(d)] = { q: q, c: Math.round(q * 0.86) }; }
  var prog = { v: 2, xp: 640, coins: 52, gems: 6, worldsUnlocked: 4, hero: 'fox', totalCorrect: 214, totalQ: 250, totalMs: 250 * 1800, fastCount: 44, bestStreak: 9, recent: [], facts: facts, days: days, badges: {}, secretsFound: {}, settings: { dailyGoal: 20, focusTables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], streakFreeze: true } };
  localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mario', avatar: '🦊' }] }));
  localStorage.setItem('tth.progress.v2.mia', JSON.stringify(prog));
};
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [w, tag] of [[400, 'phone'], [1180, 'desk']]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(SEED);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push('ERR ' + e.message));
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__go('parent'));
    await page.waitForTimeout(400);
    // bypass gate (webdriver + no auth session unlocks with any input)
    await page.evaluate(() => { var g = document.getElementById('gate-go'); if (g) g.click(); });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(root, 'shot-parent-' + tag + '.png'), fullPage: true });
    console.log(tag, 'errs:', JSON.stringify(errs.slice(0, 6)), 'reportShown:', await page.evaluate(() => { var r = document.getElementById('parent-report'); return r && !r.hidden; }));
    await ctx.close();
  }
  await browser.close(); server.close();
})();
