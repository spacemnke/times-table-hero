const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/diag";
const PORT = 8216;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seed = () => { localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })); localStorage.setItem("tth.progress.v2.mia", JSON.stringify({ v: 2, xp: 0, coins: 0, gems: 0, worldsUnlocked: 8, settings: { dailyGoal: 12, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })); };

async function open(page, url) { await page.addInitScript(seed); await page.goto(url, { waitUntil: "networkidle" }); await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector('.screen--home.is-active'); await page.click('#daily-challenge'); await page.waitForSelector('#adv-mapOv:not(.hidden)'); }

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

  // --- clean in-world trap screenshots per world (test mode; warp skips gates) ---
  const page = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();
  page.on("pageerror", e => console.log("PAGEERROR:", e.message));
  await open(page, `http://localhost:${PORT}/index.html?test=1`);
  for (const [n, name] of [[1, "meadow-bush"], [5, "snow-ice"], [8, "space-cage"]]) {
    await page.evaluate((n) => window.__adv.start(n), n);
    await sleep(150);
    const tx = await page.evaluate(() => window.__adv.trapsX);
    console.log(name, "traps at:", tx);
    await page.evaluate((x) => window.__adv.warp(x - 150), tx[0]);
    await sleep(250);
    await page.screenshot({ path: `${OUT}/trap-${name}.png` });
    await page.evaluate(() => window.__adv.openMap());
    await page.waitForSelector('#adv-mapOv:not(.hidden)');
  }

  // --- organic collision (NON-test): run into a trap, expect 'trapped' ---
  const page2 = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();
  await open(page2, `http://localhost:${PORT}/index.html`);
  await page2.evaluate(() => window.__adv.start(1));
  await sleep(120);
  const tx0 = await page2.evaluate(() => window.__adv.trapsX);
  await page2.evaluate((x) => window.__adv.warp(x - 140), tx0[0]);   // park just before the trap on the ground
  const sprung = await page2.waitForFunction(() => window.__adv.state === "trapped", { timeout: 6000 }).then(() => true).catch(() => false);
  console.log("organic collision → trapped:", sprung, "| state:", await page2.evaluate(() => window.__adv.state));

  await browser.close(); server.kill(); console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
