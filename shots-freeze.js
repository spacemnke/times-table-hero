const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8203;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ymd(off) { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const days = {}; [0,1,2,3,4,5,6].forEach(o => { days[ymd(o)] = { q: 22, c: 20, ms: 60000 }; });
  await page.addInitScript(d => localStorage.setItem("tth.profiles.v1", d),
    JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] }));
  await page.addInitScript(d => localStorage.setItem("tth.progress.v2.mia", d),
    JSON.stringify({ v:2, xp:1180, totalCorrect:180, totalQ:200, totalMs:500000, fastCount:40, bestStreak:7,
      recent:Array.from({length:40},()=>1), facts:{}, days, badges:{first:"x",perfect:"x",speed:"x",streak7:"x"},
      settings:{ dailyGoal:20, focusTables:[1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze:true } }));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await sleep(400);
  await page.screenshot({ path: "shot-home-freeze.png" });

  // parent report → scroll to freeze toggle
  await page.click('.grownup-link');
  await page.waitForSelector('#parent-gate:not([hidden])');
  const g = (await page.textContent('#gate-q')).split("×").map(s => parseInt(s.trim(),10));
  await page.fill('#gate-input', String(g[0]*g[1]));
  await page.click('#gate-go');
  await page.waitForSelector('#parent-report:not([hidden])');
  await page.evaluate(() => document.querySelector('.toggle-row').scrollIntoView({ block: "center" }));
  await sleep(300);
  await page.screenshot({ path: "shot-freeze-toggle.png" });

  await browser.close(); server.kill();
  console.log("freeze shots done");
})().catch(e => { console.error(e); process.exit(1); });
