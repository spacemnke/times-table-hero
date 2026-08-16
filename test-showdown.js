const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8251;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 460 }, deviceScaleFactor: 2 })).newPage();
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 0, coins: 0, gems: 0, worldsUnlocked: 1, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0, bestStreak: 0,
    recent: [], facts: {}, days: {}, badges: {}, secretsFound: {}, settings: { dailyGoal: 8, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  // NOTE: no ?test=1 — we drive the showdown directly via debug hooks
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(1)); // World 1
  await sleep(300);

  const trigX = await page.evaluate(() => window.__adv.showdownX);
  console.log("✓ World 1 has a showdown barricade at X =", trigX);
  if (trigX == null) throw new Error("World 1 should carry a showdown trigger");

  await page.evaluate(() => window.__adv.enterShowdown());
  await page.waitForFunction(() => window.__adv.inShowdown === true, { timeout: 4000 });
  console.log("✓ entered Slingshot Showdown — state:", await page.evaluate(() => window.__adv.state));
  await sleep(400);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/showdown-in.png" });

  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")).totalCorrect);
  await page.evaluate(() => window.__adv.sdWin());
  await page.waitForFunction(() => window.__adv.inShowdown === false && window.__adv.state === "run", { timeout: 5000 });
  console.log("✓ cleared showdown → resumed run");

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ recorded → totalCorrect:", before, "→", p.totalCorrect, "| coins:", p.coins, "| gems:", p.gems);
  if (p.totalCorrect !== before + 1) throw new Error("showdown clear should record one correct answer");
  if (p.coins < 8) throw new Error("showdown clear should award coins");

  // ensure the barricade won't re-trigger (done flag)
  const gone = await page.evaluate(() => window.__adv.showdownX);
  console.log("✓ barricade consumed (showdownX now", gone + ")");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nSHOWDOWN TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ SHOWDOWN TEST FAILED:", e.message); process.exit(1); });
