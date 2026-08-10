const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8201;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ymd(off) { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function progressFor(xp, goalDays) {
  const days = {}; goalDays.forEach((q,i) => { const off = goalDays.length-1-i; if(q>0) days[ymd(off)] = { q, c: Math.round(q*0.9), ms: q*2500 }; });
  return { v:2, xp, totalCorrect: 120, totalQ: 132, totalMs: 132*2500, fastCount: 30, bestStreak: 4,
    recent: Array.from({length:40},()=>1), facts: {}, days, badges: { first:"x", perfect:"x", speed:"x" },
    settings: { dailyGoal: 20, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12] } };
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [
      { id: "mia", name: "Mia", avatar: "🦄" },
      { id: "ava", name: "Ava", avatar: "🦊" },
    ]}));
  });
  await page.addInitScript((d) => { localStorage.setItem("tth.progress.v2.mia", d); },
    JSON.stringify(progressFor(1180, [22,20,25,18,24,20,15])));
  await page.addInitScript((d) => { localStorage.setItem("tth.progress.v2.ava", d); },
    JSON.stringify(progressFor(430, [0,12,0,20,0,14,8])));

  const base = `http://localhost:${PORT}/index.html`;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });

  // two profiles -> picker shown on launch
  await page.waitForSelector('.screen--profiles.is-active');
  await sleep(400);
  await page.screenshot({ path: "shot-profiles.png" });

  // create screen
  await page.click('.profiles-grid .pcard--add');
  await page.waitForSelector('.screen--profile-new.is-active');
  await page.fill('#pn-name', 'Zoe');
  await page.click('#avatar-grid .av-btn:nth-child(10)');
  await sleep(300);
  await page.screenshot({ path: "shot-profile-new.png" });

  // pick Mia -> home with player switch
  await page.click('#pn-back');
  await page.waitForSelector('.screen--profiles.is-active');
  await page.click('.profiles-grid .pcard'); // Mia
  await page.waitForSelector('.screen--home.is-active');
  await sleep(400);
  await page.screenshot({ path: "shot-home-profile.png" });

  await browser.close();
  server.kill();
  console.log("profile shots done");
})().catch(e => { console.error(e); process.exit(1); });
