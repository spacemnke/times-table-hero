const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/wide";
const PORT = 8218;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seed = () => { localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })); localStorage.setItem("tth.progress.v2.mia", JSON.stringify({ v:2, xp:0, coins:0, gems:0, worldsUnlocked:1, settings:{ dailyGoal:12, focusTables:[1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze:true } })); };
(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  for (const [w,h,name] of [[1280,720,"desktop"],[844,390,"landscape"],[390,844,"portrait"]]) {
    const page = await (await browser.newContext({ viewport: { width:w, height:h }, deviceScaleFactor:1 })).newPage();
    await page.addInitScript(seed);
    await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('.screen--home.is-active');
    await page.click('#daily-challenge');
    await page.waitForSelector('#adv-mapOv:not(.hidden)');
    await page.evaluate(() => window.__adv.start(1));
    await sleep(1200);
    // report canvas CSS size vs viewport
    const dims = await page.evaluate(() => { const c=document.getElementById('adv-c'); const r=c.getBoundingClientRect(); return { cw:Math.round(r.width), ch:Math.round(r.height), vw:window.innerWidth, vh:window.innerHeight, bw:c.width, bh:c.height }; });
    console.log(name, JSON.stringify(dims));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.close();
  }
  await browser.close(); server.kill(); console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
