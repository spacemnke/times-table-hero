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

  // First run → create-profile screen
  await page.waitForSelector('.screen--profile-new.is-active');
  const backHidden = await page.evaluate(() => getComputedStyle(document.querySelector('#pn-back')).visibility === 'hidden');
  console.log("✓ first run shows profile creation (back hidden:", backHidden + ")");
  await page.click('#avatar-grid .av-btn:nth-child(2)');
  await page.fill('#pn-name', 'Mia');
  await page.click('#pn-create');
  await page.waitForSelector('.screen--home.is-active');
  console.log("✓ created profile, player switch shows:", (await page.textContent('#ps-name')).trim(), (await page.textContent('#ps-av')).trim());

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

  // TYPED QUIZ, 25 questions — enough to meet the daily goal so the streak lights up
  // (the Daily Quest itself is the adventure, covered by test-adventure.js)
  await page.click('.screen--home.is-active [data-go="quiz-setup"]');
  await page.click('[data-select-all="quiz"]');
  await page.click('#quiz-mode .seg__btn[data-mode="type"]');
  await page.click('#quiz-length .seg__btn[data-len="25"]');
  await page.click('#quiz-start');
  await page.waitForSelector('.screen--play.is-active');
  const total = parseInt((await page.textContent('#play-counter')).split("/")[1].trim(), 10);
  console.log("✓ typed quiz started,", total, "questions");
  for (let i = 0; i < total; i++) await answerTyped();
  await page.waitForSelector('.screen--results.is-active', { timeout: 5000 });
  const score = await page.textContent('#results-score');
  const xp = await page.textContent('#results-xp');
  console.log("✓ quiz finished — score", score.trim(), "| xp", xp.trim());
  if (!score.includes(total + " / " + total)) throw new Error("expected perfect quiz, got " + score);

  // progress persisted
  const readActive = () => page.evaluate(() => {
    const reg = JSON.parse(localStorage.getItem("tth.profiles.v1"));
    return JSON.parse(localStorage.getItem("tth.progress.v2." + reg.activeId));
  });
  const p = await readActive();
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

  // PRACTICE (now typed, no timer)
  await page.click('.screen--results.is-active [data-go="home"]');
  await page.click('.screen--home.is-active [data-go="practice-setup"]');
  await page.click('#practice-picker .num-btn:nth-child(3)'); // the 3s
  await page.click('#practice-start');
  await page.waitForSelector('.screen--play.is-active');
  const practiceKeypad = !(await page.getAttribute('#keypad', 'hidden'));
  const practiceTimerHidden = (await page.getAttribute('#timerbar', 'hidden')) !== null;
  const pcount = parseInt((await page.textContent('#play-counter')).split("/")[1].trim(), 10);
  console.log("✓ practice started — typed keypad:", practiceKeypad, "| timer hidden:", practiceTimerHidden, "| questions:", pcount);
  if (!practiceKeypad) throw new Error("practice should use the typed keypad");
  if (!practiceTimerHidden) throw new Error("practice should have no timer");
  if (pcount !== 12) throw new Error("practice on the 3s should be 12 questions, got " + pcount);
  // answer all by typing (all should be 3 × n)
  for (let i = 0; i < pcount; i++) {
    const q = await page.textContent('#play-question');
    const [a, b] = q.split("×").map(s => parseInt(s.trim(), 10));
    if (a !== 3) throw new Error("practice on the 3s served " + q);
    for (const ch of String(a * b)) await page.click(`.key[data-key="${ch}"]`);
    await sleep(650);
  }
  await page.waitForSelector('.screen--results.is-active');
  console.log("✓ practice finished (typed):", (await page.textContent('#results-title')).trim());

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

  // focus tables: set Hard 6–12, verify Daily Challenge respects it
  await page.click('#focus-hard');
  const onCount = await page.$$eval('#focus-picker .mini-btn.is-on', e => e.length);
  console.log("✓ focus picker set to Hard 6–12, tables lit =", onCount);
  if (onCount !== 7) throw new Error("expected 7 focus tables, got " + onCount);
  const savedFocus = (await readActive()).settings.focusTables;
  if (savedFocus.join() !== "6,7,8,9,10,11,12") throw new Error("focus not saved: " + savedFocus);
  await page.click('.screen--parent.is-active [data-go="home"]');
  const ctaSub = await page.textContent('#cta-sub');
  console.log("✓ home CTA reflects focus:", ctaSub.trim());
  // Daily Quest is the adventure — check its questions all come from the focused tables
  await page.click('#daily-challenge');
  await page.waitForSelector('.screen--adv.is-active');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.evaluate(() => window.__adv.start(1));   // enter Meadow
  // arrive at the first gate to expose a question, then inspect (all left operands must be ≥6)
  const okFocus = await page.evaluate(() => {
    return new Promise(resolve => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.__adv.state === "gate" && window.__adv.q) { clearInterval(iv); resolve(window.__adv.q.a >= 6); }
        else if (Date.now() - start > 8000) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  });
  console.log("✓ adventure first gate left-operand ≥6:", okFocus);
  if (okFocus !== true) throw new Error("adventure served a table below 6 despite focus");
  await page.click('#adv-quit');                       // back to map
  await page.waitForSelector('#adv-mapOv:not(.hidden)');
  await page.click('#adv-map-close');                  // map → home

  // LEARN (we're back on home after quitting the quest)
  await page.waitForSelector('.screen--home.is-active');
  await page.click('.screen--home.is-active [data-go="learn"]');
  await page.click('#learn-picker .num-btn:nth-child(8)');
  await page.waitForSelector('#learn-table .table-row');
  const r = (await page.$$eval('#learn-table .table-row', e => e.map(x => x.textContent))).find(t => t.includes("8 × 7"));
  console.log("✓ learn 8×7 row:", r.replace(/\s+/g, " ").trim());

  // PROFILES: add a second player, verify isolation
  await page.click('.screen--learn.is-active [data-go="home"]');
  const miaXp = (await readActive()).xp;
  await page.click('#player-switch');
  await page.waitForSelector('.screen--profiles.is-active');
  const cards1 = await page.$$eval('.profiles-grid .pcard:not(.pcard--add)', e => e.length);
  console.log("✓ profile picker shows", cards1, "player(s) + add");
  await page.click('.profiles-grid .pcard--add');
  await page.waitForSelector('.screen--profile-new.is-active');
  await page.click('#avatar-grid .av-btn:nth-child(5)');
  await page.fill('#pn-name', 'Ava');
  await page.click('#pn-create');
  await page.waitForSelector('.screen--home.is-active');
  const avaName = (await page.textContent('#ps-name')).trim();
  const avaXp = (await readActive()).xp;
  console.log("✓ second player active:", avaName, "| her XP:", avaXp, "(fresh, was Mia's", miaXp + ")");
  if (avaName !== "Ava") throw new Error("expected Ava active");
  if (avaXp !== 0) throw new Error("new profile should start at 0 XP, got " + avaXp);

  // switch back to Mia — her progress intact
  await page.click('#player-switch');
  await page.waitForSelector('.screen--profiles.is-active');
  const names = await page.$$eval('.profiles-grid .pcard__name', e => e.map(x => x.textContent));
  console.log("✓ both players listed:", names.filter(n => n !== "Add player").join(", "));
  await page.click('.profiles-grid .pcard'); // first card = Mia
  await page.waitForSelector('.screen--home.is-active');
  const backXp = (await readActive()).xp;
  console.log("✓ switched back to", (await page.textContent('#ps-name')).trim(), "— XP restored:", backXp);
  if (backXp !== miaXp) throw new Error("Mia's XP not restored: " + backXp + " vs " + miaXp);

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nALL CHECKS PASSED ✅");
})().catch(e => { console.error("\n✗ SMOKE TEST FAILED:", e.message); process.exit(1); });
