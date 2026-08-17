const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8298;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A shared fake Supabase RPC backend, kept in Node and served to both "devices" via route interception.
const DB = { rows: {}, t: 0 };
function handle(fn, body) {
  const key = (body.p_name || "").trim().toLowerCase();
  const now = () => new Date(1700000000000 + (DB.t += 1000)).toISOString();
  if (fn === "tth_signup") {
    if (DB.rows[key]) return { ok: false, error: "name_taken" };
    if (!/^[0-9]{4,8}$/.test(body.p_pin || "")) return { ok: false, error: "bad_pin" };
    DB.rows[key] = { display: body.p_name.trim(), pin: body.p_pin, progress: {}, updated_at: now() };
    return { ok: true, id: "id_" + key, display_name: body.p_name.trim(), updated_at: DB.rows[key].updated_at };
  }
  if (fn === "tth_login") {
    const r = DB.rows[key];
    if (!r || r.pin !== body.p_pin) return { ok: false, error: "not_found" };
    return { ok: true, id: "id_" + key, display_name: r.display, progress: r.progress, updated_at: r.updated_at };
  }
  if (fn === "tth_save") {
    const r = DB.rows[key];
    if (!r || r.pin !== body.p_pin) return { ok: false, error: "not_found" };
    r.progress = body.p_progress || {}; r.updated_at = now();
    return { ok: true, updated_at: r.updated_at };
  }
  return { ok: false, error: "unknown_fn" };
}

