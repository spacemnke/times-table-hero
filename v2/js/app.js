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
      { id: "nova", name: "NOVA", cost: 22, power: "star", note: "STARTS SUPER" }
    ];
    function charPower(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i].power || null; return null; }
    // one signature trap per world; caught => solve a bonus question to escape
    var TRAP_BY_WORLD = ["bush", "plant", "mouse", "net", "ice", "vine", "hoop", "cage"];
    var TRAP_LABEL = { bush: "SPIKY BUSH!", plant: "CHOMP PLANT!", mouse: "MOUSE TRAP!", net: "CAUGHT IN A NET!", ice: "FROZEN SOLID!", vine: "VINE SNARE!", hoop: "RING OF FIRE!", cage: "CAGED — CRACK THE CODE!" };
    // segment layout archetypes for variety
    var CHUNKS = ["boxes", "hop", "gauntlet", "trapchunk", "moving", "coinarc"];

    function resize() {
      var w = cv.clientWidth || Math.min(window.innerWidth, 540), h = cv.clientHeight || window.innerHeight;
      LH = 760; LW = Math.round(760 * w / h); GROUND = Math.round(LH * 0.70); HEROX = Math.round(LW * 0.20);
      PIXH = 300; PIXW = Math.max(120, Math.round(PIXH * w / h)); sx = PIXH / LH;
      cv.width = PIXW; cv.height = PIXH;
      x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false;
      if (G && G.hero && G.hero.ground) G.hero.y = GROUND;
    }

    function config(n) {
      return {
        speed: 200 + (n - 1) * 18, pit: 145 + (n - 1) * 26, enemySpeed: 58 + (n - 1) * 16,
        moving: n >= 2, hearts: 3,
        trapType: TRAP_BY_WORLD[(n - 1) % 8],
        trapChance: Math.min(0.95, 0.6 + (n - 1) * 0.05),   // more traps deeper
        enemyChance: Math.min(0.95, 0.5 + (n - 1) * 0.07),
        gemChance: 0.5
      };
    }

    function reset(n, keepHearts) {
      level = n; var cf = config(n); var th = THEMES[(n - 1) % THEMES.length];
      cf.gates = clamp(progress.settings.dailyGoal, 6, 12);   // a world run = (most of) the day's quest
      var power = charPower(HEROTYPE);
      var maxH = cf.hearts + (power === "heart" ? 1 : 0);
      G = {
        cf: cf, theme: th, state: "run", cam: 0, speed: cf.speed, t: 0,
        maxHearts: maxH, hearts: (keepHearts != null ? keepHearts : maxH), coins: 0, gemRun: 0, nextGate: 0,
        power: power, jumpBoost: power === "jump",
        hero: { wx: HEROX, y: GROUND, vy: 0, ground: true, hold: false, dbl: false, coyote: 0, inv: 0, power: power === "star" ? 6 : 0, run: 0 },
        question: null, input: "", lastCP: HEROX, particles: [], cloud: 0, shakeT: 0, dash: 0, qStart: 0,
        correct: 0, wrong: 0, combo: 0, xpEarned: 0, goalMet: false, levelBefore: levelFromXp(progress.xp), trapIndex: -1,
        deck: buildQuestions(focusTables(), clamp(progress.settings.dailyGoal, 6, 12)), deckI: 0,
        grounds: [], platforms: [], boxes: [], coinsA: [], enemies: [], flags: [], gates: [], star: null, castleX: 0, props: [], flowers: [], traps: [], gemsA: []
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
      // varied content per segment — archetype rotates by segment AND level so no two runs feel the same
      for (seg = 0; seg < gx.length; seg++) {
        var b = gx[seg] - SEG; if (b <= 200) continue;
        addChunk(CHUNKS[(seg * 3 + level * 2 + seg) % CHUNKS.length], b, seg, cf);
      }
      // signature trap per world — first two zones always trapped so every run meets one early; a 2nd appears deeper
      for (seg = 1; seg < gx.length; seg++) {
        var bt = gx[seg] - SEG; if (bt <= 200) continue;
        if (seg <= 2 || Math.random() < cf.trapChance) G.traps.push({ x: bt + SEG * 0.34, type: cf.trapType, done: false, sprung: false });
        if (level >= 3 && Math.random() < cf.trapChance - 0.3) G.traps.push({ x: bt + SEG * 0.80, type: cf.trapType, done: false, sprung: false });
      }
      // shiny purple coins: rare, placed high so you must jump for them
      for (seg = 1; seg < gx.length; seg++) { if (seg % 2 === 0 && Math.random() < cf.gemChance) G.gemsA.push({ x: gx[seg] - SEG * 0.72, hAbove: 300 + (seg % 3) * 22, got: false }); }
      if (!G.gemsA.length) G.gemsA.push({ x: gx[Math.min(1, gx.length - 1)] - SEG * 0.72, hAbove: 320, got: false });
      var mid2 = Math.floor(gx.length / 2); G.star = { x: gx[mid2] - SEG * 0.2, hAbove: 170, taken: false };
      G.flags = [{ x: HEROX, hit: true, raise: 1 }]; for (var f = 0; f < gx.length; f++) { G.flags.push({ x: gx[f] - SEG * 0.5, hit: false, raise: 0, half: true }); }
      for (var trp = 0; trp < 90; trp++) G.props.push({ x: trp * 250 + ((trp * 71) % 160), s: 52 + ((trp * 53) % 30) });
      for (var fl = 0; fl < 220; fl++) G.flowers.push({ x: fl * 84 + ((fl * 37) % 56), k: fl % 3 });
    }
    function addChunk(kind, b, seg, cf) {
      var q, c;
      if (kind === "boxes") { for (q = 0; q < 3; q++) G.boxes.push({ x: b + 300 + q * 64, hAbove: 250, w: 52, h: 48, used: false }); for (c = 0; c < 4; c++) G.coinsA.push({ x: b + 540 + c * 48, hAbove: 46, got: false }); }
      else if (kind === "hop") { G.platforms.push({ x: b + 520, hAbove: 150, w: 130, mv: false, amp: 0, period: 2, phase: 0 }); G.platforms.push({ x: b + 820, hAbove: 250, w: 130, mv: false, amp: 0, period: 2, phase: 1 }); for (c = 0; c < 3; c++) G.coinsA.push({ x: b + 560 + c * 40, hAbove: 210, got: false }); for (c = 0; c < 3; c++) G.coinsA.push({ x: b + 860 + c * 40, hAbove: 300, got: false }); }
      else if (kind === "gauntlet") { G.enemies.push({ x1: b + 520, x2: b + 760, x: b + 520, dir: 1, alive: true }); if (Math.random() < cf.enemyChance) G.enemies.push({ x1: b + 900, x2: b + 1160, x: b + 1160, dir: -1, alive: true }); for (c = 0; c < 5; c++) G.coinsA.push({ x: b + 520 + c * 70, hAbove: 52, got: false }); }
      else if (kind === "moving") { G.platforms.push({ x: b + 700, hAbove: 210, w: 150, mv: cf.moving, amp: cf.moving ? 100 : 0, period: 2.2, phase: seg }); for (c = 0; c < 3; c++) G.coinsA.push({ x: b + 730 + c * 50, hAbove: 270, got: false }); G.boxes.push({ x: b + 360, hAbove: 250, w: 52, h: 48, used: false }); }
      else if (kind === "trapchunk") { for (q = 0; q < 2; q++) G.boxes.push({ x: b + 620 + q * 64, hAbove: 250, w: 52, h: 48, used: false }); for (c = 0; c < 5; c++) G.coinsA.push({ x: b + 300 + c * 44, hAbove: 50, got: false }); if (Math.random() < cf.enemyChance) G.enemies.push({ x1: b + 980, x2: b + 1200, x: b + 980, dir: 1, alive: true }); }
      else { for (c = 0; c < 7; c++) G.coinsA.push({ x: b + 400 + c * 60, hAbove: 60 + Math.round(Math.sin(c / 6 * Math.PI) * 220), got: false }); G.boxes.push({ x: b + 900, hAbove: 250, w: 52, h: 48, used: false }); }
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
        setTimeout(function () {
          if (!running || !G) return; mathHide(); box.className = ""; G.state = "run"; G.dash = .85; G.nextGate++; G.input = "";
          hint(G.nextGate >= G.gates.length ? "DASH TO THE CASTLE!" : "NICE! KEEP GOING");
        }, 380);
      } else {
        G.wrong++; G.combo = 0; G.hearts--; box.className = "bad"; aBad(); haptic([10, 40, 10]); G.shakeT = .35; G.input = ""; mdisp(); save();
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
      aHurt(); haptic([20, 40, 20]); G.shakeT = .4;
      $("#adv-sheet").classList.add("escape"); setSheetTag("◆ " + (TRAP_LABEL[tr.type] || "TRAPPED!") + " — SOLVE TO ESCAPE ◆");
      $("#adv-mq").textContent = G.question.a + " × " + G.question.b; mdisp(); mathShow(); hint("");
    }
    function endEscape() { $("#adv-sheet").classList.remove("escape"); setSheetTag("◆ GATE — SOLVE TO PASS ◆"); mathHide(); }
    function restartLevel() { var hh = G.hearts; reset(level, hh); hudShow(true); hint("RESTART! TRY AGAIN"); }
    function escapeSubmit(v) {
      var q = G.question, ans = q.a * q.b, ms = Date.now() - G.qStart, correct = v === ans, box = $("#adv-mabox");
      recordAnswer(q.a, q.b, correct, ms);
      if (correct) {
        box.className = "good"; aGood(); haptic(12);
        var tr = G.traps[G.trapIndex]; if (tr) tr.done = true;
        addCoins(3); coinBurst(G.hero.wx, G.hero.y - 50);
        setTimeout(function () { if (!running || !G) return; box.className = ""; endEscape(); G.state = "run"; G.hero.inv = 1.6; G.hero.wx += 46; G.dash = .4; G.input = ""; hint("PHEW! KEEP GOING"); }, 360);
      } else {
        G.wrong++; G.hearts--; box.className = "bad"; aBad(); haptic([12, 50, 12]); G.shakeT = .4; G.input = ""; mdisp(); save();
        setTimeout(function () {
          if (!G) return; box.className = ""; endEscape();
          if (G.hearts <= 0) { G.state = "fail"; openOv("adv-failOv"); } else restartLevel();
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
    function startLevel(n) { hideAllOv(); reset(n); hudShow(true); hint("TAP = JUMP · HOLD = HIGHER · TAP AGAIN = DOUBLE"); }

    /* ---- loop (physics) ---- */
    var last = 0;
    function frame(ts) {
      if (!running) { looping = false; return; }
      var dt = Math.min(.045, (ts - (last || ts)) / 1000); last = ts;
      if (G) {
        G.cloud += dt * 14; G.t += dt; var h = G.hero;
        if (G.state === "run") {
          var sp = G.speed * (1 + G.dash); G.dash = Math.max(0, G.dash - dt * 1.6); h.wx += sp * dt; h.run += dt * sp * .03;
          var g = (h.hold && h.vy < 0) ? 1500 : 2700; h.vy += g * dt;
          if (h.coyote > 0) h.coyote -= dt; if (h.inv > 0) h.inv -= dt; if (h.power > 0) h.power = Math.max(0, h.power - dt);
          var ny = h.y + h.vy * dt, landTop = null;
          for (var i = 0; i < G.platforms.length; i++) { var p = G.platforms[i]; var top = platTop(p); if (h.wx >= p.x && h.wx <= p.x + p.w && h.vy >= 0 && h.y <= top + 4 && ny >= top) { if (landTop === null || top < landTop) landTop = top; } }
          if (landTop === null) { if ((groundAt(h.wx) || TEST) && h.vy >= 0 && ny >= GROUND && h.y <= GROUND + 4) landTop = GROUND; }
          if (landTop !== null) { h.y = landTop; h.vy = 0; h.ground = true; h.dbl = false; h.coyote = .1; } else { if (h.ground) h.coyote = .1; h.ground = false; h.y = ny; }
          var headY = h.y - HEROSIZE * 0.9;
          for (var b = 0; b < G.boxes.length; b++) { var bx = G.boxes[b]; if (bx.used) continue; var by = GROUND - bx.hAbove; if (h.vy < 0 && h.wx >= bx.x - 8 && h.wx <= bx.x + bx.w + 8 && headY <= by + bx.h && headY >= by - 12) { bx.used = true; bx.pop = .2; h.vy = 80; addCoins(1); aCoin(); G.particles.push({ wx: bx.x + bx.w / 2, y: by - 14, vx: 0, vy: -220, life: .7, kind: "coin" }); } }
          if (G.star && !G.star.taken) { var syv = GROUND - G.star.hAbove; if (Math.abs(G.star.x - h.wx) < 50 && Math.abs(syv - (h.y - 40)) < 66) { G.star.taken = true; h.power = 6.5; aStar(); haptic([12, 30, 12]); } }
          for (var k = 0; k < G.coinsA.length; k++) { var co = G.coinsA[k]; if (co.got) continue; var cy = GROUND - co.hAbove; var dx = co.x - h.wx, dy = cy - (h.y - 40); if (h.power > 0 && Math.abs(dx) < 300 && Math.abs(dy) < 300) { co.x -= dx * Math.min(1, dt * 9); co.hAbove += dy * Math.min(1, dt * 9); } if (Math.abs(co.x - h.wx) < 38 && Math.abs((GROUND - co.hAbove) - (h.y - 40)) < 54) { co.got = true; addCoins(1); aCoin(); } }
          for (var e = 0; e < G.enemies.length; e++) { var en = G.enemies[e]; if (!en.alive) continue; en.x += en.dir * G.cf.enemySpeed * dt; if (en.x < en.x1) { en.x = en.x1; en.dir = 1; } if (en.x > en.x2) { en.x = en.x2; en.dir = -1; } var eTop = GROUND - 52; if (Math.abs(en.x - h.wx) < 40) { if (h.power > 0) { en.alive = false; addCoins(3); aStomp(); coinBurst(en.x, eTop); } else if (h.vy > 0 && h.y <= eTop + 22 && h.y >= eTop - 40) { en.alive = false; h.vy = -620; addCoins(3); aStomp(); haptic(15); coinBurst(en.x, eTop); } else if (!TEST && h.inv <= 0 && h.y > eTop - 28) { hurt(); } } }
          // shiny purple coins (magnetised while super)
          for (var gm = 0; gm < G.gemsA.length; gm++) { var ge = G.gemsA[gm]; if (ge.got) continue; var gyv = GROUND - ge.hAbove; var gdx = ge.x - h.wx, gdy = gyv - (h.y - 40); if (h.power > 0 && Math.abs(gdx) < 320 && Math.abs(gdy) < 320) { ge.x -= gdx * Math.min(1, dt * 8); ge.hAbove += gdy * Math.min(1, dt * 8); } if (Math.abs(ge.x - h.wx) < 42 && Math.abs((GROUND - ge.hAbove) - (h.y - 40)) < 60) { ge.got = true; progress.gems = (progress.gems || 0) + 1; G.gemRun++; aStar(); haptic([10, 20, 10]); coinBurst(ge.x, GROUND - ge.hAbove); save(); } }
          // traps: run into one on the ground and you're caught (jump over to dodge; smash through while super)
          for (var tp = 0; tp < G.traps.length; tp++) { var trp2 = G.traps[tp]; if (trp2.done) continue; if (Math.abs(trp2.x - h.wx) < 34 && h.y > GROUND - 26) { if (h.power > 0) { trp2.done = true; addCoins(2); aStomp(); coinBurst(trp2.x, GROUND - 40); } else if (!TEST) { springTrap(tp); break; } } }
          for (var f = 0; f < G.flags.length; f++) { var fl = G.flags[f]; if (!fl.hit && h.wx >= fl.x) { fl.hit = true; G.lastCP = fl.x; aFlag(); } }
          if (h.y > GROUND + 420) respawn();
          if (G.nextGate < G.gates.length) { var ga = G.gates[G.nextGate]; if (!ga.solved && h.wx >= ga.x - 52) { h.wx = ga.x - 52; arrive(); } } else if (h.wx >= G.castleX - 80) { win(); }
          if (h.power > 0 && Math.random() < .5) sparkle(h.wx, h.y - HEROSIZE * 0.4);
        }
        for (var f2 = 0; f2 < G.flags.length; f2++) { var fg = G.flags[f2]; if (fg.hit && fg.raise < 1) fg.raise = Math.min(1, fg.raise + dt * 3); }
        for (var p2 = G.particles.length - 1; p2 >= 0; p2--) { var pt = G.particles[p2]; pt.wx += pt.vx * dt; pt.vy += 1600 * dt; pt.y += pt.vy * dt; pt.life -= dt * 1.1; if (pt.life <= 0) G.particles.splice(p2, 1); }
        if (G.shakeT > 0) G.shakeT -= dt; G.cam = h.wx - HEROX; draw(); hudUpdate();
      }
      requestAnimationFrame(frame);
    }
    function hurt() { G.hearts--; G.hero.inv = 1.3; G.hero.vy = -460; G.shakeT = .3; aHurt(); haptic([12, 40, 12]); if (G.hearts <= 0) { G.state = "fail"; openOv("adv-failOv"); } }
    function respawn() { var h = G.hero; h.wx = G.lastCP; h.y = GROUND; h.vy = 0; h.inv = 1; h.ground = true; }
    function arrive() { G.state = "gate"; G.question = nextQ(); G.input = ""; G.qStart = Date.now(); mdisp(); $("#adv-mq").textContent = G.question.a + " × " + G.question.b; mathShow(); hint(""); }
    function win() {
      G.state = "win"; aWin(); haptic([15, 60, 15, 60, 15]);
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
      nova: { rows: [".......S......", "t.....SSS.....", ".tt..SSSSS....", "..ttSSSSSSS...", "...SSSSSSSSS..", "..SSSSSoSSSS..", "...SSSSSSSS...", "...SS...SS....", "..SS.....SS...", ".SS.......SS..", "..............", ".............."], map: { S: "#ffe14a", o: "#7a5a00", t: "#ff9ec7" } }
    };
    var heroBuf = document.createElement("canvas"); heroBuf.width = 14; heroBuf.height = 12; var hbx = heroBuf.getContext("2d");
    function drawHeroPix(g, bx, by, B, type) { var H = HERO_MAP[type] || HERO_MAP.unicorn; hbx.clearRect(0, 0, 14, 12); spr(hbx, 0, 0, H.rows, H.map); g.imageSmoothingEnabled = false; g.drawImage(heroBuf, 0, 0, 14, 12, bx, by, 14 * B, 12 * B); }

    function draw() {
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
      for (var s = 0; s < G.grounds.length; s++) { var sp = G.grounds[s]; var gx1 = FX(sp[0]), gx2 = FX(sp[1]); if (gx2 < -4 || gx1 > W + 4) continue; P(gx1, gY, gx2 - gx1, H - gY + 4, th.dirt); P(gx1, gY, gx2 - gx1, SZ(8), th.grass); for (var d = Math.floor(sp[0] / 60) * 60; d < sp[1]; d += 60) { var dl = FX(d); if (dl > gx1 && dl < gx2) P(dl, gY + SZ(8), 1, H, th.dirtL); } }
      if (th.water) { for (var s2 = 0; s2 < G.grounds.length - 1; s2++) { var wa = FX(G.grounds[s2][1]), wb = FX(G.grounds[s2 + 1][0]); if (wb < -4 || wa > W + 4) continue; P(wa, gY + SZ(4), wb - wa, H, th.water); for (var wv = wa; wv < wb; wv += 6) P(wv + ((G.t * 20) % 6), gY + SZ(6), 3, 1, "#ffffff"); } }
      for (var tr = 0; tr < G.props.length; tr++) { var t2 = G.props[tr]; var tx = FX(t2.x * 1); if (tx < -30 || tx > W + 30) continue; if (groundAt(t2.x)) pxProp(th.prop, tx, gY, SZ(t2.s), th); }
      for (var p = 0; p < G.platforms.length; p++) { var pl = G.platforms[p]; var px = FX(pl.x), pw = SZ(pl.w); if (px > W + 8 || px + pw < -8) continue; var ptp = FY(platTop(pl)); P(px, ptp, pw, SZ(18), "#a9713f"); P(px, ptp, pw, SZ(5), th.h1); P(px, ptp + SZ(14), pw, SZ(4), "#7a4a24"); }
      for (var b = 0; b < G.boxes.length; b++) { var bx = G.boxes[b]; var bxs = FX(bx.x), bpop = bx.pop ? SZ(bx.pop * 36) : 0; if (bxs > W + 8 || bxs < -8) continue; pxBox(bxs, FY(GROUND - bx.hAbove) - bpop, SZ(bx.w), SZ(bx.h), bx.used); if (bx.pop) bx.pop = Math.max(0, bx.pop - .03); }
      for (var f = 0; f < G.flags.length; f++) { var fl = G.flags[f]; var fxs = FX(fl.x); if (fxs > W + 8 || fxs < -8) continue; pxFlag(fxs, gY, fl.raise || 0, fl.half); }
      if (G.star && !G.star.taken) { var stx = FX(G.star.x), sty = FY(GROUND - G.star.hAbove) + Math.round(Math.sin(G.t * 3) * 3); pxStar(stx, sty, SZ(20)); }
      for (var k = 0; k < G.coinsA.length; k++) { var co = G.coinsA[k]; if (co.got) continue; var cxs = FX(co.x); if (cxs > W + 8 || cxs < -8) continue; pxCoin(cxs, FY(GROUND - co.hAbove), G.t * 6 + co.x); }
      for (var g2 = G.nextGate; g2 < G.gates.length; g2++) { var ga = G.gates[g2]; if (ga.solved) continue; var gxs = FX(ga.x); if (gxs > W + 16 || gxs < -16) continue; pxGate(gxs, gY); }
      var castxs = FX(G.castleX); if (castxs < W + 30 && castxs > -30) pxCastle(castxs, gY);
      for (var e2 = 0; e2 < G.enemies.length; e2++) { var en = G.enemies[e2]; if (!en.alive) continue; var exs = FX(en.x); if (exs > W + 8 || exs < -8) continue; pxEnemy(exs, gY, en.dir); }
      for (var tpi = 0; tpi < G.traps.length; tpi++) { var trp3 = G.traps[tpi]; if (trp3.done) continue; var txs = FX(trp3.x); if (txs > W + 24 || txs < -24) continue; pxTrap(trp3.type, txs, gY, G.t + trp3.x * 0.01, trp3.sprung); }
      for (var gmi = 0; gmi < G.gemsA.length; gmi++) { var ge2 = G.gemsA[gmi]; if (ge2.got) continue; var gxs = FX(ge2.x); if (gxs > W + 10 || gxs < -10) continue; pxGem(gxs, FY(GROUND - ge2.hAbove), G.t * 5 + ge2.x); }
      if (!th.night) for (var fw = 0; fw < G.flowers.length; fw++) { var fo = G.flowers[fw]; var foX = FX(fo.x); if (foX < -4 || foX > W + 4) continue; if (groundAt(fo.x)) pxFlower(foX, gY + SZ(6), fo.k); }
      var h = G.hero; if (!(h.inv > 0 && Math.floor(G.t * 16) % 2)) { var B = Math.max(2, Math.round(PIXW * 0.15 / 14)); var hbxp = FX(h.wx) - 7 * B, hby = FY(h.y) - 12 * B + SZ(2); if (h.power > 0) { disc(FX(h.wx), FY(h.y) - 6 * B, 9 * B, "rgba(255," + (120 + Math.floor(Math.sin(G.t * 20) * 80)) + ",240,.25)"); } drawHeroPix(x, hbxp, hby, B, HEROTYPE); }
      for (var q = 0; q < G.particles.length; q++) { var ptc = G.particles[q]; if (ptc.life <= 0) continue; var ppx = FX(ptc.wx), ppy = FY(ptc.y); if (ptc.kind === "coin") pxCoin(ppx, ppy, ptc.wx); else P(ppx, ppy, 2, 2, ptc.kind === "star" ? "#ffe14a" : "#ffffff"); }
      x.restore();
      x.globalAlpha = .08; for (var y2 = 0; y2 < H; y2 += 2) P(0, y2, W, 1, "#000"); x.globalAlpha = 1;
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
    function pxBox(px, py, w, h, used) { var main = used ? "#b39b7a" : C.box, hi = used ? "#c9b48f" : C.boxHi, lo = used ? "#8f7a4f" : C.boxLo; P(px, py, w, h, main); P(px, py, w, SZ(3), hi); P(px, py + h - SZ(3), w, SZ(3), lo); P(px, py, SZ(3), h, hi); P(px + w - SZ(3), py, SZ(3), h, lo); if (!used) { var cx = px + w / 2, cy = py + h / 2; P(cx - SZ(3), cy - SZ(6), SZ(6), SZ(3), "#fff"); P(cx + SZ(1), cy - SZ(3), SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy, SZ(3), SZ(3), "#fff"); P(cx - SZ(2), cy + SZ(4), SZ(3), SZ(2), "#fff"); } }
    function pxFlag(fxs, gY, raise, half) { var poleH = SZ(52); P(fxs, gY - poleH, SZ(2), poleH, C.pole); var fy = gY - poleH + Math.round((1 - raise) * (poleH - SZ(14))); var col = raise >= 1 ? (half ? "#ffca3a" : "#3ad44a") : "#7a7a9a"; P(fxs + SZ(2), fy, SZ(12), SZ(9), col); }
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
      else if (type === "hoop") { for (var a = 0; a < 14; a++) { var an = a / 14 * 6.283; P(cx + Math.round(Math.cos(an) * SZ(26)) - SZ(3), gY - SZ(32) + Math.round(Math.sin(an) * SZ(26)) - SZ(3), SZ(7), SZ(7), (a + Math.floor(ph * 6)) % 2 ? "#ff5a1a" : "#ffd23f"); } disc(cx, gY - SZ(32), SZ(14), "rgba(255,120,30,.25)"); }
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
      var info = $("#adv-gemInfo"); if (info) info.textContent = "◆ " + gems + " purple coins — grab them to unlock heroes!";
    }
    function redrawPmapHero() { var pg = $("#adv-pmapHero").getContext("2d"); pg.imageSmoothingEnabled = false; pg.clearRect(0, 0, 12, 12); heroMarkPix(pg); }

    /* ---- lifecycle ---- */
    function enter() { show("adventure"); resize(); running = true; if (!looping) { looping = true; last = 0; requestAnimationFrame(frame); } }
    function leave() { running = false; }
    function startDaily() {
      HEROTYPE = progress.hero || "unicorn"; unlocked = Math.max(1, progress.worldsUnlocked || 1);
      enter(); hideAllOv(); reset(1); G.state = "map"; buildCharRow(); buildMap(); redrawPmapHero(); hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden");
    }
    function openMap() { unlocked = Math.max(1, progress.worldsUnlocked || 1); hideAllOv(); if (G) G.state = "map"; buildMap(); hudShow(false); mathHide(); $("#adv-mapOv").classList.remove("hidden"); }
    function exitHome() { leave(); renderHome(); show("home"); }

    function advInit() {
      cv = $("#adv-c"); x = cv.getContext("2d");
      var ci = $("#adv-coin-icon"); ci.width = 8; ci.height = 8; var cig = ci.getContext("2d"); cig.imageSmoothingEnabled = false; coinPix(cig);
      window.addEventListener("resize", function () { if (running) resize(); });
      cv.addEventListener("pointerdown", function () { ac(); jump(); });
      cv.addEventListener("pointerup", jumpRelease);
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
      get gems() { return progress.gems || 0; }, get level() { return level; },
      start: function (n) { startLevel(n || 1); }, openMap: openMap,
      forceTrap: function () { if (!G) return; G.traps.push({ x: G.hero.wx, type: G.cf.trapType, done: false, sprung: false }); springTrap(G.traps.length - 1); },
      setHero: function (id) { HEROTYPE = id; if (progress) { progress.hero = id; } }, buildCharRow: buildCharRow,
      get trapsX() { return G ? G.traps.map(function (t) { return Math.round(t.x); }) : []; },
      get gemsX() { return G ? G.gemsA.map(function (g) { return Math.round(g.x); }) : []; },
      get chunks() { return G ? G.gates.length : 0; },
      warp: function (wx) { if (G) { while (G.nextGate < G.gates.length && G.gates[G.nextGate].x < wx - 60) { G.gates[G.nextGate].solved = true; G.nextGate++; } G.hero.wx = wx; G.hero.y = GROUND; G.hero.ground = true; G.hero.vy = 0; G.cam = wx - HEROX; } },
      unwarp: function () {}
    };

    return { init: advInit, startDaily: startDaily, exitHome: exitHome };
  })();

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

})();
