const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8212;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 0, coins: 0, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0, bestStreak: 0,
    recent: [], facts: {}, days: {}, badges: {}, settings: { dailyGoal: 10, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  // ?test=1 → invincible auto-runner reaches every gate without dying
  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  console.log("✓ loaded as Mia");

  await page.evaluate(() => window.__go("adventure"));
  await page.waitForSelector('.screen--adv.is-active');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  console.log("✓ Quest Land map opened");

  await page.evaluate(() => window.__adv.start(1));   // pick Meadow
  const total = await page.evaluate(() => window.__adv.total);
  console.log("✓ level started — gates:", total);

  let solved = 0;
  const deadline = Date.now() + 90000;
  while (solved < total && Date.now() < deadline) {
    await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 15000 }).catch(() => {});
    if (await page.evaluate(() => window.__adv.state) !== "gate") break;
    const q = await page.evaluate(() => window.__adv.q);
    for (const ch of String(q.a * q.b)) await page.click(`#adv-kpad .key[data-k="${ch}"]`);
    await page.waitForFunction((p) => window.__adv.next > p || window.__adv.state === "win", solved, { timeout: 10000 });
    solved++;
    if (await page.evaluate(() => window.__adv.state) === "win") break;
  }
  await page.waitForSelector('#adv-winOv:not(.hidden)', { timeout: 10000 });
  console.log("✓ reached castle:", (await page.textContent('#adv-winTitle')).trim(), "|", (await page.textContent('#adv-winMsg')).trim());

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ engine fed → xp:", p.xp, "| coins:", p.coins, "| totalCorrect:", p.totalCorrect, "| facts:", Object.keys(p.facts).length, "| worldsUnlocked:", p.worldsUnlocked, "| todayQ:", (Object.values(p.days)[0] || {}).q);
  if (p.xp <= 0) throw new Error("no XP recorded");
  if (p.coins <= 0) throw new Error("no coins recorded");
  if (p.totalCorrect < total) throw new Error("expected >= " + total + " correct, got " + p.totalCorrect);
  if (p.worldsUnlocked < 2) throw new Error("beating level 1 should unlock level 2");

  await page.click('#adv-homeBtn');
  await page.waitForSelector('.screen--home.is-active');
  console.log("✓ home — streak:", (await page.textContent('#streak-num')).trim());

  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/adv-ingame.png" });

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nADVENTURE INTEGRATION PASSED ✅");
})().catch(e => { console.error("\n✗ ADVENTURE TEST FAILED:", e.message); process.exit(1); });
