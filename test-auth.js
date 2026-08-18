const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PORT = 8351;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- shared fake Supabase (GoTrue auth + PostgREST kids), lives in Node ----
const DB = { users: {}, kids: [], seq: 0, t: 0 };
const now = () => new Date(1700000000000 + (DB.t += 1000)).toISOString();
const tokFor = uid => ({ access_token: "tok_" + uid, refresh_token: "ref_" + uid, expires_in: 3600, token_type: "bearer", user: { id: uid, email: uidEmail(uid) } });
const uidEmail = uid => { for (const e in DB.users) if (DB.users[e].id === uid) return e; return null; };
function handleAuth(url, body) {
  if (/\/auth\/v1\/signup/.test(url)) {
    const email = (body.email || "").toLowerCase();
    if (DB.users[email]) return { status: 400, json: { msg: "User already registered" } };
    if ((body.password || "").length < 6) return { status: 400, json: { msg: "Password should be at least 6 characters" } };
    const id = "u" + (++DB.seq); DB.users[email] = { id, email, password: body.password };
    return { status: 200, json: tokFor(id) };
  }
  if (/grant_type=password/.test(url)) {
    const email = (body.email || "").toLowerCase(), u = DB.users[email];
    if (!u || u.password !== body.password) return { status: 400, json: { error: "invalid_grant", error_description: "Invalid login credentials" } };
    return { status: 200, json: tokFor(u.id) };
  }
  if (/grant_type=refresh_token/.test(url)) {
    const uid = (body.refresh_token || "").replace("ref_", "");
    if (!uidEmail(uid)) return { status: 400, json: { error: "invalid_grant" } };
    return { status: 200, json: tokFor(uid) };
  }
  if (/\/auth\/v1\/recover/.test(url)) return { status: 200, json: {} };
  return { status: 404, json: {} };
}
function uidFromAuth(headers) { return ((headers["authorization"] || "").replace("Bearer ", "").replace("tok_", "")) || null; }
function handleKids(method, url, headers, body) {
  const uid = uidFromAuth(headers);
  if (!uid || !uidEmail(uid)) return { status: 401, json: { message: "no auth" } };
  if (method === "GET") return { status: 200, json: DB.kids.filter(k => k.owner === uid) };
  if (method === "POST") { const row = { id: "k" + (++DB.seq), owner: uid, name: body.name, avatar: body.avatar || "🦄", progress: body.progress || {}, created_at: now(), updated_at: now() }; DB.kids.push(row); return { status: 201, json: [row] }; }
  const m = /id=eq\.([^&]+)/.exec(url); const id = m && m[1];
  const row = DB.kids.find(k => k.id === id && k.owner === uid);
  if (method === "PATCH") { if (!row) return { status: 404, json: [] }; if (body.progress !== undefined) row.progress = body.progress; if (body.name !== undefined) row.name = body.name; if (body.avatar !== undefined) row.avatar = body.avatar; row.updated_at = now(); return { status: 200, json: [row] }; }
  if (method === "DELETE") { DB.kids = DB.kids.filter(k => !(k.id === id && k.owner === uid)); return { status: 204, json: null }; }
  return { status: 400, json: {} };
}

