const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/shots-app";
const PORT = 8213;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 320, coins: 140, worldsUnlocked: 3, hero: "unicorn", totalCorrect: 40, totalQ: 44, totalMs: 90000, fastCount: 20, bestStreak: 4,
    recent: [], facts: {}, days: {}, badges: {}, settings: { dailyGoal: 10, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await sleep(300); await page.screenshot({ path: OUT + "/0-home.png" });

  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await sleep(400); await page.screenshot({ path: OUT + "/1-map.png" });

  await page.evaluate(() => window.__adv.start(1));
  await sleep(1400); await page.screenshot({ path: OUT + "/2-run.png" });

  await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 15000 }).catch(()=>{});
  await sleep(300); await page.screenshot({ path: OUT + "/3-gate.png" });

  // finish the level to show win overlay
  const total = await page.evaluate(() => window.__adv.total);
  let solved = 0;
  while (solved < total) {
    await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 15000 }).catch(()=>{});
    if (await page.evaluate(() => window.__adv.state) !== "gate") break;
    const q = await page.evaluate(() => window.__adv.q);
    for (const ch of String(q.a * q.b)) await page.click(`#adv-kpad .key[data-k="${ch}"]`);
    await page.waitForFunction((p) => window.__adv.next > p || window.__adv.state === "win", solved, { timeout: 10000 }).catch(()=>{});
    solved++;
    if (await page.evaluate(() => window.__adv.state) === "win") break;
  }
  await page.waitForSelector('#adv-winOv:not(.hidden)', { timeout: 8000 }).catch(()=>{});
  await sleep(400); await page.screenshot({ path: OUT + "/4-win.png" });

  await browser.close(); server.kill(); console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
