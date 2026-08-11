const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/shots-traps";
const PORT = 8215;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 300, coins: 120, gems: 14, worldsUnlocked: 6, hero: "unicorn", totalCorrect: 30, totalQ: 34, totalMs: 80000, fastCount: 15, bestStreak: 4,
    recent: [], facts: {}, days: {}, badges: {}, settings: { dailyGoal: 8, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await sleep(400); await page.screenshot({ path: OUT + "/1-map-heroes.png" }); // shows special heroes + gem line

  // Meadow trap (spiky bush)
  await page.evaluate(() => window.__adv.start(1));
  await sleep(900);
  await page.evaluate(() => window.__adv.forceTrap());
  await page.waitForFunction(() => window.__adv.state === "trapped", { timeout: 4000 });
  await sleep(300); await page.screenshot({ path: OUT + "/2-trap-bush.png" });
  // escape
  const q = await page.evaluate(() => window.__adv.q);
  for (const ch of String(q.a * q.b)) await page.click(`#adv-kpad .key[data-k="${ch}"]`);
  await page.waitForFunction(() => window.__adv.state === "run", { timeout: 4000 });

  // Volcano trap (ring of fire), world 7
  await page.evaluate(() => window.__adv.openMap());
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(7));
  await sleep(900);
  await page.evaluate(() => window.__adv.forceTrap());
  await page.waitForFunction(() => window.__adv.state === "trapped", { timeout: 4000 });
  await sleep(300); await page.screenshot({ path: OUT + "/3-trap-hoop.png" });

  // Space trap (cage), world 8 — need it unlocked; seed had 6, so bump
  await page.evaluate(() => { window.__adv.openMap(); });
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => { window.__adv.setHero("nova"); window.__adv.buildCharRow(); });
  await sleep(300); await page.screenshot({ path: OUT + "/4-map-nova.png" });

  await browser.close(); server.kill(); console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
