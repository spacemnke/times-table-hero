const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain' }); res.end(d); });
});
const SEED_IN = () => {
  localStorage.setItem('tth.session.v1', JSON.stringify({ access_token: 'a', refresh_token: 'r', email: 'mario@home.com', uid: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mario', avatar: '🦊' }] }));
  localStorage.setItem('tth.progress.v2.mia', JSON.stringify({ v: 2, xp: 210, coins: 18, gems: 2, worldsUnlocked: 3, hero: 'fox' }));
};
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [tag, seed] of [['out', null], ['in', SEED_IN]]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 900, height: 820 }, deviceScaleFactor: 2 });
    if (seed) await ctx.addInitScript(seed);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push('ERR ' + e.message));
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const active = await page.evaluate(() => document.querySelector('.screen.is-active')?.getAttribute('data-screen'));
    const hero = await page.$('.lp-hero');
    if (hero) await hero.screenshot({ path: path.join(root, 'shot-landing-' + tag + '.png') });
    else await page.screenshot({ path: path.join(root, 'shot-landing-' + tag + '.png') });
    console.log(tag, 'active:', active, 'errs:', JSON.stringify(errs.slice(0, 4)));
    await ctx.close();
  }
  await browser.close(); server.close();
})();