async function device(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page._errs = errs;
  await page.route(/\/auth\/v1\//, async route => { const b = JSON.parse(route.request().postData() || "{}"); const r = handleAuth(route.request().url(), b); await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.json) }); });
  await page.route(/\/rest\/v1\/kids/, async route => { const req = route.request(); const b = req.postData() ? JSON.parse(req.postData()) : {}; const r = handleKids(req.method(), req.url(), req.headers(), b); await route.fulfill({ status: r.status, contentType: "application/json", body: r.json == null ? "" : JSON.stringify(r.json) }); });
  return page;
}

(async () => {
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: __dirname, stdio: "ignore" });
  await sleep(700);
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

  // ============ DEVICE A — create a family account, add two kids ============
  const A = await device(browser);
  await A.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await A.waitForSelector(".screen--landing.is-active", { timeout: 5000 });
  await A.click("#lp-create");
  await A.waitForSelector(".screen--signup.is-active");
  await A.fill("#su-email", "Parent@Home.com"); await A.fill("#su-pass", "hunter2"); await A.fill("#su-pass2", "hunter2");
  await A.click("#su-next");
  await A.waitForSelector(".screen--kids.is-active", { timeout: 5000 });
  console.log("✓ Device A: signed up → add-kids screen");
  // add Mia
  await A.fill("#kid-name", "Mia"); await A.click("#kid-add");
  await A.waitForFunction(() => document.querySelectorAll("#kids-list .kid-added").length === 1, { timeout: 4000 });
  // add Leo
  await A.fill("#kid-name", "Leo"); await A.click("#kid-add");
  await A.waitForFunction(() => document.querySelectorAll("#kids-list .kid-added").length === 2, { timeout: 4000 });
  console.log("✓ Device A: added 2 kids (Mia, Leo)");
  if (DB.kids.length !== 2) throw new Error("expected 2 kid rows on the server, got " + DB.kids.length);
  await A.click("#kids-done");
  await A.waitForSelector(".screen--profiles.is-active", { timeout: 4000 });
  const names = await A.$$eval(".profiles-grid .pcard__name", els => els.map(e => e.textContent));
  console.log("✓ Device A: kid picker shows", JSON.stringify(names.filter(n => n !== "Add a kid")));

  // parent gate uses the account password
  await A.click(".profiles-grid .pcard");                 // pick first kid → home
  await A.waitForSelector(".screen--home.is-active");
  await A.click(".grownup-link");
  await A.waitForSelector("#parent-gate:not([hidden])");
  await A.fill("#gate-input", "wrongpw"); await A.click("#gate-go");
  await A.waitForSelector("#gate-err:not([hidden])", { timeout: 4000 });
  console.log("✓ Device A: wrong parent password rejected");
  await A.fill("#gate-input", "hunter2"); await A.click("#gate-go");
  await A.waitForSelector("#parent-report:not([hidden])", { timeout: 4000 });
  console.log("✓ Device A: correct password unlocked the Grown-ups report");

  // ============ DEVICE B — sign in on a fresh device, see the kids ============
  const B = await device(browser);
  await B.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await B.waitForSelector(".screen--landing.is-active");
  await B.click("#lp-signin");
  await B.waitForSelector(".screen--signin.is-active");
  // wrong password first
  await B.fill("#si-email", "parent@home.com"); await B.fill("#si-pass", "nope123"); await B.click("#si-go");
  await B.waitForSelector("#si-err:not([hidden])", { timeout: 4000 });
  console.log("✓ Device B: wrong password rejected:", JSON.stringify((await B.textContent("#si-err")).trim()));
  // correct
  await B.fill("#si-pass", "hunter2"); await B.click("#si-go");
  await B.waitForSelector(".screen--profiles.is-active", { timeout: 5000 });
  const bNames = (await B.$$eval(".profiles-grid .pcard__name", els => els.map(e => e.textContent))).filter(n => n !== "Add a kid");
  console.log("✓ Device B: signed in → sees kids", JSON.stringify(bNames));
  if (bNames.length !== 2) throw new Error("Device B should see 2 kids, got " + bNames.length);

  // sign out on device B → back to landing, session cleared
  B.on("dialog", d => d.accept());
  await B.click(".profiles-grid .pcard");
  await B.waitForSelector(".screen--home.is-active");
  await B.click(".grownup-link");
  await B.waitForSelector("#parent-gate:not([hidden])");
  await B.fill("#gate-input", "hunter2"); await B.click("#gate-go");
  await B.waitForSelector("#parent-report:not([hidden])");
  await B.evaluate(() => document.getElementById("signout-btn").scrollIntoView());
  await B.click("#signout-btn");
  await B.waitForSelector(".screen--landing.is-active", { timeout: 5000 });
  const cleared = await B.evaluate(() => !localStorage.getItem("tth.session.v1") && JSON.parse(localStorage.getItem("tth.profiles.v1") || '{"profiles":[]}').profiles.length === 0);
  console.log("✓ Device B: signed out → landing, session + local kids cleared:", cleared);
  if (!cleared) throw new Error("sign out should clear the session and local kids");

  // ============ duplicate email rejected ============
  const C = await device(browser);
  await C.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await C.click("#lp-create");
  await C.waitForSelector(".screen--signup.is-active");
  await C.fill("#su-email", "parent@home.com"); await C.fill("#su-pass", "another1"); await C.fill("#su-pass2", "another1");
  await C.click("#su-next");
  await C.waitForSelector("#su-err:not([hidden])", { timeout: 4000 });
  console.log("✓ Device C: duplicate email rejected:", JSON.stringify((await C.textContent("#su-err")).trim()));

  const allErr = [...A._errs, ...B._errs, ...C._errs];
  await browser.close(); server.kill();
  if (allErr.length) { console.log("\n✗ JS errors:\n" + allErr.join("\n")); process.exit(1); }
  console.log("\nFAMILY AUTH TESTS PASSED ✅");
})().catch(e => { console.error("\n✗ AUTH TEST FAILED:", e.message); process.exit(1); });
