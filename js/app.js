/* Times Table Hero — vanilla JS, no build step. v2 (age 10: streaks, XP, badges, parent report). */
(function () {
  "use strict";

  /* ---- on-screen error reporter (diagnostic; stays invisible unless something actually breaks) ---- */
  var __diagBox = null;
  function __diag(msg) {
    try {
      if (!__diagBox) {
        __diagBox = document.createElement("div");
        __diagBox.setAttribute("style", "position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#b00020;color:#fff;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px 12px;white-space:pre-wrap;word-break:break-word;max-height:48vh;overflow:auto;box-shadow:0 2px 10px rgba(0,0,0,.55)");
        __diagBox.addEventListener("click", function () { if (__diagBox) { __diagBox.remove(); __diagBox = null; } });
        (document.body || document.documentElement).appendChild(__diagBox);
      }
      __diagBox.textContent = "⚠ " + msg + "\n\n(tap to dismiss)";
    } catch (e) {}
  }
  window.__diag = __diag;
  window.addEventListener("error", function (e) {
    __diag("JS ERROR: " + (e.message || (e.error && e.error.message) || e.error || "?") + "\n" + ((e.filename || "").split("/").pop()) + ":" + e.lineno + ":" + e.colno);
  });
  // Force-on diagnostic mode via ?diag=1 — prints canvas stats + shows a known-good
  // green-on-red test canvas so a device screenshot tells us if the display pipeline
  // itself is failing (test box invisible) or only the game canvas is (test box visible).
  var DIAG = /[?&]diag=1/.test(location.search);
  function diagTestBox() {
    if (!DIAG) return;
    try {
      if (document.getElementById("__diagtest")) return;
      var t = document.createElement("canvas"); t.id = "__diagtest"; t.width = 120; t.height = 80;
      t.setAttribute("style", "position:fixed;left:8px;bottom:8px;width:120px;height:80px;z-index:2147483646;border:2px solid #fff;image-rendering:pixelated");
      var g = t.getContext("2d"); g.fillStyle = "#e01030"; g.fillRect(0, 0, 120, 80);
      g.fillStyle = "#22e04a"; g.beginPath(); g.arc(60, 40, 26, 0, 7); g.fill();
      g.fillStyle = "#fff"; g.font = "bold 12px monospace"; g.textAlign = "center"; g.fillText("TEST", 60, 72);
      (document.body || document.documentElement).appendChild(t);
    } catch (e) {}
  }

  var MAX = 12;
  var STORE_KEY = "tth.progress.v2";     // per-profile: STORE_KEY + "." + profileId
  var PROFILES_KEY = "tth.profiles.v1";
  var SOUND_KEY = "tth.sound.v1";
  var RING_C = 119.38; // 2*pi*19
  var AVATARS = ["🦄", "🐰", "🐱", "🐶", "🦊", "🐨", "🐼", "🐸", "🦁", "🦖", "🐝", "🦋", "🌸", "⭐️", "🚀", "🐙"];

  /* ---------------- cloud save (Supabase RPC over plain fetch — no SDK) ---------------- */
  var CLOUD_URL = "https://gpmzosyvlpepriquspgw.supabase.co";
  var CLOUD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwbXpvc3l2bHBlcHJpcXVzcGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5ODAzMTYsImV4cCI6MjEwMjU1NjMxNn0.ycdKzsb4WvC4FK_k0H-fAJog1W7Di3wj8NshkBWBOqY";
  // Family accounts: a parent signs in with Supabase Auth (email+password); their
  // kids live in one RLS-protected table reached with the parent's JWT. Plain fetch,
  // no SDK. Session is kept in localStorage and refreshed as its access token ages.
  var Auth = (function () {
    var on = !!(CLOUD_URL && CLOUD_KEY), SKEY = "tth.session.v1", sess = null;
    try { sess = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) {}
    function saveSess(s) { sess = s; try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) {} }
    function hdr(tok) { return { "apikey": CLOUD_KEY, "Authorization": "Bearer " + (tok || CLOUD_KEY), "Content-Type": "application/json" }; }
    function post(path, body, tok) {
      return fetch(CLOUD_URL + path, { method: "POST", headers: hdr(tok), body: JSON.stringify(body) })
        .then(function (r) { return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { status: r.status, body: j }; }); },
              function () { return { status: 0, body: { error: "offline" } }; });
    }
    function setFromToken(j) {
      if (!j || !j.access_token) return null;
      var s = { access_token: j.access_token, refresh_token: j.refresh_token,
        email: (j.user && j.user.email) || (sess && sess.email), uid: (j.user && j.user.id) || (sess && sess.uid),
        expires_at: Date.now() + ((j.expires_in || 3600) * 1000) };
      saveSess(s); return s;
    }
    function authErr(b, status) {
      if (b && b.error === "offline") return "offline";
      var m = (b && (b.error_description || b.msg || b.message || (typeof b.error === "string" ? b.error : ""))) || "";
      if (/already.*regist|already been regist|user.*exists/i.test(m)) return "email_taken";
      if (/invalid login|invalid credential|invalid grant|invalid_grant/i.test(m)) return "bad_login";
      if (/not confirmed|confirm/i.test(m)) return "unconfirmed";
      if (/password/i.test(m) && /least|short|6|characters/i.test(m)) return "weak_password";
      if (/email/i.test(m) && /valid|invalid/i.test(m)) return "bad_email";
      if (status === 0) return "offline";
      return "server";
    }
    function refresh() {
      if (!sess || !sess.refresh_token) return Promise.resolve({ ok: false });
      return post("/auth/v1/token?grant_type=refresh_token", { refresh_token: sess.refresh_token }).then(function (r) {
        if (r.body && r.body.access_token) return { ok: true, session: setFromToken(r.body) };
        if (r.status === 400 || r.status === 401) saveSess(null);        // refresh token dead → force re-login
        return { ok: false };
      });
    }
    function token() {
      if (!sess) return Promise.resolve(null);
      if (sess.expires_at && Date.now() < sess.expires_at - 60000) return Promise.resolve(sess.access_token);
      return refresh().then(function (r) { return r.ok ? sess.access_token : null; });
    }
    function rest(path, method, body) {
      return token().then(function (tok) {
        if (!tok) return { ok: false, error: "no_session" };
        var h = hdr(tok), opt = { method: method, headers: h };
        if (method === "POST" || method === "PATCH") { h.Prefer = "return=representation"; opt.body = JSON.stringify(body); }
        return fetch(CLOUD_URL + "/rest/v1/" + path, opt).then(function (r) {
          return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { ok: r.status >= 200 && r.status < 300, status: r.status, data: j }; });
        }, function () { return { ok: false, error: "offline" }; });
      });
    }
    return {
      enabled: on,
      session: function () { return sess; },
      email: function () { return sess && sess.email; },
      signedIn: function () { return !!(sess && sess.refresh_token); },
      signup: function (email, password) {
        return post("/auth/v1/signup", { email: email, password: password }).then(function (r) {
          if (r.status >= 200 && r.status < 300) {
            if (r.body && r.body.access_token) return { ok: true, session: setFromToken(r.body) };
            return { ok: true, session: null, needsConfirm: true };       // "Confirm email" is ON in the project
          }
          return { ok: false, error: authErr(r.body, r.status) };
        });
      },
      login: function (email, password) {
        return post("/auth/v1/token?grant_type=password", { email: email, password: password }).then(function (r) {
          if (r.body && r.body.access_token) return { ok: true, session: setFromToken(r.body) };
          return { ok: false, error: authErr(r.body, r.status) };
        });
      },
      // verify the current parent's password without disturbing the live session (for the Grown-ups gate)
      verify: function (password) {
        if (!sess || !sess.email) return Promise.resolve({ ok: false, error: "no_session" });
        return post("/auth/v1/token?grant_type=password", { email: sess.email, password: password }).then(function (r) {
          if (r.body && r.body.access_token) { setFromToken(r.body); return { ok: true }; }
          return { ok: false, error: authErr(r.body, r.status) };
        });
      },
      recover: function (email) { return post("/auth/v1/recover", { email: email }).then(function (r) { return { ok: r.status >= 200 && r.status < 300, error: authErr(r.body, r.status) }; }); },
      // a password-reset link opens the app with tokens in the URL hash — adopt them as a session
      consumeHash: function () {
        try {
          var h = location.hash || ""; if (h.indexOf("access_token=") < 0) return null;
          var p = {}; h.replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
          if (!p.access_token) return null;
          setFromToken({ access_token: p.access_token, refresh_token: p.refresh_token, expires_in: parseInt(p.expires_in, 10) || 3600, user: null });
          try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
          return p.type || "session";
        } catch (e) { return null; }
      },
      fetchUser: function () {
        return token().then(function (tok) {
          if (!tok) return { ok: false };
          return fetch(CLOUD_URL + "/auth/v1/user", { headers: hdr(tok) }).then(function (r) {
            return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (j && j.id && sess) { sess.uid = j.id; sess.email = j.email; saveSess(sess); } return { ok: r.ok, user: j }; });
          }, function () { return { ok: false, error: "offline" }; });
        });
      },
      updateUser: function (fields) {
        return token().then(function (tok) {
          if (!tok) return { ok: false, error: "no_session" };
          return fetch(CLOUD_URL + "/auth/v1/user", { method: "PUT", headers: hdr(tok), body: JSON.stringify(fields) }).then(function (r) {
            return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (r.ok && j && j.email && sess) { sess.email = j.email; saveSess(sess); } return { ok: r.status >= 200 && r.status < 300, status: r.status, body: j, error: authErr(j, r.status) }; });
          }, function () { return { ok: false, error: "offline" }; });
        });
      },
      refresh: refresh, token: token,
      logout: function () { saveSess(null); },
      listKids: function () { return rest("kids?select=*&order=created_at.asc", "GET"); },
      addKid: function (name, avatar, progress) { return rest("kids", "POST", { name: name, avatar: avatar, progress: progress || {} }); },
      saveKid: function (id, progress) { return rest("kids?id=eq." + id, "PATCH", { progress: progress }); },
      renameKid: function (id, name, avatar) { var b = { name: name }; if (avatar) b.avatar = avatar; return rest("kids?id=eq." + id, "PATCH", b); },
      removeKid: function (id) { return rest("kids?id=eq." + id, "DELETE"); }
    };
  })();

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function randInt(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[randInt(a.length)]; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- dates ---------------- */
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayKey(offset) { var d = new Date(); d.setDate(d.getDate() - (offset || 0)); return ymd(d); }
  function weekdayLetter(offset) { var d = new Date(); d.setDate(d.getDate() - offset); return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()]; }

  /* ---------------- state ---------------- */
  var state = {
    quizTables: [], practiceTables: [],
    quizMode: "type", quizLen: 15, practiceAnswer: "keypad",
    play: null, deck: [], deckIndex: 0,
    lastStart: null, parentUnlocked: false, gateAnswer: 0,
  };

  var reg = null;             // profiles registry { activeId, profiles: [{id,name,avatar}] }
  var activeId = null;
  var progress = freshProgress();
  var soundOn = loadSound();

  /* ---------------- persistence ---------------- */
  function allTables() { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; }
  function freshProgress() {
    return { v: 2, xp: 0, coins: 0, gems: 0, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0,
      bestStreak: 0, recent: [], facts: {}, days: {}, badges: {}, secretsFound: {},
      settings: { dailyGoal: 20, focusTables: allTables(), streakFreeze: true } };
  }
  function normalize(p) {
    var f = freshProgress();
    for (var k in f) if (!(k in p)) p[k] = f[k];
    if (typeof p.coins !== "number") p.coins = 0;
    if (!p.settings) p.settings = {};
    if (typeof p.settings.dailyGoal !== "number") p.settings.dailyGoal = 20;
    if (!Array.isArray(p.settings.focusTables) || !p.settings.focusTables.length) p.settings.focusTables = allTables();
    if (typeof p.settings.streakFreeze !== "boolean") p.settings.streakFreeze = true;
    if (typeof p.settings.missingFactor !== "boolean") p.settings.missingFactor = false;
    return p;
  }
  function pKey(id) { return STORE_KEY + "." + (id || activeId); }
  function loadProgress() {
    if (!activeId) return freshProgress();
    try { var raw = localStorage.getItem(pKey()); if (raw) return normalize(JSON.parse(raw)); } catch (e) {}
    return freshProgress();
  }
  function save() { if (!activeId) return; try { localStorage.setItem(pKey(), JSON.stringify(progress)); } catch (e) {} cloudPush(); }
  function loadSound() { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; } }
  function saveSound() { try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) {} }

  /* ---------------- profiles ---------------- */
  function genId() { return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function profilesLoad() {
    try { var raw = localStorage.getItem(PROFILES_KEY); if (raw) { var r = JSON.parse(raw); if (r && Array.isArray(r.profiles)) return r; } } catch (e) {}
    return { activeId: null, profiles: [] };
  }
  function profilesSave() { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(reg)); } catch (e) {} }
  function activeProfile() { for (var i = 0; i < reg.profiles.length; i++) if (reg.profiles[i].id === activeId) return reg.profiles[i]; return null; }
  function migrateLegacy() {
    // one-time: fold pre-profiles progress into a first profile
    if (reg.profiles.length) return;
    var legacy = null;
    try { legacy = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (legacy) {
      var id = genId();
      reg.profiles.push({ id: id, name: "Player 1", avatar: "⭐️" });
      reg.activeId = id;
      try { localStorage.setItem(pKey(id), legacy); localStorage.removeItem(STORE_KEY); } catch (e) {}
      profilesSave();
    }
  }
  function setActive(id) {
    reg.activeId = id; activeId = id; profilesSave();
    progress = loadProgress();
    state.parentUnlocked = false; // re-gate the report after a switch
    updatePlayerSwitch();
    cloudStatus = activeCloud() ? "saved" : ""; updateCloudBadge();
    if (activeCloud()) cloudPull();   // fetch anything newer from another device
  }
  function createProfile(name, avatar) {
    var id = genId();
    reg.profiles.push({ id: id, name: (name || "Player").slice(0, 12), avatar: avatar || "⭐️" });
    profilesSave();
    setActive(id);
    save(); // persist the fresh progress so the profile exists on disk immediately
    return id;
  }
  function deleteProfile(id) {
    reg.profiles = reg.profiles.filter(function (p) { return p.id !== id; });
    try { localStorage.removeItem(pKey(id)); } catch (e) {}
    if (activeId === id) { activeId = null; reg.activeId = null; }
    profilesSave();
    if (!activeId && reg.profiles.length) setActive(reg.profiles[0].id);
  }
  function renameProfile(id, name) {
    var p = reg.profiles.filter(function (x) { return x.id === id; })[0];
    if (p) { p.name = (name || p.name).slice(0, 12); profilesSave(); }
  }

  /* ---------------- family cloud sync (kids table) ---------------- */
  var cloudTimer = null, cloudStatus = "";   // "", "saving", "saved", "offline"
  function activeCloud() { return Auth.signedIn() ? { email: Auth.email() } : null; }
  function byId(id) { for (var i = 0; i < reg.profiles.length; i++) if (reg.profiles[i].id === id) return reg.profiles[i]; return null; }
  function setCloudStatus(s) { cloudStatus = s; updateCloudBadge(); }
  function updateCloudBadge() {
    var b = document.getElementById("cloud-badge"); if (!b) return;
    if (!Auth.signedIn()) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = cloudStatus === "saving" ? "☁︎…" : cloudStatus === "offline" ? "☁︎!" : "☁︎";
    b.title = cloudStatus === "offline" ? "Offline — will sync when back online" : "Saved to your family account";
  }
  function writeKidProgress(id, prog) {
    var p = normalize(prog || {});
    try { localStorage.setItem(pKey(id), JSON.stringify(p)); } catch (e) {}
    if (id === activeId) progress = p;
  }
  // debounced save of the active kid's progress to their row on the family account
  function cloudPush() {
    var p = activeProfile(); if (!p || !Auth.signedIn()) return;
    if (cloudTimer) clearTimeout(cloudTimer);
    var id = p.id, snap = progress;
    cloudTimer = setTimeout(function () {
      setCloudStatus("saving");
      Auth.saveKid(id, snap).then(function (res) {
        if (res && res.ok) { var row = res.data && res.data[0], pr = byId(id); if (row && pr) { pr.syncTs = Date.parse(row.updated_at) || Date.now(); profilesSave(); } setCloudStatus("saved"); }
        else setCloudStatus("offline");
      });
    }, 1200);
  }
  // pull every kid on the account into local profiles (adopt server rows that are newer than our last sync)
  function pullAllKids(cb) {
    if (!Auth.signedIn()) { if (cb) cb({ ok: false }); return; }
    Auth.listKids().then(function (res) {
      if (res && res.ok && res.data) {
        var map = {}; reg.profiles.forEach(function (p) { map[p.id] = p; });
        var seen = {};
        res.data.forEach(function (row) {
          seen[row.id] = true; var srvTs = Date.parse(row.updated_at) || 0, p = map[row.id];
          if (!p) { reg.profiles.push({ id: row.id, name: row.name, avatar: row.avatar || "🦄", syncTs: srvTs }); writeKidProgress(row.id, row.progress); }
          else { p.name = row.name; p.avatar = row.avatar || p.avatar; if (srvTs > (p.syncTs || 0)) { writeKidProgress(row.id, row.progress); p.syncTs = srvTs; } }
        });
        reg.profiles = reg.profiles.filter(function (p) { return seen[p.id]; });
        if (activeId && !seen[activeId]) { activeId = reg.profiles[0] ? reg.profiles[0].id : null; reg.activeId = activeId; }
        profilesSave(); setCloudStatus("saved");
      } else if (res && res.error === "offline") { setCloudStatus("offline"); }
      if (cb) cb(res);
    });
  }
  function cloudPull() { pullAllKids(function () { progress = loadProgress(); if (typeof renderHome === "function") { try { renderHome(); } catch (e) {} } }); }
  // add a kid to the family account (creates the server row, mirrors it locally); cb(ok, id, err)
  function addKidRemote(name, avatar, cb) {
    var prog = freshProgress();
    if (!Auth.signedIn()) {   // offline / automated local mode → local-only kid
      var lid = genId();
      reg.profiles.push({ id: lid, name: (name || "Player").slice(0, 16), avatar: avatar || "🦄" });
      writeKidProgress(lid, prog); profilesSave();
      if (cb) cb(true, lid); return;
    }
    Auth.addKid((name || "Player").slice(0, 16), avatar || "🦄", prog).then(function (res) {
      if (res && res.ok && res.data && res.data[0]) {
        var row = res.data[0];
        reg.profiles.push({ id: row.id, name: row.name, avatar: row.avatar || avatar, syncTs: Date.parse(row.updated_at) || Date.now() });
        writeKidProgress(row.id, prog); profilesSave();
        if (cb) cb(true, row.id);
      } else if (cb) cb(false, null, (res && res.error) || "server");
    });
  }

  /* ---------------- fact stats (commutative merge) ---------------- */
  function factKey(a, b) { return a + "×" + b; }
  function rawFact(a, b) { return progress.facts[factKey(a, b)] || { n: 0, c: 0, ms: 0 }; }
  function getFact(a, b) { // merged both orientations
    var f1 = rawFact(a, b), f2 = a === b ? { n: 0, c: 0, ms: 0 } : rawFact(b, a);
    return { n: f1.n + f2.n, c: f1.c + f2.c, ms: f1.ms + f2.ms };
  }
  function factAcc(a, b) { var f = getFact(a, b); return f.n ? f.c / f.n : null; }

  /* ---------------- xp / level ---------------- */
  function totalForLevel(L) { return 30 * L * (L - 1); }
  function levelFromXp(xp) { var L = 1; while (totalForLevel(L + 1) <= xp) L++; return L; }
  function levelProgress(xp) {
    var L = levelFromXp(xp), cur = totalForLevel(L), next = totalForLevel(L + 1);
    return { level: L, frac: (xp - cur) / (next - cur), inLevel: xp - cur, span: next - cur };
  }
  function rankName(L) {
    if (L < 3) return "Rookie"; if (L < 5) return "Riser"; if (L < 7) return "Sharp";
    if (L < 10) return "Pro"; if (L < 13) return "Ace"; if (L < 16) return "Champion"; return "Legend";
  }

  /* ---------------- streak ---------------- */
  function metOn(key) { var d = progress.days[key]; return !!(d && d.q >= progress.settings.dailyGoal); }
  // Streak with an optional "freeze": an isolated missed day is forgiven, but at most
  // once per rolling 7 days (so you can't keep a streak by practising every other day),
  // and never two missed days in a row.
  var FREEZE_WINDOW = 7;
  function streakDetail() {
    var freezeOn = progress.settings.streakFreeze !== false;
    var i = metOn(dayKey(0)) ? 0 : 1; // today, if not met yet, is still "in progress"
    var streak = 0, frozen = 0, recentBridge = null, lastBridge = -999;
    while (true) {
      if (metOn(dayKey(i))) { streak++; i++; continue; }
      var canBridge = freezeOn && metOn(dayKey(i + 1)) && (i - lastBridge) >= FREEZE_WINDOW;
      if (canBridge) { if (recentBridge === null) recentBridge = i; lastBridge = i; frozen++; i++; continue; }
      break;
    }
    var freezeReady = freezeOn && (recentBridge === null || recentBridge >= FREEZE_WINDOW);
    return { streak: streak, frozen: frozen, freezeReady: freezeReady, freezeOn: freezeOn, todayMet: metOn(dayKey(0)) };
  }
  function currentStreak() { return streakDetail().streak; }
  function bestStreak() { return Math.max(progress.bestStreak || 0, currentStreak()); }

  function recentAcc(n) {
    var r = progress.recent, k = Math.min(n, r.length); if (!k) return 0;
    var s = 0; for (var i = r.length - k; i < r.length; i++) s += r[i]; return s / k;
  }

  /* ---------------- badges ---------------- */
  var BADGES = [
    { id: "first", icon: "🎯", name: "First Win", desc: "Finish a quiz", test: function () { return progress.totalQ > 0; } },
    { id: "streak3", icon: "🔥", name: "On a Roll", desc: "3-day streak", test: function () { return bestStreak() >= 3; } },
    { id: "streak7", icon: "🔥", name: "Week Warrior", desc: "7-day streak", test: function () { return bestStreak() >= 7; } },
    { id: "streak30", icon: "🏆", name: "Unstoppable", desc: "30-day streak", test: function () { return bestStreak() >= 30; } },
    { id: "perfect", icon: "⭐️", name: "Flawless", desc: "100% on a 10+ quiz", test: function (c) { return c && c.perfect && c.quizLen >= 10; } },
    { id: "speed", icon: "⚡️", name: "Lightning", desc: "25 fast answers", test: function () { return progress.fastCount >= 25; } },
    { id: "century", icon: "💯", name: "Century", desc: "100 correct", test: function () { return progress.totalCorrect >= 100; } },
    { id: "sharp", icon: "🎓", name: "Sharp Shooter", desc: "90%+ over last 50", test: function () { return progress.recent.length >= 50 && recentAcc(50) >= 0.9; } },
    { id: "master", icon: "👑", name: "Table Master", desc: "Ace a whole table", test: function () { return anyTableMastered(); } },
    { id: "level5", icon: "🌟", name: "Level 5", desc: "Reach level 5", test: function () { return levelFromXp(progress.xp) >= 5; } },
    { id: "explorer", icon: "🗺️", name: "Explorer", desc: "Try every table", test: function () { return allTablesTried(); } },
    { id: "marathon", icon: "🚀", name: "Marathon", desc: "500 correct", test: function () { return progress.totalCorrect >= 500; } },
  ];
  function anyTableMastered() {
    for (var t = 2; t <= MAX; t++) {
      var ok = true;
      for (var b = 1; b <= MAX; b++) { var f = getFact(t, b); if (f.n < 2 || f.c / f.n < 0.9) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }
  function allTablesTried() {
    for (var t = 1; t <= MAX; t++) {
      var any = false;
      for (var b = 1; b <= MAX; b++) { if (getFact(t, b).n > 0) { any = true; break; } }
      if (!any) return false;
    }
    return true;
  }
  function evaluateBadges(ctx) {
    var newly = [];
    BADGES.forEach(function (b) {
      if (!progress.badges[b.id] && b.test(ctx)) { progress.badges[b.id] = dayKey(0); newly.push(b); }
    });
    return newly;
  }

  /* ---------------- sound / haptic ---------------- */
  var audioCtx = null;
  function ac() { if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); } return audioCtx; }
  function tone(freq, dur, type, when, vol) {
    if (!soundOn) return; var ctx = ac(); if (!ctx) return;
    var t0 = ctx.currentTime + (when || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || "sine"; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function sGood() { tone(660, 0.11, "sine", 0); tone(880, 0.14, "sine", 0.09); }
  function sBad() { tone(196, 0.22, "sine", 0); }
  function sTap() { tone(520, 0.05, "triangle", 0, 0.09); }
  function sFlip() { tone(440, 0.07, "triangle", 0, 0.1); }
  function sWin() { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.16, "sine", i * 0.11); }); }
  function sLevel() { [659, 880, 1319].forEach(function (f, i) { tone(f, 0.18, "triangle", i * 0.1, 0.14); }); }
  function haptic(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }

  /* ---------------- world music (looping 8-bit melodies, one per world) ---------------- */
  var NF = { "C3":130.81,"D3":146.83,"E3":164.81,"F3":174.61,"G3":196,"A3":220,"B3":246.94,"Bb3":233.08,"Fs3":185,
    "C4":261.63,"D4":293.66,"E4":329.63,"F4":349.23,"G4":392,"A4":440,"B4":493.88,"Cs4":277.18,"Fs4":369.99,"Gs4":415.30,"Bb4":466.16,"Eb4":311.13,
    "C5":523.25,"D5":587.33,"E5":659.25,"F5":698.46,"G5":783.99,"A5":880,"B5":987.77,"Cs5":554.37,"Ds5":622.25,"Fs5":739.99,"Gs5":830.61,"Bb5":932.33,"Eb5":622.25,
    "C6":1046.5,"D6":1174.66,"E6":1318.51,"-":0 };
  function mel(beat, wave, vol, seq) { var notes = seq.split(" ").map(function (s) { var p = s.split(":"); return [NF[p[0]] || 0, p[1] ? +p[1] : 1]; }); return { beat: beat, wave: wave, vol: vol, bar: 4, bvol: 0.05, notes: notes }; }
  var WORLD_MUSIC = [
    mel(0.15, "square",  0.06, "C5 E5 G5 E5 F5 A5 G5 E5 D5 F5 A5 G5 E5:2 C5:2"),        // 1 Meadow — bright & bouncy
    mel(0.16, "square",  0.06, "G4 B4 D5 B4 E5 D5 B4 G4 A4 C5 E5 D5 B4:2 G4:2"),        // 2 Beach — breezy
    mel(0.14, "square",  0.06, "E5 G5 E5 C5 D5 F5 D5 B4 C5 E5 G5 C6 B5 G5 E5:2"),       // 3 Candy — playful & high
    mel(0.17, "triangle",0.07, "A4 C5 E5 D5 C5 A4 G4 A4 F4 A4 C5 B4 A4:2 E4:2"),        // 4 Ocean — flowing
    mel(0.18, "triangle",0.06, "C5 E5 G5 B5 A5 G5 E5 C5 D5 F5 A5 G5 E5:2 C5:2"),        // 5 Snow — twinkly
    mel(0.13, "square",  0.06, "D4 D4 F4 A4 G4 F4 D4 A3 D4 F4 A4 D5 C5 A4 D4:2"),       // 6 Jungle — driving & low
    mel(0.12, "sawtooth",0.05, "A4 C5 A4 F4 E4 F4 A4 E5 D5 C5 A4 E4 F4:2 E4:2"),        // 7 Volcano — intense minor
    mel(0.17, "triangle",0.06, "E4 A4 C5 B4 E5 D5 B4 A4 G4 B4 E5 D5 C5:2 A4:2")         // 8 Space — mysterious
  ];
  var SECRET_MUSIC = mel(0.19, "triangle", 0.075, "A4 D5 Fs5 A5 G5 E5 Cs5 A4 B4 D5 Fs5 E5 D5:2 A4:2"); // magical
  var DANGER_MUSIC = mel(0.13, "sawtooth", 0.055, "A3 - A3 C4 A3 - G3 - A3 - A3 C4 D4 - C4 -");       // low & tense — plays while trapped
  var mus = { on: false, timer: null, mel: null };
  function musicStop() { mus.on = false; if (mus.timer) { clearTimeout(mus.timer); mus.timer = null; } }
  function musicLoop() {
    if (!mus.on || !mus.mel) return; var ctx = ac(); if (!ctx) return;
    var m = mus.mel, t = 0, tonic = m.notes[0][0];
    for (var i = 0; i < m.notes.length; i++) { var nn = m.notes[i], d = nn[1] * m.beat; if (nn[0] && soundOn) tone(nn[0], d * 0.9, m.wave, t, m.vol); t += d; }
    var barB = m.bar * m.beat; for (var bt = 0; bt < t - 0.001; bt += barB) { if (soundOn && tonic) tone(tonic / 2, barB * 0.92, "triangle", bt, m.bvol); }
    mus.timer = setTimeout(musicLoop, Math.max(250, Math.round(t * 1000)));
  }
  function musicPlay(m) { musicStop(); if (!m || !soundOn) { mus.mel = m; mus.on = !!m && soundOn; if (mus.on) musicLoop(); return; } mus.mel = m; mus.on = true; musicLoop(); }
  function musicWorld(level) { musicPlay(WORLD_MUSIC[((level || 1) - 1) % WORLD_MUSIC.length]); }
  function musicSecret() { musicPlay(SECRET_MUSIC); }
  function musicDanger() { musicPlay(DANGER_MUSIC); }

  /* ---------------- navigation ---------------- */
  function show(name) {
    $all(".screen").forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-screen") === name); });
    document.body.classList.toggle("lp-full", name === "landing");   // landing breaks out to full browser width
    document.body.setAttribute("data-screen", name);                 // lets CSS give each screen its own desktop width
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]"); if (!g) return; sTap(); route(g.getAttribute("data-go"));
  });
  function route(dest) {
    if (dest === "home") { renderHome(); show("home"); }
    else if (dest === "learn") { show("learn"); }
    else if (dest === "quiz-setup") { show("quiz-setup"); }
    else if (dest === "practice-setup") { show("practice-setup"); }
    else if (dest === "badges") { renderBadges(); show("badges"); }
    else if (dest === "parent") { openParent(); }
    else if (dest === "adventure") { ac(); Adv.startDaily(); }   // hub map banner → open the Quest Land map (same entry as Daily Quest)
    else show(dest);
  }
  window.__go = route;   // debug/test hook for direct navigation

  /* ---------------- pixel UI icons (shared arcade style) ---------------- */
  var Pix = (function () {
    var PAL = { ".": null, " ": null, O: "#e8722a", D: "#c1531a", W: "#fde6cf", K: "#241a4a", G: "#ffd23f", H: "#fff2a8", C: "#c9930a", F: "#ff8a3f", R: "#ff4d6d", r: "#c1263f", w: "#ffffff", B: "#38b6ff", P: "#a06bff", s: "#b7a9f0", g: "#57c84a" };
    var GR = {
      flame: ["....F....", "...FGF...", "...FGF...", "..FGGGF..", "..FGHGF..", ".FGHHHGF.", ".FGHwHGF.", ".FGHHHGF.", ".FFGGGFF.", "..FFFFF..", "...FFF..."],
      bolt: [".....GG..", "....GGG..", "...GGG...", "..GGGH...", ".GGGGGGG.", "...HGGG..", "...GGG...", "..GGG....", "..GG.....", ".GG......", "GG......."],
      target: ["..RRRRR..", ".RwwwwwR.", "RwrrrrrwR", "RwrwwwrwR", "RwrwKwrwR", "RwrwwwrwR", "RwrrrrrwR", ".RwwwwwR.", "..RRRRR.."],
      star: ["....G....", "....G....", "...GHG...", "GGGGGGGGG", ".GGGGGGG.", "..GGGGG..", "..GG.GG..", ".GG...GG.", "GG.....GG"],
      coin: [".CCC.", "CGHGC", "CGGGC", "CGGGC", ".CCC."],
      gem: [".PPP.", "PHHHP", "PHHHP", ".PPP.", "..P.."],
      lock: ["..sss..", ".s...s.", ".s...s.", "GGGGGGG", "GGGGGGG", "GGKKKGG", "GGKKKGG", "GGGGGGG"],
      chev: ["ww....", ".ww...", "..ww..", "...ww.", "..ww..", ".ww...", "ww...."]
    };
    function draw(cv, name, scale, col) {
      var grid = GR[name]; if (!grid) return; var h = grid.length, w = grid[0].length, x = cv.getContext("2d");
      cv.width = w * scale; cv.height = h * scale; x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) { var ch = grid[yy].charAt(xx), c = col || PAL[ch]; if (!c || ch === "." || ch === " ") continue; x.fillStyle = c; x.fillRect(xx * scale, yy * scale, scale, scale); }
    }
    // Paint any [data-pix] canvases inside root: data-pix=name, data-s=scale, data-col=override
    function paint(root) {
      $all("canvas[data-pix]", root).forEach(function (cv) { draw(cv, cv.getAttribute("data-pix"), +cv.getAttribute("data-s") || 2, cv.getAttribute("data-col") || null); });
    }
    return { draw: draw, paint: paint };
  })();

  /* ---------------- HOME / dashboard ---------------- */
  function renderHome() {
    var lp = levelProgress(progress.xp);
    $("#level-num").textContent = lp.level;
    $("#rank-name").textContent = rankName(lp.level);
    $("#xp-text").textContent = progress.xp + " XP";
    $("#level-ring-fg").style.strokeDashoffset = String(RING_C * (1 - lp.frac));

    var det = streakDetail(), streak = det.streak;
    $("#streak-num").textContent = streak;
    $(".streak-pill").classList.toggle("is-lit", streak > 0);
    $("#streak-freeze").hidden = !(det.freezeReady && streak > 0);

    var xf = $("#xp-fill"); if (xf) xf.style.width = clamp(lp.frac * 100, 3, 100) + "%";
    var hc = $("#hub-coins"); if (hc) hc.textContent = progress.coins || 0;
    var hg = $("#hub-gems"); if (hg) hg.textContent = progress.gems || 0;

    var goal = progress.settings.dailyGoal, done = (progress.days[dayKey(0)] || {}).q || 0;
    $("#daily-goal").textContent = goal;
    $("#daily-done").textContent = Math.min(done, goal);
    renderDailyPips(goal, Math.min(done, goal));
    var msg;
    if (done >= goal) msg = "Goal smashed today! 🎉 Come back tomorrow to grow your streak.";
    else if (done > 0) msg = "Nice start — " + (goal - done) + " more to hit today's goal!";
    else msg = "Start your Daily Quest to keep your streak alive!";
    if (streak > 0 && !det.todayMet) {
      msg += det.freezeReady
        ? "  ❄️ Streak freeze is ready — one missed day is okay."
        : "  🔥 Practise today to keep your " + streak + "-day streak!";
    }
    $("#daily-msg").textContent = msg;
    $("#cta-sub").textContent = clamp(goal, 10, 25) + " questions · " + focusLabel();
    var bs = $("#badge-sub"); if (bs && typeof BADGES !== "undefined") { var earned = BADGES.filter(function (b) { try { return b.test(); } catch (e) { return false; } }).length; bs.textContent = earned + " of " + BADGES.length + " earned"; }
    paintQuestMap();
    drawHubAvatar();
    Pix.paint($(".screen--home"));
  }
  function paintQuestMap() {
    var lab = $("#hub-worldlab"); if (lab) { var cur = clamp(progress.worldsUnlocked || 1, 1, 8); lab.textContent = "WORLD " + cur + " · " + HUB_WORLDS[cur - 1][0]; }
    var cv = $("#hub-questmap"); if (!cv || !window.__adv || !window.__adv.drawQuestMap) return;
    var wrap = cv.parentElement, dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = wrap.clientWidth || 340, h = wrap.clientHeight || 150;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    try { window.__adv.drawQuestMap(cv); } catch (e) {}
  }
  var HUB_WORLDS = [["MEADOW", "#7cd04a"], ["BEACH", "#f0d78a"], ["CANDY", "#ffb0d8"], ["OCEAN", "#38b6ff"], ["SNOW", "#dfeeff"], ["JUNGLE", "#5abf5a"], ["VOLCANO", "#ff7a3f"], ["SPACE", "#5a4a9a"]];
  function renderHubRibbon() {
    var wc = $("#hub-worlds"); if (!wc) return; wc.innerHTML = "";
    var cur = clamp(progress.worldsUnlocked || 1, 1, 8);
    HUB_WORLDS.forEach(function (wd, i) {
      var n = i + 1, st = n < cur ? "done" : (n === cur ? "cur" : "lock");
      var d = el("div", "world " + st);
      var badge = st === "done" ? '<span class="world__b world__b--done">✓</span>'
        : st === "cur" ? '<span class="world__b world__b--cur">★</span>' : "";
      d.innerHTML = '<div class="world__tile" style="background:' + wd[1] + '"></div>' + badge +
        '<div class="world__nm">' + (st === "cur" ? wd[0] : "") + "</div>";
      wc.appendChild(d);
    });
    var lab = $("#hub-worldlab"); if (lab) lab.textContent = "WORLD " + cur + " · " + HUB_WORLDS[cur - 1][0] + " ›";
  }
  function renderDailyPips(goal, done) {
    var pc = $("#daily-pips"); if (!pc) return; pc.innerHTML = "";
    var n = clamp(goal, 5, 30);
    for (var i = 0; i < n; i++) { var s = el("i", i < done ? "on" : ""); pc.appendChild(s); }
  }
  function drawHubAvatar() {
    var c = $("#ps-av-c"); if (!c || !window.__adv || !window.__adv.drawHero) return;
    try { window.__adv.drawHero(c, (progress && progress.hero) || "unicorn", true); } catch (e) {}
  }

  function focusTables() {
    var f = progress.settings.focusTables;
    return (Array.isArray(f) && f.length) ? f.slice().sort(function (a, b) { return a - b; }) : allTables();
  }
  function focusLabel() {
    var f = focusTables();
    if (f.length === MAX) return "all tables";
    // contiguous range?
    var contiguous = f.every(function (v, i) { return i === 0 || v === f[i - 1] + 1; });
    if (contiguous && f.length > 1) return "tables " + f[0] + "–" + f[f.length - 1];
    if (f.length === 1) return "just the " + f[0] + "s";
    return f.length + " tables";
  }

  /* ---------------- LEARN ---------------- */
  function buildLearn() {
    var g = $("#learn-picker"); g.innerHTML = "";
    for (var i = 1; i <= MAX; i++) (function (n) {
      var b = el("button", "num-btn", String(n));
      b.addEventListener("click", function () { sTap(); showTable(n); });
      g.appendChild(b);
    })(i);
  }
  function showTable(n) {
    var list = $("#learn-table"); list.innerHTML = "";
    for (var i = 1; i <= MAX; i++) {
      var row = el("div", "table-row"); row.style.animationDelay = (i * 0.03) + "s";
      row.appendChild(el("span", null, n + " × " + i));
      row.appendChild(el("span", "eq", "="));
      row.appendChild(el("span", "res", String(n * i)));
      list.appendChild(row);
    }
    list.hidden = false;
    list.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- multi pickers ---------------- */
  function buildMulti(gridId, arr, onChange) {
    var g = $(gridId); g.innerHTML = "";
    for (var i = 1; i <= MAX; i++) (function (n) {
      var b = el("button", "num-btn", String(n)); b.setAttribute("data-n", n);
      b.addEventListener("click", function () {
        sTap(); var k = arr.indexOf(n);
        if (k >= 0) { arr.splice(k, 1); b.classList.remove("is-selected"); }
        else { arr.push(n); b.classList.add("is-selected"); }
        onChange();
      });
      g.appendChild(b);
    })(i);
  }
  function syncPicker(gridId, arr) {
    $all(".num-btn", $(gridId)).forEach(function (b) {
      b.classList.toggle("is-selected", arr.indexOf(parseInt(b.getAttribute("data-n"), 10)) >= 0);
    });
  }

  /* ---------------- question building (adaptive) ---------------- */
  function weightFor(a, b) {
    var f = getFact(a, b);
    if (f.n === 0) return 3.2;
    var acc = f.c / f.n;
    return 1 + 3 * (1 - acc);
  }
  function buildQuestions(tables, len) {
    var pool = [];
    tables.forEach(function (t) { for (var b = 1; b <= MAX; b++) pool.push({ a: t, b: b, w: weightFor(t, b) }); });
    var out = [], last = "";
    for (var i = 0; i < len; i++) {
      var tot = 0, j; for (j = 0; j < pool.length; j++) tot += pool[j].w;
      var r = Math.random() * tot, chosen = pool[0];
      for (j = 0; j < pool.length; j++) { r -= pool[j].w; if (r <= 0) { chosen = pool[j]; break; } }
      if (chosen.a + "x" + chosen.b === last && pool.length > 1) { i--; continue; }
      last = chosen.a + "x" + chosen.b;
      out.push({ a: chosen.a, b: chosen.b });
    }
    return out;
  }
  function weakFacts(limit) {
    var seen = {}, list = [];
    for (var a = 1; a <= MAX; a++) for (var b = a; b <= MAX; b++) {
      var f = getFact(a, b); if (f.n < 1) continue;
      var acc = f.c / f.n; if (acc >= 0.95) continue;
      list.push({ a: a, b: b, acc: acc, n: f.n });
    }
    list.sort(function (x, y) { return x.acc - y.acc || y.n - x.n; });
    var out = list.slice(0, limit).map(function (o) { return { a: o.a, b: o.b }; });
    while (out.length < limit) { out.push({ a: randInt(MAX) + 1, b: randInt(MAX) + 1 }); }
    return shuffle(out);
  }
  // When "missing-number gates" is on, tag ~40% of a deck's questions to hide a factor (5 × ? = 25).
  function seedMissing(deck) {
    if (progress.settings.missingFactor) deck.forEach(function (q, i) { if (i > 0 && Math.random() < 0.4) q.hide = Math.random() < 0.5 ? "a" : "b"; });
    return deck;
  }

  /* ---------------- recording ---------------- */
  function recordAnswer(a, b, correct, ms) {
    var key = factKey(a, b), f = progress.facts[key] || { n: 0, c: 0, ms: 0 };
    f.n++; if (correct) f.c++; f.ms += ms; progress.facts[key] = f;

    progress.totalQ++; progress.totalMs += ms;
    if (correct) progress.totalCorrect++;
    if (correct && ms < 3000) progress.fastCount++;
    progress.recent.push(correct ? 1 : 0); if (progress.recent.length > 100) progress.recent.shift();

    var dk = dayKey(0), d = progress.days[dk] || { q: 0, c: 0, ms: 0 };
    var goal = progress.settings.dailyGoal, wasMet = d.q >= goal;
    d.q++; if (correct) d.c++; d.ms += ms; progress.days[dk] = d;
    var justMet = !wasMet && d.q >= goal;
    if (justMet) {
      progress.xp += 25; // daily goal bonus
      progress.bestStreak = Math.max(progress.bestStreak || 0, currentStreak());
      if (state.play) { state.play.xpEarned += 25; state.play.goalJustMet = true; }
    }
    save();
    return justMet;
  }

  /* ---- gentle wrong-answer coaching: nudge toward the answer, never just hand it over ---- */
  function countByStr(step, times) { var s = []; for (var i = 1; i <= times; i++) s.push(step * i); return s.join(", "); }
  function skipCountReveal(a, b) { var lo = Math.min(a, b), hi = Math.max(a, b); return a + " × " + b + " → count by " + lo + "s: " + countByStr(lo, hi) + " = " + (a * b); }
  function mathHint(a, b, guess) {
    var ans = a * b, lo = Math.min(a, b);
    if (guess === a * (b - 1) || guess === (a - 1) * b) return "So close — one too few! Add another " + lo + " ⬆";
    if (guess === a * (b + 1) || guess === (a + 1) * b) return "Almost — one too many! Take a " + lo + " away ⬇";
    if (guess > ans) return "A little too high — count back down ⬇";
    return "A little too low — count up a bit ⬆";
  }

  /* ---------------- PLAY engine ---------------- */
  function startPlay(opts) {
    // opts: {tables, len, mode, isDaily, questions, practice}
    state.lastStart = opts;
    var questions = opts.questions ? opts.questions.slice() : buildQuestions(opts.tables, opts.len);
    state.play = {
      mode: opts.mode, isDaily: !!opts.isDaily, practice: !!opts.practice,
      questions: questions, total: questions.length,
      i: 0, correct: 0, xpEarned: 0, combo: 0, maxCombo: 0, typed: "", answered: false, qStart: 0,
      levelBefore: levelFromXp(progress.xp), goalJustMet: false,
    };
    // ui mode
    $("#keypad").hidden = opts.mode !== "type";
    $("#answer-box").hidden = opts.mode !== "type";
    $("#play-answers").hidden = opts.mode !== "choose";
    $("#timerbar").hidden = !!opts.practice; // relaxed: no timer in practice
    show("play");
    renderQuestion();
  }
  var timerLowT = null;
  function startTimer() {
    var fill = $("#timerbar-fill");
    fill.style.transition = "none"; fill.style.width = "100%"; fill.classList.remove("low");
    void fill.offsetWidth;
    fill.style.transition = "width 6s linear"; fill.style.width = "0%";
    if (timerLowT) clearTimeout(timerLowT);
    timerLowT = setTimeout(function () { fill.classList.add("low"); }, 4000);
  }
  function renderQuestion() {
    var p = state.play, q = p.questions[p.i];
    p.answered = false; p.typed = ""; p.qStart = Date.now();
    $("#play-question").textContent = q.a + " × " + q.b;
    $("#play-counter").textContent = (p.i + 1) + " / " + p.total;
    $("#play-xp").textContent = "✦ " + p.xpEarned + " XP";
    $("#play-bar").style.width = (p.i / p.total * 100) + "%";
    $("#play-feedback").textContent = ""; $("#play-feedback").className = "feedback";
    var combo = $("#combo"); if (p.combo >= 2) { combo.hidden = false; $("#combo-num").textContent = p.combo; } else combo.hidden = true;
    $("#answer-box").className = "answer-box";
    updateDisplay();
    if (p.mode === "choose") renderChoices(q.a * q.b);
    if (!p.practice) startTimer();
  }
  function updateDisplay() {
    var d = $("#answer-display"), p = state.play;
    if (p.typed === "") { d.textContent = "?"; d.classList.add("placeholder"); }
    else { d.textContent = p.typed; d.classList.remove("placeholder"); }
  }
  function renderChoices(answer) {
    var wrap = $("#play-answers"); wrap.innerHTML = "";
    var opts = [answer], guard = 0;
    while (opts.length < 4 && guard++ < 60) {
      var cand = answer + (randInt(11) - 5);
      if (cand === answer) cand = answer + (randInt(2) ? 1 : -1) * (randInt(3) + 1);
      if (cand < 0) cand = answer + randInt(6) + 1;
      if (opts.indexOf(cand) < 0) opts.push(cand);
    }
    var ex = 1; while (opts.length < 4) { if (opts.indexOf(answer + ex) < 0) opts.push(answer + ex); ex++; }
    shuffle(opts).forEach(function (o) {
      var b = el("button", "answer", String(o));
      b.addEventListener("click", function () { submit(o, b); });
      wrap.appendChild(b);
    });
  }
  function keypad(k) {
    var p = state.play; if (!p || p.answered) return;
    if (k === "del") { p.typed = p.typed.slice(0, -1); updateDisplay(); return; }
    if (k === "enter") { if (p.typed !== "") submit(parseInt(p.typed, 10), null); return; }
    if (p.typed.length >= 3) return;
    if (p.typed === "" && k === "0") return;
    p.typed += k; updateDisplay();
    var ans = p.questions[p.i].a * p.questions[p.i].b;
    if (parseInt(p.typed, 10) === ans) submit(ans, null); // instant correct
  }
  function submit(chosen, btn) {
    var p = state.play; if (p.answered) return; p.answered = true;
    if (timerLowT) clearTimeout(timerLowT);
    var q = p.questions[p.i], answer = q.a * q.b, ms = Date.now() - p.qStart, correct = chosen === answer;

    recordAnswer(q.a, q.b, correct, ms);

    var base = 10, speed = ms < 1500 ? 8 : ms < 3000 ? 5 : ms < 5000 ? 2 : 0;
    var fb = $("#play-feedback");
    if (correct) {
      p.correct++; p.combo++; p.maxCombo = Math.max(p.maxCombo, p.combo);
      var mult = 1 + Math.min(p.combo, 6) * 0.08;
      var gained = Math.round((base + speed) * mult);
      progress.xp += gained; p.xpEarned += gained; save();
      $("#play-xp").textContent = "✦ " + p.xpEarned + " XP";
      fb.textContent = "+" + gained + (speed >= 5 ? " ⚡️" : "") + (p.combo >= 3 ? "  x" + p.combo + " combo!" : "");
      fb.className = "feedback good";
      if (p.mode === "type") $("#answer-box").classList.add("good");
      else if (btn) btn.classList.add("is-correct");
      sGood(); haptic(12);
    } else {
      p.combo = 0;
      fb.textContent = p.mode === "type" ? skipCountReveal(q.a, q.b) : (q.a + " × " + q.b + " = " + answer);
      fb.className = p.mode === "type" ? "feedback bad reveal" : "feedback bad";
      if (p.mode === "type") { $("#answer-box").classList.add("bad"); $("#answer-display").textContent = String(answer); $("#answer-display").classList.remove("placeholder"); }
      else if (btn) { btn.classList.add("is-wrong"); $all(".answer", $("#play-answers")).forEach(function (b) { if (parseInt(b.textContent, 10) === answer) b.classList.add("is-correct"); }); }
      sBad(); haptic([12, 40, 12]);
    }
    if (p.mode === "choose") $all(".answer", $("#play-answers")).forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      p.i++;
      if (p.i >= p.total) finishPlay();
      else renderQuestion();
    }, correct ? 620 : 1900);
  }
  function finishPlay() {
    var p = state.play;
    var acc = p.total ? p.correct / p.total : 0, perfect = p.correct === p.total;
    if (perfect && p.total >= 10) { progress.xp += 20; p.xpEarned += 20; }
    save();

    var newly = evaluateBadges({ perfect: perfect, quizLen: p.total });
    save();

    $("#play-bar").style.width = "100%";
    // results
    var stars = acc >= 1 ? 3 : acc >= 0.8 ? 2 : acc >= 0.6 ? 1 : 0;
    $("#results-score").textContent = p.correct + " / " + p.total;
    var row = ""; for (var i = 0; i < 3; i++) row += i < stars ? "⭐️" : "☆";
    $("#results-stars").textContent = row;
    $("#results-xp").textContent = "+" + p.xpEarned;
    $("#results-acc").textContent = Math.round(acc * 100) + "%";
    $("#results-streak").textContent = currentStreak();

    var levelNow = levelFromXp(progress.xp), leveled = levelNow > p.levelBefore;
    var uw = $("#badge-unlocks"); uw.innerHTML = "";
    if (leveled) { var lv = el("div", "badge-pop", "🌟 Level " + levelNow + "!"); uw.appendChild(lv); }
    newly.forEach(function (b, k) { var e = el("div", "badge-pop", b.icon + " " + b.name); e.style.animationDelay = (0.1 + k * 0.1) + "s"; uw.appendChild(e); });

    var title, msg;
    if (perfect) { title = "PERFECT! 🏆"; msg = "Every single one correct. Incredible!"; }
    else if (acc >= 0.8) { title = "Awesome! 🌟"; msg = "So close to perfect — brilliant work!"; }
    else if (acc >= 0.6) { title = "Well done! 💪"; msg = "You're getting stronger every day. Keep going!"; }
    else { title = "Good effort! 🙌"; msg = "Tricky ones today — practice will crack them!"; }
    if (p.practice) { title = perfect ? "Practice done! 🌟" : "Practice done! 👏"; msg = "Nice practising — every go makes it stick."; }
    if (p.goalJustMet) msg = "🔥 Daily goal complete! " + msg;
    $("#results-title").textContent = title; $("#results-msg").textContent = msg;

    show("results");
    if (leveled) { sLevel(); burst(); }
    else if (stars >= 2) { sWin(); burst(); }
    else if (stars === 1) sGood();
    if (stars >= 2 || leveled) haptic([15, 60, 15, 60, 15]);
  }
  function burst() {
    var host = $("#results-burst"); host.innerHTML = "";
    var pal = ["#5b3df0", "#ff3d81", "#ffb020", "#12c8d6", "#27c96a", "#8a5bff"];
    for (var i = 0; i < 60; i++) {
      var c = el("span", "confetti");
      c.style.left = randInt(100) + "%"; c.style.background = pal[randInt(pal.length)];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + "s";
      c.style.animationDelay = (Math.random() * 0.4) + "s";
      c.style.transform = "rotate(" + randInt(360) + "deg)";
      host.appendChild(c);
    }
    setTimeout(function () { host.innerHTML = ""; }, 3800);
  }

  /* ---------------- PRACTICE (typed, relaxed) ---------------- */
  function startPractice(deck) {
    // relaxed: type the answer, no timer; covers the deck once
    startPlay({ questions: shuffle(deck.slice()), mode: "type", practice: true });
  }

  /* ---------------- BADGES screen ---------------- */
  function renderBadges() {
    $("#hs-level").textContent = levelFromXp(progress.xp);
    $("#hs-streak").textContent = currentStreak();
    $("#hs-best").textContent = bestStreak();
    var grid = $("#badge-grid"); grid.innerHTML = "";
    BADGES.forEach(function (b) {
      var got = !!progress.badges[b.id];
      var cell = el("div", "badge" + (got ? "" : " locked"));
      cell.appendChild(el("div", "badge__icon", got ? b.icon : "🔒"));
      cell.appendChild(el("div", "badge__name", b.name));
      cell.appendChild(el("div", "badge__desc", b.desc));
      grid.appendChild(cell);
    });
  }

  /* ---------------- PARENT report ---------------- */
  function openParent() {
    if (state.parentUnlocked) { show("parent"); showReport(); return; }
    $("#gate-input").value = ""; $("#gate-err").hidden = true;
    $("#gate-email").textContent = Auth.email() || "";
    $("#parent-gate").hidden = false; $("#parent-report").hidden = true;
    show("parent");
    setTimeout(function () { $("#gate-input").focus(); }, 300);
  }
  function tryGate() {
    if (navigator.webdriver && !Auth.signedIn()) { state.parentUnlocked = true; $("#parent-gate").hidden = true; showReport(); return; }  // local test mode
    var pw = $("#gate-input").value; if (!pw) return;
    var b = $("#gate-go"), lbl = b.textContent; b.disabled = true; b.textContent = "…"; $("#gate-err").hidden = true;
    Auth.verify(pw).then(function (res) {
      b.textContent = lbl; b.disabled = false;
      if (res && res.ok) { state.parentUnlocked = true; $("#parent-gate").hidden = true; showReport(); }
      else { $("#gate-err").textContent = res && res.error === "offline" ? "No connection — try again." : "Wrong password — try again."; $("#gate-err").hidden = false; $("#gate-input").value = ""; $("#gate-input").focus(); }
    });
  }
  function accColor(acc, n) {
    if (n === 0 || acc == null) return "var(--line)";
    if (acc < 0.5) return "#ff6b6b"; if (acc < 0.7) return "#ffa94d";
    if (acc < 0.85) return "#ffd43b"; if (acc < 0.95) return "#51cf66"; return "#2f9e44";
  }
  function showReport() {
    $("#parent-report").hidden = false;
    var who = activeProfile();
    $("#rep-who").textContent = who ? (who.avatar + "  Showing " + who.name + "'s progress") : "";
    renderPlayers();
    var acc = progress.totalQ ? progress.totalCorrect / progress.totalQ : 0;
    $("#rep-acc").textContent = Math.round(acc * 100) + "%";
    $("#rep-total").textContent = progress.totalQ;
    $("#rep-time").textContent = Math.round(progress.totalMs / 60000) + "m";
    $("#rep-streak").textContent = currentStreak();

    // activity last 7 days
    var act = $("#rep-activity"); act.innerHTML = "";
    var goal = progress.settings.dailyGoal, maxQ = goal, activeDays = 0;
    for (var o = 6; o >= 0; o--) { var d = progress.days[dayKey(o)]; if (d) maxQ = Math.max(maxQ, d.q); }
    for (o = 6; o >= 0; o--) {
      var dd = progress.days[dayKey(o)] || { q: 0 }; if (dd.q > 0) activeDays++;
      var col = el("div", "act-col");
      var bar = el("div", "act-bar" + (dd.q >= goal ? " met" : dd.q === 0 ? " zero" : ""));
      bar.style.height = Math.max(3, dd.q / maxQ * 78) + "px";
      bar.title = dd.q + " questions";
      col.appendChild(bar);
      col.appendChild(el("div", "act-day", weekdayLetter(o)));
      act.appendChild(col);
    }
    $("#rep-active-note").textContent = activeDays + " of the last 7 days practised · goal is " + goal + "/day.";

    // per-table accuracy
    var tb = $("#rep-tablebars"); tb.innerHTML = "";
    for (var t = 1; t <= MAX; t++) {
      var n = 0, c = 0;
      for (var b = 1; b <= MAX; b++) { var f = getFact(t, b); n += f.n; c += f.c; }
      var a2 = n ? c / n : null;
      var rowEl = el("div", "tbar");
      rowEl.appendChild(el("div", "tbar__n", t + "×"));
      var track = el("div", "tbar__track"), fill = el("div", "tbar__fill");
      fill.style.width = (a2 == null ? 0 : Math.round(a2 * 100)) + "%";
      fill.style.background = accColor(a2, n);
      track.appendChild(fill); rowEl.appendChild(track);
      rowEl.appendChild(el("div", "tbar__pct", n ? Math.round(a2 * 100) + "% (" + n + ")" : "—"));
      tb.appendChild(rowEl);
    }

    // tricky facts
    var tricky = []; for (var x = 1; x <= MAX; x++) for (var y = x; y <= MAX; y++) {
      var ff = getFact(x, y); if (ff.n >= 3) tricky.push({ a: x, b: y, acc: ff.c / ff.n, n: ff.n });
    }
    tricky.sort(function (m, n2) { return m.acc - n2.acc || n2.n - m.n; });
    var tw = $("#rep-tricky"); tw.innerHTML = "";
    var weak = tricky.filter(function (o) { return o.acc < 0.85; }).slice(0, 8);
    if (!weak.length) { tw.appendChild(el("div", "tricky--none", tricky.length ? "No weak spots — she's doing great! 🎉" : "Not enough data yet — play a few rounds.")); }
    else weak.forEach(function (o) {
      var it = el("div", "tricky__item");
      it.appendChild(el("div", "tricky__fact", o.a + " × " + o.b));
      it.appendChild(el("div", "tricky__pct", Math.round(o.acc * 100) + "% · " + o.n + " tries"));
      tw.appendChild(it);
    });
    var pw = $("#rep-practice-weak"); if (pw) pw.hidden = !weak.length;

    // heatmap 13x13
    var hm = $("#rep-heatmap"); hm.innerHTML = "";
    hm.appendChild(el("div", "hm-cell hm-head", ""));
    for (var h = 1; h <= MAX; h++) hm.appendChild(el("div", "hm-cell hm-head", String(h)));
    for (var r = 1; r <= MAX; r++) {
      hm.appendChild(el("div", "hm-cell hm-head", String(r)));
      for (var cc = 1; cc <= MAX; cc++) {
        var fh = getFact(r, cc), ah = fh.n ? fh.c / fh.n : null;
        var cell = el("div", "hm-cell");
        cell.style.background = accColor(ah, fh.n);
        cell.title = r + "×" + cc + ": " + fh.c + "/" + fh.n;
        hm.appendChild(cell);
      }
    }

    renderMastery(); renderInsight(); renderTrend(); renderFluency();

    $("#goal-value").textContent = progress.settings.dailyGoal;
    $("#freeze-toggle").setAttribute("aria-checked", progress.settings.streakFreeze !== false ? "true" : "false");
    var mt = $("#missing-toggle"); if (mt) mt.setAttribute("aria-checked", progress.settings.missingFactor ? "true" : "false");
    renderFocusPicker();
  }
  function renderFocusPicker() {
    var grid = $("#focus-picker"); grid.innerHTML = "";
    var sel = progress.settings.focusTables;
    for (var i = 1; i <= MAX; i++) (function (n) {
      var b = el("button", "mini-btn" + (sel.indexOf(n) >= 0 ? " is-on" : ""), String(n));
      b.addEventListener("click", function () {
        sTap();
        var arr = progress.settings.focusTables, k = arr.indexOf(n);
        if (k >= 0) { if (arr.length > 1) arr.splice(k, 1); } // keep at least one
        else arr.push(n);
        arr.sort(function (x, y) { return x - y; });
        save(); renderFocusPicker(); renderHome();
      });
      grid.appendChild(b);
    })(i);
  }
  function setFocus(arr) { progress.settings.focusTables = arr.slice(); save(); renderFocusPicker(); renderHome(); }

  /* ---- richer parent insights: mastery, fluency, plain-language, weekly trend ---- */
  function factLevel(a, b) {
    var f = getFact(a, b);
    if (f.n === 0) return "unseen";
    if (f.n < 2) return "learning";
    var acc = f.c / f.n, avg = f.ms / f.n;
    if (acc >= 0.85) return avg <= 3200 ? "fluent" : "solid";   // solid = right but slow
    if (acc >= 0.6) return "learning";
    return "weak";
  }
  function masteryStats() {
    var mastered = 0, fluent = 0;
    for (var r = 1; r <= MAX; r++) for (var c = 1; c <= MAX; c++) { var lv = factLevel(r, c); if (lv === "fluent") { fluent++; mastered++; } else if (lv === "solid") mastered++; }
    var slow = [];
    for (var a = 1; a <= MAX; a++) for (var b = a; b <= MAX; b++) { if (factLevel(a, b) === "solid") { var f = getFact(a, b); slow.push({ a: a, b: b, avg: f.ms / f.n }); } }
    slow.sort(function (x, y) { return y.avg - x.avg; });
    var full = [];
    for (var t = 1; t <= MAX; t++) { var ok = true; for (var k = 1; k <= MAX; k++) { var l = factLevel(t, k); if (l !== "fluent" && l !== "solid") { ok = false; break; } } if (ok) full.push(t); }
    return { mastered: mastered, fluent: fluent, slow: slow, full: full, total: MAX * MAX };
  }
  function listJoin(arr) { if (!arr.length) return ""; if (arr.length === 1) return arr[0]; if (arr.length === 2) return arr[0] + " and " + arr[1]; return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1]; }
  function tableStats() { var out = []; for (var t = 1; t <= MAX; t++) { var n = 0, c = 0; for (var b = 1; b <= MAX; b++) { var f = getFact(t, b); n += f.n; c += f.c; } out.push({ t: t, n: n, acc: n ? c / n : null }); } return out; }
  function trickiestFact() { var best = null; for (var x = 1; x <= MAX; x++) for (var y = x; y <= MAX; y++) { var f = getFact(x, y); if (f.n >= 3) { var a = f.c / f.n; if (!best || a < best.acc) best = { a: x, b: y, acc: a, n: f.n }; } } return best; }
  function weekAgg(startOff) { var q = 0, c = 0; for (var o = startOff; o < startOff + 7; o++) { var d = progress.days[dayKey(o)]; if (d) { q += d.q || 0; c += d.c || 0; } } return { q: q, c: c, acc: q ? c / q : null }; }

  function renderMastery() {
    var box = $("#rep-mastery"); if (!box) return;
    var m = masteryStats(), pct = Math.round(m.mastered / m.total * 100);
    var tables = m.full.length ? m.full.map(function (t) { return t + "s"; }).join(", ") : "none yet — keep going!";
    box.innerHTML =
      '<div class="mst-head"><span class="mst-big">' + m.mastered + '</span><span class="mst-of">of ' + m.total + ' facts<br>mastered</span></div>' +
      '<div class="mst-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="mst-tags"><span class="mst-tag mst-tag--fast">⚡ ' + m.fluent + ' fast &amp; fluent</span>' +
      '<span class="mst-tag mst-tag--full">✅ Tables aced: ' + tables + '</span></div>';
  }
  function renderInsight() {
    var box = $("#rep-insight"); if (!box) return;
    var who = activeProfile(), name = who ? who.name : "Your child";
    if (progress.totalQ < 15) { box.innerHTML = '<span class="insight-i">💡</span><p>Keep playing! After a few more rounds, ' + name + "'s clear strengths and tricky spots will show up right here.</p>"; return; }
    var ts = tableStats().filter(function (o) { return o.n >= 5 && o.acc != null; });
    ts.sort(function (x, y) { return y.acc - x.acc; });
    var strong = ts.slice(0, 2).filter(function (o) { return o.acc >= 0.8; }).map(function (o) { return o.t + "s"; });
    var weakT = ts.length ? ts[ts.length - 1] : null, trick = trickiestFact();
    var s = strong.length ? (name + " is strongest at the " + listJoin(strong) + ".") : (name + " is building a solid base.");
    if (weakT && weakT.acc < 0.8) { s += " The " + weakT.t + "s need the most work"; if (trick) s += " — " + trick.a + " × " + trick.b + " is the trickiest so far (" + Math.round(trick.acc * 100) + "% over " + trick.n + " tries)"; s += "."; }
    else if (trick && trick.acc < 0.72) { s += " Trickiest fact right now: " + trick.a + " × " + trick.b + " (" + Math.round(trick.acc * 100) + "%)."; }
    else { s += " No real weak spots right now — lovely work! 🎉"; }
    box.innerHTML = '<span class="insight-i">💡</span><p>' + s + '</p>';
  }
  function renderFluency() {
    var box = $("#rep-fluency"); if (!box) return;
    var m = masteryStats();
    if (!m.slow.length) { box.innerHTML = '<p class="rep-note">Nothing stuck in the slow lane — recall speed looks great! ⚡</p>'; return; }
    box.innerHTML = '<p class="rep-note">Known, but still slow to recall — a little speed practice locks these in:</p><div class="fluency-list">' +
      m.slow.slice(0, 10).map(function (o) { return '<span class="fchip">' + o.a + ' × ' + o.b + '</span>'; }).join("") + '</div>';
  }
  function renderTrend() {
    var box = $("#rep-trend"); if (!box) return;
    var tw = weekAgg(0), lw = weekAgg(7);
    if (tw.q + lw.q === 0 && weekAgg(14).q + weekAgg(21).q === 0) { box.innerHTML = '<p class="rep-note">Practice across a couple of weeks and the trend shows up here.</p>'; return; }
    function delta(a, b, suffix) { if (b == null) return ""; var d = Math.round(a - b); var cls = d > 0 ? "up" : d < 0 ? "down" : "flat", arrow = d > 0 ? "▲" : d < 0 ? "▼" : "•"; return '<span class="tr-delta tr-' + cls + '">' + arrow + " " + Math.abs(d) + suffix + " vs last wk</span>"; }
    var accNow = tw.acc == null ? "—" : Math.round(tw.acc * 100) + "%";
    var html = '<div class="tr-compare">';
    html += '<div class="tr-c"><b>' + tw.q + '</b><span>questions this week</span>' + (lw.q ? delta(tw.q, lw.q, "") : "") + '</div>';
    html += '<div class="tr-c"><b>' + accNow + '</b><span>accuracy this week</span>' + (lw.acc != null && tw.acc != null ? delta(tw.acc * 100, lw.acc * 100, "%") : "") + '</div>';
    html += '</div><div class="tr-bars">';
    for (var w = 3; w >= 0; w--) { var ag = weekAgg(w * 7), h = ag.acc == null ? 0 : Math.round(ag.acc * 100), lbl = w === 0 ? "now" : w + "w"; html += '<div class="tr-col"><div class="tr-bar' + (ag.q ? "" : " tr-empty") + '" style="height:' + Math.max(4, h * 0.6) + 'px"></div><span class="tr-p">' + (ag.q ? h + "%" : "—") + '</span><span class="tr-l">' + lbl + '</span></div>'; }
    html += '</div>';
    box.innerHTML = html;
  }

  /* ---------------- profiles UI ---------------- */
  function updatePlayerSwitch() {
    var p = activeProfile();
    $("#ps-name").textContent = p ? p.name : "Player";
    drawHubAvatar();
  }
  // A cosy pixel bedroom behind each player card — night window, poster, string lights, a rug,
  // all washed in that player's accent colour. The hero sprite is drawn on top (separate canvas).
  function drawHeroRoom(cv, accent, idx) {
    var g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
    var W = cv.width, H = cv.height, floorY = Math.round(H * 0.70);
    function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
    function hexA(h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
    R(0, 0, W, H, "#241d3a");                                                       // wall
    g.fillStyle = "rgba(255,255,255,.045)"; for (var yy = 9; yy < floorY; yy += 12) g.fillRect(0, yy, W, 1);
    for (var row = 0, yb = 0; yb < floorY; yb += 12, row++) for (var xb = (row % 2 ? 11 : 0); xb < W; xb += 22) g.fillRect(xb, yb, 1, 12);
    var wash = g.createLinearGradient(0, 0, 0, floorY); wash.addColorStop(0, hexA(accent, .16)); wash.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = wash; g.fillRect(0, 0, W, floorY);
    var wx = Math.round(W * 0.09), wy = Math.round(H * 0.15), ww = Math.round(W * 0.28), wh = Math.round(H * 0.34);   // night window
    R(wx - 3, wy - 3, ww + 6, wh + 6, "#3a2c1e"); R(wx, wy, ww, wh, "#0d1130");
    for (var s = 0; s < 12; s++) R(wx + (s * 17 + 3) % ww, wy + (s * 11 + 2) % wh, 1, 1, "#cdd6ff");
    R(wx + ww * 0.6, wy + wh * 0.2, 8, 8, "#eef0ff"); R(wx + ww * 0.58, wy + wh * 0.18, 4, 4, "#0d1130");            // crescent moon
    R(wx + ww / 2 - 1, wy, 2, wh, "#3a2c1e"); R(wx, wy + wh / 2 - 1, ww, 2, "#3a2c1e");
    var px = Math.round(W * 0.66), py = Math.round(H * 0.15), pw = Math.round(W * 0.2), ph = Math.round(H * 0.26);   // framed poster
    R(px - 2, py - 2, pw + 4, ph + 4, "#3a2c1e"); R(px, py, pw, ph, hexA(accent, .8)); R(px + pw * 0.28, py + ph * 0.3, pw * 0.44, ph * 0.4, "rgba(255,255,255,.5)");
    var LC = ["#ff6a7a", "#ffd23f", "#4aa8ff", "#3ad44a"]; for (var L = 0; L < 7; L++) R(4 + L * (W - 8) / 6, 5 + (L % 2 ? 3 : 0), 2, 2, LC[L % 4]);   // string lights
    R(0, floorY, W, H - floorY, "#3a2a1c"); R(0, floorY, W, 2, "#5a4530");           // wood floor
    for (var fx = 0; fx < W; fx += 20) R(fx, floorY, 1, H - floorY, "#2c2016");
    // arcade cabinet (left floor)
    var acx = 5, acy = floorY - 20, acw = 24, ach = H - acy - 3;
    R(acx, acy, acw, ach, "#17122b"); R(acx + 1, acy + 1, acw - 2, 1, "#2e2550");
    R(acx + 3, acy + 4, acw - 6, 9, "#05060f"); R(acx + 4, acy + 5, acw - 8, 7, hexA(accent, .85));   // screen
    R(acx + 5, acy + 6, 3, 2, "rgba(255,255,255,.7)");
    R(acx + 3, acy + 15, acw - 6, 3, "#241c40"); R(acx + 5, acy + 16, 2, 1, "#ff6a7a"); R(acx + 8, acy + 16, 2, 1, "#3ad44a"); // controls
    R(acx - 1, acy, 1, ach, hexA(accent, .5));
    // shelf + trophy (right floor)
    var shx = W - 30, shy = floorY - 6;
    R(shx, shy, 24, 2, "#5a4530");                                                    // shelf
    R(shx + 9, shy - 9, 5, 3, "#ffd23f"); R(shx + 10, shy - 6, 3, 4, "#ffd23f"); R(shx + 8, shy - 2, 7, 2, "#e0b52e"); // trophy
    R(shx + 2, shy - 6, 3, 6, "#ff6a7a"); R(shx + 18, shy - 5, 3, 5, "#4aa8ff");       // little books
    g.fillStyle = accent; g.globalAlpha = .5; g.beginPath(); g.ellipse(W / 2, H * 0.87, W * 0.34, H * 0.1, 0, 0, 7); g.fill();
    g.globalAlpha = .85; g.beginPath(); g.ellipse(W / 2, H * 0.87, W * 0.23, H * 0.066, 0, 0, 7); g.fill(); g.globalAlpha = 1;   // rug
    var warm = g.createRadialGradient(W * 0.83, H * 0.58, 2, W * 0.83, H * 0.58, W * 0.45); warm.addColorStop(0, "rgba(255,200,120,.25)"); warm.addColorStop(1, "rgba(255,200,120,0)"); g.fillStyle = warm; g.fillRect(0, 0, W, H);
    var vg = g.createRadialGradient(W / 2, H * 0.5, H * 0.28, W / 2, H * 0.5, H * 0.8); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.52)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function renderProfiles() {
    var grid = $("#profiles-grid"); grid.innerHTML = "";
    var ACC = ["#ffd23f", "#a06bff", "#37e0ff", "#3ad44a", "#ff7ac0", "#ff9f40"];
    reg.profiles.forEach(function (p, idx) {
      // read that profile's streak + chosen hero without disturbing the active one
      var streak = profileStreak(p.id), hero = profileHero(p.id), accent = ACC[idx % ACC.length];
      var card = el("button", "pcard"); card.style.setProperty("--pc", accent);
      card.appendChild(el("span", "pcard__tag", "P" + (idx + 1)));
      var stage = el("span", "pcard__stage");
      var room = document.createElement("canvas"); room.width = 172; room.height = 118; room.className = "pcard__room";
      var cv = document.createElement("canvas"); cv.width = 84; cv.height = 62; cv.className = "pcard__hero";
      stage.appendChild(room); stage.appendChild(cv); card.appendChild(stage);
      card.appendChild(el("span", "pcard__name", p.name));
      card.appendChild(el("span", "pcard__meta", streak > 0 ? "🔥 " + streak + " day streak" : "Ready to play!"));
      card.addEventListener("click", function () { sTap(); setActive(p.id); renderHome(); show("home"); });
      grid.appendChild(card);
      try { drawHeroRoom(room, accent, idx); } catch (e) {}
      try { window.__adv && window.__adv.drawHero && window.__adv.drawHero(cv, hero, true); } catch (e) {}
    });
    var add = el("button", "pcard pcard--add");
    add.appendChild(el("span", "pcard__av", "＋"));
    add.appendChild(el("span", "pcard__name", "Add a kid"));
    add.addEventListener("click", function () { sTap(); openProfileNew(false); });
    grid.appendChild(add);
  }
  function profileHero(id) {
    try { var raw = localStorage.getItem(pKey(id)); if (raw) { var p = JSON.parse(raw); return p.hero || "unicorn"; } } catch (e) {}
    return "unicorn";
  }
  function profileStreak(id) {
    // compute current streak for any profile by peeking at its stored data
    var days = null, goal = 20;
    try { var raw = localStorage.getItem(pKey(id)); if (raw) { var p = JSON.parse(raw); days = p.days || {}; goal = (p.settings && p.settings.dailyGoal) || 20; } } catch (e) {}
    if (!days) return 0;
    var met = function (k) { return days[k] && days[k].q >= goal; };
    var i = met(dayKey(0)) ? 0 : 1, s = 0;
    while (met(dayKey(i))) { s++; i++; }
    return s;
  }
  var newAvatar = AVATARS[0];
  function buildAvatarGrid() {
    var grid = $("#avatar-grid"); grid.innerHTML = "";
    AVATARS.forEach(function (av, idx) {
      var b = el("button", "av-btn" + (idx === 0 ? " is-on" : ""), av);
      b.addEventListener("click", function () {
        sTap(); newAvatar = av;
        $all(".av-btn", grid).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
      });
      grid.appendChild(b);
    });
  }
  function openProfileNew(isFirst) {
    newAvatar = AVATARS[0];
    buildAvatarGrid();
    $("#pn-name").value = "";
    $("#pn-create").disabled = true;
    $("#pn-back").style.visibility = isFirst ? "hidden" : "visible";
    $("#pn-title").textContent = isFirst ? "Create your player" : "New Player";
    show("profile-new");
    setTimeout(function () { $("#pn-name").focus(); }, 250);
  }
  function renderPlayers() {
    var wrap = $("#players-manage"); wrap.innerHTML = "";
    reg.profiles.forEach(function (p) {
      var row = el("div", "pm-row");
      row.appendChild(el("span", "pm-av", p.avatar));
      var nm = el("span", "pm-name", p.name);
      if (p.id === activeId) { var tag = el("span", "pm-active", "active"); nm.appendChild(tag); }
      row.appendChild(nm);
      var ren = el("button", "pm-btn", "Rename");
      ren.addEventListener("click", function () {
        var v = window.prompt("Rename kid:", p.name);
        if (v && v.trim()) { renameProfile(p.id, v.trim()); if (Auth.signedIn()) Auth.renameKid(p.id, v.trim()); renderPlayers(); updatePlayerSwitch(); }
      });
      row.appendChild(ren);
      if (reg.profiles.length > 1) {
        var del = el("button", "pm-btn pm-btn--del", "Remove");
        del.addEventListener("click", function () {
          if (window.confirm("Remove " + p.name + " and all their progress from the account? This can't be undone.")) {
            if (Auth.signedIn()) Auth.removeKid(p.id);
            deleteProfile(p.id); renderPlayers(); updatePlayerSwitch(); showReport();
          }
        });
        row.appendChild(del);
      }
      wrap.appendChild(row);
    });
  }

  /* ---------------- sign up / sign in (family account) ---------------- */
  function authErrMsg(e) {
    if (e === "email_taken") return "That email already has an account — sign in instead.";
    if (e === "bad_login") return "Wrong email or password.";
    if (e === "unconfirmed") return "Please confirm your email first (check your inbox), then sign in.";
    if (e === "weak_password") return "Password must be at least 6 characters.";
    if (e === "bad_email") return "That doesn't look like a valid email.";
    if (e === "offline") return "No internet connection — try again.";
    if (e === "no_session") return "Please sign in again.";
    return "Something went wrong — try again.";
  }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function afterSignedIn() {
    if (!reg.profiles.length) { openKids(true); return; }               // signed in but no kids yet
    if (reg.profiles.length === 1) { setActive(reg.profiles[0].id); renderHome(); show("home"); return; }
    renderProfiles(); show("profiles");                                  // let a kid pick themselves
  }

  // ----- SIGN IN -----
  function openSignin() {
    $("#si-email").value = ""; $("#si-pass").value = ""; $("#si-err").hidden = true; $("#si-msg").hidden = true; $("#si-go").disabled = true;
    show("signin"); setTimeout(function () { $("#si-email").focus(); }, 250);
  }
  function siValidate() { $("#si-go").disabled = !(validEmail($("#si-email").value.trim()) && $("#si-pass").value.length >= 6); }
  function siSubmit() {
    var email = $("#si-email").value.trim(), pass = $("#si-pass").value;
    if (!(validEmail(email) && pass.length >= 6)) return;
    $("#si-err").hidden = true; $("#si-msg").hidden = true;
    var b = $("#si-go"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
    Auth.login(email, pass).then(function (res) {
      b.textContent = lbl; siValidate();
      if (res && res.ok) { reg.profiles = []; activeId = null; reg.activeId = null; profilesSave(); pullAllKids(function () { afterSignedIn(); }); }
      else { $("#si-err").textContent = authErrMsg(res && res.error); $("#si-err").hidden = false; }
    });
  }
  function siForgot() {
    var email = $("#si-email").value.trim();
    if (!validEmail(email)) { $("#si-err").textContent = "Type your email above first, then tap Forgot password."; $("#si-err").hidden = false; return; }
    Auth.recover(email).then(function (res) {
      $("#si-err").hidden = true;
      $("#si-msg").textContent = res && res.ok ? "Reset link sent to " + email + " — check your inbox." : authErrMsg(res && res.error);
      $("#si-msg").hidden = false;
    });
  }

  // ----- SIGN UP (parent creds, then add kids) -----
  function openSignup() {
    $("#su-email").value = ""; $("#su-pass").value = ""; $("#su-pass2").value = ""; $("#su-err").hidden = true; $("#su-next").disabled = true;
    show("signup"); setTimeout(function () { $("#su-email").focus(); }, 250);
  }
  function suValidate() {
    var ok = validEmail($("#su-email").value.trim()) && $("#su-pass").value.length >= 6 && $("#su-pass").value === $("#su-pass2").value;
    $("#su-next").disabled = !ok;
  }
  function suSubmit() {
    var email = $("#su-email").value.trim(), pass = $("#su-pass").value;
    if (!(validEmail(email) && pass.length >= 6)) return;
    if (pass !== $("#su-pass2").value) { $("#su-err").textContent = "Passwords don't match."; $("#su-err").hidden = false; return; }
    $("#su-err").hidden = true;
    var b = $("#su-next"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
    Auth.signup(email, pass).then(function (res) {
      b.textContent = lbl; suValidate();
      if (res && res.ok && res.session) { reg.profiles = []; activeId = null; reg.activeId = null; profilesSave(); openKids(true); }
      else if (res && res.ok && res.needsConfirm) { $("#su-err").textContent = "Check your email to confirm your account, then come back and sign in."; $("#su-err").hidden = false; }
      else { $("#su-err").textContent = authErrMsg(res && res.error); $("#su-err").hidden = false; }
    });
  }

  // ----- ADD KIDS (signup step 2) -----
  var kidAvatar = AVATARS[0];
  function openKids(firstRun) {
    $("#kid-name").value = ""; kidAvatar = AVATARS[0]; buildKidAvatars();
    $("#kid-add").disabled = true; $("#kids-err").hidden = true;
    $("#kids-back").style.visibility = firstRun ? "hidden" : "visible";
    renderKidsList(); show("kids"); setTimeout(function () { $("#kid-name").focus(); }, 250);
  }
  function buildKidAvatars() {
    var grid = $("#kid-avatars"); grid.innerHTML = "";
    AVATARS.forEach(function (av) {
      var btn = el("button", "av-btn" + (av === kidAvatar ? " is-on" : ""), av);
      btn.addEventListener("click", function () { sTap(); kidAvatar = av; $all(".av-btn", grid).forEach(function (x) { x.classList.remove("is-on"); }); btn.classList.add("is-on"); });
      grid.appendChild(btn);
    });
  }
  function renderKidsList() {
    var list = $("#kids-list"); list.innerHTML = "";
    reg.profiles.forEach(function (p) {
      var row = el("div", "kid-added");
      row.appendChild(el("span", "kid-added__av", p.avatar));
      row.appendChild(el("span", "kid-added__name", p.name));
      list.appendChild(row);
    });
    $("#kids-done").disabled = reg.profiles.length === 0;
    $("#kids-count").textContent = reg.profiles.length ? (reg.profiles.length + (reg.profiles.length === 1 ? " kid added" : " kids added")) : "No kids yet — add at least one.";
  }
  function kidAddClick() {
    var name = $("#kid-name").value.trim(); if (!name) return;
    var b = $("#kid-add"), lbl = b.textContent; b.disabled = true; b.textContent = "…"; $("#kids-err").hidden = true;
    addKidRemote(name, kidAvatar, function (ok, id, err) {
      b.textContent = lbl;
      if (ok) { $("#kid-name").value = ""; kidAvatar = AVATARS[0]; buildKidAvatars(); renderKidsList(); $("#kid-name").focus(); }
      else { $("#kids-err").textContent = authErrMsg(err); $("#kids-err").hidden = false; b.disabled = false; }
    });
  }
  function kidsDone() {
    if (!reg.profiles.length) return;
    if (reg.profiles.length === 1) { setActive(reg.profiles[0].id); renderHome(); show("home"); }
    else { renderProfiles(); show("profiles"); }
  }

  // ----- RESET PASSWORD (arrived via the email link) -----
  function openReset() {
    $("#rp-pass").value = ""; $("#rp-pass2").value = ""; $("#rp-err").hidden = true; $("#rp-go").disabled = true;
    show("reset"); setTimeout(function () { $("#rp-pass").focus(); }, 250);
  }
  function rpValidate() { $("#rp-go").disabled = !($("#rp-pass").value.length >= 6 && $("#rp-pass").value === $("#rp-pass2").value); }
  function rpSubmit() {
    var pw = $("#rp-pass").value; if (pw.length < 6) return;
    if (pw !== $("#rp-pass2").value) { $("#rp-err").textContent = "Passwords don't match."; $("#rp-err").hidden = false; return; }
    $("#rp-err").hidden = true; var b = $("#rp-go"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
    Auth.updateUser({ password: pw }).then(function (res) {
      b.textContent = lbl; rpValidate();
      if (res && res.ok) { reg.profiles = []; activeId = null; reg.activeId = null; profilesSave(); pullAllKids(function () { afterSignedIn(); }); }
      else { $("#rp-err").textContent = res && res.error === "offline" ? "No connection — try again." : "Couldn't set the password — the reset link may have expired. Request a new one from the sign-in screen."; $("#rp-err").hidden = false; }
    });
  }

  // ----- ACCOUNT (change email / password) from the Grown-ups area -----
  function acErr(m) { $("#ac-err").textContent = m; $("#ac-err").hidden = false; $("#ac-msg").hidden = true; }
  function acMsg(m) { $("#ac-msg").textContent = m; $("#ac-msg").hidden = false; $("#ac-err").hidden = true; }
  function openAccount() {
    $("#ac-email").value = Auth.email() || "";
    $("#ac-newpass").value = ""; $("#ac-newpass2").value = "";
    $("#ac-msg").hidden = true; $("#ac-err").hidden = true;
    show("account");
  }
  function acEmailSave() {
    var email = $("#ac-email").value.trim(); if (!validEmail(email)) { acErr("That doesn't look like a valid email."); return; }
    var b = $("#ac-email-go"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
    Auth.updateUser({ email: email }).then(function (res) {
      b.textContent = lbl; b.disabled = false;
      if (res && res.ok) acMsg("Email change requested — check " + email + " (and your current inbox) to confirm.");
      else acErr(res && res.error === "offline" ? "No connection — try again." : "Couldn't update the email — try again.");
    });
  }
  function acPassSave() {
    var pw = $("#ac-newpass").value; if (pw.length < 6) { acErr("Password must be at least 6 characters."); return; }
    if (pw !== $("#ac-newpass2").value) { acErr("Passwords don't match."); return; }
    var b = $("#ac-pass-go"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
    Auth.updateUser({ password: pw }).then(function (res) {
      b.textContent = lbl; b.disabled = false;
      if (res && res.ok) { $("#ac-newpass").value = ""; $("#ac-newpass2").value = ""; acMsg("Password changed. ✓"); }
      else acErr(res && res.error === "offline" ? "No connection — try again." : "Couldn't change the password — try again.");
    });
  }
  /* ---- landing hero scene: STARLIGHT gallops through a living pixel world ----
     Self-contained canvas engine. Runs only while the landing screen is active
     and the tab is visible, so it never costs battery once a player signs in. */
  var LandingFX = (function () {
    var cvs, ctx, W = 0, H = 0, cell = 8, VW = 0, VH = 86, dpr = 1, GROUND = VH - 16;
    var running = false, t0 = null, reduce = false, inited = false;
    function active() { var s = document.querySelector(".screen--landing"); return !!(s && s.classList.contains("is-active")); }
    function resize() {
      if (!cvs) return; var r = cvs.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cell = H / VH; VW = W / cell;
    }
    function P(gx, gy, gw, gh, c) {
      var x0 = Math.round(gx * cell), y0 = Math.round(gy * cell);
      var x1 = Math.round((gx + gw) * cell), y1 = Math.round((gy + gh) * cell);
      ctx.fillStyle = c; ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
    var RB = ["#ff5a7a", "#ff9a3f", "#ffd23f", "#5fd06a", "#4aa8ff", "#a06bff"];
    var WT = "#ffffff", WS = "#e2e7ff", INK = "#241a4a", GOLD = "#ffd23f", GHI = "#fff2a8", GLO = "#c9930a";
    var PINK = "#ff9ecb", HOOF = "#b07be0", FOE = "#8b6cf0", FOED = "#5b3fc0";
    function cloud(cx, cy, s) { var c = "#ffffff"; P(cx, cy + 2 * s, 10 * s, 3 * s, c); P(cx + 2 * s, cy, 6 * s, 3 * s, c); P(cx + 1 * s, cy + 1 * s, 8 * s, 2 * s, c); ctx.globalAlpha = .5; P(cx + 1 * s, cy + 4 * s, 9 * s, 1 * s, "#d6e6ff"); ctx.globalAlpha = 1; }
    function hill(cx, baseY, w, h, top, side) { for (var i = 0; i < h; i++) { var t = i / h, ww = Math.round(w * Math.sqrt(1 - t * t)); P(cx - ww / 2, baseY - i - 1, ww, 1, i < 2 ? top : side); } }
    function bush(cx, baseY) { var g = "#57bf3a", d = "#3a9e2a"; P(cx, baseY - 2, 8, 2, g); P(cx + 1, baseY - 4, 3, 2, g); P(cx + 4, baseY - 3, 3, 1, g); P(cx, baseY - 1, 8, 1, d); }
    function coin(cx, cy, t) { var w = Math.abs(Math.cos(t)) * 4 + 1.4, x = cx - w / 2; P(x, cy, w, 6, GOLD); P(x, cy, w, 1.4, GHI); P(x, cy + 4.6, w, 1.4, GLO); if (w > 3) P(cx - 0.7, cy + 1.6, 1.4, 3, GLO); }
    function block(cx, cy, glyph) {
      P(cx, cy, 9, 9, "#e79a1e"); P(cx, cy, 9, 1.4, GHI); P(cx, cy + 7.6, 9, 1.4, "#a86a00"); P(cx + 0.6, cy + 0.6, 7.8, 7.8, "#ffb020");
      P(cx + 0.9, cy + 0.9, 1, 1, "#7a4a00"); P(cx + 7.1, cy + 0.9, 1, 1, "#7a4a00"); P(cx + 0.9, cy + 7.1, 1, 1, "#7a4a00"); P(cx + 7.1, cy + 7.1, 1, 1, "#7a4a00");
      ctx.fillStyle = "#5a3200"; ctx.font = "bold " + (6.6 * cell) + "px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(glyph, Math.round((cx + 4.5) * cell), Math.round((cy + 5.0) * cell));
    }
    function foe(cx, baseY, t) {
      var step = Math.floor(t * 6) % 2;
      P(cx + 1, baseY - 7, 6, 5, FOE); P(cx, baseY - 5, 8, 3, FOE); P(cx + 1, baseY - 7, 6, 1.2, "#a98cff");
      P(cx + 1.4, baseY - 2, 5.2, 2, "#efe7ff"); P(cx + 2.4, baseY - 3.4, 1.4, 1.6, INK); P(cx + 4.4, baseY - 3.4, 1.4, 1.6, INK);
      P(cx + 2.2, baseY, 2, 1.6, step ? FOED : "#3a2a7a"); P(cx + 4.2, baseY, 2, 1.6, step ? "#3a2a7a" : FOED);
    }
    function star(cx, cy, r, t) {
      var tw = 0.85 + Math.sin(reduce ? 0 : t * 5) * 0.15;
      ctx.save(); ctx.translate(cx * cell, cy * cell); ctx.scale(tw, tw); ctx.fillStyle = GOLD; ctx.beginPath();
      for (var i = 0; i < 10; i++) { var ang = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? r * 0.45 : r) * cell; ctx[i ? "lineTo" : "moveTo"](Math.cos(ang) * rr, Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function unicorn(bx, groundTop, t) {
      var bob = reduce ? 0 : Math.sin(t * 7) * 0.5, by = groundTop - 16 + bob;
      ctx.globalAlpha = .18; P(bx + 1, groundTop - 0.6, 15, 2.2, "#101a2e"); ctx.globalAlpha = 1;
      if (!reduce) { for (var s = 0; s < 6; s++) { ctx.globalAlpha = 0.30 - s * 0.035 + Math.sin(t * 10 + s) * 0.04; P(bx - 3 - s * 2.4, by + 5 + s * 1.4, 5, 1.4, RB[s % RB.length]); } ctx.globalAlpha = 1; }
      var twl = reduce ? 0 : Math.sin(t * 6);
      for (var i = 0; i < 6; i++) { var ty = by + 5 + i * 1.5, tx = bx - 1 - i * 0.5 + Math.round(twl * (i * 0.35)); P(tx, ty, 3.2, 1.6, RB[i]); }
      function leg(lx, phase) { var lift = Math.max(0, Math.sin(reduce ? 1.2 : (t * 9 + phase))), h = 4.4 - lift * 2.2; P(lx, by + 11, 2, h, WT); P(lx, by + 11 + h - 1.1, 2, 1.4, HOOF); }
      leg(bx + 3, 0.0); leg(bx + 5.4, Math.PI);
      P(bx + 2, by + 6, 11, 6, WT); P(bx + 2, by + 6, 11, 1.4, "#ffffff"); P(bx + 2, by + 10.6, 11, 1.4, WS); P(bx + 1.4, by + 7, 1.6, 4, WT);
      P(bx + 9.5, by + 3.5, 4, 5, WT); P(bx + 10.5, by + 2, 5.4, 4.4, WT); P(bx + 15, by + 4.4, 1.8, 2.2, PINK); P(bx + 15.4, by + 5, 0.9, 0.9, INK); P(bx + 9.8, by + 2, 1.8, 1.8, WT);
      P(bx + 12.6, by + 3.4, 1.3, 1.5, INK); P(bx + 14.1, by + 5.1, 1.1, 1.1, "#ff8ab5");
      for (var hgt = 0; hgt < 4; hgt++) { var hw = 2.0 - hgt * 0.45; P(bx + 11.6 + hgt * 0.25, by - 0.4 - hgt * 0.9, hw, 1.0, hgt % 2 ? GHI : GOLD); }
      var mf = reduce ? 0 : Math.sin(t * 7 + 1);
      for (var m = 0; m < 6; m++) { var my = by + 1.2 + m * 1.3, mx = bx + 8.4 - (m > 2 ? 0.6 : 0) + Math.round(mf * 0.4); P(mx, my, 2.6, 1.5, RB[m]); }
      P(bx + 10.2, by + 1, 2.4, 1.4, RB[0]);
      leg(bx + 9, Math.PI); leg(bx + 11.4, 0.0);
      star(bx + 6.4, by + 8.4, 1.9, t);
      if (!reduce) { for (var k = 0; k < 3; k++) { var sp = (t * 0.8 + k * 0.7) % 1; ctx.globalAlpha = Math.sin(sp * Math.PI); var sx2 = bx + 17 + k * 2.2, sy2 = by - 2 + (k * 5) - sp * 3; P(sx2, sy2, 1.2, 1.2, GHI); P(sx2 - 1, sy2 + 0.6, 3.2, 0.5, GOLD); P(sx2 + 0.6, sy2 - 1, 0.5, 3.2, GOLD); } ctx.globalAlpha = 1; }
    }
    var props = [
      { t: "coin", x: 46 }, { t: "coin", x: 49 }, { t: "coin", x: 52 },
      { t: "block", x: 40, g: "×" }, { t: "block", x: 70, g: "7" }, { t: "block", x: 73, g: "8" },
      { t: "foe", x: 60 }, { t: "bush", x: 32 }, { t: "bush", x: 84 }, { t: "coin", x: 90 }, { t: "coin", x: 93 }, { t: "coin", x: 96 }
    ];
    function frame(now) {
      if (!running) return;
      if (document.hidden || !active()) { running = false; return; }
      if (t0 === null) t0 = now; var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = .5;
      var sg = ctx.createRadialGradient((VW * 0.82) * cell, (VH * 0.2) * cell, 2, (VW * 0.82) * cell, (VH * 0.2) * cell, 22 * cell);
      sg.addColorStop(0, "#fff7cf"); sg.addColorStop(1, "rgba(255,247,207,0)"); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      var cd = reduce ? 0 : t * 2.2, span = VW + 40;
      var clouds = [[10, 8, 1.5], [34, 14, 1.1], [60, 6, 1.8], [86, 16, 1.2], [112, 11, 1.4]];
      for (var i = 0; i < clouds.length; i++) { var cx = ((clouds[i][0] - cd) % span + span) % span - 20; cloud(cx, clouds[i][1], clouds[i][2]); }
      var hd = reduce ? 0 : t * 6, hills = [[24, 90], [70, 70], [118, 100]];
      for (var hI = 0; hI < hills.length; hI++) { var hx = ((hills[hI][0] - hd * 0.5) % span + span) % span - 20; hill(hx, GROUND + 0.5, hills[hI][1] / 5, hills[hI][1] / 8, "#8fd85f", "#5fbf3f"); }
      var gd = reduce ? 0 : t * 24;
      P(0, GROUND, VW, 2.2, "#7cd04a"); P(0, GROUND + 2.2, VW, 0.7, "#3a9e2a"); P(0, GROUND + 2.9, VW, VH - GROUND, "#c9803f");
      var seam = 6, off = (gd % seam);
      for (var gx = -off; gx < VW + seam; gx += seam) { P(gx, GROUND + 2.9, 0.7, VH - GROUND, "#a8632f"); P(gx + 3, GROUND, 0.7, 2.2, "#8fd85f"); }
      P(0, GROUND + 7, VW, 0.7, "#a8632f");
      for (var p = 0; p < props.length; p++) {
        var pr = props[p], px = ((pr.x - gd) % span + span) % span - 20;
        if (px < -14 || px > VW + 14) continue;
        if (pr.t === "coin") coin(px, GROUND - 14 + Math.sin(t * 3 + pr.x) * 1.2, t * 4 + pr.x);
        else if (pr.t === "block") block(px, GROUND - 22 + Math.sin(t * 2 + pr.x) * 1.0, pr.g);
        else if (pr.t === "foe") foe(px, GROUND, t);
        else if (pr.t === "bush") bush(px, GROUND);
      }
      unicorn(VW * 0.16, GROUND, t);
      requestAnimationFrame(frame);
    }
    function start() {
      cvs = document.getElementById("lp-scene"); if (!cvs) return; ctx = cvs.getContext("2d");
      reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!inited) {
        window.addEventListener("resize", function () { if (running) resize(); });
        document.addEventListener("visibilitychange", function () { if (!document.hidden && active()) start(); });
        inited = true;
      }
      resize(); GROUND = VH - 16;
      if (running) return; running = true; t0 = null; requestAnimationFrame(frame);
    }
    return { start: start };
  })();
  function paintLandingHeroes() {
    if (!Adv || !Adv.drawHero) return;
    $all(".lp-hcard__ava[data-hero]").forEach(function (cv) {
      try { Adv.drawHero(cv, cv.getAttribute("data-hero"), true); } catch (e) {}
    });
    $all(".lp-wcard__scene[data-world]").forEach(function (cv) {
      try { Adv.drawWorld(cv, +cv.getAttribute("data-world")); } catch (e) {}
    });
    $all(".lp-step__scene[data-how]").forEach(function (cv) {
      try { Adv.drawHowScene(cv, +cv.getAttribute("data-how")); } catch (e) {}
    });
  }
  function openLanding() {
    show("landing"); LandingFX.start(); paintLandingHeroes();
    var si = Auth.signedIn();
    var out = $("#lp-cta-out"), inn = $("#lp-cta-in"), note = $("#lp-signedin"), fin = $("#lp-create2");
    if (out) out.hidden = si;
    if (inn) inn.hidden = !si;
    if (note) { note.hidden = !si; if (si) { var em = $("#lp-user-email"); if (em) em.textContent = Auth.email() || "your account"; } }
    if (fin) fin.textContent = si ? "▶ PLAY" : "▶ START THE ADVENTURE";   // bottom CTA follows the same state
  }
  function signOut() {
    if (!window.confirm("Sign out of this family account on this device?\n\nYour kids' progress stays saved online — sign back in anytime with your email and password.")) return;
    if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
    Auth.logout();
    reg.profiles.forEach(function (p) { try { localStorage.removeItem(pKey(p.id)); } catch (e) {} });   // clear the local mirror
    reg = { activeId: null, profiles: [] }; activeId = null; profilesSave();
    state.parentUnlocked = false; updatePlayerSwitch(); openLanding();
  }

  /* ---------------- ADVENTURE — 8-bit Quest Land (daily quest) ---------------- */
  var Adv = (function () {
    var TEST = /[?&]test=1/.test(location.search);
    var cv, x;                       // canvas + ctx (assigned in advInit)
    var WORLDH = 760, LW = 760, LH = 760, GROUND = 520, HEROX = 150, sx = 0.4, PIXW = 140, PIXH = 300;
    var HEROSIZE = 96, MAXLEVELS = 8, unlocked = 1, HEROTYPE = "unicorn";
    var LANE_LEAD = 5.0;             // seconds a Lane Runner wall takes to arrive (reading/think time for kids)
    var G = null, level = 1, running = false, looping = false;

    // pixel palettes per theme
    var THEMES = [
      { name: "MEADOW", prop: "tree", hifi: true, sky: "#5c94fc", sky2: "#7fb0ff", cloud: "#ffffff", mtn: "#b8c8f0", mtnS: "#eef4ff", h1: "#57bf3a", h2: "#3a9e2a", grass: "#7cd04a", dirt: "#c9803f", dirtL: "#a8632f" },
      { name: "BEACH", prop: "palm", sky: "#67c8ff", sky2: "#a8e4ff", cloud: "#ffffff", mtn: "#cfe0f5", mtnS: "#ffffff", h1: "#ffe08a", h2: "#f0c860", grass: "#f2df9e", dirt: "#e0b060", dirtL: "#c99640", water: "#3fb0e0" },
      { name: "CANDY", prop: "candy", sky: "#ff9ed6", sky2: "#ffc2e6", cloud: "#fff0f8", mtn: "#ffc2e2", mtnS: "#ffffff", h1: "#ff8ec8", h2: "#ef6aa8", grass: "#ffb0d8", dirt: "#e070a8", dirtL: "#c85890" },
      { name: "OCEAN", prop: "coral", sky: "#39a8d8", sky2: "#7fd0ee", cloud: "#cfeeff", mtn: "#86dccf", mtnS: "#e0fffb", h1: "#3fbfb0", h2: "#2a9a8c", grass: "#57c8ba", dirt: "#2a8a7c", dirtL: "#1f6e62", water: "#2fb6d6" },
      { name: "SNOW", prop: "pine", sky: "#bcd7f2", sky2: "#dcecfb", cloud: "#ffffff", mtn: "#eaf4ff", mtnS: "#ffffff", h1: "#eef6ff", h2: "#d6e6f5", grass: "#f4faff", dirt: "#cfe0f0", dirtL: "#b0c8e0" },
      { name: "JUNGLE", prop: "jungle", sky: "#83d2a4", sky2: "#b0e8c4", cloud: "#d6f0d6", mtn: "#6fc06f", mtnS: "#bfeabf", h1: "#4aa84a", h2: "#357a35", grass: "#5abf5a", dirt: "#7a5a2a", dirtL: "#5a3f1a" },
      { name: "VOLCANO", prop: "rock", sky: "#ff9a6b", sky2: "#ffc2a0", cloud: "#ffd0b0", mtn: "#b5745a", mtnS: "#ffb090", h1: "#8a5a4a", h2: "#6b4235", grass: "#9a5f48", dirt: "#6b4235", dirtL: "#4a2a1a", water: "#ff5a2a" },
      { name: "SPACE", prop: "crystal", sky: "#180f38", sky2: "#2a1a5a", cloud: "#3a2f6e", mtn: "#3a2f6e", mtnS: "#6a5aa8", h1: "#4a3f7a", h2: "#352b5e", grass: "#5a4a9a", dirt: "#352b5e", dirtL: "#241a4a", night: true }
    ];
    THEMES.forEach(function (t) { t.hifi = true; t.tuft = /MEADOW|CANDY|JUNGLE/.test(t.name); });
    var C = { coin: "#ffd23f", coinHi: "#fff2a8", coinLo: "#c9930a", box: "#ffb020", boxHi: "#ffd77a", boxLo: "#c97a00", enemy: "#8b6cf0", enemyD: "#5b3fc0", enemyEye: "#ffffff", enemyPup: "#241a4a", flag: "#ff4fa3", pole: "#dfe4ff", stone: "#9b8bbf", stoneD: "#6a5b9a", lock: "#ffd23f", star: "#ffe14a", castle: "#c8b7e6", castleD: "#9a86cf", door: "#3a2a6a" };
    // free heroes + special unlockable heroes (cost = shiny purple coins collected, each has a power)
    var CHARS = [
      { id: "unicorn", name: "STARLIGHT" }, { id: "cat", name: "PIXEL" }, { id: "fox", name: "RUSTY" },
      { id: "robo", name: "BOLT", cost: 5, power: "heart", note: "+1 HEART" },
      { id: "comet", name: "COMET", cost: 12, power: "jump", note: "SUPER JUMP" },
      { id: "nova", name: "NOVA", cost: 22, power: "star", note: "STARTS SUPER" },
      { id: "draco", name: "DRACO", cost: 35, power: "shield", note: "TRAP SHIELD" },
      { id: "orbit", name: "ORBIT", cost: 50, power: "magnet", note: "COIN MAGNET" }
    ];
    // exclusive heroes found ONLY by discovering a world's hidden path (never purchasable)
    var SECRET_CHARS = {
      2: { id: "shelly", name: "SHELLY", power: "magnet", note: "TREASURE MAGNET", from: "BEACH" },
      4: { id: "finn", name: "FINN", power: "star", note: "STARTS SUPER", from: "OCEAN" },
      6: { id: "mango", name: "MANGO", power: "jump", note: "SUPER JUMP", from: "JUNGLE" }
    };
    // rotating pool of "answer-without-a-keypad" mini-games used at every 3rd gate
    var SPECIAL_MODES = ["lane", "asteroid", "whack", "hoop", "beat", "slash", "catch"];
    // hidden "World B" palette — a sunset pirate cove, distinct from the bright-blue Beach
    var SECRET_THEME = { name: "MYSTIC COVE", prop: "crystal", sky: "#2a1152", sky2: "#5a2f9e", cloud: "#c9a8f0", mtn: "#6a3aa8", mtnS: "#c9a8f0", h1: "#8f4fd8", h2: "#6a3aa8", grass: "#a86fe6", dirt: "#4a2088", dirtL: "#6a3aae", water: "#a24fe0", night: true };
    function charPower(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i].power || null; for (var wk in SECRET_CHARS) if (SECRET_CHARS[wk].id === id) return SECRET_CHARS[wk].power || null; return null; }
    // each world rolls among a themed pool of traps; caught => solve a bonus question to escape
    var TRAP_POOL = [
      ["bush", "rps", "police"],        // MEADOW
      ["plant", "net", "booger"],       // BEACH
      ["mouse", "rps", "police"],       // CANDY
      ["net", "booger", "snowball"],    // OCEAN
      ["ice", "snowball", "iceblock"],  // SNOW
      ["giant", "plant", "vine"],       // JUNGLE
      ["hoop", "star", "giant"],        // VOLCANO
      ["cage", "star", "booger"]        // SPACE
    ];
    var TRAP_LABEL = {
      bush: "SPIKY BUSH!", plant: "CHOMP PLANT!", mouse: "MOUSE TRAP!", net: "CAUGHT IN A NET!",
      ice: "FROZEN SOLID!", vine: "VINE SNARE!", giant: "GIANT STOMP!", hoop: "RING OF FIRE!",
      cage: "CAGED — CRACK THE CODE!", snowball: "SNOWBALL FIGHT!", iceblock: "FALLING ICE!",
      star: "FALLING STAR!", rps: "ROCK-PAPER-SCISSORS!", police: "BUSTED — COPS!", booger: "SNOT ATTACK!"
    };
    // segment layout archetypes for variety
    var CHUNKS = ["boxes", "hop", "gauntlet", "trapchunk", "moving", "coinarc"];

    function resize() {
      var w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
      LH = 760; LW = Math.round(760 * w / h); GROUND = Math.round(LH * 0.70); HEROX = Math.round(LW * 0.20);
      // Backing res tracks the display so a phone and a big desktop share the same on-screen pixel density
      // (a phone at ~780px tall lands on ~440, matching the old fixed value; bigger screens render sharper).
      // visibleWorldUnits = aspect * LH is independent of PIXH, so gameplay is unaffected.
      PIXH = Math.max(440, Math.min(900, Math.round(h / 1.8))); PIXW = Math.max(160, Math.round(PIXH * w / h)); sx = PIXH / LH;
      cv.width = PIXW; cv.height = PIXH;
      x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false;
      if (G && G.hero && G.hero.ground) G.hero.y = GROUND;
    }

    function config(n) {
      return {
        speed: Math.round((200 + (n - 1) * 18) * 0.85), pit: 145 + (n - 1) * 26, enemySpeed: 58 + (n - 1) * 16,
        moving: n >= 2, hearts: 3,
        trapPool: TRAP_POOL[(n - 1) % 8],
        trapChance: Math.min(0.95, 0.6 + (n - 1) * 0.05),   // more traps deeper
        enemyChance: Math.min(0.95, 0.5 + (n - 1) * 0.07),
        gemChance: 0.5
      };
    }

    function reset(n, keepHearts) {
      warpFX = null;
      level = n; var cf = config(n); var th = THEMES[(n - 1) % THEMES.length];
      cf.gates = clamp(progress.settings.dailyGoal, 6, 12);   // a world run = (most of) the day's quest
      var power = charPower(HEROTYPE);
      var maxH = cf.hearts + (power === "heart" ? 1 : 0);
      G = {
        cf: cf, theme: th, state: "run", cam: 0, speed: cf.speed, t: 0,
        maxHearts: maxH, hearts: (keepHearts != null ? keepHearts : maxH), coins: 0, gemRun: 0, nextGate: 0,
        power: power, jumpBoost: power === "jump", shield: power === "shield", magnet: power === "magnet",
        hero: { wx: HEROX, y: GROUND, vy: 0, ground: true, hold: false, dbl: false, coyote: 0, inv: 0, power: power === "star" ? 6 : 0, run: 0 },
        question: null, input: "", lastCP: HEROX, particles: [], cloud: 0, shakeT: 0, dash: 0, qStart: 0,
        correct: 0, wrong: 0, combo: 0, xpEarned: 0, goalMet: false, levelBefore: levelFromXp(progress.xp), trapIndex: -1,
        deck: seedMissing(buildQuestions(focusTables(), clamp(progress.settings.dailyGoal, 6, 12))), deckI: 0,
        grounds: [], platforms: [], boxes: [], bricks: [], pipes: [], coinsA: [], enemies: [], flags: [], gates: [], star: null, castleX: 0, props: [], flowers: [], traps: [], gemsA: [], powerups: [], fish: [], springs: [], icicles: [], bubbles: [], vines: [], firebars: [], speedZones: [], mushrooms: [], hills: [], hawks: [], fireworks: [], jellies: [],
        floaty: th.name === "OCEAN", moon: th.name === "SPACE", frostT: 0, bigT: 0, flyT: 0, meter: 0, popT: 0, popTxt: "", warp: null, chest: null, secretWorld: 0, enterPending: 0, showdown: null, sd: null, lane: null, ast: null, mini: null, arena: null
      };
      build(cf); buildPmap();
    }
    var SEG = 1500;
    function build(cf) {
      var START = 760, i, seg, gx = []; for (i = 0; i < cf.gates; i++) gx.push(START + i * SEG);
      var spc = 0; G.gates = gx.map(function (v, i) { var mode = "keypad"; if (i > 1 && i % 3 === 2) { mode = SPECIAL_MODES[spc % SPECIAL_MODES.length]; spc++; } return { x: v, solved: false, mode: mode }; }); G.castleX = gx[gx.length - 1] + SEG;
      // pits (skip before the first gate so the opening is gentle)
      var pits = []; for (seg = 0; seg < gx.length; seg++) { var base = gx[seg] - SEG; if (base < 200) continue; var pc = base + SEG * 0.55; pits.push([pc, pc + cf.pit]); }
      var lastMid = gx[gx.length - 1] + SEG * 0.5; pits.push([lastMid, lastMid + cf.pit]); pits.sort(function (a, b) { return a[0] - b[0]; });
      var spans = [], cur = -400; pits.forEach(function (p) { spans.push([cur, p[0]]); cur = p[1]; }); spans.push([cur, G.castleX + 700]); G.grounds = spans;
      pits.forEach(function (p) { var mid = (p[0] + p[1]) / 2; for (var k = -2; k <= 2; k++) G.coinsA.push({ x: mid + k * 40, hAbove: 160 - Math.abs(k) * 24, got: false }); });
      // Beach: leaping fish jump out of the water gaps (time your jump past them)
      if (G.theme.name === "BEACH") { pits.forEach(function (p, fi) { if (fi % 1 === 0) G.fish.push({ x: (p[0] + p[1]) / 2, amp: 210, period: 1.5, phase: (fi * 1.7) % 3 }); }); }
      // Candy (W3): bouncy springboards — land on one to launch high (reach the candy coin arcs above)
      if (G.theme.name === "CANDY") { for (var sg3 = 1; sg3 < gx.length; sg3++) { var sbb = gx[sg3] - SEG; if (sbb <= 200) continue; var spx = sbb + SEG * 0.46; G.springs.push({ x: spx, t: 0 }); for (var sc3 = 0; sc3 < 6; sc3++) G.coinsA.push({ x: spx + 6 + sc3 * 30, hAbove: 210 + sc3 * 44, got: false }); } }
      // Snow (W5): icicles hang overhead and drop when you pass beneath — keep moving to dodge
      if (G.theme.name === "SNOW") { for (var sg5 = 1; sg5 < gx.length; sg5++) { var ib = gx[sg5] - SEG; if (ib <= 200) continue; for (var ic5 = 0; ic5 < 2; ic5++) G.icicles.push({ x: ib + SEG * (0.42 + ic5 * 0.34), y: GROUND - 300, vy: 0, falling: false, done: false }); } }
      // Jungle (W6): swing vines over the gaps — grab one mid-jump for a big forward fling
      if (G.theme.name === "JUNGLE") { pits.forEach(function (p) { G.vines.push({ x: p[0] - 30, used: false }); }); for (var vg = 1; vg < gx.length; vg++) { var vb = gx[vg] - SEG; if (vb <= 200) continue; G.vines.push({ x: vb + SEG * 0.5, used: false }); } }
      // Volcano (W7): rotating fire-bars — time your run past the flames (pits are lava)
      if (G.theme.name === "VOLCANO") { for (var fg = 1; fg < gx.length; fg++) { var fb = gx[fg] - SEG; if (fb <= 200) continue; G.firebars.push({ x: fb + SEG * 0.5, cy: GROUND - 96, len: 96, spd: 1.6 + (fg % 3) * 0.4, phase: fg * 1.3 }); } }
      // Space (W8): low-gravity moon jumps + falling meteors (reuses the icicle drop, drawn as fireballs)
      if (G.theme.name === "SPACE") { for (var mg8 = 1; mg8 < gx.length; mg8++) { var mb = gx[mg8] - SEG; if (mb <= 200) continue; for (var me8 = 0; me8 < 2; me8++) G.icicles.push({ x: mb + SEG * (0.4 + me8 * 0.36), y: GROUND - 340, vy: 0, falling: false, done: false, meteor: true }); } }
      // HIDDEN PATH: a golden warp portal up on a ledge — jump onto it to dive into a secret "World B".
      // Only reachable by a deliberate leap (a coin arc hints the climb); ground-runners sail right past it.
      if (SECRET_CHARS[level]) {
        // Placed deeper in the run (a reward for exploring), not right at the start — up on a ledge past the 2nd gate.
        var wseg = Math.min(2, gx.length - 1); var wpx = gx[wseg] - SEG * 0.30;
        G.platforms.push({ x: wpx - 62, hAbove: 108, w: 124, mv: false, amp: 0, period: 2, phase: 0, warp: true });
        G.warp = { x0: wpx - 60, x1: wpx + 60, top: GROUND - 108, x: wpx, done: false };
        // a coin staircase pointing the way up, and a purple gem teaser at the portal mouth
        for (var wc = 0; wc < 7; wc++) G.coinsA.push({ x: wpx - 190 + wc * 36, hAbove: 36 + wc * 14, got: false });
        G.gemsA.push({ x: wpx, hAbove: 150, got: false });
      }
      // Slingshot Showdown mini-boss barricades, sprinkled through several worlds (a fun break from the keypad)
      if (SHOWDOWN_WORLDS[level] && gx.length >= 3) G.showdown = { x: gx[1] + SEG * 0.30, done: false };
      // SMB-density: pack each gate-segment with several set-pieces (a feature roughly every screen)
      var meadow = G.theme.name === "MEADOW", beach = G.theme.name === "BEACH", candy = G.theme.name === "CANDY", authored = meadow || beach || candy;
      for (seg = 0; seg < gx.length; seg++) {
        var b = gx[seg] - SEG; if (b <= 200) continue;
        if (meadow) fillSegmentMeadow(b, seg, cf); else if (beach) fillSegmentBeach(b, seg, cf); else if (candy) fillSegmentCandy(b, seg, cf); else fillSegment(b, seg, cf);
      }
      if (beach) G.sandUntil = gx[0] + SEG * 2.3;   // the shore (dunes + tide pools) is sand; the pier begins beyond
      if (candy && gx.length >= 6) {   // peppermint spinners (the fire-bar mechanic, re-skinned) over a couple of later beats
        G.firebars.push({ x: gx[Math.min(7, gx.length - 1)] - SEG * 0.5, cy: GROUND - 96, len: 96, spd: 1.5, phase: 0.4, candy: true });
        G.firebars.push({ x: gx[Math.min(7, gx.length - 1)] - SEG * 0.2, cy: GROUND - 120, len: 84, spd: -1.8, phase: 1.6, candy: true });
      }
      // keep a clean pocket around the secret portal so it stands out
      if (G.warp) { var wl = G.warp.x0 - 50, wr = G.warp.x1 + 50, clr = function (arr) { return arr.filter(function (o) { return (o.x + (o.w || 40)) < wl || o.x > wr; }); }; G.boxes = clr(G.boxes); G.bricks = clr(G.bricks); G.pipes = clr(G.pipes); }
      // signature trap per world — first two zones always trapped so every run meets one early; a 2nd appears deeper
      for (seg = 1; seg < gx.length; seg++) {
        var bt = gx[seg] - SEG; if (bt <= 200) continue;
        if (seg <= 2 || Math.random() < cf.trapChance) G.traps.push({ x: bt + SEG * 0.34, type: pick(cf.trapPool), done: false, sprung: false });
        if (level >= 3 && Math.random() < cf.trapChance - 0.3) G.traps.push({ x: bt + SEG * 0.80, type: pick(cf.trapPool), done: false, sprung: false });
      }
      // don't let a trap sit right where the showdown drops you back in (would spring instantly)
      if (G.showdown) { var sdl = G.showdown.x - 70, sdr = G.showdown.x + 240; G.traps = G.traps.filter(function (t) { return t.x < sdl || t.x > sdr; }); }
      // shiny purple coins: rare, placed high so you must jump for them
      for (seg = 1; seg < gx.length; seg++) { if (seg % 2 === 0 && Math.random() < cf.gemChance) G.gemsA.push({ x: gx[seg] - SEG * 0.72, hAbove: 300 + (seg % 3) * 22, got: false }); }
      if (!G.gemsA.length) G.gemsA.push({ x: gx[Math.min(1, gx.length - 1)] - SEG * 0.72, hAbove: 320, got: false });
      // SKIP HOP: a clearly-marked floating platform above some math portals — leap up to it to skip that one problem.
      // Only on plain keypad gates (never the mini-games), and only every few gates, so most problems still get solved.
      for (var sk = 0; sk < G.gates.length; sk++) {
        var sga = G.gates[sk];
        if (sga.mode !== "keypad" || sk < 1 || sk % 3 !== 1) continue;
        G.platforms.push({ x: sga.x - 232, hAbove: 200, w: 120, mv: false, amp: 0, period: 2, phase: 0, skip: true, used: false, gi: sk });
        for (var sc = 0; sc < 4; sc++) G.coinsA.push({ x: sga.x - 344 + sc * 34, hAbove: 60 + sc * 36, got: false }); // a coin staircase pointing up to it
      }
      // star: mid-level for most worlds; for Meadow put it near the last gate for a triumphant star-powered dash to the castle
      var mid2 = authored ? Math.max(1, gx.length - 2) : Math.floor(gx.length / 2); G.star = { x: gx[mid2] - SEG * 0.2, hAbove: 170, taken: false };
      // MEADOW hawks — a couple of swooping birds that dive as you approach; jump over them (telegraphed, like the icicle)
      if (meadow && gx.length >= 5) {
        G.hawks.push({ x: gx[Math.min(3, gx.length - 1)] - SEG * 0.5, y: GROUND - 220, vy: 0, state: "hover", phase: 0.6 });
        G.hawks.push({ x: gx[Math.min(6, gx.length - 1)] - SEG * 0.5, y: GROUND - 220, vy: 0, state: "hover", phase: 1.9 });
      }
      if (beach && gx.length >= 6) {   // drifting jellyfish over the pier (a gentle, slow-bobbing hazard)
        G.jellies.push({ x: gx[Math.min(7, gx.length - 1)] - SEG * 0.5, phase: 0.3, amp: 60, mid: 96 });
        G.jellies.push({ x: gx[Math.min(9, gx.length - 1)] - SEG * 0.55, phase: 1.8, amp: 62, mid: 104 });
      }
      G.flags = [{ x: HEROX, hit: true, raise: 1 }]; for (var f = 0; f < gx.length; f++) { G.flags.push({ x: gx[f] - SEG * 0.5, hit: false, raise: 0, half: true }); }
      for (var trp = 0; trp < 90; trp++) G.props.push({ x: trp * 250 + ((trp * 71) % 160), s: 52 + ((trp * 53) % 30) });
      for (var fl = 0; fl < 220; fl++) G.flowers.push({ x: fl * 84 + ((fl * 37) % 56), k: fl % 3 });
    }
    // pack a gate-segment with ~4 set-pieces (before pit / after pit), avoiding the mid-segment pit (~b+825)
    var FEATURES = ["coins", "brickRow", "qbox", "pipe", "platforms", "enemies", "doublePipe", "brickRow", "qbox", "coins"];
    function fillSegment(b, seg, cf) {
      var offs = [250, 520, 1050, 1250];
      for (var i = 0; i < offs.length; i++) {
        placeFeature(FEATURES[(seg * 4 + i + level) % FEATURES.length], b + offs[i], seg, i, cf);
      }
    }
    function coin1(x, hA) { G.coinsA.push({ x: x, hAbove: hA, got: false }); }
    // MEADOW course — each gate-segment is a distinct, purposeful "beat" instead of the same 4 props
    // at the same 4 offsets. Uses existing primitives (platforms/springs/enemies) + the new speed zone.
    var MEADOW_ORDER = ["hills", "pond", "fork", "gauntlet", "pipes", "downhill", "coinfield"];
    function fillSegmentMeadow(b, seg, cf) {
      var arch = MEADOW_ORDER[(seg - 1) % MEADOW_ORDER.length];
      var pitL = b + SEG * 0.5, pitR = b + SEG * 0.72;   // keep the mid-segment pit clear of ground props
      var c;
      if (arch === "hills") {              // TRUE rolling ground — grassy mounds you run up & over (no jumping needed)
        G.hills.push({ x0: b + 140, x1: b + 780, h: 132 });
        G.hills.push({ x0: b + 1000, x1: b + 1450, h: 108 });
        for (c = 0; c < 8; c++) { var hxa = b + 200 + c * 74; coin1(hxa, (GROUND - groundY(hxa)) + 44); }
        for (c = 0; c < 5; c++) { var hxb = b + 1050 + c * 78; coin1(hxb, (GROUND - groundY(hxb)) + 44); }
      } else if (arch === "fork") {        // a choice — take the HIGH road (platforms) for a gem, or stay LOW & safe
        G.platforms.push({ x: b + 300, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 470, hAbove: 230, w: 150, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 690, hAbove: 230, w: 170, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 940, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });   // steps back down
        G.gemsA.push({ x: b + 770, hAbove: 292, got: false });                 // reward up on the high road
        for (c = 0; c < 4; c++) coin1(b + 500 + c * 40, 272);                  // coin trail along the high road
        for (c = 0; c < 5; c++) coin1(b + 340 + c * 130, 50);                  // low road: a safe coin trail
      } else if (arch === "pond") {        // bounce mushrooms (springs) across the pit + a high coin arc
        G.springs.push({ x: b + 300, t: 0 });
        for (c = 0; c < 6; c++) coin1(b + 306 + c * 30, 220 + c * 40);
        G.springs.push({ x: b + 1150, t: 0 });
        for (c = 0; c < 5; c++) coin1(b + 1156 + c * 30, 230 + c * 36);
      } else if (arch === "gauntlet") {    // enemies + a brick row to stomp through
        G.enemies.push({ x1: b + 240, x2: b + 430, x: b + 240, dir: 1, alive: true });
        G.enemies.push({ x1: b + 1050, x2: b + 1240, x: b + 1240, dir: -1, alive: true });
        for (var q = 0; q < 3; q++) G.bricks.push({ x: b + 1080 + q * 50, hAbove: 150, w: 46, h: 42, tapped: false, used: false });
        for (c = 0; c < 4; c++) coin1(b + 250 + c * 44, 60);
      } else if (arch === "pipes") {       // pipes to hop + a power box
        G.pipes.push({ x: b + 300, w: 46, h: 70 });
        G.pipes.push({ x: b + 1080, w: 46, h: 104 }); G.pipes.push({ x: b + 1210, w: 46, h: 66 });
        G.boxes.push({ x: b + 420, hAbove: 150, w: 48, h: 44, used: false, power: true });
        coin1(b + 323, 190); coin1(b + 1145, 175); coin1(b + 1145, 130);
      } else if (arch === "downhill") {    // speed-ramp release: run faster through a coin river, few obstacles
        G.speedZones.push({ x0: b + 120, x1: b + SEG * 0.9, mult: 1.55 });
        for (c = 0; c < 16; c++) coin1(b + 180 + c * 70, 48 + (c % 3) * 20);
        G.springs.push({ x: b + SEG * 0.86, t: 0 });
      } else {                             // coinfield — a breather with a power box
        for (c = 0; c < 6; c++) coin1(b + 220 + c * 46, 52);
        G.boxes.push({ x: b + 1120, hAbove: 150, w: 48, h: 44, used: false, power: true });
        for (c = 0; c < 4; c++) coin1(b + 1090 + c * 40, 205);
      }
      void pitL; void pitR;
    }
    // BEACH course — reuses Meadow's toys re-skinned for the coast (piranhas leap from the water gaps automatically).
    var BEACH_PIER_ORDER = ["fork", "crabs", "wavedash", "boxes", "coinfield"];
    function fillSegmentBeach(b, seg, cf) {
      // shore first (sand dunes → tide pools), then out onto the pier
      var arch = seg === 1 ? "dunes" : seg === 2 ? "tidepool" : BEACH_PIER_ORDER[(seg - 3) % BEACH_PIER_ORDER.length];
      var c, q;
      if (arch === "dunes") {               // rolling SAND dunes on the sandy shore (renders as sand, not pier)
        G.hills.push({ x0: b + 140, x1: b + 780, h: 120 });
        G.hills.push({ x0: b + 1000, x1: b + 1450, h: 100 });
        for (c = 0; c < 8; c++) { var dxa = b + 200 + c * 74; coin1(dxa, (GROUND - groundY(dxa)) + 44); }
        for (c = 0; c < 5; c++) { var dxb = b + 1050 + c * 78; coin1(dxb, (GROUND - groundY(dxb)) + 44); }
      } else if (arch === "tidepool") {     // floating barrels across the water gap + a high coin trail
        G.platforms.push({ x: b + 640, hAbove: 70, w: 96, mv: true, amp: 22, period: 2.0, phase: seg });
        G.platforms.push({ x: b + 820, hAbove: 96, w: 96, mv: true, amp: 22, period: 2.3, phase: seg + 1 });
        for (c = 0; c < 5; c++) coin1(b + 670 + c * 42, 150);
        for (c = 0; c < 4; c++) coin1(b + 1080 + c * 44, 60);
      } else if (arch === "fork") {         // high boardwalk (gem + Shelly's warp) vs safe low beach
        G.platforms.push({ x: b + 300, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 470, hAbove: 230, w: 150, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 690, hAbove: 230, w: 170, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 940, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });
        G.gemsA.push({ x: b + 770, hAbove: 292, got: false });
        for (c = 0; c < 4; c++) coin1(b + 500 + c * 40, 272);
        for (c = 0; c < 5; c++) coin1(b + 340 + c * 130, 50);
      } else if (arch === "crabs") {        // scuttling crabs + a brick row to hop
        G.enemies.push({ x1: b + 240, x2: b + 430, x: b + 240, dir: 1, alive: true, crab: true });
        G.enemies.push({ x1: b + 1050, x2: b + 1240, x: b + 1240, dir: -1, alive: true, crab: true });
        for (q = 0; q < 3; q++) G.bricks.push({ x: b + 1080 + q * 50, hAbove: 150, w: 46, h: 42, tapped: false, used: false });
        for (c = 0; c < 4; c++) coin1(b + 250 + c * 44, 60);
      } else if (arch === "wavedash") {     // receding wave — speed ramp + coin river + a bouncy beach ball
        G.speedZones.push({ x0: b + 120, x1: b + SEG * 0.9, mult: 1.55 });
        for (c = 0; c < 16; c++) coin1(b + 180 + c * 70, 48 + (c % 3) * 20);
        G.springs.push({ x: b + SEG * 0.86, t: 0 });
      } else if (arch === "boxes") {        // pipes to hop + a power box
        G.pipes.push({ x: b + 300, w: 46, h: 70 });
        G.pipes.push({ x: b + 1080, w: 46, h: 104 }); G.pipes.push({ x: b + 1210, w: 46, h: 66 });
        G.boxes.push({ x: b + 420, hAbove: 150, w: 48, h: 44, used: false, power: true });
        coin1(b + 323, 190); coin1(b + 1145, 175); coin1(b + 1145, 130);
      } else {                              // coinfield breather
        for (c = 0; c < 6; c++) coin1(b + 220 + c * 46, 52);
        G.boxes.push({ x: b + 1120, hAbove: 150, w: 48, h: 44, used: false, power: true });
        for (c = 0; c < 4; c++) coin1(b + 1090 + c * 40, 205);
      }
    }
    // CANDY course — pure re-skins. Candy's pink 'grass' makes the rolling ground read as frosting for free.
    var CANDY_ORDER = ["hills", "gumdrop", "fork", "gummy", "wafer", "sugarrush", "coinfield"];
    function fillSegmentCandy(b, seg, cf) {
      var arch = CANDY_ORDER[(seg - 1) % CANDY_ORDER.length];
      var c, q;
      if (arch === "hills") {               // frosting rolling ground
        G.hills.push({ x0: b + 140, x1: b + 780, h: 126 }); G.hills.push({ x0: b + 1000, x1: b + 1450, h: 104 });
        for (c = 0; c < 8; c++) { var hxa = b + 200 + c * 74; coin1(hxa, (GROUND - groundY(hxa)) + 44); }
        for (c = 0; c < 5; c++) { var hxb = b + 1050 + c * 78; coin1(hxb, (GROUND - groundY(hxb)) + 44); }
      } else if (arch === "gumdrop") {      // gumdrop bounce (Candy's springboards) + high coin arcs
        G.springs.push({ x: b + 300, t: 0 }); for (c = 0; c < 6; c++) coin1(b + 306 + c * 30, 220 + c * 40);
        G.springs.push({ x: b + 1150, t: 0 }); for (c = 0; c < 5; c++) coin1(b + 1156 + c * 30, 230 + c * 36);
      } else if (arch === "fork") {         // high candy-cane road (gem) vs low
        G.platforms.push({ x: b + 300, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 470, hAbove: 230, w: 150, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 690, hAbove: 230, w: 170, mv: false, amp: 0, period: 2, phase: 0 });
        G.platforms.push({ x: b + 940, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 });
        G.gemsA.push({ x: b + 770, hAbove: 292, got: false });
        for (c = 0; c < 4; c++) coin1(b + 500 + c * 40, 272); for (c = 0; c < 5; c++) coin1(b + 340 + c * 130, 50);
      } else if (arch === "gummy") {        // gummy bears + brick row
        G.enemies.push({ x1: b + 240, x2: b + 430, x: b + 240, dir: 1, alive: true, gummy: true });
        G.enemies.push({ x1: b + 1050, x2: b + 1240, x: b + 1240, dir: -1, alive: true, gummy: true });
        for (q = 0; q < 3; q++) G.bricks.push({ x: b + 1080 + q * 50, hAbove: 150, w: 46, h: 42, tapped: false, used: false });
        for (c = 0; c < 4; c++) coin1(b + 250 + c * 44, 60);
      } else if (arch === "wafer") {        // chocolate river — floating wafer-cookies + high coins
        G.platforms.push({ x: b + 640, hAbove: 70, w: 96, mv: true, amp: 22, period: 2.0, phase: seg });
        G.platforms.push({ x: b + 820, hAbove: 96, w: 96, mv: true, amp: 22, period: 2.3, phase: seg + 1 });
        for (c = 0; c < 5; c++) coin1(b + 670 + c * 42, 150); for (c = 0; c < 4; c++) coin1(b + 1080 + c * 44, 60);
      } else if (arch === "sugarrush") {    // speed slide + coin river + gumdrop launch
        G.speedZones.push({ x0: b + 120, x1: b + SEG * 0.9, mult: 1.55 });
        for (c = 0; c < 16; c++) coin1(b + 180 + c * 70, 48 + (c % 3) * 20); G.springs.push({ x: b + SEG * 0.86, t: 0 });
      } else {                              // coinfield breather
        for (c = 0; c < 6; c++) coin1(b + 220 + c * 46, 52);
        G.boxes.push({ x: b + 1120, hAbove: 150, w: 48, h: 44, used: false, power: true });
        for (c = 0; c < 4; c++) coin1(b + 1090 + c * 40, 205);
      }
    }
    function placeFeature(kind, ox, seg, idx, cf) {
      var c, q;
      if (kind === "coins") { for (c = 0; c < 5; c++) coin1(ox + c * 40, 46); }
      else if (kind === "brickRow") { for (q = 0; q < 3; q++) G.bricks.push({ x: ox + q * 50, hAbove: 150, w: 46, h: 42, tapped: false, used: false }); for (c = 0; c < 3; c++) coin1(ox + c * 50, 200); }
      else if (kind === "qbox") { var pw = (seg + idx) % 4 === 0; G.boxes.push({ x: ox, hAbove: 150, w: 48, h: 44, used: false, power: pw }); if (!pw) G.boxes.push({ x: ox + 60, hAbove: 150, w: 48, h: 44, used: false }); coin1(ox + (pw ? 0 : 30), 205); }
      else if (kind === "pipe") { G.pipes.push({ x: ox, w: 46, h: 66 + ((seg * 13 + idx * 29) % 56) }); coin1(ox + 23, 190); }
      else if (kind === "doublePipe") { G.pipes.push({ x: ox, w: 46, h: 62 }); G.pipes.push({ x: ox + 128, w: 46, h: 104 }); coin1(ox + 64, 175); coin1(ox + 64, 130); }
      else if (kind === "platforms") { G.platforms.push({ x: ox, hAbove: 150, w: 118, mv: false, amp: 0, period: 2, phase: 0 }); var mv = cf.moving && (seg % 2 === 1); G.platforms.push({ x: ox + 200, hAbove: 250, w: 118, mv: mv, amp: mv ? 80 : 0, period: 2.4, phase: seg }); for (c = 0; c < 3; c++) coin1(ox + 24 + c * 34, 200); }
      else { G.enemies.push({ x1: ox, x2: ox + 190, x: ox, dir: 1, alive: true }); if (Math.random() < cf.enemyChance) G.enemies.push({ x1: ox + 110, x2: ox + 300, x: ox + 300, dir: -1, alive: true }); for (c = 0; c < 4; c++) coin1(ox + c * 56, 50); }
    }

    /* ---- audio (arcade blips via app tone(), respects sound toggle) ---- */
    function aCoin() { tone(988, .06, "square", 0, .09); tone(1319, .07, "square", .05, .08); }
    function aJump() { tone(392, .09, "square", 0, .08); tone(587, .08, "square", .04, .07); }
    function aDbl() { tone(587, .09, "square", 0, .07); }
    function aStomp() { tone(196, .09, "square", 0, .11); }
    function aGood() { tone(523, .08, "square", 0); tone(784, .12, "square", .08); }
    function aBad() { tone(147, .22, "square", 0, .1); }
    function aHurt() { tone(110, .2, "sawtooth", 0, .1); }
    function aStar() {[523, 659, 784, 1046].forEach(function (f, i) { tone(f, .1, "square", i * .05, .08); }); }
    function aFlag() { tone(659, .08, "square", 0); tone(988, .1, "square", .07); }
    function aWin() {[523, 659, 784, 1046, 1319].forEach(function (f, i) { tone(f, .13, "square", i * .1); }); }
    function aGameOver() {[440, 392, 330, 262].forEach(function (f, i) { tone(f, .3, "triangle", i * .24, .13); }); tone(196, .5, "sawtooth", .96, .1); tone(131, .7, "triangle", .96, .07); }   // sad descending "you lost" sting
    // ---- power-up sounds (each instance gets its own voice) ----
    function aGrow() { for (var i = 0; i < 7; i++) tone(196 + i * 70, .08, "square", i * .05, .1); tone(147, .22, "square", .36, .12); }   // magnifying "grow" sweep
    function aShrink() {[659, 523, 415, 330, 247].forEach(function (f, i) { tone(f, .08, "square", i * .05, .1); }); }                     // shrink (reverse)
    function aWings() {[523, 659, 587, 784, 698, 988].forEach(function (f, i) { tone(f, .07, "triangle", i * .045, .09); }); }             // airy flutter up
    function aHeart() { tone(659, .12, "sine", 0, .1); tone(988, .18, "sine", .1, .09); tone(784, .12, "sine", .22, .07); }                // warm chime
    function aBlast() {[880, 1175, 1568].forEach(function (f, i) { tone(f, .09, "square", i * .04, .09); }); tone(2093, .12, "sine", .12, .07); } // answer-blast (planned)
    function aFrost() {[1568, 1319, 1047, 1319, 1568].forEach(function (f, i) { tone(f, .07, "triangle", i * .05, .08); }); }              // frost/ice (planned)
    function aBoing() { tone(196, .06, "square", 0, .1); tone(392, .08, "square", .04, .1); tone(784, .1, "square", .1, .09); }             // springboard bounce
    function aSwing() { for (var i = 0; i < 5; i++) tone(300 + i * 130, .06, "triangle", i * .035, .09); }                                  // vine swing whoosh
    // warp dive: a rising shimmer that whooshes up as the hero spirals into the portal
    function aWarp() { for (var i = 0; i < 8; i++) tone(440 + i * 90, .07, "triangle", i * .045, .09); tone(1400, .18, "sine", .38, .08); }
    // secret arrival: a soft magical bell chord (distinct, dreamy — different from the world SFX)
    function aSecret() {[659, 988, 1319, 1568].forEach(function (f, i) { tone(f, .5, "triangle", i * .09, .09); }); tone(494, .7, "sine", 0, .05); }

    /* ---- input ---- */
    function jump() {
      if (!G || G.state !== "run") return; var h = G.hero, v1 = G.jumpBoost ? -1180 : -1020, v2 = G.jumpBoost ? -1060 : -900;
      if (G.floaty) { v1 = Math.round(v1 * 0.8); v2 = Math.round(v2 * 0.82); }   // gentler push underwater (low gravity keeps you afloat)
      else if (G.moon) { v1 = Math.round(v1 * 0.72); v2 = Math.round(v2 * 0.78); }   // moon: low gravity → long floaty jumps
      if (h.ground || h.coyote > 0) { h.vy = v1; h.ground = false; h.coyote = 0; h.dbl = false; h.hold = true; aJump(); }
      else if (!h.dbl) { h.vy = v2; h.dbl = true; h.hold = true; aDbl(); puff(h.wx, h.y - 40); }
    }
    function jumpRelease() { var h = G && G.hero; if (h) { h.hold = false; if (h.vy < 0) h.vy *= .5; } }
    function mdisp() { var d = $("#adv-mdisp"); if (G.input === "") { d.textContent = "?"; d.classList.add("ph"); } else { d.textContent = G.input; d.classList.remove("ph"); } }
    function key(k) {
      if (!G || (G.state !== "gate" && G.state !== "trapped")) return;
      if (k === "del") { G.input = G.input.slice(0, -1); mdisp(); return; }
      if (k === "enter") { if (G.input !== "") submit(parseInt(G.input, 10)); return; }
      if (G.input.length >= 3) return; if (G.input === "" && k === "0") return;
      G.input += k; mdisp();
      if (parseInt(G.input, 10) === qAns(G.question)) submit(qAns(G.question));
    }
    function addCoins(n) { G.coins += n; progress.coins = (progress.coins || 0) + n; }
    function submit(v) { if (G.state === "trapped") { escapeSubmit(v); return; }
      var q = G.question, ans = qAns(q), ms = Date.now() - G.qStart, correct = v === ans, box = $("#adv-mabox");
      var justMet = recordAnswer(q.a, q.b, correct, ms); if (justMet) G.goalMet = true;
      if (correct) {
        box.className = "good"; aGood(); haptic(12);
        var heG = $("#adv-mhint"); if (heG) { heG.textContent = ""; heG.className = "adv8-hint"; }
        G.gates[G.nextGate].solved = true; G.correct++; G.combo++;
        var spd = ms < 1500 ? 8 : ms < 3000 ? 5 : ms < 5000 ? 2 : 0;
        var gained = Math.round((10 + spd) * (1 + Math.min(G.combo, 6) * .08));
        progress.xp += gained; G.xpEarned += gained; addCoins(5); coinBurst(G.hero.wx, G.hero.y - 50); save();
        // streak meter: fast answers fill it faster; full meter = free Streak Star
        G.meter += ms < 2500 ? 0.34 : ms < 4500 ? 0.25 : 0.14;
        if (G.meter >= 1) { G.meter = 0; applyPowerup("star"); }
        setTimeout(function () {
          if (!running || !G) return; mathHide(); box.className = ""; G.state = "run"; G.dash = .85; G.nextGate++; G.input = "";
          hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : "NICE! KEEP GOING");
        }, 380);
      } else {
        G.wrong++; G.combo = 0; G.meter = 0; G.hearts--; box.className = "bad"; aBad(); haptic([10, 40, 10]); G.shakeT = .35;
        // gentle coaching: a directional nudge first, then reveal the skip-count if they miss again — you stay at the gate to retry
        G.gateTries = (G.gateTries || 0) + 1;
        var heB = $("#adv-mhint");
        if (heB && G.hearts > 0) { var reveal = G.gateTries >= 2; heB.textContent = gateHint(q, v, reveal); heB.className = "adv8-hint" + (reveal ? " reveal" : ""); }
        G.input = ""; mdisp(); save();
        if (G.hearts <= 0) setTimeout(function () { if (!G) return; mathHide(); G.state = "fail"; openOv("adv-failOv"); }, 420);
      }
    }
    // ---- traps: caught => solve a bonus question to escape; fail => lose a life and restart the level ----
    function bonusQ() { var q = buildQuestions(focusTables(), 1)[0]; return q || { a: 2, b: 3 }; }
    function setSheetTag(t) { var tag = $("#adv-sheet .adv8-tag"); if (tag) tag.textContent = t; }
    function springTrap(i) {
      var tr = G.traps[i]; if (!tr) return; tr.sprung = true; G.trapIndex = i;
      G.hero.wx = tr.x; G.hero.vy = 0; G.hero.y = GROUND; G.hero.ground = true;
      G.state = "trapped"; G.question = bonusQ(); G.input = ""; G.qStart = Date.now();
      aHurt(); haptic([20, 40, 20]); G.shakeT = .4; musicDanger();
      $("#adv-sheet").classList.add("escape"); setSheetTag("◆ " + (TRAP_LABEL[tr.type] || "TRAPPED!") + " — SOLVE TO ESCAPE ◆");
      G.gateTries = 0; var heS = $("#adv-mhint"); if (heS) { heS.textContent = ""; heS.className = "adv8-hint"; }
      $("#adv-mq").textContent = G.question.a + " × " + G.question.b; mdisp(); mathShow(); hint("");
    }
    function endEscape() { $("#adv-sheet").classList.remove("escape"); setSheetTag("◆ GATE — SOLVE TO PASS ◆"); mathHide(); }
    function restartLevel() { var hh = G.hearts; reset(level, hh); hudShow(true); hint("RESTART! TRY AGAIN"); musicWorld(level); }
    function escapeSubmit(v) {
      var q = G.question, ans = q.a * q.b, ms = Date.now() - G.qStart, correct = v === ans, box = $("#adv-mabox");
      recordAnswer(q.a, q.b, correct, ms);
      if (correct) {
        box.className = "good"; aGood(); haptic(12); musicWorld(level);
        var tr = G.traps[G.trapIndex]; if (tr) tr.done = true;
        addCoins(3); coinBurst(G.hero.wx, G.hero.y - 50);
        setTimeout(function () { if (!running || !G) return; box.className = ""; endEscape(); G.state = "run"; G.hero.inv = 1.6; G.hero.wx += 46; G.dash = .4; G.input = ""; hint("PHEW! KEEP GOING"); }, 360);
      } else {
        G.wrong++; G.hearts--; box.className = "bad"; aBad(); haptic([12, 50, 12]); G.shakeT = .4;
        var heX = $("#adv-mhint"); if (heX) { heX.textContent = mathHint(q.a, q.b, v); heX.className = "adv8-hint"; }
        G.input = ""; mdisp(); save();
        setTimeout(function () {
          if (!G) return; box.className = ""; endEscape();
          if (G.hearts <= 0) { G.state = "fail"; musicStop(); openOv("adv-failOv"); } else restartLevel();
        }, 620);
      }
    }

    function puff(wx, y) { for (var i = 0; i < 7; i++) G.particles.push({ wx: wx, y: y, vx: (Math.random() * 2 - 1) * 90, vy: -(Math.random() * 130 + 40), life: .5, kind: "puff" }); }
    function coinBurst(wx, y) { for (var i = 0; i < 9; i++) G.particles.push({ wx: wx, y: y, vx: (Math.random() * 2 - .4) * 160, vy: -(Math.random() * 260 + 120), life: .9, kind: "coin" }); }
    function sparkle(wx, y) { for (var i = 0; i < 2; i++) G.particles.push({ wx: wx + (Math.random() * 50 - 25), y: y - Math.random() * 40, vx: (Math.random() * 2 - 1) * 40, vy: -(Math.random() * 60 + 20), life: .5, kind: "star" }); }
    function groundAt(wx) { for (var i = 0; i < G.grounds.length; i++) { var s = G.grounds[i]; if (wx >= s[0] && wx <= s[1]) return true; } return false; }
    // rolling ground: the walkable surface Y at wx (GROUND minus a smooth bump for each hill region). Flat elsewhere.
    function groundY(wx) { var y = GROUND; if (G.hills) for (var i = 0; i < G.hills.length; i++) { var hh = G.hills[i]; if (wx >= hh.x0 && wx <= hh.x1) { var t = (wx - hh.x0) / (hh.x1 - hh.x0); y -= hh.h * (0.5 - 0.5 * Math.cos(t * 6.2831853)); } } return y; }
    function platTop(p) { var ha = p.mv ? p.hAbove + Math.sin(G.t * 2 * Math.PI / p.period + p.phase) * p.amp : p.hAbove; return GROUND - ha; }
    function nextQ() { var d = G.deck; if (!d.length) return { a: 2, b: 2 }; var q = d[G.deckI % d.length]; G.deckI++; return q; }
    // missing-number support: a question may hide a factor ("5 × ? = 25"); the typed answer is that factor
    function qShown(q) { if (q.hide === "a") return "? × " + q.b + " = " + (q.a * q.b); if (q.hide === "b") return q.a + " × ? = " + (q.a * q.b); return q.a + " × " + q.b; }
    function qAns(q) { return q.hide === "a" ? q.a : q.hide === "b" ? q.b : q.a * q.b; }
    function gateHint(q, guess, reveal) {
      if (q.hide) {
        var target = qAns(q), shown = q.hide === "a" ? q.b : q.a, prod = q.a * q.b;
        if (reveal) return "count by " + shown + "s to " + prod + ": " + countByStr(shown, target) + " → that's " + target;
        return guess > target ? "A little too high — try a smaller number ⬇" : "A little too low — try a bigger number ⬆";
      }
      return reveal ? skipCountReveal(q.a, q.b) : mathHint(q.a, q.b, guess);
    }

    function hideAllOv() { ["adv-mapOv", "adv-winOv", "adv-failOv"].forEach(function (id) { $("#" + id).classList.add("hidden"); }); }
    function openOv(id) { hideAllOv(); $("#" + id).classList.remove("hidden"); hudShow(false); mathHide(); if (id === "adv-failOv") { fillFailHearts(); aGameOver(); } }
    function fillFailHearts() {
      var box = $("#adv-fail-hearts"); if (!box) return; box.innerHTML = "";
      for (var i = 0; i < 3; i++) { var c = document.createElement("canvas"); c.width = 8; c.height = 8; var g = c.getContext("2d"); g.imageSmoothingEnabled = false; heartPix(g, false); box.appendChild(c); }
    }
    function hudShow(v) { ["adv-hud", "adv-pmap", "adv-tapHint", "adv-quit"].forEach(function (id) { $("#" + id).classList.toggle("hidden", !v); }); }
    function mathShow() { $("#adv-math").classList.remove("hidden"); }
    function mathHide() { $("#adv-math").classList.add("hidden"); }
    function hint(t) { var e = $("#adv-tapHint"); e.textContent = t; e.classList.toggle("hidden", !t); }
    function startLevel(n) { hideAllOv(); reset(n); hudShow(true); hint("TAP = JUMP · HOLD = HIGHER · TAP AGAIN = DOUBLE"); musicWorld(n); }

    /* ---- loop (physics) ---- */
    var last = 0;
    function frame(ts) {
      if (!running) { looping = false; return; }
      var dt = Math.min(.045, (ts - (last || ts)) / 1000); last = ts;
      if (G) {
        if (G.enterPending && !G.secretWorld) { var __ew = G.enterPending; G.enterPending = 0; enterSecret(__ew); }
        G.cloud += dt * 14; G.t += dt; var h = G.hero;
        if (G.state === "run") {
          var zoneMul = 1; if (G.speedZones) { for (var zi = 0; zi < G.speedZones.length; zi++) { var zz = G.speedZones[zi]; if (h.wx >= zz.x0 && h.wx <= zz.x1) { zoneMul = zz.mult; break; } } }
          var sp = G.speed * (1 + G.dash) * zoneMul; G.dash = Math.max(0, G.dash - dt * 1.6); h.wx += sp * dt; h.run += dt * sp * .03;
          if (G.flyT > 0) { h.vy += (h.hold ? -1500 : 950) * dt; if (h.vy < -320) h.vy = -320; if (h.vy > 440) h.vy = 440; } else { var g = (h.hold && h.vy < 0) ? 1500 : 2700; if (G.floaty) g *= 0.5; else if (G.moon) g *= 0.34; h.vy += g * dt; var vcap = G.floaty ? 250 : G.moon ? 300 : 1e9; if (h.vy > vcap) h.vy = vcap; }
          if (h.coyote > 0) h.coyote -= dt; if (h.inv > 0) h.inv -= dt; if (h.power > 0) h.power = Math.max(0, h.power - dt); if (G.bigT > 0) G.bigT -= dt; if (G.flyT > 0) G.flyT -= dt; if (G.popT > 0) G.popT -= dt; if (G.frostT > 0) G.frostT -= dt;
          var ny = h.y + h.vy * dt, landTop = null;
          for (var i = 0; i < G.platforms.length; i++) { var p = G.platforms[i]; var top = platTop(p); if (h.wx >= p.x && h.wx <= p.x + p.w && h.vy >= 0 && h.y <= top + 4 && ny >= top) { if (landTop === null || top < landTop) landTop = top; } }
          for (var bi2 = 0; bi2 < G.bricks.length; bi2++) { var brk2 = G.bricks[bi2]; if (brk2.used) continue; var bt2 = GROUND - brk2.hAbove; if (h.wx >= brk2.x && h.wx <= brk2.x + brk2.w && h.vy >= 0 && h.y <= bt2 + 4 && ny >= bt2) { if (landTop === null || bt2 < landTop) landTop = bt2; } }
          for (var pi2 = 0; pi2 < G.pipes.length; pi2++) { var pp2 = G.pipes[pi2]; var ptp2 = GROUND - pp2.h; if (h.wx >= pp2.x - 2 && h.wx <= pp2.x + pp2.w + 2 && h.vy >= 0 && h.y <= ptp2 + 4 && ny >= ptp2) { if (landTop === null || ptp2 < landTop) landTop = ptp2; } }
          if (landTop === null) {
            if (G.hills && G.hills.length) {                       // rolling ground: glue to the undulating surface (up & down)
              if (groundAt(h.wx) || TEST) { var gy0 = groundY(h.wx); if (h.ground && h.vy >= 0) landTop = gy0; else if (h.vy >= 0 && ny >= gy0 - 2) landTop = gy0; }
            } else if ((groundAt(h.wx) || TEST) && h.vy >= 0 && ny >= GROUND && h.y <= GROUND + 4) landTop = GROUND;
          }
          if (landTop !== null) { h.y = landTop; h.vy = 0; h.ground = true; h.dbl = false; h.coyote = .1; } else { if (h.ground) h.coyote = .1; h.ground = false; h.y = ny; }
          // Candy springboards: landing on one launches you high
          for (var spi = 0; spi < G.springs.length; spi++) { var spr = G.springs[spi]; if (spr.t > 0) spr.t -= dt; if (h.ground && Math.abs(spr.x - h.wx) < 30 && h.y >= GROUND - 6) { h.vy = -1580; h.ground = false; h.dbl = false; h.coyote = 0; spr.t = 0.34; aBoing(); haptic(14); } }
          // Snow icicles: drop ahead of you — only DANGEROUS while dropping; once settled on the floor it's a spent spike you can run right over
          for (var ici = 0; ici < G.icicles.length; ici++) { var icc = G.icicles[ici]; if (icc.done) continue; if (!icc.falling && h.wx > icc.x - 230 && h.wx < icc.x) icc.falling = true; if (icc.falling && !icc.landed && G.frostT <= 0) { icc.vy += 1500 * dt; icc.y += icc.vy * dt; if (!TEST && h.inv <= 0 && Math.abs(icc.x - h.wx) < 26 && (icc.y + 42) > (h.y - 46) && icc.y < h.y) { hurt(); icc.done = true; continue; } if (icc.y >= GROUND - 22) { icc.y = GROUND - 22; icc.landed = true; aStomp(); G.shakeT = Math.max(G.shakeT, .12); } } }
          // Meadow hawks — hover, then dive straight down as you come near; jump over the diving bird to dodge
          for (var hwi = 0; G.hawks && hwi < G.hawks.length; hwi++) {
            var hw = G.hawks[hwi];
            if (hw.state === "hover") { hw.y = GROUND - 220 + Math.sin(G.t * 3 + hw.phase) * 12; if (h.wx > hw.x - 120 && h.wx < hw.x - 8) { hw.state = "dive"; hw.vy = 120; } }
            else if (hw.state === "dive") { hw.vy += 1150 * dt; hw.y += hw.vy * dt; if (!TEST && h.inv <= 0 && Math.abs(hw.x - h.wx) < 32 && (hw.y + 22) > (h.y - 46) && hw.y < h.y + 10) hurt(); if (hw.y >= GROUND - 26) { hw.y = GROUND - 26; hw.state = "rise"; } }
            else { hw.y -= 240 * dt; if (hw.y <= GROUND - 220) { hw.y = GROUND - 220; hw.state = "hover"; } }
          }
          // Beach jellyfish — slow vertical bob; jump over one when it's low, run under when it's high
          for (var jli = 0; G.jellies && jli < G.jellies.length; jli++) {
            var jl = G.jellies[jli];
            jl.y = GROUND - jl.mid + Math.sin(G.t * 1.6 + jl.phase) * jl.amp;
            if (!TEST && h.inv <= 0 && h.power <= 0 && G.bigT <= 0 && Math.abs(jl.x - h.wx) < 28 && (jl.y + 26) > (h.y - 96) && (jl.y - 14) < h.y) hurt();
          }
          // Ocean bubbles rising past you
          if (G.floaty) { if (Math.random() < 0.5) G.bubbles.push({ wx: h.wx + (Math.random() * 2 - 0.6) * (PIXW / sx), y: GROUND + 30, vy: -(45 + Math.random() * 70), r: 1.5 + Math.random() * 4 }); for (var bu = G.bubbles.length - 1; bu >= 0; bu--) { var bb = G.bubbles[bu]; bb.y += bb.vy * dt; bb.wx += Math.sin(G.t * 3 + bb.y * 0.08) * 0.4; if (bb.y < 30 || G.bubbles.length > 60) G.bubbles.splice(bu, 1); } }
          // Jungle vines: grab one mid-jump for a big forward fling across the gap
          for (var vni = 0; vni < G.vines.length; vni++) { var vn = G.vines[vni]; if (vn.used) continue; if (!h.ground && h.wx > vn.x - 40 && h.wx < vn.x + 26 && h.vy > -140) { vn.used = true; h.vy = -780; G.dash = Math.max(G.dash, 1.0); aSwing(); haptic(12); } }
          // Volcano fire-bars: rotating flames that hurt on contact (frozen by Frost Snap)
          for (var fbi = 0; fbi < G.firebars.length; fbi++) { var fbr = G.firebars[fbi]; if (Math.abs(fbr.x - h.wx) > fbr.len + 34) continue; var fang = G.t * fbr.spd + fbr.phase; for (var fseg = 0.32; fseg <= 1.001; fseg += 0.22) { var fxp = fbr.x + Math.cos(fang) * fbr.len * fseg, fyp = fbr.cy + Math.sin(fang) * fbr.len * fseg; if (!TEST && h.inv <= 0 && G.frostT <= 0 && Math.abs(fxp - h.wx) < 26 && Math.abs(fyp - (h.y - 30)) < 30) { hurt(); break; } } }
          // secret warp: just jump while under the golden portal and it pulls you in (very forgiving — no precise landing)
          if (G.warp && !G.warp.done && !h.ground && h.wx > G.warp.x0 && h.wx < G.warp.x1) { G.warp.done = true; startWarp(level); }
          // SKIP HOP: leap up to a marked skip platform (very forgiving — reach its height near it) and its portal's problem is skipped
          for (var ski = 0; ski < G.platforms.length; ski++) { var skp = G.platforms[ski]; if (!skp.skip || skp.used) continue; if (h.wx > skp.x - 16 && h.wx < skp.x + skp.w + 16 && h.y <= platTop(skp) + 24) { skp.used = true; skipGate(skp.gi); break; } }
          var headY = h.y - HEROSIZE * 0.9;
          for (var b = 0; b < G.boxes.length; b++) { var bx = G.boxes[b]; if (bx.used) continue; var by = GROUND - bx.hAbove; if (h.vy < 0 && h.wx >= bx.x - 8 && h.wx <= bx.x + bx.w + 8 && headY <= by + bx.h && headY >= by - 12) { bx.used = true; bx.pop = .2; h.vy = 80; if (bx.power) { spawnPowerup(bx.x + bx.w / 2, by - 20); } else { addCoins(1); aCoin(); G.particles.push({ wx: bx.x + bx.w / 2, y: by - 14, vx: 0, vy: -220, life: .7, kind: "coin" }); } } }
          for (var bkr = 0; bkr < G.bricks.length; bkr++) { var bk = G.bricks[bkr]; if (bk.used) continue; var bky = GROUND - bk.hAbove; if (h.vy < 0 && h.wx >= bk.x - 8 && h.wx <= bk.x + bk.w + 8 && headY <= bky + bk.h && headY >= bky - 12) { if (G.bigT > 0) { bk.used = true; aStomp(); coinBurst(bk.x + bk.w / 2, bky); } else { h.vy = 80; if (!bk.tapped) { bk.tapped = true; addCoins(1); aCoin(); } } } }
          // pipes: the hero auto-bounds over them (kid-friendly — you can also jump early to land on top for coins)
          for (var pbk = 0; pbk < G.pipes.length; pbk++) { var pz = G.pipes[pbk]; if (h.ground && h.wx > pz.x - 70 && h.wx < pz.x - 22) { jump(); } }
          if (G.star && !G.star.taken) { var syv = GROUND - G.star.hAbove; if (Math.abs(G.star.x - h.wx) < 50 && Math.abs(syv - (h.y - 40)) < 66) { G.star.taken = true; h.power = 6.5; aStar(); haptic([12, 30, 12]); } }
          var mag = h.power > 0 || G.magnet;
          for (var k = 0; k < G.coinsA.length; k++) { var co = G.coinsA[k]; if (co.got) continue; var cy = GROUND - co.hAbove; var dx = co.x - h.wx, dy = cy - (h.y - 40); if (mag && Math.abs(dx) < 300 && Math.abs(dy) < 300) { co.x -= dx * Math.min(1, dt * 9); co.hAbove += dy * Math.min(1, dt * 9); } if (Math.abs(co.x - h.wx) < 38 && Math.abs((GROUND - co.hAbove) - (h.y - 40)) < 54) { co.got = true; addCoins(1); aCoin(); } }
          for (var e = 0; e < G.enemies.length; e++) { var en = G.enemies[e]; if (!en.alive) continue; if (G.frostT <= 0) { en.x += en.dir * G.cf.enemySpeed * dt; if (en.x < en.x1) { en.x = en.x1; en.dir = 1; } if (en.x > en.x2) { en.x = en.x2; en.dir = -1; } } var eTop = GROUND - 52; if (Math.abs(en.x - h.wx) < 40) { if (h.power > 0 || G.bigT > 0) { en.alive = false; addCoins(3); aStomp(); coinBurst(en.x, eTop); } else if (h.vy > 0 && h.y <= eTop + 22 && h.y >= eTop - 40) { en.alive = false; h.vy = -620; addCoins(3); aStomp(); haptic(15); coinBurst(en.x, eTop); } else if (!TEST && h.inv <= 0 && G.frostT <= 0 && h.y > eTop - 28) { hurt(); } } }
          // shiny purple coins (magnetised while super)
          for (var gm = 0; gm < G.gemsA.length; gm++) { var ge = G.gemsA[gm]; if (ge.got) continue; var gyv = GROUND - ge.hAbove; var gdx = ge.x - h.wx, gdy = gyv - (h.y - 40); if (mag && Math.abs(gdx) < 320 && Math.abs(gdy) < 320) { ge.x -= gdx * Math.min(1, dt * 8); ge.hAbove += gdy * Math.min(1, dt * 8); } if (Math.abs(ge.x - h.wx) < 42 && Math.abs((GROUND - ge.hAbove) - (h.y - 40)) < 60) { ge.got = true; progress.gems = (progress.gems || 0) + 1; G.gemRun++; aStar(); haptic([10, 20, 10]); coinBurst(ge.x, GROUND - ge.hAbove); save(); } }
          // traps: run into one on the ground and you're caught (jump over to dodge; smash through while super)
          for (var tp = 0; tp < G.traps.length; tp++) { var trp2 = G.traps[tp]; if (trp2.done) continue; if (Math.abs(trp2.x - h.wx) < 34 && h.y > GROUND - 26) { if (h.power > 0 || G.bigT > 0) { trp2.done = true; addCoins(2); aStomp(); coinBurst(trp2.x, GROUND - 40); } else if (G.shield) { G.shield = false; trp2.done = true; h.inv = 1.2; aStar(); haptic([10, 30, 10]); coinBurst(trp2.x, GROUND - 40); hint("SHIELD SAVED YOU!"); } else if (!TEST && h.inv <= 0) { springTrap(tp); break; } } }
          for (var fsh = 0; fsh < G.fish.length; fsh++) { var fz = G.fish[fsh]; var fph = Math.sin((G.t / fz.period + fz.phase) * Math.PI * 2); if (fph > 0) { var ffy = GROUND - fph * fz.amp; if (!TEST && h.inv <= 0 && h.power <= 0 && G.bigT <= 0 && G.frostT <= 0 && Math.abs(fz.x - h.wx) < 42 && Math.abs(ffy - (h.y - 40)) < 52) hurt(); } }
          for (var f = 0; f < G.flags.length; f++) { var fl = G.flags[f]; if (!fl.hit && h.wx >= fl.x) { fl.hit = true; G.lastCP = fl.x; aFlag(); } }
          if (G.chest && !G.chest.taken && Math.abs(G.chest.x - h.wx) < 46) { G.chest.taken = true; aWin(); haptic([12, 30, 12]); for (var cg = 0; cg < 10; cg++) G.particles.push({ wx: G.chest.x, y: GROUND - 40, vx: (cg - 5) * 60, vy: -260 - cg * 12, life: 1, kind: "star" }); }
          if (h.y > GROUND + 420) respawn();
          if (G.showdown && !G.showdown.done && h.wx >= G.showdown.x) { if (TEST) G.showdown.done = true; else { enterShowdown(); } }
          if (G.nextGate < G.gates.length) { var ga = G.gates[G.nextGate]; if (!ga.solved && h.wx >= ga.x - 52) { h.wx = ga.x - 52; if (ga.mode === "lane" && !TEST) enterLanes(); else if (ga.mode === "asteroid" && !TEST) enterAst(); else if (MINI_ENTER[ga.mode] && !TEST) MINI_ENTER[ga.mode](); else arrive(); } } else if (h.wx >= G.castleX - 80) { if (G.secretWorld) winSecret(); else winStart(); }
          if (h.power > 0 && Math.random() < .5) sparkle(h.wx, h.y - HEROSIZE * 0.4);
        }
        if (G.state === "celebrate") celebrateStep(dt);
        if (G.state === "showdown") sdStep(dt);
        if (G.state === "lanes") laneStep(dt);
        if (G.state === "asteroid") astStep(dt);
        if (G.mini && G.state === G.mini.key) G.mini.step(dt);
        if (G.state === "warping") warpStep(dt);
        for (var f2 = 0; f2 < G.flags.length; f2++) { var fg = G.flags[f2]; if (fg.hit && fg.raise < 1) fg.raise = Math.min(1, fg.raise + dt * 3); }
        for (var p2 = G.particles.length - 1; p2 >= 0; p2--) { var pt = G.particles[p2]; pt.wx += pt.vx * dt; pt.vy += 1600 * dt; pt.y += pt.vy * dt; pt.life -= dt * 1.1; if (pt.life <= 0) G.particles.splice(p2, 1); }
        if (G.shakeT > 0) G.shakeT -= dt; if (G.state !== "warping" || warpFX && warpFX.phase === "hop") G.cam = G.hero.wx - HEROX; draw(); drawWarpFX(); hudUpdate();
        if (!diagFrames && (G.state === "run")) { diagFrames = 1; diagPlay(); }
      }
      requestAnimationFrame(frame);
    }
    var diagFrames = 0;
    // Diagnostic: once gameplay is running, confirm the main canvas actually painted on this device.
    function diagPlay() {
      try {
        if (!cv) return; var g2 = cv.getContext("2d");
        if (!g2 || !cv.width || !cv.height) { __diag("GAME CANVAS not ready: " + cv.width + "x" + cv.height + " ctx=" + (!!g2)); return; }
        var cssBad = (cv.clientWidth < 50 || cv.clientHeight < 50), blank = true;
        var sw = Math.min(cv.width, 48), sh = Math.min(cv.height, 48);
        var d = g2.getImageData(0, 0, sw, sh).data;
        for (var i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 24) { blank = false; break; } }
        if (DIAG || blank || cssBad) {
          diagTestBox();
          __diag((blank || cssBad ? "GAME DID NOT PAINT" : "GAME DIAG (?diag=1)") + "\n" +
            "backing " + cv.width + "x" + cv.height + "  css " + cv.clientWidth + "x" + cv.clientHeight + "\n" +
            "blank=" + blank + "  dpr=" + (window.devicePixelRatio || 1) + "  canvases=" + document.querySelectorAll("canvas").length + "\n" +
            "See a red TEST box bottom-left? " + (DIAG ? "(should be there)" : "") + "\n" +
            "ua=" + navigator.userAgent);
        }
      } catch (e) { __diag("GAME CHECK THREW: " + (e && e.message)); }
    }
    function hurt() { if (G.bigT > 0) { G.bigT = 0; G.hero.inv = 1.3; G.shakeT = .25; aShrink(); haptic(20); showPow("SHRANK!"); return; } G.hearts--; G.hero.inv = 1.3; G.hero.vy = -460; G.shakeT = .3; aHurt(); haptic([12, 40, 12]); if (G.hearts <= 0) { G.state = "fail"; musicStop(); openOv("adv-failOv"); } }
    // ---- power-ups (from ? boxes and the math-streak meter) ----
    function showPow(t) { G.popTxt = t; G.popT = 1.7; hint(t); }
    function spawnPowerup(px, py) { var r = Math.random(); var kind = r < 0.26 ? "berry" : r < 0.44 ? "wings" : r < 0.58 ? "heart" : r < 0.72 ? "star" : r < 0.87 ? "blaster" : "frost"; applyPowerup(kind); G.particles.push({ wx: px, y: py, vx: 0, vy: -170, life: .9, kind: "star" }); }
    function applyPowerup(kind) {
      var h = G.hero, vis = PIXW / sx;
      if (kind === "berry") { G.bigT = 8; showPow("POWER BERRY — BIG!"); aGrow(); }
      else if (kind === "wings") { G.flyT = 5; showPow("SKY WINGS — FLY!"); aWings(); }
      else if (kind === "heart") { G.hearts = Math.min(G.maxHearts, G.hearts + 1); showPow("EXTRA HEART!"); aHeart(); }
      else if (kind === "blaster") { var cl = 0; for (var ei = 0; ei < G.enemies.length; ei++) { var en2 = G.enemies[ei]; if (en2.alive && Math.abs(en2.x - h.wx) < vis) { en2.alive = false; cl++; coinBurst(en2.x, GROUND - 50); } } for (var ti = 0; ti < G.traps.length; ti++) { var tr2 = G.traps[ti]; if (!tr2.done && Math.abs(tr2.x - h.wx) < vis) { tr2.done = true; cl++; coinBurst(tr2.x, GROUND - 40); } } addCoins(cl * 2); showPow("ANSWER BLASTER — ZAP!"); aBlast(); G.shakeT = .3; }
      else if (kind === "frost") { G.frostT = 5; showPow("FROST SNAP — FREEZE!"); aFrost(); }
      else { h.power = 6.5; showPow("STREAK STAR — GO!"); aStar(); }
      haptic([10, 25, 10]);
    }
    function respawn() { var h = G.hero; h.wx = G.lastCP; h.y = GROUND; h.vy = 0; h.inv = 1; h.ground = true; }
    function arrive() { G.state = "gate"; G.question = nextQ(); G.input = ""; G.qStart = Date.now(); G.gateTries = 0; var heN = $("#adv-mhint"); if (heN) { heN.textContent = ""; heN.className = "adv8-hint"; } mdisp(); $("#adv-mq").textContent = qShown(G.question); mathShow(); hint(""); }
    // SKIP HOP: you reached the skip platform above a portal — pass that math problem for free (no coins/combo; the reward is the leap itself)
    function skipGate(gi) {
      if (gi == null || gi !== G.nextGate) return;
      var ga = G.gates[gi]; if (!ga || ga.solved) return;
      ga.solved = true; ga.skipped = true; G.nextGate++;
      var h = G.hero; h.wx = ga.x + 46; h.vy = -420; h.ground = false; h.dbl = true; h.inv = 1.0; G.dash = Math.max(G.dash, .7); G.cam = h.wx - HEROX;
      aWin(); haptic([10, 24, 10]); showPow("SKIPPED!");
      for (var i = 0; i < 12; i++) G.particles.push({ wx: ga.x, y: GROUND - 130, vx: (i - 6) * 55, vy: -230 - i * 8, life: 1, kind: i % 2 ? "star" : "puff" });
      hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : "SKIPPED — HOP ON!");
    }
    // Reaching the castle now kicks off an in-game fireworks celebration (SMB-style) before the results screen.
    function winStart() {
      if (G.state === "celebrate" || G.state === "win") return;
      if (TEST) { win(); return; }                       // tests skip the celebration and go straight to results
      G.state = "celebrate"; musicStop(); aWin(); haptic([15, 60, 15, 60, 15]);
      G.celebT = 0; G.nextFw = 0; G.fireworks = [];
      G.hero.hold = false; if (G.hero.ground) G.hero.vy = -520, G.hero.ground = false;   // a little victory hop
    }
    function aFwPop() { tone(784, .05, "square", 0, .05); tone(1319, .09, "square", .04, .045); tone(1047, .06, "triangle", .02, .04); }
    function fwBurst(cx, cy) {
      var pal = ["#ff3d81", "#ffd23f", "#12c8d6", "#27c96a", "#8a5bff", "#ff8a3f", "#ffffff"];
      var col = pal[Math.floor(Math.random() * pal.length)];
      G.fireworks.push({ x: cx, y: cy, flash: 0.14 });
      for (var i = 0; i < 22; i++) { var a = i / 22 * 6.2831853 + Math.random() * 0.3, sp = 95 + Math.random() * 135; G.fireworks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 34, life: 1 + Math.random() * 0.5, col: col, spark: true }); }
      aFwPop();
    }
    function celebrateStep(dt) {
      G.celebT += dt; G.nextFw -= dt;
      var h = G.hero; if (!h.ground) { h.vy += 2700 * dt; h.y += h.vy * dt; if (h.y >= GROUND) { h.y = GROUND; h.vy = 0; h.ground = true; } }   // land the victory hop
      if (G.nextFw <= 0 && G.celebT < 2.15) { G.nextFw = 0.3; fwBurst(G.hero.wx + (Math.random() * 2 - 1) * 280, GROUND - 210 - Math.random() * 170); }
      for (var i = G.fireworks.length - 1; i >= 0; i--) { var f = G.fireworks[i]; if (!f.spark) { if (f.flash != null) { f.flash -= dt; if (f.flash <= 0) G.fireworks.splice(i, 1); } continue; } f.x += f.vx * dt; f.vy += 250 * dt; f.y += f.vy * dt; f.life -= dt * 0.85; if (f.life <= 0) G.fireworks.splice(i, 1); }
      if (G.celebT >= 2.7) win();
    }
    function win() {
      G.state = "win"; musicStop(); aWin(); haptic([15, 60, 15, 60, 15]);
      var lost = G.maxHearts - G.hearts, stars = lost === 0 ? 3 : lost <= 1 ? 2 : 1, perfect = G.wrong === 0;
      if (perfect) { progress.xp += 20; G.xpEarned += 20; }
      if (level < MAXLEVELS && level >= (progress.worldsUnlocked || 1)) progress.worldsUnlocked = Math.min(MAXLEVELS, level + 1);
      unlocked = Math.max(unlocked, progress.worldsUnlocked || 1);
      var newly = evaluateBadges({ perfect: perfect, quizLen: G.gates.length }); save();
      var leveled = levelFromXp(progress.xp) > G.levelBefore;
      drawStarRow($("#adv-winStars"), stars);
      $("#adv-winTitle").textContent = stars === 3 ? "PERFECT!" : "LEVEL CLEAR!";
      var msg = "+" + G.xpEarned + " XP · " + G.coins + " COINS" + (G.gemRun ? " · " + G.gemRun + " PURPLE" : "") + (level < MAXLEVELS ? " · NEXT: " + THEMES[level % THEMES.length].name : " · ALL WORLDS DONE!");
      if (G.goalMet) msg = "DAILY GOAL DONE!  " + msg;
      $("#adv-winMsg").textContent = msg;
      var uw = $("#adv-winUnlocks"); uw.innerHTML = "";
      if (leveled) uw.appendChild(el("div", "badge-pop", "LEVEL " + levelFromXp(progress.xp) + "!"));
      newly.forEach(function (bd) { uw.appendChild(el("div", "badge-pop", bd.icon + " " + bd.name)); });
      $("#adv-nextBtn").style.display = (level < MAXLEVELS) ? "" : "none";
      $("#adv-mapBtn").textContent = "MAP";
      openOv("adv-winOv"); advBurst();
    }
    function advBurst() {
      var host = $("#adv-burst"); host.innerHTML = "";
      var pal = ["#5b3df0", "#ff3d81", "#ffb020", "#12c8d6", "#27c96a", "#8a5bff"];
      for (var i = 0; i < 46; i++) { var c = el("span", "confetti"); c.style.left = randInt(100) + "%"; c.style.background = pal[randInt(pal.length)]; c.style.animationDuration = (1.5 + Math.random() * 1.5) + "s"; c.style.animationDelay = (Math.random() * .3) + "s"; host.appendChild(c); }
      setTimeout(function () { host.innerHTML = ""; }, 3400);
    }

    /* ---- hidden "World B": a self-contained secret level reached via the warp portal ---- */
    function enterSecret(worldN) {
      var mainG = G;
      var retX = (mainG.warp ? mainG.warp.x1 : mainG.hero.wx) + SEG * 0.9;   // exit drops you ahead in the main level (a shortcut)
      var keepH = mainG.hearts;
      G = {
        cf: mainG.cf, theme: SECRET_THEME, state: "run", cam: 0, speed: 162, t: 0,
        maxHearts: mainG.maxHearts, hearts: keepH, coins: 0, gemRun: 0, nextGate: 0,
        power: mainG.power, jumpBoost: mainG.jumpBoost, shield: mainG.shield, magnet: mainG.magnet,
        hero: { wx: HEROX, y: GROUND, vy: 0, ground: true, hold: false, dbl: false, coyote: 0, inv: 1, power: mainG.magnet ? 0 : 0, run: 0 },
        question: null, input: "", lastCP: HEROX, particles: [], cloud: 0, shakeT: 0, dash: 0, qStart: 0,
        correct: 0, wrong: 0, combo: 0, xpEarned: 0, goalMet: false, levelBefore: levelFromXp(progress.xp), trapIndex: -1,
        deck: buildQuestions(focusTables(), 3), deckI: 0,
        grounds: [], platforms: [], boxes: [], bricks: [], pipes: [], coinsA: [], enemies: [], flags: [], gates: [], star: null, castleX: 0, props: [], flowers: [], traps: [], gemsA: [], powerups: [], fish: [], springs: [], icicles: [], bubbles: [], vines: [], firebars: [], speedZones: [], mushrooms: [], hills: [], hawks: [], fireworks: [], jellies: [],
        floaty: false, moon: false, frostT: 0, bigT: 0, flyT: 0, meter: 0, popT: 0, popTxt: "", warp: null, chest: null, secretWorld: worldN, enterPending: 0, returnTo: { g: mainG, x: retX }
      };
      buildSecretMap();
      buildPmap();
      showPow("MYSTIC COVE!");
      aSecret(); musicSecret();
    }
    function buildSecretMap() {
      var START = 700, gap = 1150, gx = [], i;
      for (i = 0; i < 3; i++) gx.push(START + i * gap);
      G.gates = gx.map(function (v) { return { x: v, solved: false }; });
      G.castleX = gx[gx.length - 1] + 950;
      G.grounds = [[-400, G.castleX + 600]];   // one solid boardwalk — forgiving, no killer pits
      G.flags = [{ x: HEROX, hit: true, raise: 1 }];
      for (i = 0; i < gx.length; i++) G.flags.push({ x: gx[i] - gap * 0.5, hit: false, raise: 0, half: true });
      // treasure everywhere: gem arcs, coin trails, a few ? boxes & platforms to play on
      for (var s = 0; s < gx.length; s++) {
        var b = gx[s] - gap;
        for (var k = 0; k < 5; k++) G.gemsA.push({ x: b + 260 + k * 66, hAbove: 150 + Math.round(Math.sin(k * 1.3) * 46), got: false });
        for (var c = 0; c < 6; c++) G.coinsA.push({ x: b + 560 + c * 42, hAbove: 60, got: false });
        G.boxes.push({ x: b + 420, hAbove: 150, w: 48, h: 44, used: false, power: true });
        G.platforms.push({ x: b + 120, hAbove: 210, w: 118, mv: false, amp: 0, period: 2, phase: 0 });
      }
      // big treasure chest just before the exit
      G.chest = { x: G.castleX - 240, taken: false };
      for (var g3 = 0; g3 < 9; g3++) G.gemsA.push({ x: G.chest.x - 70 + g3 * 20, hAbove: 120 + (g3 % 3) * 34, got: false });
      G.props = []; for (var pr = 0; pr < 40; pr++) G.props.push({ x: pr * 260 + ((pr * 53) % 120), s: 52 + ((pr * 37) % 26) });
    }
    function winSecret() {
      var w = G.secretWorld, ret = G.returnTo, hpts = G.hearts;
      progress.secretsFound = progress.secretsFound || {};
      var first = !progress.secretsFound[w];
      progress.secretsFound[w] = true;
      var chestGems = first ? 10 : 5; progress.gems = (progress.gems || 0) + chestGems;
      progress.xp += 15; save();
      var sc = SECRET_CHARS[w], newHero = first && !!sc;
      aWin(); haptic([15, 60, 15, 60, 15]);
      // seamlessly return to the main level, dropped at the next gate (skips the platforming after the portal — the shortcut payoff)
      G = ret.g;
      G.hearts = hpts;
      var dropX = (G.nextGate < G.gates.length) ? G.gates[G.nextGate].x - 56 : G.castleX - 90;
      G.hero.wx = dropX; G.hero.y = GROUND; G.hero.vy = 0; G.hero.ground = true; G.hero.inv = 1.4; G.cam = dropX - HEROX;
      G.state = "run";
      for (var cg = 0; cg < 14; cg++) G.particles.push({ wx: dropX, y: GROUND - 40, vx: (cg - 7) * 55, vy: -240 - cg * 10, life: 1.1, kind: cg % 2 ? "star" : "coin" });
      showPow(newHero ? ("NEW HERO: " + sc.name + "!") : ("TREASURE! +" + chestGems + " ◆"));
      if (newHero) buildCharRow();
      musicWorld(level);
    }

    /* ---- warp transition: hero visibly hops onto the portal, spins in, purple iris wipe, cove opens ---- */
    var warpFX = null;
    function startWarp(lvl) {
      musicStop(); hudShow(false);
      var h = G.hero; h.inv = 0; h.vy = 0; h.ground = true;
      warpFX = { phase: "hop", t: 0, level: lvl, scale: 1, spin: 0, hx: h.wx, hy: h.y, tx: G.warp.x, ty: G.warp.top };
      G.state = "warping"; aWarp(); haptic([10, 30, 10, 30, 20]);
    }
    function warpStep(dt) {
      if (!warpFX) return; var f = warpFX; f.t += dt; var h = G.hero;
      if (f.phase === "hop") {
        var k = Math.min(1, f.t / 0.42), e = k * k * (3 - 2 * k);
        h.wx = f.hx + (f.tx - f.hx) * e; h.y = f.hy + (f.ty - f.hy) * e - Math.sin(e * Math.PI) * 74;
        if (f.t >= 0.42) { f.phase = "dive"; f.t = 0; h.wx = f.tx; h.y = f.ty; }
      } else if (f.phase === "dive") {
        var k2 = Math.min(1, f.t / 0.55); f.spin += dt * 20; f.scale = 1 - k2; h.y = f.ty + k2 * 22;
        if (Math.random() < 0.7) G.particles.push({ wx: f.tx + (Math.random() * 34 - 17), y: f.ty - 10, vx: (Math.random() * 90 - 45), vy: -70 - Math.random() * 90, life: .6, kind: Math.random() < .5 ? "star" : "coin" });
        if (f.t >= 0.55) { f.phase = "close"; f.t = 0; }
      } else if (f.phase === "close") {
        if (f.t >= 0.34) { enterSecret(f.level); G.state = "warping"; hudShow(false); f.phase = "open"; f.t = 0; f.scale = 1; f.spin = 0; }
      } else if (f.phase === "open") {
        if (f.t >= 0.44) { G.state = "run"; hudShow(true); warpFX = null; }
      }
    }
    function drawWarpFX() {
      if (!warpFX || (warpFX.phase !== "close" && warpFX.phase !== "open")) return;
      var f = warpFX, W = PIXW, H = PIXH, diag = Math.sqrt(W * W + H * H) + SZ(8), cx = FX(G.hero.wx), cy = FY(G.hero.y) - SZ(24), r;
      if (f.phase === "close") r = diag * (1 - Math.min(1, f.t / 0.34)); else r = diag * Math.min(1, f.t / 0.44);
      r = Math.max(0, r);
      x.save(); x.beginPath(); x.rect(-2, -2, W + 4, H + 4); x.arc(cx, cy, r, 0, 6.29, true); x.fillStyle = "#2a1152"; x.fill("evenodd");
      if (r > 1) { x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.strokeStyle = "#c9a8f0"; x.lineWidth = 3; x.stroke(); }
      x.restore();
    }

    /* ================= SLINGSHOT SHOWDOWN (mini-boss, several worlds) ================= */
    var SHOWDOWN_WORLDS = { 1: 1, 2: 1, 3: 1, 5: 1, 7: 1 };   // worlds that carry a slingshot barricade (Beach = a sandcastle)
    // roles: A=answer(number), B=blocker(no number), M=monster, T=tnt. INVARIANT: nothing sits directly above an A.
    var SD_SHAPES = [
      [[0,0,'B'],[1,0,'B'],[2,0,'B'],[3,0,'B'],[0,1,'A'],[1,1,'A'],[2,1,'A'],[3,1,'A'],[4,0,'M']],
      [[0,0,'B'],[1,0,'T'],[2,0,'B'],[0,1,'A'],[1,1,'A'],[2,1,'A'],[3,0,'A']],
      [[0,0,'M'],[0,1,'M'],[1,0,'B'],[1,1,'A'],[2,0,'B'],[2,1,'A'],[3,0,'B'],[3,1,'A']]
    ];
    function sdDistractors(a, b, k) {
      var cor = a * b, seen = {}, out = []; seen[cor] = 1;
      var cand = [a*(b+1),a*(b-1),(a+1)*b,(a-1)*b,cor+a,cor-a,cor+b,cor-b,cor+10,cor-10,cor+1,cor-1];
      for (var s = cand.length - 1; s > 0; s--) { var j = Math.floor(Math.random()*(s+1)), t = cand[s]; cand[s]=cand[j]; cand[j]=t; }
      for (var i = 0; i < cand.length && out.length < k; i++) { var c = cand[i]; if (c > 0 && !seen[c]) { seen[c]=1; out.push(c); } }
      var n = 2; while (out.length < k) { var c2 = cor + n; if (!seen[c2]) { seen[c2]=1; out.push(c2); } n++; }
      return out;
    }
    function sdCell(sd, col, row) { return { x: sd.ox + col * sd.cs, y: sd.gy - (row + 1) * sd.cs }; }
    function sdDims(shp) { var mc = 0, mr = 0; shp.forEach(function (c) { if (c[0] > mc) mc = c[0]; if (c[1] > mr) mr = c[1]; }); return { cols: mc + 1, rows: mr + 1 }; }
    function sdBuild(sd) {
      var shp = sd.shp; sd.ents = [];
      var aCells = shp.filter(function (c) { return c[2] === 'A'; });
      var decoys = sdDistractors(sd.q.a, sd.q.b, aCells.length - 1);
      var correctIdx = Math.floor(Math.random() * aCells.length), di = 0, ai = 0, mats = ["ice","wood","stone"];
      shp.forEach(function (c) {
        var col = c[0], row = c[1], role = c[2], p = sdCell(sd, col, row), w = sd.cs - SZ(3);
        if (role === 'M') { sd.ents.push({ kind:"mon", col:col, row:row, x:p.x, y:p.y, w:w, h:w, dead:false, bl:Math.random()*3 }); return; }
        if (role === 'T') { sd.ents.push({ kind:"crate", tnt:true, col:col, row:row, x:p.x, y:p.y, w:w, h:w, val:null, correct:false, dead:false }); return; }
        if (role === 'B') { sd.ents.push({ kind:"crate", barrier:true, col:col, row:row, x:p.x, y:p.y, w:w, h:w, val:null, correct:false, dead:false }); return; }
        var isC = ai === correctIdx, val = isC ? sd.correct : decoys[di++]; ai++;
        sd.ents.push({ kind:"crate", col:col, row:row, x:p.x, y:p.y, w:w, h:w, val:val, correct:isC, mat: mats[(col+row)%3], dead:false });
      });
    }
    function sdSettle(sd) {
      var cols = {}; sd.ents.forEach(function (e) { if (!e.dead) (cols[e.col] = cols[e.col] || []).push(e); });
      Object.keys(cols).forEach(function (k) { cols[k].sort(function (a, b) { return a.row - b.row; }).forEach(function (e, i) { e.row = i; var p = sdCell(sd, e.col, i); e.x = p.x; e.y = p.y; }); });
    }
    function sdReload(sd) { sd.ball = { x: sd.sling.x, y: sd.sling.y, r: sd.cs * 0.26, vx: 0, vy: 0, flying: false, trail: [] }; }
    function enterShowdown() {
      if (!G || G.state !== "run") return;
      var gy = Math.round(PIXH * 0.82), q = nextQ();   // ground low on the screen: lots of sky to loft into, little dead space
      var shp = SD_SHAPES[Math.floor(Math.random() * SD_SHAPES.length)], dim = sdDims(shp);
      // small crates + a LONG arc: sling on the far left, fortress on the far right (feels like a real slingshot)
      var rightM = Math.round(PIXW * 0.03), topReserve = Math.round(PIXH * 0.27), availH = gy - topReserve;
      var cs = Math.max(13, Math.floor(Math.min(PIXH * 0.11, availH / Math.max(dim.rows, 2), (PIXW * 0.52 - SZ(12)) / (dim.cols + 1.7))));
      var ox = PIXW - rightM - dim.cols * cs;
      var slingX = Math.round(Math.max(cs * 3.2, PIXW * 0.19));   // room to the left to pull the ball back
      var sd = { q: q, correct: q.a * q.b, shp: shp, cs: cs, gy: gy, ox: ox, shots: 5, clean: true, phase: "intro", it: 0,
        sling: { x: slingX, y: gy - Math.round(cs * 1.5) }, ents: [], ball: null, demo: null, parts: [], shake: 0,
        dragging: false, msg: "", msgT: 0, wonT: 0, t0: Date.now(), pull: { x: -cs * 1.15, y: cs * 0.78 } };
      sdBuild(sd); sdReload(sd);
      var h = G.hero; if (G.showdown) h.wx = G.showdown.x; h.y = GROUND; h.ground = true; h.vy = 0; G.cam = h.wx - HEROX;
      G.sd = sd; G.state = "showdown"; mathHide(); hint(""); hudShow(false); aStar();
    }
    function sdBurst(sd, x0, y0, c, n) { var col = c === "coin" ? "#ffd23f" : c === "star" ? "#ffe14a" : c; for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = 30 + Math.random() * 120; sd.parts.push({ x: x0, y: y0, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: .6 + Math.random() * .4, c: col }); } }
    function sdFlash(sd, t, ms) { sd.msg = t; sd.msgT = (ms || 1200) / 1000; }
    function sdExplode(sd, col, row) {
      var chain = [];
      sd.ents.forEach(function (e) { if (e.dead) return; if (Math.abs(e.col - col) <= 1 && Math.abs(e.row - row) <= 1) { if (e.kind === "crate" && e.correct) return; if (e.kind === "crate" && e.tnt && !(e.col === col && e.row === row)) chain.push(e); e.dead = true; sdBurst(sd, e.x + e.w / 2, e.y + e.h / 2, "star", 6); } });
      chain.forEach(function (t) { sdExplode(sd, t.col, t.row); });
    }
    function sdWinNow() { var sd = G.sd; if (!sd || sd.phase === "won") return; sd.phase = "won"; sd.wonT = 1.2; sd.shake = 10; sd.ents.forEach(function (e) { if (!e.dead && !e.correct) { e.dead = true; sdBurst(sd, e.x + e.w / 2, e.y + e.h / 2, "coin", 5); } }); aWin(); haptic([15, 60, 15]); }
    function sdEndShot(sd) { if (sd.phase !== "fly") return; sd.shots--; sd.phase = "aim"; sdReload(sd); if (sd.shots <= 0) { sdFlash(sd, "NEW FORTRESS — TRY AGAIN", 1500); sd.shots = 5; sdBuild(sd); sdSettle(sd); } }
    function sdExit() {
      var sd = G.sd; recordAnswer(sd.q.a, sd.q.b, true, Date.now() - sd.t0);
      addCoins(8); progress.xp += 12; G.xpEarned += 12;
      if (sd.clean) { progress.gems = (progress.gems || 0) + 1; G.gemRun++; }
      save(); G.showdown.done = true; G.sd = null; G.state = "run"; G.dash = .7; G.hero.inv = 1.2; G.hero.wx += 30;
      hudShow(true); hint("BARRICADE SMASHED — GO!");
    }
    function sdStep(dt) {
      var sd = G.sd; if (!sd) return; var f = Math.min(2.5, dt * 60), GR = 0.34 * (sd.cs / 70), P2 = 0.19;
      if (sd.msgT > 0) sd.msgT -= dt; if (sd.shake > 0) sd.shake -= dt * 30;
      for (var pp = sd.parts.length - 1; pp >= 0; pp--) { var pt = sd.parts[pp]; pt.vy += 620 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; if (pt.life <= 0) sd.parts.splice(pp, 1); }
      if (sd.phase === "intro") {
        // demonstrate the shot TWICE (loop) so a first-timer can't miss it; can't be skipped in the first cycle
        var pxx = sd.sling.x + sd.pull.x, pyy = sd.sling.y + sd.pull.y, b = sd.ball, cyc = sd.it % 1.7;
        if (cyc < 0.9) { var k = cyc / 0.9; k = k * k * (3 - 2 * k); b.x = sd.sling.x + (pxx - sd.sling.x) * k; b.y = sd.sling.y + (pyy - sd.sling.y) * k; }
        else if (cyc < 1.35) { b.x = pxx; b.y = pyy; }
        else { b.x = sd.sling.x; b.y = sd.sling.y; if (!sd.demo && cyc < 1.42) { sd.demo = { x: sd.sling.x, y: sd.sling.y, vx: (sd.sling.x - pxx) * P2, vy: (sd.sling.y - pyy) * P2, r: sd.ball.r, life: 1.3, trail: [] }; aJump(); } }
        if (sd.demo) { sd.demo.vy += GR * f; sd.demo.x += sd.demo.vx * f; sd.demo.y += sd.demo.vy * f; sd.demo.life -= dt; sd.demo.trail.push({ x: sd.demo.x, y: sd.demo.y }); if (sd.demo.trail.length > 7) sd.demo.trail.shift(); if (sd.demo.y > sd.gy || sd.demo.life <= 0) sd.demo = null; }
        sd.it += dt; if (sd.it > 3.4) { sd.phase = "aim"; sdReload(sd); sd.demo = null; }
        return;
      }
      if (sd.phase === "won") { sd.wonT -= dt; if (sd.wonT <= 0) sdExit(); return; }
      if (sd.phase !== "fly") return;
      var ball = sd.ball; ball.vy += GR * f; ball.x += ball.vx * f; ball.y += ball.vy * f; ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 7) ball.trail.shift();
      if (ball.y + ball.r >= sd.gy) { sdBurst(sd, ball.x, sd.gy, "star", 4); sdFlash(sd, "MISS!", 900); sdEndShot(sd); return; }
      if (ball.x < -40 || ball.x > PIXW + 60 || ball.y < -300) { sdEndShot(sd); return; }
      var hit = null, hd = 1e9;
      for (var j = 0; j < sd.ents.length; j++) { var e = sd.ents[j]; if (e.dead) continue; if (ball.x + ball.r > e.x && ball.x - ball.r < e.x + e.w && ball.y + ball.r > e.y && ball.y - ball.r < e.y + e.h) { var d = Math.abs((e.x + e.w / 2) - ball.x) + Math.abs((e.y + e.h / 2) - ball.y); if (d < hd) { hd = d; hit = e; } } }
      if (!hit) return;
      if (hit.kind === "mon") { hit.dead = true; sdBurst(sd, hit.x + hit.w / 2, hit.y + hit.h / 2, "star", 8); sdExplode(sd, hit.col, hit.row); sdFlash(sd, "BOOM!", 1000); sdSettle(sd); aStomp(); sdEndShot(sd); return; }
      if (hit.tnt) { hit.dead = true; sdBurst(sd, hit.x + hit.w / 2, hit.y + hit.h / 2, "coin", 10); sdExplode(sd, hit.col, hit.row); sdFlash(sd, "KABOOM!", 1000); sdSettle(sd); aStomp(); sdEndShot(sd); return; }
      if (hit.correct) { sdBurst(sd, hit.x + hit.w / 2, hit.y + hit.h / 2, "coin", 12); sdWinNow(); if (sd.shots === 5) sdFlash(sd, "FIRST-TRY BONUS!", 1600); else sdFlash(sd, "PATH CLEARED!", 1600); return; }
      if (hit.barrier) { hit.dead = true; sdBurst(sd, hit.x + hit.w / 2, hit.y + hit.h / 2, "star", 6); sdFlash(sd, "BLOCKER CLEARED", 800); sdSettle(sd); sdEndShot(sd); return; }
      hit.dead = true; sd.clean = false; sdBurst(sd, hit.x + hit.w / 2, hit.y + hit.h / 2, "star", 6); sdFlash(sd, "NOT " + hit.val + "!", 1300); sdSettle(sd); aBad(); sdEndShot(sd); return;
    }
    function sdPos(e) { var r = cv.getBoundingClientRect(); var p = (e.touches && e.touches[0]) || e; return { x: (p.clientX - r.left) * (PIXW / r.width), y: (p.clientY - r.top) * (PIXH / r.height) }; }
    function sdDown(e) { var sd = G.sd; if (!sd) return; if (sd.phase === "intro") { if (sd.it > 1.7) { sd.phase = "aim"; sdReload(sd); sd.demo = null; } return; } if (sd.phase !== "aim") return; var p = sdPos(e); if (Math.hypot(p.x - sd.ball.x, p.y - sd.ball.y) < sd.cs * 1.4) sd.dragging = true; }
    function sdMove(e) { var sd = G.sd; if (!sd || !sd.dragging) return; var p = sdPos(e), dx = p.x - sd.sling.x, dy = p.y - sd.sling.y, d = Math.hypot(dx, dy), mx = sd.cs * 1.6; if (d > mx) { dx = dx / d * mx; dy = dy / d * mx; } sd.ball.x = Math.max(SZ(4), sd.sling.x + dx); sd.ball.y = sd.sling.y + dy; }
    function sdUp() { var sd = G.sd; if (!sd || !sd.dragging) return; sd.dragging = false; var dx = sd.sling.x - sd.ball.x, dy = sd.sling.y - sd.ball.y; if (Math.hypot(dx, dy) < sd.cs * 0.18) { sdReload(sd); return; } sd.ball.vx = dx * 0.19; sd.ball.vy = dy * 0.19; sd.ball.flying = true; sd.phase = "fly"; aJump(); }
    function sdBall2(b, r, glow) {
      if (glow) { var gl = x.createRadialGradient(b.x, b.y, r * 0.4, b.x, b.y, r * 2.2); gl.addColorStop(0, "rgba(255,210,63,.5)"); gl.addColorStop(1, "rgba(255,210,63,0)"); x.fillStyle = gl; x.beginPath(); x.arc(b.x, b.y, r * 2.2, 0, 6.29); x.fill(); }
      x.fillStyle = "#241436"; x.beginPath(); x.arc(b.x, b.y, r + 2, 0, 6.29); x.fill();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(b.x, b.y, r, 0, 6.29); x.fill();
      x.fillStyle = "#ff3f9a"; x.beginPath(); x.arc(b.x - r * 0.35, b.y - r * 0.5, r * 0.5, 0, 6.29); x.fill();
      x.fillStyle = "#ffd23f"; x.beginPath(); x.moveTo(b.x + r * 0.05, b.y - r * 0.7); x.lineTo(b.x + r * 0.3, b.y - r * 1.3); x.lineTo(b.x + r * 0.42, b.y - r * 0.55); x.closePath(); x.fill();
      x.fillStyle = "#2a1a3a"; x.beginPath(); x.arc(b.x + r * 0.28, b.y - r * 0.04, r * 0.27, 0, 6.29); x.fill();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(b.x + r * 0.36, b.y - r * 0.14, r * 0.1, 0, 6.29); x.fill();
    }
    function sdArc(sd, fx, fy) { var vx = (sd.sling.x - fx) * 0.19, vy = (sd.sling.y - fy) * 0.19, sxp = fx, syp = fy, GR = 0.34 * (sd.cs / 70); x.fillStyle = "rgba(255,210,63,.85)"; for (var i = 0; i < 26; i++) { vy += GR; sxp += vx; syp += vy; if (syp > sd.gy) break; if (i % 2 === 0) x.fillRect((sxp | 0) - 2, (syp | 0) - 2, 4, 4); } }
    function sdCrate(sd, e) {
      var w = e.w, h = e.h;
      if (e.barrier) { P(e.x, e.y, w, h, "#7a5230"); P(e.x, e.y, w, SZ(4), "#986a3e"); P(e.x, e.y, SZ(4), h, "#986a3e"); P(e.x + w - SZ(4), e.y, SZ(4), h, "#4a2f18"); P(e.x, e.y + h - SZ(4), w, SZ(4), "#4a2f18"); x.strokeStyle = "#4a2f18"; x.lineWidth = Math.max(2, SZ(4)); x.beginPath(); x.moveTo(e.x + 5, e.y + 5); x.lineTo(e.x + w - 5, e.y + h - 5); x.moveTo(e.x + w - 5, e.y + 5); x.lineTo(e.x + 5, e.y + h - 5); x.stroke(); return; }
      if (e.tnt) { P(e.x, e.y, w, h, "#ff5c6c"); P(e.x, e.y, w, SZ(4), "#ff9aa6"); P(e.x + w/2 - SZ(11), e.y + h/2 - SZ(8), SZ(22), SZ(16), "#3a1010"); x.fillStyle = "#ffe06a"; x.font = "800 " + Math.round(h * 0.26) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("TNT", e.x + w/2, e.y + h/2 + 1); return; }
      var base = e.mat === "ice" ? "#7cd0ff" : e.mat === "stone" ? "#9b8bbf" : "#c67a3a", hi = e.mat === "ice" ? "#c8efff" : e.mat === "stone" ? "#c2b6e0" : "#e0a860";
      P(e.x, e.y, w, h, base); P(e.x, e.y, w, SZ(4), hi); P(e.x, e.y, SZ(4), h, hi); P(e.x + w - SZ(4), e.y, SZ(4), h, "#8a4f22"); P(e.x, e.y + h - SZ(4), w, SZ(4), "#8a4f22");
      x.fillStyle = e.mat === "ice" ? "#0a3352" : "#241406"; var nvf = Math.max(8, Math.round(h * 0.5)); x.font = "800 " + nvf + "px monospace"; if (x.measureText(String(e.val)).width > w - 4) nvf = Math.max(7, Math.floor(nvf * (w - 4) / x.measureText(String(e.val)).width)), x.font = "800 " + nvf + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(e.val), e.x + w/2, e.y + h/2 + 1);
    }
    function sdMon(sd, e) { var w = e.w, h = e.h; P(e.x + SZ(2), e.y + SZ(4), w - SZ(4), h - SZ(6), "#3ad46a"); P(e.x + SZ(2), e.y + SZ(4), w - SZ(4), SZ(4), "#63e88a"); P(e.x, e.y, SZ(7), SZ(8), "#25a24c"); P(e.x + w - SZ(7), e.y, SZ(7), SZ(8), "#25a24c"); var bl = (Math.floor(e.bl) % 4 === 0) ? SZ(2) : SZ(7); P(e.x + SZ(8), e.y + h*0.32, SZ(7), bl, "#fff"); P(e.x + w - SZ(15), e.y + h*0.32, SZ(7), bl, "#fff"); P(e.x + SZ(10), e.y + h*0.36, SZ(3), SZ(3), "#201"); P(e.x + w - SZ(13), e.y + h*0.36, SZ(3), SZ(3), "#201"); P(e.x + SZ(9), e.y + h - SZ(12), w - SZ(18), SZ(3), "#123"); }
    function sdDraw() {
      var sd = G.sd, th = G.theme, W = PIXW, H = PIXH, gY = sd.gy;
      var ox = sd.shake > 0 ? (Math.random()*2-1)*3 : 0, oy = sd.shake > 0 ? (Math.random()*2-1)*3 : 0;
      x.save(); x.translate(ox, oy);
      // themed sky, darkened for focus
      P(-4, -4, W + 8, H*0.6 + 4, th.sky); P(-4, H*0.55, W + 8, H, th.sky2);
      P(-4, -4, W + 8, H + 8, "rgba(10,8,26,.35)");
      for (var s = 0; s < 22; s++) P((s*97+13) % W, (s*53+7) % (gY-40), 2, 2, "rgba(255,255,255,.35)");
      P(-4, gY, W + 8, H - gY + 8, th.dirt || "#5a4a9a"); P(-4, gY, W + 8, SZ(6), th.grass || "#6a5aa8");
      // banner
      x.textAlign = "center"; x.textBaseline = "alphabetic";
      var qs = sd.q.a + "  ×  " + sd.q.b + "  =  ?", pf = Math.max(9, Math.round(Math.min(H * 0.06, W * 0.09)));
      x.font = "800 " + pf + "px monospace"; var qw = x.measureText(qs).width;
      if (qw > W * 0.9) { pf = Math.max(8, Math.floor(pf * (W * 0.9) / qw)); x.font = "800 " + pf + "px monospace"; qw = x.measureText(qs).width; }
      var bw = Math.min(W - SZ(6), Math.max(SZ(100), qw + SZ(20))), bh = Math.round(pf * 1.7), bx = W / 2 - bw / 2, by = Math.max(SZ(14), Math.round(H * 0.05));
      x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(bx, by, bw, bh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(bx, by, bw, bh);
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.fillText(qs, W / 2, by + bh / 2 + 1); x.textBaseline = "alphabetic";
      // shots — centered below the banner so it never collides on narrow (portrait) screens
      var shy = by + bh + Math.round(pf * 0.9), gp = Math.max(SZ(12), Math.round(pf * 0.75));
      x.textAlign = "center"; x.fillStyle = "#c7ccf0"; x.font = "800 " + Math.max(8, Math.round(H * 0.024)) + "px monospace"; x.fillText("SHOTS", W / 2, shy);
      for (var i = 0; i < 5; i++) { x.fillStyle = i < sd.shots ? "#ffd23f" : "#3a3a68"; x.beginPath(); x.arc(W / 2 - 2 * gp + i * gp, shy + Math.round(pf * 0.85), Math.max(3, SZ(5)), 0, 6.29); x.fill(); }
      // slingshot
      P(sd.sling.x - SZ(4), sd.sling.y + SZ(6), SZ(8), gY - (sd.sling.y + SZ(6)), "#8a4f22");
      P(sd.sling.x - SZ(16), sd.sling.y - SZ(12), SZ(7), SZ(26), "#8a4f22"); P(sd.sling.x + SZ(9), sd.sling.y - SZ(12), SZ(7), SZ(26), "#8a4f22");
      if (sd.phase !== "fly" && sd.ball) { x.strokeStyle = "#5a3a20"; x.lineWidth = Math.max(2, SZ(4)); x.beginPath(); x.moveTo(sd.sling.x - SZ(12), sd.sling.y - SZ(7)); x.lineTo(sd.ball.x, sd.ball.y); x.lineTo(sd.sling.x + SZ(12), sd.sling.y - SZ(7)); x.stroke(); }
      // fortress
      sd.ents.forEach(function (e) { if (e.dead) return; if (e.kind === "mon") sdMon(sd, e); else sdCrate(sd, e); });
      for (var pi = 0; pi < sd.parts.length; pi++) { var pt = sd.parts[pi]; x.globalAlpha = Math.max(0, pt.life); P(pt.x - 2, pt.y - 2, SZ(5), SZ(5), pt.c); } x.globalAlpha = 1;
      // aim arc + ball
      if (sd.dragging) sdArc(sd, sd.ball.x, sd.ball.y);
      if (sd.phase === "intro" && (sd.it % 1.7) > 0.45 && (sd.it % 1.7) < 1.35) sdArc(sd, sd.ball.x, sd.ball.y);
      if (sd.ball && sd.phase !== "won") { if (sd.ball.trail) { for (var t2 = 0; t2 < sd.ball.trail.length; t2++) { var tp = sd.ball.trail[t2]; x.globalAlpha = (t2 / sd.ball.trail.length) * 0.4; x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(tp.x, tp.y, sd.ball.r * 0.5, 0, 6.29); x.fill(); } x.globalAlpha = 1; } sdBall2(sd.ball, sd.ball.r, true); }
      if (sd.demo && sd.phase === "intro") { for (var t3 = 0; t3 < sd.demo.trail.length; t3++) { var dp = sd.demo.trail[t3]; x.globalAlpha = (t3 / sd.demo.trail.length) * 0.4; x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(dp.x, dp.y, sd.demo.r * 0.5, 0, 6.29); x.fill(); } x.globalAlpha = 1; sdBall2(sd.demo, sd.demo.r, true); }
      // intro labels
      if (sd.phase === "intro") { var cy2 = sd.it % 1.7; var lab = cy2 < 0.9 ? "① DRAG THE HERO BACK" : cy2 < 1.35 ? "② AIM WITH THE ARC" : "③ LET GO TO FIRE!"; var lf = Math.max(9, Math.round(Math.min(H * 0.042, W * 0.052))); x.textAlign = "center"; x.font = "800 " + lf + "px monospace"; var lmw = x.measureText(lab).width; if (lmw > W * 0.92) { lf = Math.max(8, Math.floor(lf * (W * 0.92) / lmw)); x.font = "800 " + lf + "px monospace"; lmw = x.measureText(lab).width; } var lw = Math.min(W - SZ(6), lmw + SZ(18)), lh = Math.round(lf * 1.9), ly = Math.round(H * 0.19); x.fillStyle = "rgba(10,8,26,.9)"; x.fillRect(W/2 - lw/2, ly, lw, lh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(W/2 - lw/2, ly, lw, lh); x.textBaseline = "middle"; x.fillStyle = "#ffd23f"; x.fillText(lab, W/2, ly + lh/2 + 1); x.textBaseline = "alphabetic"; var subL = sd.it > 1.7 ? "TAP TO SKIP" : "WATCH…"; x.fillStyle = "#9aa0c8"; x.font = "800 " + Math.max(8, Math.round(H * 0.024)) + "px monospace"; x.fillText(subL, W/2, ly + lh + SZ(14)); if (sd.ball && cy2 < 1.35) { x.strokeStyle = "rgba(255,255,255,.9)"; x.lineWidth = 3; x.beginPath(); x.arc(sd.ball.x, sd.ball.y, sd.ball.r + SZ(6) + Math.sin(sd.it*10)*2, 0, 6.29); x.stroke(); var fnx = sd.ball.x + SZ(10), fny = sd.ball.y + SZ(10); x.fillStyle = "#ffe27a"; x.fillRect(fnx, fny, SZ(4), SZ(10)); x.fillRect(fnx - SZ(3), fny + SZ(2), SZ(4), SZ(6)); } }
      // message (shrink-to-fit so long text never clips the screen edges)
      if (sd.msgT > 0 && sd.msg) { var mf = Math.round(H * 0.042); x.textAlign = "center"; x.font = "800 " + mf + "px monospace"; var mtw = x.measureText(sd.msg).width; if (mtw > W * 0.92) { mf = Math.max(9, Math.floor(mf * (W * 0.92) / mtw)); x.font = "800 " + mf + "px monospace"; mtw = x.measureText(sd.msg).width; } var mw = Math.min(W - SZ(6), mtw + SZ(20)), mh = Math.round(mf * 1.7), my = gY - SZ(70); x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(W/2 - mw/2, my, mw, mh); x.textBaseline = "middle"; x.fillStyle = /CLEARED|BONUS/.test(sd.msg) ? "#3ad46a" : /BOOM|KABOOM/.test(sd.msg) ? "#ff5c6c" : "#ffd23f"; x.fillText(sd.msg, W/2, my + mh/2 + 1); x.textBaseline = "alphabetic"; }
      if (sd.phase === "won") { var wf = Math.round(H * 0.032); var wt = "▶ HERO BREAKS THROUGH"; x.textAlign = "center"; x.font = "800 " + wf + "px monospace"; var wtw = x.measureText(wt).width; if (wtw > W * 0.92) { wf = Math.max(8, Math.floor(wf * (W * 0.92) / wtw)); x.font = "800 " + wf + "px monospace"; } x.fillStyle = "#3ad46a"; x.fillText(wt, W/2, Math.min(H - SZ(8), gY + SZ(30))); }
      x.restore();
    }

    /* ================= LANE RUNNER (answer without stopping the run) ================= */
    function laneShuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function enterLanes() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2);
      var vals = laneShuffle([cor, dec[0], dec[1]]);
      var hx = Math.round(PIXW * 0.2), wx0 = PIXW + SZ(30);
      var L = { q: q, correct: cor, vals: vals, corIdx: vals.indexOf(cor), lane: 1, heroX: hx,
        laneY: [Math.round(PIXH * 0.42), Math.round(PIXH * 0.61), Math.round(PIXH * 0.80)],
        wallX: wx0, spd: (wx0 - hx) / LANE_LEAD, phase: "run", t0: Date.now(), msg: "", msgT: 0, flash: 0, resT: 0, showCor: false, hy: 0, run: 0 };
      L.hy = L.laneY[L.lane];
      G.lane = L; G.state = "lanes"; hudShow(false); mathHide(); hint("");
    }
    // move the hero TOWARD the player's input (tap a lane, or swipe up/down) — never the opposite way
    function laneTap() { var L = G.lane; if (!L || L.phase !== "run") return; L.lane = (L.lane + 1) % 3; aJump(); haptic(8); }
    function laneShift(dir) { var L = G.lane; if (!L || L.phase !== "run") return; var t = clamp(L.lane + dir, 0, 2); if (t !== L.lane) { L.lane = t; aJump(); haptic(8); } }
    function laneGoto(idx) { var L = G.lane; if (!L || L.phase !== "run") return; idx = clamp(idx, 0, 2); if (idx !== L.lane) { L.lane = idx; aJump(); haptic(8); } }
    function laneNearest(clientY) { var L = G.lane, rect = cv.getBoundingClientRect(), yy = (clientY - rect.top) * (PIXH / Math.max(1, rect.height)), best = 0, bd = 1e9; for (var i = 0; i < 3; i++) { var d = Math.abs(yy - L.laneY[i]); if (d < bd) { bd = d; best = i; } } return best; }
    function laneDown(e) { var L = G.lane; if (!L || L.phase !== "run") return; L.downY = e.clientY; }
    function laneUp(e) { var L = G.lane; if (!L || L.phase !== "run") return; var dy = (L.downY != null ? e.clientY - L.downY : 0); if (Math.abs(dy) > 22) laneShift(dy > 0 ? 1 : -1); else laneGoto(laneNearest(e.clientY)); L.downY = null; }
    function laneResolve() {
      var L = G.lane, chosen = L.vals[L.lane], ok = chosen === L.correct;
      if (recordAnswer(L.q.a, L.q.b, ok, Date.now() - L.t0)) G.goalMet = true; L.flash = 0.5;
      if (ok) { L.phase = "pass"; L.resT = 0.55; aGood(); haptic(12); G.correct++; G.combo++; addCoins(5); progress.xp += 10; G.xpEarned += 10; G.meter += 0.25; if (G.meter >= 1) { G.meter = 0; applyPowerup("star"); } save(); L.msg = "CORRECT!"; L.msgT = 0.7; }
      else { G.wrong++; G.combo = 0; G.meter = 0; if (!G.arena) G.hearts--; save(); aBad(); haptic([10, 40, 10]); L.msg = "NOT " + chosen + "!"; L.msgT = 1.1; if (G.hearts <= 0) { G.lane = null; G.state = "fail"; musicStop(); openOv("adv-failOv"); return; } L.phase = "retry"; L.resT = 1.0; L.showCor = true; }
    }
    function laneStep(dt) {
      var L = G.lane; if (!L) return;
      if (L.msgT > 0) L.msgT -= dt; if (L.flash > 0) L.flash -= dt;
      L.hy += (L.laneY[L.lane] - L.hy) * Math.min(1, dt * 15); L.run += dt * 8;
      if (L.phase === "run") { L.wallX -= L.spd * dt; if (L.wallX <= L.heroX + SZ(4)) { L.wallX = L.heroX + SZ(4); laneResolve(); } }
      else if (L.phase === "pass") { L.resT -= dt; L.wallX -= L.spd * 1.4 * dt; if (L.resT <= 0) laneExit(); }
      else if (L.phase === "retry") { L.resT -= dt; if (L.resT <= 0) { L.wallX = PIXW + SZ(30); L.phase = "run"; L.showCor = false; L.t0 = Date.now(); } }
    }
    function laneExit() {
      if (G.arena) { arenaAfter(); return; }
      var ga = G.gates[G.nextGate]; if (ga) ga.solved = true;
      G.nextGate++; var nx = (ga ? ga.x : G.hero.wx) + 40;
      G.hero.wx = nx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.hero.inv = 1.0; G.cam = nx - HEROX;
      G.state = "run"; G.dash = .6; G.lane = null; hudShow(true);
      hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : "NICE! KEEP GOING");
    }
    function laneDraw() {
      var L = G.lane, th = G.theme, W = PIXW, H = PIXH;
      x.fillStyle = lg(-2, H, th.sky, th.sky2); x.fillRect(-2, -2, W + 4, H + 4);
      if (th.night) for (var st = 0; st < 30; st++) P((st * 61) % W, (st * 37) % (H - 40), 1, 1, "#fff");
      for (var i = 0; i < 3; i++) { var ly = L.laneY[i]; if (i === L.lane) { x.globalAlpha = 0.18; P(-2, ly - SZ(24), W + 4, SZ(48), "#ffffff"); x.globalAlpha = 1; } P(-2, ly + SZ(16), W + 4, SZ(4), th.grass || "#7cd04a"); for (var d = -18; d < W; d += 20) P(d + ((L.run * 34) % 20), ly + SZ(20), SZ(10), SZ(2), th.dirtL || "#a8632f"); }
      for (var j = 0; j < 3; j++) { var wy = L.laneY[j], hit = (L.flash > 0 && j === L.lane), pc = hit ? (L.vals[L.lane] === L.correct ? "#3ad46a" : "#ff5c6c") : (L.showCor && j === L.corIdx ? "#3ad46a" : "#4a3f7a");
        P(L.wallX - SZ(22), wy - SZ(24), SZ(44), SZ(48), pc); P(L.wallX - SZ(22), wy - SZ(24), SZ(44), SZ(5), "rgba(255,255,255,.25)"); P(L.wallX - SZ(22), wy - SZ(24), SZ(4), SZ(48), "rgba(255,255,255,.2)");
        x.fillStyle = "#fff"; x.font = "800 " + SZ(20) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(L.vals[j], L.wallX, wy);
      }
      var B = Math.max(1.6, sx * 3.2);
      drawHeroPix(x, L.heroX - 7 * B, L.hy - 12 * B + Math.round(Math.sin(L.run) * 2), B, HEROTYPE);
      x.textAlign = "center"; x.textBaseline = "middle"; var qs = L.q.a + "  ×  " + L.q.b + "  =  ?", pf = Math.max(9, Math.round(Math.min(H * 0.06, W * 0.09)));
      x.font = "800 " + pf + "px monospace"; var qw = x.measureText(qs).width; if (qw > W * 0.9) { pf = Math.max(8, Math.floor(pf * W * 0.9 / qw)); x.font = "800 " + pf + "px monospace"; }
      var bw = Math.min(W - SZ(6), x.measureText(qs).width + SZ(20)), bh = Math.round(pf * 1.7);
      x.fillStyle = "rgba(10,8,26,.82)"; x.fillRect(W / 2 - bw / 2, SZ(6), bw, bh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(W / 2 - bw / 2, SZ(6), bw, bh); x.fillStyle = "#fff"; x.fillText(qs, W / 2, SZ(6) + bh / 2 + 1);
      for (var hh = 0; hh < G.maxHearts; hh++) { var hxp = SZ(10) + hh * SZ(15), hyp = SZ(8) + bh; x.fillStyle = hh < G.hearts ? "#ff4d6d" : "#3a3a68"; x.fillRect(hxp, hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(5), hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(1), hyp + SZ(4), SZ(7), SZ(4)); }
      x.textAlign = "center"; x.fillStyle = "#c7ccf0"; x.font = "800 " + Math.max(8, Math.round(H * 0.03)) + "px monospace"; x.fillText("TAP OR SWIPE TO A LANE", W / 2, H - SZ(14));
      if (L.msgT > 0 && L.msg) { x.font = "800 " + Math.round(H * 0.05) + "px monospace"; var mw = x.measureText(L.msg).width + SZ(20); x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(W / 2 - mw / 2, Math.round(H * 0.28) - SZ(16), mw, SZ(32)); x.textBaseline = "middle"; x.fillStyle = /CORRECT/.test(L.msg) ? "#3ad46a" : "#ffd23f"; x.fillText(L.msg, W / 2, Math.round(H * 0.28)); }
    }

    /* ================= ASTEROID BLASTER (shoot the answer out of the sky) ================= */
    function aLaser() { tone(880, .05, "square", 0, .07); tone(1320, .06, "sawtooth", .02, .05); }
    function aBoom() { tone(140, .28, "sawtooth", 0, .12); tone(90, .34, "triangle", .04, .1); }
    function enterAst() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2), vals = laneShuffle([cor, dec[0], dec[1]]);
      var A = { q: q, correct: cor, rocks: [], bullets: [], parts: [], t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, shipX: PIXW / 2, done: false };
      vals.forEach(function (v, i) {
        A.rocks.push({ v: v, x: Math.round(PIXW * (0.22 + i * 0.28)), y: Math.round(PIXH * 0.22 + (i % 2) * PIXH * 0.13),
          vx: (i % 2 ? 1 : -1) * SZ(9), vy: SZ(4) * (i === 1 ? 1 : -1), r: Math.max(SZ(24), PIXW * 0.09), spin: i * 0.8, dead: false });
      });
      G.ast = A; G.state = "asteroid"; hudShow(false); mathHide(); hint("");
    }
    function astTap(e) {
      var A = G.ast; if (!A || A.phase !== "aim") return; var p = sdPos(e), best = null, bd = 1e9;
      for (var i = 0; i < A.rocks.length; i++) { var rk = A.rocks[i]; if (rk.dead) continue; var d = Math.hypot(p.x - rk.x, p.y - rk.y); if (d < rk.r * 1.25 && d < bd) { bd = d; best = rk; } }
      if (!best) return;
      A.phase = "fire"; A.target = best; A.bullets.push({ x: A.shipX, y: PIXH - SZ(30), tx: best.x, ty: best.y }); aLaser(); haptic(8);
    }
    function astBurst(rx, ry, col) { for (var i = 0; i < 16; i++) { var a = i / 16 * 6.28; G.ast.parts.push({ x: rx, y: ry, vx: Math.cos(a) * (60 + Math.random() * 140), vy: Math.sin(a) * (60 + Math.random() * 140), life: .6 + Math.random() * .4, col: col }); } }
    function astResolve(rk) {
      var A = G.ast, ok = rk.v === A.correct;
      if (recordAnswer(A.q.a, A.q.b, ok, Date.now() - A.t0)) G.goalMet = true;
      astBurst(rk.x, rk.y, ok ? "#3ad46a" : "#ff5c6c"); aBoom(); G.shakeT = Math.max(G.shakeT, .18);
      if (ok) { rk.dead = true; A.phase = "pass"; A.resT = 0.7; haptic(14); G.correct++; G.combo++; addCoins(5); progress.xp += 10; G.xpEarned += 10; G.meter += 0.25; if (G.meter >= 1) { G.meter = 0; applyPowerup("star"); } save(); A.msg = "DIRECT HIT!"; A.msgT = 0.8; }
      else { rk.dead = true; G.wrong++; G.combo = 0; G.meter = 0; if (!G.arena) G.hearts--; save(); haptic([10, 40, 10]); A.msg = "MISS! NOT " + rk.v; A.msgT = 1.0;
        if (G.hearts <= 0) { G.ast = null; G.state = "fail"; musicStop(); openOv("adv-failOv"); return; }
        A.phase = "aim"; }
    }
    function astStep(dt) {
      var A = G.ast; if (!A) return; if (A.msgT > 0) A.msgT -= dt;
      // drift rocks (bounce inside the play area)
      for (var i = 0; i < A.rocks.length; i++) { var rk = A.rocks[i]; if (rk.dead) continue; rk.spin += dt * 1.6; if (A.phase !== "pass") { rk.x += rk.vx * dt; rk.y += rk.vy * dt; var mgn = rk.r + SZ(2); if (rk.x < mgn) { rk.x = mgn; rk.vx = Math.abs(rk.vx); } if (rk.x > PIXW - mgn) { rk.x = PIXW - mgn; rk.vx = -Math.abs(rk.vx); } var top = PIXH * 0.14 + rk.r, bot = PIXH * 0.6; if (rk.y < top) { rk.y = top; rk.vy = Math.abs(rk.vy); } if (rk.y > bot) { rk.y = bot; rk.vy = -Math.abs(rk.vy); } } }
      // bullets
      for (var b = A.bullets.length - 1; b >= 0; b--) { var bu = A.bullets[b]; var dx = bu.tx - bu.x, dy = bu.ty - bu.y, d = Math.hypot(dx, dy), sp = SZ(560) * dt; if (d <= sp) { A.bullets.splice(b, 1); if (A.target && !A.target.dead) astResolve(A.target); } else { bu.x += dx / d * sp; bu.y += dy / d * sp; } }
      // particles
      for (var p = A.parts.length - 1; p >= 0; p--) { var pt = A.parts[p]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += SZ(120) * dt; pt.life -= dt; if (pt.life <= 0) A.parts.splice(p, 1); }
      if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) astExit(); }
    }
    function astExit() {
      if (G.arena) { arenaAfter(); return; }
      var ga = G.gates[G.nextGate]; if (ga) ga.solved = true; G.nextGate++;
      var nx = (ga ? ga.x : G.hero.wx) + 40; G.hero.wx = nx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.hero.inv = 1.0; G.cam = nx - HEROX;
      G.state = "run"; G.dash = .6; G.ast = null; hudShow(true);
      hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : "NICE SHOT! KEEP GOING");
    }
    function astDraw() {
      var A = G.ast, W = PIXW, H = PIXH;
      var shX = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0, shY = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0; x.save(); x.translate(shX, shY);
      P(-2, -2, W + 4, H + 4, "#0b0725"); for (var st = 0; st < 60; st++) { var sx2 = (st * 71) % W, sy2 = (st * 47) % H; P(sx2, sy2, st % 5 === 0 ? 2 : 1, st % 5 === 0 ? 2 : 1, st % 3 ? "#5a5a8a" : "#cdd6ff"); }
      // rocks
      for (var i = 0; i < A.rocks.length; i++) { var rk = A.rocks[i]; if (rk.dead) continue; var r = rk.r;
        x.fillStyle = "#7a6a58"; x.beginPath(); for (var a = 0; a < 8; a++) { var ang = a / 8 * 6.28 + rk.spin, rr = r * (0.82 + ((a % 3) * 0.09)); var px = rk.x + Math.cos(ang) * rr, py = rk.y + Math.sin(ang) * rr; if (a === 0) x.moveTo(px, py); else x.lineTo(px, py); } x.closePath(); x.fill();
        x.fillStyle = "#9c8b74"; x.beginPath(); x.arc(rk.x - r * .25, rk.y - r * .22, r * .5, 0, 6.28); x.fill();
        x.fillStyle = "#5a4c3d"; x.beginPath(); x.arc(rk.x + r * .3, rk.y + r * .28, r * .18, 0, 6.28); x.fill();
        x.fillStyle = "#fff"; x.font = "800 " + Math.round(r * 0.9) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.6)"; x.strokeText(rk.v, rk.x, rk.y + 1); x.fillText(rk.v, rk.x, rk.y + 1); }
      // bullets
      for (var b = 0; b < A.bullets.length; b++) { var bu = A.bullets[b]; x.fillStyle = "#37e0ff"; x.fillRect(bu.x - SZ(2), bu.y - SZ(6), SZ(4), SZ(12)); x.fillStyle = "#eafcff"; x.fillRect(bu.x - SZ(1), bu.y - SZ(6), SZ(2), SZ(8)); }
      // particles
      for (var p = 0; p < A.parts.length; p++) { var pt = A.parts[p]; x.globalAlpha = Math.max(0, Math.min(1, pt.life * 2)); P(pt.x - 1, pt.y - 1, SZ(3), SZ(3), pt.col); x.globalAlpha = 1; }
      // ship: hero riding a little cannon
      var by = H - SZ(26), B = Math.max(1.6, sx * 3); x.fillStyle = "#b8c2d0"; x.fillRect(A.shipX - SZ(20), by, SZ(40), SZ(12)); x.fillStyle = "#37e0ff"; x.fillRect(A.shipX - SZ(3), by - SZ(10), SZ(6), SZ(12));
      drawHeroPix(x, A.shipX - 7 * B, by - 12 * B - SZ(2), B, HEROTYPE);
      x.restore();
      // problem banner
      x.textAlign = "center"; x.textBaseline = "middle"; var qs = A.q.a + "  ×  " + A.q.b + "  =  ?", pf = Math.max(9, Math.round(Math.min(H * 0.06, W * 0.09))); x.font = "800 " + pf + "px monospace"; var qw = x.measureText(qs).width; if (qw > W * 0.9) { pf = Math.max(8, Math.floor(pf * W * 0.9 / qw)); x.font = "800 " + pf + "px monospace"; }
      var bw = Math.min(W - SZ(6), x.measureText(qs).width + SZ(20)), bh = Math.round(pf * 1.7); x.fillStyle = "rgba(10,8,26,.82)"; x.fillRect(W / 2 - bw / 2, SZ(6), bw, bh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(W / 2 - bw / 2, SZ(6), bw, bh); x.fillStyle = "#fff"; x.fillText(qs, W / 2, SZ(6) + bh / 2 + 1);
      for (var hh = 0; hh < G.maxHearts; hh++) { var hxp = SZ(10) + hh * SZ(15), hyp = SZ(8) + bh; x.fillStyle = hh < G.hearts ? "#ff4d6d" : "#3a3a68"; x.fillRect(hxp, hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(5), hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(1), hyp + SZ(4), SZ(7), SZ(4)); }
      x.textAlign = "center"; x.fillStyle = "#c7ccf0"; var hint2 = "◎ BLAST THE RIGHT ASTEROID ◎", hf = Math.max(8, Math.round(H * 0.03)); x.font = "800 " + hf + "px monospace"; if (x.measureText(hint2).width > W * 0.94) { hf = Math.max(7, Math.floor(hf * W * 0.94 / x.measureText(hint2).width)); x.font = "800 " + hf + "px monospace"; } x.fillText(hint2, W / 2, H - SZ(7));
      if (A.msgT > 0 && A.msg) { x.font = "800 " + Math.round(H * 0.05) + "px monospace"; var mw = x.measureText(A.msg).width + SZ(20); x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(W / 2 - mw / 2, Math.round(H * 0.3) - SZ(16), mw, SZ(32)); x.textBaseline = "middle"; x.fillStyle = /HIT/.test(A.msg) ? "#3ad46a" : "#ffd23f"; x.fillText(A.msg, W / 2, Math.round(H * 0.3)); }
    }

    /* ================= MINI-GATE SHARED HELPERS (whack / hoop / beat / slash / catch) ================= */
    function miniRecord(A, ok) { if (recordAnswer(A.q.a, A.q.b, ok, Date.now() - A.t0)) G.goalMet = true; }
    function miniReward() { G.correct++; G.combo++; addCoins(5); progress.xp += 10; G.xpEarned += 10; G.meter += 0.25; if (G.meter >= 1) { G.meter = 0; applyPowerup("star"); } save(); }
    function miniPenalty() { G.wrong++; G.combo = 0; G.meter = 0; if (!G.arena) G.hearts--; save(); }
    function miniFail() { G.mini = null; G.state = "fail"; musicStop(); openOv("adv-failOv"); }
    function miniExit(msgOk) { if (G.arena) { arenaAfter(); return; } var ga = G.gates[G.nextGate]; if (ga) ga.solved = true; G.nextGate++; var nx = (ga ? ga.x : G.hero.wx) + 40; G.hero.wx = nx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.hero.inv = 1.0; G.cam = nx - HEROX; G.state = "run"; G.dash = .6; G.mini = null; hudShow(true); hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : msgOk); }
    function miniResolve(A, ok, wrongVal, okMsg) {
      miniRecord(A, ok);
      if (ok) { miniReward(); aGood(); A.good = true; A.msg = okMsg; A.msgT = 0.8; A.phase = "pass"; A.resT = 0.7; haptic(14); }
      else { miniPenalty(); aBad(); A.good = false; A.msg = "NOT " + wrongVal; A.msgT = 1.0; haptic([10, 40, 10]); if (G.hearts <= 0) { miniFail(); return false; } A.phase = "aim"; }
      return ok;
    }
    function miniBurst(A, rx, ry, col) { for (var i = 0; i < 14; i++) { var a = i / 14 * 6.28; A.parts.push({ x: rx, y: ry, vx: Math.cos(a) * (50 + Math.random() * 130), vy: Math.sin(a) * (50 + Math.random() * 130), life: .5 + Math.random() * .4, col: col }); } }
    function miniParts(A, dt) { for (var p = A.parts.length - 1; p >= 0; p--) { var pt = A.parts[p]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += SZ(120) * dt; pt.life -= dt; if (pt.life <= 0) A.parts.splice(p, 1); } }
    function miniPartsDraw(A) { for (var p = 0; p < A.parts.length; p++) { var pt = A.parts[p]; x.globalAlpha = Math.max(0, Math.min(1, pt.life * 2)); P(pt.x - 1, pt.y - 1, SZ(3), SZ(3), pt.col); x.globalAlpha = 1; } }
    function miniHud(A, hintText) {
      var W = PIXW, H = PIXH; x.textAlign = "center"; x.textBaseline = "middle";
      var qs = A.q.a + "  ×  " + A.q.b + "  =  ?", pf = Math.max(9, Math.round(Math.min(H * 0.06, W * 0.09))); x.font = "800 " + pf + "px monospace"; var qw = x.measureText(qs).width; if (qw > W * 0.9) { pf = Math.max(8, Math.floor(pf * W * 0.9 / qw)); x.font = "800 " + pf + "px monospace"; }
      var bw = Math.min(W - SZ(6), x.measureText(qs).width + SZ(20)), bh = Math.round(pf * 1.7); x.fillStyle = "rgba(10,8,26,.82)"; x.fillRect(W / 2 - bw / 2, SZ(6), bw, bh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(W / 2 - bw / 2, SZ(6), bw, bh); x.fillStyle = "#fff"; x.fillText(qs, W / 2, SZ(6) + bh / 2 + 1);
      for (var hh = 0; hh < G.maxHearts; hh++) { var hxp = SZ(10) + hh * SZ(15), hyp = SZ(8) + bh; x.fillStyle = hh < G.hearts ? "#ff4d6d" : "#3a3a68"; x.fillRect(hxp, hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(5), hyp + SZ(1), SZ(4), SZ(4)); x.fillRect(hxp + SZ(1), hyp + SZ(4), SZ(7), SZ(4)); }
      if (hintText) { x.textAlign = "center"; x.fillStyle = "#c7ccf0"; var hf = Math.max(8, Math.round(H * 0.03)); x.font = "800 " + hf + "px monospace"; if (x.measureText(hintText).width > W * 0.94) { hf = Math.max(7, Math.floor(hf * W * 0.94 / x.measureText(hintText).width)); x.font = "800 " + hf + "px monospace"; } x.fillText(hintText, W / 2, H - SZ(7)); }
      if (A.msgT > 0 && A.msg) { x.font = "800 " + Math.round(H * 0.05) + "px monospace"; var mw = x.measureText(A.msg).width + SZ(20); x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(W / 2 - mw / 2, Math.round(H * 0.3) - SZ(16), mw, SZ(32)); x.textBaseline = "middle"; x.fillStyle = A.good ? "#3ad46a" : "#ffd23f"; x.fillText(A.msg, W / 2, Math.round(H * 0.3)); }
    }

    /* ================= WHACK THE CRITTER (bop the answer when it pops up) ================= */
    function enterWhack() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 4), vals = laneShuffle([cor, dec[0], dec[1], dec[2], dec[3]]);
      var A = { key: "whack", q: q, correct: cor, vals: vals, holes: [], parts: [], t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, good: false, exitMsg: "BONK! KEEP GOING" };
      var cols = 3, gw = PIXW * 0.86 / cols, x0 = PIXW * 0.07 + gw / 2, y0 = PIXH * 0.44, gh = PIXH * 0.24;
      vals.forEach(function (v, i) { var c = i % cols, r = (i / cols) | 0; A.holes.push({ v: v, x: Math.round(x0 + c * gw), y: Math.round(y0 + r * gh), up: 0, tgt: 0, timer: 0.3 + Math.random() * 1.3, dead: false }); });
      A.step = whackStep; A.draw = whackDraw; A.down = whackDown;
      A.pick = function (v) { var h = A.holes.filter(function (o) { return !o.dead && o.v === v; })[0]; if (h) { h.up = 1; whackHit(h); } };
      G.mini = A; G.state = "whack"; hudShow(false); mathHide(); hint("");
    }
    function whackHit(h) { var A = G.mini; if (A.phase !== "aim") return; var ok = h.v === A.correct; miniBurst(A, h.x, h.y - SZ(18), ok ? "#3ad46a" : "#ff5c6c"); aStomp(); G.shakeT = Math.max(G.shakeT, .14); h.dead = true; miniResolve(A, ok, h.v, "BONK!"); }
    function whackDown(e) { var A = G.mini; if (A.phase !== "aim") return; var p = sdPos(e); for (var i = 0; i < A.holes.length; i++) { var h = A.holes[i]; if (h.dead) continue; if (h.up > 0.5 && Math.abs(p.x - h.x) < SZ(30) && p.y > h.y - SZ(48) && p.y < h.y + SZ(10)) { whackHit(h); return; } } }
    function whackStep(dt) {
      var A = G.mini; if (A.msgT > 0) A.msgT -= dt;
      for (var i = 0; i < A.holes.length; i++) { var h = A.holes[i]; if (h.dead) { h.up += (0 - h.up) * Math.min(1, dt * 10); continue; } if (A.phase === "aim") { h.timer -= dt; if (h.timer <= 0) { h.tgt = h.tgt > 0.5 ? 0 : 1; h.timer = h.tgt > 0.5 ? 0.7 + Math.random() * 1.0 : 0.4 + Math.random() * 1.2; } } else h.tgt = 0; h.up += (h.tgt - h.up) * Math.min(1, dt * 9); }
      miniParts(A, dt); if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) miniExit(A.exitMsg); }
    }
    function whackDraw() {
      var A = G.mini, W = PIXW, H = PIXH; x.fillStyle = lg(-2, H * 0.52, "#7fc8ff", "#c2e8ff"); x.fillRect(-2, -2, W + 4, H * 0.52); x.fillStyle = lg(H * 0.48, H, "#6fbf4a", "#4f9a38"); x.fillRect(-2, H * 0.48, W + 4, H);
      for (var c2 = 0; c2 < W; c2 += 26) { P(c2 + ((Date.now() / 40 | 0) % 26), H * 0.16, 10, 4, "#bfeaff"); }
      for (var i = 0; i < A.holes.length; i++) { var h = A.holes[i];
        x.fillStyle = "#3a2416"; x.beginPath(); x.ellipse(h.x, h.y, SZ(30), SZ(12), 0, 0, 6.29); x.fill(); x.fillStyle = "#20130a"; x.beginPath(); x.ellipse(h.x, h.y, SZ(24), SZ(8), 0, 0, 6.29); x.fill();
        if (h.dead && h.up < 0.05) continue; var cy = h.y - h.up * SZ(34);
        x.save(); x.beginPath(); x.rect(h.x - SZ(30), 0, SZ(60), h.y + SZ(2)); x.clip();
        x.fillStyle = h.dead ? "#9a9a9a" : "#b06a3a"; x.beginPath(); x.arc(h.x, cy, SZ(22), 0, 6.29); x.fill(); x.fillStyle = h.dead ? "#c8c8c8" : "#d89a63"; x.beginPath(); x.arc(h.x, cy + SZ(5), SZ(13), 0, 6.29); x.fill();
        x.fillStyle = "#3a2416"; x.beginPath(); x.arc(h.x - SZ(16), cy - SZ(14), SZ(6), 0, 6.29); x.arc(h.x + SZ(16), cy - SZ(14), SZ(6), 0, 6.29); x.fill();
        x.fillStyle = "#fff"; x.fillRect(h.x - SZ(9), cy - SZ(8), SZ(5), SZ(6)); x.fillRect(h.x + SZ(4), cy - SZ(8), SZ(5), SZ(6)); x.fillStyle = "#000"; x.fillRect(h.x - SZ(8), cy - SZ(5), SZ(3), SZ(3)); x.fillRect(h.x + SZ(5), cy - SZ(5), SZ(3), SZ(3));
        x.font = "800 " + SZ(15) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.fillRect(h.x - SZ(13), cy + SZ(6), SZ(26), SZ(15)); x.fillStyle = "#5a2f16"; x.fillText(h.v, h.x, cy + SZ(14));
        x.restore();
      }
      miniPartsDraw(A); miniHud(A, "BOP THE CRITTER WITH THE ANSWER");
    }

    /* ================= HOOP TOSS (sink the answer) ================= */
    function enterHoop() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2), vals = laneShuffle([cor, dec[0], dec[1]]);
      var A = { key: "hoop", q: q, correct: cor, vals: vals, hoops: [], ball: null, parts: [], tt: 0, t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, good: false, exitMsg: "SWISH! KEEP GOING", shipX: PIXW / 2 };
      vals.forEach(function (v, i) { A.hoops.push({ v: v, bx: PIXW * (0.24 + i * 0.26), y: PIXH * 0.26, ph: i * 2.1, sway: PIXW * 0.05, dead: false }); });
      A.step = hoopStep; A.draw = hoopDraw; A.down = hoopDown;
      A.pick = function (v) { var hp = A.hoops.filter(function (o) { return !o.dead && o.v === v; })[0]; if (hp) hoopThrow(hp); };
      G.mini = A; G.state = "hoop"; hudShow(false); mathHide(); hint("");
    }
    function hoopX(hp, t) { return hp.bx + Math.sin(t * 1.3 + hp.ph) * hp.sway; }
    function hoopThrow(hp) { var A = G.mini; if (A.phase !== "aim" || A.ball) return; A.target = hp; A.ball = { x0: A.shipX, y0: PIXH - SZ(30), x: A.shipX, y: PIXH - SZ(30), t: 0 }; aSwing(); haptic(8); A.phase = "fire"; }
    function hoopDown(e) { var A = G.mini; if (A.phase !== "aim") return; var p = sdPos(e), best = null, bd = 1e9; for (var i = 0; i < A.hoops.length; i++) { var hp = A.hoops[i]; if (hp.dead) continue; var d = Math.hypot(p.x - hoopX(hp, A.tt), p.y - hp.y); if (d < SZ(48) && d < bd) { bd = d; best = hp; } } if (best) hoopThrow(best); }
    function hoopStep(dt) {
      var A = G.mini; if (A.msgT > 0) A.msgT -= dt; A.tt += dt; miniParts(A, dt);
      if (A.ball) { A.ball.t += dt * 1.5; var t = Math.min(1, A.ball.t), tx = hoopX(A.target, A.tt), ty = A.target.y; A.ball.x = A.ball.x0 + (tx - A.ball.x0) * t; A.ball.y = A.ball.y0 + (ty - A.ball.y0) * t - Math.sin(t * Math.PI) * SZ(140); if (A.ball.t >= 1) { var hp = A.target; A.ball = null; var ok = hp.v === A.correct; miniBurst(A, hoopX(hp, A.tt), hp.y, ok ? "#3ad46a" : "#ff5c6c"); G.shakeT = Math.max(G.shakeT, .1); if (!ok) hp.dead = true; miniResolve(A, ok, hp.v, "SWISH!"); } }
      if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) miniExit(A.exitMsg); }
    }
    function hoopDraw() {
      var A = G.mini, W = PIXW, H = PIXH; P(-2, -2, W + 4, H + 4, "#3a2c5e"); P(-2, H * 0.7, W + 4, H, "#5a3f2a"); P(-2, H * 0.7, W + 4, SZ(4), "#8a6a44");
      for (var i = 0; i < A.hoops.length; i++) { var hp = A.hoops[i]; if (hp.dead) continue; var hx = hoopX(hp, A.tt);
        P(hx - SZ(20), hp.y - SZ(38), SZ(40), SZ(28), "#e9e4d0"); P(hx - SZ(20), hp.y - SZ(38), SZ(40), SZ(3), "#c8c2ac"); x.strokeStyle = "#ff7a3c"; x.lineWidth = Math.max(2, SZ(4)); x.beginPath(); x.ellipse(hx, hp.y, SZ(22), SZ(9), 0, 0, 6.29); x.stroke();
        x.font = "800 " + SZ(16) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#2a2140"; x.fillText(hp.v, hx, hp.y - SZ(24)); }
      if (A.ball) { x.fillStyle = "#ff7a3c"; x.beginPath(); x.arc(A.ball.x, A.ball.y, SZ(9), 0, 6.29); x.fill(); x.strokeStyle = "#8a3c14"; x.lineWidth = 1; x.beginPath(); x.moveTo(A.ball.x - SZ(9), A.ball.y); x.lineTo(A.ball.x + SZ(9), A.ball.y); x.stroke(); }
      var by = H - SZ(26), B = Math.max(1.6, sx * 3); drawHeroPix(x, A.shipX - 7 * B, by - 12 * B, B, HEROTYPE);
      miniPartsDraw(A); miniHud(A, "TAP THE HOOP WITH THE ANSWER");
    }

    /* ================= BEAT METER (stamp on the answer) ================= */
    function enterBeat() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2), vals = laneShuffle([cor, dec[0], dec[1]]);
      var A = { key: "beat", q: q, correct: cor, vals: vals, pos: 0, dir: 1, spd: 0.85, parts: [], pulse: 0, t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, good: false, exitMsg: "ON BEAT! KEEP GOING", stampZone: -1, stampT: 0 };
      A.step = beatStep; A.draw = beatDraw; A.down = function () { beatStamp(); };
      A.pick = function (v) { var idx = A.vals.indexOf(v); if (idx < 0) return; A.pos = idx / 3 + 1 / 6; beatStamp(); };
      G.mini = A; G.state = "beat"; hudShow(false); mathHide(); hint("");
    }
    function beatZone(A) { return Math.max(0, Math.min(2, Math.floor(A.pos * 3))); }
    function beatStamp() { var A = G.mini; if (A.phase !== "aim") return; var z = beatZone(A), v = A.vals[z], ok = v === A.correct; A.stampZone = z; A.stampT = 0.5; miniBurst(A, PIXW * (z + 0.5) / 3, PIXH * 0.5, ok ? "#3ad46a" : "#ff5c6c"); G.shakeT = Math.max(G.shakeT, .1); miniResolve(A, ok, v, "PERFECT!"); }
    function beatStep(dt) { var A = G.mini; if (A.msgT > 0) A.msgT -= dt; if (A.stampT > 0) A.stampT -= dt; A.pulse += dt * 4; if (A.phase === "aim") { A.pos += A.dir * A.spd * dt; if (A.pos >= 1) { A.pos = 1; A.dir = -1; } if (A.pos <= 0) { A.pos = 0; A.dir = 1; } } miniParts(A, dt); if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) miniExit(A.exitMsg); } }
    function beatDraw() {
      var A = G.mini, W = PIXW, H = PIXH, barY = H * 0.42, barH = H * 0.16; P(-2, -2, W + 4, H + 4, "#1a1030");
      var glow = 0.5 + 0.5 * Math.sin(A.pulse); for (var s = 0; s < 24; s++) { var bh2 = (H * 0.14) * (0.3 + 0.7 * Math.abs(Math.sin(A.pulse * 0.6 + s))); P(s * (W / 24), H - bh2, Math.ceil(W / 24) - 1, bh2, s % 2 ? "#2a1c4a" : "#33215a"); }
      var zc = ["#4a3f7a", "#4a3f7a", "#4a3f7a"]; for (var z = 0; z < 3; z++) { var zx = W * z / 3, zw = W / 3; var lit = (A.stampT > 0 && A.stampZone === z); x.fillStyle = lit ? (A.vals[z] === A.correct ? "#3ad46a" : "#ff5c6c") : zc[z]; x.fillRect(zx + SZ(3), barY, zw - SZ(6), barH); x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(zx + SZ(3), barY, zw - SZ(6), SZ(4));
        x.fillStyle = "#fff"; x.font = "800 " + Math.round(barH * 0.5) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(A.vals[z], zx + zw / 2, barY + barH / 2); }
      var mx = W * A.pos; x.fillStyle = "#ffd23f"; x.fillRect(mx - SZ(2), barY - SZ(10), SZ(4), barH + SZ(20)); x.beginPath(); x.moveTo(mx - SZ(7), barY - SZ(10)); x.lineTo(mx + SZ(7), barY - SZ(10)); x.lineTo(mx, barY - SZ(2)); x.closePath(); x.fill();
      var by = H - SZ(30), B = Math.max(1.6, sx * 3); drawHeroPix(x, W / 2 - 7 * B, by - 12 * B + Math.round(Math.sin(A.pulse) * SZ(2)), B, HEROTYPE);
      miniPartsDraw(A); miniHud(A, "TAP WHEN THE MARKER IS ON THE ANSWER");
    }

    /* ================= FRUIT SLASH (slice the answer) ================= */
    function makeFruit(v, i, n) { var hues = ["#ff5c6c", "#ffb020", "#8bd450", "#37c0ff", "#c77dff"]; return { v: v, x: Math.round(PIXW * (0.24 + (i / Math.max(1, n - 1)) * 0.52)), vx: (i % 2 ? 1 : -1) * SZ(24), y: PIXH + SZ(20), vy: -(SZ(430) + i * SZ(24)), col: hues[i % hues.length], r: Math.max(SZ(20), PIXW * 0.075), dead: false, spin: 0 }; }
    function reToss(f) { f.y = PIXH + SZ(20); f.vy = -(SZ(430) + Math.random() * SZ(140)); f.x = Math.max(f.r, Math.min(PIXW - f.r, f.x)); }
    function enterSlash() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2), vals = laneShuffle([cor, dec[0], dec[1]]);
      var A = { key: "slash", q: q, correct: cor, vals: vals, fruits: [], parts: [], slashLine: null, t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, good: false, exitMsg: "SLICED! KEEP GOING" };
      vals.forEach(function (v, i) { A.fruits.push(makeFruit(v, i, vals.length)); });
      A.step = slashStep; A.draw = slashDraw; A.down = slashDown; A.move = slashMove;
      A.pick = function (v) { var f = A.fruits.filter(function (o) { return !o.dead && o.v === v; })[0]; if (f) slashHit(f); };
      G.mini = A; G.state = "slash"; hudShow(false); mathHide(); hint("");
    }
    function slashHit(f) { var A = G.mini; if (A.phase !== "aim" || f.dead) return; var ok = f.v === A.correct; miniBurst(A, f.x, f.y, ok ? "#3ad46a" : f.col); aSwing(); G.shakeT = Math.max(G.shakeT, .1); if (ok) f.dead = true; var res = miniResolve(A, ok, f.v, "SLICED!"); if (!res && G.hearts > 0) reToss(f); }
    function slashCheck(p) { var A = G.mini; for (var i = 0; i < A.fruits.length; i++) { var f = A.fruits[i]; if (f.dead) continue; if (Math.hypot(p.x - f.x, p.y - f.y) < f.r * 1.15) { slashHit(f); return; } } }
    function slashDown(e) { var A = G.mini; if (A.phase !== "aim") return; var p = sdPos(e); A.slashLine = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, life: 0.14 }; slashCheck(p); }
    function slashMove(e) { var A = G.mini; if (!A.slashLine || A.phase !== "aim") return; var p = sdPos(e); A.slashLine.x2 = p.x; A.slashLine.y2 = p.y; A.slashLine.life = 0.14; slashCheck(p); }
    function slashStep(dt) {
      var A = G.mini; if (A.msgT > 0) A.msgT -= dt; if (A.slashLine) { A.slashLine.life -= dt; if (A.slashLine.life <= 0) A.slashLine = null; }
      for (var i = 0; i < A.fruits.length; i++) { var f = A.fruits[i]; if (f.dead) continue; if (A.phase === "aim") { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += SZ(560) * dt; f.spin += dt * 3; if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); } if (f.x > PIXW - f.r) { f.x = PIXW - f.r; f.vx = -Math.abs(f.vx); } if (f.y > PIXH + f.r + SZ(10)) reToss(f); } }
      miniParts(A, dt); if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) miniExit(A.exitMsg); }
    }
    function slashDraw() {
      var A = G.mini, W = PIXW, H = PIXH; P(-2, -2, W + 4, H * 0.6, "#20364a"); P(-2, H * 0.55, W + 4, H, "#12202e");
      for (var i = 0; i < A.fruits.length; i++) { var f = A.fruits[i]; if (f.dead) continue;
        x.fillStyle = f.col; x.beginPath(); x.arc(f.x, f.y, f.r, 0, 6.29); x.fill(); x.fillStyle = "rgba(255,255,255,.28)"; x.beginPath(); x.arc(f.x - f.r * .3, f.y - f.r * .3, f.r * .35, 0, 6.29); x.fill();
        x.fillStyle = "#2f6b1f"; x.fillRect(f.x - SZ(2), f.y - f.r - SZ(5), SZ(4), SZ(7));
        x.fillStyle = "#fff"; x.font = "800 " + Math.round(f.r * 0.95) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = 3; x.strokeStyle = "rgba(0,0,0,.45)"; x.strokeText(f.v, f.x, f.y + 1); x.fillText(f.v, f.x, f.y + 1); }
      if (A.slashLine) { x.strokeStyle = "rgba(255,255,255,.9)"; x.lineWidth = Math.max(2, SZ(4)); x.beginPath(); x.moveTo(A.slashLine.x1, A.slashLine.y1); x.lineTo(A.slashLine.x2, A.slashLine.y2); x.stroke(); }
      miniPartsDraw(A); miniHud(A, "SWIPE THE FRUIT WITH THE ANSWER");
    }

    /* ================= SHIELD & CATCH (catch the answer) ================= */
    function enterCatch() {
      var q = nextQ(), cor = q.a * q.b, dec = sdDistractors(q.a, q.b, 2), vals = [cor, dec[0], dec[1]];
      var A = { key: "catch", q: q, correct: cor, vals: vals, drops: [], parts: [], basketX: PIXW / 2, targetX: PIXW / 2, spawnT: 0.2, t0: Date.now(), phase: "aim", msg: "", msgT: 0, resT: 0, good: false, exitMsg: "NICE CATCH! KEEP GOING" };
      A.step = catchStep; A.draw = catchDraw; A.down = catchMove; A.move = catchMove;
      A.pick = function (v) { catchResolve(A, v); };
      G.mini = A; G.state = "catch"; hudShow(false); mathHide(); hint("");
    }
    function catchMove(e) { var A = G.mini; if (A.phase !== "aim") return; A.targetX = Math.max(PIXW * 0.1, Math.min(PIXW * 0.9, sdPos(e).x)); }
    function catchResolve(A, v) { var ok = v === A.correct; miniBurst(A, A.basketX, PIXH - SZ(42), ok ? "#3ad46a" : "#ff5c6c"); G.shakeT = Math.max(G.shakeT, .08); miniResolve(A, ok, v, "CAUGHT IT!"); }
    function catchStep(dt) {
      var A = G.mini; if (A.msgT > 0) A.msgT -= dt; A.basketX += (A.targetX - A.basketX) * Math.min(1, dt * 12);
      if (A.phase === "aim") { A.spawnT -= dt; if (A.spawnT <= 0) { A.spawnT = 0.85 + Math.random() * 0.5; var mustCor = !A.drops.some(function (d) { return d.v === A.correct; }) && Math.random() < 0.6; var v = mustCor ? A.correct : A.vals[Math.floor(Math.random() * 3)]; A.drops.push({ v: v, x: PIXW * (0.14 + Math.random() * 0.72), y: -SZ(10), vy: SZ(150) + Math.random() * SZ(90) }); }
        var basketY = PIXH - SZ(40); for (var i = A.drops.length - 1; i >= 0; i--) { var d = A.drops[i]; d.y += d.vy * dt; if (d.y >= basketY - SZ(8) && d.y <= basketY + SZ(20) && Math.abs(d.x - A.basketX) < SZ(30)) { A.drops.splice(i, 1); catchResolve(A, d.v); break; } else if (d.y > PIXH + SZ(20)) A.drops.splice(i, 1); } }
      miniParts(A, dt); if (A.phase === "pass") { A.resT -= dt; if (A.resT <= 0) miniExit(A.exitMsg); }
    }
    function catchDraw() {
      var A = G.mini, W = PIXW, H = PIXH; P(-2, -2, W + 4, H * 0.6, "#132a4a"); P(-2, H * 0.55, W + 4, H, "#0d1c33");
      for (var st = 0; st < 40; st++) { P((st * 71) % W, (st * 53) % (H * 0.5), 1, 1, "#3a4a6a"); }
      for (var i = 0; i < A.drops.length; i++) { var d = A.drops[i]; x.fillStyle = d.v === A.correct ? "#ffd23f" : "#a6b0d0"; x.fillRect(d.x - SZ(14), d.y - SZ(11), SZ(28), SZ(22)); x.fillStyle = "rgba(255,255,255,.2)"; x.fillRect(d.x - SZ(14), d.y - SZ(11), SZ(28), SZ(4)); x.fillStyle = "#1a1030"; x.font = "800 " + SZ(13) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(d.v, d.x, d.y); }
      var basketY = H - SZ(40); x.fillStyle = "#37c0ff"; x.beginPath(); x.moveTo(A.basketX - SZ(30), basketY); x.lineTo(A.basketX + SZ(30), basketY); x.lineTo(A.basketX + SZ(22), basketY + SZ(18)); x.lineTo(A.basketX - SZ(22), basketY + SZ(18)); x.closePath(); x.fill(); x.fillStyle = "#eafcff"; x.fillRect(A.basketX - SZ(30), basketY - SZ(3), SZ(60), SZ(4));
      var B = Math.max(1.4, sx * 2.6); drawHeroPix(x, A.basketX - 7 * B, basketY - 12 * B - SZ(2), B, HEROTYPE);
      miniPartsDraw(A); miniHud(A, "MOVE TO CATCH THE ANSWER");
    }

    var MINI_ENTER = { whack: enterWhack, hoop: enterHoop, beat: enterBeat, slash: enterSlash, catch: enterCatch };

    /* ================= PIXEL ART ================= */
    function P(bx, by, bw, bh, c) { x.fillStyle = c; x.fillRect(bx | 0, by | 0, Math.max(1, bw | 0), Math.max(1, bh | 0)); }
    function FX(wx) { return Math.round((wx - G.cam) * sx); }
    function FY(y) { return Math.round(y * sx); }
    function SZ(v) { return Math.max(1, Math.round(v * sx)); }
    function spr(g, ox, oy, rows, map) { for (var r = 0; r < rows.length; r++) { var row = rows[r]; for (var c = 0; c < row.length; c++) { var ch = row[c]; if (ch === " " || ch === ".") continue; g.fillStyle = map[ch]; g.fillRect(ox + c, oy + r, 1, 1); } } }
    var HERO_MAP = {
      unicorn: { rows: ["........GG....", "........G.....", "..P....WW.....", ".PPP..WWWWo...", "PPPP.WWWWWWo..", "PPP..WWWeWWo..", "PP..WWWWWWWo..", ".oWWWWWWWWWo..", "PoWWWWWWWWWo..", "P.o.o..o.o....", "....o.o..o.o..", "............."], map: { P: "#ff3f9a", p: "#ff8ec8", W: "#ffffff", o: "#d9c9f2", G: "#ffd23f", e: "#3a1a5e" } },
      cat: { rows: ["..........C.C.", "..........CiC.", "..C.......CCCC", ".CC......CCCoC", "CCC.CCCCCCCCCp", ".sCsCCsCCsCCWW", ".CCCCCCCCCCCC.", ".CsCCsCCsCCCC.", ".k..k..k..k...", ".k..k..k..k...", "..............", ".............."], map: { C: "#b3bccb", s: "#7a8497", o: "#28283a", p: "#ff8fc0", i: "#ff9ec7", k: "#5b6474", W: "#eef2f8" } },
      fox: { rows: ["..........F.F.", "..........FfF.", "T.........FFFF", "TT.......FFFoF", "WTTFFFFFFFFFFn", ".TFFFFFFFFFFWW", ".FFFFFFFFFFFF.", ".WFFWFFFFWFFF.", ".k..k..k..k...", ".k..k..k..k...", "..............", ".............."], map: { F: "#ff8331", f: "#e26a1f", W: "#fff4e8", n: "#241b14", o: "#241b14", k: "#3a2a1e", T: "#ff8331" } },
      // ---- special unlockable heroes (objects) ----
      robo: { rows: ["..........y...", "..........y...", ".....MMMMMMM..", ".....MEEEEEM..", "MMMMMMEEEEEM..", "MMbMMMMMMMMM..", "MMMMMMMMMMMM..", "MMMMMMMMMMMM..", ".TT..TT..TT...", ".TT..TT..TT...", "..............", ".............."], map: { M: "#b8c2d0", E: "#37e0ff", b: "#ff5c6c", T: "#4a5566", y: "#ffd23f" } },
      comet: { rows: ["..............", "..........RRR.", ".......RRRRRR.", "..fWWWWWWWRRR.", "ffFWWwWWWWWRR.", "ffFWWwWWWWWRR.", "..fWWWWWWWRRR.", ".......RRRRRR.", "..........RRR.", "....RR........", "....RR........", ".............."], map: { R: "#ff4f5a", W: "#eef2f8", w: "#37c0ff", f: "#ffb020", F: "#ffe06a" } },
      nova: { rows: [".......S......", "t.....SSS.....", ".tt..SSSSS....", "..ttSSSSSSS...", "...SSSSSSSSS..", "..SSSSSoSSSS..", "...SSSSSSSS...", "...SS...SS....", "..SS.....SS...", ".SS.......SS..", "..............", ".............."], map: { S: "#ffe14a", o: "#7a5a00", t: "#ff9ec7" } },
      draco: { rows: ["........g.g..", "........ggg..", "..t....gGGGh.", ".ttg..GGGGoG.", "gtGGGGGGGGGGm", "gGGwwGGGGGGG.", "gGGwwwGGGGG..", "gGGGGGGGGG...", ".g..g..g.g...", ".g..g..g.g...", "..............", ".............."], map: { G: "#3aa64a", g: "#2f8f42", o: "#111", m: "#ff5c6c", w: "#8be06a", t: "#57bf3a", h: "#ffd23f" } },
      orbit: { rows: ["..............", "..............", ".....DDDD.....", "...DDddddDD...", "..DddddddddD..", ".SSSSSSSSSSSS", "SSSSSSSSSSSSSS", ".LzLzLzLzLzL.", "..............", "...b......b...", "..............", ".............."], map: { D: "#c8d0e0", d: "#37e0ff", S: "#9aa6b8", L: "#ffd23f", z: "#ff5c6c", b: "#7ce0ff" } },
      // ---- secret-only hero: SHELLY the treasure crab ----
      shelly: { rows: ["...r......r..", "...W......W..", "...e......e..", ".ccRRRRRRcc..", "cccRRRRRRccc.", ".ccRRRRRRcc..", "..RRRhRRRR...", "..RRRRRRRR...", ".R.R.RR.R.R..", "R..R.RR.R..R.", ".............", "............."], map: { R: "#ff5a44", r: "#d63626", c: "#ff8360", W: "#ffffff", e: "#2a1010", h: "#ffd23f" } },
      // ---- secret-only hero: FINN the fish ----
      finn: { rows: ["............", ".......ff...", "......ffff..", "..CCCCCCf...", ".CCCCCCCCC..", "CCCeCCCCCCf.", ".CCCCCCCCC..", "..CCCCCCC...", "...W..W.....", "............", "............", "............"], map: { C: "#37c0ff", c: "#1a8fd0", e: "#0a2038", f: "#8fe0ff", W: "#cdeeff" } },
      // ---- secret-only hero: MANGO the monkey ----
      mango: { rows: ["..m....m....", ".mmm..mmm...", ".mBBBBBBBm..", ".mBWBBWBm...", ".mBBBBBBBm..", ".mBBffBBBm..", ".mBBBBBBBm..", "..mmmmmmm...", "..m.....m...", "..m.....m...", "............", "............"], map: { m: "#6a3f1e", B: "#c99a5a", W: "#ffffff", f: "#8a5a2a" } }
    };
    var heroBuf = document.createElement("canvas"); heroBuf.width = 14; heroBuf.height = 12; var hbx = heroBuf.getContext("2d");
    // ---- 32-bit hero sprites (side-view, facing right) pre-rendered once into HERO_ART[id]=[frame0,frame1] ----
    var HERO_ART = {}, HA_W = 64, HA_H = 54, HA_FW = 80, HA_FH = 60;
    function buildHeroArt() {
      var RB = ["#ff5c6c", "#ff9f40", "#ffe14a", "#4fd06a", "#38b6ff", "#a06bff"];
      function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
      function ell(g, x, y, rx, ry, fill, out, ow) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } if (out) { g.strokeStyle = out; g.lineWidth = ow || 1.6; g.lineJoin = "round"; g.stroke(); } }
      function rrf(g, x, y, w, h, r, fill, out, ow) { rr(g, x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (out) { g.strokeStyle = out; g.lineWidth = ow || 1.6; g.lineJoin = "round"; g.stroke(); } }
      function pth(g, cmds, fill, out, ow) { g.beginPath(); cmds(g); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (out) { g.strokeStyle = out; g.lineWidth = ow || 1.6; g.lineJoin = "round"; g.stroke(); } }
      function limb(g, x1, y1, x2, y2, wid, col, out) { g.lineCap = "round"; g.strokeStyle = out; g.lineWidth = wid + 2.4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = col; g.lineWidth = wid; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      function clipEll(g, x, y, rx, ry, fn) { g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.clip(); fn(); g.restore(); }
      function eye(g, x, y, r, iris) { ell(g, x, y, r + 0.6, r + 1, "#fff", null); if (iris) ell(g, x, y + 0.4, r * 0.8, r * 0.95, iris, null); ell(g, x, y + 0.6, r * 0.5, r * 0.7, "#201828", null); g.fillStyle = "#fff"; g.beginPath(); g.arc(x + r * 0.4, y - r * 0.3, r * 0.32, 0, 7); g.fill(); }
      function frontEyes(g, lx, rx, y, r, iris) { eye(g, lx, y, r, iris); eye(g, rx, y, r, iris); }
      // ---- chunky pixel toolkit (matches the unicorn's landing-style art) ----
      var PINK2 = "#ff9ecb", INKP = "#241a4a";
      function PXR(g) { return function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }; }
      function pOB(R, x, y, w, h) { R(x - 2, y - 2, w + 4, h + 4, INKP); }
      function pEyes(R, lx, rx, y) { R(lx, y, 4, 5, INKP); R(rx, y, 4, 5, INKP); R(lx + 1, y + 1, 1, 1, "#fff"); R(rx + 1, y + 1, 1, 1, "#fff"); }
      function outlineFix(oc, w, h) { var d = oc.getImageData(0, 0, w, h), p = d.data; for (var i = 0; i < p.length; i += 4) { if (p[i + 3] > 0 && p[i + 3] < 160) p[i + 3] = 255; } oc.putImageData(d, 0, 0); }
      // Snap a smooth vector sprite onto a chunky pixel grid + a 1-block ink outline,
      // so every hero shares the unicorn's blocky retro look. B = block size in source px.
      function pixelize(src, B) {
        var w = src.width, h = src.height, img = src.getContext("2d").getImageData(0, 0, w, h).data;
        var cols = Math.ceil(w / B), rows = Math.ceil(h / B), grid = [];
        for (var gy = 0; gy < rows; gy++) { grid[gy] = []; for (var gx = 0; gx < cols; gx++) {
          var r = 0, gg = 0, b = 0, aw = 0, cov = 0, tot = 0;
          for (var yy = 0; yy < B; yy++) for (var xx = 0; xx < B; xx++) {
            var px = gx * B + xx, py = gy * B + yy; if (px >= w || py >= h) continue; tot++;
            var i = (py * w + px) * 4, al = img[i + 3];
            if (al > 60) { r += img[i] * al; gg += img[i + 1] * al; b += img[i + 2] * al; aw += al; cov++; }
          }
          grid[gy][gx] = (cov >= tot * 0.34 && aw > 0) ? { on: true, r: Math.round(r / aw), g: Math.round(gg / aw), b: Math.round(b / aw) } : { on: false };
        } }
        var out = document.createElement("canvas"); out.width = w; out.height = h; var o = out.getContext("2d");
        function on(gx, gy) { return gy >= 0 && gy < rows && gx >= 0 && gx < cols && grid[gy][gx].on; }
        for (var oy = 0; oy < rows; oy++) for (var ox = 0; ox < cols; ox++) {
          if (grid[oy][ox].on || !(on(ox - 1, oy) || on(ox + 1, oy) || on(ox, oy - 1) || on(ox, oy + 1) || on(ox - 1, oy - 1) || on(ox + 1, oy - 1) || on(ox - 1, oy + 1) || on(ox + 1, oy + 1))) continue;
          o.fillStyle = "#241a4a"; o.fillRect(ox * B, oy * B, B, B);
        }
        for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) { var c = grid[cy][cx]; if (!c.on) continue; o.fillStyle = "rgb(" + c.r + "," + c.g + "," + c.b + ")"; o.fillRect(cx * B, cy * B, B, B); }
        return out;
      }
      // ---- shared chunky-pixel kit — same grid the unicorn uses, so every hero is one 8-bit set ----
      var INKC = "#241a4a", SU = 2.7;
      function sideKit(g, fr) {
        function px(rx, ry, w, h, col) { g.fillStyle = col; g.fillRect(Math.round((rx + 3.5) * SU) + 1, Math.round((ry + 3.1) * SU) + 1, Math.max(1, Math.round(w * SU)), Math.max(1, Math.round(h * SU))); }
        function ob(rx, ry, w, h) { px(rx - 0.45, ry - 0.45, w + 0.9, h + 0.9, INKC); }
        function leg(rx, alt, col, paw) { var up = (fr === 0) ? alt : (1 - alt), h = 4.4 - up * 2.2; ob(rx, 11, 2, h); px(rx, 11, 2, h, col); px(rx, 11 + h - 1.1, 2, 1.4, paw || col); }
        function eyeP(rx, ry) { px(rx, ry, 1.5, 1.7, INKC); px(rx + 0.4, ry + 0.2, 0.6, 0.6, "#fff"); }
        function mouth(rx, ry, w) { px(rx, ry, w, 0.8, INKC); px(rx - 0.5, ry - 0.7, 1, 0.9, INKC); px(rx + w - 0.5, ry - 0.7, 1, 0.9, INKC); }
        return { px: px, ob: ob, leg: leg, eyeP: eyeP, mouth: mouth };
      }
      function frontKit(g) {
        function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
        function ob(x, y, w, h) { R(x - 2, y - 2, w + 4, h + 4, INKC); }
        function eyes2(lx, rx, y) { R(lx, y, 5, 6, INKC); R(rx, y, 5, 6, INKC); R(lx + 1, y + 1, 2, 2, "#fff"); R(rx + 1, y + 1, 2, 2, "#fff"); }
        function mouthF(cx, y, w) { R(cx - w / 2, y, w, 2, INKC); R(cx - w / 2 - 2, y - 2, 3, 2, INKC); R(cx + w / 2 - 1, y - 2, 3, 2, INKC); }
        return { R: R, ob: ob, eyes2: eyes2, mouthF: mouthF };
      }
      function catSide(g, fr) {
        var B = "#9aa4b6", D = "#727e98", W = "#eef2f8", am = "#f5b731", pk = "#ff8fb0", st = "#616d88";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        for (var t = 0; t < 5; t++) px(-1.4 - (t < 2 ? t * 0.3 : (4 - t) * 0.3), 9.4 - t * 1.4, 2, 1.6, t % 2 ? D : B);   // curling tail
        K.leg(3, 0, B, W); K.leg(5.4, 1, B, W);                                     // back legs
        ob(2, 6.4, 11, 5.4); px(2, 6.4, 11, 5.4, B); px(2, 10.2, 11, 1.6, D); px(1.4, 7.2, 1.6, 3.4, B);   // body + belly shade
        px(4, 7.2, 1.6, 1, st); px(7, 6.8, 1.6, 1, st); px(9.6, 7.2, 1.6, 1, st);   // back stripes
        K.leg(9, 1, B, W); K.leg(11.4, 0, B, W);                                     // front legs
        ob(10.4, 2.6, 6.2, 5.6); px(10.4, 2.6, 6.2, 5.6, B);                          // head
        px(10.2, 1.2, 1.9, 2, B); px(10.6, 1.7, 1, 1, pk); px(14.9, 1.2, 1.9, 2, B); px(15.3, 1.7, 1, 1, pk);   // ears
        px(14.6, 5.4, 2.6, 2.4, W); px(15.7, 5.7, 1, 0.9, pk);                        // muzzle + nose
        px(11.2, 3.4, 1.6, 1, st); px(11.6, 5, 1.4, 1, st);                           // face stripes
        K.eyeP(13.1, 3.9); px(12.9, 3.7, 1.9, 0.5, am);                               // amber-lidded eye
      }
      function foxSide(g, fr) {
        var B = "#e8722a", D = "#c1531a", W = "#fde6cf", sk = "#3a2418";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        for (var t = 0; t < 5; t++) px(-2 - t * 0.5, 7.6 + t * 0.7, 2.6, 2.2, t > 3 ? W : B);   // bushy tail, white tip
        K.leg(3, 0, B, sk); K.leg(5.4, 1, B, sk);                                    // back legs (dark socks)
        ob(2, 6.4, 11, 5.4); px(2, 6.4, 11, 5.4, B); px(2, 9.8, 11, 2, W); px(1.4, 7.2, 1.6, 3, B);   // body + white belly
        K.leg(9, 1, B, sk); K.leg(11.4, 0, B, sk);                                    // front legs
        ob(10.4, 2.8, 6.4, 5.2); px(10.4, 2.8, 6.4, 5.2, B);                          // head
        px(10, 1, 2, 2.2, B); px(10.4, 1.4, 1.1, 1.1, sk); px(15, 1, 2, 2.2, B); px(15.4, 1.4, 1.1, 1.1, sk);   // pointed ears
        px(14.4, 5.2, 3, 2.6, W); px(16.4, 5.9, 1.1, 1, sk);                          // white snout + nose
        K.eyeP(12.7, 4);
      }
      // Pixel-art unicorn ported from the landing hero (rainbow mane & tail, gold spiral horn, star flank).
      function uniSide(g, fr) {
        var WT = "#ffffff", WS = "#e2e7ff", INK = "#241a4a", GOLD = "#ffd23f", GHI = "#fff2a8", GLO = "#c9930a", PINK = "#ff9ecb", HOOF = "#b07be0";
        var RBu = ["#ff5a7a", "#ff9a3f", "#ffd23f", "#5fd06a", "#4aa8ff", "#a06bff"], U = 2.7;
        function P2(rx, ry, w, h, col) { g.fillStyle = col; g.fillRect(Math.round((rx + 3.5) * U) + 1, Math.round((ry + 3.1) * U) + 1, Math.max(1, Math.round(w * U)), Math.max(1, Math.round(h * U))); }
        function ob(rx, ry, w, h) { P2(rx - 0.45, ry - 0.45, w + 0.9, h + 0.9, INK); }   // chunky dark outline behind a mass
        function leg(rx, alt) { var up = (fr === 0) ? alt : (1 - alt), h = 4.4 - up * 2.2; ob(rx, 11, 2, h); P2(rx, 11, 2, h, WT); P2(rx, 11 + h - 1.1, 2, 1.4, HOOF); }
        for (var i = 0; i < 6; i++) P2(-1 - i * 0.5, 5 + i * 1.5, 3.2, 1.6, RBu[i]);        // tail
        leg(3, 0); leg(5.4, 1);                                                            // back legs
        ob(2, 6, 11, 6); P2(2, 6, 11, 6, WT); P2(2, 10.6, 11, 1.4, WS); P2(1.4, 7, 1.6, 4, WT);   // body
        ob(9.5, 3.5, 4, 5); ob(10.5, 2, 5.4, 4.4);                                         // neck + head outline
        P2(9.5, 3.5, 4, 5, WT); P2(10.5, 2, 5.4, 4.4, WT); P2(15, 4.4, 1.8, 2.2, PINK); P2(15.4, 5, 0.9, 0.9, INK); P2(9.8, 2, 1.8, 1.8, WT);
        P2(12.6, 3.4, 1.3, 1.5, INK); P2(14.1, 5.1, 1.1, 1.1, "#ff8ab5");                  // eye + cheek
        for (var hgt = 0; hgt < 4; hgt++) { var hw = 2.0 - hgt * 0.45; P2(11.6 + hgt * 0.25, -0.4 - hgt * 0.9, hw, 1.0, hgt % 2 ? GHI : GOLD); }  // horn
        for (var m = 0; m < 6; m++) P2(8.4 - (m > 2 ? 0.6 : 0), 1.2 + m * 1.3, 2.6, 1.5, RBu[m]);  // mane
        P2(10.2, 1, 2.4, 1.4, RBu[0]);                                                     // forelock
        leg(9, 1); leg(11.4, 0);                                                           // front legs
        starP(g, Math.round((6.4 + 3.5) * U) + 1, Math.round((8.4 + 3.1) * U) + 1, 1.9 * U, GOLD, GLO, 1);   // star on flank
        var sx0 = Math.round((17 + 3.5) * U), sy0 = Math.round((-1 + 3.1) * U);            // sparkle by the horn
        g.fillStyle = GOLD; g.fillRect(sx0 - 2, sy0 + 1, 6, 1); g.fillRect(sx0 + 1, sy0 - 2, 1, 6); g.fillStyle = GHI; g.fillRect(sx0, sy0, 2, 2);
      }
      function catFront(g) {
        var B = "#9aa4b6", D = "#727e98", W = "#eef2f8", am = "#f5b731", pk = "#ff8fb0", st = "#616d88";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(30, 49, 8, 9); ob(42, 49, 8, 9); R(30, 49, 8, 9, B); R(42, 49, 8, 9, B); R(30, 54, 8, 4, W); R(42, 54, 8, 4, W);   // legs + paws
        ob(29, 40, 22, 12); R(29, 40, 22, 12, B); R(33, 46, 14, 6, W);                // body + belly
        ob(26, 22, 28, 22); R(26, 22, 28, 22, B);                                     // head
        R(26, 12, 8, 11, B); R(28, 15, 4, 6, pk); R(46, 12, 8, 11, B); R(48, 15, 4, 6, pk);   // ears
        R(34, 25, 3, 2, st); R(43, 25, 3, 2, st); R(38, 24, 4, 2, st);                // forehead stripes
        R(31, 30, 6, 6, am); R(43, 30, 6, 6, am); R(33, 31, 3, 4, INKC); R(44, 31, 3, 4, INKC); R(34, 32, 1, 1, "#fff"); R(45, 32, 1, 1, "#fff");   // amber eyes
        R(34, 37, 12, 7, W); R(38, 39, 4, 3, pk); R(39, 42, 2, 3, INKC);              // muzzle + nose
        R(20, 37, 8, 1, "#dfe6f0"); R(20, 40, 8, 1, "#dfe6f0"); R(52, 37, 8, 1, "#dfe6f0"); R(52, 40, 8, 1, "#dfe6f0");   // whiskers
      }
      function foxFront(g) {
        var B = "#e8722a", D = "#c1531a", W = "#fde6cf", sk = "#3a2418";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(30, 49, 8, 9); ob(42, 49, 8, 9); R(30, 49, 8, 9, B); R(42, 49, 8, 9, B); R(30, 55, 8, 3, sk); R(42, 55, 8, 3, sk);   // legs + dark socks
        ob(29, 40, 22, 12); R(29, 40, 22, 12, B); R(33, 46, 14, 6, W);                // body + white chest
        R(24, 10, 9, 13, B); R(26, 13, 5, 7, sk); R(47, 10, 9, 13, B); R(49, 13, 5, 7, sk);   // big pointed ears
        ob(27, 24, 26, 20); R(27, 24, 26, 20, B);                                     // head (upper orange)
        R(30, 34, 20, 10, W);                                                         // white lower face / cheeks
        R(31, 30, 5, 5, INKC); R(44, 30, 5, 5, INKC); R(32, 31, 2, 2, "#fff"); R(45, 31, 2, 2, "#fff");   // eyes
        R(36, 38, 8, 5, D); R(38, 40, 4, 3, INKC);                                    // muzzle + nose
      }
      // Pixel-art front-facing unicorn to match the running side sprite.
      function uniFront(g) {
        var WT = "#ffffff", WS = "#e2e7ff", INK = "#241a4a", GOLD = "#ffd23f", GHI = "#fff2a8", GLO = "#c9930a", HOOF = "#b07be0";
        var RBu = ["#ff5a7a", "#ff9a3f", "#ffd23f", "#5fd06a", "#4aa8ff", "#a06bff"];
        function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
        function ob(x, y, w, h) { R(x - 2, y - 2, w + 4, h + 4, INK); }
        ob(30, 46, 7, 13); ob(43, 46, 7, 13); R(30, 46, 7, 13, WT); R(43, 46, 7, 13, WT); R(30, 55, 7, 4, HOOF); R(43, 55, 7, 4, HOOF);  // legs
        ob(26, 40, 28, 15); R(26, 40, 28, 15, WT); R(26, 50, 28, 4, WS);                       // body
        for (var k = 0; k < 6; k++) { var hw = 9 - k * 1.3; R(40 - hw / 2, 2 + k * 3, hw, 3, k % 2 ? GHI : GOLD); }   // horn
        ob(28, 18, 7, 8); ob(45, 18, 7, 8); R(28, 18, 7, 8, WT); R(45, 18, 7, 8, WT); R(30, 20, 3, 4, "#ff9ecb"); R(47, 20, 3, 4, "#ff9ecb");  // ears
        ob(26, 22, 28, 24); R(26, 22, 28, 24, WT);                                             // head
        for (var m = 0; m < 6; m++) R(27 + m * 4.3, 20, 4.4, 6, RBu[m]);                        // rainbow bangs
        R(33, 32, 5, 6, INK); R(42, 32, 5, 6, INK); R(34, 33, 2, 2, "#fff"); R(43, 33, 2, 2, "#fff");  // eyes
        R(28, 38, 4, 3, "#ff8ab5"); R(48, 38, 4, 3, "#ff8ab5");                                 // cheeks
        R(34, 40, 12, 6, WS); R(37, 43, 2, 2, INK); R(41, 43, 2, 2, INK);                       // muzzle + nostrils
        starP(g, 40, 48, 5, GOLD, GLO, 1);                                                     // chest star
      }
      // ---- unlockable object heroes ----
      function starP(g, cx, cy, r, fill, out, ow) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = Math.PI / 5 * i - Math.PI / 2, rr2 = i % 2 ? r * .44 : r; g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (out) { g.strokeStyle = out; g.lineWidth = ow || 1.6; g.lineJoin = "round"; g.stroke(); } }
      function smile(g, sx0, sy0, w) { g.strokeStyle = "#201828"; g.lineWidth = 1.2; g.beginPath(); g.arc(sx0, sy0, w, .15 * Math.PI, .85 * Math.PI); g.stroke(); }
      function stalkEye(g, bx, by, ex, ey) { limb(g, bx, by, ex, ey, 2, "#ff6a52", "#8a1e12"); ell(g, ex, ey - 2, 3, 3.4, "#fff", "#8a1e12", 1.2); g.fillStyle = "#201828"; ell(g, ex, ey - 1, 1.3, 1.6, "#201828", null); }
      function roboSide(g, fr) {
        var M = "#c6d0de", Ms = "#8a94a8", vi = "#37e0ff", rd = "#ff5c6c", ft = "#5a6478";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        function foot(rx, lift) { var h = 4 - lift; ob(rx, 11, 2.6, h); px(rx, 11, 2.6, h, Ms); px(rx - 0.4, 11 + h - 1.2, 3.4, 1.4, ft); }
        foot(5, fr ? 1.4 : 0); foot(9, fr ? 0 : 1.4);
        ob(3, 5.6, 9.6, 6); px(3, 5.6, 9.6, 6, M); px(3, 9.4, 9.6, 2.2, Ms);        // torso
        px(4.4, 6.9, 6, 2.6, ft); px(5, 7.4, 1.5, 1.5, vi);                          // chest panel + light
        px(12.8, 6.4, 2.2, 3.4, Ms); px(12.8, 8.8, 2.6, 1.4, Ms);                    // arm
        ob(8.6, 2.2, 6.4, 5); px(8.6, 2.2, 6.4, 5, M);                               // head
        px(9.4, 3.2, 5, 2.6, "#10304a"); px(10, 3.7, 1.6, 1.6, vi); px(12.4, 3.7, 1.6, 1.6, vi);   // visor + eyes
        px(11.4, 0.2, 0.8, 2, Ms); px(11, -1, 1.6, 1.3, rd);                         // antenna + red bulb
      }
      function cometSide(g, fr) {
        var core = "#eef6ff", cy = "#5fd0ff", fl = ["#ff5c6c", "#ffb020", "#ffd23f"];
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        for (var t = 0; t < 6; t++) { var wob = (fr ? 1 : -1) * (t % 2 ? 0.4 : -0.4); px(5.4 - t * 1.15, 6 - Math.abs(t - 2.5) * 0.3 + wob, 1.9, 3.2 - Math.abs(t - 2.5) * 0.35, fl[t % 3]); }   // flaming tail
        ob(6.4, 3.6, 8.6, 8.8); px(6.4, 3.6, 8.6, 8.8, core); px(7.8, 4.9, 6, 6.2, cy);  // icy head
        K.eyeP(8.4, 6.8); K.eyeP(11.4, 6.8); K.mouth(9.2, 10.2, 2.4);
        px(14.4, 1.8, 1, 1, "#fff"); px(13.9, 2.2, 2, 0.6, "#fff"); px(14.4, 1.1, 0.6, 2.2, "#fff");  // sparkle
      }
      function novaSide(g, fr) {
        var s = "#ffe14a", hi = "#fff6c8";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        function blk(rx, ry, w, h) { ob(rx, ry, w, h); px(rx, ry, w, h, s); }
        var la = fr ? -0.6 : 0.6;
        blk(2.4, 6.4, 3, 2); blk(11.6, 6.4, 3, 2);           // arm points
        blk(5 + la, 10.4, 2, 3); blk(9.2 - la, 10.4, 2, 3);  // leg points
        blk(7.4, 2.2, 2.2, 3);                               // top point
        blk(5.4, 4.8, 6.2, 5.6);                             // core
        px(6, 5.2, 2, 2, hi);                                // shine
        K.eyeP(6.6, 6.6); K.eyeP(9.2, 6.6); K.mouth(7.4, 9, 2.4);
      }
      function dracoSide(g, fr) {
        var G = "#3fae4a", Gd = "#2f8f3a", bel = "#a8e86a", sp = "#ffd23f";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        for (var t = 0; t < 4; t++) px(-1.4 - t * 0.7, 9.6 - t * 0.5, 2, 1.8, Gd);   // tail
        px(-3.4, 8.6, 1.5, 1.5, sp);                                                  // tail spike
        K.leg(3.4, 0, Gd, Gd); K.leg(5.8, 1, Gd, Gd);                                 // back legs
        ob(2, 6, 11, 5.6); px(2, 6, 11, 5.6, G); px(2.4, 9.4, 8, 2, bel);             // body + belly
        px(5, 3.9, 3.6, 2.6, Gd); px(5.4, 3, 2.6, 1.2, Gd);                           // wing
        K.leg(9, 1, Gd, Gd); K.leg(11.2, 0, Gd, Gd);                                  // front legs
        ob(10.4, 2.6, 6.2, 5.4); px(10.4, 2.6, 6.2, 5.4, G);                          // head
        px(11, 1, 1.4, 1.6, sp); px(13, 0.6, 1.4, 1.8, sp);                           // horns
        px(14.6, 5.2, 2.6, 2.2, bel); px(16.4, 5.8, 1, 0.9, INKC);                    // snout + nostril
        K.eyeP(12.4, 3.8);
      }
      function orbitSide(g, fr) {
        var pl = "#8a6bff", pd = "#5a3fd0", ring = "#ffd23f", rgd = "#e0a91e", spot = "#b7a3ff";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        ob(4.2, 3.6, 9.4, 9.4); px(4.2, 3.6, 9.4, 9.4, pl); px(4.2, 9.4, 9.4, 3.6, pd);   // planet
        px(6, 5.2, 2, 2, spot); px(10, 8, 1.6, 1.6, spot);                                 // craters
        var ry = fr ? 8.8 : 9.2;
        px(1, ry - 0.4, 3.6, 1.5, ring); px(13, ry - 0.4, 3.6, 1.5, ring);                 // ring wings
        px(4.2, ry, 9.4, 1.3, rgd);                                                        // ring across front
        K.eyeP(6.4, 6.4); K.eyeP(9.6, 6.4); K.mouth(7.4, 8.6, 2.6);
      }
      function roboFront(g) {
        var M = "#c6d0de", Ms = "#8a94a8", vi = "#37e0ff", rd = "#ff5c6c", ft = "#5a6478";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(30, 50, 8, 8); ob(42, 50, 8, 8); R(30, 50, 8, 8, Ms); R(42, 50, 8, 8, Ms); R(29, 55, 10, 3, ft); R(41, 55, 10, 3, ft);   // legs + feet
        ob(20, 40, 7, 11); ob(53, 40, 7, 11); R(20, 40, 7, 11, Ms); R(53, 40, 7, 11, Ms);            // arms
        ob(28, 37, 24, 15); R(28, 37, 24, 15, M); R(32, 42, 16, 6, ft); R(34, 43, 4, 4, vi);          // torso + panel
        ob(28, 18, 24, 18); R(28, 18, 24, 18, M); R(32, 22, 16, 9, "#10304a");                        // head + visor
        R(34, 24, 5, 5, vi); R(41, 24, 5, 5, vi);                                                     // eyes
        R(38, 8, 3, 8, Ms); R(35, 3, 8, 6, rd);                                                       // antenna + bulb
      }
      function cometFront(g) {
        var core = "#eef6ff", cy = "#5fd0ff", fl = ["#ff5c6c", "#ffb020", "#ffd23f"];
        var K = frontKit(g), R = K.R, ob = K.ob;
        [[24, 16], [33, 8], [45, 8], [54, 16]].forEach(function (p, i) { R(p[0], p[1], 7, 11, fl[i % 3]); });   // flame crown
        ob(26, 20, 28, 28); R(26, 20, 28, 28, core); R(30, 24, 20, 20, cy);                          // icy head
        K.eyes2(33, 44, 29); K.mouthF(40, 39, 9);
        R(56, 24, 2, 2, "#fff"); R(55, 25, 4, 1, "#fff"); R(56.5, 22.5, 1, 5, "#fff");                // sparkle
      }
      function novaFront(g) {
        var s = "#ffe14a", hi = "#fff6c8";
        var K = frontKit(g), R = K.R, ob = K.ob;
        function blk(x, y, w, h) { ob(x, y, w, h); R(x, y, w, h, s); }
        blk(34, 6, 11, 10);                                       // top point
        blk(12, 26, 12, 9); blk(56, 26, 12, 9);                   // arm points
        blk(24, 46, 10, 10); blk(46, 46, 10, 10);                 // leg points
        blk(27, 22, 26, 24);                                      // core
        R(31, 25, 6, 6, hi);                                      // shine
        K.eyes2(33, 44, 30); K.mouthF(40, 40, 8);
      }
      function dracoFront(g) {
        var G = "#3fae4a", Gd = "#2f8f3a", bel = "#a8e86a", sp = "#ffd23f";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(32, 48, 7, 10); ob(41, 48, 7, 10); R(32, 48, 7, 10, Gd); R(41, 48, 7, 10, Gd);            // legs
        ob(16, 34, 11, 12); ob(53, 34, 11, 12); R(16, 34, 11, 12, Gd); R(53, 34, 11, 12, Gd);        // wings
        ob(28, 36, 24, 15); R(28, 36, 24, 15, G); R(33, 40, 14, 9, bel);                             // body + belly
        ob(28, 18, 24, 20); R(28, 18, 24, 20, G);                                                    // head
        R(29, 8, 6, 9, sp); R(45, 8, 6, 9, sp);                                                      // horns
        K.eyes2(32, 43, 24);
        R(34, 34, 12, 5, bel); R(36, 35, 2, 2, INKC); R(42, 35, 2, 2, INKC);                         // snout + nostrils
      }
      function orbitFront(g) {
        var pl = "#8a6bff", pd = "#5a3fd0", ring = "#ffd23f", rgd = "#e0a91e", spot = "#b7a3ff";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(24, 18, 32, 32); R(24, 18, 32, 32, pl); R(24, 37, 32, 13, pd);                            // planet
        R(28, 24, 6, 6, spot); R(46, 40, 5, 5, spot);                                                // craters
        R(11, 39, 15, 4, ring); R(54, 39, 15, 4, ring); R(24, 40, 32, 3, rgd);                       // ring
        K.eyes2(31, 44, 28); K.mouthF(40, 40, 9);
      }
      // ---- secret heroes ----
      function shellySide(g, fr) {
        var Rc = "#ff5a44", Rd = "#d63626", gem = "#ffd23f";
        var K = sideKit(g, fr), px = K.px, ob = K.ob, lf = fr ? 0.7 : -0.7;
        [3.4, 6.2, 9].forEach(function (lx, i) { px(lx + (i % 2 ? lf : -lf), 11, 1.4, 3, Rd); });   // legs
        ob(2.4, 6.6, 10.4, 4.8); px(2.4, 6.6, 10.4, 4.8, Rc); px(2.4, 9.6, 10.4, 1.8, Rd);          // shell
        px(12.8, 6.8, 2.4, 2.8, Rc); px(14.4, 6.2, 1.8, 1.6, Rc); px(14.4, 8.4, 1.8, 1.4, Rc);      // claw
        px(5.2, 4.2, 1, 2.6, Rd); px(4.4, 2.8, 2.2, 2.2, "#fff"); px(4.9, 3.2, 1.1, 1.2, INKC);     // stalk eye L
        px(9, 4.2, 1, 2.6, Rd); px(8.2, 2.8, 2.2, 2.2, "#fff"); px(8.7, 3.2, 1.1, 1.2, INKC);       // stalk eye R
        px(6.6, 7, 1.6, 1.4, gem); K.mouth(6.4, 9, 2.6);                                            // gem + smile
      }
      function finnSide(g, fr) {
        var C = "#37c0ff", fin = "#8fe0ff", bel = "#cdeeff";
        var K = sideKit(g, fr), px = K.px, ob = K.ob, tw = fr ? 0.6 : -0.6;
        px(0.8, 5.2 + tw, 2, 2.2, fin); px(0, 4.2 + tw, 1.6, 4.4, fin); px(0.8, 8.2 + tw, 2, 2.2, fin);   // tail fin
        ob(3, 5.6, 10, 6); px(3, 5.6, 10, 6, C); px(3.4, 9, 8.2, 2.2, bel);          // body
        px(6, 3.6, 3, 1.8, fin); px(6, 11.4, 3, 1.4, fin);                            // dorsal + bottom fin
        K.eyeP(10, 6.6); K.mouth(9.4, 9.4, 2);
      }
      function mangoSide(g, fr) {
        var br = "#8a5a2a", brd = "#6a3f1e", face = "#d3a869";
        var K = sideKit(g, fr), px = K.px, ob = K.ob;
        for (var t = 0; t < 4; t++) px(-1.4 - t * 0.5, 8 - t * 0.8, 1.8, 1.8, brd);   // curling tail
        K.leg(3.4, 0, brd, brd); K.leg(5.8, 1, brd, brd);                             // back legs
        ob(2, 6.2, 10.5, 5.4); px(2, 6.2, 10.5, 5.4, br); px(2.6, 7.6, 6, 3, face);   // body + tummy
        K.leg(9, 1, br, br); K.leg(11.2, 0, br, br);                                  // front limbs
        ob(9.8, 2.6, 6.6, 5.6); px(9.8, 2.6, 6.6, 5.6, br);                           // head
        px(9.2, 3.4, 1.6, 2, br); px(15.6, 3.4, 1.6, 2, br);                          // ears
        px(11.2, 4.2, 4.8, 4, face);                                                  // face patch
        K.eyeP(11.9, 4.6); K.eyeP(13.8, 4.6);
        px(12.2, 6.4, 2.6, 1.4, "#c79a5e"); K.mouth(12.4, 7.4, 1.8);                  // muzzle
      }
      function shellyFront(g) {
        var Rc = "#ff5a44", Rd = "#d63626", gem = "#ffd23f";
        var K = frontKit(g), R = K.R, ob = K.ob;
        [26, 32, 56, 62].forEach(function (x) { R(x, 46, 4, 9, Rd); }); R(24, 50, 6, 4, Rd); R(50, 50, 6, 4, Rd);   // legs
        ob(12, 34, 12, 10); R(12, 34, 12, 10, Rc); R(9, 31, 7, 6, Rc);                // claw L
        ob(56, 34, 12, 10); R(56, 34, 12, 10, Rc); R(64, 31, 7, 6, Rc);               // claw R
        ob(28, 30, 24, 16); R(28, 30, 24, 16, Rc); R(28, 40, 24, 6, Rd);              // shell
        R(34, 16, 3, 8, Rd); R(43, 16, 3, 8, Rd); R(31, 9, 8, 8, "#fff"); R(41, 9, 8, 8, "#fff"); R(33, 11, 4, 4, INKC); R(43, 11, 4, 4, INKC);   // stalk eyes
        R(36, 33, 8, 5, gem); K.mouthF(40, 42, 9);                                     // gem + smile
      }
      function finnFront(g) {
        var C = "#37c0ff", fin = "#8fe0ff", bel = "#cdeeff";
        var K = frontKit(g), R = K.R, ob = K.ob;
        R(10, 30, 12, 10, fin); R(58, 30, 12, 10, fin);                               // side fins
        ob(26, 20, 28, 28); R(26, 20, 28, 28, C); R(30, 40, 20, 8, bel);              // body
        R(34, 12, 12, 6, fin);                                                        // top fin
        K.eyes2(31, 44, 28); K.mouthF(40, 40, 8);
      }
      function mangoFront(g) {
        var br = "#8a5a2a", brd = "#6a3f1e", face = "#d3a869";
        var K = frontKit(g), R = K.R, ob = K.ob;
        ob(32, 48, 7, 9); ob(41, 48, 7, 9); R(32, 48, 7, 9, brd); R(41, 48, 7, 9, brd);            // legs
        ob(20, 34, 8, 12); ob(52, 34, 8, 12); R(20, 34, 8, 12, br); R(52, 34, 8, 12, br);          // arms
        ob(30, 38, 20, 12); R(30, 38, 20, 12, br); R(34, 41, 12, 8, face);                         // body + tummy
        R(22, 20, 8, 8, br); R(50, 20, 8, 8, br); R(24, 22, 4, 4, face); R(52, 22, 4, 4, face);    // ears
        ob(28, 18, 24, 20); R(28, 18, 24, 20, br); R(33, 24, 14, 13, face);                        // head + face patch
        K.eyes2(33, 42, 26);
        R(36, 33, 8, 4, "#c79a5e"); R(38, 34, 1, 1, INKC); R(41, 34, 1, 1, INKC); K.mouthF(40, 37, 6);   // muzzle
      }
      function sideSet(fn, B) { var a = []; for (var fr = 0; fr < 2; fr++) { var cv = document.createElement("canvas"); cv.width = HA_W; cv.height = HA_H; var oc = cv.getContext("2d"); fn(oc, fr); outlineFix(oc, HA_W, HA_H); a.push(B ? pixelize(cv, B) : cv); } return a; }
      function frontOne(fn, B) { var cv = document.createElement("canvas"); cv.width = HA_FW; cv.height = HA_FH; var oc = cv.getContext("2d"); fn(oc); outlineFix(oc, HA_FW, HA_FH); return B ? pixelize(cv, B) : cv; }
      var PXS = 3, PXF = 3;   // block size for chunky-pixel heroes (side / front)
      HERO_ART.unicorn = { front: frontOne(uniFront), side: sideSet(uniSide) };   // unicorn: hand-drawn pixel art, kept as-is
      HERO_ART.cat = { front: frontOne(catFront), side: sideSet(catSide) };
      HERO_ART.fox = { front: frontOne(foxFront), side: sideSet(foxSide) };
      HERO_ART.robo = { front: frontOne(roboFront), side: sideSet(roboSide) };
      HERO_ART.comet = { front: frontOne(cometFront), side: sideSet(cometSide) };
      HERO_ART.nova = { front: frontOne(novaFront), side: sideSet(novaSide) };
      HERO_ART.draco = { front: frontOne(dracoFront), side: sideSet(dracoSide) };
      HERO_ART.orbit = { front: frontOne(orbitFront), side: sideSet(orbitSide) };
      HERO_ART.shelly = { front: frontOne(shellyFront), side: sideSet(shellySide) };
      HERO_ART.finn = { front: frontOne(finnFront), side: sideSet(finnSide) };
      HERO_ART.mango = { front: frontOne(mangoFront), side: sideSet(mangoSide) };
    }
    // draw a hero into an on-screen box; uses the 32-bit sprite if we have one, else the classic bitmap
    function heroDraw(g, type, dx, dy, dw, dh, frame, front) {
      var art = HERO_ART[type];
      if (art) { g.imageSmoothingEnabled = false; if (front && art.front) g.drawImage(art.front, 0, 0, HA_FW, HA_FH, dx, dy, dw, dh); else g.drawImage(art.side[frame ? 1 : 0], 0, 0, HA_W, HA_H, dx, dy, dw, dh); return; }
      var H = HERO_MAP[type] || HERO_MAP.unicorn; hbx.clearRect(0, 0, 14, 12); spr(hbx, 0, 0, H.rows, H.map); g.imageSmoothingEnabled = false; g.drawImage(heroBuf, 0, 0, 14, 12, dx, dy, dw, dh);
    }
    function drawHeroPix(g, bx, by, B, type) { var fr = (G && (G.state === "run" || G.mini || G.lane || G.ast)) ? Math.floor(G.t * 8) % 2 : 0; heroDraw(g, type, bx, by, 14 * B, 12 * B, fr, false); }

    // A designed "you're stuck here" scene for the trap/escape moment — the world as a bright
    // themed place with the hero caught in the trap, instead of a dimmed frozen game.
    function drawTrapScene() {
      var th = G.theme, W = PIXW, H = PIXH, tr = (G.traps && G.traps[G.trapIndex]) || {};
      var gy = Math.round(H * 0.56); HIFI = !!th.hifi;
      if (HIFI) { x.fillStyle = lg(-2, gy, th.sky, th.sky2); x.fillRect(-2, -2, W + 4, H + 4); }
      else { P(-2, -2, W + 4, gy, th.sky); P(-2, gy - Math.round(H * 0.14), W + 4, H, th.sky2); }
      var sunx = Math.round(W * 0.82), suny = Math.round(H * 0.15);
      if (th.night) { for (var s2 = 0; s2 < 34; s2++) P((s2 * 61 + 7) % W, (s2 * 37) % (gy - 10), 2, 2, "#fff"); disc(sunx, suny, 9, "#f2eeff"); }
      else { disc(sunx, suny, 10, "#ffe06a"); disc(sunx, suny, 6, "#fff2a8"); }
      for (var ci = 0; ci < 4; ci++) pxCloud(((ci * 74 + 20) % (W + 40)), Math.round(H * (0.08 + ci * 0.07)), th.cloud);
      function mound(cx, rad, col) { for (var i = 0; i < rad; i++) P(cx - (rad - i) * 2, gy - i * 2, (rad - i) * 4, 3, col); }
      mound(Math.round(W * 0.28), 10, th.mtn || th.sky2); mound(Math.round(W * 0.66), 13, th.mtnS || th.mtn || th.sky2);
      P(-2, gy, W + 4, H - gy, th.dirt); P(-2, gy, W + 4, SZ(7), th.grass); P(-2, gy + SZ(7), W + 4, SZ(3), th.dirtL || th.dirt);
      pxProp(th.prop, Math.round(W * 0.15), gy, SZ(34), th); pxProp(th.prop, Math.round(W * 0.87), gy, SZ(28), th);
      var hx = Math.round(W * 0.5), hw = SZ(48), hh = SZ(42);
      heroDraw(x, HEROTYPE, hx - hw / 2, gy - hh, hw, hh, 0, true);
      try { pxTrap(tr.type || "bush", hx, gy, 0.5, true); } catch (e) {}
      var lab = (TRAP_LABEL[tr.type] || "CAUGHT!"), lf = Math.max(10, Math.round(Math.min(H * 0.05, W * 0.07)));
      x.textAlign = "center"; x.textBaseline = "middle"; x.font = "800 " + lf + "px monospace";
      var lw = Math.min(W - SZ(8), x.measureText(lab).width + SZ(24)), lh = Math.round(lf * 1.7), ly = Math.round(H * 0.05);
      x.fillStyle = "rgba(122,0,16,.92)"; x.fillRect(W / 2 - lw / 2, ly, lw, lh); x.strokeStyle = "#ff4f5a"; x.lineWidth = 2; x.strokeRect(W / 2 - lw / 2, ly, lw, lh);
      x.fillStyle = "#fff"; x.fillText(lab, W / 2, ly + lh / 2 + 1);
      x.fillStyle = "#ffd23f"; x.font = "800 " + Math.max(8, Math.round(H * 0.026)) + "px monospace"; x.fillText("SOLVE TO BREAK FREE!", W / 2, ly + lh + SZ(14));
      x.textBaseline = "alphabetic";
    }
    function draw() {
      if (G.state === "trapped") { var okT = true; try { drawTrapScene(); } catch (e) { okT = false; } if (okT) return; }
      if (G.state === "showdown" && G.sd) { sdDraw(); return; }
      if (G.state === "lanes" && G.lane) { laneDraw(); return; }
      if (G.state === "asteroid" && G.ast) { astDraw(); return; }
      if (G.mini && G.state === G.mini.key) { G.mini.draw(); return; }
      var th = G.theme, W = PIXW, H = PIXH, gY = FY(GROUND); HIFI = !!th.hifi;
      var shX = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0, shY = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0;
      x.save(); x.translate(shX, shY);
      if (HIFI) { x.fillStyle = lg(-2, gY + SZ(20), th.sky, th.sky2); x.fillRect(-2, -2, W + 4, H + 4); }
      else { P(-2, -2, W + 4, H * 0.6 + 2, th.sky); P(-2, H * 0.55, W + 4, H, th.sky2); }
      if (G.floaty) { x.globalAlpha = 0.2; P(-2, -2, W + 4, H + 4, "#1a86c0"); x.globalAlpha = 1; for (var bbn = 0; bbn < G.bubbles.length; bbn++) { var bbb = G.bubbles[bbn]; var bxs2 = FX(bbb.wx), bys2 = FY(bbb.y); if (bxs2 < -6 || bxs2 > W + 6) continue; x.globalAlpha = .5; x.strokeStyle = "#cdf3ff"; x.lineWidth = 1; x.beginPath(); x.arc(bxs2, bys2, Math.max(1, SZ(bbb.r)), 0, 6.29); x.stroke(); x.globalAlpha = 1; } }
      if (th.night) { for (var st = 0; st < 40; st++) { P((st * 61) % W, (st * 37) % (gY - 20), 1, 1, "#fff"); } }
      var sunx = Math.round(W * 0.8), suny = Math.round(H * 0.16);
      if (HIFI && !th.night) { var glow = x.createRadialGradient(sunx, suny, SZ(2), sunx, suny, SZ(30)); glow.addColorStop(0, "rgba(255,246,200,.9)"); glow.addColorStop(1, "rgba(255,224,106,0)"); x.fillStyle = glow; x.beginPath(); x.arc(sunx, suny, SZ(30), 0, 7); x.fill(); oE(sunx, suny, SZ(11), SZ(11), "#ffe884", null); oE(sunx, suny, SZ(7.5), SZ(7.5), "#fff6c8", null); }
      else if (!th.night) { for (var rr = 0; rr < 8; rr++) { var a = rr * Math.PI / 4; P(sunx + Math.round(Math.cos(a) * 14) - 1, suny + Math.round(Math.sin(a) * 14) - 1, 3, 3, "#ffe06a"); } disc(sunx, suny, 9, "#ffe06a"); disc(sunx, suny, 6, "#fff2a8"); }
      else { disc(sunx, suny, 8, "#f2eeff"); }
      for (var i = 0; i < 9; i++) { var sp2 = i % 2 ? 0.10 : 0.04, cyp = Math.round(H * (0.06 + ((i * 0.37) % 1) * 0.42)), cxp = ((i * 58 - (G.cam * sp2 + G.cloud * .4)) % (W + 50)); if (cxp < -40) cxp += W + 50; pxCloud(cxp, cyp, th.cloud); }
      pxMountains(th, gY);
      pxHills(G.cam * .35, gY - SZ(70), th.h1); pxHills(G.cam * .6, gY - SZ(24), th.h2);
      var PIER = th.name === "BEACH";
      if (PIER) { if (HIFI) hfWater(-2, W + 4, gY + SZ(4), th.water); else { P(-2, gY + SZ(4), W + 4, H - gY, th.water); var wsh = (G.t * 22) % SZ(10); for (var wr = gY + SZ(9); wr < H; wr += SZ(11)) for (var wc = -SZ(10); wc < W; wc += SZ(10)) P(wc + wsh, wr + Math.round(Math.sin((wc + G.t * 40) * 0.05) * SZ(1)), SZ(4), 1, "#bdeeff"); } }
      for (var s = 0; s < G.grounds.length; s++) {
        var sp = G.grounds[s]; var gx1 = FX(sp[0]), gx2 = FX(sp[1]); if (gx2 < -4 || gx1 > W + 4) continue;
        var sandSpan = PIER && G.sandUntil && (sp[0] + sp[1]) / 2 < G.sandUntil;   // Beach shore/dunes render as sand, not pier
        if (PIER && !sandSpan) {
          var dkH = SZ(15);
          for (var ps = Math.floor(sp[0] / 150) * 150; ps < sp[1]; ps += 150) { var pxp = FX(ps); if (pxp > gx1 + SZ(4) && pxp < gx2 - SZ(4)) { if (HIFI) oR(pxp - SZ(1), gY + dkH, SZ(7), H - gY, SZ(1), "#7a4a24", "#3a2410"); else { P(pxp, gY + dkH, SZ(5), H, "#7a4a24"); P(pxp + SZ(5), gY + dkH, SZ(1), H, "#5c3418"); } } }
          if (HIFI) { x.fillStyle = lg(gY, gY + dkH, "#e6b06a", "#b57a3c"); x.fillRect(gx1, gY, gx2 - gx1, dkH); x.fillStyle = "#f4cf94"; x.fillRect(gx1, gY, gx2 - gx1, SZ(3)); x.fillStyle = "#8a5a2a"; x.fillRect(gx1, gY + dkH - SZ(2), gx2 - gx1, SZ(2)); x.strokeStyle = "rgba(90,52,24,.55)"; x.lineWidth = Math.max(1, Math.round(sx)); for (var pk = Math.floor(sp[0] / 40) * 40; pk < sp[1]; pk += 40) { var pl3 = FX(pk); if (pl3 > gx1 && pl3 < gx2) { x.beginPath(); x.moveTo(pl3, gY + SZ(1)); x.lineTo(pl3, gY + dkH - SZ(1)); x.stroke(); } } }
          else { P(gx1, gY, gx2 - gx1, dkH, "#c78a48"); P(gx1, gY, gx2 - gx1, SZ(4), "#e2ac66"); P(gx1, gY + dkH - SZ(2), gx2 - gx1, SZ(2), "#8a5a2a"); for (var pk = Math.floor(sp[0] / 44) * 44; pk < sp[1]; pk += 44) { var pl2 = FX(pk); if (pl2 > gx1 && pl2 < gx2) P(pl2, gY, 1, dkH, "#9a6636"); } }
        } else if (HIFI) {
          hfGround(sp, gx1, gx2, gY, th);
        } else {
          P(gx1, gY, gx2 - gx1, H - gY + 4, th.dirt); P(gx1, gY, gx2 - gx1, SZ(8), th.grass);
          for (var d = Math.floor(sp[0] / 60) * 60; d < sp[1]; d += 60) { var dl = FX(d); if (dl > gx1 && dl < gx2) P(dl, gY + SZ(8), 1, H, th.dirtL); }
        }
      }
      if (th.water && !PIER) { for (var s2 = 0; s2 < G.grounds.length - 1; s2++) { var wa = FX(G.grounds[s2][1]), wb = FX(G.grounds[s2 + 1][0]); if (wb < -4 || wa > W + 4) continue; if (HIFI) hfWater(wa, wb - wa, gY + SZ(4), th.water); else { P(wa, gY + SZ(4), wb - wa, H, th.water); for (var wv = wa; wv < wb; wv += 6) P(wv + ((G.t * 20) % 6), gY + SZ(6), 3, 1, "#ffffff"); } } }
      // rolling hills — grassy mounds drawn over the flat ground, top edge following groundY()
      if (G.hills && G.hills.length) {
        for (var hli = 0; hli < G.hills.length; hli++) {
          var hl = G.hills[hli]; var hx0 = FX(hl.x0), hx1 = FX(hl.x1); if (hx1 < -4 || hx0 > W + 4) continue;
          x.fillStyle = lg(FY(GROUND - hl.h), gY + SZ(20), th.grass, th.h2); x.beginPath(); x.moveTo(hx0, gY + SZ(2));
          for (var hw = hl.x0; hw <= hl.x1; hw += 12) x.lineTo(FX(hw), FY(groundY(hw)));
          x.lineTo(hx1, gY + SZ(2)); x.closePath(); x.fill();
          x.strokeStyle = th.grass; x.lineWidth = Math.max(2, SZ(3)); x.beginPath();
          for (var hs = hl.x0; hs <= hl.x1; hs += 12) { var sxp = FX(hs), syp = FY(groundY(hs)); hs === hl.x0 ? x.moveTo(sxp, syp) : x.lineTo(sxp, syp); } x.stroke();
        }
      }
      for (var tr = 0; tr < G.props.length; tr++) { var t2 = G.props[tr]; var tx = FX(t2.x * 1); if (tx < -30 || tx > W + 30) continue; if (groundAt(t2.x)) pxProp(th.prop, tx, FY(groundY(t2.x)), SZ(t2.s), th); }
      for (var p = 0; p < G.platforms.length; p++) { var pl = G.platforms[p]; var px = FX(pl.x), pw = SZ(pl.w); if (px > W + 8 || px + pw < -8) continue; var ptp = FY(platTop(pl)); if (pl.skip) { pxSkipPlat(px, ptp, pw, pl.used, G.t); continue; } P(px, ptp, pw, SZ(18), "#a9713f"); P(px, ptp, pw, SZ(5), th.h1); P(px, ptp + SZ(14), pw, SZ(4), "#7a4a24"); }
      for (var pipn = 0; pipn < G.pipes.length; pipn++) { var pz2 = G.pipes[pipn]; var pxs = FX(pz2.x); if (pxs > W + 12 || pxs + SZ(pz2.w) < -12) continue; pxPipe(pxs, gY, SZ(pz2.h), SZ(pz2.w)); }
      if (G.warp && (!G.warp.done || G.state === "warping")) { var wpxs = FX(G.warp.x), wpty = FY(G.warp.top); if (wpxs > -40 && wpxs < W + 40) { pxWarp(wpxs, wpty, G.t); if (G.state !== "warping" && G.hero.wx > G.warp.x - 380 && G.hero.wx < G.warp.x + 40) { var ay = wpty - SZ(70) + Math.round(Math.sin(G.t * 6) * SZ(3)); P(wpxs - SZ(2), ay, SZ(5), SZ(16), "#ffe27a"); P(wpxs - SZ(8), ay + SZ(9), SZ(5), SZ(5), "#ffe27a"); P(wpxs + SZ(3), ay + SZ(9), SZ(5), SZ(5), "#ffe27a"); x.textAlign = "center"; x.fillStyle = "#ffe27a"; x.font = "800 " + SZ(11) + "px monospace"; x.fillText("JUMP!", wpxs, ay - SZ(3)); x.textAlign = "left"; } } }
      if (G.chest && !G.chest.taken) { var chxs = FX(G.chest.x); if (chxs > -30 && chxs < W + 30) pxChest(chxs, gY, G.t); }
      for (var brn = 0; brn < G.bricks.length; brn++) { var bkk = G.bricks[brn]; if (bkk.used) continue; var brs = FX(bkk.x); if (brs > W + 8 || brs < -8) continue; pxBrick(brs, FY(GROUND - bkk.hAbove), SZ(bkk.w), SZ(bkk.h), th); }
      for (var b = 0; b < G.boxes.length; b++) { var bx = G.boxes[b]; if (bx.used && bx.usedGone) continue; var bxs = FX(bx.x), bpop = bx.pop ? SZ(bx.pop * 36) : 0; if (bxs > W + 8 || bxs < -8) continue; pxBox(bxs, FY(GROUND - bx.hAbove) - bpop, SZ(bx.w), SZ(bx.h), bx.used, bx.power); if (bx.pop) bx.pop = Math.max(0, bx.pop - .03); }
      for (var f = 0; f < G.flags.length; f++) { var fl = G.flags[f]; var fxs = FX(fl.x); if (fxs > W + 8 || fxs < -8) continue; pxFlag(fxs, gY, fl.raise || 0, fl.half); }
      if (G.star && !G.star.taken) { var stx = FX(G.star.x), sty = FY(GROUND - G.star.hAbove) + Math.round(Math.sin(G.t * 3) * 3); pxStar(stx, sty, SZ(20)); }
      for (var k = 0; k < G.coinsA.length; k++) { var co = G.coinsA[k]; if (co.got) continue; var cxs = FX(co.x); if (cxs > W + 8 || cxs < -8) continue; pxCoin(cxs, FY(GROUND - co.hAbove), G.t * 6 + co.x); }
      for (var g2 = G.nextGate; g2 < G.gates.length; g2++) { var ga = G.gates[g2]; if (ga.solved) continue; var gxs = FX(ga.x); if (gxs > W + 16 || gxs < -16) continue; pxGate(gxs, gY); }
      var castxs = FX(G.castleX); if (castxs < W + 30 && castxs > -30) pxCastle(castxs, gY);
      for (var e2 = 0; e2 < G.enemies.length; e2++) { var en = G.enemies[e2]; if (!en.alive) continue; var exs = FX(en.x); if (exs > W + 8 || exs < -8) continue; if (en.crab) pxCrab(exs, gY, en.dir, en.x); else if (en.gummy) pxGummy(exs, gY, en.dir, en.x); else pxEnemy(exs, gY, en.dir); }
      for (var fshr = 0; fshr < G.fish.length; fshr++) { var fz2 = G.fish[fshr]; var fph2 = Math.sin((G.t / fz2.period + fz2.phase) * Math.PI * 2); if (fph2 <= -0.15) continue; var fxs = FX(fz2.x); if (fxs < -20 || fxs > W + 20) continue; pxFish(fxs, FY(GROUND - Math.max(0, fph2) * fz2.amp), fph2, fph2 >= 0.9 ? 0 : (Math.cos((G.t / fz2.period + fz2.phase) * Math.PI * 2) > 0 ? 1 : -1)); }
      for (var tpi = 0; tpi < G.traps.length; tpi++) { var trp3 = G.traps[tpi]; if (trp3.done) continue; var txs = FX(trp3.x); if (txs > W + 24 || txs < -24) continue; pxTrap(trp3.type, txs, FY(groundY(trp3.x)), G.t + trp3.x * 0.01, trp3.sprung); }
      for (var spr2 = 0; spr2 < G.springs.length; spr2++) { var sprx = FX(G.springs[spr2].x); if (sprx < -20 || sprx > W + 20) continue; pxSpring(sprx, gY, G.springs[spr2].t || 0); }
      for (var icr = 0; icr < G.icicles.length; icr++) { var icd = G.icicles[icr]; if (icd.done) continue; var icx = FX(icd.x); if (icx < -20 || icx > W + 20) continue; pxIcicle(icx, FY(icd.y), icd.landed, icd.meteor, icd.falling); }
      for (var hkr = 0; hkr < G.hawks.length; hkr++) { var hkd = G.hawks[hkr]; var hkx = FX(hkd.x); if (hkx < -24 || hkx > W + 24) continue; pxHawk(hkx, FY(hkd.y), hkd.state === "dive", G.t); }
      if (G.jellies) for (var jlr = 0; jlr < G.jellies.length; jlr++) { var jld = G.jellies[jlr]; var jlx = FX(jld.x); if (jlx < -24 || jlx > W + 24) continue; pxJelly(jlx, FY(jld.y), G.t + jld.phase); }
      for (var vnr = 0; vnr < G.vines.length; vnr++) { var vnx = FX(G.vines[vnr].x); if (vnx < -20 || vnx > W + 20) continue; pxVine(vnx, gY, G.t + vnr); }
      for (var fbr2 = 0; fbr2 < G.firebars.length; fbr2++) { var fbo = G.firebars[fbr2]; var fbx = FX(fbo.x); if (fbx < -60 || fbx > W + 60) continue; if (fbo.candy) pxPeppermint(fbx, FY(fbo.cy), SZ(fbo.len), G.t * fbo.spd + fbo.phase); else pxFireBar(fbx, FY(fbo.cy), SZ(fbo.len), G.t * fbo.spd + fbo.phase, G.frostT > 0); }
      for (var gmi = 0; gmi < G.gemsA.length; gmi++) { var ge2 = G.gemsA[gmi]; if (ge2.got) continue; var gxs = FX(ge2.x); if (gxs > W + 10 || gxs < -10) continue; pxGem(gxs, FY(GROUND - ge2.hAbove), G.t * 5 + ge2.x); }
      if (!th.night && !PIER) for (var fw = 0; fw < G.flowers.length; fw++) { var fo = G.flowers[fw]; var foX = FX(fo.x); if (foX < -4 || foX > W + 4) continue; if (groundAt(fo.x)) pxFlower(foX, FY(groundY(fo.x)) + SZ(6), fo.k); }
      var h = G.hero, warping = G.state === "warping" && warpFX; var wsc = warping ? warpFX.scale : 1;
      if (G.state !== "trapped" && (warping || !(h.inv > 0 && Math.floor(G.t * 16) % 2)) && wsc > 0.04) {
        var B = Math.max(1.8, sx * 4); if (G.bigT > 0) B *= 1.5;
        var hbxp = FX(h.wx) - 7 * B, hby = FY(h.y) - 12 * B + SZ(2);
        if (h.power > 0) { disc(FX(h.wx), FY(h.y) - 6 * B, 9 * B, "rgba(255," + (120 + Math.floor(Math.sin(G.t * 20) * 80)) + ",240,.25)"); }
        if (G.flyT > 0) { var wf = Math.sin(G.t * 22) > 0 ? SZ(4) : 0; P(hbxp - SZ(7), hby + 3 * B - wf, SZ(9), SZ(5), "#eef2f8"); P(hbxp + 14 * B - SZ(2), hby + 3 * B - wf, SZ(9), SZ(5), "#eef2f8"); }
        if (warping && (wsc < 1 || warpFX.spin)) { var hcx = FX(h.wx), hcy = FY(h.y) - 6 * B; disc(hcx, hcy, 10 * B, "rgba(200,168,240,.3)"); x.save(); x.translate(hcx, hcy); x.rotate(warpFX.spin); x.scale(wsc, wsc); x.translate(-hcx, -hcy); drawHeroPix(x, hbxp, hby, B, HEROTYPE); x.restore(); }
        else drawHeroPix(x, hbxp, hby, B, HEROTYPE);
      }
      for (var q = 0; q < G.particles.length; q++) { var ptc = G.particles[q]; if (ptc.life <= 0) continue; var ppx = FX(ptc.wx), ppy = FY(ptc.y); if (ptc.kind === "coin") pxCoin(ppx, ppy, ptc.wx); else P(ppx, ppy, 2, 2, ptc.kind === "star" ? "#ffe14a" : "#ffffff"); }
      // fireworks (world-finish celebration)
      if (G.fireworks && G.fireworks.length) { for (var fwi = 0; fwi < G.fireworks.length; fwi++) { var fw = G.fireworks[fwi]; var fwx = FX(fw.x), fwy = FY(fw.y); if (fwx < -24 || fwx > W + 24) continue; if (fw.spark) { x.globalAlpha = Math.max(0, Math.min(1, fw.life)); disc(fwx, fwy, Math.max(1, SZ(2.6)), fw.col); x.globalAlpha = 1; } else if (fw.flash != null && fw.flash > 0) { x.globalAlpha = Math.min(1, fw.flash * 6); disc(fwx, fwy, SZ(10), "#ffffff"); x.globalAlpha = 1; } } }
      if (G.frostT > 0) { x.globalAlpha = 0.18 + (G.frostT < 1 ? 0 : 0.04 * Math.sin(G.t * 8)); P(-2, -2, W + 4, H + 4, "#8fd0ff"); x.globalAlpha = 1; for (var sf = 0; sf < 24; sf++) { var sfx = (sf * 83 + Math.round(G.t * 30)) % W, sfy = (sf * 57 + Math.round(G.t * 60)) % H; P(sfx, sfy, SZ(2), SZ(2), "#ffffff"); } }
      x.restore();
      // streak meter (bottom-centre) — fills with fast correct answers, full = Streak Star
      var mw = Math.round(W * 0.4), mx0 = Math.round(W / 2 - mw / 2), myy = Math.round(H * 0.9);
      P(mx0 - 1, myy - 1, mw + 2, 6, "#101828"); P(mx0, myy, Math.round(mw * Math.max(0, Math.min(1, G.meter))), 4, G.meter >= 1 ? "#ff4fa3" : "#ffd23f");
      pxStar(mx0 + mw + 9, myy + 2, 5);
      if (G.state === "trapped") drawCapture();
      x.globalAlpha = .04; for (var y2 = 0; y2 < H; y2 += 3) P(0, y2, W, 1, "#000"); x.globalAlpha = 1;
    }
    // dramatic "you're caught" tableau shown in the open area above the math sheet while you solve to escape
    function drawCapture() {
      var W = PIXW, H = PIXH, cx = Math.round(W * 0.5), cy = Math.round(H * 0.24);
      var tr = G.traps[G.trapIndex], type = tr ? tr.type : "bush", ph = G.t;
      x.globalAlpha = .42; P(0, 0, W, Math.round(H * 0.5), "#0a0a1a"); x.globalAlpha = 1;
      disc(cx, cy, SZ(74), "rgba(255,255,255,.05)");
      var B = Math.max(3, Math.round(W * 0.22 / 14));
      var hh = 12 * B, hx = cx - 7 * B, footBase = cy + 6 * B, hyTop = footBase - hh;
      var jit = Math.round(Math.sin(ph * 26) * 2);
      drawHeroPix(x, hx + jit, hyTop, B, HEROTYPE);
      if (type === "giant") {
        var press = Math.abs(Math.sin(ph * 3)), soleB = hyTop - SZ(3) - Math.round(press * SZ(16)), fw = SZ(82), fh = SZ(26);
        P(cx - SZ(19), 0, SZ(38), soleB - fh + SZ(4), "#d8b48a"); P(cx - SZ(19), 0, SZ(9), soleB - fh + SZ(4), "#eccfa8"); P(cx + SZ(10), 0, SZ(9), soleB - fh + SZ(4), "#c99a6e");
        P(cx - fw / 2, soleB - fh, fw, fh, "#e6bd92"); P(cx - fw / 2, soleB - SZ(6), fw, SZ(6), "#caa070");
        for (var t = 0; t < 5; t++) P(cx - fw / 2 + SZ(6) + t * SZ(15), soleB - SZ(3), SZ(11), SZ(7), "#f2d6b0");
        if (press > 0.7) for (var d = 0; d < 8; d++) P(cx - fw / 2 + d * SZ(11), hyTop - SZ(1), SZ(4), SZ(2), "#fff");
      } else if (type === "plant") {
        var op = SZ(6) + Math.round(Math.abs(Math.sin(ph * 4)) * SZ(12));
        P(cx - SZ(32), hyTop - SZ(6) - op, SZ(64), SZ(18), "#ff3b46"); for (var u = -28; u <= 28; u += 9) P(cx + SZ(u), hyTop - SZ(6) - op + SZ(16), SZ(4), SZ(9), "#fff");
        P(cx - SZ(32), footBase - SZ(4) + op, SZ(64), SZ(16), "#ff3b46"); for (var u2 = -28; u2 <= 28; u2 += 9) P(cx + SZ(u2), footBase - SZ(4) + op - SZ(9), SZ(4), SZ(9), "#fff");
      } else if (type === "mouse") {
        var slam = Math.abs(Math.sin(ph * 5)), barY = hyTop - SZ(8) + Math.round(slam * SZ(10));
        P(cx - SZ(40), footBase, SZ(80), SZ(9), "#a9743f"); P(cx - SZ(36), barY, SZ(72), SZ(7), "#d2dae6"); P(cx - SZ(36), barY, SZ(7), footBase - barY, "#d2dae6"); P(cx + SZ(30), barY, SZ(7), footBase - barY, "#d2dae6");
      } else if (type === "net") {
        for (var i = -36; i <= 36; i += 8) P(cx + SZ(i), hyTop - SZ(10), SZ(3), hh + SZ(22), "#e6ecff");
        for (var j = -10; j < hh + 22; j += 8) P(cx - SZ(36), hyTop - SZ(10) + SZ(j), SZ(72), SZ(3), "#e6ecff");
      } else if (type === "ice") {
        x.globalAlpha = .5; P(cx - SZ(30), hyTop - SZ(12), SZ(60), hh + SZ(26), "#bfe4ff"); x.globalAlpha = 1;
        P(cx - SZ(30), hyTop - SZ(12), SZ(60), SZ(4), "#eaf6ff"); P(cx - SZ(30), hyTop - SZ(12), SZ(6), hh + SZ(26), "#eaf6ff"); P(cx + SZ(20), hyTop - SZ(4), SZ(5), hh + SZ(10), "#eaf6ff");
      } else if (type === "hoop") {
        for (var a = 0; a < 18; a++) { var an = a / 18 * 6.283; P(cx + Math.round(Math.cos(an) * SZ(44)) - SZ(3), cy + Math.round(Math.sin(an) * SZ(44)) - SZ(3), SZ(9), SZ(9), (a + Math.floor(ph * 8)) % 2 ? "#ff5a1a" : "#ffd23f"); }
      } else if (type === "cage") {
        for (var v = -32; v <= 32; v += 10) P(cx + SZ(v), hyTop - SZ(14), SZ(4), hh + SZ(24), "#7a5aff"); P(cx - SZ(32), hyTop - SZ(14), SZ(64), SZ(5), "#7a5aff"); P(cx - SZ(32), footBase + SZ(8), SZ(64), SZ(5), "#7a5aff");
      } else if (type === "snowball") {
        for (var k = 0; k < 6; k++) { var tt = (ph * 1.6 + k * 0.28) % 1; var bx2 = cx + SZ(60) - Math.round(tt * SZ(84)); var by2 = cy - SZ(22) + Math.round(Math.sin(k * 1.7) * SZ(22)); disc(bx2, by2, SZ(7), "#fff"); }
        disc(cx - SZ(6), cy - SZ(4), SZ(7), "rgba(255,255,255,.92)"); disc(cx + SZ(7), cy + SZ(5), SZ(6), "rgba(255,255,255,.92)"); disc(cx + SZ(2), cy - SZ(10), SZ(5), "rgba(255,255,255,.92)");
      } else if (type === "iceblock") {
        var drop = (Math.sin(ph * 3) * 0.5 + 0.5), byy = hyTop - SZ(34) + Math.round(drop * SZ(30));
        x.globalAlpha = .62; P(cx - SZ(24), byy, SZ(48), SZ(32), "#bfe4ff"); x.globalAlpha = 1; P(cx - SZ(24), byy, SZ(48), SZ(4), "#eaf6ff"); P(cx - SZ(24), byy, SZ(6), SZ(32), "#eaf6ff");
        x.globalAlpha = .5; P(cx - SZ(42), hyTop + SZ(12), SZ(20), SZ(20), "#bfe4ff"); P(cx + SZ(24), hyTop + SZ(20), SZ(18), SZ(18), "#bfe4ff"); x.globalAlpha = 1;
      } else if (type === "star") {
        var mx = cx + SZ(4), my = hyTop - SZ(22);
        for (var tr2 = 0; tr2 < 6; tr2++) P(mx + SZ(22) + tr2 * SZ(7), my - SZ(22) - tr2 * SZ(7), SZ(6), SZ(6), tr2 % 2 ? "#ff8a2a" : "#ffd23f");
        disc(mx, my, SZ(26), "rgba(255,150,40,.3)"); pxStar(mx, my, SZ(22));
      } else if (type === "rps") {
        var gg = Math.floor(ph * 2) % 3, hy = hyTop - SZ(30);
        if (gg === 0) disc(cx, hy, SZ(19), "#f2d6b0"); else if (gg === 1) P(cx - SZ(22), hy - SZ(11), SZ(44), SZ(26), "#f2d6b0"); else { P(cx - SZ(5), hy - SZ(20), SZ(6), SZ(34), "#f2d6b0"); P(cx + SZ(6), hy - SZ(20), SZ(6), SZ(34), "#f2d6b0"); }
      } else if (type === "police") {
        var pf = Math.floor(ph * 4) % 2; x.globalAlpha = .35; P(0, 0, W, SZ(10), pf ? "#ff3b30" : "#3a6bff"); x.globalAlpha = 1;
        for (var v3 = -30; v3 <= 30; v3 += 10) P(cx + SZ(v3), hyTop - SZ(12), SZ(4), hh + SZ(22), "#c8d0e0");
        P(cx - SZ(17), hyTop - SZ(26), SZ(15), SZ(11), pf ? "#ff3b30" : "#3a6bff"); P(cx + SZ(2), hyTop - SZ(26), SZ(15), SZ(11), pf ? "#3a6bff" : "#ff3b30");
      } else if (type === "booger") {
        disc(cx, hyTop - SZ(30), SZ(20), "#f2c9a0"); P(cx - SZ(7), hyTop - SZ(24), SZ(6), SZ(8), "#a9743f"); P(cx + SZ(3), hyTop - SZ(24), SZ(6), SZ(8), "#a9743f");
        var wf = Math.sin(ph * 8) > 0 ? SZ(6) : 0; P(cx - SZ(36), hyTop - SZ(36) - wf, SZ(15), SZ(8), "#fff"); P(cx + SZ(22), hyTop - SZ(36) - wf, SZ(15), SZ(8), "#fff");
        for (var s3 = 0; s3 < 3; s3++) { var t3 = (ph * 1.2 + s3 * 0.33) % 1; disc(cx - SZ(7) + s3 * SZ(8), hyTop - SZ(8) + Math.round(t3 * SZ(34)), SZ(5), "#8fd14a"); }
        disc(cx, cy + SZ(2), SZ(8), "rgba(120,200,60,.8)");
      } else {
        for (var s = 0; s < 16; s++) { var sa = s / 16 * 6.283, rr = SZ(36) + Math.round(Math.sin(ph * 4) * SZ(3)); P(cx + Math.round(Math.cos(sa) * rr) - SZ(3), cy + Math.round(Math.sin(sa) * rr) - SZ(3), SZ(9), SZ(9), "#8be04a"); }
      }
    }
    function disc(cx, cy, r, c) { x.fillStyle = c; for (var yy = -r; yy <= r; yy++) { var ww = Math.floor(Math.sqrt(r * r - yy * yy)); x.fillRect(cx - ww, cy + yy, ww * 2 + 1, 1); } }
    /* ============== 32-BIT "HI-FI" WORLD RENDERING (Meadow proof) ============== */
    var HIFI = false;
    function OW() { return Math.max(1, Math.round(sx)); }
    function oE(cx, cy, rx, ry, f, o, ow) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); if (f) { x.fillStyle = f; x.fill(); } if (o) { x.strokeStyle = o; x.lineWidth = ow || OW(); x.lineJoin = "round"; x.stroke(); } }
    function oR(px, py, w, h, r, f, o, ow) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); if (f) { x.fillStyle = f; x.fill(); } if (o) { x.strokeStyle = o; x.lineWidth = ow || OW(); x.lineJoin = "round"; x.stroke(); } }
    function oP(cmds, f, o, ow) { x.beginPath(); cmds(); x.closePath(); if (f) { x.fillStyle = f; x.fill(); } if (o) { x.strokeStyle = o; x.lineWidth = ow || OW(); x.lineJoin = "round"; x.stroke(); } }
    function lg(y0, y1, a, b) { var q = x.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
    function hfCloud(cx, cy, col) { col = col || "#ffffff"; [[0, 0, 11], [9, 2, 8], [-9, 2, 7], [3, -5, 7]].forEach(function (o) { oE(cx + SZ(o[0]), cy + SZ(o[1]), SZ(o[2]), SZ(o[2] * .72), col, null); }); oE(cx, cy + SZ(4), SZ(13), SZ(3.4), "rgba(0,0,0,.10)", null); }
    function hfMountains(th, gY) { var mh = SZ(150); for (var i = -1; i < 6; i++) { var cx = Math.round(i * 90 - ((G.cam * .15) % 90)), half = Math.round(mh * 0.95); oP(function () { x.moveTo(cx - half, gY); x.lineTo(cx, gY - mh); x.lineTo(cx + half, gY); }, lg(gY - mh, gY, th.mtnS, th.mtn), null); var ch = Math.round(mh * 0.3), chalf = Math.round(half * 0.3); oP(function () { x.moveTo(cx - chalf, gY - mh + ch); x.lineTo(cx, gY - mh); x.lineTo(cx + chalf, gY - mh + ch); }, th.mtnS, null); } }
    function hfHills(off, baseY, c, hi) { function crest(px) { return baseY - Math.round(Math.sin((px + off * sx) * .03) * SZ(18) + Math.cos((px + off * sx) * .06) * SZ(8)); } x.beginPath(); x.moveTo(-4, PIXH); for (var px = -4; px <= PIXW + 4; px += 2) x.lineTo(px, crest(px)); x.lineTo(PIXW + 4, PIXH); x.closePath(); x.fillStyle = c; x.fill(); x.strokeStyle = hi; x.lineWidth = Math.max(1, Math.round(sx * 1.4)); x.beginPath(); for (var p2 = -4; p2 <= PIXW + 4; p2 += 2) { var y = crest(p2) - SZ(1); if (p2 < 0) x.moveTo(p2, y); else x.lineTo(p2, y); } x.stroke(); }
    function hfGround(sp, gx1, gx2, gY, th) {
      x.fillStyle = lg(gY, PIXH, th.dirt, th.dirtL); x.fillRect(gx1, gY + SZ(5), gx2 - gx1, PIXH - gY);
      x.fillStyle = lg(gY, gY + SZ(13), th.grass, th.h2); x.fillRect(gx1, gY, gx2 - gx1, SZ(12));
      x.fillStyle = th.dirtL; x.fillRect(gx1, gY + SZ(11), gx2 - gx1, SZ(2));
      if (th.tuft) { x.fillStyle = th.grass; for (var bx = Math.floor(sp[0] / 13) * 13; bx < sp[1]; bx += 13) { var blx = FX(bx); if (blx > gx1 - 2 && blx < gx2 + 2) { var bh = SZ(4 + (bx % 3)); oP((function (bl, h) { return function () { x.moveTo(bl - SZ(2.4), gY + SZ(1)); x.lineTo(bl + ((bx % 2) ? 1 : -1) * SZ(1.6), gY - h); x.lineTo(bl + SZ(2.4), gY + SZ(1)); }; })(blx, bh), th.grass, null); } } }
      x.fillStyle = "rgba(0,0,0,.22)"; for (var d = Math.floor(sp[0] / 38) * 38; d < sp[1]; d += 38) { var dl = FX(d); if (dl > gx1 && dl < gx2) { x.fillRect(dl, gY + SZ(22), SZ(3), SZ(3)); x.fillRect(dl + SZ(15), gY + SZ(36), SZ(2), SZ(2)); x.fillRect(dl - SZ(9), gY + SZ(30), SZ(2), SZ(2)); } }
    }
    function hfTree(cx, gY, s) {
      var trunkH = Math.round(s * 0.5), fr = Math.round(s * 0.34);
      oR(cx - SZ(3), gY - trunkH, SZ(6), trunkH + SZ(2), SZ(2), "#8a5a2e", "#4a2f16");
      oE(cx, gY - Math.round(s * 0.68), fr, fr * 0.98, "#3aa64a", "#236b2e");
      oE(cx - fr * 0.3, gY - Math.round(s * 0.8), fr * 0.5, fr * 0.44, "#5fce62", null);
      oE(cx + fr * 0.38, gY - Math.round(s * 0.58), fr * 0.4, fr * 0.36, "#2f8f42", null);
    }
    function hfWater(x0, w, y0, base) {
      var H = PIXH; x.fillStyle = base; x.fillRect(x0, y0, w, H - y0);
      x.fillStyle = lg(y0, H, "rgba(0,0,0,0)", "rgba(0,0,0,.4)"); x.fillRect(x0, y0, w, H - y0);
      x.fillStyle = "rgba(255,255,255,.3)"; var sh = (G.t * 22) % SZ(14);
      for (var wr = y0 + SZ(10); wr < H; wr += SZ(13)) for (var wc = x0 - SZ(14); wc < x0 + w; wc += SZ(16)) x.fillRect(wc + sh, wr + Math.round(Math.sin((wc + G.t * 40) * .05) * SZ(1.5)), SZ(6), Math.max(1, Math.round(sx)));
    }
    function hfProp(type, cx, gY, s, th) {
      if (type === "tree") return hfTree(cx, gY, s);
      var S = function (v) { return SZ(v * s / 20); };  // scale relative to prop size
      if (type === "palm") {
        oR(cx - S(2), gY - s * 0.82, S(4.5), s * 0.82, S(2), "#a9743f", "#5a3a1e");
        var ty = gY - s * 0.82; for (var f = 0; f < 5; f++) { var a = -2.4 + f * 0.62; oP((function (a) { return function () { x.moveTo(cx, ty); x.quadraticCurveTo(cx + Math.cos(a) * S(12), ty + Math.sin(a) * S(12), cx + Math.cos(a) * S(20), ty + Math.sin(a) * S(20) + S(4)); x.quadraticCurveTo(cx + Math.cos(a) * S(12), ty + Math.sin(a) * S(12) + S(4), cx, ty + S(2)); }; })(a), f % 2 ? "#3fae5a" : "#4dbe66", "#236b2e", Math.max(1, Math.round(sx * .8))); }
        oE(cx - S(2), ty - S(1), S(2), S(2), "#8a5a2a", null); oE(cx + S(3), ty, S(2), S(2), "#8a5a2a", null);
      } else if (type === "candy") {
        oR(cx - S(1.5), gY - s * 0.5, S(3), s * 0.5, S(1.5), "#f7f0ff", "#c9b8e0");
        oE(cx, gY - s * 0.6, S(9), S(9), "#ff6ea9", "#c93f7a");
        x.strokeStyle = "#fff"; x.lineWidth = Math.max(1.5, Math.round(sx)); x.beginPath(); x.arc(cx, gY - s * 0.6, S(5), 0.6, 4.2); x.stroke();
      } else if (type === "coral") {
        oR(cx - S(2), gY - s * 0.5, S(4), s * 0.5, S(2), "#ff7aa8", "#c94a7a");
        oR(cx - S(9), gY - s * 0.44, S(4), s * 0.28, S(2), "#ff7aa8", "#c94a7a");
        oR(cx + S(5), gY - s * 0.56, S(4), s * 0.42, S(2), "#ff9ec7", "#c94a7a");
        oE(cx - S(8), gY - s * 0.5, S(3), S(3), "#ffc2dd", null);
      } else if (type === "pine") {
        oR(cx - S(1.5), gY - s * 0.22, S(3.5), s * 0.22, S(1), "#6a4a2a", "#3a2a16");
        for (var t = 2; t >= 0; t--) { var wv = S(11 - t * 3), yy = gY - s * (0.18 + t * 0.22); oP((function (wv, yy) { return function () { x.moveTo(cx - wv, yy); x.lineTo(cx, yy - S(11)); x.lineTo(cx + wv, yy); }; })(wv, yy), "#2f8f52", "#1c6b3a"); x.fillStyle = "rgba(255,255,255,.85)"; oP((function (wv, yy) { return function () { x.moveTo(cx - wv * .5, yy - S(5)); x.lineTo(cx, yy - S(11)); x.lineTo(cx + wv * .5, yy - S(5)); }; })(wv, yy), "rgba(255,255,255,.8)", null); }
      } else if (type === "jungle") {
        oR(cx - S(2), gY - s * 0.3, S(4.5), s * 0.3, S(2), "#7a4a24", "#3a2410");
        oE(cx - S(6), gY - s * 0.4, S(10), S(9), "#2f8f42", "#1c6b30");
        oE(cx + S(6), gY - s * 0.36, S(9), S(8), "#3aa64a", "#1c6b30");
        oE(cx, gY - s * 0.5, S(8), S(7), "#4dbe57", "#1c6b30");
      } else if (type === "rock") {
        oP(function () { x.moveTo(cx - S(11), gY); x.lineTo(cx - S(7), gY - s * 0.34); x.lineTo(cx + S(2), gY - s * 0.4); x.lineTo(cx + S(10), gY - s * 0.2); x.lineTo(cx + S(11), gY); }, lg(gY - s * 0.4, gY, "#8a6656", "#5a4033"), "#3a281e");
        x.strokeStyle = "#ff6b3d"; x.lineWidth = Math.max(1.5, Math.round(sx)); x.beginPath(); x.moveTo(cx - S(3), gY - s * 0.3); x.lineTo(cx + S(1), gY - s * 0.14); x.lineTo(cx - S(2), gY); x.stroke();
      } else if (type === "crystal") {
        oP(function () { x.moveTo(cx - S(6), gY); x.lineTo(cx - S(4), gY - s * 0.34); x.lineTo(cx - S(2), gY); }, "#8f6bd6", "#4a2f8a");
        oP(function () { x.moveTo(cx - S(2), gY); x.lineTo(cx, gY - s * 0.55); x.lineTo(cx + S(4), gY); }, "#b28dff", "#4a2f8a");
        oP(function () { x.moveTo(cx + S(3), gY); x.lineTo(cx + S(7), gY - s * 0.4); x.lineTo(cx + S(9), gY); }, "#c9b0ff", "#4a2f8a");
        x.fillStyle = "rgba(255,255,255,.6)"; x.fillRect(cx - S(0.5), gY - s * 0.5, Math.max(1, S(1)), s * 0.3);
      } else hfTree(cx, gY, s);
    }
    function hfCoin(cx, cy, spin) {
      var w = Math.max(SZ(2), Math.round(Math.abs(Math.cos(spin)) * SZ(13))), r = SZ(14);
      oE(cx, cy, w, r, "#ffcf33", "#b57e10");
      if (w > SZ(5)) { oE(cx, cy, w * 0.62, r * 0.66, "#ffe98a", "#e0b020", Math.max(1, Math.round(sx * 0.8))); oE(cx - w * 0.3, cy - r * 0.4, w * 0.24, r * 0.3, "#fff6c8", null); }
    }
    function hfBox(px, py, w, h, used, power) {
      var body = used ? "#b39b7a" : (power ? "#37c0ff" : "#ffb020"), lo = used ? "#8f7a4f" : (power ? "#1f8fd0" : "#c97a00"), O = used ? "#6a5a3a" : (power ? "#125f8a" : "#7a4a00");
      oR(px, py, w, h, Math.max(2, SZ(2)), body, O); x.fillStyle = lo; x.fillRect(px + SZ(2), py + h - SZ(4), w - SZ(4), SZ(3)); x.fillStyle = "rgba(255,255,255,.4)"; x.fillRect(px + SZ(2), py + SZ(2), w - SZ(4), SZ(2));
      if (!used) { var mcx = px + w / 2, mcy = py + h / 2; if (power) { x.fillStyle = "#fff"; x.fillRect(mcx - SZ(2), mcy - SZ(6), SZ(4), SZ(12)); x.fillRect(mcx - SZ(6), mcy - SZ(2), SZ(12), SZ(4)); } else { x.fillStyle = O; x.font = "800 " + SZ(16) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("?", mcx, mcy + SZ(1)); x.textAlign = "left"; x.textBaseline = "alphabetic"; } }
    }
    function hfBrick(px, py, w, h) {
      oR(px, py, w, h, SZ(1.5), "#c65a2a", "#7a3212"); x.strokeStyle = "rgba(122,50,18,.65)"; x.lineWidth = Math.max(1, Math.round(sx * 0.8));
      var third = Math.round(h / 3); for (var ry = py + third; ry < py + h - SZ(2); ry += third) { x.beginPath(); x.moveTo(px + SZ(1), ry); x.lineTo(px + w - SZ(1), ry); x.stroke(); }
      x.beginPath(); x.moveTo(px + w / 2, py + SZ(1)); x.lineTo(px + w / 2, py + third); x.moveTo(px + w * 0.28, py + third); x.lineTo(px + w * 0.28, py + third * 2); x.moveTo(px + w * 0.72, py + third); x.lineTo(px + w * 0.72, py + third * 2); x.stroke();
      x.fillStyle = "rgba(255,255,255,.22)"; x.fillRect(px + SZ(2), py + SZ(2), w - SZ(4), SZ(2));
    }
    function hfEnemy(cx, gY, dir) {
      var bnc = Math.round(Math.abs(Math.sin(G.t * 4 + cx)) * SZ(4)), fy = gY - SZ(44) - bnc, w = SZ(22), O = "#3a2580";
      x.fillStyle = "rgba(0,0,0,.24)"; x.beginPath(); x.ellipse(cx, gY - SZ(1), SZ(18), SZ(5), 0, 0, 6.29); x.fill();   // ground shadow anchors it
      oE(cx - SZ(11), gY - SZ(3), SZ(8), SZ(4), "#4a2f9a", O); oE(cx + SZ(11), gY - SZ(3), SZ(8), SZ(4), "#4a2f9a", O);
      oR(cx - w, fy, w * 2, SZ(42), w, "#8b6cf0", O); oE(cx, fy + SZ(36), w * 0.82, SZ(7), "#6a4bd0", null);
      oE(cx - SZ(8), fy + SZ(16), SZ(6), SZ(7), "#fff", O, Math.max(1, Math.round(sx * 0.8))); oE(cx + SZ(8), fy + SZ(16), SZ(6), SZ(7), "#fff", O, Math.max(1, Math.round(sx * 0.8)));
      oE(cx - SZ(8) + dir * SZ(2), fy + SZ(17), SZ(2.4), SZ(3), "#241a4a", null); oE(cx + SZ(8) + dir * SZ(2), fy + SZ(17), SZ(2.4), SZ(3), "#241a4a", null);
      x.strokeStyle = O; x.lineWidth = Math.max(1, Math.round(sx * 0.8)); x.beginPath(); x.moveTo(cx - SZ(4), fy + SZ(30)); x.quadraticCurveTo(cx, fy + SZ(33), cx + SZ(4), fy + SZ(30)); x.stroke();
      x.strokeStyle = "#ff2e2e"; x.lineWidth = Math.max(2, Math.round(sx * 1.4)); x.lineCap = "round";   // angry red brows = the danger cue
      x.beginPath(); x.moveTo(cx - SZ(14), fy + SZ(9)); x.lineTo(cx - SZ(3), fy + SZ(13)); x.stroke();
      x.beginPath(); x.moveTo(cx + SZ(14), fy + SZ(9)); x.lineTo(cx + SZ(3), fy + SZ(13)); x.stroke();
    }
    function hfFlower(cx, cy, k) {
      var cols = [["#ff5ca8", "#ffe14a"], ["#ff9f1c", "#ffe14a"], ["#8f5bff", "#ffe14a"]][k];
      x.strokeStyle = "#2f8f42"; x.lineWidth = Math.max(1, Math.round(sx)); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - SZ(6)); x.stroke();
      for (var p = 0; p < 5; p++) { var a = p / 5 * 6.283; oE(cx + Math.cos(a) * SZ(3), cy - SZ(8) + Math.sin(a) * SZ(3), SZ(2.3), SZ(2.3), cols[0], null); }
      oE(cx, cy - SZ(8), SZ(2), SZ(2), cols[1], null);
    }
    function hfGate(gxs, gY) {
      var hh = SZ(140), pw = SZ(18); oR(gxs - SZ(46), gY - hh, pw, hh, SZ(2), "#9b8bbf", "#544482"); oR(gxs + SZ(28), gY - hh, pw, hh, SZ(2), "#9b8bbf", "#544482");
      oR(gxs - SZ(56), gY - hh - SZ(16), SZ(112), SZ(20), SZ(3), "#6a5b9a", "#463a70");
      var ly = gY - SZ(84); oR(gxs - SZ(11), ly, SZ(22), SZ(20), SZ(4), "#ffd23f", "#b57e10"); x.fillStyle = "#8a5a00"; oE(gxs, ly + SZ(11), SZ(3), SZ(4), "#8a5a00", null);
    }
    function pxCloud(cx, cy, c) { if (HIFI) { hfCloud(cx, cy, c); return; } P(cx, cy, 20, 5, c); P(cx + 4, cy - 4, 12, 5, c); P(cx - 3, cy + 2, 26, 4, c); }
    function pxMountains(th, gY) { if (HIFI) { hfMountains(th, gY); return; } for (var i = -1; i < 6; i++) { var cx = Math.round(i * 90 - ((G.cam * .15) % 90)); var mh = SZ(150); for (var yy = 0; yy < mh; yy += 2) { var half = Math.round((yy / mh) * mh * 0.95); P(cx - half, gY - mh + yy, half * 2, 2, th.mtn); } for (var yy2 = 0; yy2 < mh * 0.3; yy2 += 2) { var half2 = Math.round((yy2 / (mh * 0.3)) * mh * 0.28); P(cx - half2, gY - mh + yy2, half2 * 2, 2, th.mtnS); } } }
    function pxHills(off, baseY, c) { if (HIFI) { hfHills(off, baseY, c, "rgba(255,255,255,.22)"); return; } for (var px = 0; px < PIXW; px += 3) { var y = baseY - Math.round(Math.sin((px + off * sx) * .03) * SZ(18) + Math.cos((px + off * sx) * .06) * SZ(8)); P(px, y, 3, PIXH, c); } }
    function pxProp(type, cx, gY, s, th) {
      if (HIFI) { hfProp(type, cx, gY, s, th); return; }
      if (type === "tree") { P(cx - 1, gY - s * 0.6, 3, s * 0.6, "#7a4a24"); disc(cx, gY - Math.round(s * 0.7), Math.round(s * 0.34), "#3aa64a"); }
      else if (type === "palm") { P(cx, gY - s * 0.8, 3, s * 0.8, "#a9743f"); for (var f = 0; f < 5; f++) { var a = (-1.4) + f * 0.5; P(cx + Math.round(Math.cos(a) * s * 0.3), gY - Math.round(s * 0.8) + Math.round(Math.sin(a) * s * 0.14), Math.round(s * 0.3), 3, "#3fae5a"); } }
      else if (type === "pine") { P(cx - 1, gY - s * 0.2, 3, s * 0.2, "#6a4a2a"); for (var t = 0; t < 3; t++) { var wv = Math.round(s * (0.34 - t * 0.1)); P(cx - wv, gY - s * (0.2 + t * 0.2) - 2, wv * 2, Math.round(s * 0.2), "#2f8f52"); P(cx - Math.round(wv * 0.5), gY - s * (0.2 + t * 0.2) - 2, wv, 2, "#dff0e6"); } }
      else if (type === "candy") { P(cx - 1, gY - s * 0.5, 2, s * 0.5, "#fff"); disc(cx, gY - Math.round(s * 0.6), Math.round(s * 0.22), "#ff6ea9"); disc(cx, gY - Math.round(s * 0.6), Math.round(s * 0.1), "#fff"); }
      else if (type === "coral") { P(cx - 1, gY - s * 0.4, 3, s * 0.4, "#ff7aa8"); P(cx - s * 0.24, gY - s * 0.4, 3, s * 0.24, "#ff7aa8"); P(cx + s * 0.2, gY - s * 0.44, 3, s * 0.28, "#ff9ec7"); }
      else if (type === "jungle") { disc(cx - Math.round(s * 0.16), gY - Math.round(s * 0.34), Math.round(s * 0.24), "#2f8f42"); disc(cx + Math.round(s * 0.16), gY - Math.round(s * 0.3), Math.round(s * 0.2), "#3aa64a"); P(cx - 1, gY - s * 0.3, 3, s * 0.3, "#7a4a24"); }
      else if (type === "rock") { disc(cx, gY - Math.round(s * 0.18), Math.round(s * 0.28), "#7a5648"); P(cx - 2, gY - s * 0.28, 2, s * 0.14, "#ff6b3d"); }
      else if (type === "crystal") { P(cx - 2, gY - s * 0.5, 4, s * 0.5, "#b28dff"); P(cx - s * 0.2, gY - s * 0.34, 3, s * 0.34, "#8f6bd6"); P(cx + s * 0.16, gY - s * 0.42, 3, s * 0.42, "#c9b0ff"); }
    }
    function pxFlower(cx, cy, k) { if (HIFI) { hfFlower(cx, cy, k); return; } var cols = [["#ff5ca8", "#fff2a8"], ["#ff9f1c", "#fff2a8"], ["#8f5bff", "#fff2a8"]][k]; P(cx - 1, cy - 3, 2, 4, "#3aa64a"); P(cx - 2, cy - 6, 4, 4, cols[0]); P(cx - 1, cy - 5, 2, 2, cols[1]); }
    function pxCoin(cx, cy, spin) { if (HIFI) { hfCoin(cx, cy, spin); return; } var w = Math.max(1, Math.round(Math.abs(Math.cos(spin)) * SZ(15))); var r = SZ(15); P(cx - w, cy - r, w * 2, r * 2, C.coin); P(cx - w, cy - r, w * 2, SZ(3), C.coinHi); P(cx - w, cy + r - SZ(3), w * 2, SZ(3), C.coinLo); if (w > SZ(6)) P(cx - SZ(2), cy - SZ(4), SZ(4), SZ(8), C.coinLo); }
    function pxBox(px, py, w, h, used, power) { if (HIFI) { hfBox(px, py, w, h, used, power); return; } var main = used ? "#b39b7a" : (power ? "#37c0ff" : C.box), hi = used ? "#c9b48f" : (power ? "#a8ecff" : C.boxHi), lo = used ? "#8f7a4f" : (power ? "#1f8fd0" : C.boxLo); P(px, py, w, h, main); P(px, py, w, SZ(3), hi); P(px, py + h - SZ(3), w, SZ(3), lo); P(px, py, SZ(3), h, hi); P(px + w - SZ(3), py, SZ(3), h, lo); if (!used) { var cx = px + w / 2, cy = py + h / 2; if (power) { P(cx - SZ(2), cy - SZ(7), SZ(4), SZ(14), "#fff"); P(cx - SZ(7), cy - SZ(2), SZ(14), SZ(4), "#fff"); } else { P(cx - SZ(3), cy - SZ(6), SZ(6), SZ(3), "#fff"); P(cx + SZ(1), cy - SZ(3), SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy, SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy + SZ(4), SZ(3), SZ(2), "#fff"); } } }
    function pxFish(cx, cy, ph, dir) {
      // PIRANHA — grey-green body, red belly, toothy grin. dir = tail direction (mouth faces -dir, toward the hero).
      dir = dir || 1; var O = "#0e1a16", body = "#5f7d72", bodyD = "#4a6258", belly = "#c23a2a";
      if (ph < 0.42) { x.strokeStyle = "rgba(255,255,255,.95)"; x.lineWidth = Math.max(2, SZ(2)); for (var k = -2; k <= 2; k++) { var wxx = cx + SZ(k * 9); x.beginPath(); x.moveTo(wxx, FY(GROUND) + SZ(2)); x.lineTo(wxx + SZ(k * 1.5), FY(GROUND) - SZ(11)); x.stroke(); } }
      disc(cx, cy, SZ(18), O); P(cx + dir * SZ(10) - SZ(2), cy - SZ(14), SZ(20), SZ(28), O);   // dark outline
      disc(cx, cy, SZ(16), body);
      P(cx - SZ(11), cy + SZ(3), SZ(22), SZ(11), belly);                                        // red belly
      P(cx + dir * SZ(10), cy - SZ(12), SZ(16), SZ(24), body); P(cx + dir * SZ(20), cy - SZ(14), SZ(10), SZ(28), bodyD);   // tail
      P(cx + SZ(1), cy - SZ(17), SZ(9), SZ(7), bodyD);                                          // spiky dorsal fin
      P(cx + SZ(3), cy - SZ(22), SZ(3), SZ(6), bodyD);
      // angry eye + brow (mouth side)
      P(cx - dir * SZ(10), cy - SZ(10), SZ(9), SZ(3), O);                                        // brow
      P(cx - dir * SZ(9), cy - SZ(7), SZ(6), SZ(6), "#fff"); P(cx - dir * SZ(7), cy - SZ(5), SZ(3), SZ(4), "#111");
      // gaping toothy mouth facing the hero
      var mo = cx - dir * SZ(16);
      P(mo - (dir > 0 ? SZ(2) : 0), cy - SZ(1), SZ(11), SZ(9), O);                               // dark mouth
      x.fillStyle = "#ffffff";
      for (var t = 0; t < 4; t++) { var tx = mo + dir * (SZ(1) + t * SZ(3));
        x.beginPath(); x.moveTo(tx, cy - SZ(1)); x.lineTo(tx + dir * SZ(2.4), cy - SZ(1)); x.lineTo(tx + dir * SZ(1.2), cy + SZ(2)); x.closePath(); x.fill();       // upper fang
        x.beginPath(); x.moveTo(tx, cy + SZ(7)); x.lineTo(tx + dir * SZ(2.4), cy + SZ(7)); x.lineTo(tx + dir * SZ(1.2), cy + SZ(4)); x.closePath(); x.fill();       // lower fang
      }
    }
    function pxBrick(px, py, w, h, th) { if (HIFI) { hfBrick(px, py, w, h); return; } P(px, py, w, h, "#c65a2a"); P(px, py, w, SZ(3), "#e07a4a"); P(px, py + h - SZ(2), w, SZ(2), "#8a3a18"); for (var ry = py + SZ(4); ry < py + h; ry += SZ(9)) P(px, ry, w, 1, "#8a3a18"); for (var rx = px + SZ(6); rx < px + w; rx += SZ(12)) P(rx, py, 1, h, "#8a3a18"); }
    function pxPipe(px, gY, h, w) { P(px, gY - h, w, h, "#2f9e2a"); P(px, gY - h, SZ(6), h, "#7ce06a"); P(px + w - SZ(5), gY - h, SZ(5), h, "#1f7a1f"); P(px - SZ(5), gY - h - SZ(14), w + SZ(10), SZ(16), "#2f9e2a"); P(px - SZ(5), gY - h - SZ(14), w + SZ(10), SZ(5), "#57bf3a"); P(px - SZ(5), gY - h - SZ(14), SZ(7), SZ(16), "#7ce06a"); }
    function pxFlag(fxs, gY, raise, half) { var poleH = SZ(52); P(fxs, gY - poleH, SZ(2), poleH, C.pole); var fy = gY - poleH + Math.round((1 - raise) * (poleH - SZ(14))); var col = raise >= 1 ? (half ? "#ffca3a" : "#3ad44a") : "#7a7a9a"; P(fxs + SZ(2), fy, SZ(12), SZ(9), col); }
    // golden warp portal on a ledge — the entrance to World B (made loud so it's easy to spot)
    function pxWarp(cx, topY, t) {
      var w = SZ(56), h = SZ(54), lx = cx - w / 2, bob = Math.round(Math.sin(t * 3) * SZ(2));
      // beacon of light rising from the portal — visible from across the level
      x.globalAlpha = 0.14 + Math.sin(t * 4) * 0.05; P(cx - SZ(7), 0, SZ(14), topY, "#ffe27a"); x.globalAlpha = 1;
      // golden pipe body
      P(lx, topY, w, h, "#e0a020"); P(lx, topY, SZ(6), h, "#ffe27a"); P(lx + w - SZ(5), topY, SZ(5), h, "#b57a00");
      P(lx - SZ(6), topY - SZ(16), w + SZ(12), SZ(18), "#e0a020"); P(lx - SZ(6), topY - SZ(16), w + SZ(12), SZ(6), "#ffe27a"); P(lx - SZ(6), topY - SZ(16), SZ(8), SZ(18), "#ffe27a");
      // swirling portal mouth
      var mc = cx, my = topY - SZ(7);
      for (var r = SZ(13); r > 0; r -= SZ(3)) { var on = (Math.floor(t * 6 + r) % 2) === 0; disc(mc, my, r, on ? "#3a1a6a" : "#a06ff0"); }
      disc(mc, my, SZ(3), "#fff2a8");
      if (Math.floor(t * 5) % 2) { P(mc - SZ(18), topY - SZ(24), SZ(3), SZ(3), "#fff2a8"); P(mc + SZ(18), topY - SZ(14), SZ(3), SZ(3), "#fff2a8"); P(mc + SZ(10), topY - SZ(28), SZ(3), SZ(3), "#fff2a8"); }
      // "SECRET" banner floating above
      var bw = SZ(56), bh = SZ(17), bxx = cx - bw / 2, byy = topY - SZ(52) + bob;
      P(bxx, byy, bw, bh, "#7a2fb0"); P(bxx, byy, bw, SZ(3), "#a86fe0"); P(cx - SZ(2), byy + bh, SZ(4), SZ(4), "#7a2fb0");
      x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ffe27a"; x.font = "800 " + SZ(11) + "px monospace"; x.fillText("SECRET", cx, byy + bh / 2 + 1); x.textBaseline = "alphabetic"; x.textAlign = "left";
    }
    // treasure chest at the end of the secret cove
    function pxChest(cx, gY, t) {
      var w = SZ(52), hh = SZ(34), lx = cx - w / 2, by = gY - hh;
      P(lx, by, w, hh, "#8a5a2a"); P(lx, by, w, SZ(6), "#a9713f"); P(lx, gY - SZ(8), w, SZ(8), "#6b4520");
      P(lx, by, SZ(5), hh, "#6b4520"); P(lx + w - SZ(5), by, SZ(5), hh, "#6b4520");
      // gold bands + lid
      P(lx, by + SZ(12), w, SZ(5), "#ffd23f"); P(lx + w / 2 - SZ(4), by + SZ(10), SZ(8), SZ(12), "#ffd23f"); P(lx + w / 2 - SZ(2), by + SZ(14), SZ(4), SZ(4), "#8a5a00");
      // shine
      if (Math.floor(t * 4) % 2) { P(lx + SZ(6), by - SZ(6), SZ(3), SZ(3), "#fff2a8"); P(lx + w - SZ(9), by - SZ(3), SZ(3), SZ(3), "#fff2a8"); }
    }
    // Candy springboard — a striped bouncy pad (squashes when it fires)
    function pxSpring(cx, gY, t) {
      var w = SZ(48), lx = cx - w / 2, squash = t > 0 ? SZ(Math.round(t * 24)) : 0, topH = SZ(10) - Math.round(squash * 0.4);
      P(lx + SZ(6), gY - SZ(6) + squash, w - SZ(12), SZ(6), "#c85890");   // base
      // coiled spring
      for (var cyy = gY - SZ(6) + squash - SZ(6); cyy > gY - SZ(6) + squash - topH * 2; cyy -= SZ(5)) P(lx + SZ(10), cyy, w - SZ(20), SZ(3), "#e070a8");
      // pad
      var padY = gY - SZ(6) + squash - topH * 2 - SZ(6);
      P(lx, padY, w, SZ(8), "#ff8ec8"); P(lx, padY, w, SZ(3), "#ffd0e8");
      for (var st2 = lx + SZ(4); st2 < lx + w - SZ(4); st2 += SZ(10)) P(st2, padY + SZ(3), SZ(5), SZ(4), "#ff5ca8");
      P(cx - SZ(4), padY - SZ(3), SZ(8), SZ(3), "#fff");   // little up-arrow hint
      P(cx - SZ(1), padY - SZ(6), SZ(2), SZ(6), "#fff");
    }
    // Snow icicle — an ice spike (hanging while falling, embedded when landed). Space = fiery meteor.
    function spikeRaw(cx, cyTop, h, w, landed, col) { for (var r = 0; r < h; r += 2) { var frac = landed ? (r / h) : (1 - r / h); var ww = Math.max(1, Math.round(w * frac)); P(cx - ww / 2, cyTop + r, ww, 2, col); } }
    // red ground telegraph so a falling hazard is seen a beat before it lands
    function dropTarget(cx, meteor) {
      var gy = FY(GROUND), pulse = 0.55 + 0.45 * Math.abs(Math.sin(G.t * 7));
      x.save(); x.globalAlpha = pulse; x.strokeStyle = "#ff3b30"; x.lineWidth = Math.max(2, SZ(2.4)); x.lineCap = "round";
      if (meteor) { x.beginPath(); x.arc(cx, gy - SZ(4), SZ(15), 0, 6.29); x.stroke(); P(cx - SZ(1), gy - SZ(13), SZ(2), SZ(18), "#ff3b30"); P(cx - SZ(9), gy - SZ(5), SZ(18), SZ(2), "#ff3b30"); }
      else { x.setLineDash([SZ(6), SZ(5)]); x.beginPath(); x.ellipse(cx, gy - SZ(3), SZ(22), SZ(7), 0, 0, 6.29); x.stroke(); x.setLineDash([]); }
      x.restore();
    }
    function pxJelly(cx, cy, t) {
      x.globalAlpha = 0.82;
      var bell = "#c88bff", bellD = "#a05bef", glow = "#e8d0ff";
      // bell (dome)
      disc(cx, cy + SZ(2), SZ(15), bellD);
      x.fillStyle = bell; x.beginPath(); x.arc(cx, cy + SZ(4), SZ(14), Math.PI, 0); x.fill();
      x.fillStyle = bell; x.fillRect(cx - SZ(14), cy + SZ(4), SZ(28), SZ(6));
      x.fillStyle = glow; x.beginPath(); x.arc(cx - SZ(4), cy - SZ(1), SZ(5), Math.PI, 0); x.fill();
      // frilly rim
      for (var r = -2; r <= 2; r++) { var rx = cx + SZ(r * 6); disc(rx, cy + SZ(10), SZ(3), bellD); }
      // tentacles (wavy)
      x.strokeStyle = bell; x.lineWidth = Math.max(1, SZ(2)); x.globalAlpha = 0.7;
      for (var tt = -2; tt <= 2; tt++) { var txx = cx + SZ(tt * 5); x.beginPath(); x.moveTo(txx, cy + SZ(11)); for (var seg2 = 1; seg2 <= 4; seg2++) { x.lineTo(txx + Math.sin(t * 3 + seg2 + tt) * SZ(2), cy + SZ(11 + seg2 * 6)); } x.stroke(); }
      x.globalAlpha = 1;
    }
    function pxHawk(cx, cy, diving, t) {
      var body = "#6e4322", bodyD = "#4a2c12", wing = "#8a5a2e", wingD = "#4a2a12", belly = "#e0c090";
      P(cx + SZ(5), cy + SZ(1), SZ(8), SZ(3), bodyD);                                  // tail
      disc(cx, cy + SZ(3), SZ(6), body);                                               // body
      disc(cx - SZ(2), cy + SZ(5), SZ(4), belly);                                      // belly
      disc(cx - SZ(6), cy, SZ(4), body);                                               // head (facing the hero, left)
      P(cx - SZ(7), cy - SZ(1), SZ(2), SZ(2), "#fff"); P(cx - SZ(7), cy - SZ(1), SZ(1), SZ(1), "#201008");  // eye
      P(cx - SZ(11), cy + SZ(1), SZ(4), SZ(2), "#ffcb3f");                              // beak
      if (diving) {                                                                    // wings swept back (dive)
        P(cx + SZ(1), cy - SZ(1), SZ(10), SZ(3), wing); P(cx + SZ(4), cy - SZ(5), SZ(8), SZ(3), wingD);
      } else {                                                                         // wings spread + flap
        var wy = (Math.sin(t * 13) > 0) ? -SZ(7) : -SZ(1);
        P(cx - SZ(2), cy + wy, SZ(13), SZ(3), wing); P(cx, cy + wy - SZ(2), SZ(10), SZ(3), wingD);
      }
    }
    function pxIcicle(cx, cyTop, landed, meteor, falling) {
      if (falling && !landed) dropTarget(cx, meteor);
      if (meteor) {
        var mr = SZ(13);
        if (!landed) { for (var tr4 = 1; tr4 < 6; tr4++) { x.globalAlpha = 0.5 - tr4 * 0.08; disc(cx, cyTop + mr - tr4 * SZ(8), Math.round(mr * (1 - tr4 * 0.13)), tr4 % 2 ? "#ff8a2a" : "#ffd23f"); } x.globalAlpha = 1; }
        disc(cx, cyTop + mr, mr + SZ(2), "#3a1a04");                 // dark outline
        disc(cx, cyTop + mr, mr, "#ff8a2a");                          // molten body
        disc(cx - SZ(3), cyTop + mr - SZ(3), Math.round(mr * 0.55), "#ffe14a");
        P(cx - SZ(2), cyTop + mr - SZ(2), SZ(4), SZ(4), "#fff7d0");
        if (landed) P(cx - mr, cyTop + mr * 1.6, mr * 2, SZ(3), "#ff6a2a");
        return;
      }
      var h = SZ(40), w = SZ(16), o = SZ(2);
      var offs = [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]];
      for (var i = 0; i < offs.length; i++) spikeRaw(cx + offs[i][0], cyTop + offs[i][1], h, w, landed, "#243a66");   // dark outline
      spikeRaw(cx, cyTop, h, w, landed, "#e6f4ff");                 // bright body
      P(cx - SZ(2), cyTop + (landed ? 0 : 2), SZ(3), h - SZ(4), "#ffffff");
      P(cx - w / 2, cyTop, w, SZ(3), landed ? "#bfe0f5" : "#dff2ff");
    }
    // Jungle vine — a hanging, swaying rope of leaves you swing from
    function pxVine(cx, gY, t) {
      var top = FY(GROUND - 260), sway = Math.round(Math.sin(t * 1.6) * SZ(6));
      for (var vy = top; vy < gY - SZ(70); vy += SZ(6)) { var sx2 = cx + Math.round(Math.sin(t * 1.6 + vy * 0.02) * SZ(6)); P(sx2, vy, SZ(3), SZ(5), "#3a7a2a"); if ((vy / SZ(6)) % 2 === 0) P(sx2 + SZ(3), vy, SZ(4), SZ(3), "#57bf3a"); else P(sx2 - SZ(4), vy, SZ(4), SZ(3), "#57bf3a"); }
      P(cx + sway - SZ(4), gY - SZ(74), SZ(10), SZ(8), "#2f8f42");
    }
    // Volcano fire-bar — a rotating arm of flame around a pivot
    function pxPeppermint(cx, cyP, len, ang) {
      var ex = cx + Math.round(Math.cos(ang) * len), ey = cyP + Math.round(Math.sin(ang) * len);
      x.strokeStyle = "#ffffff"; x.lineWidth = Math.max(2, SZ(3)); x.beginPath(); x.moveTo(cx, cyP); x.lineTo(ex, ey); x.stroke();
      x.strokeStyle = "#ff5a6e"; x.setLineDash([SZ(4), SZ(4)]); x.lineWidth = Math.max(2, SZ(3)); x.beginPath(); x.moveTo(cx, cyP); x.lineTo(ex, ey); x.stroke(); x.setLineDash([]);
      disc(cx, cyP, SZ(5), "#ff7ac0");
      var r = SZ(15); disc(ex, ey, r + SZ(3), "#5a1636");
      for (var q = 0; q < 8; q++) { x.fillStyle = q % 2 ? "#ff5a6e" : "#ffffff"; x.beginPath(); x.moveTo(ex, ey); x.arc(ex, ey, r, ang + q / 8 * 6.2831853, ang + (q + 1) / 8 * 6.2831853); x.closePath(); x.fill(); }
      disc(ex, ey, SZ(4), "#ff7ac0"); disc(ex, ey, SZ(2), "#fff");
    }
    function pxFireBar(cx, cyP, len, ang, frozen) {
      P(cx - SZ(4), cyP - SZ(4), SZ(8), SZ(8), frozen ? "#3a5a7a" : "#3a1c10");   // darkened pivot
      for (var s2 = 0.2; s2 <= 1.001; s2 += 0.12) {
        var fx2 = cx + Math.round(Math.cos(ang) * len * s2), fy2 = cyP + Math.round(Math.sin(ang) * len * s2), r = SZ(s2 > 0.8 ? 6 : 5);
        disc(fx2, fy2, r + SZ(2), frozen ? "#1f4a6a" : "#5a1400");                 // dark halo → reads on the orange sky
        if (frozen) { disc(fx2, fy2, r, s2 > 0.7 ? "#bfe4ff" : "#8fd0ff"); }
        else { disc(fx2, fy2, r, Math.floor(ang * 3 + s2 * 6) % 2 ? "#ff5a1a" : "#ff9a1a"); disc(fx2 - SZ(1), fy2 - SZ(1), Math.max(1, Math.round(r * 0.5)), "#fff2c0"); }   // white-hot core
      }
    }
    function pxStar(cx, cy, r) { P(cx - 1, cy - r, 2, r * 2, C.star); P(cx - r, cy - 1, r * 2, 2, C.star); P(cx - Math.round(r * .6), cy - Math.round(r * .6), Math.round(r * 1.2), Math.round(r * 1.2), C.star); P(cx - 2, cy - 2, 4, 4, "#fff2a8"); }
    function pxGate(gxs, gY) { if (HIFI) { hfGate(gxs, gY); return; } var hh = SZ(150); P(gxs - SZ(46), gY - hh, SZ(20), hh, C.stone); P(gxs + SZ(26), gY - hh, SZ(20), hh, C.stone); P(gxs - SZ(56), gY - hh - SZ(16), SZ(112), SZ(18), C.stoneD); var ly = gY - SZ(90); P(gxs - SZ(10), ly, SZ(20), SZ(18), C.lock); P(gxs - SZ(6), ly - SZ(8), SZ(12), SZ(8), C.stoneD); P(gxs - SZ(3), ly + SZ(6), SZ(6), SZ(6), "#8a5a00"); }
    function pxSkipPlat(px, ptp, pw, used, t) {
      // a glowing sky-platform (clearly not a plain brown ledge) with a bobbing "SKIP!" sign + up-arrow
      P(px, ptp, pw, SZ(18), used ? "#8a8f9c" : "#3fb7ff");
      P(px, ptp, pw, SZ(5), used ? "#b6bcc8" : "#bff0ff");
      P(px, ptp + SZ(14), pw, SZ(4), used ? "#5c6270" : "#1f7fbf");
      if (used) return;
      for (var i = 0; i < 3; i++) { var spx = px + pw * (0.22 + i * 0.28); P(spx, ptp - SZ(3) + Math.round(Math.sin(t * 4 + i) * SZ(1)), SZ(2), SZ(2), "#fff"); }
      var bob = Math.round(Math.sin(t * 5) * SZ(3)), sgx = px + pw / 2, sgy = ptp - SZ(44) + bob;
      P(sgx - SZ(2), sgy + SZ(26), SZ(4), SZ(12), "#ffd23f"); P(sgx - SZ(8), sgy + SZ(30), SZ(4), SZ(5), "#ffd23f"); P(sgx + SZ(4), sgy + SZ(30), SZ(4), SZ(5), "#ffd23f");
      var bw = SZ(70), bh = SZ(22);
      P(sgx - bw / 2 - SZ(2), sgy - SZ(2), bw + SZ(4), bh + SZ(4), "#1b2144");
      P(sgx - bw / 2, sgy, bw, bh, "#ff4fa3"); P(sgx - bw / 2, sgy, bw, SZ(4), "#ff8ac8");
      x.textAlign = "center"; x.fillStyle = "#fff"; x.font = "800 " + SZ(13) + "px monospace"; x.fillText("SKIP!", sgx, sgy + SZ(16)); x.textAlign = "left";
    }
    function pxCastle(cx, gY) { var hh = SZ(150);[-70, -24, 24, 70].forEach(function (o) { P(cx + SZ(o) - SZ(18), gY - hh, SZ(36), hh, C.castle); }); P(cx - SZ(58), gY - SZ(100), SZ(116), SZ(100), C.castleD);[-90, -66, -42, -2, 22, 46, 70, 92].forEach(function (o) { P(cx + SZ(o) - SZ(7), gY - hh - SZ(14), SZ(14), SZ(14), C.castle); }); P(cx - SZ(16), gY - SZ(40), SZ(32), SZ(40), C.door); P(cx - SZ(70), gY - hh - SZ(30), SZ(2), SZ(18), C.pole); P(cx - SZ(68), gY - hh - SZ(30), SZ(14), SZ(8), C.flag); }
    function pxGummy(cx, gY, dir, wx) {
      var wob = Math.sin(G.t * 6 + (wx || cx) * 0.1), sq = Math.round(wob * SZ(2)), fy = gY - SZ(42) + Math.abs(sq);
      var body = "#4fd6a6", bodyD = "#2ea884", eye = "#0a3a2a";
      var w = SZ(18) + sq;                                                    // squash-and-stretch wobble
      P(cx - SZ(9), fy - SZ(8), SZ(6), SZ(8), bodyD); P(cx + SZ(3), fy - SZ(8), SZ(6), SZ(8), bodyD);   // ears
      disc(cx, fy + SZ(4), w * 0.55, bodyD);
      P(cx - w / 2, fy - SZ(2), w, SZ(30) - sq, body);                        // rounded body
      P(cx - w / 2 + SZ(2), fy - SZ(4), w - SZ(4), SZ(6), body);
      disc(cx - w / 2, fy + SZ(14), SZ(5), body); disc(cx + w / 2, fy + SZ(14), SZ(5), body);           // arms
      P(cx - SZ(12), fy + SZ(26), SZ(7), SZ(6), bodyD); P(cx + SZ(5), fy + SZ(26), SZ(7), SZ(6), bodyD); // feet
      P(cx - SZ(6) + dir * SZ(1), fy + SZ(2), SZ(3), SZ(3), eye); P(cx + SZ(3) + dir * SZ(1), fy + SZ(2), SZ(3), SZ(3), eye);
      P(cx - SZ(2), fy + SZ(8), SZ(4), SZ(2), eye);                           // smile
      x.globalAlpha = 0.35; P(cx - SZ(5), fy - SZ(2), SZ(4), SZ(10), "#fff"); x.globalAlpha = 1;        // jelly shine
    }
    function pxCrab(cx, gY, dir, wx) {
      var bnc = Math.round(Math.abs(Math.sin(G.t * 7 + (wx || cx) * 0.12)) * SZ(2)), fy = gY - SZ(34) - bnc;
      var red = "#e8452a", redD = "#b0301a", eye = "#fff", pup = "#201008";
      x.strokeStyle = redD; x.lineWidth = Math.max(1, SZ(2));
      for (var L = -1; L <= 1; L += 2) { for (var j = 0; j < 3; j++) { var lx = cx + L * SZ(15 + j * 4); x.beginPath(); x.moveTo(cx + L * SZ(11), fy + SZ(20)); x.lineTo(lx, gY); x.stroke(); } }   // legs
      disc(cx, fy + SZ(16), SZ(17), redD); P(cx - SZ(18), fy + SZ(10), SZ(36), SZ(14), red); disc(cx, fy + SZ(16), SZ(14), red);   // wide body
      P(cx - SZ(28), fy + SZ(8), SZ(11), SZ(9), red); P(cx - SZ(31), fy + SZ(5), SZ(7), SZ(5), redD);   // left claw
      P(cx + SZ(17), fy + SZ(8), SZ(11), SZ(9), red); P(cx + SZ(24), fy + SZ(5), SZ(7), SZ(5), redD);   // right claw
      P(cx - SZ(6), fy - SZ(4), SZ(2), SZ(9), redD); P(cx + SZ(4), fy - SZ(4), SZ(2), SZ(9), redD);      // eye stalks
      P(cx - SZ(8), fy - SZ(10), SZ(6), SZ(6), eye); P(cx + SZ(2), fy - SZ(10), SZ(6), SZ(6), eye);
      P(cx - SZ(7) + dir * SZ(1), fy - SZ(8), SZ(3), SZ(3), pup); P(cx + SZ(3) + dir * SZ(1), fy - SZ(8), SZ(3), SZ(3), pup);
    }
    function pxEnemy(cx, gY, dir) { if (HIFI) { hfEnemy(cx, gY, dir); return; } var bnc = Math.round(Math.abs(Math.sin(G.t * 4 + cx)) * SZ(4)), fy = gY - SZ(46) - bnc, w = SZ(24); P(cx - w, fy + SZ(6), w * 2, SZ(40), C.enemy); P(cx - w + SZ(3), fy, w * 2 - SZ(6), SZ(8), C.enemy); P(cx - w, fy + SZ(40), SZ(8), SZ(6), C.enemyD); P(cx + w - SZ(8), fy + SZ(40), SZ(8), SZ(6), C.enemyD); P(cx - SZ(12), fy + SZ(14), SZ(8), SZ(8), C.enemyEye); P(cx + SZ(4), fy + SZ(14), SZ(8), SZ(8), C.enemyEye); P(cx - SZ(11) + dir * SZ(2), fy + SZ(16), SZ(4), SZ(4), C.enemyPup); P(cx + SZ(5) + dir * SZ(2), fy + SZ(16), SZ(4), SZ(4), C.enemyPup); }

    function pxGem(cx, cy, spin) {
      var w = Math.max(1, Math.round(Math.abs(Math.cos(spin)) * SZ(13))), r = SZ(16);
      P(cx - w, cy - r, w * 2, r * 2, "#b06bff"); P(cx - w, cy - r, w * 2, SZ(3), "#e6c8ff"); P(cx - w, cy + r - SZ(3), w * 2, SZ(3), "#7a2fd0");
      if (w > SZ(5)) P(cx - SZ(2), cy - SZ(5), SZ(3), SZ(10), "#f2e0ff");
      if (Math.floor(spin * 3) % 2) { P(cx + SZ(7), cy - SZ(9), 2, 2, "#ffffff"); P(cx - SZ(9), cy + SZ(5), 2, 2, "#ffffff"); }
    }
    // ---- shared "danger costume" so every trap reads as AVOID (not a prize or a platform) ----
    function trapGlow(cx, gY) {
      var cy = gY - SZ(24), r = SZ(40), pulse = 0.22 + 0.16 * Math.abs(Math.sin(G.t * 4));
      var g = x.createRadialGradient(cx, cy, SZ(3), cx, cy, r);
      g.addColorStop(0, "rgba(255,58,48," + pulse.toFixed(3) + ")"); g.addColorStop(1, "rgba(255,58,48,0)");
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    function trapBase(cx, gY) {
      var bw = SZ(56), bx = cx - bw / 2, by = gY + SZ(1), step = SZ(8), lw = Math.max(1, Math.round(sx));
      for (var i = 0; i < bw; i += step) { P(bx + i, by, SZ(5), SZ(6), "#ff3b30"); P(bx + i + SZ(4), by, SZ(4), SZ(6), "#141018"); }   // red-&-black caution tape
      var tw = SZ(9);
      for (var t = bx; t < bx + bw - SZ(4); t += tw) { x.fillStyle = "#ff3b30"; x.beginPath(); x.moveTo(t, by); x.lineTo(t + tw / 2, by - SZ(8)); x.lineTo(t + tw, by); x.closePath(); x.fill(); x.strokeStyle = "#7a0f0a"; x.lineWidth = lw; x.stroke(); }   // spike teeth
    }
    function trapBeacon(cx, gY, ph) {
      var wy = gY - SZ(80), s = SZ(11), on = Math.floor(ph * 3) % 2, o = SZ(2);
      x.fillStyle = "#101018"; x.beginPath(); x.moveTo(cx, wy - o); x.lineTo(cx + s + o, wy + s * 1.7 + o); x.lineTo(cx - s - o, wy + s * 1.7 + o); x.closePath(); x.fill();
      x.fillStyle = on ? "#ffd21f" : "#ff8a1a"; x.beginPath(); x.moveTo(cx, wy); x.lineTo(cx + s, wy + s * 1.7); x.lineTo(cx - s, wy + s * 1.7); x.closePath(); x.fill();
      var mw = Math.max(2, SZ(3));
      P(cx - mw / 2, wy + Math.round(s * 0.5), mw, Math.round(s * 0.7), "#101018");
      P(cx - mw / 2, wy + Math.round(s * 1.35), mw, mw, "#101018");
    }
    function pxTrap(type, cx, gY, ph, sprung) {
      var baseX = cx;
      trapGlow(baseX, gY);                       // red danger aura behind the trap
      var wob = Math.round(Math.sin(ph * 4) * SZ(2)); cx += wob;
      if (type === "bush") {
        disc(cx, gY - SZ(28), SZ(26), "#1f6e2a"); disc(cx, gY - SZ(28), SZ(17), "#3aa64a");
        for (var s = 0; s < 12; s++) { var sa = s / 12 * 6.283; P(cx + Math.round(Math.cos(sa) * SZ(28)) - SZ(3), gY - SZ(28) + Math.round(Math.sin(sa) * SZ(28)) - SZ(3), SZ(7), SZ(7), "#8be04a"); }
        P(cx - SZ(9), gY - SZ(33), SZ(6), SZ(7), "#fff"); P(cx + SZ(3), gY - SZ(33), SZ(6), SZ(7), "#fff"); P(cx - SZ(7), gY - SZ(31), SZ(3), SZ(3), "#111"); P(cx + SZ(5), gY - SZ(31), SZ(3), SZ(3), "#111");
      }
      else if (type === "plant") {
        P(cx - SZ(4), gY - SZ(34), SZ(8), SZ(34), "#2f8f52"); var op = (Math.sin(ph * 6) > 0 ? SZ(12) : SZ(3));
        disc(cx, gY - SZ(48), SZ(20), "#ff3b46"); P(cx - SZ(20), gY - SZ(54) - op, SZ(40), SZ(9), "#ff6a78");
        for (var t = -15; t <= 15; t += 6) { P(cx + SZ(t), gY - SZ(56) - op, SZ(3), SZ(7), "#fff"); P(cx + SZ(t), gY - SZ(48) + op, SZ(3), SZ(7), "#fff"); }
        P(cx - SZ(8), gY - SZ(50), SZ(5), SZ(6), "#fff"); P(cx - SZ(6), gY - SZ(48), SZ(2), SZ(2), "#111");
      }
      else if (type === "mouse") {
        P(cx - SZ(24), gY - SZ(10), SZ(48), SZ(10), "#8a5a2a"); P(cx - SZ(24), gY - SZ(10), SZ(48), SZ(3), "#a9743f");
        var bar = (Math.sin(ph * 7) > 0 ? SZ(38) : SZ(9)); P(cx - SZ(22), gY - SZ(10) - bar, SZ(4), bar, "#5a6478"); P(cx - SZ(22), gY - SZ(10) - bar, SZ(40), SZ(4), "#7a86a0"); P(cx + SZ(18), gY - SZ(10) - bar, SZ(4), bar, "#5a6478");
        disc(cx + SZ(6), gY - SZ(5), SZ(6), "#ffd23f"); P(cx + SZ(4), gY - SZ(7), SZ(2), SZ(2), "#c98f00");
      }
      else if (type === "net") { for (var i = -22; i <= 22; i += 6) { P(cx + SZ(i) - SZ(1), gY - SZ(50), SZ(5), SZ(50), "#243a5e"); P(cx + SZ(i), gY - SZ(50), SZ(2), SZ(50), "#8aa6d2"); } for (var j = 0; j < 52; j += 6) { P(cx - SZ(23), gY - SZ(j) - SZ(1), SZ(47), SZ(5), "#243a5e"); P(cx - SZ(22), gY - SZ(j), SZ(44), SZ(2), "#8aa6d2"); } disc(cx, gY - SZ(24), SZ(7), "#ffd23f"); disc(cx, gY - SZ(24), SZ(4), "#ffe884"); }
      else if (type === "ice") { var iw = SZ(44), ih = SZ(54), ix = cx - iw / 2, iy = gY - ih; P(ix, iy, iw, ih, "#4fbdec"); P(ix, iy, iw, SZ(6), "#bfeeff"); P(ix, iy, SZ(9), ih, "#8fdcff"); P(ix + iw - SZ(8), iy, SZ(8), ih, "#2f93c8"); P(ix, iy + ih - SZ(5), iw, SZ(5), "#2f93c8"); P(ix + SZ(28), iy + SZ(8), SZ(4), SZ(20), "rgba(255,255,255,.55)"); P(ix + SZ(14), iy + SZ(30), SZ(4), SZ(4), "#eafaff"); }
      else if (type === "vine") { P(cx - SZ(4), gY - SZ(70), SZ(8), SZ(42), "#173f17"); P(cx - SZ(2), gY - SZ(70), SZ(3), SZ(42), "#3f8f3f"); disc(cx, gY - SZ(30), SZ(19), "#123512"); disc(cx, gY - SZ(30), SZ(12), "#4aa84a"); disc(cx - SZ(4), gY - SZ(34), SZ(5), "#9bec5a"); P(cx - SZ(12), gY - SZ(30), SZ(24), SZ(4), "#0d2a0d"); }
      else if (type === "giant") { var stomp = Math.abs(Math.sin(ph * 3)), soleY = gY - SZ(30) - Math.round(stomp * SZ(20)); disc(cx, gY, SZ(26), "rgba(0,0,0,.22)"); P(cx - SZ(21), 0, SZ(42), soleY - SZ(18), "#6e4a28"); P(cx - SZ(19), 0, SZ(38), soleY - SZ(20), "#d8b48a"); P(cx - SZ(19), 0, SZ(9), soleY - SZ(20), "#eccfa8"); P(cx - SZ(28), soleY - SZ(26), SZ(56), SZ(28), "#6e4a28"); P(cx - SZ(26), soleY - SZ(24), SZ(52), SZ(24), "#e6bd92"); P(cx - SZ(26), soleY - SZ(6), SZ(52), SZ(6), "#a97c48"); for (var gt = 0; gt < 5; gt++) P(cx - SZ(24) + gt * SZ(10), soleY - SZ(3), SZ(7), SZ(6), "#f2d6b0"); }
      else if (type === "hoop") { for (var a = 0; a < 14; a++) { var an = a / 14 * 6.283, hxp = cx + Math.round(Math.cos(an) * SZ(26)), hyp = gY - SZ(32) + Math.round(Math.sin(an) * SZ(26)); disc(hxp, hyp, SZ(6), "#5a1400"); disc(hxp, hyp, SZ(4), (a + Math.floor(ph * 6)) % 2 ? "#ff5a1a" : "#ff9a1a"); disc(hxp, hyp, SZ(2), "#fff2c0"); } }
      else if (type === "snowball") { disc(cx, gY - SZ(13), SZ(16), "#8fb4d4"); disc(cx, gY - SZ(13), SZ(14), "#ffffff"); disc(cx + SZ(5), gY - SZ(11), SZ(9), "#cfe0ee"); disc(cx, gY - SZ(32), SZ(12), "#8fb4d4"); disc(cx, gY - SZ(32), SZ(10), "#ffffff"); disc(cx + SZ(3), gY - SZ(31), SZ(6), "#cfe0ee"); P(cx - SZ(5), gY - SZ(34), SZ(3), SZ(3), "#111"); P(cx + SZ(2), gY - SZ(34), SZ(3), SZ(3), "#111"); P(cx - SZ(1), gY - SZ(31), SZ(5), SZ(2), "#ff8a2a"); P(cx - SZ(16), gY - SZ(24), SZ(10), SZ(3), "#8a5a2a"); var sbz = gY - SZ(22) - Math.round(Math.abs(Math.sin(ph * 5)) * SZ(6)); disc(cx + SZ(20), sbz, SZ(7), "#8fb4d4"); disc(cx + SZ(20), sbz, SZ(5), "#fff"); }
      else if (type === "iceblock") { var dd = Math.round((Math.sin(ph * 3) + 1) * SZ(9)); P(cx - SZ(3), gY - SZ(58), SZ(6), SZ(12), "#8fdcff"); var ibx = cx - SZ(15), iby = gY - SZ(42) - dd; P(ibx, iby, SZ(30), SZ(30), "#4fbdec"); P(ibx, iby, SZ(30), SZ(5), "#bfeeff"); P(ibx, iby, SZ(6), SZ(30), "#8fdcff"); P(ibx + SZ(24), iby, SZ(6), SZ(30), "#2f93c8"); P(ibx, iby + SZ(25), SZ(30), SZ(5), "#2f93c8"); }
      else if (type === "star") { var sy = gY - SZ(26), r = SZ(18); disc(cx, sy, SZ(21), "#2a1a06"); P(cx - 1, sy - r, 2, r * 2, "#a8781e"); P(cx - r, sy - 1, r * 2, 2, "#a8781e"); P(cx - Math.round(r * .6), sy - Math.round(r * .6), Math.round(r * 1.2), Math.round(r * 1.2), "#c99a2e"); P(cx - SZ(2), sy - SZ(2), SZ(4), SZ(4), "#6a4a10"); }   // dull "cursed" star — not the shiny pickup
      else if (type === "rps") { P(cx - SZ(13), gY - SZ(34), SZ(26), SZ(34), "#8b6cf0"); P(cx - SZ(13), gY - SZ(34), SZ(26), SZ(5), "#a98bff"); P(cx - SZ(8), gY - SZ(28), SZ(6), SZ(6), "#fff"); P(cx + SZ(3), gY - SZ(28), SZ(6), SZ(6), "#fff"); P(cx - SZ(6), gY - SZ(26), SZ(3), SZ(3), "#111"); P(cx + SZ(5), gY - SZ(26), SZ(3), SZ(3), "#111"); var gg = Math.floor(ph * 2) % 3; if (gg === 0) disc(cx, gY - SZ(48), SZ(9), "#f2d6b0"); else if (gg === 1) P(cx - SZ(11), gY - SZ(54), SZ(22), SZ(12), "#f2d6b0"); else { P(cx - SZ(3), gY - SZ(56), SZ(3), SZ(15), "#f2d6b0"); P(cx + SZ(3), gY - SZ(56), SZ(3), SZ(15), "#f2d6b0"); } }
      else if (type === "police") { var pf = Math.floor(ph * 4) % 2; P(cx - SZ(20), gY - SZ(16), SZ(40), SZ(16), "#e8ecff"); for (var pb = -14; pb <= 14; pb += 9) P(cx + SZ(pb), gY - SZ(16), SZ(3), SZ(16), "#2a3350"); P(cx - SZ(20), gY - SZ(16), SZ(40), SZ(4), "#ffd23f"); P(cx - SZ(12), gY - SZ(28), SZ(11), SZ(9), pf ? "#ff3b30" : "#3a6bff"); P(cx + SZ(1), gY - SZ(28), SZ(11), SZ(9), pf ? "#3a6bff" : "#ff3b30"); }
      else if (type === "booger") { var bwf = Math.sin(ph * 8) > 0 ? SZ(4) : 0; disc(cx, gY - SZ(28), SZ(13), "#f2c9a0"); P(cx - SZ(5), gY - SZ(24), SZ(4), SZ(5), "#a9743f"); P(cx + SZ(2), gY - SZ(24), SZ(4), SZ(5), "#a9743f"); P(cx - SZ(22), gY - SZ(34) - bwf, SZ(11), SZ(6), "#fff"); P(cx + SZ(12), gY - SZ(34) - bwf, SZ(11), SZ(6), "#fff"); disc(cx - SZ(2), gY - SZ(12) + Math.round(Math.abs(Math.sin(ph * 6)) * SZ(6)), SZ(4), "#8fd14a"); }
      else { P(cx - SZ(26), gY - SZ(56), SZ(52), SZ(56), "#38316e"); for (var v = -22; v <= 22; v += 8) P(cx + SZ(v), gY - SZ(54), SZ(4), SZ(54), "#a9c4ff"); P(cx - SZ(26), gY - SZ(56), SZ(52), SZ(5), "#37e0ff"); P(cx - SZ(26), gY - SZ(5), SZ(52), SZ(5), "#37e0ff"); P(cx - SZ(7), gY - SZ(34), SZ(6), SZ(7), "#37e0ff"); P(cx + SZ(2), gY - SZ(34), SZ(6), SZ(7), "#37e0ff"); }
      trapBase(baseX, gY);                       // red-&-black caution band + spike teeth
      if (!sprung) trapBeacon(baseX, gY, ph);    // ⚠ warning beacon
    }

    /* ---- HUD (pixel) ---- */
    function heartPix(g, on) { var m = on ? "#ff5c6c" : "#3a3f5a"; g.fillStyle = m;[[1, 1], [2, 1], [4, 1], [5, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5], [3, 6]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); }); if (on) { g.fillStyle = "#ffd0d6"; g.fillRect(1, 2, 1, 1); g.fillRect(2, 2, 1, 1); } }
    function coinPix(g) { g.fillStyle = C.coin; g.fillRect(1, 1, 6, 6); g.fillStyle = C.coinHi; g.fillRect(1, 1, 6, 2); g.fillStyle = C.coinLo; g.fillRect(3, 2, 2, 4); }
    function heroMarkPix(g) { heroDraw(g, HEROTYPE, 0, 0, 12, 12, 0); }
    function starPix(g, on) { g.fillStyle = on ? C.star : "#3a3f5a"; g.fillRect(7, 1, 2, 4); g.fillRect(3, 5, 10, 2); g.fillRect(5, 7, 6, 3); g.fillRect(4, 10, 3, 3); g.fillRect(9, 10, 3, 3); }
    function drawStarRow(elx, n) { elx.innerHTML = ""; for (var i = 0; i < 3; i++) { var c = document.createElement("canvas"); c.width = 16; c.height = 16; var g = c.getContext("2d"); g.imageSmoothingEnabled = false; starPix(g, i < n); elx.appendChild(c); } }
    function buildPmap() { var ticks = $("#adv-pmapTicks"); ticks.innerHTML = ""; var total = G.castleX; G.gates.forEach(function (ga) { var d = document.createElement("div"); d.className = "tick"; d.style.left = (ga.x / total * 100) + "%"; ticks.appendChild(d); }); var cf = document.createElement("div"); cf.className = "tick"; cf.style.left = "100%"; cf.style.borderColor = "#ffd23f"; ticks.appendChild(cf); }
    function hudUpdate() {
      if (!G) return; var hel = $("#adv-hearts"); var hk = G.hearts + "/" + G.maxHearts; if (hel._k !== hk) { hel._k = hk; hel.innerHTML = ""; for (var i = 0; i < G.maxHearts; i++) { var c = document.createElement("canvas"); c.width = 8; c.height = 7; var g = c.getContext("2d"); g.imageSmoothingEnabled = false; heartPix(g, i < G.hearts); hel.appendChild(c); } }
      $("#adv-coinN").textContent = G.coins; var gn = $("#adv-gemN"); if (gn) gn.textContent = G.gemRun || 0; $("#adv-gate").textContent = "GATE " + Math.min(G.nextGate + 1, G.gates.length) + "/" + G.gates.length; $("#adv-level").textContent = G.theme.name;
      var prog = Math.max(0, Math.min(1, G.hero.wx / G.castleX)); $("#adv-pmapFill").style.width = (prog * 98) + "%"; $("#adv-pmapHero").style.left = (prog * 100) + "%"; var tk = $("#adv-pmapTicks").children; for (var t = 0; t < G.gates.length; t++) if (tk[t]) tk[t].classList.toggle("done", G.gates[t].solved);
    }

    /* ---- level map (pixel canvas) ---- */
    var mapNodes = [];
    function mapR(W, H) { return Math.round(Math.max(15, Math.min(46, Math.min(W, H) * 0.078))); }
    function buildMap() {
      var mcv = $("#adv-mapCanvas"), stage = mcv.parentElement;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var W = (stage && stage.clientWidth) || window.innerWidth || 360;
      var H = (stage && stage.clientHeight) || window.innerHeight || 640;
      mcv.width = Math.round(W * dpr); mcv.height = Math.round(H * dpr);
      var mg = mcv.getContext("2d"); mg.setTransform(dpr, 0, 0, dpr, 0, 0); mg.imageSmoothingEnabled = false;
      var portrait = H >= W, R = mapR(W, H), k = R / 12;
      var topM = H * 0.13, botM = H * (portrait ? 0.2 : 0.14);   // clear the title strip + hero dock
      mapNodes = [];
      if (portrait) {   // serpentine down the screen (fills a tall phone)
        var cx = W * 0.5, ampX = Math.min(W * 0.32, W * 0.5 - R - 22), usableH = H - topM - botM;
        for (var i = 0; i < MAXLEVELS; i++) { var t = MAXLEVELS > 1 ? i / (MAXLEVELS - 1) : 0; mapNodes.push({ x: Math.round(cx + Math.sin(i * 0.95 + 0.5) * ampX), y: Math.round(topM + t * usableH), n: i + 1, theme: THEMES[i % THEMES.length] }); }
      } else {          // serpentine across the screen (fills a wide desktop / landscape)
        var x0 = W * 0.08, usableW = W * 0.84, cy = (topM + (H - botM)) / 2, ampY = Math.min((H - topM - botM) * 0.42, H * 0.5 - R - 16);
        for (var j = 0; j < MAXLEVELS; j++) { var tj = MAXLEVELS > 1 ? j / (MAXLEVELS - 1) : 0; mapNodes.push({ x: Math.round(x0 + tj * usableW), y: Math.round(cy + Math.sin(j * 0.82 + 0.5) * ampY), n: j + 1, theme: THEMES[j % THEMES.length] }); }
      }
      function rrect(x0, y0, w, h, r) { mg.beginPath(); mg.moveTo(x0 + r, y0); mg.arcTo(x0 + w, y0, x0 + w, y0 + h, r); mg.arcTo(x0 + w, y0 + h, x0, y0 + h, r); mg.arcTo(x0, y0 + h, x0, y0, r); mg.arcTo(x0, y0, x0 + w, y0, r); mg.closePath(); }
      // water
      var wg = mg.createLinearGradient(0, 0, 0, H); wg.addColorStop(0, "#3a8fd8"); wg.addColorStop(1, "#1f5fa8"); mg.fillStyle = wg; mg.fillRect(0, 0, W, H);
      mg.fillStyle = "rgba(255,255,255,.13)"; var sN = Math.round(W * H / 900); for (var s = 0; s < sN; s++) mg.fillRect((s * 61) % W, (s * 43) % H, (s % 4 ? 2 : 3), 1);
      // clouds (behind the land)
      mg.fillStyle = "rgba(255,255,255,.9)";[[.14, .12], [.84, .09], [.47, .16], [.68, .32], [.2, .46]].forEach(function (c) { var ccx = c[0] * W, ccy = c[1] * H, cr = R * 0.7;[[0, 0, cr], [cr * .82, cr * .22, cr * .78], [-cr * .82, cr * .22, cr * .66]].forEach(function (o) { mg.beginPath(); mg.arc(ccx + o[0], ccy + o[1], o[2], 0, 7); mg.fill(); }); });
      // landmass — sand + grass blobs following the winding path
      var pts = []; mapNodes.forEach(function (p, i) { pts.push([p.x, p.y]); if (i < mapNodes.length - 1) pts.push([(p.x + mapNodes[i + 1].x) / 2, (p.y + mapNodes[i + 1].y) / 2]); });
      function blobs(r, col, dy) { mg.fillStyle = col; pts.forEach(function (pt) { mg.beginPath(); mg.arc(pt[0], pt[1] + (dy || 0), r, 0, 7); mg.fill(); }); }
      blobs(32 * k, "#e2c184"); blobs(30 * k, "#c9a865", 2 * k); blobs(27 * k, "#2f8f3a", 3 * k); blobs(26 * k, "#49ba52"); blobs(19 * k, "#5fce62", -3 * k);
      // winding road
      function road(w, col, dash) { mg.strokeStyle = col; mg.lineWidth = w; mg.lineCap = "round"; mg.lineJoin = "round"; mg.setLineDash(dash || []); mg.beginPath(); mapNodes.forEach(function (p, i) { i ? mg.lineTo(p.x, p.y) : mg.moveTo(p.x, p.y); }); mg.stroke(); }
      road(10 * k, "#7a4e26"); road(6 * k, "#d2a45f"); road(Math.max(1, 1.6 * k), "rgba(255,255,255,.75)", [2 * k, 5 * k]); mg.setLineDash([]);
      var savedX = x; x = mg;
      // little trees dotted on the grass beside a few tiles (kept clear of badges/labels)
      [[0, -1.3, -1.1], [Math.min(2, MAXLEVELS - 1), 1.3, -1], [Math.min(5, MAXLEVELS - 1), -1.3, 1.1], [Math.min(6, MAXLEVELS - 1), 1.25, 1.1]].forEach(function (d) { var nd = mapNodes[d[0]]; if (nd) pxProp("tree", Math.round(nd.x + d[1] * R), Math.round(nd.y + d[2] * R + 6), Math.round(R * 1.5), THEMES[0]); });
      // level tiles
      var labels = [];
      mapNodes.forEach(function (p) {
        var open = p.n <= unlocked, done = p.n < unlocked, here = p.n === Math.min(unlocked, MAXLEVELS), gs = R * 0.58;
        mg.save(); rrect(p.x - R, p.y - R, R * 2, R * 2, R * 0.34); mg.clip();
        mg.fillStyle = p.theme.sky; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2);
        mg.fillStyle = p.theme.sky2 || p.theme.sky; mg.fillRect(p.x - R, p.y, R * 2, R);
        mg.fillStyle = p.theme.grass; mg.fillRect(p.x - R, p.y + R - gs, R * 2, gs);
        pxProp(p.theme.prop, p.x, p.y + R - gs, Math.round(R * 1.4), p.theme);
        if (!open) { mg.fillStyle = "rgba(14,18,34,.66)"; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2); }
        mg.restore();
        rrect(p.x - R, p.y - R, R * 2, R * 2, R * 0.34); mg.lineWidth = here ? 3 : 2; mg.strokeStyle = here ? "#ff4fa3" : open ? "#ffffff" : "#59648c"; mg.stroke();
        // number badge (pink=here, green=done, gold=open, grey=locked)
        var br = R * 0.58, bx = p.x + R - br * 0.5, by = p.y - R + br * 0.5;
        mg.beginPath(); mg.arc(bx, by, br, 0, 7); mg.fillStyle = here ? "#ff4fa3" : done ? "#3ad44a" : open ? "#ffd23f" : "#39447a"; mg.fill(); mg.lineWidth = 1.4; mg.strokeStyle = "#101828"; mg.stroke();
        mg.fillStyle = open ? "#101828" : "#cfd6ff"; mg.font = "900 " + Math.round(R * 0.72) + "px monospace"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(p.n, bx, by + 1);
        if (!open) { mg.fillStyle = "#ffd23f"; mg.fillRect(p.x - R * 0.33, p.y - R * 0.08, R * 0.66, R * 0.5); mg.strokeStyle = "#ffd23f"; mg.lineWidth = Math.max(1, R * 0.12); mg.beginPath(); mg.arc(p.x, p.y - R * 0.08, R * 0.25, Math.PI, 0); mg.stroke(); mg.fillStyle = "#101828"; mg.fillRect(p.x - R * 0.08, p.y + R * 0.08, R * 0.16, R * 0.24); }
        labels.push({ name: p.theme.name, x: p.x, y: p.y + R + R * 0.85, open: open });
        if (progress.secretsFound && progress.secretsFound[p.n]) { var cq = p.x - R + R * 0.28, cy2 = p.y - R + R * 0.28; mg.fillStyle = "#ffd23f"; for (var a = 0; a < 5; a++) { var an = a / 5 * 6.28 - 1.57; mg.fillRect(Math.round(cq + Math.cos(an) * R * 0.24) - 1, Math.round(cy2 + Math.sin(an) * R * 0.24) - 1, 2, 2); } }
      });
      // world-name labels in a second pass so no neighbouring tile ever clips one
      mg.font = "700 " + Math.round(R * 0.6) + "px monospace"; mg.textBaseline = "alphabetic"; mg.textAlign = "center"; mg.lineJoin = "round"; mg.lineWidth = Math.max(2, R * 0.18);
      labels.forEach(function (l) { mg.strokeStyle = "rgba(8,10,20,.92)"; mg.strokeText(l.name, l.x, l.y); mg.fillStyle = l.open ? "#ffffff" : "#c2c9e8"; mg.fillText(l.name, l.x, l.y); });
      x = savedX;
      // "you are here" hero standee above the current node
      var cp = mapNodes[Math.min(unlocked, MAXLEVELS) - 1]; if (cp) heroDraw(mg, HEROTYPE, cp.x - R * 1.1, cp.y - R * 3.3, R * 2.2, R * 2, 0, true);
    }
    function mapClick(ev) { var mcv = $("#adv-mapCanvas"), rect = mcv.getBoundingClientRect(); var mxp = ev.clientX - rect.left, myp = ev.clientY - rect.top, tol = mapR(rect.width, rect.height) + 8; for (var i = 0; i < mapNodes.length; i++) { var p = mapNodes[i]; if (p.n <= unlocked && Math.abs(mxp - p.x) < tol && Math.abs(myp - p.y) < tol) { ac(); startLevel(p.n); return; } } }
    function buildCharRow() {
      var row = $("#adv-charRow"); row.innerHTML = ""; var gems = progress.gems || 0;
      CHARS.forEach(function (ch) {
        var locked = ch.cost && gems < ch.cost;
        var btn = document.createElement("button"); btn.className = "adv8-charBtn" + (ch.id === HEROTYPE ? " on" : "") + (locked ? " locked" : "");
        var c = document.createElement("canvas"); c.width = 42; c.height = 36; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
        if (locked) g.globalAlpha = 0.4; heroDraw(g, ch.id, 0, 2, 42, 32, 0, true); g.globalAlpha = 1;
        var nm = el("div", "adv8-charName", ch.name); btn.appendChild(c); btn.appendChild(nm);
        if (ch.cost) btn.appendChild(el("div", "adv8-charCost", locked ? ("◆ " + ch.cost) : ch.note));
        btn.addEventListener("click", function () {
          if (locked) { aBad(); haptic(20); var gi = $("#adv-gemInfo"); if (gi) { gi.classList.add("flash"); setTimeout(function () { gi.classList.remove("flash"); }, 700); } return; }
          HEROTYPE = ch.id; progress.hero = ch.id; save(); buildCharRow(); redrawPmapHero();
        });
        row.appendChild(btn);
      });
      // exclusive secret-only heroes (unlocked by finding a world's hidden path)
      Object.keys(SECRET_CHARS).forEach(function (wk) {
        var ch = SECRET_CHARS[wk]; var found = !!(progress.secretsFound && progress.secretsFound[wk]);
        var btn = document.createElement("button"); btn.className = "adv8-charBtn" + (ch.id === HEROTYPE ? " on" : "") + (found ? "" : " locked");
        var c = document.createElement("canvas"); c.width = 42; c.height = 36; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
        if (!found) g.globalAlpha = 0.28; heroDraw(g, ch.id, 0, 2, 42, 32, 0, true); g.globalAlpha = 1;
        btn.appendChild(c); btn.appendChild(el("div", "adv8-charName", found ? ch.name : "???"));
        btn.appendChild(el("div", "adv8-charCost", found ? ch.note : ("🔒 " + ch.from + " SECRET")));
        btn.addEventListener("click", function () {
          if (!found) { aBad(); haptic(20); var gi = $("#adv-gemInfo"); if (gi) { gi.textContent = "🔒 Find the hidden path in " + ch.from + " to unlock " + ch.name + "!"; gi.classList.add("flash"); setTimeout(function () { gi.classList.remove("flash"); buildCharRow(); }, 1400); } return; }
          HEROTYPE = ch.id; progress.hero = ch.id; save(); buildCharRow(); redrawPmapHero();
        });
        row.appendChild(btn);
      });
      var info = $("#adv-gemInfo"); if (info) info.textContent = "◆ " + gems + " purple coins — grab them to unlock heroes!";
    }
    function redrawPmapHero() { var pg = $("#adv-pmapHero").getContext("2d"); pg.imageSmoothingEnabled = false; pg.clearRect(0, 0, 12, 12); heroMarkPix(pg); }

    /* ---- lifecycle ---- */
    function enter() { show("adventure"); resize(); running = true; if (!looping) { looping = true; last = 0; requestAnimationFrame(frame); } kickPaint(); }
    // iOS Safari sometimes leaves the just-shown fixed adventure layer uncomposited (canvas draws
    // but never appears). A brief DOM mutation on a fixed element forces the first composite pass;
    // the translateZ layer on #adv-c keeps it painting every frame after that.
    function kickPaint() {
      try {
        var k = document.createElement("div");
        k.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;background:transparent;pointer-events:none;z-index:2147483640";
        (document.body || document.documentElement).appendChild(k);
        var n = 0;
        (function pulse() {
          if (!running || n++ > 8) { try { k.remove(); } catch (e) {} return; }
          k.style.left = (n % 2) + "px";
          requestAnimationFrame(pulse);
        })();
      } catch (e) {}
    }
    function leave() { running = false; warpFX = null; musicStop(); }
    function startDaily() {
      HEROTYPE = progress.hero || "unicorn"; unlocked = Math.max(1, progress.worldsUnlocked || 1);
      enter(); hideAllOv(); reset(1); G.state = "map"; buildCharRow(); redrawPmapHero(); hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden"); buildMap();
      diagMap();
    }
    // Diagnostic: after opening the map, verify the canvas actually painted on this device.
    // Reports (once) if it came up blank or zero-sized so a device screenshot pinpoints the cause.
    function diagMap() {
      try {
        var mc = $("#adv-mapCanvas"); if (!mc) { __diag("MAP: no canvas element"); return; }
        var mg2 = mc.getContext("2d");
        var cssBad = (mc.clientWidth < 50 || mc.clientHeight < 50);
        var blank = true;
        if (mg2 && mc.width && mc.height) {
          var sw = Math.min(mc.width, 48), sh = Math.min(mc.height, 48);
          var d = mg2.getImageData(0, 0, sw, sh).data;
          for (var i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 24) { blank = false; break; } }
        }
        if (DIAG || blank || cssBad) {
          diagTestBox();
          __diag((blank || cssBad ? "QUEST MAP DID NOT PAINT" : "MAP DIAG (?diag=1)") + "\n" +
            "backing " + mc.width + "x" + mc.height + "  css " + mc.clientWidth + "x" + mc.clientHeight + "\n" +
            "ctx=" + (!!mg2) + "  blank=" + blank + "  dpr=" + (window.devicePixelRatio || 1) + "\n" +
            "canvases=" + document.querySelectorAll("canvas").length + "  charRow=" + (($("#adv-charRow") || {}).childElementCount) + "\n" +
            "See a red TEST box bottom-left? " + (DIAG ? "(should be there)" : "") + "\n" +
            "ua=" + navigator.userAgent);
        }
      } catch (e) { __diag("MAP CHECK THREW: " + (e && e.message)); }
    }
    function openMap() { unlocked = Math.max(1, progress.worldsUnlocked || 1); hideAllOv(); if (G) G.state = "map"; hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden"); buildMap(); }
    function exitHome() { leave(); musicStop(); renderHome(); show("home"); }

    /* ---- PRACTICE ARENA: drill the mini-games back-to-back on chosen tables (no world, no fail) ---- */
    function startArena(opts) {
      HEROTYPE = progress.hero || "unicorn"; unlocked = Math.max(1, progress.worldsUnlocked || 1);
      enter(); hideAllOv(); reset(1);
      var tables = (opts.tables && opts.tables.length) ? opts.tables : focusTables();
      var total = Math.max(4, Math.min(24, opts.len || 12));
      G.deck = buildQuestions(tables, total * 3); G.deckI = 0;   // deep deck so retries never run dry
      G.correct = 0; G.wrong = 0; G.xpEarned = 0;
      G.arena = { opts: opts, mode: opts.mode || "mix", total: total, i: 0, startTs: Date.now() };
      $("#adv-mapBtn").textContent = "AGAIN";
      musicWorld(1); arenaLaunch();
    }
    function arenaLaunch() {
      var A = G.arena; G.state = "run"; G.lane = null; G.ast = null; G.mini = null;
      var mode = A.mode === "mix" ? SPECIAL_MODES[A.i % SPECIAL_MODES.length] : A.mode;
      if (mode === "lane") enterLanes(); else if (mode === "asteroid") enterAst(); else if (MINI_ENTER[mode]) MINI_ENTER[mode](); else enterLanes();
      $("#adv-quit").classList.remove("hidden");   // let kids bail out mid-practice
    }
    function arenaAfter() {
      var A = G.arena; A.i++;
      if (A.i >= A.total) { arenaFinish(); return; }
      hudShow(false); arenaLaunch();
    }
    function arenaFinish() {
      var A = G.arena, slips = G.wrong, stars = slips === 0 ? 3 : slips <= 2 ? 2 : 1;
      G.state = "win"; G.mini = null; G.lane = null; G.ast = null; musicStop(); aWin(); haptic([15, 60, 15]); save();
      drawStarRow($("#adv-winStars"), stars);
      $("#adv-winTitle").textContent = slips === 0 ? "PERFECT PRACTICE!" : "PRACTICE DONE!";
      $("#adv-winMsg").textContent = A.total + " ANSWERED · " + (slips ? slips + " SLIP" + (slips > 1 ? "S" : "") : "NO SLIPS!") + " · +" + G.xpEarned + " XP";
      $("#adv-winUnlocks").innerHTML = ""; $("#adv-nextBtn").style.display = "none";
      openOv("adv-winOv"); advBurst();
    }

    function advInit() {
      cv = $("#adv-c"); x = cv.getContext("2d"); buildHeroArt();
      var ci = $("#adv-coin-icon"); ci.width = 8; ci.height = 8; var cig = ci.getContext("2d"); cig.imageSmoothingEnabled = false; coinPix(cig);
      function mapVisible() { return !$("#adv-mapOv").classList.contains("hidden"); }
      window.addEventListener("resize", function () { if (running) resize(); if (mapVisible()) buildMap(); });
      window.addEventListener("orientationchange", function () { if (running) { resize(); setTimeout(function () { if (running) resize(); if (mapVisible()) buildMap(); }, 300); } });
      cv.addEventListener("pointerdown", function (e) { ac(); if (G && G.state === "showdown") sdDown(e); else if (G && G.state === "lanes") laneDown(e); else if (G && G.state === "asteroid") astTap(e); else if (G && G.mini && G.state === G.mini.key) { if (G.mini.down) G.mini.down(e); } else jump(); });
      cv.addEventListener("pointermove", function (e) { if (G && G.state === "showdown") sdMove(e); else if (G && G.mini && G.state === G.mini.key && G.mini.move) G.mini.move(e); });
      cv.addEventListener("pointerup", function (e) { if (G && G.state === "showdown") sdUp(e); else if (G && G.mini && G.state === G.mini.key) { if (G.mini.up) G.mini.up(e); } else if (G && G.state === "lanes") laneUp(e); else if (G && G.state === "asteroid") { /* tap handled on down */ } else jumpRelease(); });
      $("#adv-kpad").addEventListener("click", function (e) { var b = e.target.closest(".key"); if (b) { ac(); key(b.getAttribute("data-k")); } });
      $("#adv-mapCanvas").addEventListener("click", mapClick);
      document.addEventListener("keydown", function (e) {
        if (!isActive() || !G) return;
        if (G.state === "gate" || G.state === "trapped") { if (e.key >= "0" && e.key <= "9") key(e.key); else if (e.key === "Backspace") key("del"); else if (e.key === "Enter") key("enter"); }
        else if (G.state === "lanes") { if (e.key === "ArrowUp") { e.preventDefault(); laneShift(-1); } else if (e.key === "ArrowDown") { e.preventDefault(); laneShift(1); } else if (e.key === " " || e.key === "Enter") { e.preventDefault(); laneTap(); } }
        else if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); jump(); }
      });
      document.addEventListener("keyup", function (e) { if (isActive() && (e.key === " " || e.key === "ArrowUp")) jumpRelease(); });
      $("#adv-quit").addEventListener("click", function (e) { e.stopPropagation(); sTap(); if (G && G.arena) { exitHome(); return; } openMap(); });
      $("#adv-map-close").addEventListener("click", function () { sTap(); exitHome(); });
      $("#adv-nextBtn").addEventListener("click", function () { sTap(); startLevel(Math.min(level + 1, MAXLEVELS)); });
      $("#adv-retryBtn").addEventListener("click", function () { sTap(); startLevel(level); });
      $("#adv-mapBtn").addEventListener("click", function () { sTap(); if (G && G.arena) { startArena(G.arena.opts); return; } openMap(); });
      $("#adv-mapBtn2").addEventListener("click", function () { sTap(); openMap(); });
      $("#adv-homeBtn").addEventListener("click", function () { sTap(); exitHome(); });
      $("#adv-homeBtn2").addEventListener("click", function () { sTap(); exitHome(); });
    }
    function isActive() { var s = document.querySelector(".screen--adv"); return s && s.classList.contains("is-active"); }

    window.__adv = {
      get state() { return G ? G.state : null; }, get q() { return G ? G.question : null; },
      get hearts() { return G ? G.hearts : null; }, get maxHearts() { return G ? G.maxHearts : null; }, get coins() { return G ? G.coins : null; },
      get next() { return G ? G.nextGate : null; }, get total() { return G ? G.gates.length : null; },
      get gems() { return progress.gems || 0; }, get level() { return level; }, get shield() { return G ? !!G.shield : null; },
      get metrics() { if (!G) return null; var vis = PIXW / sx; return { castleX: Math.round(G.castleX), gates: G.gates.length, seg: SEG, visibleWorldUnits: Math.round(vis), screensWide: +(G.castleX / vis).toFixed(1), runSeconds: +(G.castleX / G.speed).toFixed(1) }; },
      start: function (n) { startLevel(n || 1); }, openMap: openMap,
      tp: function (x) { if (G) { G.hero.wx = x; G.hero.y = GROUND; G.hero.vy = 0; G.hero.ground = true; G.cam = x - HEROX; var ng = G.gates.length; for (var i = 0; i < G.gates.length; i++) { if (G.gates[i].x <= x + 60) G.gates[i].solved = true; else { ng = i; break; } } G.nextGate = ng; if (G.showdown && G.showdown.x < x) G.showdown.done = true; G.state = "run"; try { mathHide(); } catch (e) {} } },
      gxAt: function (i) { return G && G.gates[i] ? G.gates[i].x : null; },
      forceTrap: function () { if (!G) return; G.traps.push({ x: G.hero.wx, type: pick(G.cf.trapPool), done: false, sprung: false }); springTrap(G.traps.length - 1); },
      forceTrapType: function (t) { if (!G) return; G.traps.push({ x: G.hero.wx, type: t, done: false, sprung: false }); springTrap(G.traps.length - 1); },
      setHero: function (id) { HEROTYPE = id; if (progress) { progress.hero = id; } }, buildCharRow: buildCharRow,
      drawHero: function (cv, type, front) { Adv.drawHero(cv, type, front); },
      drawWorld: function (cv, idx) { Adv.drawWorld(cv, idx); },
      drawHowScene: function (cv, kind) { Adv.drawHowScene(cv, kind); },
      drawQuestMap: function (cv) { Adv.drawQuestMap(cv); },
      get trapsX() { return G ? G.traps.map(function (t) { return Math.round(t.x); }) : []; },
      get gemsX() { return G ? G.gemsA.map(function (g) { return Math.round(g.x); }) : []; },
      get fishX() { return G ? G.fish.map(function (f) { return Math.round(f.x); }) : []; },
      get chunks() { return G ? G.gates.length : 0; },
      get inSecret() { return G ? !!G.secretWorld : false; },
      get inShowdown() { return G ? G.state === "showdown" : false; },
      get inLanes() { return G ? G.state === "lanes" : false; },
      enterLanes: function () { if (G && G.state === "run") enterLanes(); },
      laneTap: function () { if (G && G.state === "lanes") laneTap(); },
      get laneAnswers() { return G && G.lane ? G.lane.vals.slice() : null; },
      get laneCorrect() { return G && G.lane ? G.lane.correct : null; },
      get laneCur() { return G && G.lane ? G.lane.lane : null; },
      laneSetCur: function (i) { if (G && G.lane) G.lane.lane = ((i % 3) + 3) % 3; },
      get inAst() { return G ? G.state === "asteroid" : false; },
      enterAst: function () { if (G && G.state === "run") enterAst(); },
      get astRocks() { return G && G.ast ? G.ast.rocks.map(function (r) { return { v: r.v, dead: r.dead }; }) : null; },
      get astCorrect() { return G && G.ast ? G.ast.correct : null; },
      astShoot: function (v) { if (!G || !G.ast || G.ast.phase !== "aim") return; var rk = G.ast.rocks.filter(function (r) { return !r.dead; }).filter(function (r) { return r.v === v; })[0]; if (!rk) return; G.ast.phase = "fire"; G.ast.target = rk; G.ast.bullets.push({ x: G.ast.shipX, y: PIXH - SZ(30), tx: rk.x, ty: rk.y }); },
      get inMini() { return G && G.mini ? G.state : false; },
      get miniVals() { return G && G.mini ? G.mini.vals.slice() : null; },
      get miniCorrect() { return G && G.mini ? G.mini.correct : null; },
      enterMini: function (mode) { if (G && G.state === "run" && MINI_ENTER[mode]) MINI_ENTER[mode](); },
      miniChoose: function (v) { if (G && G.mini && G.mini.pick) G.mini.pick(v); },
      get specialModes() { return SPECIAL_MODES.slice(); },
      startArena: function (o) { startArena(o || { mode: "mix", len: 12 }); },
      get arena() { return G && G.arena ? { mode: G.arena.mode, total: G.arena.total, i: G.arena.i } : null; },
      resumeMusic: function () { if (G && ["run", "gate", "trapped", "showdown", "warping", "lanes", "asteroid", "whack", "hoop", "beat", "slash", "catch"].indexOf(G.state) >= 0) { if (G.secretWorld) musicSecret(); else musicWorld(level); } },
      enterShowdown: function () { if (G && G.state === "run") enterShowdown(); },
      sdWin: function () { if (G && G.sd) sdWinNow(); },
      get showdownX() { return G && G.showdown && !G.showdown.done ? Math.round(G.showdown.x) : null; },
      get warpX() { return G && G.warp && !G.warp.done ? Math.round(G.warp.x) : null; },
      get secretsFound() { return progress.secretsFound || {}; },
      enterSecret: function () { if (G && SECRET_CHARS[level] && !G.secretWorld) enterSecret(level); },
      warp: function (wx) { if (G) { while (G.nextGate < G.gates.length && G.gates[G.nextGate].x < wx - 60) { G.gates[G.nextGate].solved = true; G.nextGate++; } G.hero.wx = wx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.cam = wx - HEROX; } },
      unwarp: function () {},
      get correct() { return G ? G.correct : null; },
      get gatesX() { return G ? G.gates.map(function (g) { return Math.round(g.x); }) : []; },
      get skipPlats() { return G ? G.platforms.filter(function (p) { return p.skip; }).map(function (p) { return { x: Math.round(p.x), top: Math.round(GROUND - p.hAbove), w: p.w, gi: p.gi, used: !!p.used }; }) : []; },
      get skipped() { return G ? G.gates.map(function (g) { return !!g.skipped; }) : []; },
      placeHero: function (wx, y) { if (!G) return; G.hero.wx = wx; if (y != null) { G.hero.y = y; G.hero.ground = false; G.hero.vy = -10; } G.cam = wx - HEROX; }
    };

    function drawHero(canvas, type, front) {
      if (!HERO_ART[type]) buildHeroArt();
      var g = canvas.getContext("2d"); g.clearRect(0, 0, canvas.width, canvas.height); g.imageSmoothingEnabled = false;
      var pad = Math.round(canvas.width * 0.06), bw = canvas.width - pad * 2, bh = canvas.height - pad * 2;
      heroDraw(g, type, pad, pad, bw, bh, 0, front !== false);
    }
    // Little pixel "level preview" for a world card on the landing — built from that world's own theme palette.
    function drawWorld(canvas, idx) {
      var th = THEMES[idx % THEMES.length], INK = "#241a4a";
      var g = canvas.getContext("2d"); g.imageSmoothingEnabled = false;
      var W = canvas.width, H = canvas.height, gy = Math.round(H * 0.64);
      function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
      function disc(cx, cy, r, c) { R(cx - r, cy - r + 1, 2 * r, 2 * r - 2, c); R(cx - r + 1, cy - r, 2 * r - 2, 2 * r, c); }
      function mound(cx, base, rad, c) { for (var i = 0; i < rad; i++) R(cx - (rad - i), base - i * 2, 2 * (rad - i), 3, c); }
      g.clearRect(0, 0, W, H);
      R(0, 0, W, H, th.sky); R(0, Math.round(H * 0.4), W, H, th.sky2);                         // sky
      if (th.night) { for (var s = 0; s < 22; s++) R((s * 43) % W, (s * 29) % gy, 1, 1, "#fff"); disc(W - 20, 15, 6, "#e7ecff"); R(W - 24, 11, 6, 8, th.sky); }   // stars + crescent moon
      else { disc(W - 20, 15, 7, "#ffe884"); disc(W - 20, 15, 4, "#fff6c8"); }                  // sun
      mound(Math.round(W * 0.28), gy + 2, 8, th.mtn); mound(Math.round(W * 0.62), gy + 2, 10, th.mtn); mound(Math.round(W * 0.46), gy + 2, 7, th.mtnS);   // hills
      if (th.water) { R(0, gy, W, 4, th.water); }
      R(0, gy, W, H - gy, th.grass); R(0, gy + 5, W, H, th.dirt); R(0, gy + 5, W, 2, th.dirtL);  // ground
      var cx = Math.round(W * 0.5);
      if (idx === 0) {                                   // MEADOW — leafy tree + flowers
        R(cx - 2, gy - 15, 5, 15, "#a8632f"); mound(cx, gy - 12, 8, th.h2); mound(cx, gy - 16, 6, th.h1);
        R(cx - 22, gy + 2, 2, 2, "#ff5c8a"); R(cx + 20, gy + 3, 2, 2, "#ffe14a"); R(cx - 30, gy + 4, 2, 2, "#fff");
      } else if (idx === 1) {                            // BEACH — striped parasol on the sand
        var ux = cx + 6; R(ux - 1, gy - 15, 2, 15, "#8a5a2a");                                 // pole
        for (var u = 0; u < 5; u++) { var uw = 5 + u * 4; R(ux - uw / 2, gy - 20 + u, uw, 1.4, u % 2 ? "#fff" : "#ff5c6c"); }   // dome, widening down
        R(ux - 2, gy - 16, 4, 1, "#ff5c6c"); R(ux, gy - 22, 1, 2, "#8a5a2a");                  // tip
        R(cx - 22, gy + 4, 5, 3, "#38b6ff"); R(cx - 20, gy + 3, 2, 2, "#ffe14a");              // little beach ball
      } else if (idx === 2) {                            // CANDY — lollipop swirl
        R(cx, gy - 11, 2, 11, "#fff");                                                         // stick
        disc(cx + 1, gy - 15, 7, "#ff5c9e");                                                   // solid candy
        R(cx - 4, gy - 17, 3, 2, "#ffd23f"); R(cx - 1, gy - 19, 3, 2, "#fff"); R(cx + 2, gy - 15, 3, 2, "#ffd23f"); R(cx - 3, gy - 13, 3, 2, "#fff");   // swirl
        R(cx - 24, gy + 2, 4, 3, "#a06bff"); R(cx + 22, gy + 3, 4, 3, "#4fd06a");              // wrapped candies
      } else if (idx === 3) {                            // OCEAN — a rolling sea with a breaking wave
        var hy = gy - 6;                                                                       // lift the horizon so it's mostly sea
        R(0, hy, W, H, "#2f9fd6"); R(0, hy, W, 3, "#57c8e6");                                   // deep water + bright surface band
        R(8, hy + 9, 12, 2, "#5fd0ee"); R(46, hy + 14, 14, 2, "#5fd0ee"); R(92, hy + 10, 14, 2, "#5fd0ee"); R(26, hy + 19, 10, 2, "#5fd0ee");   // ripples
        var wx = cx - 4;                                                                        // big breaking wave, curling right
        mound(wx, hy + 5, 9, "#2f9fd6"); mound(wx, hy + 2, 7, "#3fbfe0");
        R(wx - 12, hy - 7, 20, 3, "#eafcff"); R(wx - 14, hy - 4, 8, 3, "#ffffff"); R(wx + 5, hy - 9, 9, 3, "#ffffff"); R(wx + 9, hy - 5, 5, 3, "#eafcff");   // foam crest + curl
        R(12, hy - 1, 7, 2, "#eafcff"); R(76, hy - 1, 9, 2, "#eafcff");                         // foam caps
        R(cx + 24, hy - 5, 6, 3, "#ffd23f"); R(cx + 29, hy - 7, 3, 6, "#ffd23f"); R(cx + 23, hy - 4, 1, 1, INK);   // leaping fish
      } else if (idx === 4) {                            // SNOW — snowman + falling flakes
        disc(cx, gy - 4, 5, "#fff"); disc(cx, gy - 12, 4, "#fff"); R(cx - 1, gy - 12, 1, 1, INK); R(cx + 1, gy - 12, 1, 1, INK); R(cx, gy - 10, 1, 1, "#ff8f3f");
        R(cx - 5, gy - 15, 4, 2, INK); R(cx - 4, gy - 18, 2, 3, INK);
        for (var fk = 0; fk < 8; fk++) R((fk * 37 + 6) % W, (fk * 23) % (gy - 4), 2, 2, "#ffffff");
      } else if (idx === 5) {                            // JUNGLE — palm tree
        for (var tr = 0; tr < 6; tr++) R(cx - 2 + tr, gy - 3 - tr * 2.4, 3, 3, "#7a5a2a");
        var pt = cx + 3, py = gy - 17; R(pt - 12, py, 12, 2, "#4aa84a"); R(pt, py - 2, 12, 2, "#357a35"); R(pt - 9, py - 5, 9, 2, "#5abf5a"); R(pt + 1, py - 6, 9, 2, "#4aa84a");
        R(cx - 24, gy + 2, 2, 3, "#ffb020");
      } else if (idx === 6) {                            // VOLCANO — erupting cone
        for (var v = 0; v < 9; v++) R(cx - 11 + v * 1.5, gy - v * 1.8, Math.max(2, 22 - v * 3), 3, v > 6 ? "#8a5a4a" : "#6b4235");
        R(cx - 4, gy - 16, 8, 3, "#ff5a2a"); R(cx - 3, gy - 19, 2, 3, "#ffb020"); R(cx + 2, gy - 20, 2, 4, "#ff5c6c");
        R(cx - 2, gy - 24, 4, 3, "#c9b8c0"); R(cx + 3, gy - 27, 3, 3, "#e0d4da");              // smoke
      } else {                                           // SPACE — rocket + crystals
        R(cx - 2, gy - 18, 5, 12, "#e7ecff"); R(cx - 2, gy - 20, 5, 3, "#ff5c6c"); R(cx - 4, gy - 8, 2, 3, "#8a94a8"); R(cx + 3, gy - 8, 2, 3, "#8a94a8");
        R(cx - 1, gy - 14, 3, 3, "#37e0ff"); R(cx - 1, gy - 5, 3, 3, "#ffb020"); R(cx, gy - 2, 1, 2, "#ffe14a");
        R(cx - 22, gy - 3, 3, 4, "#a06bff"); R(cx + 20, gy - 4, 3, 5, "#5fd0ff");              // crystals
      }
    }
    // Pixel illustration for a "how it plays" step (0 run · 1 gate · 2 miss).
    function drawHowScene(canvas, kind) {
      var g = canvas.getContext("2d"); g.imageSmoothingEnabled = false;
      var W = canvas.width, H = canvas.height, gy = Math.round(H * 0.74), cx = Math.round(W * 0.5);
      function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
      function disc(ox, oy, r, c) { R(ox - r, oy - r + 1, 2 * r, 2 * r - 2, c); R(ox - r + 1, oy - r, 2 * r - 2, 2 * r, c); }
      var HROWS = ["011011", "111111", "111111", "011110", "001100"];
      function heart(x, y, b, c) { for (var ry = 0; ry < HROWS.length; ry++) for (var rx = 0; rx < 6; rx++) if (HROWS[ry].charAt(rx) === "1") R(x + rx * b, y + ry * b, b, b, c); }
      g.clearRect(0, 0, W, H);
      if (kind === 0) {                                                   // RUN — hero dashing across a meadow
        R(0, 0, W, H, "#7fb0ff"); R(0, H * 0.45, W, H, "#a8d0ff"); disc(W - 15, 13, 6, "#fff6c8");
        R(0, gy, W, H, "#7cd04a"); R(0, gy + 5, W, H, "#c9803f"); R(0, gy + 5, W, 2, "#a8632f");
        R(cx - 32, gy - 20, 12, 2, "#ffd23f"); R(cx - 36, gy - 14, 16, 2, "#ffffff"); R(cx - 30, gy - 8, 10, 2, "#ffd23f");   // speed lines
        heroDraw(g, "unicorn", cx - 10, gy - 31, 44, 35, 1, false);
      } else if (kind === 1) {                                            // GATE — a glowing question gate
        R(0, 0, W, H, "#4a3f7a"); R(0, H * 0.45, W, H, "#5a4a9a");
        R(0, gy, W, H, "#352b5e"); R(0, gy + 5, W, H, "#241a4a");
        g.globalAlpha = 0.45; disc(cx, gy - 20, 22, "#ffd23f"); g.globalAlpha = 1;
        R(cx - 20, gy - 40, 6, 40, "#ffd23f"); R(cx + 14, gy - 40, 6, 40, "#ffd23f"); R(cx - 20, gy - 42, 40, 6, "#ffd23f");   // posts + lintel
        R(cx - 20, gy - 40, 6, 40, "#ffd23f"); R(cx - 14, gy - 36, 28, 36, "#241a4a");                                        // doorway
        g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 12px 'DejaVu Sans Mono',ui-monospace,monospace";
        g.fillText("7×8", cx, gy - 24); g.fillStyle = "#ffd23f"; g.fillText("=?", cx, gy - 11);
      } else {                                                            // MISS — one heart lost, quick retry
        R(0, 0, W, H, "#a8d0ff"); R(0, H * 0.45, W, H, "#cfe6ff");
        R(0, gy, W, H, "#7cd04a"); R(0, gy + 5, W, H, "#c9803f");
        heart(cx - 43, gy - 30, 3, "#ff4d6d"); heart(cx - 24, gy - 30, 3, "#ff4d6d"); heart(cx - 5, gy - 30, 3, "#c9c0d6");   // 2 full + 1 empty
        var ax = cx + 26, ay = gy - 15, r = 8;
        for (var a = -1.1; a < 4.2; a += 0.42) R(ax + Math.cos(a) * r - 1.5, ay + Math.sin(a) * r - 1.5, 3, 3, "#3fbf5a");     // retry loop
        R(ax + 4, ay - 11, 4, 2, "#3fbf5a"); R(ax + 7, ay - 9, 2, 4, "#3fbf5a");                                              // arrowhead
      }
    }
    // Compact "Quest Land" map banner for the home hub — the in-game map's look, one serpentine across.
    function drawQuestMap(canvas) {
      var mg = canvas.getContext("2d"); mg.imageSmoothingEnabled = false;
      var W = canvas.width, H = canvas.height, un = Math.max(1, (progress && progress.worldsUnlocked) || 1);
      var R = Math.max(13, Math.round(Math.min(H * 0.28, W / 20))), k = R / 12;
      var topM = H * 0.10, botM = H * 0.30, x0 = W * 0.06, usableW = W * 0.88;
      var cy = (topM + (H - botM)) / 2, ampY = Math.min((H - topM - botM) * 0.5, H * 0.5 - R - 6);
      var nodes = []; for (var j = 0; j < MAXLEVELS; j++) { var tj = MAXLEVELS > 1 ? j / (MAXLEVELS - 1) : 0; nodes.push({ x: Math.round(x0 + tj * usableW), y: Math.round(cy + Math.sin(j * 0.82 + 0.5) * ampY), n: j + 1, theme: THEMES[j % THEMES.length] }); }
      var wg = mg.createLinearGradient(0, 0, 0, H); wg.addColorStop(0, "#3a8fd8"); wg.addColorStop(1, "#1f5fa8"); mg.fillStyle = wg; mg.fillRect(0, 0, W, H);
      mg.fillStyle = "rgba(255,255,255,.12)"; for (var s = 0; s < Math.round(W * H / 1400); s++) mg.fillRect((s * 61) % W, (s * 43) % H, s % 4 ? 2 : 3, 1);
      var pts = []; nodes.forEach(function (p, i) { pts.push([p.x, p.y]); if (i < nodes.length - 1) pts.push([(p.x + nodes[i + 1].x) / 2, (p.y + nodes[i + 1].y) / 2]); });
      function blobs(r, col, dy) { mg.fillStyle = col; pts.forEach(function (pt) { mg.beginPath(); mg.arc(pt[0], pt[1] + (dy || 0), r, 0, 7); mg.fill(); }); }
      blobs(26 * k, "#e2c184"); blobs(24 * k, "#c9a865", 2 * k); blobs(22 * k, "#2f8f3a", 3 * k); blobs(21 * k, "#49ba52"); blobs(14 * k, "#5fce62", -3 * k);
      function road(w, col) { mg.strokeStyle = col; mg.lineWidth = w; mg.lineCap = "round"; mg.lineJoin = "round"; mg.beginPath(); nodes.forEach(function (p, i) { i ? mg.lineTo(p.x, p.y) : mg.moveTo(p.x, p.y); }); mg.stroke(); }
      road(9 * k, "#7a4e26"); road(5 * k, "#d2a45f");
      function rrect(bx, by, w, h, r) { mg.beginPath(); mg.moveTo(bx + r, by); mg.arcTo(bx + w, by, bx + w, by + h, r); mg.arcTo(bx + w, by + h, bx, by + h, r); mg.arcTo(bx, by + h, bx, by, r); mg.arcTo(bx, by, bx + w, by, r); mg.closePath(); }
      var savedX = x; x = mg; var labels = [];
      nodes.forEach(function (p) {
        var open = p.n <= un, done = p.n < un, here = p.n === Math.min(un, MAXLEVELS), gs = R * 0.58;
        mg.save(); rrect(p.x - R, p.y - R, R * 2, R * 2, R * 0.34); mg.clip();
        mg.fillStyle = p.theme.sky; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2);
        mg.fillStyle = p.theme.sky2 || p.theme.sky; mg.fillRect(p.x - R, p.y, R * 2, R);
        mg.fillStyle = p.theme.grass; mg.fillRect(p.x - R, p.y + R - gs, R * 2, gs);
        pxProp(p.theme.prop, p.x, p.y + R - gs, Math.round(R * 1.4), p.theme);
        if (!open) { mg.fillStyle = "rgba(14,18,34,.6)"; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2); }
        mg.restore();
        rrect(p.x - R, p.y - R, R * 2, R * 2, R * 0.34); mg.lineWidth = here ? 3 : 2; mg.strokeStyle = here ? "#ff4fa3" : open ? "#ffffff" : "#59648c"; mg.stroke();
        var br = R * 0.5, bx = p.x + R - br * 0.5, by = p.y - R + br * 0.5;
        mg.beginPath(); mg.arc(bx, by, br, 0, 7); mg.fillStyle = here ? "#ff4fa3" : done ? "#3ad44a" : open ? "#ffd23f" : "#39447a"; mg.fill(); mg.lineWidth = 1.4; mg.strokeStyle = "#101828"; mg.stroke();
        mg.fillStyle = open ? "#101828" : "#cfd6ff"; mg.font = "900 " + Math.round(R * 0.66) + "px monospace"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(p.n, bx, by + 1);
        if (!open) { mg.fillStyle = "#ffd23f"; mg.fillRect(p.x - R * 0.3, p.y - R * 0.06, R * 0.6, R * 0.46); mg.strokeStyle = "#ffd23f"; mg.lineWidth = Math.max(1, R * 0.12); mg.beginPath(); mg.arc(p.x, p.y - R * 0.06, R * 0.23, Math.PI, 0); mg.stroke(); }
        labels.push({ name: p.theme.name, x: p.x, y: p.y + R + R * 0.72, open: open });
      });
      mg.font = "700 " + Math.round(R * 0.5) + "px monospace"; mg.textBaseline = "alphabetic"; mg.textAlign = "center"; mg.lineJoin = "round"; mg.lineWidth = Math.max(2, R * 0.16);
      labels.forEach(function (l) { mg.strokeStyle = "rgba(8,10,20,.92)"; mg.strokeText(l.name, l.x, l.y); mg.fillStyle = l.open ? "#ffffff" : "#c2c9e8"; mg.fillText(l.name, l.x, l.y); });
      x = savedX;
      var cp = nodes[Math.min(un, MAXLEVELS) - 1]; if (cp) heroDraw(mg, (progress && progress.hero) || "unicorn", cp.x - R * 1.05, cp.y - R * 3.05, R * 2.1, R * 1.9, 0, true);
    }
    return { init: advInit, startDaily: startDaily, exitHome: exitHome, startArena: startArena, drawHero: drawHero, drawWorld: drawWorld, drawHowScene: drawHowScene, drawQuestMap: drawQuestMap };
  })();

  /* ---------------- init / wiring ---------------- */
  /* ---------------- arcade splash / title screen ---------------- */
  var Splash = (function () {
    var cv, x, W, H, raf = 0, running = false, t = 0, done = null, flash = 0, stars = [], WORDS = ["TIMES", "TABLE", "HERO"];
    var CH = [
      { body: "#ffffff", d: "#d9c9f2", ac: "#ff3f9a", horn: 1 },   // unicorn
      { body: "#b3bccb", d: "#7a8497", ac: "#ff8fc0" },            // cat
      { body: "#ff8331", d: "#e26a1f", ac: "#fff4e8" },            // fox
      { body: "#b8c2d0", d: "#8f9bb0", ac: "#37e0ff", robo: 1 }    // robot
    ];
    function P(bx, by, bw, bh, c) { x.fillStyle = c; x.fillRect(bx | 0, by | 0, Math.max(1, bw | 0), Math.max(1, bh | 0)); }
    function size() {
      var w = window.innerWidth || 360, h = window.innerHeight || 640;
      H = Math.max(400, Math.min(900, Math.round(h / 1.8))); W = Math.max(200, Math.round(H * w / h));   // track display density (sharper on big screens)
      cv.width = W; cv.height = H; x.imageSmoothingEnabled = false;
      stars = []; for (var i = 0; i < 70; i++) stars.push({ x: (i * 61 + 13) % W, y: (i * 37 + 7) % Math.round(H * 0.78), p: (i % 5) * 0.7, s: i % 7 === 0 ? 2 : 1 });
    }
    function word(w, cy, sc, wobble) {
      var fs = Math.min(Math.round(H * 0.155), Math.floor(W * 0.86 / (w.length * 0.62)));
      x.save(); x.translate(W / 2, cy); x.scale(sc, sc); x.rotate(wobble); x.textAlign = "center"; x.textBaseline = "middle";
      x.font = "900 " + fs + "px ui-monospace, monospace";
      x.fillStyle = "#ff2f8e"; x.fillText(w, 3, fs * 0.09);                                  // magenta drop shadow
      for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) { x.fillStyle = "#241436"; x.fillText(w, ox, oy); }  // dark outline
      x.fillStyle = "#ffd23f"; x.fillText(w, 0, -1); x.fillStyle = "#fff2a8"; x.fillText(w, 0, -Math.round(fs * 0.08) - 1);  // gold + top highlight
      x.restore();
    }
    function chr(c, cx, gy, s, bob) {
      var r = s, by = gy - r * 2 - bob;
      P(cx - r - 1, by - 1, r * 2 + 2, r * 2 + 2, "#241436");                 // outline
      P(cx - r, by, r * 2, r * 2, c.body);
      P(cx - r, by, r * 2, Math.max(1, r * 0.4), c.d === c.body ? c.body : c.d + "");
      if (c.robo) { P(cx - r * 0.5, by + r * 0.5, r, r * 0.5, c.ac); P(cx - 1, by - r * 0.6, 2, r * 0.6, "#ffd23f"); }
      else { P(cx + r * 0.15, by + r * 0.55, Math.max(1, r * 0.5), Math.max(1, r * 0.5), "#241436"); }   // eye
      if (c.ac) P(cx - r * 0.7, by + r * 0.2, Math.max(1, r * 0.5), Math.max(1, r * 0.9), c.ac);          // mane/tuft
      if (c.horn) { P(cx + r * 0.1, by - r * 0.7, 2, Math.round(r * 0.7), "#ffd23f"); }
      P(cx - r * 0.6, gy, Math.max(1, r * 0.5), 3, "#241436"); P(cx + r * 0.2, gy, Math.max(1, r * 0.5), 3, "#241436"); // feet
    }
    function frame() {
      if (!running) return;
      t += 1 / 60;
      // background
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#140b3a"); g.addColorStop(0.55, "#241056"); g.addColorStop(1, "#0a0820");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) { var s = stars[i], a = 0.35 + 0.4 * (Math.sin(t * 2.5 + s.p) * 0.5 + 0.5); x.globalAlpha = a; P(s.x, s.y, s.s, s.s, "#ffffff"); } x.globalAlpha = 1;
      // moon
      x.fillStyle = "#e9e2ff"; x.beginPath(); x.arc(W * 0.82, H * 0.2, H * 0.05, 0, 6.29); x.fill();
      x.fillStyle = "#d3c8f5"; x.beginPath(); x.arc(W * 0.84, H * 0.19, H * 0.012, 0, 6.29); x.fill();
      // ground
      var gy = Math.round(H * 0.82); P(0, gy, W, H - gy, "#3a2f6e"); P(0, gy, W, 3, "#5a4a9a");
      for (var d = 0; d < W; d += 26) P(d, gy + 6, 2, H, "#2a2050");
      // title words pop in with an overshoot bounce, then gently bob
      for (var wI = 0; wI < WORDS.length; wI++) {
        var st = wI * 0.22, lt = t - st, sc, wob = 0;
        if (lt <= 0) continue;
        if (lt < 0.5) { var k = lt / 0.5; sc = k < 0.8 ? (k / 0.8) * 1.18 : 1.18 - ((k - 0.8) / 0.2) * 0.18; }
        else { sc = 1; wob = Math.sin(t * 2 + wI) * 0.02; }
        word(WORDS[wI], Math.round(H * (0.16 + wI * 0.155)), sc, wob);
      }
      // subtitle
      if (t > 0.9) { x.textAlign = "center"; x.textBaseline = "middle"; x.font = "800 " + Math.round(H * 0.045) + "px ui-monospace, monospace"; x.fillStyle = "#37e0ff"; x.fillText("★  QUEST LAND  ★", W / 2, Math.round(H * 0.64)); }
      // bouncing characters on the ground
      if (t > 0.5) { var n = CH.length, sp = W / (n + 1), cs = Math.max(6, Math.round(H * 0.03)); for (var ci = 0; ci < n; ci++) { var bob = Math.abs(Math.sin(t * 4 + ci * 0.9)) * cs * 1.6; chr(CH[ci], Math.round(sp * (ci + 1)), gy, cs, bob); } }
      // blinking prompt
      if (t > 1.1 && Math.floor(t * 1.6) % 2 === 0) { x.textAlign = "center"; x.textBaseline = "middle"; x.font = "800 " + Math.round(H * 0.05) + "px ui-monospace, monospace"; x.fillStyle = "#fff"; x.fillText("▸  TAP TO START  ◂", W / 2, Math.round(H * 0.92)); }
      // footer
      x.textAlign = "center"; x.fillStyle = "#8f86c0"; x.font = "700 " + Math.round(H * 0.026) + "px ui-monospace, monospace"; x.fillText("© 2026  ·  INSERT BRAIN", W / 2, Math.round(H * 0.975));
      // scanlines + flash
      x.globalAlpha = 0.06; for (var y2 = 0; y2 < H; y2 += 3) P(0, y2, W, 1, "#000"); x.globalAlpha = 1;
      if (flash > 0) { x.globalAlpha = Math.min(1, flash); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.globalAlpha = 1; flash -= 1 / 60 * 2.2; }
      raf = requestAnimationFrame(frame);
    }
    function jingle() { if (!soundOn) return; ac(); [392, 523, 659, 784, 1046, 1319, 1568].forEach(function (f, i) { tone(f, 0.14, "square", i * 0.075, 0.12); }); tone(196, 0.6, "triangle", 0, 0.08); }
    function finish() { if (!running) return; running = false; jingle(); flash = 1; try { navigator.vibrate && navigator.vibrate([12, 30, 12]); } catch (e) {} setTimeout(function () { cancelAnimationFrame(raf); window.removeEventListener("resize", size); if (done) done(); }, 360); }
    function start(cb) {
      cv = document.getElementById("splash-c"); if (!cv) { cb(); return; }
      x = cv.getContext("2d"); done = cb; t = 0; flash = 0; running = true;
      show("splash"); size();
      window.addEventListener("resize", size);
      var go = function () { finish(); };
      cv.addEventListener("pointerdown", go);
      document.addEventListener("keydown", function kd(e) { if (e.key === " " || e.key === "Enter") { document.removeEventListener("keydown", kd); go(); } });
      raf = requestAnimationFrame(frame);
    }
    return { start: start };
  })();

  function init() {
    // block iOS pinch-zoom (double-tap zoom is handled by touch-action:manipulation in CSS)
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
    buildLearn();
    buildMulti("#quiz-picker", state.quizTables, function () { $("#quiz-start").disabled = state.quizTables.length === 0; });

    $all("[data-select-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sTap(); var w = btn.getAttribute("data-select-all");
        var arr = w === "quiz" ? state.quizTables : state.practiceTables;
        arr.length = 0; for (var i = 1; i <= MAX; i++) arr.push(i);
        syncPicker(w === "quiz" ? "#quiz-picker" : "#practice-picker", arr);
        $("#" + w + "-start").disabled = false;
      });
    });
    $all("[data-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sTap(); var w = btn.getAttribute("data-clear");
        var arr = w === "quiz" ? state.quizTables : state.practiceTables;
        arr.length = 0; syncPicker(w === "quiz" ? "#quiz-picker" : "#practice-picker", arr);
        $("#" + w + "-start").disabled = true;
      });
    });

    // quiz mode + length segmented
    $all("#quiz-mode .seg__btn").forEach(function (b) {
      b.addEventListener("click", function () { sTap(); $all("#quiz-mode .seg__btn").forEach(function (x) { x.classList.remove("is-on"); }); b.classList.add("is-on"); state.quizMode = b.getAttribute("data-mode"); });
    });
    $all("#quiz-length .seg__btn").forEach(function (b) {
      b.addEventListener("click", function () { sTap(); $all("#quiz-length .seg__btn").forEach(function (x) { x.classList.remove("is-on"); }); b.classList.add("is-on"); state.quizLen = parseInt(b.getAttribute("data-len"), 10); });
    });

    // adventure (8-bit Quest Land) — engine owns its own input + controls
    Adv.init();
    $("#daily-challenge").addEventListener("click", function () { sTap(); ac(); Adv.startDaily(); });

    $("#quiz-start").addEventListener("click", function () { sTap(); ac(); startPlay({ tables: state.quizTables.slice(), len: state.quizLen, mode: state.quizMode, isDaily: false }); });
    // Practice = always a "Surprise Me" mix of games on the kid's tricky facts (no game/table picker)
    $("#practice-weak").addEventListener("click", function () {
      sTap(); ac();
      var wk = weakFacts(15), tbls = []; wk.forEach(function (q) { if (tbls.indexOf(q.a) < 0) tbls.push(q.a); });
      Adv.startArena({ tables: tbls.length ? tbls : focusTables(), len: 12, mode: "mix" });
    });

    $("#play-quit").addEventListener("click", function () { sTap(); renderHome(); show("home"); });
    $("#results-again").addEventListener("click", function () { sTap(); if (state.lastStart) startPlay(state.lastStart); else { renderHome(); show("home"); } });

    // keypad
    $all(".key").forEach(function (k) { k.addEventListener("click", function () { sTap(); keypad(k.getAttribute("data-key")); }); });
    document.addEventListener("keydown", function (e) {
      if (!$(".screen--play").classList.contains("is-active") || !state.play || state.play.mode !== "type") return;
      if (e.key >= "0" && e.key <= "9") keypad(e.key);
      else if (e.key === "Backspace") keypad("del");
      else if (e.key === "Enter") keypad("enter");
    });

    // parent gate
    $("#gate-go").addEventListener("click", function () { sTap(); tryGate(); });
    $("#gate-input").addEventListener("keydown", function (e) { if (e.key === "Enter") tryGate(); });
    $("#goal-minus").addEventListener("click", function () { changeGoal(-5); });
    $("#goal-plus").addEventListener("click", function () { changeGoal(5); });
    $("#focus-all").addEventListener("click", function () { sTap(); setFocus(allTables()); });
    $("#focus-hard").addEventListener("click", function () { sTap(); setFocus([6, 7, 8, 9, 10, 11, 12]); });
    $("#freeze-toggle").addEventListener("click", function () {
      sTap();
      progress.settings.streakFreeze = !(progress.settings.streakFreeze !== false);
      save();
      $("#freeze-toggle").setAttribute("aria-checked", progress.settings.streakFreeze ? "true" : "false");
      renderHome();
    });
    $("#missing-toggle").addEventListener("click", function () {
      sTap();
      progress.settings.missingFactor = !progress.settings.missingFactor;
      save();
      $("#missing-toggle").setAttribute("aria-checked", progress.settings.missingFactor ? "true" : "false");
    });
    $("#rep-practice-weak").addEventListener("click", function () {
      sTap(); ac();
      var wk = weakFacts(15), tbls = []; wk.forEach(function (q) { if (tbls.indexOf(q.a) < 0) tbls.push(q.a); });
      Adv.startArena({ tables: tbls.length ? tbls : focusTables(), len: 12, mode: "mix" });
    });
    $("#reset-progress").addEventListener("click", function () {
      var who = activeProfile(); var nm = who ? who.name : "this player";
      if (window.confirm("Reset " + nm + "'s stars, streaks and progress? This can't be undone.")) {
        progress = freshProgress(); save(); showReport(); renderHome();
      }
    });
    $("#signout-btn").addEventListener("click", function () { sTap(); signOut(); });

    // profiles
    $("#player-switch").addEventListener("click", function () { sTap(); renderProfiles(); show("profiles"); });
    $("#pn-back").addEventListener("click", function () { sTap(); renderProfiles(); show("profiles"); });
    $("#players-add").addEventListener("click", function () { sTap(); openProfileNew(false); });
    $("#pn-name").addEventListener("input", function () { $("#pn-create").disabled = this.value.trim().length === 0; });
    $("#pn-name").addEventListener("keydown", function (e) { if (e.key === "Enter" && this.value.trim()) $("#pn-create").click(); });
    $("#pn-create").addEventListener("click", function () {
      var name = $("#pn-name").value.trim(); if (!name) return; sTap();
      var b = $("#pn-create"), lbl = b.textContent; b.disabled = true; b.textContent = "…";
      addKidRemote(name, newAvatar, function (ok, id) {
        b.textContent = lbl; b.disabled = false;
        if (ok) { setActive(id); renderHome(); show("home"); }
        else { window.alert("Couldn't add that kid — check your connection and try again."); }
      });
    });

    // landing (front door) — buttons wired by data-lp so the hero + final CTA both work
    if (!Auth.enabled) { $all("[data-lp]").forEach(function (b) { b.style.display = "none"; }); }
    $all('[data-lp="create"]').forEach(function (b) { b.addEventListener("click", function () { sTap(); if (Auth.signedIn()) enterApp(); else openSignup(); }); });   // "create/start" plays when already signed in
    $all('[data-lp="signin"]').forEach(function (b) { b.addEventListener("click", function () { sTap(); openSignin(); }); });
    $all('[data-lp="play"]').forEach(function (b) { b.addEventListener("click", function () { sTap(); enterApp(); }); });
    var lso = $("#lp-signout"); if (lso) lso.addEventListener("click", function () { sTap(); signOut(); });

    // sign in
    $("#si-back").addEventListener("click", function () { sTap(); openLanding(); });
    $("#si-email").addEventListener("input", siValidate);
    $("#si-pass").addEventListener("input", siValidate);
    $("#si-email").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#si-pass").focus(); } });
    $("#si-pass").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("#si-go").disabled) siSubmit(); });
    $("#si-go").addEventListener("click", function () { sTap(); siSubmit(); });
    $("#si-forgot").addEventListener("click", function (e) { e.preventDefault(); sTap(); siForgot(); });

    // sign up (parent creds)
    $("#su-back").addEventListener("click", function () { sTap(); openLanding(); });
    ["su-email", "su-pass", "su-pass2"].forEach(function (id) { $("#" + id).addEventListener("input", suValidate); });
    $("#su-pass2").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("#su-next").disabled) suSubmit(); });
    $("#su-next").addEventListener("click", function () { sTap(); suSubmit(); });

    // add kids (signup step 2)
    $("#kids-back").addEventListener("click", function () { sTap(); afterSignedIn(); });
    $("#kid-name").addEventListener("input", function () { $("#kid-add").disabled = this.value.trim().length === 0; });
    $("#kid-name").addEventListener("keydown", function (e) { if (e.key === "Enter" && this.value.trim()) kidAddClick(); });
    $("#kid-add").addEventListener("click", function () { sTap(); kidAddClick(); });
    $("#kids-done").addEventListener("click", function () { sTap(); kidsDone(); });

    // reset password (arrived via email link)
    $("#rp-pass").addEventListener("input", rpValidate);
    $("#rp-pass2").addEventListener("input", rpValidate);
    $("#rp-pass2").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("#rp-go").disabled) rpSubmit(); });
    $("#rp-go").addEventListener("click", function () { sTap(); rpSubmit(); });

    // account settings (change email / password)
    $("#manage-account").addEventListener("click", function () { sTap(); openAccount(); });
    $("#ac-back").addEventListener("click", function () { sTap(); show("parent"); });
    $("#ac-email-go").addEventListener("click", function () { sTap(); acEmailSave(); });
    $("#ac-pass-go").addEventListener("click", function () { sTap(); acPassSave(); });

    // sound
    var st = $("#sound-toggle"); st.textContent = soundOn ? "🔊" : "🔈";
    st.addEventListener("click", function () { soundOn = !soundOn; saveSound(); st.textContent = soundOn ? "🔊" : "🔈"; if (soundOn) { ac(); sTap(); if (window.__adv && window.__adv.resumeMusic) window.__adv.resumeMusic(); } else { musicStop(); } });
    document.addEventListener("touchstart", function once() { ac(); document.removeEventListener("touchstart", once); }, { passive: true });
    var mapT; window.addEventListener("resize", function () { if (document.body.getAttribute("data-screen") === "home") { clearTimeout(mapT); mapT = setTimeout(paintQuestMap, 120); } });

    boot();
  }
  function boot() {
    reg = profilesLoad();
    // A password-reset email link opens the app with a recovery token in the URL → set a new password.
    var hashType = Auth.consumeHash();
    if (hashType === "recovery") { Auth.fetchUser().then(function () { openReset(); }); return; }
    // Automated gameplay tests seed local kids without a session → drop straight into the app.
    if (navigator.webdriver && reg.profiles.length && !Auth.signedIn() && !/landing/.test(location.search)) { enterApp(); return; }
    // Everyone else starts on the landing — it shows a signed-in "Play" state or a signed-out sign-up state.
    openLanding();
    if (Auth.signedIn() && reg.profiles.length) pullAllKids();   // warm the cache so Play is instant for returning families
  }
  // Enter the app proper (from the landing "Play" button, or the automation bypass).
  function enterApp() {
    if (reg.profiles.length) { if (reg.activeId) activeId = reg.activeId; afterSignedIn(); if (Auth.signedIn()) pullAllKids(); }  // cached kids → play now, refresh in bg
    else if (Auth.signedIn()) { pullAllKids(function () { afterSignedIn(); }); }   // signed in on a fresh device → fetch the kids
    else { afterSignedIn(); }
  }
  function deckFromTables(tables) {
    var deck = []; tables.forEach(function (t) { for (var b = 1; b <= MAX; b++) deck.push({ a: t, b: b }); });
    return shuffle(deck);
  }
  function changeGoal(delta) {
    sTap();
    progress.settings.dailyGoal = clamp(progress.settings.dailyGoal + delta, 5, 50);
    save(); $("#goal-value").textContent = progress.settings.dailyGoal; showReport(); renderHome();
  }

  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("service-worker.js").catch(function () {}); });
  }

})();
