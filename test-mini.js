const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8263;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MODES = ["whack", "hoop", "beat", "slash", "catch"];

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
    recent: [], facts: {}, days: {}, badges: {}, secretsFound: {}, settings: { dailyGoal: 40, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(1));
  await sleep(300);

  const modes = await page.evaluate(() => window.__adv.specialModes);
  console.log("✓ special-gate pool:", JSON.stringify(modes));

  for (const mode of MODES) {
    // enter the mini-game
    await page.evaluate(m => window.__adv.enterMini(m), mode);
    await page.waitForFunction(m => window.__adv.inMini === m, mode, { timeout: 4000 });
    const info = await page.evaluate(() => ({ vals: window.__adv.miniVals, correct: window.__adv.miniCorrect }));
    if (!info.vals || info.vals.indexOf(info.correct) < 0) throw new Error(mode + ": correct answer not among choices");
    await sleep(350);
    await page.screenshot({ path: `/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/mini-${mode}.png` });

    // WRONG choice → lose a heart, stay forgiving
    const heartsBefore = await page.evaluate(() => window.__adv.hearts);
    const wrongV = await page.evaluate(() => window.__adv.miniVals.find(v => v !== window.__adv.miniCorrect));
    await page.evaluate(v => window.__adv.miniChoose(v), wrongV);
    await page.waitForFunction(hb => window.__adv.hearts < hb, heartsBefore, { timeout: 5000 });
    const stillIn = await page.evaluate(m => window.__adv.inMini === m, mode);
    if (!stillIn) throw new Error(mode + ": a wrong answer should be forgiving (stay in the mini-game)");

    // CORRECT choice → clear the gate, back to run
    await sleep(300);
    await page.evaluate(() => window.__adv.miniChoose(window.__adv.miniCorrect));
    await page.waitForFunction(() => window.__adv.inMini === false && window.__adv.state === "run", { timeout: 6000 });
    console.log(`✓ ${mode.padEnd(6)} — wrong cost a heart (${heartsBefore}→${heartsBefore-1}), correct cleared the gate`);

    // heal + advance the hero past this gate area so the next enter is clean
    await page.evaluate(() => { window.__adv && null; });
    await page.evaluate(() => { /* refill hearts via a fresh level so we don't run out across 5 modes */ });
    // re-arm: restart the level to reset hearts to full for the next mode
    await page.evaluate(() => window.__adv.start(1));
    await sleep(200);
  }

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ persisted across all mini-games — totalQ:", p.totalQ, "| totalCorrect:", p.totalCorrect);
  if (p.totalCorrect < MODES.length) throw new Error("each mini-game clear should record a correct answer");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nALL 5 MINI-GATE MECHANICS PASSED ✅");
})().catch(e => { console.error("\n✗ MINI TEST FAILED:", e.message); process.exit(1); });
