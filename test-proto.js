const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DIR = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad";
const PORT = 8210;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: DIR, stdio: "ignore" });
  await sleep(700);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.goto(`http://localhost:${PORT}/quest-proto.html?test=1`, { waitUntil: "networkidle" });
  await page.waitForSelector('#startOv:not(.hidden)');
  console.log("✓ prototype loaded (test/invincible mode)");
  await page.click('#startBtn');

  const total = await page.evaluate(() => window.__proto.total);
  console.log("✓ started — gates:", total);
  let solved = 0;
  const deadline = Date.now() + 90000;
  while (solved < total && Date.now() < deadline) {
    await page.waitForFunction(() => window.__proto.state === "gate", { timeout: 20000 }).catch(() => {});
    if (await page.evaluate(() => window.__proto.state) !== "gate") break;
    const q = await page.evaluate(() => window.__proto.q);
    for (const ch of String(q.a * q.b)) await page.click(`.key[data-k="${ch}"]`);
    await page.waitForFunction((p) => window.__proto.gate > p || window.__proto.state === "win", solved, { timeout: 10000 });
    solved++;
    const st = await page.evaluate(() => ({ c: window.__proto.coins, h: window.__proto.hearts, s: window.__proto.state }));
    console.log(`  gate ${solved} cleared → ${q.a}×${q.b} | coins ${st.c} | hearts ${st.h}`);
    if (st.s === "win") break;
  }
  await page.waitForSelector('#winOv:not(.hidden)', { timeout: 12000 });
  console.log("✓ level complete:", (await page.textContent('#winStars')).trim(), "|", (await page.textContent('#winMsg')).trim());

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nPROTOTYPE PLAYS CLEAN ✅");
})().catch(e => { console.error("\n✗ PROTO TEST FAILED:", e.message); process.exit(1); });
