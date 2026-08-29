const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8214;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function answer(page, correct) {
  const q = await page.evaluate(() => window.__adv.q);
  let val = String(q.a * q.b);
  if (!correct) { val = String((q.a * q.b) + 1); } // a wrong answer
  for (const ch of val) await page.click(`#adv-kpad .key[data-k="${ch}"]`);
  if (!correct) await page.click(`#adv-kpad .key[data-k="enter"]`); // correct auto-submits; wrong needs Enter
}

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
    v: 2, xp: 0, coins: 0, gems: 30, worldsUnlocked: 3, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0, bestStreak: 0,
    recent: [], facts: {}, days: {}, badges: {}, settings: { dailyGoal: 8, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.evaluate(() => window.__go("adventure"));
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  console.log("✓ map opened, gems =", await page.evaluate(() => window.__adv.gems));

  // pick special hero BOLT (robot) → +1 heart
  await page.evaluate(() => { window.__adv.setHero("robo"); window.__adv.buildCharRow(); });
  await page.evaluate(() => window.__adv.start(1));
  const mh = await page.evaluate(() => window.__adv.maxHearts);
  console.log("✓ BOLT hero → maxHearts:", mh);
  if (mh !== 4) throw new Error("BOLT should grant +1 heart (expected 4, got " + mh + ")");

  // --- trap escape: correct answer frees you, no life lost ---
  await page.evaluate(() => window.__adv.forceTrap());
  await page.waitForFunction(() => window.__adv.state === "trapped", { timeout: 4000 });
  const h0 = await page.evaluate(() => window.__adv.hearts);
  console.log("✓ trapped! hearts =", h0);
  await answer(page, true);
  await page.waitForFunction(() => window.__adv.state === "run", { timeout: 4000 });
  const h1 = await page.evaluate(() => window.__adv.hearts);
  console.log("✓ correct escape → back to run, hearts =", h1);
  if (h1 !== h0) throw new Error("correct escape should not cost a heart");

  // --- trap escape: wrong answer costs a life AND restarts the level ---
  // advance a couple of gates first so restart is observable
  await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 15000 }).catch(() => {});
  if (await page.evaluate(() => window.__adv.state) === "gate") { await answer(page, true); await page.waitForFunction(() => window.__adv.state === "run", { timeout: 5000 }); }
  const nextBefore = await page.evaluate(() => window.__adv.next);
  await page.evaluate(() => window.__adv.forceTrap());
  await page.waitForFunction(() => window.__adv.state === "trapped", { timeout: 4000 });
  const hBefore = await page.evaluate(() => window.__adv.hearts);
  await answer(page, false);
  await page.waitForFunction((n) => window.__adv.state === "run" && window.__adv.next === 0, nextBefore, { timeout: 4000 });
  const hAfter = await page.evaluate(() => window.__adv.hearts);
  console.log("✓ wrong escape → hearts", hBefore, "→", hAfter, "| level restarted (gate index back to 0, was", nextBefore + ")");
  if (hAfter !== hBefore - 1) throw new Error("wrong escape should cost exactly one heart");

  // bonus questions were recorded (they count as practice)
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ bonus questions recorded → totalQ:", p.totalQ);
  if (p.totalQ < 2) throw new Error("escape questions should be recorded");

  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/trap.png" });
  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nTRAP + SPECIAL HERO TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ TRAP TEST FAILED:", e.message); process.exit(1); });
