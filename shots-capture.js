const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/cap";
const PORT = 8217;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 })).newPage();
  page.on("pageerror", e => console.log("PAGEERROR:", e.message));

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 0, coins: 0, gems: 30, worldsUnlocked: 8, hero: "unicorn", settings: { dailyGoal: 10, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.click('#daily-challenge');
  await page.waitForSelector('#adv-mapOv:not(.hidden)');

  // world -> label; 6 = jungle = giant
  for (const [n, name] of [[6, "giant"], [1, "bush"], [2, "plant"], [8, "cage"]]) {
    await page.evaluate((n) => window.__adv.start(n), n);
    await sleep(200);
    await page.evaluate(() => window.__adv.forceTrap());
    await page.waitForFunction(() => window.__adv.state === "trapped", { timeout: 4000 });
    await sleep(430); // let the capture animate to a dramatic frame
    await page.screenshot({ path: `${OUT}/cap-${name}.png` });
    await page.evaluate(() => window.__adv.openMap());
    await page.waitForSelector('#adv-mapOv:not(.hidden)');
  }
  await browser.close(); server.kill(); console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
