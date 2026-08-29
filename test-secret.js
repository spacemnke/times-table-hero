const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8242;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function answer(page) {
  await page.waitForFunction(() => window.__adv.state === "gate", { timeout: 8000 });
  const q = await page.evaluate(() => window.__adv.q);
  for (const ch of String(q.a * q.b)) await page.click(`#adv-kpad .key[data-k="${ch}"]`);
  await page.waitForFunction(() => window.__adv.state === "run", { timeout: 5000 });
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 460 }, deviceScaleFactor: 2 })).newPage();
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => localStorage.setItem("tth.profiles.v1", JSON.stringify({ activeId: "mia", profiles: [{ id: "mia", name: "Mia", avatar: "🦄" }] })));
  await page.addInitScript(() => localStorage.setItem("tth.progress.v2.mia", JSON.stringify({
    v: 2, xp: 0, coins: 0, gems: 3, worldsUnlocked: 3, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0, bestStreak: 0,
    recent: [], facts: {}, days: {}, badges: {}, secretsFound: {}, settings: { dailyGoal: 8, focusTables: [1,2,3,4,5,6,7,8,9,10,11,12], streakFreeze: true } })));

  await page.goto(`http://localhost:${PORT}/index.html?test=1`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.screen--home.is-active');
  await page.evaluate(() => window.__go("adventure"));
  await page.waitForSelector('#adv-mapOv:not(.hidden)');

  await page.evaluate(() => window.__adv.start(2)); // Beach
  await sleep(300);
  const warpX = await page.evaluate(() => window.__adv.warpX);
  console.log("✓ Beach built, hidden warp at X =", warpX);
  if (warpX == null) throw new Error("Beach should contain a hidden warp portal");

  const gemsBefore = await page.evaluate(() => window.__adv.gems);
  await page.evaluate(() => window.__adv.enterSecret());
  await page.waitForFunction(() => window.__adv.inSecret === true, { timeout: 4000 });
  const secretState = await page.evaluate(() => ({ inSecret: window.__adv.inSecret, total: window.__adv.total }));
  console.log("✓ dove into secret world — inSecret:", secretState.inSecret, "| gates:", secretState.total);

  // screenshot the secret cove
  await page.evaluate(() => window.__adv.warp ? null : null);
  await sleep(600);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/beach/secret-in.png" });

  // clear the 3 secret gates → should auto-return to main level with rewards
  for (let i = 0; i < 3; i++) await answer(page);
  await page.waitForFunction(() => window.__adv.inSecret === false, { timeout: 12000 });
  console.log("✓ cleared secret → returned to main Beach level (shortcut)");

  const after = await page.evaluate(() => ({ gems: window.__adv.gems, found: window.__adv.secretsFound, state: window.__adv.state }));
  console.log("✓ gems", gemsBefore, "→", after.gems, "| secretsFound[2]:", after.found[2], "| state:", after.state);
  if (!after.found[2]) throw new Error("secretsFound[2] should be true after clearing");
  if (after.gems <= gemsBefore) throw new Error("clearing the secret should award gems");

  // SHELLY should now be unlockable in the char row
  await page.evaluate(() => window.__adv.openMap());
  await page.evaluate(() => window.__adv.buildCharRow());
  const shelly = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#adv-charRow .adv8-charBtn')];
    const b = btns.find(x => /SHELLY/.test(x.textContent));
    return b ? { present: true, locked: b.classList.contains('locked') } : { present: false };
  });
  console.log("✓ SHELLY in char row:", JSON.stringify(shelly));
  if (!shelly.present || shelly.locked) throw new Error("SHELLY should be present and unlocked");

  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("tth.progress.v2.mia")));
  console.log("✓ persisted secretsFound:", JSON.stringify(p.secretsFound), "| gems:", p.gems);
  await page.screenshot({ path: "/tmp/claude-0/-home-user/8b20dedf-fa0d-5977-81dc-69eeba19dda6/scratchpad/beach/secret-map.png" });

  await browser.close();
  server.kill();
  if (errors.length) { console.log("\n✗ JS errors:"); errors.forEach(e => console.log("  " + e)); process.exit(1); }
  console.log("\nSECRET WORLD TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ SECRET TEST FAILED:", e.message); process.exit(1); });
