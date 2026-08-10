const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Build a realistic-looking history so the parent report has content.
function seed() {
  function ymd(off) { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
  const facts = {};
  const strong = 0.95, weakOnes = { "7×8": 0.4, "6×8": 0.5, "12×7": 0.45, "8×9": 0.6, "7×6": 0.55, "11×12": 0.5 };
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) {
    const key = a + "×" + b; const n = 3 + ((a*b) % 4);
    const acc = weakOnes[key] != null ? weakOnes[key] : strong - ((a>=7&&b>=7)?0.1:0);
    facts[key] = { n, c: Math.round(n*acc), ms: n*2600 };
  }
  const days = {};
  const qs = [22, 20, 0, 25, 18, 24, 12]; // last 7 days (today last)
  qs.forEach((q, i) => { const off = 6 - i; if (q>0) days[ymd(off)] = { q, c: Math.round(q*0.9), ms: q*2600 }; });
  let totalQ = 0, totalCorrect = 0, totalMs = 0;
  Object.values(facts).forEach(f => { totalQ += f.n; totalCorrect += f.c; totalMs += f.ms; });
  const recent = []; for (let i=0;i<60;i++) recent.push(Math.random()<0.9?1:0);
  return { v:2, xp: 940, totalCorrect, totalQ, totalMs, fastCount: 40, bestStreak: 5,
    recent, facts, days, badges: { first:"x", perfect:"x", speed:"x", streak3:"x", century:"x", explorer:"x" },
    settings: { dailyGoal: 20 } };
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const data = JSON.stringify(seed());
  await page.addInitScript(d => { localStorage.setItem("tth.progress.v2", d); }, data);
  const base = `http://localhost:${PORT}/index.html`;

  await page.goto(base, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" }); // ensure seed applied before init
  await page.waitForSelector('.screen--home.is-active');
  await sleep(400);
  await page.screenshot({ path: "shot-home.png" });

  // daily challenge -> keypad, type part of an answer
  await page.click('#daily-challenge');
  await page.waitForSelector('.screen--play.is-active');
  await page.click('.key[data-key="5"]');
  await sleep(300);
  await page.screenshot({ path: "shot-play.png" });
  await page.click('#play-quit');

  // badges
  await page.click('.screen--home.is-active [data-go="badges"]');
  await page.waitForSelector('.screen--badges.is-active');
  await sleep(300);
  await page.screenshot({ path: "shot-badges.png" });

  // parent report
  await page.click('.screen--badges.is-active [data-go="home"]');
  await page.click('.grownup-link');
  await page.waitForSelector('#parent-gate:not([hidden])');
  const gate = await page.textContent('#gate-q');
  const [ga, gb] = gate.split("×").map(s => parseInt(s.trim(), 10));
  await page.fill('#gate-input', String(ga * gb));
  await page.click('#gate-go');
  await page.waitForSelector('#parent-report:not([hidden])');
  await sleep(400);
  await page.screenshot({ path: "shot-parent-top.png" });
  await page.evaluate(() => document.querySelector('#rep-heatmap').scrollIntoView({ block: "center" }));
  await sleep(300);
  await page.screenshot({ path: "shot-parent-heat.png" });
  await page.click('#focus-hard');
  await page.evaluate(() => document.querySelector('.focus-block').scrollIntoView({ block: "center" }));
  await sleep(300);
  await page.screenshot({ path: "shot-parent-settings.png" });

  await browser.close();
  server.kill();
  console.log("shots done");
})().catch(e => { console.error(e); process.exit(1); });
