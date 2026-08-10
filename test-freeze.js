const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8202;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ymd(off) { const d = new Date(); d.setDate(d.getDate() - off); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function daysFrom(metOffsets) { const days = {}; metOffsets.forEach(o => { days[ymd(o)] = { q: 25, c: 24, ms: 60000 }; }); return days; }
function seed(metOffsets, freezeOn) {
  return {
    profiles: JSON.stringify({ activeId: "t", profiles: [{ id: "t", name: "Test", avatar: "⭐️" }] }),
    progress: JSON.stringify({ v:2, xp:100, totalCorrect:50, totalQ:52, totalMs:130000, fastCount:10,
      bestStreak:0, recent:[], facts:{}, days: daysFrom(metOffsets), badges:{},
      settings: { dailyGoal: 20, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: freezeOn } }),
  };
}

const CASES = [
  { name: "isolated miss, freeze ON  → bridged", met: [2,3,4], freeze: true,  streak: "3", badge: false },
  { name: "isolated miss, freeze OFF → breaks",  met: [2,3,4], freeze: false, streak: "0", badge: false },
  { name: "clean 5 incl today, freeze ready",    met: [0,1,2,3,4], freeze: true, streak: "5", badge: true },
  { name: "two misses in a row → breaks",        met: [3,4], freeze: true,     streak: "0", badge: false },
];

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  let failed = 0;
  for (const c of CASES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const s = seed(c.met, c.freeze);
    await page.addInitScript(d => { localStorage.setItem("tth.profiles.v1", d); }, s.profiles);
    await page.addInitScript(d => { localStorage.setItem("tth.progress.v2.t", d); }, s.progress);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('.screen--home.is-active');
    const streak = (await page.textContent('#streak-num')).trim();
    const badge = await page.evaluate(() => !document.querySelector('#streak-freeze').hidden);
    const ok = streak === c.streak && badge === c.badge;
    console.log((ok ? "✓" : "✗") + " " + c.name + " → streak=" + streak + " badge=" + badge +
      (ok ? "" : "  (expected streak=" + c.streak + " badge=" + c.badge + ")"));
    if (!ok) failed++;
    await ctx.close();
  }
  await browser.close();
  server.kill();
  if (failed) { console.log("\n✗ " + failed + " freeze case(s) failed"); process.exit(1); }
  console.log("\nALL FREEZE CASES PASSED ✅");
})().catch(e => { console.error("\n✗ FREEZE TEST FAILED:", e.message); process.exit(1); });
