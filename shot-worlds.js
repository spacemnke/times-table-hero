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
  const fp = path.join(root, p);
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'text/plain' });
    res.end(d);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const sec = await page.$('.lp-wgrid');
  if (sec) { await sec.screenshot({ path: path.join(root, 'shot-worlds.png') }); }
  else { await page.screenshot({ path: path.join(root, 'shot-worlds.png'), fullPage: false }); }
  // also grab the heading area for Safari centering check (full landing top)
  await page.screenshot({ path: path.join(root, 'shot-landing.png'), fullPage: true });
  console.log('errs:', JSON.stringify(errs.slice(0, 10)));
  await browser.close();
  server.close();
})();