async function device(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page._errors = errors;
  await page.route("**/rest/v1/rpc/**", async route => {
    const fn = route.request().url().split("/rpc/")[1].split("?")[0];
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(handle(fn, body)) });
  });
  return page;
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

  // ---------- DEVICE A: make a local player, give them progress, then "Save online" ----------
  const A = await device(browser);
  await A.addInitScript(() => localStorage.setItem('tth.profiles.v1', JSON.stringify({ activeId: 'mia', profiles: [{ id: 'mia', name: 'Mia', avatar: '🦄' }] })));
  await A.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await A.waitForSelector('.screen--home.is-active');
  await A.evaluate(() => { const reg = JSON.parse(localStorage.getItem('tth.profiles.v1')); const id = reg.activeId; const p = JSON.parse(localStorage.getItem('tth.progress.v2.' + id) || '{}'); p.xp = 500; p.coins = 42; p.worldsUnlocked = 4; localStorage.setItem('tth.progress.v2.' + id, JSON.stringify(p)); });
  await A.reload({ waitUntil: 'networkidle' });
  await A.waitForSelector('.screen--home.is-active');

  await A.click('.grownup-link');
  await A.waitForSelector('#parent-gate:not([hidden])');
  const gate = await A.textContent('#gate-q');
  const [ga, gb] = gate.split('×').map(s => parseInt(s.trim(), 10));
  await A.fill('#gate-input', String(ga * gb));
  await A.click('#gate-go');
  await A.waitForSelector('#parent-report:not([hidden])');
  await A.click('#players-manage .pm-btn--cloud');           // "☁︎ Save online"
  await A.waitForSelector('.screen--cloud.is-active');
  if (!/Save online/.test(await A.textContent('#cl-title'))) throw new Error('expected the Save online screen');
  const prefill = await A.inputValue('#cl-name');
  if (prefill !== 'Mia') throw new Error('nickname should prefill with the player name, got ' + prefill);
  await A.fill('#cl-pin', '1357');
  await A.click('#cl-go');
  await A.waitForSelector('.screen--parent.is-active', { timeout: 5000 });
  await sleep(400);
  if (!DB.rows['mia']) throw new Error('signup did not create a cloud account');
  if (DB.rows['mia'].progress.xp !== 500) throw new Error("signup should push Mia's xp=500, got " + JSON.stringify(DB.rows['mia'].progress.xp));
  console.log('✓ Device A: Mia saved online — cloud xp =', DB.rows['mia'].progress.xp, '| coins =', DB.rows['mia'].progress.coins);

  // change something through the app (daily-goal stepper) → the app's own debounced push should fire
  const beforeTs = DB.rows['mia'].updated_at;
  await A.click('#goal-plus');
  await sleep(2200);
  if (DB.rows['mia'].updated_at === beforeTs) throw new Error('app auto-push did not update the cloud after a change');
  const cloudGoal = DB.rows['mia'].progress.settings && DB.rows['mia'].progress.settings.dailyGoal;
  console.log('✓ Device A: app auto-synced a change (cloud dailyGoal =', cloudGoal, ')');

  // ---------- DEVICE B: fresh browser → landing → "Sign in" → Mia's progress appears ----------
  const B = await device(browser);
  await B.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await B.waitForSelector('.screen--landing.is-active');
  await B.click('#lp-signin');
  await B.waitForSelector('.screen--cloud.is-active');
  await B.fill('#cl-name', 'Mia');
  await B.fill('#cl-pin', '1357');
  await B.click('#cl-go');
  await B.waitForSelector('.screen--home.is-active', { timeout: 5000 });
  const bState = await B.evaluate(() => { const reg = JSON.parse(localStorage.getItem('tth.profiles.v1')); const id = reg.activeId; const p = JSON.parse(localStorage.getItem('tth.progress.v2.' + id)); const prof = reg.profiles.find(x => x.id === id); return { xp: p.xp, coins: p.coins, linked: !!(prof.cloud && prof.cloud.name) }; });
  console.log('✓ Device B: signed in as Mia → pulled xp =', bState.xp, '| coins =', bState.coins, '| linked =', bState.linked);
  if (bState.xp !== 500) throw new Error('Device B should have pulled xp=500, got ' + bState.xp);
  if (!bState.linked) throw new Error('Device B profile should be cloud-linked');
  const badgeShown = await B.evaluate(() => !document.getElementById('cloud-badge').hidden);
  if (!badgeShown) throw new Error('cloud badge should be visible for a linked profile');
  console.log('✓ Device B: profile cloud-linked and ☁︎ badge shown');

  // ---------- DEVICE C: fresh browser → landing → "Create account" → straight into the game ----------
  const C = await device(browser);
  await C.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await C.waitForSelector('.screen--landing.is-active');
  await C.click('#lp-create');
  await C.waitForSelector('.screen--cloud.is-active');
  if (!/Create account/.test(await C.textContent('#cl-title'))) throw new Error('expected the Create account screen');
  await C.fill('#cl-name', 'Leo');
  await C.fill('#cl-pin', '2468');
  await C.click('#cl-go');
  await C.waitForSelector('.screen--home.is-active', { timeout: 5000 });
  await sleep(300);
  if (!DB.rows['leo']) throw new Error('create-account did not make a cloud account');
  const cLinked = await C.evaluate(() => { const reg = JSON.parse(localStorage.getItem('tth.profiles.v1')); const p = reg.profiles.find(x => x.id === reg.activeId); return !!(p && p.cloud && p.cloud.name === 'Leo'); });
  if (!cLinked) throw new Error('new-account profile should be cloud-linked');
  console.log('✓ Device C: created a new account from the landing → playing, auto-linked');

  // ---------- wrong PIN rejected ----------
  await B.click('#player-switch');
  await B.waitForSelector('.screen--profiles.is-active');
  await B.click('#cloud-signin');
  await B.waitForSelector('.screen--cloud.is-active');
  await B.fill('#cl-name', 'Mia');
  await B.fill('#cl-pin', '9999');
  await B.click('#cl-go');
  await B.waitForSelector('#cl-err:not([hidden])', { timeout: 4000 });
  const err = (await B.textContent('#cl-err')).trim();
  console.log('✓ wrong PIN rejected:', JSON.stringify(err));
  if (!/Wrong/i.test(err)) throw new Error('expected a wrong-nickname-or-PIN message');

  // ---------- duplicate nickname rejected on signup ----------
  const dup = handle('tth_signup', { p_name: 'Mia', p_pin: '2468' });
  if (dup.error !== 'name_taken') throw new Error('duplicate nickname should be rejected');
  console.log('✓ duplicate nickname rejected at signup');

  const allErr = [...A._errors, ...B._errors];
  await browser.close(); server.kill();
  if (allErr.length) { console.log('\n✗ JS errors:'); allErr.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\nCLOUD SYNC TESTS PASSED ✅');
})().catch(e => { console.error('\n✗ CLOUD TEST FAILED:', e.message); process.exit(1); });
