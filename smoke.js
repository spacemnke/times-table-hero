const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8199;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(800);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  const base = `http://localhost:${PORT}/index.html`;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  console.log("✓ home/dashboard loaded, title:", await page.title());

  // helper: answer a typed play question correctly via keypad
  async function answerTyped() {
    await page.waitForSelector('.screen--play.is-active #play-question');
    const q = await page.textContent('#play-question');
    const [a, b] = q.split("×").map(s => parseInt(s.trim(), 10));
    const ans = String(a * b);
    for (const ch of ans) await page.click(`.key[data-key="${ch}"]`);
    // auto-submits on correct; small wait
    await sleep(750);
    return a * b;
  }

  // DAILY CHALLENGE (typed)
  await page.click('#daily-challenge');
  await page.waitForSelector('.screen--play.is-active');
  const total = parseInt((await page.textContent('#play-counter')).split("/")[1].trim(), 10);
  console.log("✓ daily challenge started,", total, "questions, keypad visible:", !(await page.getAttribute('#keypad', 'hidden')));
  for (let i = 0; i < total; i++) await answerTyped();
  await page.waitForSelector('.screen--results.is-active', { timeout: 5000 });
  const score = await page.textContent('#results-score');
  const xp = await page.textContent('#results-xp');
  console.log("✓ daily finished — score", score.trim(), "| xp", xp.trim());
  if (!score.includes(total + " / " + total)) throw new Error("expected perfect daily, got " + score);

  // progress persisted
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2")));
  console.log("✓ saved: xp =", p.xp, "| totalCorrect =", p.totalCorrect, "| level facts tracked =", Object.keys(p.facts).length);
  if (p.totalCorrect !== total) throw new Error("totalCorrect mismatch");

  // home reflects streak + xp
  await page.click('.screen--results.is-active [data-go="home"]');
  await page.waitForSelector('.screen--home.is-active');
  const streak = await page.textContent('#streak-num');
  const xpText = await page.textContent('#xp-text');
  console.log("✓ dashboard: streak =", streak.trim(), "| xp =", xpText.trim());

  // CHOOSE-mode quiz
  await page.click('.screen--home.is-active [data-go="quiz-setup"]');
  await page.click('[data-select-all="quiz"]');
  await page.click('#quiz-mode .seg__btn[data-mode="choose"]');
  await page.click('#quiz-length .seg__btn[data-len="10"]');
  await page.click('#quiz-start');
  await page.waitForSelector('.screen--play.is-active #play-answers:not([hidden])');
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('#play-answers .answer');
    const q = await page.textContent('#play-question');
    const [a, b] = q.split("×").map(s => parseInt(s.trim(), 10));
    const ans = a * b;
    const btns = await page.$$('#play-answers .answer');
    for (const btn of btns) { if (parseInt(await btn.textContent(), 10) === ans) { await btn.click(); break; } }
    await sleep(700);
  }
  await page.waitForSelector('.screen--results.is-active');
  console.log("✓ choose-mode quiz finished:", (await page.textContent('#results-score')).trim());

  // BADGES screen
  await page.click('.screen--results.is-active [data-go="home"]');
  await page.click('.screen--home.is-active [data-go="badges"]');
  await page.waitForSelector('.screen--badges.is-active');
  const unlocked = await page.$$eval('.badge:not(.locked)', els => els.length);
  console.log("✓ badges screen: unlocked =", unlocked, "/ total", await page.$$eval('.badge', e => e.length));
  if (unlocked < 1) throw new Error("expected at least 1 badge unlocked");

  // PARENT report (gate)
  await page.click('.screen--badges.is-active [data-go="home"]');
  await page.click('.grownup-link');
  await page.waitForSelector('#parent-gate:not([hidden])');
  const gate = await page.textContent('#gate-q');
  const [ga, gb] = gate.split("×").map(s => parseInt(s.trim(), 10));
  await page.fill('#gate-input', String(ga * gb));
  await page.click('#gate-go');
  await page.waitForSelector('#parent-report:not([hidden])');
  const repAcc = await page.textContent('#rep-acc');
  const repTotal = await page.textContent('#rep-total');
  const bars = await page.$$eval('#rep-tablebars .tbar', e => e.length);
  const heat = await page.$$eval('#rep-heatmap .hm-cell', e => e.length);
  const acts = await page.$$eval('#rep-activity .act-col', e => e.length);
  console.log("✓ parent report: acc", repAcc.trim(), "| answered", repTotal.trim(), "| table bars", bars, "| heatmap cells", heat, "| activity days", acts);
  if (bars !== 12) throw new Error("expected 12 table bars");
  if (heat !== 169) throw new Error("expected 13x13=169 heatmap cells, got " + heat);
  if (acts !== 7) throw new Error("expected 7 activity days");

  // goal stepper
  await page.click('#goal-plus');
  const gv = await page.textContent('#goal-value');
  console.log("✓ daily goal adjustable, now =", gv.trim());

  // LEARN
  await page.click('.screen--parent.is-active [data-go="home"]');
  await page.click('.screen--home.is-active [data-go="learn"]');
  await page.click('#learn-picker .num-btn:nth-child(8)');
  await page.waitForSelector('#learn-table .table-row');
  const r = (await page.$$eval('#learn-table .table-row', e => e.map(x => x.textContent))).find(t => t.includes("8 × 7"));
  console.log("✓ learn 8×7 row:", r.replace(/\s+/g, " ").trim());

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nALL CHECKS PASSED ✅");
})().catch(e => { console.error("\n✗ SMOKE TEST FAILED:", e.message); process.exit(1); });
