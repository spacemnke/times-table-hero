const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain' });
    res.end(d);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const heroes = ['unicorn','cat','fox','robo','comet','nova','draco','orbit','shelly','finn','mango'];
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(11,1fr);gap:8px;padding:16px;background:#2f2560;';
    heroes.forEach(h => {
      ['front','side'].forEach(view => {
        const cell = document.createElement('div');
        cell.style.cssText = 'text-align:center;';
        const c = document.createElement('canvas');
        c.width = 80; c.height = 60;
        c.style.cssText = 'width:80px;height:60px;image-rendering:pixelated;background:#1c1540;display:block;';
        cell.appendChild(c);
        const lbl = document.createElement('div');
        lbl.textContent = h + ' ' + view;
        lbl.style.cssText = 'color:#fff;font:10px monospace;margin-top:2px;';
        cell.appendChild(lbl);
        wrap.appendChild(cell);
        window.__adv.drawHero(c, h, view === 'front');
      });
    });
    document.body.appendChild(wrap);
    document.body.style.background = '#2f2560';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, 'shot-allheroes.png'), fullPage: true });
  console.log('errs:', JSON.stringify(errs.slice(0, 8)));
  await browser.close();
  server.close();
})();
