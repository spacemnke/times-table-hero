const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8271;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 0, coins: 0, gems: 0, worldsUnlocked: 3, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0, bestStreak: 0,
    recent: [], facts: {}, days: {}, badges: {}, secretsFound: {}, settings: { dailyGoal: 10, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(1));
  await sleep(300);

  // ---- 1. skip platforms exist, only on keypad gates, and sit fully BEFORE each gate's clamp line ----
  const plats = await page.evaluate(() => window.__adv.skipPlats);
  const gatesX = await page.evaluate(() => window.__adv.gatesX);
  console.log("✓ skip platforms:", JSON.stringify(plats.map(p => ({ gi: p.gi, x: p.x }))));
  if (!plats.length) throw new Error("expected at least one skip platform in a world run");
  for (const p of plats) {
    const gx = gatesX[p.gi];
    if (p.x + p.w >= gx - 52) throw new Error(`skip plat for gate ${p.gi} overlaps the gate clamp (must be fully before it)`);
    if (p.gi < 1) throw new Error("first gate must never be skippable");
  }
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/skip-plat.png" });

  // ---- 2. reaching a skip platform skips that gate: advance, no math, no coins/correct credit ----
  const target = plats[0];
  // advance up to (but not into) the target gate, exactly as real play does before its platform is reachable
  await page.evaluate(t => window.__adv.warp(t.x), target);
  const before = await page.evaluate(() => ({ next: window.__adv.next, correct: window.__adv.correct, coins: window.__adv.coins }));
  if (before.next !== target.gi) throw new Error("setup: hero should be at the target gate before its skip platform");
  // put the hero up at the platform's height, within its span (simulates the leap up onto it)
  await page.evaluate(t => window.__adv.placeHero(t.x + t.w / 2, t.top), target);
  await page.waitForFunction(gi => window.__adv.skipped[gi] === true, target.gi, { timeout: 3000 });
  await sleep(120);
  const after = await page.evaluate(() => ({ next: window.__adv.next, correct: window.__adv.correct, coins: window.__adv.coins, state: window.__adv.state }));
  console.log(`✓ reached SKIP! plat for gate ${target.gi} → nextGate ${before.next}→${after.next}, state=${after.state}`);
  if (after.next !== target.gi + 1) throw new Error("skipping must advance past exactly that gate");
  if (after.state !== "run") throw new Error("skip must keep running, never open the math gate");
  if (after.correct !== before.correct) throw new Error("a skip must NOT count as a correct answer");
  if (after.coins !== before.coins) throw new Error("a skip must NOT award coins (solving is the rewarded path)");

  // ---- 3. a plain keypad gate WITHOUT a skip platform still demands the math ----
  // gate 0 is always plain keypad, has no skip platform (i<1), and sits before any showdown barricade
  if (plats.some(p => p.gi === 0)) throw new Error("gate 0 must never carry a skip platform");
  await page.evaluate(() => window.__adv.start(1));
  await sleep(200);
  await page.evaluate(() => window.__adv.placeHero(window.__adv.gatesX[0] - 30, null));
  await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 3000 });
  console.log("✓ gate 0 (no skip platform) still opened the math portal");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nSKIP HOP TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ SKIP TEST FAILED:", e.message); process.exit(1); });
