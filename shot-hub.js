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
  localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mario', avatar: '🦊' }] }));
  localStorage.setItem('tth.progress.v2.mia', JSON.stringify({ v: 2, xp: 210, coins: 18, gems: 2, worldsUnlocked: 3, hero: 'fox' }));
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
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(root, 'shot-hub-' + tag + '.png'), fullPage: true });
    console.log(tag, 'errs:', JSON.stringify(errs.slice(0, 6)));
    await ctx.close();
  }
  await browser.close(); server.close();
})();
