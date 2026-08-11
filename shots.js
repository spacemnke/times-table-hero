const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DIR = "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad";
const OUT = DIR + "/shots";
const PORT = 8211;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: DIR, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`http://localhost:${PORT}/quest-proto.html?test=1`, { waitUntil: "networkidle" });
  await page.waitForSelector('#mapOv:not(.hidden)');
  await sleep(500);
  await page.screenshot({ path: OUT + "/1-map.png" });
  console.log("map shot");

  // Play through themed worlds: 1 meadow, 2 beach, 3 candy
  const worlds = [[1,"meadow"],[2,"beach"],[3,"candy"],[6,"jungle"]];
  for (const [n, name] of worlds) {
    await page.evaluate((n) => window.__proto.start(n), n);
    await sleep(1200); // let hero run a bit toward first gate
    await page.screenshot({ path: `${OUT}/2-run-${name}.png` });
    console.log("run shot", name);
    // reach a gate to capture math sheet
    await page.waitForFunction(() => window.__proto.state === "gate", { timeout: 15000 }).catch(()=>{});
    if (await page.evaluate(() => window.__proto.state) === "gate") {
      await sleep(300);
      await page.screenshot({ path: `${OUT}/3-gate-${name}.png` });
      console.log("gate shot", name);
      // clear the whole level to reset for next
      const total = await page.evaluate(() => window.__proto.total);
      let solved = 0;
      while (solved < total) {
        await page.waitForFunction(() => window.__proto.state === "gate", { timeout: 15000 }).catch(()=>{});
        if (await page.evaluate(() => window.__proto.state) !== "gate") break;
        const q = await page.evaluate(() => window.__proto.q);
        for (const ch of String(q.a * q.b)) await page.click(`.key[data-k="${ch}"]`);
        await page.waitForFunction((p) => window.__proto.gate > p || window.__proto.state === "win", solved, { timeout: 10000 }).catch(()=>{});
        solved++;
        if (await page.evaluate(() => window.__proto.state) === "win") break;
      }
      await page.waitForSelector('#winOv:not(.hidden)', { timeout: 8000 }).catch(()=>{});
      await sleep(300);
      if (n === 1) { await page.screenshot({ path: `${OUT}/4-win.png` }); console.log("win shot"); }
      // back to map
      await page.evaluate(() => { if (window.__proto.toMap) window.__proto.toMap(); });
      await sleep(200);
    }
  }
  await browser.close();
  server.kill();
  console.log("done");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
