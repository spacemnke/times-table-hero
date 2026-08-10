const { chromium } = require("playwright-core");
const { spawn } = require("child_process");

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8199;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], {
    cwd: __dirname, stdio: "ignore"
  });
  await sleep(800);

  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  const base = `http://localhost:${PORT}/index.html`;
  await page.goto(base, { waitUntil: "networkidle" });

  // Home visible
  await page.waitForSelector('.screen--home.is-active');
  console.log("✓ home loaded, title:", await page.title());

  // LEARN: pick table 7
  await page.click('[data-go="learn"]');
  await page.click('#learn-picker .num-btn:nth-child(7)');
  await page.waitForSelector('#learn-table .table-row');
  const rows = await page.$$eval('#learn-table .table-row', els => els.map(e => e.textContent));
  const seven12 = rows.find(r => r.includes("7 × 12"));
  if (!seven12 || !seven12.includes("84")) throw new Error("learn table wrong: " + seven12);
  console.log("✓ learn: 7×12 row =", seven12.replace(/\s+/g, " ").trim());
  await page.click('[data-screen="learn"] .btn-back');

  // QUIZ: select all, 5 questions, answer them (always click correct via computed answer)
  await page.click('[data-go="quiz-setup"]');
  await page.click('[data-select-all="quiz"]');
  await page.click('.chip--len[data-len="5"]');
  await page.click('#quiz-start');
  await page.waitForSelector('.screen--play[data-screen="quiz"].is-active');

  for (let q = 0; q < 5; q++) {
    await page.waitForSelector('#quiz-answers .answer');
    const qText = await page.textContent('#quiz-question');
    const [a, b] = qText.split("×").map(s => parseInt(s.trim(), 10));
    const answer = a * b;
    const buttons = await page.$$('#quiz-answers .answer');
    let clicked = false;
    for (const btn of buttons) {
      const t = await btn.textContent();
      if (parseInt(t, 10) === answer) {
        if (!(await btn.isDisabled())) { await btn.click(); clicked = true; break; }
      }
    }
    if (!clicked) throw new Error("no correct option for " + qText + " (=" + answer + ")");
    await sleep(900);
  }

  await page.waitForSelector('.screen--results.is-active', { timeout: 4000 });
  const score = await page.textContent('#results-score');
  const stars = await page.textContent('#results-stars');
  console.log("✓ quiz finished, score =", score.trim(), "stars =", stars.trim());
  if (!score.includes("5 / 5")) throw new Error("expected perfect score, got " + score);

  // Progress persisted?
  const total = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v1")).totalStars);
  console.log("✓ progress saved, totalStars =", total);
  if (total < 3) throw new Error("expected >=3 stars saved");

  // PRACTICE: setup -> flashcard reveal
  await page.click('.screen--results.is-active [data-go="home"]');
  await page.waitForSelector('.screen--home.is-active');
  await page.click('.screen--home.is-active [data-go="practice-setup"]');
  await page.click('#practice-picker .num-btn:nth-child(3)');
  await page.click('#practice-start');
  await page.waitForSelector('.screen--play[data-screen="practice"].is-active');
  await page.click('#flash-reveal');
  const fq = await page.textContent('#flash-q');
  const fa = await page.textContent('#flash-a');
  const [pa, pb] = fq.split("×").map(s => parseInt(s.trim(), 10));
  if (parseInt(fa, 10) !== pa * pb) throw new Error("flashcard wrong: " + fq + " => " + fa);
  console.log("✓ practice flashcard:", fq.trim(), "=", fa.trim());

  // Service worker registered?
  const swReg = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "no-sw-api";
    const r = await navigator.serviceWorker.getRegistration();
    return r ? "registered" : "none";
  });
  console.log("✓ service worker:", swReg);

  await browser.close();
  server.kill();

  if (errors.length) {
    console.log("\n✗ JS errors detected:");
    errors.forEach(e => console.log("   " + e));
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED ✅");
})().catch(e => { console.error("\n✗ SMOKE TEST FAILED:", e.message); process.exit(1); });
