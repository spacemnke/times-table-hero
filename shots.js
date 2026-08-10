const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const base = `http://localhost:${PORT}/index.html`;
  await page.goto(base, { waitUntil: "networkidle" });

  await page.waitForSelector('.screen--home.is-active');
  await page.screenshot({ path: "shot-home.png" });

  await page.click('[data-go="learn"]');
  await page.click('#learn-picker .num-btn:nth-child(6)');
  await sleep(500);
  await page.screenshot({ path: "shot-learn.png" });
  await page.click('[data-screen="learn"] .btn-back');

  await page.click('[data-go="quiz-setup"]');
  await page.click('[data-select-all="quiz"]');
  await page.click('#quiz-start');
  await page.waitForSelector('.screen--play[data-screen="quiz"].is-active');
  await sleep(300);
  await page.screenshot({ path: "shot-quiz.png" });

  // answer wrong on purpose to show feedback state, then finish rest correct
  {
    const qText = await page.textContent('#quiz-question');
    const [a,b] = qText.split("×").map(s=>parseInt(s.trim(),10));
    const answer=a*b;
    const btns = await page.$$('#quiz-answers .answer');
    for (const btn of btns){ const t=parseInt(await btn.textContent(),10); if(t!==answer){ await btn.click(); break; } }
    await sleep(400);
    await page.screenshot({ path: "shot-quiz-feedback.png" });
  }
  await browser.close();
  server.kill();
  console.log("shots done");
})().catch(e=>{console.error(e);process.exit(1);});
