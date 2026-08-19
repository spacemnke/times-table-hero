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
  localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mario', avatar: '🦊' }, { id: 'leo', name: 'Luna', avatar: '🐱' }] }));
  localStorage.setItem('tth.progress.v2.mia', JSON.stringify({ v: 2, xp: 210, coins: 18, gems: 2, worldsUnlocked: 3, hero: 'fox' }));
  localStorage.setItem('tth.progress.v2.leo', JSON.stringify({ v: 2, xp: 90, coins: 8, gems: 1, worldsUnlocked: 2, hero: 'unicorn' }));
};
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('ERR ' + e.message));
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  console.log('active:', await page.evaluate(() => document.querySelector('.screen.is-active')?.getAttribute('data-screen')));
  await page.screenshot({ path: path.join(root, 'shot-profiles.png') });
  // game-over overlay (DOM) — go to adventure then reveal the fail panel
  await page.evaluate(() => window.__go('adventure'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    var ov = document.getElementById('adv-failOv'); if (ov) ov.classList.remove('hidden');
    // paint 3 empty hearts like the game does
    var box = document.getElementById('adv-fail-hearts'); if (box) { box.innerHTML = '';
      var P = [[1,1],[2,1],[4,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[1,4],[2,4],[3,4],[4,4],[5,4],[2,5],[3,5],[4,5],[3,6]];
      for (var i=0;i<3;i++){ var c=document.createElement('canvas'); c.width=8;c.height=8; var g=c.getContext('2d'); g.imageSmoothingEnabled=false; g.fillStyle='#3a3f5a'; P.forEach(function(p){g.fillRect(p[0],p[1],1,1);}); box.appendChild(c); } }
  });
  await page.waitForTimeout(300);
  const ov = await page.$('#adv-failOv .adv8-panel');
  if (ov) await ov.screenshot({ path: path.join(root, 'shot-gameover.png') });
  console.log('errs:', JSON.stringify(errs.slice(0, 5)));
  await browser.close(); server.close();
})();
