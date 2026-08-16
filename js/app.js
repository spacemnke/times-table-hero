/* Times Table Hero — vanilla JS, no build step. v2 (age 10: streaks, XP, badges, parent report). */
(function () {
  "use strict";

  var MAX = 12;
  var STORE_KEY = "tth.progress.v2";     // per-profile: STORE_KEY + "." + profileId
  var PROFILES_KEY = "tth.profiles.v1";
  var SOUND_KEY = "tth.sound.v1";
  var RING_C = 119.38; // 2*pi*19
  var AVATARS = ["🦄", "🐰", "🐱", "🐶", "🦊", "🐨", "🐼", "🐸", "🦁", "🦖", "🐝", "🦋", "🌸", "⭐️", "🚀", "🐙"];

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
    quizMode: "type", quizLen: 15,
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
    return p;
  }
  function pKey(id) { return STORE_KEY + "." + (id || activeId); }
  function loadProgress() {
    if (!activeId) return freshProgress();
    try { var raw = localStorage.getItem(pKey()); if (raw) return normalize(JSON.parse(raw)); } catch (e) {}
    return freshProgress();
  }
  function save() { if (!activeId) return; try { localStorage.setItem(pKey(), JSON.stringify(progress)); } catch (e) {} }
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
    else show(dest);
  }

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

    var goal = progress.settings.dailyGoal, done = (progress.days[dayKey(0)] || {}).q || 0;
    $("#daily-goal").textContent = goal;
    $("#daily-done").textContent = Math.min(done, goal);
    $("#daily-fill").style.width = clamp(done / goal * 100, 0, 100) + "%";
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
      fb.textContent = q.a + " × " + q.b + " = " + answer;
      fb.className = "feedback bad";
      if (p.mode === "type") { $("#answer-box").classList.add("bad"); $("#answer-display").textContent = String(answer); $("#answer-display").classList.remove("placeholder"); }
      else if (btn) { btn.classList.add("is-wrong"); $all(".answer", $("#play-answers")).forEach(function (b) { if (parseInt(b.textContent, 10) === answer) b.classList.add("is-correct"); }); }
      sBad(); haptic([12, 40, 12]);
    }
    if (p.mode === "choose") $all(".answer", $("#play-answers")).forEach(function (b) { b.disabled = true; });

    setTimeout(function () {
      p.i++;
      if (p.i >= p.total) finishPlay();
      else renderQuestion();
    }, correct ? 620 : 1250);
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
    var a = 11 + randInt(9), b = 11 + randInt(9);
    state.gateAnswer = a * b;
    $("#gate-q").textContent = a + " × " + b;
    $("#gate-input").value = ""; $("#gate-err").hidden = true;
    $("#parent-gate").hidden = false; $("#parent-report").hidden = true;
    show("parent");
    setTimeout(function () { $("#gate-input").focus(); }, 300);
  }
  function tryGate() {
    if (parseInt($("#gate-input").value, 10) === state.gateAnswer) {
      state.parentUnlocked = true; $("#parent-gate").hidden = true; showReport();
    } else { $("#gate-err").hidden = false; $("#gate-input").value = ""; }
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

    $("#goal-value").textContent = progress.settings.dailyGoal;
    $("#freeze-toggle").setAttribute("aria-checked", progress.settings.streakFreeze !== false ? "true" : "false");
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

  /* ---------------- profiles UI ---------------- */
  function updatePlayerSwitch() {
    var p = activeProfile();
    $("#ps-av").textContent = p ? p.avatar : "⭐️";
    $("#ps-name").textContent = p ? p.name : "Player";
  }
  function renderProfiles() {
    var grid = $("#profiles-grid"); grid.innerHTML = "";
    reg.profiles.forEach(function (p) {
      // read that profile's streak without disturbing the active one
      var streak = profileStreak(p.id);
      var card = el("button", "pcard");
      card.appendChild(el("span", "pcard__av", p.avatar));
      card.appendChild(el("span", "pcard__name", p.name));
      card.appendChild(el("span", "pcard__meta", streak > 0 ? "🔥 " + streak + " day streak" : "Let's go!"));
      card.addEventListener("click", function () { sTap(); setActive(p.id); renderHome(); show("home"); });
      grid.appendChild(card);
    });
    var add = el("button", "pcard pcard--add");
    add.appendChild(el("span", "pcard__av", "＋"));
    add.appendChild(el("span", "pcard__name", "Add player"));
    add.addEventListener("click", function () { sTap(); openProfileNew(false); });
    grid.appendChild(add);
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
        var v = window.prompt("Rename player:", p.name);
        if (v && v.trim()) { renameProfile(p.id, v.trim()); renderPlayers(); updatePlayerSwitch(); }
      });
      row.appendChild(ren);
      if (reg.profiles.length > 1) {
        var del = el("button", "pm-btn pm-btn--del", "Delete");
        del.addEventListener("click", function () {
          if (window.confirm("Delete " + p.name + " and all their progress? This can't be undone.")) {
            deleteProfile(p.id); renderPlayers(); updatePlayerSwitch(); showReport();
          }
        });
        row.appendChild(del);
      }
      wrap.appendChild(row);
    });
  }

  /* ---------------- ADVENTURE — 8-bit Quest Land (daily quest) ---------------- */
  var Adv = (function () {
    var TEST = /[?&]test=1/.test(location.search);
    var cv, x;                       // canvas + ctx (assigned in advInit)
    var WORLDH = 760, LW = 760, LH = 760, GROUND = 520, HEROX = 150, sx = 0.4, PIXW = 140, PIXH = 300;
    var HEROSIZE = 96, MAXLEVELS = 8, unlocked = 1, HEROTYPE = "unicorn";
    var G = null, level = 1, running = false, looping = false;

    // pixel palettes per theme
    var THEMES = [
      { name: "MEADOW", prop: "tree", sky: "#5c94fc", sky2: "#7fb0ff", cloud: "#ffffff", mtn: "#b8c8f0", mtnS: "#eef4ff", h1: "#57bf3a", h2: "#3a9e2a", grass: "#7cd04a", dirt: "#c9803f", dirtL: "#a8632f" },
      { name: "BEACH", prop: "palm", sky: "#67c8ff", sky2: "#a8e4ff", cloud: "#ffffff", mtn: "#cfe0f5", mtnS: "#ffffff", h1: "#ffe08a", h2: "#f0c860", grass: "#f2df9e", dirt: "#e0b060", dirtL: "#c99640", water: "#3fb0e0" },
      { name: "CANDY", prop: "candy", sky: "#ff9ed6", sky2: "#ffc2e6", cloud: "#fff0f8", mtn: "#ffc2e2", mtnS: "#ffffff", h1: "#ff8ec8", h2: "#ef6aa8", grass: "#ffb0d8", dirt: "#e070a8", dirtL: "#c85890" },
      { name: "OCEAN", prop: "coral", sky: "#39a8d8", sky2: "#7fd0ee", cloud: "#cfeeff", mtn: "#86dccf", mtnS: "#e0fffb", h1: "#3fbfb0", h2: "#2a9a8c", grass: "#57c8ba", dirt: "#2a8a7c", dirtL: "#1f6e62", water: "#2fb6d6" },
      { name: "SNOW", prop: "pine", sky: "#bcd7f2", sky2: "#dcecfb", cloud: "#ffffff", mtn: "#eaf4ff", mtnS: "#ffffff", h1: "#eef6ff", h2: "#d6e6f5", grass: "#f4faff", dirt: "#cfe0f0", dirtL: "#b0c8e0" },
      { name: "JUNGLE", prop: "jungle", sky: "#83d2a4", sky2: "#b0e8c4", cloud: "#d6f0d6", mtn: "#6fc06f", mtnS: "#bfeabf", h1: "#4aa84a", h2: "#357a35", grass: "#5abf5a", dirt: "#7a5a2a", dirtL: "#5a3f1a" },
      { name: "VOLCANO", prop: "rock", sky: "#ff9a6b", sky2: "#ffc2a0", cloud: "#ffd0b0", mtn: "#b5745a", mtnS: "#ffb090", h1: "#8a5a4a", h2: "#6b4235", grass: "#9a5f48", dirt: "#6b4235", dirtL: "#4a2a1a", water: "#ff5a2a" },
      { name: "SPACE", prop: "crystal", sky: "#180f38", sky2: "#2a1a5a", cloud: "#3a2f6e", mtn: "#3a2f6e", mtnS: "#6a5aa8", h1: "#4a3f7a", h2: "#352b5e", grass: "#5a4a9a", dirt: "#352b5e", dirtL: "#241a4a", night: true }
    ];
    var C = { coin: "#ffd23f", coinHi: "#fff2a8", coinLo: "#c9930a", box: "#ffb020", boxHi: "#ffd77a", boxLo: "#c97a00", enemy: "#8b6cf0", enemyD: "#5b3fc0", enemyEye: "#ffffff", enemyPup: "#241a4a", flag: "#ff4fa3", pole: "#dfe4ff", stone: "#9b8bbf", stoneD: "#6a5b9a", lock: "#ffd23f", star: "#ffe14a", castle: "#c8b7e6", castleD: "#9a86cf", door: "#3a2a6a" };
    // free heroes + special unlockable heroes (cost = shiny purple coins collected, each has a power)
    var CHARS = [
      { id: "unicorn", name: "LUNA" }, { id: "cat", name: "PIXEL" }, { id: "fox", name: "RUSTY" },
      { id: "robo", name: "BOLT", cost: 5, power: "heart", note: "+1 HEART" },
      { id: "comet", name: "COMET", cost: 12, power: "jump", note: "SUPER JUMP" },
      { id: "nova", name: "NOVA", cost: 22, power: "star", note: "STARTS SUPER" },
      { id: "draco", name: "DRACO", cost: 35, power: "shield", note: "TRAP SHIELD" },
      { id: "orbit", name: "ORBIT", cost: 50, power: "magnet", note: "COIN MAGNET" }
    ];
    // exclusive heroes found ONLY by discovering a world's hidden path (never purchasable)
    var SECRET_CHARS = {
      2: { id: "shelly", name: "SHELLY", power: "magnet", note: "TREASURE MAGNET", from: "BEACH" }
    };
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
      PIXH = 440; PIXW = Math.max(160, Math.round(PIXH * w / h)); sx = PIXH / LH;   // higher backing res = less blocky
      cv.width = PIXW; cv.height = PIXH;
      x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false;
      if (G && G.hero && G.hero.ground) G.hero.y = GROUND;
    }

    function config(n) {
      return {
        speed: 200 + (n - 1) * 18, pit: 145 + (n - 1) * 26, enemySpeed: 58 + (n - 1) * 16,
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
        deck: buildQuestions(focusTables(), clamp(progress.settings.dailyGoal, 6, 12)), deckI: 0,
        grounds: [], platforms: [], boxes: [], bricks: [], pipes: [], coinsA: [], enemies: [], flags: [], gates: [], star: null, castleX: 0, props: [], flowers: [], traps: [], gemsA: [], powerups: [], fish: [],
        bigT: 0, flyT: 0, meter: 0, popT: 0, popTxt: "", warp: null, chest: null, secretWorld: 0, enterPending: 0, showdown: null, sd: null
      };
      build(cf); buildPmap();
    }
    var SEG = 1500;
    function build(cf) {
      var START = 760, i, seg, gx = []; for (i = 0; i < cf.gates; i++) gx.push(START + i * SEG);
      G.gates = gx.map(function (v) { return { x: v, solved: false }; }); G.castleX = gx[gx.length - 1] + SEG;
      // pits (skip before the first gate so the opening is gentle)
      var pits = []; for (seg = 0; seg < gx.length; seg++) { var base = gx[seg] - SEG; if (base < 200) continue; var pc = base + SEG * 0.55; pits.push([pc, pc + cf.pit]); }
      var lastMid = gx[gx.length - 1] + SEG * 0.5; pits.push([lastMid, lastMid + cf.pit]); pits.sort(function (a, b) { return a[0] - b[0]; });
      var spans = [], cur = -400; pits.forEach(function (p) { spans.push([cur, p[0]]); cur = p[1]; }); spans.push([cur, G.castleX + 700]); G.grounds = spans;
      pits.forEach(function (p) { var mid = (p[0] + p[1]) / 2; for (var k = -2; k <= 2; k++) G.coinsA.push({ x: mid + k * 40, hAbove: 160 - Math.abs(k) * 24, got: false }); });
      // Beach: leaping fish jump out of the water gaps (time your jump past them)
      if (G.theme.name === "BEACH") { pits.forEach(function (p, fi) { if (fi % 1 === 0) G.fish.push({ x: (p[0] + p[1]) / 2, amp: 210, period: 1.5, phase: (fi * 1.7) % 3 }); }); }
      // HIDDEN PATH: a golden warp portal up on a ledge — jump onto it to dive into a secret "World B".
      // Only reachable by a deliberate leap (a coin arc hints the climb); ground-runners sail right past it.
      if (SECRET_CHARS[level]) {
        var wpx = gx[0] - SEG * 0.14;   // in the gentle pit-free opening before the first gate — impossible to miss
        G.platforms.push({ x: wpx - 62, hAbove: 108, w: 124, mv: false, amp: 0, period: 2, phase: 0, warp: true });
        G.warp = { x0: wpx - 60, x1: wpx + 60, top: GROUND - 108, x: wpx, done: false };
        // a coin staircase pointing the way up, and a purple gem teaser at the portal mouth
        for (var wc = 0; wc < 7; wc++) G.coinsA.push({ x: wpx - 190 + wc * 36, hAbove: 36 + wc * 14, got: false });
        G.gemsA.push({ x: wpx, hAbove: 150, got: false });
      }
      // Slingshot Showdown mini-boss barricades, sprinkled through several worlds (a fun break from the keypad)
      if (SHOWDOWN_WORLDS[level] && gx.length >= 3) G.showdown = { x: gx[1] + SEG * 0.30, done: false };
      // SMB-density: pack each gate-segment with several set-pieces (a feature roughly every screen)
      for (seg = 0; seg < gx.length; seg++) {
        var b = gx[seg] - SEG; if (b <= 200) continue;
        fillSegment(b, seg, cf);
      }
      // keep a clean pocket around the secret portal so it stands out
      if (G.warp) { var wl = G.warp.x0 - 50, wr = G.warp.x1 + 50, clr = function (arr) { return arr.filter(function (o) { return (o.x + (o.w || 40)) < wl || o.x > wr; }); }; G.boxes = clr(G.boxes); G.bricks = clr(G.bricks); G.pipes = clr(G.pipes); }
      // signature trap per world — first two zones always trapped so every run meets one early; a 2nd appears deeper
      for (seg = 1; seg < gx.length; seg++) {
        var bt = gx[seg] - SEG; if (bt <= 200) continue;
        if (seg <= 2 || Math.random() < cf.trapChance) G.traps.push({ x: bt + SEG * 0.34, type: pick(cf.trapPool), done: false, sprung: false });
        if (level >= 3 && Math.random() < cf.trapChance - 0.3) G.traps.push({ x: bt + SEG * 0.80, type: pick(cf.trapPool), done: false, sprung: false });
      }
      // shiny purple coins: rare, placed high so you must jump for them
      for (seg = 1; seg < gx.length; seg++) { if (seg % 2 === 0 && Math.random() < cf.gemChance) G.gemsA.push({ x: gx[seg] - SEG * 0.72, hAbove: 300 + (seg % 3) * 22, got: false }); }
      if (!G.gemsA.length) G.gemsA.push({ x: gx[Math.min(1, gx.length - 1)] - SEG * 0.72, hAbove: 320, got: false });
      var mid2 = Math.floor(gx.length / 2); G.star = { x: gx[mid2] - SEG * 0.2, hAbove: 170, taken: false };
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
    // ---- power-up sounds (each instance gets its own voice) ----
    function aGrow() { for (var i = 0; i < 7; i++) tone(196 + i * 70, .08, "square", i * .05, .1); tone(147, .22, "square", .36, .12); }   // magnifying "grow" sweep
    function aShrink() {[659, 523, 415, 330, 247].forEach(function (f, i) { tone(f, .08, "square", i * .05, .1); }); }                     // shrink (reverse)
    function aWings() {[523, 659, 587, 784, 698, 988].forEach(function (f, i) { tone(f, .07, "triangle", i * .045, .09); }); }             // airy flutter up
    function aHeart() { tone(659, .12, "sine", 0, .1); tone(988, .18, "sine", .1, .09); tone(784, .12, "sine", .22, .07); }                // warm chime
    function aBlast() {[880, 1175, 1568].forEach(function (f, i) { tone(f, .09, "square", i * .04, .09); }); tone(2093, .12, "sine", .12, .07); } // answer-blast (planned)
    function aFrost() {[1568, 1319, 1047, 1319, 1568].forEach(function (f, i) { tone(f, .07, "triangle", i * .05, .08); }); }              // frost/ice (planned)
    // warp dive: a rising shimmer that whooshes up as the hero spirals into the portal
    function aWarp() { for (var i = 0; i < 8; i++) tone(440 + i * 90, .07, "triangle", i * .045, .09); tone(1400, .18, "sine", .38, .08); }
    // secret arrival: a soft magical bell chord (distinct, dreamy — different from the world SFX)
    function aSecret() {[659, 988, 1319, 1568].forEach(function (f, i) { tone(f, .5, "triangle", i * .09, .09); }); tone(494, .7, "sine", 0, .05); }

    /* ---- input ---- */
    function jump() {
      if (!G || G.state !== "run") return; var h = G.hero, v1 = G.jumpBoost ? -1180 : -1020, v2 = G.jumpBoost ? -1060 : -900;
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
      if (parseInt(G.input, 10) === G.question.a * G.question.b) submit(G.question.a * G.question.b);
    }
    function addCoins(n) { G.coins += n; progress.coins = (progress.coins || 0) + n; }
    function submit(v) { if (G.state === "trapped") { escapeSubmit(v); return; }
      var q = G.question, ans = q.a * q.b, ms = Date.now() - G.qStart, correct = v === ans, box = $("#adv-mabox");
      var justMet = recordAnswer(q.a, q.b, correct, ms); if (justMet) G.goalMet = true;
      if (correct) {
        box.className = "good"; aGood(); haptic(12);
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
        G.wrong++; G.combo = 0; G.meter = 0; G.hearts--; box.className = "bad"; aBad(); haptic([10, 40, 10]); G.shakeT = .35; G.input = ""; mdisp(); save();
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
        G.wrong++; G.hearts--; box.className = "bad"; aBad(); haptic([12, 50, 12]); G.shakeT = .4; G.input = ""; mdisp(); save();
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
    function platTop(p) { var ha = p.mv ? p.hAbove + Math.sin(G.t * 2 * Math.PI / p.period + p.phase) * p.amp : p.hAbove; return GROUND - ha; }
    function nextQ() { var d = G.deck; if (!d.length) return { a: 2, b: 2 }; var q = d[G.deckI % d.length]; G.deckI++; return q; }

    function hideAllOv() { ["adv-mapOv", "adv-winOv", "adv-failOv"].forEach(function (id) { $("#" + id).classList.add("hidden"); }); }
    function openOv(id) { hideAllOv(); $("#" + id).classList.remove("hidden"); hudShow(false); mathHide(); }
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
          var sp = G.speed * (1 + G.dash); G.dash = Math.max(0, G.dash - dt * 1.6); h.wx += sp * dt; h.run += dt * sp * .03;
          if (G.flyT > 0) { h.vy += (h.hold ? -1500 : 950) * dt; if (h.vy < -320) h.vy = -320; if (h.vy > 440) h.vy = 440; } else { var g = (h.hold && h.vy < 0) ? 1500 : 2700; h.vy += g * dt; }
          if (h.coyote > 0) h.coyote -= dt; if (h.inv > 0) h.inv -= dt; if (h.power > 0) h.power = Math.max(0, h.power - dt); if (G.bigT > 0) G.bigT -= dt; if (G.flyT > 0) G.flyT -= dt; if (G.popT > 0) G.popT -= dt;
          var ny = h.y + h.vy * dt, landTop = null;
          for (var i = 0; i < G.platforms.length; i++) { var p = G.platforms[i]; var top = platTop(p); if (h.wx >= p.x && h.wx <= p.x + p.w && h.vy >= 0 && h.y <= top + 4 && ny >= top) { if (landTop === null || top < landTop) landTop = top; } }
          for (var bi2 = 0; bi2 < G.bricks.length; bi2++) { var brk2 = G.bricks[bi2]; if (brk2.used) continue; var bt2 = GROUND - brk2.hAbove; if (h.wx >= brk2.x && h.wx <= brk2.x + brk2.w && h.vy >= 0 && h.y <= bt2 + 4 && ny >= bt2) { if (landTop === null || bt2 < landTop) landTop = bt2; } }
          for (var pi2 = 0; pi2 < G.pipes.length; pi2++) { var pp2 = G.pipes[pi2]; var ptp2 = GROUND - pp2.h; if (h.wx >= pp2.x - 2 && h.wx <= pp2.x + pp2.w + 2 && h.vy >= 0 && h.y <= ptp2 + 4 && ny >= ptp2) { if (landTop === null || ptp2 < landTop) landTop = ptp2; } }
          if (landTop === null) { if ((groundAt(h.wx) || TEST) && h.vy >= 0 && ny >= GROUND && h.y <= GROUND + 4) landTop = GROUND; }
          if (landTop !== null) { h.y = landTop; h.vy = 0; h.ground = true; h.dbl = false; h.coyote = .1; } else { if (h.ground) h.coyote = .1; h.ground = false; h.y = ny; }
          // secret warp: just jump while under the golden portal and it pulls you in (very forgiving — no precise landing)
          if (G.warp && !G.warp.done && !h.ground && h.wx > G.warp.x0 && h.wx < G.warp.x1) { G.warp.done = true; startWarp(level); }
          var headY = h.y - HEROSIZE * 0.9;
          for (var b = 0; b < G.boxes.length; b++) { var bx = G.boxes[b]; if (bx.used) continue; var by = GROUND - bx.hAbove; if (h.vy < 0 && h.wx >= bx.x - 8 && h.wx <= bx.x + bx.w + 8 && headY <= by + bx.h && headY >= by - 12) { bx.used = true; bx.pop = .2; h.vy = 80; if (bx.power) { spawnPowerup(bx.x + bx.w / 2, by - 20); } else { addCoins(1); aCoin(); G.particles.push({ wx: bx.x + bx.w / 2, y: by - 14, vx: 0, vy: -220, life: .7, kind: "coin" }); } } }
          for (var bkr = 0; bkr < G.bricks.length; bkr++) { var bk = G.bricks[bkr]; if (bk.used) continue; var bky = GROUND - bk.hAbove; if (h.vy < 0 && h.wx >= bk.x - 8 && h.wx <= bk.x + bk.w + 8 && headY <= bky + bk.h && headY >= bky - 12) { if (G.bigT > 0) { bk.used = true; aStomp(); coinBurst(bk.x + bk.w / 2, bky); } else { h.vy = 80; if (!bk.tapped) { bk.tapped = true; addCoins(1); aCoin(); } } } }
          // pipes: the hero auto-bounds over them (kid-friendly — you can also jump early to land on top for coins)
          for (var pbk = 0; pbk < G.pipes.length; pbk++) { var pz = G.pipes[pbk]; if (h.ground && h.wx > pz.x - 70 && h.wx < pz.x - 22) { jump(); } }
          if (G.star && !G.star.taken) { var syv = GROUND - G.star.hAbove; if (Math.abs(G.star.x - h.wx) < 50 && Math.abs(syv - (h.y - 40)) < 66) { G.star.taken = true; h.power = 6.5; aStar(); haptic([12, 30, 12]); } }
          var mag = h.power > 0 || G.magnet;
          for (var k = 0; k < G.coinsA.length; k++) { var co = G.coinsA[k]; if (co.got) continue; var cy = GROUND - co.hAbove; var dx = co.x - h.wx, dy = cy - (h.y - 40); if (mag && Math.abs(dx) < 300 && Math.abs(dy) < 300) { co.x -= dx * Math.min(1, dt * 9); co.hAbove += dy * Math.min(1, dt * 9); } if (Math.abs(co.x - h.wx) < 38 && Math.abs((GROUND - co.hAbove) - (h.y - 40)) < 54) { co.got = true; addCoins(1); aCoin(); } }
          for (var e = 0; e < G.enemies.length; e++) { var en = G.enemies[e]; if (!en.alive) continue; en.x += en.dir * G.cf.enemySpeed * dt; if (en.x < en.x1) { en.x = en.x1; en.dir = 1; } if (en.x > en.x2) { en.x = en.x2; en.dir = -1; } var eTop = GROUND - 52; if (Math.abs(en.x - h.wx) < 40) { if (h.power > 0 || G.bigT > 0) { en.alive = false; addCoins(3); aStomp(); coinBurst(en.x, eTop); } else if (h.vy > 0 && h.y <= eTop + 22 && h.y >= eTop - 40) { en.alive = false; h.vy = -620; addCoins(3); aStomp(); haptic(15); coinBurst(en.x, eTop); } else if (!TEST && h.inv <= 0 && h.y > eTop - 28) { hurt(); } } }
          // shiny purple coins (magnetised while super)
          for (var gm = 0; gm < G.gemsA.length; gm++) { var ge = G.gemsA[gm]; if (ge.got) continue; var gyv = GROUND - ge.hAbove; var gdx = ge.x - h.wx, gdy = gyv - (h.y - 40); if (mag && Math.abs(gdx) < 320 && Math.abs(gdy) < 320) { ge.x -= gdx * Math.min(1, dt * 8); ge.hAbove += gdy * Math.min(1, dt * 8); } if (Math.abs(ge.x - h.wx) < 42 && Math.abs((GROUND - ge.hAbove) - (h.y - 40)) < 60) { ge.got = true; progress.gems = (progress.gems || 0) + 1; G.gemRun++; aStar(); haptic([10, 20, 10]); coinBurst(ge.x, GROUND - ge.hAbove); save(); } }
          // traps: run into one on the ground and you're caught (jump over to dodge; smash through while super)
          for (var tp = 0; tp < G.traps.length; tp++) { var trp2 = G.traps[tp]; if (trp2.done) continue; if (Math.abs(trp2.x - h.wx) < 34 && h.y > GROUND - 26) { if (h.power > 0 || G.bigT > 0) { trp2.done = true; addCoins(2); aStomp(); coinBurst(trp2.x, GROUND - 40); } else if (G.shield) { G.shield = false; trp2.done = true; h.inv = 1.2; aStar(); haptic([10, 30, 10]); coinBurst(trp2.x, GROUND - 40); hint("SHIELD SAVED YOU!"); } else if (!TEST) { springTrap(tp); break; } } }
          for (var fsh = 0; fsh < G.fish.length; fsh++) { var fz = G.fish[fsh]; var fph = Math.sin((G.t / fz.period + fz.phase) * Math.PI * 2); if (fph > 0) { var ffy = GROUND - fph * fz.amp; if (!TEST && h.inv <= 0 && h.power <= 0 && G.bigT <= 0 && Math.abs(fz.x - h.wx) < 42 && Math.abs(ffy - (h.y - 40)) < 52) hurt(); } }
          for (var f = 0; f < G.flags.length; f++) { var fl = G.flags[f]; if (!fl.hit && h.wx >= fl.x) { fl.hit = true; G.lastCP = fl.x; aFlag(); } }
          if (G.chest && !G.chest.taken && Math.abs(G.chest.x - h.wx) < 46) { G.chest.taken = true; aWin(); haptic([12, 30, 12]); for (var cg = 0; cg < 10; cg++) G.particles.push({ wx: G.chest.x, y: GROUND - 40, vx: (cg - 5) * 60, vy: -260 - cg * 12, life: 1, kind: "star" }); }
          if (h.y > GROUND + 420) respawn();
          if (G.showdown && !G.showdown.done && h.wx >= G.showdown.x) { if (TEST) G.showdown.done = true; else { enterShowdown(); } }
          if (G.nextGate < G.gates.length) { var ga = G.gates[G.nextGate]; if (!ga.solved && h.wx >= ga.x - 52) { h.wx = ga.x - 52; arrive(); } } else if (h.wx >= G.castleX - 80) { if (G.secretWorld) winSecret(); else win(); }
          if (h.power > 0 && Math.random() < .5) sparkle(h.wx, h.y - HEROSIZE * 0.4);
        }
        if (G.state === "showdown") sdStep(dt);
        if (G.state === "warping") warpStep(dt);
        for (var f2 = 0; f2 < G.flags.length; f2++) { var fg = G.flags[f2]; if (fg.hit && fg.raise < 1) fg.raise = Math.min(1, fg.raise + dt * 3); }
        for (var p2 = G.particles.length - 1; p2 >= 0; p2--) { var pt = G.particles[p2]; pt.wx += pt.vx * dt; pt.vy += 1600 * dt; pt.y += pt.vy * dt; pt.life -= dt * 1.1; if (pt.life <= 0) G.particles.splice(p2, 1); }
        if (G.shakeT > 0) G.shakeT -= dt; if (G.state !== "warping" || warpFX && warpFX.phase === "hop") G.cam = G.hero.wx - HEROX; draw(); drawWarpFX(); hudUpdate();
      }
      requestAnimationFrame(frame);
    }
    function hurt() { if (G.bigT > 0) { G.bigT = 0; G.hero.inv = 1.3; G.shakeT = .25; aShrink(); haptic(20); showPow("SHRANK!"); return; } G.hearts--; G.hero.inv = 1.3; G.hero.vy = -460; G.shakeT = .3; aHurt(); haptic([12, 40, 12]); if (G.hearts <= 0) { G.state = "fail"; musicStop(); openOv("adv-failOv"); } }
    // ---- power-ups (from ? boxes and the math-streak meter) ----
    function showPow(t) { G.popTxt = t; G.popT = 1.7; hint(t); }
    function spawnPowerup(px, py) { var r = Math.random(); applyPowerup(r < 0.4 ? "berry" : r < 0.65 ? "wings" : r < 0.85 ? "heart" : "star"); G.particles.push({ wx: px, y: py, vx: 0, vy: -170, life: .9, kind: "star" }); }
    function applyPowerup(kind) {
      var h = G.hero;
      if (kind === "berry") { G.bigT = 8; showPow("POWER BERRY — BIG!"); aGrow(); }
      else if (kind === "wings") { G.flyT = 5; showPow("SKY WINGS — FLY!"); aWings(); }
      else if (kind === "heart") { G.hearts = Math.min(G.maxHearts, G.hearts + 1); showPow("EXTRA HEART!"); aHeart(); }
      else { h.power = 6.5; showPow("STREAK STAR — GO!"); aStar(); }
      haptic([10, 25, 10]);
    }
    function respawn() { var h = G.hero; h.wx = G.lastCP; h.y = GROUND; h.vy = 0; h.inv = 1; h.ground = true; }
    function arrive() { G.state = "gate"; G.question = nextQ(); G.input = ""; G.qStart = Date.now(); mdisp(); $("#adv-mq").textContent = G.question.a + " × " + G.question.b; mathShow(); hint(""); }
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
        cf: mainG.cf, theme: SECRET_THEME, state: "run", cam: 0, speed: 190, t: 0,
        maxHearts: mainG.maxHearts, hearts: keepH, coins: 0, gemRun: 0, nextGate: 0,
        power: mainG.power, jumpBoost: mainG.jumpBoost, shield: mainG.shield, magnet: mainG.magnet,
        hero: { wx: HEROX, y: GROUND, vy: 0, ground: true, hold: false, dbl: false, coyote: 0, inv: 1, power: mainG.magnet ? 0 : 0, run: 0 },
        question: null, input: "", lastCP: HEROX, particles: [], cloud: 0, shakeT: 0, dash: 0, qStart: 0,
        correct: 0, wrong: 0, combo: 0, xpEarned: 0, goalMet: false, levelBefore: levelFromXp(progress.xp), trapIndex: -1,
        deck: buildQuestions(focusTables(), 3), deckI: 0,
        grounds: [], platforms: [], boxes: [], bricks: [], pipes: [], coinsA: [], enemies: [], flags: [], gates: [], star: null, castleX: 0, props: [], flowers: [], traps: [], gemsA: [], powerups: [], fish: [],
        bigT: 0, flyT: 0, meter: 0, popT: 0, popTxt: "", warp: null, chest: null, secretWorld: worldN, enterPending: 0, returnTo: { g: mainG, x: retX }
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
    var SHOWDOWN_WORLDS = { 1: 1, 3: 1, 5: 1, 7: 1 };   // worlds that carry a slingshot barricade
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
      var gy = FY(GROUND), q = nextQ();
      var shp = SD_SHAPES[Math.floor(Math.random() * SD_SHAPES.length)], dim = sdDims(shp);
      // size the arena to the ACTUAL viewport; keep a WIDE left zone so there's room to pull the slingshot back
      var rightM = Math.round(PIXW * 0.03), slingZone = Math.round(PIXW * 0.42), availW = PIXW - slingZone - rightM;
      var topReserve = Math.round(PIXH * 0.22), availH = gy - topReserve;
      var cs = Math.max(14, Math.floor(Math.min(PIXH * 0.12, availW / dim.cols, availH / Math.max(dim.rows, 2))));  // smaller boxes
      var ox = PIXW - rightM - dim.cols * cs;
      var slingX = Math.min(ox - Math.round(cs * 1.4), Math.max(Math.round(cs * 1.7) + SZ(6), Math.round(PIXW * 0.24)));
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
        sd.it += dt; if (sd.it > 3.4) { sd.phase = "aim"; sdReload(sd); }
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
    function sdDown(e) { var sd = G.sd; if (!sd) return; if (sd.phase === "intro") { if (sd.it > 1.7) { sd.phase = "aim"; sdReload(sd); } return; } if (sd.phase !== "aim") return; var p = sdPos(e); if (Math.hypot(p.x - sd.ball.x, p.y - sd.ball.y) < sd.cs * 1.4) sd.dragging = true; }
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
      x.fillStyle = e.mat === "ice" ? "#0a3352" : "#241406"; x.font = "800 " + Math.round(h * 0.44) + "px monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(e.val), e.x + w/2, e.y + h/2 + 1);
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
      var bw = Math.min(W - SZ(6), Math.max(SZ(100), qw + SZ(20))), bh = Math.round(pf * 1.7), bx = W / 2 - bw / 2, by = SZ(6);
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
      if (sd.demo) { for (var t3 = 0; t3 < sd.demo.trail.length; t3++) { var dp = sd.demo.trail[t3]; x.globalAlpha = (t3 / sd.demo.trail.length) * 0.4; x.fillStyle = "#ffd23f"; x.beginPath(); x.arc(dp.x, dp.y, sd.demo.r * 0.5, 0, 6.29); x.fill(); } x.globalAlpha = 1; sdBall2(sd.demo, sd.demo.r, true); }
      // intro labels
      if (sd.phase === "intro") { var cy2 = sd.it % 1.7; var lab = cy2 < 0.9 ? "① DRAG THE HERO BACK" : cy2 < 1.35 ? "② AIM WITH THE ARC" : "③ LET GO TO FIRE!"; var lf = Math.max(9, Math.round(Math.min(H * 0.042, W * 0.052))); x.textAlign = "center"; x.font = "800 " + lf + "px monospace"; var lmw = x.measureText(lab).width; if (lmw > W * 0.92) { lf = Math.max(8, Math.floor(lf * (W * 0.92) / lmw)); x.font = "800 " + lf + "px monospace"; lmw = x.measureText(lab).width; } var lw = Math.min(W - SZ(6), lmw + SZ(18)), lh = Math.round(lf * 1.9), ly = Math.round(H * 0.19); x.fillStyle = "rgba(10,8,26,.9)"; x.fillRect(W/2 - lw/2, ly, lw, lh); x.strokeStyle = "#ffd23f"; x.lineWidth = 2; x.strokeRect(W/2 - lw/2, ly, lw, lh); x.textBaseline = "middle"; x.fillStyle = "#ffd23f"; x.fillText(lab, W/2, ly + lh/2 + 1); x.textBaseline = "alphabetic"; var subL = sd.it > 1.7 ? "TAP TO SKIP" : "WATCH…"; x.fillStyle = "#9aa0c8"; x.font = "800 " + Math.max(8, Math.round(H * 0.024)) + "px monospace"; x.fillText(subL, W/2, ly + lh + SZ(14)); if (sd.ball && cy2 < 1.35) { x.strokeStyle = "rgba(255,255,255,.9)"; x.lineWidth = 3; x.beginPath(); x.arc(sd.ball.x, sd.ball.y, sd.ball.r + SZ(6) + Math.sin(sd.it*10)*2, 0, 6.29); x.stroke(); var fnx = sd.ball.x + SZ(10), fny = sd.ball.y + SZ(10); x.fillStyle = "#ffe27a"; x.fillRect(fnx, fny, SZ(4), SZ(10)); x.fillRect(fnx - SZ(3), fny + SZ(2), SZ(4), SZ(6)); } }
      // message
      if (sd.msgT > 0 && sd.msg) { x.textAlign = "center"; x.font = "800 " + Math.round(H*0.04) + "px monospace"; var mw = x.measureText(sd.msg).width + SZ(24); x.fillStyle = "rgba(10,8,26,.85)"; x.fillRect(W/2 - mw/2, gY - SZ(64), mw, SZ(36)); x.fillStyle = /CLEARED|BONUS/.test(sd.msg) ? "#3ad46a" : /BOOM|KABOOM/.test(sd.msg) ? "#ff5c6c" : "#ffd23f"; x.fillText(sd.msg, W/2, gY - SZ(40)); }
      if (sd.phase === "won") { x.textAlign = "center"; x.fillStyle = "#3ad46a"; x.font = "800 " + Math.round(H*0.03) + "px monospace"; x.fillText("▶ HERO BREAKS THROUGH", W/2, gY + SZ(28)); }
      x.restore();
    }

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
      shelly: { rows: ["...r......r..", "...W......W..", "...e......e..", ".ccRRRRRRcc..", "cccRRRRRRccc.", ".ccRRRRRRcc..", "..RRRhRRRR...", "..RRRRRRRR...", ".R.R.RR.R.R..", "R..R.RR.R..R.", ".............", "............."], map: { R: "#ff5a44", r: "#d63626", c: "#ff8360", W: "#ffffff", e: "#2a1010", h: "#ffd23f" } }
    };
    var heroBuf = document.createElement("canvas"); heroBuf.width = 14; heroBuf.height = 12; var hbx = heroBuf.getContext("2d");
    function drawHeroPix(g, bx, by, B, type) { var H = HERO_MAP[type] || HERO_MAP.unicorn; hbx.clearRect(0, 0, 14, 12); spr(hbx, 0, 0, H.rows, H.map); g.imageSmoothingEnabled = false; g.drawImage(heroBuf, 0, 0, 14, 12, bx, by, 14 * B, 12 * B); }

    function draw() {
      if (G.state === "showdown" && G.sd) { sdDraw(); return; }
      var th = G.theme, W = PIXW, H = PIXH, gY = FY(GROUND);
      var shX = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0, shY = G.shakeT > 0 ? (Math.random() * 2 - 1) * 2 : 0;
      x.save(); x.translate(shX, shY);
      P(-2, -2, W + 4, H * 0.6 + 2, th.sky); P(-2, H * 0.55, W + 4, H, th.sky2);
      if (th.night) { for (var st = 0; st < 40; st++) { P((st * 61) % W, (st * 37) % (gY - 20), 1, 1, "#fff"); } }
      var sunx = Math.round(W * 0.8), suny = Math.round(H * 0.16);
      if (!th.night) { for (var rr = 0; rr < 8; rr++) { var a = rr * Math.PI / 4; P(sunx + Math.round(Math.cos(a) * 14) - 1, suny + Math.round(Math.sin(a) * 14) - 1, 3, 3, "#ffe06a"); } disc(sunx, suny, 9, "#ffe06a"); disc(sunx, suny, 6, "#fff2a8"); }
      else { disc(sunx, suny, 8, "#f2eeff"); }
      for (var i = 0; i < 9; i++) { var sp2 = i % 2 ? 0.10 : 0.04, cyp = Math.round(H * (0.06 + ((i * 0.37) % 1) * 0.42)), cxp = ((i * 58 - (G.cam * sp2 + G.cloud * .4)) % (W + 50)); if (cxp < -40) cxp += W + 50; pxCloud(cxp, cyp, th.cloud); }
      pxMountains(th, gY);
      pxHills(G.cam * .35, gY - SZ(70), th.h1); pxHills(G.cam * .6, gY - SZ(24), th.h2);
      var PIER = th.name === "BEACH";
      if (PIER) { P(-2, gY + SZ(4), W + 4, H - gY, th.water); var wsh = (G.t * 22) % SZ(10); for (var wr = gY + SZ(9); wr < H; wr += SZ(11)) for (var wc = -SZ(10); wc < W; wc += SZ(10)) P(wc + wsh, wr + Math.round(Math.sin((wc + G.t * 40) * 0.05) * SZ(1)), SZ(4), 1, "#bdeeff"); }
      for (var s = 0; s < G.grounds.length; s++) {
        var sp = G.grounds[s]; var gx1 = FX(sp[0]), gx2 = FX(sp[1]); if (gx2 < -4 || gx1 > W + 4) continue;
        if (PIER) {
          var dkH = SZ(15);
          for (var ps = Math.floor(sp[0] / 150) * 150; ps < sp[1]; ps += 150) { var pxp = FX(ps); if (pxp > gx1 + SZ(4) && pxp < gx2 - SZ(4)) { P(pxp, gY + dkH, SZ(5), H, "#7a4a24"); P(pxp + SZ(5), gY + dkH, SZ(1), H, "#5c3418"); } }
          P(gx1, gY, gx2 - gx1, dkH, "#c78a48"); P(gx1, gY, gx2 - gx1, SZ(4), "#e2ac66"); P(gx1, gY + dkH - SZ(2), gx2 - gx1, SZ(2), "#8a5a2a");
          for (var pk = Math.floor(sp[0] / 44) * 44; pk < sp[1]; pk += 44) { var pl2 = FX(pk); if (pl2 > gx1 && pl2 < gx2) P(pl2, gY, 1, dkH, "#9a6636"); }
        } else {
          P(gx1, gY, gx2 - gx1, H - gY + 4, th.dirt); P(gx1, gY, gx2 - gx1, SZ(8), th.grass);
          for (var d = Math.floor(sp[0] / 60) * 60; d < sp[1]; d += 60) { var dl = FX(d); if (dl > gx1 && dl < gx2) P(dl, gY + SZ(8), 1, H, th.dirtL); }
        }
      }
      if (th.water && !PIER) { for (var s2 = 0; s2 < G.grounds.length - 1; s2++) { var wa = FX(G.grounds[s2][1]), wb = FX(G.grounds[s2 + 1][0]); if (wb < -4 || wa > W + 4) continue; P(wa, gY + SZ(4), wb - wa, H, th.water); for (var wv = wa; wv < wb; wv += 6) P(wv + ((G.t * 20) % 6), gY + SZ(6), 3, 1, "#ffffff"); } }
      for (var tr = 0; tr < G.props.length; tr++) { var t2 = G.props[tr]; var tx = FX(t2.x * 1); if (tx < -30 || tx > W + 30) continue; if (groundAt(t2.x)) pxProp(th.prop, tx, gY, SZ(t2.s), th); }
      for (var p = 0; p < G.platforms.length; p++) { var pl = G.platforms[p]; var px = FX(pl.x), pw = SZ(pl.w); if (px > W + 8 || px + pw < -8) continue; var ptp = FY(platTop(pl)); P(px, ptp, pw, SZ(18), "#a9713f"); P(px, ptp, pw, SZ(5), th.h1); P(px, ptp + SZ(14), pw, SZ(4), "#7a4a24"); }
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
      for (var e2 = 0; e2 < G.enemies.length; e2++) { var en = G.enemies[e2]; if (!en.alive) continue; var exs = FX(en.x); if (exs > W + 8 || exs < -8) continue; pxEnemy(exs, gY, en.dir); }
      for (var fshr = 0; fshr < G.fish.length; fshr++) { var fz2 = G.fish[fshr]; var fph2 = Math.sin((G.t / fz2.period + fz2.phase) * Math.PI * 2); if (fph2 <= -0.15) continue; var fxs = FX(fz2.x); if (fxs < -20 || fxs > W + 20) continue; pxFish(fxs, FY(GROUND - Math.max(0, fph2) * fz2.amp), fph2, fph2 >= 0.9 ? 0 : (Math.cos((G.t / fz2.period + fz2.phase) * Math.PI * 2) > 0 ? 1 : -1)); }
      for (var tpi = 0; tpi < G.traps.length; tpi++) { var trp3 = G.traps[tpi]; if (trp3.done) continue; var txs = FX(trp3.x); if (txs > W + 24 || txs < -24) continue; pxTrap(trp3.type, txs, gY, G.t + trp3.x * 0.01, trp3.sprung); }
      for (var gmi = 0; gmi < G.gemsA.length; gmi++) { var ge2 = G.gemsA[gmi]; if (ge2.got) continue; var gxs = FX(ge2.x); if (gxs > W + 10 || gxs < -10) continue; pxGem(gxs, FY(GROUND - ge2.hAbove), G.t * 5 + ge2.x); }
      if (!th.night && !PIER) for (var fw = 0; fw < G.flowers.length; fw++) { var fo = G.flowers[fw]; var foX = FX(fo.x); if (foX < -4 || foX > W + 4) continue; if (groundAt(fo.x)) pxFlower(foX, gY + SZ(6), fo.k); }
      var h = G.hero, warping = G.state === "warping" && warpFX; var wsc = warping ? warpFX.scale : 1;
      if (G.state !== "trapped" && (warping || !(h.inv > 0 && Math.floor(G.t * 16) % 2)) && wsc > 0.04) {
        var B = Math.max(1.8, PIXW * 0.16 / 14); if (G.bigT > 0) B *= 1.5;
        var hbxp = FX(h.wx) - 7 * B, hby = FY(h.y) - 12 * B + SZ(2);
        if (h.power > 0) { disc(FX(h.wx), FY(h.y) - 6 * B, 9 * B, "rgba(255," + (120 + Math.floor(Math.sin(G.t * 20) * 80)) + ",240,.25)"); }
        if (G.flyT > 0) { var wf = Math.sin(G.t * 22) > 0 ? SZ(4) : 0; P(hbxp - SZ(7), hby + 3 * B - wf, SZ(9), SZ(5), "#eef2f8"); P(hbxp + 14 * B - SZ(2), hby + 3 * B - wf, SZ(9), SZ(5), "#eef2f8"); }
        if (warping && (wsc < 1 || warpFX.spin)) { var hcx = FX(h.wx), hcy = FY(h.y) - 6 * B; disc(hcx, hcy, 10 * B, "rgba(200,168,240,.3)"); x.save(); x.translate(hcx, hcy); x.rotate(warpFX.spin); x.scale(wsc, wsc); x.translate(-hcx, -hcy); drawHeroPix(x, hbxp, hby, B, HEROTYPE); x.restore(); }
        else drawHeroPix(x, hbxp, hby, B, HEROTYPE);
      }
      for (var q = 0; q < G.particles.length; q++) { var ptc = G.particles[q]; if (ptc.life <= 0) continue; var ppx = FX(ptc.wx), ppy = FY(ptc.y); if (ptc.kind === "coin") pxCoin(ppx, ppy, ptc.wx); else P(ppx, ppy, 2, 2, ptc.kind === "star" ? "#ffe14a" : "#ffffff"); }
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
    function pxCloud(cx, cy, c) { P(cx, cy, 20, 5, c); P(cx + 4, cy - 4, 12, 5, c); P(cx - 3, cy + 2, 26, 4, c); }
    function pxMountains(th, gY) { for (var i = -1; i < 6; i++) { var cx = Math.round(i * 90 - ((G.cam * .15) % 90)); var mh = SZ(150); for (var yy = 0; yy < mh; yy += 2) { var half = Math.round((yy / mh) * mh * 0.95); P(cx - half, gY - mh + yy, half * 2, 2, th.mtn); } for (var yy2 = 0; yy2 < mh * 0.3; yy2 += 2) { var half2 = Math.round((yy2 / (mh * 0.3)) * mh * 0.28); P(cx - half2, gY - mh + yy2, half2 * 2, 2, th.mtnS); } } }
    function pxHills(off, baseY, c) { for (var px = 0; px < PIXW; px += 3) { var y = baseY - Math.round(Math.sin((px + off * sx) * .03) * SZ(18) + Math.cos((px + off * sx) * .06) * SZ(8)); P(px, y, 3, PIXH, c); } }
    function pxProp(type, cx, gY, s, th) {
      if (type === "tree") { P(cx - 1, gY - s * 0.6, 3, s * 0.6, "#7a4a24"); disc(cx, gY - Math.round(s * 0.7), Math.round(s * 0.34), "#3aa64a"); }
      else if (type === "palm") { P(cx, gY - s * 0.8, 3, s * 0.8, "#a9743f"); for (var f = 0; f < 5; f++) { var a = (-1.4) + f * 0.5; P(cx + Math.round(Math.cos(a) * s * 0.3), gY - Math.round(s * 0.8) + Math.round(Math.sin(a) * s * 0.14), Math.round(s * 0.3), 3, "#3fae5a"); } }
      else if (type === "pine") { P(cx - 1, gY - s * 0.2, 3, s * 0.2, "#6a4a2a"); for (var t = 0; t < 3; t++) { var wv = Math.round(s * (0.34 - t * 0.1)); P(cx - wv, gY - s * (0.2 + t * 0.2) - 2, wv * 2, Math.round(s * 0.2), "#2f8f52"); P(cx - Math.round(wv * 0.5), gY - s * (0.2 + t * 0.2) - 2, wv, 2, "#dff0e6"); } }
      else if (type === "candy") { P(cx - 1, gY - s * 0.5, 2, s * 0.5, "#fff"); disc(cx, gY - Math.round(s * 0.6), Math.round(s * 0.22), "#ff6ea9"); disc(cx, gY - Math.round(s * 0.6), Math.round(s * 0.1), "#fff"); }
      else if (type === "coral") { P(cx - 1, gY - s * 0.4, 3, s * 0.4, "#ff7aa8"); P(cx - s * 0.24, gY - s * 0.4, 3, s * 0.24, "#ff7aa8"); P(cx + s * 0.2, gY - s * 0.44, 3, s * 0.28, "#ff9ec7"); }
      else if (type === "jungle") { disc(cx - Math.round(s * 0.16), gY - Math.round(s * 0.34), Math.round(s * 0.24), "#2f8f42"); disc(cx + Math.round(s * 0.16), gY - Math.round(s * 0.3), Math.round(s * 0.2), "#3aa64a"); P(cx - 1, gY - s * 0.3, 3, s * 0.3, "#7a4a24"); }
      else if (type === "rock") { disc(cx, gY - Math.round(s * 0.18), Math.round(s * 0.28), "#7a5648"); P(cx - 2, gY - s * 0.28, 2, s * 0.14, "#ff6b3d"); }
      else if (type === "crystal") { P(cx - 2, gY - s * 0.5, 4, s * 0.5, "#b28dff"); P(cx - s * 0.2, gY - s * 0.34, 3, s * 0.34, "#8f6bd6"); P(cx + s * 0.16, gY - s * 0.42, 3, s * 0.42, "#c9b0ff"); }
    }
    function pxFlower(cx, cy, k) { var cols = [["#ff5ca8", "#fff2a8"], ["#ff9f1c", "#fff2a8"], ["#8f5bff", "#fff2a8"]][k]; P(cx - 1, cy - 3, 2, 4, "#3aa64a"); P(cx - 2, cy - 6, 4, 4, cols[0]); P(cx - 1, cy - 5, 2, 2, cols[1]); }
    function pxCoin(cx, cy, spin) { var w = Math.max(1, Math.round(Math.abs(Math.cos(spin)) * SZ(15))); var r = SZ(15); P(cx - w, cy - r, w * 2, r * 2, C.coin); P(cx - w, cy - r, w * 2, SZ(3), C.coinHi); P(cx - w, cy + r - SZ(3), w * 2, SZ(3), C.coinLo); if (w > SZ(6)) P(cx - SZ(2), cy - SZ(4), SZ(4), SZ(8), C.coinLo); }
    function pxBox(px, py, w, h, used, power) { var main = used ? "#b39b7a" : (power ? "#37c0ff" : C.box), hi = used ? "#c9b48f" : (power ? "#a8ecff" : C.boxHi), lo = used ? "#8f7a4f" : (power ? "#1f8fd0" : C.boxLo); P(px, py, w, h, main); P(px, py, w, SZ(3), hi); P(px, py + h - SZ(3), w, SZ(3), lo); P(px, py, SZ(3), h, hi); P(px + w - SZ(3), py, SZ(3), h, lo); if (!used) { var cx = px + w / 2, cy = py + h / 2; if (power) { P(cx - SZ(2), cy - SZ(7), SZ(4), SZ(14), "#fff"); P(cx - SZ(7), cy - SZ(2), SZ(14), SZ(4), "#fff"); } else { P(cx - SZ(3), cy - SZ(6), SZ(6), SZ(3), "#fff"); P(cx + SZ(1), cy - SZ(3), SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy, SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy + SZ(4), SZ(3), SZ(2), "#fff"); } } }
    function pxFish(cx, cy, ph, dir) { dir = dir || 1; var s = SZ(1); disc(cx, cy, SZ(16), "#ff7a4a"); P(cx + dir * SZ(10), cy - SZ(12), SZ(16), SZ(24), "#ff7a4a"); P(cx + dir * SZ(20), cy - SZ(14), SZ(10), SZ(28), "#ff9a6a"); P(cx - dir * SZ(8), cy - SZ(6), SZ(6), SZ(6), "#fff"); P(cx - dir * SZ(6), cy - SZ(4), SZ(3), SZ(3), "#111"); P(cx + SZ(2), cy - SZ(16), SZ(10), SZ(6), "#ff9a6a"); if (ph < 0.35) { for (var w = -18; w <= 18; w += 9) P(cx + SZ(w), FY(GROUND) + SZ(2), SZ(4), SZ(3), "#ffffff"); } }
    function pxBrick(px, py, w, h, th) { P(px, py, w, h, "#c65a2a"); P(px, py, w, SZ(3), "#e07a4a"); P(px, py + h - SZ(2), w, SZ(2), "#8a3a18"); for (var ry = py + SZ(4); ry < py + h; ry += SZ(9)) P(px, ry, w, 1, "#8a3a18"); for (var rx = px + SZ(6); rx < px + w; rx += SZ(12)) P(rx, py, 1, h, "#8a3a18"); }
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
    function pxStar(cx, cy, r) { P(cx - 1, cy - r, 2, r * 2, C.star); P(cx - r, cy - 1, r * 2, 2, C.star); P(cx - Math.round(r * .6), cy - Math.round(r * .6), Math.round(r * 1.2), Math.round(r * 1.2), C.star); P(cx - 2, cy - 2, 4, 4, "#fff2a8"); }
    function pxGate(gxs, gY) { var hh = SZ(150); P(gxs - SZ(46), gY - hh, SZ(20), hh, C.stone); P(gxs + SZ(26), gY - hh, SZ(20), hh, C.stone); P(gxs - SZ(56), gY - hh - SZ(16), SZ(112), SZ(18), C.stoneD); var ly = gY - SZ(90); P(gxs - SZ(10), ly, SZ(20), SZ(18), C.lock); P(gxs - SZ(6), ly - SZ(8), SZ(12), SZ(8), C.stoneD); P(gxs - SZ(3), ly + SZ(6), SZ(6), SZ(6), "#8a5a00"); }
    function pxCastle(cx, gY) { var hh = SZ(150);[-70, -24, 24, 70].forEach(function (o) { P(cx + SZ(o) - SZ(18), gY - hh, SZ(36), hh, C.castle); }); P(cx - SZ(58), gY - SZ(100), SZ(116), SZ(100), C.castleD);[-90, -66, -42, -2, 22, 46, 70, 92].forEach(function (o) { P(cx + SZ(o) - SZ(7), gY - hh - SZ(14), SZ(14), SZ(14), C.castle); }); P(cx - SZ(16), gY - SZ(40), SZ(32), SZ(40), C.door); P(cx - SZ(70), gY - hh - SZ(30), SZ(2), SZ(18), C.pole); P(cx - SZ(68), gY - hh - SZ(30), SZ(14), SZ(8), C.flag); }
    function pxEnemy(cx, gY, dir) { var bnc = Math.round(Math.abs(Math.sin(G.t * 4 + cx)) * SZ(4)), fy = gY - SZ(46) - bnc, w = SZ(24); P(cx - w, fy + SZ(6), w * 2, SZ(40), C.enemy); P(cx - w + SZ(3), fy, w * 2 - SZ(6), SZ(8), C.enemy); P(cx - w, fy + SZ(40), SZ(8), SZ(6), C.enemyD); P(cx + w - SZ(8), fy + SZ(40), SZ(8), SZ(6), C.enemyD); P(cx - SZ(12), fy + SZ(14), SZ(8), SZ(8), C.enemyEye); P(cx + SZ(4), fy + SZ(14), SZ(8), SZ(8), C.enemyEye); P(cx - SZ(11) + dir * SZ(2), fy + SZ(16), SZ(4), SZ(4), C.enemyPup); P(cx + SZ(5) + dir * SZ(2), fy + SZ(16), SZ(4), SZ(4), C.enemyPup); }

    function pxGem(cx, cy, spin) {
      var w = Math.max(1, Math.round(Math.abs(Math.cos(spin)) * SZ(13))), r = SZ(16);
      P(cx - w, cy - r, w * 2, r * 2, "#b06bff"); P(cx - w, cy - r, w * 2, SZ(3), "#e6c8ff"); P(cx - w, cy + r - SZ(3), w * 2, SZ(3), "#7a2fd0");
      if (w > SZ(5)) P(cx - SZ(2), cy - SZ(5), SZ(3), SZ(10), "#f2e0ff");
      if (Math.floor(spin * 3) % 2) { P(cx + SZ(7), cy - SZ(9), 2, 2, "#ffffff"); P(cx - SZ(9), cy + SZ(5), 2, 2, "#ffffff"); }
    }
    function pxTrap(type, cx, gY, ph, sprung) {
      // hazard stripe on the ground so it never reads as decoration
      for (var hz = -26; hz < 26; hz += 8) P(cx + SZ(hz), gY + SZ(2), SZ(4), SZ(4), (Math.floor(hz / 4) % 2 ? "#ff3b30" : "#241018"));
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
        P(cx - SZ(24), gY - SZ(10), SZ(48), SZ(10), "#a9743f"); P(cx - SZ(24), gY - SZ(10), SZ(48), SZ(3), "#c98f50");
        var bar = (Math.sin(ph * 7) > 0 ? SZ(38) : SZ(9)); P(cx - SZ(22), gY - SZ(10) - bar, SZ(4), bar, "#d2dae6"); P(cx - SZ(22), gY - SZ(10) - bar, SZ(40), SZ(4), "#d2dae6"); P(cx + SZ(18), gY - SZ(10) - bar, SZ(4), bar, "#d2dae6");
        disc(cx + SZ(6), gY - SZ(5), SZ(6), "#ffd23f"); P(cx + SZ(4), gY - SZ(7), SZ(2), SZ(2), "#c98f00");
      }
      else if (type === "net") { for (var i = -22; i <= 22; i += 6) P(cx + SZ(i), gY - SZ(50), SZ(3), SZ(50), "#e6ecff"); for (var j = 0; j < 52; j += 6) P(cx - SZ(22), gY - SZ(j), SZ(44), SZ(3), "#e6ecff"); disc(cx, gY - SZ(24), SZ(6), "#9fb0e0"); }
      else if (type === "ice") { P(cx - SZ(22), gY - SZ(54), SZ(44), SZ(54), "rgba(150,220,255,.78)"); P(cx - SZ(22), gY - SZ(54), SZ(10), SZ(54), "rgba(230,248,255,.9)"); P(cx + SZ(8), gY - SZ(38), SZ(5), SZ(26), "rgba(230,248,255,.75)"); P(cx - SZ(22), gY - SZ(54), SZ(44), SZ(3), "#bfe4ff"); }
      else if (type === "vine") { P(cx - SZ(3), gY - SZ(70), SZ(6), SZ(40), "#357a35"); disc(cx, gY - SZ(30), SZ(18), "#4aa84a"); disc(cx, gY - SZ(30), SZ(11), "#2f8f42"); P(cx - SZ(12), gY - SZ(30), SZ(24), SZ(5), "#256a25"); }
      else if (type === "giant") { var stomp = Math.abs(Math.sin(ph * 3)), soleY = gY - SZ(30) - Math.round(stomp * SZ(20)); disc(cx, gY, SZ(26), "rgba(0,0,0,.22)"); P(cx - SZ(19), 0, SZ(38), soleY - SZ(20), "#d8b48a"); P(cx - SZ(19), 0, SZ(9), soleY - SZ(20), "#eccfa8"); P(cx - SZ(26), soleY - SZ(24), SZ(52), SZ(24), "#e6bd92"); P(cx - SZ(26), soleY - SZ(6), SZ(52), SZ(6), "#caa070"); for (var gt = 0; gt < 5; gt++) P(cx - SZ(24) + gt * SZ(10), soleY - SZ(3), SZ(7), SZ(6), "#f2d6b0"); }
      else if (type === "hoop") { for (var a = 0; a < 14; a++) { var an = a / 14 * 6.283; P(cx + Math.round(Math.cos(an) * SZ(26)) - SZ(3), gY - SZ(32) + Math.round(Math.sin(an) * SZ(26)) - SZ(3), SZ(7), SZ(7), (a + Math.floor(ph * 6)) % 2 ? "#ff5a1a" : "#ffd23f"); } disc(cx, gY - SZ(32), SZ(14), "rgba(255,120,30,.25)"); }
      else if (type === "snowball") { disc(cx, gY - SZ(13), SZ(15), "#f4faff"); disc(cx, gY - SZ(32), SZ(11), "#f4faff"); P(cx - SZ(5), gY - SZ(34), SZ(3), SZ(3), "#111"); P(cx + SZ(2), gY - SZ(34), SZ(3), SZ(3), "#111"); P(cx - SZ(1), gY - SZ(31), SZ(5), SZ(2), "#ff8a2a"); P(cx - SZ(16), gY - SZ(24), SZ(10), SZ(3), "#8a5a2a"); disc(cx + SZ(20), gY - SZ(22) - Math.round(Math.abs(Math.sin(ph * 5)) * SZ(6)), SZ(6), "#fff"); }
      else if (type === "iceblock") { var dd = Math.round((Math.sin(ph * 3) + 1) * SZ(9)); P(cx - SZ(3), gY - SZ(58), SZ(6), SZ(12), "#bfe4ff"); P(cx - SZ(15), gY - SZ(42) - dd, SZ(30), SZ(30), "rgba(150,220,255,.82)"); P(cx - SZ(15), gY - SZ(42) - dd, SZ(30), SZ(4), "#eaf6ff"); P(cx - SZ(15), gY - SZ(42) - dd, SZ(5), SZ(30), "#eaf6ff"); }
      else if (type === "star") { pxStar(cx, gY - SZ(26), SZ(18)); disc(cx, gY - SZ(2), SZ(18), "rgba(255,190,50,.28)"); for (var ss = 0; ss < 3; ss++) P(cx - SZ(20) + ss * SZ(14), gY - SZ(6), SZ(3), SZ(3), "#ffe06a"); }
      else if (type === "rps") { P(cx - SZ(13), gY - SZ(34), SZ(26), SZ(34), "#8b6cf0"); P(cx - SZ(13), gY - SZ(34), SZ(26), SZ(5), "#a98bff"); P(cx - SZ(8), gY - SZ(28), SZ(6), SZ(6), "#fff"); P(cx + SZ(3), gY - SZ(28), SZ(6), SZ(6), "#fff"); P(cx - SZ(6), gY - SZ(26), SZ(3), SZ(3), "#111"); P(cx + SZ(5), gY - SZ(26), SZ(3), SZ(3), "#111"); var gg = Math.floor(ph * 2) % 3; if (gg === 0) disc(cx, gY - SZ(48), SZ(9), "#f2d6b0"); else if (gg === 1) P(cx - SZ(11), gY - SZ(54), SZ(22), SZ(12), "#f2d6b0"); else { P(cx - SZ(3), gY - SZ(56), SZ(3), SZ(15), "#f2d6b0"); P(cx + SZ(3), gY - SZ(56), SZ(3), SZ(15), "#f2d6b0"); } }
      else if (type === "police") { var pf = Math.floor(ph * 4) % 2; P(cx - SZ(20), gY - SZ(16), SZ(40), SZ(16), "#e8ecff"); for (var pb = -14; pb <= 14; pb += 9) P(cx + SZ(pb), gY - SZ(16), SZ(3), SZ(16), "#2a3350"); P(cx - SZ(20), gY - SZ(16), SZ(40), SZ(4), "#ffd23f"); P(cx - SZ(12), gY - SZ(28), SZ(11), SZ(9), pf ? "#ff3b30" : "#3a6bff"); P(cx + SZ(1), gY - SZ(28), SZ(11), SZ(9), pf ? "#3a6bff" : "#ff3b30"); }
      else if (type === "booger") { var bwf = Math.sin(ph * 8) > 0 ? SZ(4) : 0; disc(cx, gY - SZ(28), SZ(13), "#f2c9a0"); P(cx - SZ(5), gY - SZ(24), SZ(4), SZ(5), "#a9743f"); P(cx + SZ(2), gY - SZ(24), SZ(4), SZ(5), "#a9743f"); P(cx - SZ(22), gY - SZ(34) - bwf, SZ(11), SZ(6), "#fff"); P(cx + SZ(12), gY - SZ(34) - bwf, SZ(11), SZ(6), "#fff"); disc(cx - SZ(2), gY - SZ(12) + Math.round(Math.abs(Math.sin(ph * 6)) * SZ(6)), SZ(4), "#8fd14a"); }
      else { P(cx - SZ(26), gY - SZ(56), SZ(52), SZ(56), "#1a1236"); for (var v = -22; v <= 22; v += 8) P(cx + SZ(v), gY - SZ(54), SZ(4), SZ(54), "#7a5aff"); P(cx - SZ(26), gY - SZ(56), SZ(52), SZ(5), "#7a5aff"); P(cx - SZ(26), gY - SZ(5), SZ(52), SZ(5), "#7a5aff"); P(cx - SZ(7), gY - SZ(34), SZ(6), SZ(7), "#37e0ff"); P(cx + SZ(2), gY - SZ(34), SZ(6), SZ(7), "#37e0ff"); }
      // pulsing warning mark floating above
      if (!sprung) { var wy = gY - SZ(74), on = Math.floor(ph * 3) % 2; var wc = on ? "#ff3b30" : "#ffd23f"; P(cx - SZ(2), wy, SZ(5), SZ(11), wc); P(cx - SZ(2), wy + SZ(13), SZ(5), SZ(4), wc); }
    }

    /* ---- HUD (pixel) ---- */
    function heartPix(g, on) { var m = on ? "#ff5c6c" : "#3a3f5a"; g.fillStyle = m;[[1, 1], [2, 1], [4, 1], [5, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5], [3, 6]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); }); if (on) { g.fillStyle = "#ffd0d6"; g.fillRect(1, 2, 1, 1); g.fillRect(2, 2, 1, 1); } }
    function coinPix(g) { g.fillStyle = C.coin; g.fillRect(1, 1, 6, 6); g.fillStyle = C.coinHi; g.fillRect(1, 1, 6, 2); g.fillStyle = C.coinLo; g.fillRect(3, 2, 2, 4); }
    function heroMarkPix(g) { hbx.clearRect(0, 0, 14, 12); var H = HERO_MAP[HEROTYPE] || HERO_MAP.unicorn; spr(hbx, 0, 0, H.rows, H.map); g.drawImage(heroBuf, 0, 0, 14, 12, 0, 0, 12, 12); }
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
    function buildMap() {
      var mcv = $("#adv-mapCanvas"), mg = mcv.getContext("2d"); var W = 260, H = 150; mcv.width = W; mcv.height = H; mg.imageSmoothingEnabled = false; mg.clearRect(0, 0, W, H);
      var pad = 30, cols = 4, rows = Math.ceil(MAXLEVELS / cols); mapNodes = [];
      for (var i = 0; i < MAXLEVELS; i++) { var row = Math.floor(i / cols), col = i % cols; if (row % 2) col = cols - 1 - col; var xx = pad + col * ((W - 2 * pad) / (cols - 1)); var yy = pad + row * ((H - 2 * pad) / (rows - 1 || 1)); mapNodes.push({ x: Math.round(xx), y: Math.round(yy), n: i + 1, theme: THEMES[i % THEMES.length] }); }
      mg.fillStyle = "rgba(255,255,255,.35)"; for (var pp = 0; pp < mapNodes.length - 1; pp++) { var A = mapNodes[pp], Bn = mapNodes[pp + 1]; for (var tt = 0; tt < 1; tt += 0.06) { mg.fillRect(Math.round(A.x + (Bn.x - A.x) * tt), Math.round(A.y + (Bn.y - A.y) * tt), 2, 2); } }
      var savedX = x; x = mg;
      mapNodes.forEach(function (p) {
        var open = p.n <= unlocked, R = 16;
        mg.save(); mg.beginPath(); mg.rect(p.x - R, p.y - R, R * 2, R * 2); mg.clip();
        mg.fillStyle = p.theme.sky; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2);
        mg.fillStyle = p.theme.sky2 || p.theme.sky; mg.fillRect(p.x - R, p.y, R * 2, R);
        mg.fillStyle = p.theme.grass; mg.fillRect(p.x - R, p.y + R - 6, R * 2, 6);
        pxProp(p.theme.prop, p.x, p.y + R - 6, 20, p.theme);
        if (!open) { mg.fillStyle = "rgba(20,24,40,.62)"; mg.fillRect(p.x - R, p.y - R, R * 2, R * 2); }
        mg.restore();
        mg.fillStyle = open ? "#fff" : "#5a5f7a"; mg.fillRect(p.x - R, p.y - R, R * 2, 2); mg.fillRect(p.x - R, p.y + R - 2, R * 2, 2); mg.fillRect(p.x - R, p.y - R, 2, R * 2); mg.fillRect(p.x + R - 2, p.y - R, 2, R * 2);
        if (!open) { mg.fillStyle = "#101828"; mg.fillRect(p.x - R + 2, p.y + R - 11, 11, 9); mg.fillStyle = "#ffd23f"; mg.fillRect(p.x - R + 4, p.y + R - 9, 7, 5); mg.fillStyle = "#101828"; mg.fillRect(p.x - R + 6, p.y + R - 15, 3, 5); mg.fillRect(p.x - R + 6, p.y + R - 7, 3, 3); }
        mg.fillStyle = (p.n === level ? "#ff4fa3" : "#ffd23f"); mg.fillRect(p.x + R - 8, p.y - R - 2, 12, 12); mg.fillStyle = "#101828"; mg.font = "900 10px monospace"; mg.textAlign = "center"; mg.textBaseline = "middle"; mg.fillText(p.n, p.x + R - 2, p.y - R + 5);
        mg.fillStyle = open ? "#fff" : "#8f9ac9"; mg.font = "700 8px monospace"; mg.fillText(p.theme.name, p.x, p.y + R + 8);
        if (progress.secretsFound && progress.secretsFound[p.n]) { var cxq = p.x - R + 6, cyq = p.y - R + 5; mg.fillStyle = "#ffd23f"; mg.fillRect(cxq - 4, cyq, 9, 5); mg.fillRect(cxq - 4, cyq - 3, 2, 3); mg.fillRect(cxq, cyq - 4, 2, 4); mg.fillRect(cxq + 3, cyq - 3, 2, 3); mg.fillStyle = "#ff4fa3"; mg.fillRect(cxq, cyq + 1, 2, 2); }
      });
      x = savedX;
    }
    function mapClick(ev) { var mcv = $("#adv-mapCanvas"), rect = mcv.getBoundingClientRect(), scale = 260 / rect.width; var mxp = (ev.clientX - rect.left) * scale, myp = (ev.clientY - rect.top) * scale; for (var i = 0; i < mapNodes.length; i++) { var p = mapNodes[i]; if (p.n <= unlocked && Math.abs(mxp - p.x) < 20 && Math.abs(myp - p.y) < 20) { ac(); startLevel(p.n); return; } } }
    function buildCharRow() {
      var row = $("#adv-charRow"); row.innerHTML = ""; var gems = progress.gems || 0;
      CHARS.forEach(function (ch) {
        var locked = ch.cost && gems < ch.cost;
        var btn = document.createElement("button"); btn.className = "adv8-charBtn" + (ch.id === HEROTYPE ? " on" : "") + (locked ? " locked" : "");
        var c = document.createElement("canvas"); c.width = 42; c.height = 36; var g = c.getContext("2d"); g.imageSmoothingEnabled = false;
        hbx.clearRect(0, 0, 14, 12); spr(hbx, 0, 0, HERO_MAP[ch.id].rows, HERO_MAP[ch.id].map); if (locked) g.globalAlpha = 0.4; g.drawImage(heroBuf, 0, 0, 14, 12, 0, 0, 42, 36); g.globalAlpha = 1;
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
        hbx.clearRect(0, 0, 14, 12); spr(hbx, 0, 0, HERO_MAP[ch.id].rows, HERO_MAP[ch.id].map); if (!found) g.globalAlpha = 0.28; g.drawImage(heroBuf, 0, 0, 14, 12, 0, 0, 42, 36); g.globalAlpha = 1;
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
    function enter() { show("adventure"); resize(); running = true; if (!looping) { looping = true; last = 0; requestAnimationFrame(frame); } }
    function leave() { running = false; warpFX = null; musicStop(); }
    function startDaily() {
      HEROTYPE = progress.hero || "unicorn"; unlocked = Math.max(1, progress.worldsUnlocked || 1);
      enter(); hideAllOv(); reset(1); G.state = "map"; buildCharRow(); buildMap(); redrawPmapHero(); hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden");
    }
    function openMap() { unlocked = Math.max(1, progress.worldsUnlocked || 1); hideAllOv(); if (G) G.state = "map"; buildMap(); hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden"); }
    function exitHome() { leave(); musicStop(); renderHome(); show("home"); }

    function advInit() {
      cv = $("#adv-c"); x = cv.getContext("2d");
      var ci = $("#adv-coin-icon"); ci.width = 8; ci.height = 8; var cig = ci.getContext("2d"); cig.imageSmoothingEnabled = false; coinPix(cig);
      window.addEventListener("resize", function () { if (running) resize(); });
      window.addEventListener("orientationchange", function () { if (running) { resize(); setTimeout(function () { if (running) resize(); }, 300); } });
      cv.addEventListener("pointerdown", function (e) { ac(); if (G && G.state === "showdown") sdDown(e); else jump(); });
      cv.addEventListener("pointermove", function (e) { if (G && G.state === "showdown") sdMove(e); });
      cv.addEventListener("pointerup", function (e) { if (G && G.state === "showdown") sdUp(e); else jumpRelease(); });
      $("#adv-kpad").addEventListener("click", function (e) { var b = e.target.closest(".key"); if (b) { ac(); key(b.getAttribute("data-k")); } });
      $("#adv-mapCanvas").addEventListener("click", mapClick);
      document.addEventListener("keydown", function (e) {
        if (!isActive() || !G) return;
        if (G.state === "gate" || G.state === "trapped") { if (e.key >= "0" && e.key <= "9") key(e.key); else if (e.key === "Backspace") key("del"); else if (e.key === "Enter") key("enter"); }
        else if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); jump(); }
      });
      document.addEventListener("keyup", function (e) { if (isActive() && (e.key === " " || e.key === "ArrowUp")) jumpRelease(); });
      $("#adv-quit").addEventListener("click", function (e) { e.stopPropagation(); sTap(); openMap(); });
      $("#adv-map-close").addEventListener("click", function () { sTap(); exitHome(); });
      $("#adv-nextBtn").addEventListener("click", function () { sTap(); startLevel(Math.min(level + 1, MAXLEVELS)); });
      $("#adv-retryBtn").addEventListener("click", function () { sTap(); startLevel(level); });
      $("#adv-mapBtn").addEventListener("click", function () { sTap(); openMap(); });
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
      forceTrap: function () { if (!G) return; G.traps.push({ x: G.hero.wx, type: pick(G.cf.trapPool), done: false, sprung: false }); springTrap(G.traps.length - 1); },
      forceTrapType: function (t) { if (!G) return; G.traps.push({ x: G.hero.wx, type: t, done: false, sprung: false }); springTrap(G.traps.length - 1); },
      setHero: function (id) { HEROTYPE = id; if (progress) { progress.hero = id; } }, buildCharRow: buildCharRow,
      get trapsX() { return G ? G.traps.map(function (t) { return Math.round(t.x); }) : []; },
      get gemsX() { return G ? G.gemsA.map(function (g) { return Math.round(g.x); }) : []; },
      get fishX() { return G ? G.fish.map(function (f) { return Math.round(f.x); }) : []; },
      get chunks() { return G ? G.gates.length : 0; },
      get inSecret() { return G ? !!G.secretWorld : false; },
      get inShowdown() { return G ? G.state === "showdown" : false; },
      resumeMusic: function () { if (G && ["run", "gate", "trapped", "showdown", "warping"].indexOf(G.state) >= 0) { if (G.secretWorld) musicSecret(); else musicWorld(level); } },
      enterShowdown: function () { if (G && G.state === "run") enterShowdown(); },
      sdWin: function () { if (G && G.sd) sdWinNow(); },
      get showdownX() { return G && G.showdown && !G.showdown.done ? Math.round(G.showdown.x) : null; },
      get warpX() { return G && G.warp && !G.warp.done ? Math.round(G.warp.x) : null; },
      get secretsFound() { return progress.secretsFound || {}; },
      enterSecret: function () { if (G && SECRET_CHARS[level] && !G.secretWorld) enterSecret(level); },
      warp: function (wx) { if (G) { while (G.nextGate < G.gates.length && G.gates[G.nextGate].x < wx - 60) { G.gates[G.nextGate].solved = true; G.nextGate++; } G.hero.wx = wx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.cam = wx - HEROX; } },
      unwarp: function () {}
    };

    return { init: advInit, startDaily: startDaily, exitHome: exitHome };
  })();

  /* ---------------- init / wiring ---------------- */
  function init() {
    // block iOS pinch-zoom (double-tap zoom is handled by touch-action:manipulation in CSS)
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
    buildLearn();
    buildMulti("#quiz-picker", state.quizTables, function () { $("#quiz-start").disabled = state.quizTables.length === 0; });
    buildMulti("#practice-picker", state.practiceTables, function () { $("#practice-start").disabled = state.practiceTables.length === 0; });

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
    $("#practice-start").addEventListener("click", function () { sTap(); startPractice(deckFromTables(state.practiceTables)); });
    $("#practice-weak").addEventListener("click", function () { sTap(); startPractice(weakFacts(15)); });

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
    $("#reset-progress").addEventListener("click", function () {
      var who = activeProfile(); var nm = who ? who.name : "this player";
      if (window.confirm("Reset " + nm + "'s stars, streaks and progress? This can't be undone.")) {
        progress = freshProgress(); save(); showReport(); renderHome();
      }
    });

    // profiles
    $("#player-switch").addEventListener("click", function () { sTap(); renderProfiles(); show("profiles"); });
    $("#pn-back").addEventListener("click", function () { sTap(); renderProfiles(); show("profiles"); });
    $("#players-add").addEventListener("click", function () { sTap(); openProfileNew(false); });
    $("#pn-name").addEventListener("input", function () { $("#pn-create").disabled = this.value.trim().length === 0; });
    $("#pn-name").addEventListener("keydown", function (e) { if (e.key === "Enter" && this.value.trim()) $("#pn-create").click(); });
    $("#pn-create").addEventListener("click", function () {
      var name = $("#pn-name").value.trim(); if (!name) return;
      sTap(); createProfile(name, newAvatar); renderHome(); show("home");
    });

    // sound
    var st = $("#sound-toggle"); st.textContent = soundOn ? "🔊" : "🔈";
    st.addEventListener("click", function () { soundOn = !soundOn; saveSound(); st.textContent = soundOn ? "🔊" : "🔈"; if (soundOn) { ac(); sTap(); if (window.__adv && window.__adv.resumeMusic) window.__adv.resumeMusic(); } else { musicStop(); } });
    document.addEventListener("touchstart", function once() { ac(); document.removeEventListener("touchstart", once); }, { passive: true });

    boot();
  }
  function boot() {
    reg = profilesLoad();
    migrateLegacy();
    if (!reg.profiles.length) { openProfileNew(true); return; }              // first run → create
    if (reg.profiles.length === 1) { setActive(reg.profiles[0].id); renderHome(); show("home"); return; }
    // more than one → let them choose
    if (reg.activeId) activeId = reg.activeId;
    renderProfiles(); show("profiles");
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
