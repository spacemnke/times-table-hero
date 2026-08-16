const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8262;
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
    recent: [], facts: {}, days: {}, badges: {}, secretsFound: {}, settings: { dailyGoal: 8, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(1));
  await sleep(300);

  await page.evaluate(() => window.__adv.enterAst());
  await page.waitForFunction(() => window.__adv.inAst === true, { timeout: 4000 });
  const info = await page.evaluate(() => ({ rocks: window.__adv.astRocks, correct: window.__adv.astCorrect }));
  console.log("✓ entered Asteroid Blaster — rocks:", JSON.stringify(info.rocks.map(r => r.v)), "| correct:", info.correct);
  if (!info.rocks || info.rocks.length !== 3) throw new Error("expected 3 asteroids");
  if (info.rocks.findIndex(r => r.v === info.correct) < 0) throw new Error("correct answer must be one of the asteroids");
  await sleep(500);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/ast-in.png" });

  // shoot a WRONG asteroid → lose a heart, stay in
  const heartsBefore = await page.evaluate(() => window.__adv.hearts);
  const wrongV = await page.evaluate(() => window.__adv.astRocks.find(r => r.v !== window.__adv.astCorrect).v);
  await page.evaluate(v => window.__adv.astShoot(v), wrongV);
  await page.waitForFunction(() => window.__adv.hearts < window.__adv.maxHearts, { timeout: 5000 });
  const afterWrong = await page.evaluate(() => ({ hearts: window.__adv.hearts, inAst: window.__adv.inAst }));
  console.log("✓ wrong shot cost a heart:", heartsBefore, "→", afterWrong.hearts, "| still in:", afterWrong.inAst);
  if (afterWrong.hearts >= heartsBefore) throw new Error("wrong shot should cost a heart");
  if (!afterWrong.inAst) throw new Error("wrong shot should be forgiving");

  // shoot the CORRECT asteroid → pass to run
  await sleep(400);
  await page.evaluate(() => window.__adv.astShoot(window.__adv.astCorrect));
  await page.waitForFunction(() => window.__adv.inAst === false && window.__adv.state === "run", { timeout: 6000 });
  console.log("✓ correct shot cleared the gate → resumed run");

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ persisted — totalQ:", p.totalQ, "| totalCorrect:", p.totalCorrect, "| coins:", p.coins);
  if (p.totalCorrect < 1) throw new Error("clearing should record a correct answer");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nASTEROID BLASTER TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ AST TEST FAILED:", e.message); process.exit(1); });
