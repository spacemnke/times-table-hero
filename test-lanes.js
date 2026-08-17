const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8261;
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
  await page.evaluate(() => window.__adv.start(1)); // World 1
  await sleep(300);

  // ---- 1. enter Lane Runner directly ----
  await page.evaluate(() => window.__adv.enterLanes());
  await page.waitForFunction(() => window.__adv.inLanes === true, { timeout: 4000 });
  const info = await page.evaluate(() => ({ answers: window.__adv.laneAnswers, correct: window.__adv.laneCorrect, cur: window.__adv.laneCur }));
  console.log("✓ entered Lane Runner — doors:", JSON.stringify(info.answers), "| correct:", info.correct);
  if (!info.answers || info.answers.length !== 3) throw new Error("lane should have 3 doors");
  if (info.answers.indexOf(info.correct) < 0) throw new Error("the correct answer must be one of the doors");
  await sleep(400);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/lanes-in.png" });

  // ---- 1b. tap DIRECTION: tapping high moves the hero to the TOP lane; tapping low → BOTTOM lane ----
  const box = await page.evaluate(() => { const r = document.getElementById("adv-c").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const startLane = await page.evaluate(() => window.__adv.laneCur);
  // tap near the top of the play area → hero should move UP to lane 0
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.30);
  await page.waitForFunction(() => window.__adv.laneCur === 0, { timeout: 2500 }).catch(() => {});
  const afterTopTap = await page.evaluate(() => window.__adv.laneCur);
  console.log("✓ started in lane", startLane, "— tapping high →", afterTopTap === 0 ? "moved to TOP lane (0)" : "lane " + afterTopTap);
  if (afterTopTap !== 0) throw new Error("tapping high should move the hero UP to lane 0, got " + afterTopTap);
  // tap near the bottom → hero should move DOWN to lane 2
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.86);
  await page.waitForFunction(() => window.__adv.laneCur === 2, { timeout: 2500 }).catch(() => {});
  const afterBotTap = await page.evaluate(() => window.__adv.laneCur);
  console.log("✓ tapping low →", afterBotTap === 2 ? "moved to BOTTOM lane (2)" : "lane " + afterBotTap);
  if (afterBotTap !== 2) throw new Error("tapping low should move the hero DOWN to lane 2, got " + afterBotTap);

  // ---- 2. WRONG lane first → should lose a heart and retry (forgiving) ----
  const heartsBefore = await page.evaluate(() => window.__adv.hearts);
  const wrongIdx = await page.evaluate(() => window.__adv.laneAnswers.findIndex((v, i) => v !== window.__adv.laneCorrect));
  await page.evaluate(i => window.__adv.laneSetCur(i), wrongIdx);
  await page.waitForFunction(() => window.__adv.hearts < window.__adv.maxHearts || window.__adv.inLanes === false, { timeout: 9000 });
  const afterWrong = await page.evaluate(() => ({ hearts: window.__adv.hearts, inLanes: window.__adv.inLanes }));
  console.log("✓ wrong lane cost a heart:", heartsBefore, "→", afterWrong.hearts, "| still in lanes:", afterWrong.inLanes);
  if (afterWrong.hearts >= heartsBefore) throw new Error("a wrong lane should cost one heart");
  if (!afterWrong.inLanes) throw new Error("a wrong answer should be forgiving — stay in lanes to retry");

  // ---- 3. wait for the retry to reset, then pick the CORRECT lane → pass back to run ----
  await page.waitForFunction(() => window.__adv.laneCur != null, { timeout: 4000 });
  await sleep(1200); // let the retry phase reset the wall
  const corIdx = await page.evaluate(() => window.__adv.laneAnswers.indexOf(window.__adv.laneCorrect));
  await page.evaluate(i => window.__adv.laneSetCur(i), corIdx);
  await page.waitForFunction(() => window.__adv.inLanes === false && window.__adv.state === "run", { timeout: 11000 });
  console.log("✓ correct lane cleared the gate → resumed run, state:", await page.evaluate(() => window.__adv.state));

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ persisted — totalQ:", p.totalQ, "| totalCorrect:", p.totalCorrect, "| coins:", p.coins);
  if (p.totalCorrect < 1) throw new Error("clearing a lane gate should record a correct answer");
  if (p.totalQ < 2) throw new Error("should have recorded the wrong attempt and the correct one");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nLANE RUNNER TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ LANE TEST FAILED:", e.message); process.exit(1); });
