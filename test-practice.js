const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8264;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const shown = page => page.evaluate(() => !document.getElementById("adv-winOv").classList.contains("hidden"));
async function solve(page) {
  // wait for a mini-game (or the completion overlay) to be active
  await page.waitForFunction(() => window.__adv.inLanes || window.__adv.inAst || window.__adv.inMini || !document.getElementById("adv-winOv").classList.contains("hidden"), { timeout: 9000 });
  if (await shown(page)) return false;
  const iBefore = await page.evaluate(() => window.__adv.arena ? window.__adv.arena.i : -1);
  const kind = await page.evaluate(() => window.__adv.inLanes ? "lane" : window.__adv.inAst ? "ast" : "mini");
  if (kind === "lane") { const i = await page.evaluate(() => window.__adv.laneAnswers.indexOf(window.__adv.laneCorrect)); await page.evaluate(i => window.__adv.laneSetCur(i), i); }
  else if (kind === "ast") { await page.evaluate(() => window.__adv.astShoot(window.__adv.astCorrect)); }
  else { await page.evaluate(() => window.__adv.miniChoose(window.__adv.miniCorrect)); }
  // wait until this answer advances the arena (or ends it)
  await page.waitForFunction(ib => (window.__adv.arena && window.__adv.arena.i > ib) || !document.getElementById("adv-winOv").classList.contains("hidden"), iBefore, { timeout: 9000 });
  return true;
}

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

  // ---- 1. UI path: practice → pick table → pick a game → start → lands in a mini-game ----
  await page.click('.screen--home.is-active [data-go="practice-setup"]');
  await page.waitForSelector('.screen--setup.is-active');
  await page.click('#practice-picker .num-btn:nth-child(3)'); // the 3s
  await page.click('#practice-answer .seg__btn[data-ans="whack"]');
  const ansSel = await page.$eval('#practice-answer .seg__btn.is-on', b => b.getAttribute('data-ans'));
  console.log("✓ practice answer-style selector works, chose:", ansSel);
  if (ansSel !== "whack") throw new Error("selector should reflect chosen game");
  await page.click('#practice-start');
  await page.waitForSelector('.screen--adv.is-active');
  await page.waitForFunction(() => window.__adv.inMini === "whack", { timeout: 5000 });
  console.log("✓ Start Practice launched the Whack mini-game (UI path)");

  // ---- 2. arena is FORGIVING: a wrong answer must NOT drop a heart ----
  const hearts0 = await page.evaluate(() => window.__adv.hearts);
  const wrongV = await page.evaluate(() => window.__adv.miniVals.find(v => v !== window.__adv.miniCorrect));
  await page.evaluate(v => window.__adv.miniChoose(v), wrongV);
  await sleep(300);
  const heartsAfterWrong = await page.evaluate(() => window.__adv.hearts);
  console.log("✓ wrong answer in practice kept hearts:", hearts0, "→", heartsAfterWrong, "(no fail state)");
  if (heartsAfterWrong !== hearts0) throw new Error("practice arena must not cost hearts");
  await page.click('#adv-quit'); // in a practice arena, quit routes home
  await page.waitForSelector('.screen--home.is-active');

  // ---- 3. drive a full "Surprise Me" mix arena to completion via debug hooks ----
  await page.evaluate(() => window.__adv.startArena({ tables: [4, 6], len: 6, mode: "mix" }));
  await page.waitForFunction(() => window.__adv.arena && window.__adv.arena.total === 6, { timeout: 5000 });
  const qBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")).totalQ);
  let guard = 0;
  while (await solve(page)) { guard++; if (guard > 40) throw new Error("arena did not terminate"); await sleep(120); }
  await page.waitForSelector('#adv-winOv:not(.hidden)', { timeout: 6000 });
  const title = (await page.textContent('#adv-winTitle')).trim();
  const msg = (await page.textContent('#adv-winMsg')).trim();
  const againBtn = (await page.textContent('#adv-mapBtn')).trim();
  console.log("✓ mix arena finished →", JSON.stringify(title), "|", JSON.stringify(msg), "| replay btn:", JSON.stringify(againBtn));
  if (!/PRACTICE/.test(title)) throw new Error("expected a practice-complete title");
  if (againBtn !== "AGAIN") throw new Error("MAP button should say AGAIN in a practice arena");

  const qAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")).totalQ);
  console.log("✓ practice recorded to progress — totalQ:", qBefore, "→", qAfter);
  if (qAfter < qBefore + 6) throw new Error("all 6 practice answers should be recorded");

  // ---- 4. AGAIN restarts a fresh arena ----
  await page.click('#adv-mapBtn');
  await page.waitForFunction(() => window.__adv.arena && window.__adv.arena.i === 0, { timeout: 5000 });
  console.log("✓ AGAIN restarted a fresh practice arena");

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nPRACTICE ARENA TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ PRACTICE TEST FAILED:", e.message); process.exit(1); });
