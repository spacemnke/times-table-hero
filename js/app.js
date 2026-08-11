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
    return { v: 2, xp: 0, coins: 0, totalCorrect: 0, totalQ: 0, totalMs: 0, fastCount: 0,
      bestStreak: 0, recent: [], facts: {}, days: {}, badges: {},
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

  /* ---------------- ADVENTURE (side-scroller daily quest) ---------------- */
  var AW = 900, AH = 506, AGROUND = 430, AGATE0 = 720, AGAP = 1150, START_HEARTS = 5;
  var adv = null, advCtx = null, advRAF = null, advLast = 0;

  function aBeep(f, d, type, v) { tone(f, d, type, 0, v); }
  function aCoinSnd() { tone(880, .07, "triangle", 0, .1); tone(1320, .07, "triangle", .04, .09); }
  function aJumpSnd() { tone(520, .08, "square", 0, .07); }

  function startAdventure() {
    ac();
    var cv = $("#adv-canvas"); advCtx = cv.getContext("2d");
    var len = clamp(progress.settings.dailyGoal, 10, 25);
    var qs = buildQuestions(focusTables(), len);
    var prof = activeProfile();
    adv = {
      qs: qs, total: qs.length, next: 0, hearts: START_HEARTS, coins: 0, correct: 0, wrong: 0,
      xpEarned: 0, combo: 0, maxCombo: 0, cam: 0, speed: 300, dash: 0, cloud: 0, shakeT: 0,
      hero: { x: 180, y: AGROUND, vy: 0, ground: true, run: 0 }, heroEm: prof ? prof.avatar : "🦄",
      state: "run", question: null, input: "", solved: {}, particles: [], coinsList: [], bushes: [],
      qStart: 0, levelBefore: levelFromXp(progress.xp), goalMet: false, badgesBefore: Object.keys(progress.badges).length,
    };
    // scatter coins & bushes across the level
    for (var g = 0; g < adv.total; g++) {
      var base = AGATE0 + g * AGAP;
      for (var k = 0; k < 5; k++) adv.coinsList.push({ x: base - AGAP + 260 + k * 180 + (k * 57 % 60), y: (k % 2) ? AGROUND - 120 : AGROUND - 40, got: false });
      adv.bushes.push({ x: base - AGAP + 420 }); adv.bushes.push({ x: base - AGAP + 980 });
    }
    $("#adv-panel").hidden = true; $("#adv-win").hidden = true; $("#adv-fail").hidden = true;
    $("#adv-hint").style.opacity = ".92";
    var w = activeProfile();
    $("#adv-world").textContent = "🌼 Meadow Springs";
    show("adventure");
    advLast = 0; if (advRAF) cancelAnimationFrame(advRAF); advRAF = requestAnimationFrame(advFrame);
  }
  function advStop() { if (advRAF) cancelAnimationFrame(advRAF); advRAF = null; adv = null; }
  function aGateX(i) { return AGATE0 + i * AGAP; }

  function advFrame(ts) {
    if (!adv) return;
    var dt = Math.min(.05, (ts - (advLast || ts)) / 1000); advLast = ts;
    adv.cloud += dt * 14;
    if (adv.state === "run") {
      var sp = adv.speed * (1 + adv.dash); adv.dash = Math.max(0, adv.dash - dt * 1.6);
      adv.cam += sp * dt; adv.hero.run += dt * sp * .03;
      if (!adv.hero.ground) { adv.hero.vy += 1500 * dt; adv.hero.y += adv.hero.vy * dt; if (adv.hero.y >= AGROUND) { adv.hero.y = AGROUND; adv.hero.vy = 0; adv.hero.ground = true; } }
      var hwx = adv.cam + adv.hero.x;
      for (var i = 0; i < adv.coinsList.length; i++) { var co = adv.coinsList[i]; if (co.got) continue; if (Math.abs(co.x - hwx) < 34 && Math.abs(co.y - adv.hero.y) < 60) { co.got = true; adv.coins++; progress.coins = (progress.coins || 0) + 1; aCoinSnd(); adv.particles.push({ x: adv.hero.x, y: adv.hero.y - 30, vx: 0, vy: -160, life: .6 }); } }
      if (adv.next < adv.total) { if (aGateX(adv.next) - adv.cam <= 560) advArrive(); }
      else if (aGateX(adv.total) - adv.cam <= 480) { advWin(); }
    }
    for (var p = adv.particles.length - 1; p >= 0; p--) { var pt = adv.particles[p]; pt.x += pt.vx * dt; pt.vy += 1400 * dt; pt.y += pt.vy * dt; pt.life -= dt * 1.2; if (pt.life <= 0) adv.particles.splice(p, 1); }
    if (adv.shakeT > 0) adv.shakeT -= dt;
    advDraw();
    if (adv) advRAF = requestAnimationFrame(advFrame);
  }
  function advArrive() {
    adv.state = "gate"; adv.question = adv.qs[adv.next]; adv.input = ""; adv.qStart = Date.now();
    advDisp(); $("#adv-q").textContent = adv.question.a + " × " + adv.question.b;
    $("#adv-panel").hidden = false; $("#adv-hint").style.opacity = "0";
  }
  function advJump() { if (adv && adv.state === "run" && adv.hero.ground) { adv.hero.vy = -560; adv.hero.ground = false; aJumpSnd(); } }
  function advDisp() { var d = $("#adv-disp"); if (adv.input === "") { d.textContent = "?"; d.classList.add("ph"); } else { d.textContent = adv.input; d.classList.remove("ph"); } }
  function advKey(k) {
    if (!adv || adv.state !== "gate") return;
    if (k === "del") { adv.input = adv.input.slice(0, -1); advDisp(); return; }
    if (k === "enter") { if (adv.input !== "") advSubmit(parseInt(adv.input, 10)); return; }
    if (adv.input.length >= 3) return; if (adv.input === "" && k === "0") return;
    adv.input += k; advDisp();
    if (parseInt(adv.input, 10) === adv.question.a * adv.question.b) advSubmit(adv.question.a * adv.question.b);
  }
  function advSubmit(val) {
    var q = adv.question, ans = q.a * q.b, ms = Date.now() - adv.qStart, correct = val === ans;
    var justMet = recordAnswer(q.a, q.b, correct, ms);
    if (justMet) adv.goalMet = true;
    if (correct) {
      $("#adv-abox").className = "adv-abox good"; sGood(); haptic(12);
      adv.correct++; adv.combo++; adv.maxCombo = Math.max(adv.maxCombo, adv.combo);
      var speed = ms < 1500 ? 8 : ms < 3000 ? 5 : ms < 5000 ? 2 : 0;
      var gained = Math.round((10 + speed) * (1 + Math.min(adv.combo, 6) * .08));
      progress.xp += gained; adv.xpEarned += gained;
      progress.coins = (progress.coins || 0) + 5; adv.coins += 5;
      adv.solved[adv.next] = true; save();
      for (var b = 0; b < 12; b++) adv.particles.push({ x: adv.hero.x + 40, y: adv.hero.y - 40, vx: (Math.random() * 2 - .4) * 150, vy: -(Math.random() * 240 + 120), life: 1 });
      setTimeout(function () {
        if (!adv) return; $("#adv-panel").hidden = true; $("#adv-abox").className = "adv-abox";
        adv.state = "run"; adv.dash = .9; adv.next++; adv.input = "";
        $("#adv-hint").style.opacity = ".92"; $("#adv-hint").textContent = adv.next >= adv.total ? "Dash to the castle! 🏰" : "Nice! Tap to jump ✨";
      }, 420);
    } else {
      adv.wrong++; adv.hearts--; adv.combo = 0; $("#adv-abox").className = "adv-abox bad"; sBad(); haptic([10, 40, 10]);
      adv.shakeT = .35; adv.input = ""; advDisp(); save();
      if (adv.hearts <= 0) setTimeout(function () { if (adv) { $("#adv-panel").hidden = true; adv.state = "fail"; $("#adv-fail").hidden = false; } }, 400);
    }
  }
  function advWin() {
    adv.state = "win";
    var lost = START_HEARTS - adv.hearts, stars = lost === 0 ? 3 : lost <= 2 ? 2 : 1, perfect = adv.wrong === 0;
    if (perfect) { progress.xp += 20; adv.xpEarned += 20; }
    var newly = evaluateBadges({ perfect: perfect, quizLen: adv.total }); save();
    var leveled = levelFromXp(progress.xp) > adv.levelBefore;
    var row = ""; for (var i = 0; i < 3; i++) row += i < stars ? "⭐️" : "☆";
    $("#adv-win-stars").textContent = row;
    $("#adv-win-title").textContent = perfect ? "Perfect run! 🏰" : "Level complete! 🏰";
    var msg = "🪙 " + adv.coins + " coins · ✦ +" + adv.xpEarned + " XP";
    if (adv.goalMet) msg = "🔥 Daily goal done!  " + msg;
    $("#adv-win-msg").textContent = msg;
    var uw = $("#adv-win-unlocks"); uw.innerHTML = "";
    if (leveled) uw.appendChild(el("div", "badge-pop", "🌟 Level " + levelFromXp(progress.xp) + "!"));
    newly.forEach(function (bd) { uw.appendChild(el("div", "badge-pop", bd.icon + " " + bd.name)); });
    $("#adv-win").hidden = false;
    sWin(); advBurst(); haptic([15, 60, 15, 60, 15]);
  }
  function advBurst() {
    var host = $("#adv-burst"); host.innerHTML = "";
    var pal = ["#5b3df0", "#ff3d81", "#ffb020", "#12c8d6", "#27c96a", "#8a5bff"];
    for (var i = 0; i < 46; i++) { var c = el("span", "confetti"); c.style.left = randInt(100) + "%"; c.style.background = pal[randInt(pal.length)]; c.style.animationDuration = (1.5 + Math.random() * 1.5) + "s"; c.style.animationDelay = (Math.random() * .3) + "s"; host.appendChild(c); }
    setTimeout(function () { host.innerHTML = ""; }, 3400);
  }

  /* --- adventure drawing --- */
  function advDraw() {
    var x = advCtx; x.save();
    var sx = adv.shakeT > 0 ? (Math.random() * 2 - 1) * 6 : 0, sy = adv.shakeT > 0 ? (Math.random() * 2 - 1) * 4 : 0;
    x.clearRect(0, 0, AW, AH); x.translate(sx, sy);
    var sky = x.createLinearGradient(0, 0, 0, AH); sky.addColorStop(0, "#8fd3ff"); sky.addColorStop(1, "#d9f3ff");
    x.fillStyle = sky; x.fillRect(-10, -10, AW + 20, AH + 20);
    x.fillStyle = "rgba(255,240,170,.9)"; x.beginPath(); x.arc(760, 90, 44, 0, 7); x.fill();
    x.fillStyle = "rgba(255,255,255,.9)";
    for (var i = 0; i < 4; i++) { var cxp = ((i * 260 - (adv.cam * .15 + adv.cloud)) % (AW + 300)); if (cxp < -150) cxp += AW + 300; aCloud(x, cxp, 70 + (i % 2) * 40); }
    aHills(x, adv.cam * .25, 300, "#bfe6a8"); aHills(x, adv.cam * .45, 350, "#a3d98a");
    x.fillStyle = "#8bd06a"; x.fillRect(-10, AGROUND + 18, AW + 20, AH); x.fillStyle = "#7cc659"; x.fillRect(-10, AGROUND + 18, AW + 20, 10);
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    for (var b = 0; b < adv.bushes.length; b++) { var bx = adv.bushes[b].x - adv.cam; if (bx > -60 && bx < AW + 60) { x.font = "46px system-ui"; x.fillText("🌿", bx, AGROUND + 16); } }
    for (var k = 0; k < adv.coinsList.length; k++) { var co = adv.coinsList[k]; if (co.got) continue; var csx = co.x - adv.cam; if (csx > -40 && csx < AW + 40) { x.font = "30px system-ui"; x.fillText("🪙", csx, co.y); } }
    for (var g = adv.next; g < adv.total; g++) { if (adv.solved[g]) continue; var gx = aGateX(g) - adv.cam; if (gx > -80 && gx < AW + 120) aGate(x, gx); }
    var castX = aGateX(adv.total) - adv.cam; if (castX > -120 && castX < AW + 160) { x.font = "96px system-ui"; x.fillText("🏰", castX, AGROUND + 6); }
    var bob = adv.hero.ground ? Math.abs(Math.sin(adv.hero.run * 6)) * 6 : 0;
    x.fillStyle = "rgba(0,0,0,.18)"; x.beginPath(); x.ellipse(adv.hero.x, AGROUND + 10, 26, 8, 0, 0, 7); x.fill();
    x.font = "54px system-ui"; x.fillText(adv.heroEm, adv.hero.x, adv.hero.y - bob + 8);
    for (var q = 0; q < adv.particles.length; q++) { var pt = adv.particles[q]; x.globalAlpha = Math.max(0, pt.life); x.font = "22px system-ui"; x.fillText("🪙", pt.x, pt.y); x.globalAlpha = 1; }
    x.restore();
    // HUD
    x.textAlign = "left"; x.textBaseline = "alphabetic"; x.font = "26px system-ui";
    var hh = ""; for (var h = 0; h < START_HEARTS; h++) hh += h < adv.hearts ? "❤️" : "🤍"; x.fillText(hh, 14, 38);
    x.fillStyle = "rgba(40,20,80,.9)"; x.font = "700 22px ui-rounded,system-ui,sans-serif"; x.textAlign = "right"; x.fillText("🪙 " + adv.coins, AW - 14, 38);
    x.textAlign = "center"; x.fillStyle = "rgba(40,20,80,.72)"; x.font = "700 18px ui-rounded,system-ui,sans-serif"; x.fillText("Gate " + Math.min(adv.next + 1, adv.total) + " / " + adv.total, AW / 2, 32);
  }
  function aCloud(x, cx, cy) { x.beginPath(); x.arc(cx, cy, 26, 0, 7); x.arc(cx + 30, cy - 10, 32, 0, 7); x.arc(cx + 66, cy, 26, 0, 7); x.rect(cx - 6, cy, 78, 26); x.fill(); }
  function aHills(x, off, base, col) { x.fillStyle = col; x.beginPath(); x.moveTo(-10, AGROUND + 20); for (var px = -10; px <= AW + 10; px += 40) { var y = base - Math.sin((px + off) * .007) * 46 - Math.cos((px + off) * .013) * 20; x.lineTo(px, y); } x.lineTo(AW + 10, AGROUND + 20); x.closePath(); x.fill(); }
  function aGate(x, gx) {
    x.fillStyle = "#9b8bbf"; x.fillRect(gx - 6, AGROUND - 120, 12, 138); x.fillRect(gx + 64, AGROUND - 120, 12, 138);
    x.fillStyle = "#b7a9d6"; x.fillRect(gx - 14, AGROUND - 132, 98, 16);
    x.font = "52px system-ui"; x.textAlign = "center"; x.fillText("👹", gx + 35, AGROUND + 6);
  }

  /* ---------------- init / wiring ---------------- */
  function init() {
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

    $("#daily-challenge").addEventListener("click", function () { sTap(); startAdventure(); });

    // adventure controls
    function advHome() { advStop(); renderHome(); show("home"); }
    $("#adv-quit").addEventListener("click", function () { sTap(); advHome(); });
    $("#adv-win-home").addEventListener("click", function () { sTap(); advHome(); });
    $("#adv-fail-home").addEventListener("click", function () { sTap(); advHome(); });
    $("#adv-win-again").addEventListener("click", function () { sTap(); startAdventure(); });
    $("#adv-fail-retry").addEventListener("click", function () { sTap(); startAdventure(); });
    $("#adv-keypad").addEventListener("click", function (e) { var b = e.target.closest(".key"); if (b) { ac(); advKey(b.getAttribute("data-k")); } });
    $("#adv-canvas").addEventListener("pointerdown", function () { ac(); advJump(); });
    $("#quiz-start").addEventListener("click", function () { sTap(); ac(); startPlay({ tables: state.quizTables.slice(), len: state.quizLen, mode: state.quizMode, isDaily: false }); });
    $("#practice-start").addEventListener("click", function () { sTap(); startPractice(deckFromTables(state.practiceTables)); });
    $("#practice-weak").addEventListener("click", function () { sTap(); startPractice(weakFacts(15)); });

    $("#play-quit").addEventListener("click", function () { sTap(); renderHome(); show("home"); });
    $("#results-again").addEventListener("click", function () { sTap(); if (state.lastStart) startPlay(state.lastStart); else { renderHome(); show("home"); } });

    // keypad
    $all(".key").forEach(function (k) { k.addEventListener("click", function () { sTap(); keypad(k.getAttribute("data-key")); }); });
    document.addEventListener("keydown", function (e) {
      if ($(".screen--adv").classList.contains("is-active") && adv && adv.state === "gate") {
        if (e.key >= "0" && e.key <= "9") advKey(e.key);
        else if (e.key === "Backspace") advKey("del");
        else if (e.key === "Enter") advKey("enter");
        return;
      }
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
    st.addEventListener("click", function () { soundOn = !soundOn; saveSound(); st.textContent = soundOn ? "🔊" : "🔈"; if (soundOn) { ac(); sTap(); } });
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

  // test hook (harmless in production)
  window.__adv = {
    get state() { return adv ? adv.state : null; }, get q() { return adv ? adv.question : null; },
    get hearts() { return adv ? adv.hearts : null; }, get coins() { return adv ? adv.coins : null; },
    get next() { return adv ? adv.next : null; }, get total() { return adv ? adv.total : null; },
  };
})();
