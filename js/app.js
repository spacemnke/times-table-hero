/* Times Table Hero — vanilla JS, no build step. */
(function () {
  "use strict";

  var MAX = 12;
  var STORE_KEY = "tth.progress.v1";
  var SOUND_KEY = "tth.sound.v1";

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var state = {
    practiceTables: [],
    quizTables: [],
    quizLen: 10,
    // active quiz
    quiz: null,
    // active practice
    practiceDeck: [],
    practiceIndex: 0,
    lastMode: "quiz",
  };

  var progress = loadProgress();
  var soundOn = loadSound();

  /* ------------------------------------------------------------------ */
  /* Tiny helpers                                                         */
  /* ------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function randInt(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { totalStars: 0, best: {} }; // best[table] = { pct, stars }
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {}
  }
  function loadSound() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; }
  }
  function saveSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Sound (WebAudio, gentle)                                            */
  /* ------------------------------------------------------------------ */
  var audioCtx = null;
  function ac() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }
  function tone(freq, dur, type, when, vol) {
    if (!soundOn) return;
    var ctx = ac();
    if (!ctx) return;
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function sndGood() { tone(660, 0.12, "sine", 0); tone(880, 0.16, "sine", 0.1); }
  function sndWrong() { tone(200, 0.22, "sine", 0); }
  function sndTap() { tone(520, 0.06, "triangle", 0, 0.1); }
  function sndWin() {
    [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.18, "sine", i * 0.12); });
  }
  function sndFlip() { tone(440, 0.08, "triangle", 0, 0.12); }

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */
  function show(name) {
    $all(".screen").forEach(function (s) {
      s.classList.toggle("is-active", s.getAttribute("data-screen") === name);
    });
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (e) {
    var goEl = e.target.closest("[data-go]");
    if (goEl) {
      var dest = goEl.getAttribute("data-go");
      sndTap();
      route(dest);
    }
  });

  function route(dest) {
    if (dest === "home") { refreshHome(); show("home"); }
    else if (dest === "learn") { show("learn"); }
    else if (dest === "practice-setup") { show("practice-setup"); }
    else if (dest === "quiz-setup") { show("quiz-setup"); }
    else if (dest === "progress") { renderProgress(); show("progress"); }
    else show(dest);
  }

  /* ------------------------------------------------------------------ */
  /* Home                                                                */
  /* ------------------------------------------------------------------ */
  function refreshHome() {
    var n = progress.totalStars || 0;
    $("#home-star-count").textContent = n + (n === 1 ? " star" : " stars");
  }

  /* ------------------------------------------------------------------ */
  /* Learn                                                               */
  /* ------------------------------------------------------------------ */
  function buildLearnPicker() {
    var grid = $("#learn-picker");
    grid.innerHTML = "";
    for (var i = 1; i <= MAX; i++) {
      (function (n) {
        var b = el("button", "num-btn", String(n));
        b.addEventListener("click", function () { sndTap(); showTable(n); });
        grid.appendChild(b);
      })(i);
    }
  }
  function showTable(n) {
    var list = $("#learn-table");
    list.innerHTML = "";
    for (var i = 1; i <= MAX; i++) {
      var row = el("div", "table-row");
      row.style.animationDelay = (i * 0.03) + "s";
      row.appendChild(el("span", null, n + " × " + i));
      row.appendChild(el("span", "eq", "="));
      row.appendChild(el("span", "res", String(n * i)));
      list.appendChild(row);
    }
    list.hidden = false;
    $("#learn-picker").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------------ */
  /* Multi-select pickers (practice + quiz)                              */
  /* ------------------------------------------------------------------ */
  function buildMultiPicker(gridId, tablesArr, onChange) {
    var grid = $(gridId);
    grid.innerHTML = "";
    for (var i = 1; i <= MAX; i++) {
      (function (n) {
        var b = el("button", "num-btn", String(n));
        b.setAttribute("data-n", n);
        b.addEventListener("click", function () {
          sndTap();
          var idx = tablesArr.indexOf(n);
          if (idx >= 0) { tablesArr.splice(idx, 1); b.classList.remove("is-selected"); }
          else { tablesArr.push(n); b.classList.add("is-selected"); }
          onChange();
        });
        grid.appendChild(b);
      })(i);
    }
  }
  function syncPickerUI(gridId, tablesArr) {
    $all(".num-btn", $(gridId)).forEach(function (b) {
      var n = parseInt(b.getAttribute("data-n"), 10);
      b.classList.toggle("is-selected", tablesArr.indexOf(n) >= 0);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Practice (flashcards)                                               */
  /* ------------------------------------------------------------------ */
  function startPractice() {
    var deck = [];
    state.practiceTables.forEach(function (t) {
      for (var i = 1; i <= MAX; i++) deck.push([t, i]);
    });
    shuffle(deck);
    state.practiceDeck = deck;
    state.practiceIndex = 0;
    show("practice");
    renderFlashcard();
  }
  function renderFlashcard() {
    if (state.practiceIndex >= state.practiceDeck.length) {
      shuffle(state.practiceDeck);
      state.practiceIndex = 0;
    }
    var card = state.practiceDeck[state.practiceIndex];
    $("#flash-q").textContent = card[0] + " × " + card[1];
    var a = $("#flash-a");
    a.textContent = card[0] * card[1];
    a.hidden = true;
    $("#flash-hint").hidden = false;
    $("#flash-reveal").hidden = false;
    $("#flash-next").hidden = true;
  }
  function revealFlashcard() {
    $("#flash-a").hidden = false;
    $("#flash-hint").hidden = true;
    $("#flash-reveal").hidden = true;
    $("#flash-next").hidden = false;
    sndFlip();
    haptic(10);
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                */
  /* ------------------------------------------------------------------ */
  function buildQuizQuestions() {
    var pool = [];
    state.quizTables.forEach(function (t) {
      for (var i = 1; i <= MAX; i++) pool.push([t, i]);
    });
    shuffle(pool);
    var qs = [];
    var want = state.quizLen;
    // draw without immediate repeats; loop pool if needed
    var seen = {};
    var idx = 0;
    while (qs.length < want) {
      if (idx >= pool.length) { shuffle(pool); idx = 0; }
      var p = pool[idx++];
      var key = p[0] + "x" + p[1];
      // avoid dup in the same quiz when pool is big enough
      if (pool.length >= want && seen[key]) continue;
      seen[key] = true;
      qs.push(p);
    }
    return qs;
  }
  function makeOptions(answer) {
    var opts = [answer];
    var guard = 0;
    while (opts.length < 4 && guard++ < 50) {
      var delta = randInt(11) - 5; // -5..5
      var cand = answer + delta;
      if (cand === answer) cand = answer + (randInt(2) ? 1 : -1) * (randInt(3) + 1);
      if (cand < 0) cand = answer + randInt(6) + 1;
      if (opts.indexOf(cand) < 0) opts.push(cand);
    }
    // fallback fill
    var extra = 1;
    while (opts.length < 4) { if (opts.indexOf(answer + extra) < 0) opts.push(answer + extra); extra++; }
    return shuffle(opts);
  }
  function startQuiz() {
    state.quiz = {
      questions: buildQuizQuestions(),
      i: 0,
      correct: 0,
      answered: false,
    };
    show("quiz");
    renderQuestion();
  }
  function renderQuestion() {
    var q = state.quiz;
    q.answered = false;
    var pair = q.questions[q.i];
    var answer = pair[0] * pair[1];
    $("#quiz-question").textContent = pair[0] + " × " + pair[1];
    $("#quiz-score").textContent = "⭐️ " + q.correct;
    $("#quiz-bar").style.width = ((q.i) / q.questions.length * 100) + "%";
    $("#quiz-feedback").textContent = "";
    $("#quiz-feedback").className = "feedback";

    var wrap = $("#quiz-answers");
    wrap.innerHTML = "";
    makeOptions(answer).forEach(function (opt) {
      var b = el("button", "answer", String(opt));
      b.addEventListener("click", function () { onAnswer(b, opt, answer); });
      wrap.appendChild(b);
    });
  }
  function onAnswer(btn, chosen, answer) {
    var q = state.quiz;
    if (q.answered) return;
    q.answered = true;
    var buttons = $all(".answer", $("#quiz-answers"));
    buttons.forEach(function (b) { b.disabled = true; });

    var fb = $("#quiz-feedback");
    if (chosen === answer) {
      btn.classList.add("is-correct");
      q.correct++;
      $("#quiz-score").textContent = "⭐️ " + q.correct;
      fb.textContent = pick(["Yes! 🎉", "Nailed it! ⭐️", "Awesome! 🙌", "Correct! 💫", "Superstar! 🌟"]);
      fb.className = "feedback good";
      sndGood(); haptic(12);
    } else {
      btn.classList.add("is-wrong");
      fb.textContent = "It's " + answer + " 💜";
      fb.className = "feedback bad";
      sndWrong(); haptic([12, 40, 12]);
      // highlight the correct one
      buttons.forEach(function (b) { if (parseInt(b.textContent, 10) === answer) b.classList.add("is-correct"); });
    }

    setTimeout(function () {
      q.i++;
      if (q.i >= q.questions.length) finishQuiz();
      else renderQuestion();
    }, chosen === answer ? 750 : 1350);
  }
  function pick(arr) { return arr[randInt(arr.length)]; }

  function starsFor(pct) {
    if (pct >= 100) return 3;
    if (pct >= 80) return 2;
    if (pct >= 60) return 1;
    return 0;
  }
  function finishQuiz() {
    var q = state.quiz;
    var total = q.questions.length;
    var pct = Math.round((q.correct / total) * 100);
    var earned = starsFor(pct);

    // record stars only as *new* best per involved tables set is tricky;
    // we credit the practiced tables and add earned stars to the total.
    progress.totalStars = (progress.totalStars || 0) + earned;
    state.quizTables.forEach(function (t) {
      var prev = progress.best[t] || { pct: 0, stars: 0 };
      if (pct > prev.pct) progress.best[t] = { pct: pct, stars: Math.max(prev.stars, starsFor(pct)) };
    });
    saveProgress();

    // results screen
    $("#results-score").textContent = q.correct + " / " + total;
    var starRow = "";
    for (var i = 0; i < 3; i++) starRow += i < earned ? "⭐️" : "☆";
    $("#results-stars").textContent = starRow;

    var title, msg;
    if (pct === 100) { title = "PERFECT! 🏆"; msg = "Every single one correct. You're a Times Table Hero!"; }
    else if (pct >= 80) { title = "Amazing! 🌟"; msg = "So close to perfect — brilliant work!"; }
    else if (pct >= 60) { title = "Great going! 🎈"; msg = "You're getting stronger every time. Keep it up!"; }
    else { title = "Nice try! 💪"; msg = "Practice makes perfect. Let's try those again!"; }
    $("#results-title").textContent = title;
    $("#results-msg").textContent = msg;

    show("results");
    if (earned >= 2) { sndWin(); burst(); haptic([15, 60, 15, 60, 15]); }
    else if (earned === 1) { sndGood(); }
  }

  function burst() {
    var host = $("#results-burst");
    host.innerHTML = "";
    var palette = ["#6c4ce0", "#ff5c8a", "#ff9f43", "#4ea1ff", "#29c48a", "#ffd83d"];
    for (var i = 0; i < 60; i++) {
      var c = el("span", "confetti");
      c.style.left = randInt(100) + "%";
      c.style.background = palette[randInt(palette.length)];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + "s";
      c.style.animationDelay = (Math.random() * 0.4) + "s";
      c.style.transform = "rotate(" + randInt(360) + "deg)";
      host.appendChild(c);
    }
    setTimeout(function () { host.innerHTML = ""; }, 3600);
  }

  /* ------------------------------------------------------------------ */
  /* Progress screen                                                     */
  /* ------------------------------------------------------------------ */
  function renderProgress() {
    $("#progress-total").textContent = progress.totalStars || 0;
    var grid = $("#mastery-grid");
    grid.innerHTML = "";
    for (var n = 1; n <= MAX; n++) {
      var best = progress.best[n];
      var cell = el("div", "mastery-cell");
      cell.appendChild(el("div", "mastery-cell__n", String(n)));
      var stars = el("div", "mastery-cell__stars");
      var s = best ? starsFor(best.pct) : 0;
      var row = "";
      for (var i = 0; i < 3; i++) row += i < s ? "⭐️" : "☆";
      stars.textContent = row;
      cell.appendChild(stars);
      cell.appendChild(el("div", "mastery-cell__pct", best ? best.pct + "%" : "—"));
      grid.appendChild(cell);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wire up static controls                                             */
  /* ------------------------------------------------------------------ */
  function init() {
    buildLearnPicker();

    buildMultiPicker("#practice-picker", state.practiceTables, function () {
      $("#practice-start").disabled = state.practiceTables.length === 0;
    });
    buildMultiPicker("#quiz-picker", state.quizTables, function () {
      $("#quiz-start").disabled = state.quizTables.length === 0;
    });

    // select all / clear
    $all("[data-select-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sndTap();
        var which = btn.getAttribute("data-select-all");
        var arr = which === "practice" ? state.practiceTables : state.quizTables;
        arr.length = 0;
        for (var i = 1; i <= MAX; i++) arr.push(i);
        syncPickerUI(which === "practice" ? "#practice-picker" : "#quiz-picker", arr);
        $("#" + which + "-start").disabled = false;
      });
    });
    $all("[data-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sndTap();
        var which = btn.getAttribute("data-clear");
        var arr = which === "practice" ? state.practiceTables : state.quizTables;
        arr.length = 0;
        syncPickerUI(which === "practice" ? "#practice-picker" : "#quiz-picker", arr);
        $("#" + which + "-start").disabled = true;
      });
    });

    // quiz length
    $all(".chip--len").forEach(function (chip) {
      chip.addEventListener("click", function () {
        sndTap();
        $all(".chip--len").forEach(function (c) { c.classList.remove("is-on"); });
        chip.classList.add("is-on");
        state.quizLen = parseInt(chip.getAttribute("data-len"), 10);
      });
    });

    // start buttons
    $("#practice-start").addEventListener("click", function () { state.lastMode = "practice"; sndTap(); startPractice(); });
    $("#quiz-start").addEventListener("click", function () { state.lastMode = "quiz"; sndTap(); startQuiz(); });

    // flashcard interactions
    $("#flashcard").addEventListener("click", function () {
      if ($("#flash-a").hidden) revealFlashcard();
    });
    $("#flash-reveal").addEventListener("click", function (e) { e.stopPropagation(); revealFlashcard(); });
    $("#flash-next").addEventListener("click", function (e) {
      e.stopPropagation(); sndTap();
      state.practiceIndex++;
      renderFlashcard();
    });

    // results
    $("#results-again").addEventListener("click", function () {
      sndTap();
      if (state.lastMode === "practice") startPractice();
      else startQuiz();
    });

    // reset progress
    $("#reset-progress").addEventListener("click", function () {
      if (window.confirm("Reset all stars and progress?")) {
        progress = { totalStars: 0, best: {} };
        saveProgress();
        renderProgress();
        refreshHome();
      }
    });

    // sound toggle
    var st = $("#sound-toggle");
    st.textContent = soundOn ? "🔊" : "🔈";
    st.addEventListener("click", function () {
      soundOn = !soundOn;
      saveSound();
      st.textContent = soundOn ? "🔊" : "🔈";
      if (soundOn) { ac(); sndTap(); }
    });
    // resume audio on first touch (iOS)
    document.addEventListener("touchstart", function once() {
      ac(); document.removeEventListener("touchstart", once);
    }, { passive: true });

    refreshHome();
    show("home");
  }

  document.addEventListener("DOMContentLoaded", init);

  /* ------------------------------------------------------------------ */
  /* Service worker                                                      */
  /* ------------------------------------------------------------------ */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }
})();
