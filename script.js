/* /game2script.js
   Major Or Minor?! (single triad quality)
   - audio/{stem}{octave}.mp3
   - Squarespace iframe sizing preserved
*/
(() => {
  "use strict";

  const AUDIO_DIR = "audio";

  const CHORD_PLAY_SEC = 4.6;
  const FADE_OUT_SEC = 0.12;

  // Delay between Begin/Next and chord playback (editable)
  const ROUND_START_DELAY_SEC = 0.35;

  const LIMITER_THRESHOLD_DB = -6;

  const PC_TO_STEM = {
    0: "c",
    1: "csharp",
    2: "d",
    3: "dsharp",
    4: "e",
    5: "f",
    6: "fsharp",
    7: "g",
    8: "gsharp",
    9: "a",
    10: "asharp",
    11: "b",
  };

  const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PC_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  // Root ranges (always within C3..C6, as requested)
  const RANGES = {
    "easy-1oct": { label: "Root Range: 1 Octave", startOctave: 4, octaves: 1 },
    "med-2oct":  { label: "Root Range: 2 Octaves", startOctave: 3, octaves: 2 },
    "hard-3oct": { label: "Root Range: 3 Octaves", startOctave: 3, octaves: 3 },
  };

  // Lock root range UI + default to 3 octaves (hard-3oct)
  const LOCKED_ROOT_RANGE = "hard-3oct";

  const $ = (id) => document.getElementById(id);

  const beginBtn = $("beginBtn");
  const replayBtn = $("replayBtn");
  const minorBtn = $("minorBtn");
  const majorBtn = $("majorBtn");
  const minorRefBtn = $("minorRefBtn");
  const majorRefBtn = $("majorRefBtn");
  const nextBtn = $("nextBtn");
  const downloadScoreBtn = $("downloadScoreBtn");
  const noteRangeSel = $("noteRange");
  const feedbackOut = $("feedbackOut");
  const scoreOut = $("scoreOut");
  const miniMount = $("miniMount");
  const introText = $("introText");

  const comparePanel = $("comparePanel");
  const compareMajorBtn = $("compareMajorBtn");
  const compareMinorBtn = $("compareMinorBtn");

  const streakModal = $("streakModal");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalClose = $("modalClose");
  const modalDownload = $("modalDownload");

  const infoBtn = $("infoBtn");
  const infoModal = $("infoModal");
  const infoClose = $("infoClose");
  const infoOk = $("infoOk");
  const PARENT_ORIGIN = "https://www.eartraininglab.com"; // <-- set to your real domain


  function showInfo() {
    infoModal?.classList.remove("hidden");
  }

  function hideInfo() {
    infoModal?.classList.add("hidden");
  }

  infoBtn?.addEventListener("click", showInfo);
  infoClose?.addEventListener("click", hideInfo);
  infoOk?.addEventListener("click", hideInfo);

  // Close if user clicks the overlay (outside card)
  infoModal?.addEventListener("click", (e) => {
    if (e.target === infoModal) hideInfo();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !infoModal?.classList.contains("hidden")) hideInfo();
  });

  if (
    !beginBtn || !replayBtn || !minorBtn || !majorBtn || !nextBtn ||
    !downloadScoreBtn || !feedbackOut || !scoreOut || !miniMount
  ) {
    const msg = "UI mismatch: required elements missing. Ensure index.html matches script.js ids.";
    if (feedbackOut) feedbackOut.textContent = msg;
    else alert(msg);
    return;
  }

  // Enforce fixed root range (3 octaves) and hide selector in the UI.
  if (noteRangeSel) {
    noteRangeSel.value = LOCKED_ROOT_RANGE;
    noteRangeSel.disabled = true;
    noteRangeSel.parentElement?.classList?.add("hidden");
  }

  function setIntroVisible(visible) {
    if (!introText) return;
    introText.classList.toggle("hidden", !visible);
  }

  function setCompareVisible(visible, rootName = "X") {
    if (!comparePanel || !compareMajorBtn || !compareMinorBtn) return;

    const safeRoot = String(rootName || "X");
    compareMajorBtn.textContent = `Hear ${safeRoot} Major`;
    compareMinorBtn.textContent = `Hear ${safeRoot} Minor`;

    comparePanel.classList.toggle("hidden", !visible);
  }

  function refreshComparePanel() {
    if (!chord || !awaitingNext) {
      setCompareVisible(false);
      return;
    }
    const rootName = noteNameForPc(pcFromPitch(chord.rootPitch));
    setCompareVisible(true, rootName);
  }

  // ---------------- iframe sizing ----------------
  let lastHeight = 0;

  function measureDocHeightPx() {
    const de = document.documentElement;
    const b = document.body;
    const h = Math.max(
      de ? de.scrollHeight : 0,
      b ? b.scrollHeight : 0,
      de ? Math.ceil(de.getBoundingClientRect().height) : 0,
      b ? Math.ceil(b.getBoundingClientRect().height) : 0
    );
    return Math.max(0, Math.ceil(h));
  }

  const ro = new ResizeObserver(() => {
    const height = measureDocHeightPx();
    if (height && height !== lastHeight) {
      parent.postMessage({ iframeHeight: height }, PARENT_ORIGIN);
      lastHeight = height;
    }
  });

  ro.observe(document.documentElement);
  if (document.body) ro.observe(document.body);

  function postHeightNow() {
    try {
      const h = measureDocHeightPx();
      if (h) parent.postMessage({ iframeHeight: h }, PARENT_ORIGIN);
    } catch {}
  }

  window.addEventListener("load", () => {
    postHeightNow();
    setTimeout(postHeightNow, 250);
    setTimeout(postHeightNow, 1000);
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(postHeightNow, 100);
    setTimeout(postHeightNow, 500);
  });

  // ---------------- audio ----------------
  let audioCtx = null;
  let masterGain = null;
  let limiter = null;

  const bufferPromiseCache = new Map();
  const activeVoices = new Set();

  function ensureAudioGraph() {
    if (audioCtx) return audioCtx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      alert("Your browser doesn’t support Web Audio (required for playback).");
      return null;
    }

    audioCtx = new Ctx();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;

    limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.12;

    masterGain.connect(limiter);
    limiter.connect(audioCtx.destination);

    return audioCtx;
  }

  async function resumeAudioIfNeeded() {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
  }

  function stopAllNotes(fadeSec = 0.06) {
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    const now = ctx.currentTime;
    const fade = Math.max(0.02, Number.isFinite(fadeSec) ? fadeSec : 0.06);

    for (const v of Array.from(activeVoices)) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fade / 6);
        const stopAt = Math.max(now + fade, (v.startTime || now) + 0.001);
        v.src.stop(stopAt + 0.02);
      } catch {}
    }
  }

  function trackVoice(src, gain, startTime) {
    const voice = { src, gain, startTime };
    activeVoices.add(voice);
    src.onended = () => activeVoices.delete(voice);
    return voice;
  }

  function noteUrl(stem, octaveNum) {
    return `${AUDIO_DIR}/${stem}${octaveNum}.mp3`;
  }

  function loadBuffer(url) {
    if (bufferPromiseCache.has(url)) return bufferPromiseCache.get(url);

    const p = (async () => {
      const ctx = ensureAudioGraph();
      if (!ctx) return null;

      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch {
        return null;
      }
    })();

    bufferPromiseCache.set(url, p);
    return p;
  }

  function playBufferWindowed(buffer, whenSec, playSec, fadeOutSec, gain = 1) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const g = ctx.createGain();

    const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);
    const fadeIn = 0.01;
    const endAt = whenSec + Math.max(0.05, playSec);

    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);

    const fadeStart = Math.max(whenSec + 0.02, endAt - Math.max(0.06, fadeOutSec));
    g.gain.setValueAtTime(safeGain, fadeStart);
    g.gain.linearRampToValueAtTime(0, endAt);

    src.connect(g);
    g.connect(masterGain);

    trackVoice(src, g, whenSec);
    src.start(whenSec);
    src.stop(endAt + 0.03);

    return src;
  }

  function pitchFromPcOct(pc, oct) { return (oct * 12) + pc; }
  function pcFromPitch(p) { return ((p % 12) + 12) % 12; }
  function octFromPitch(p) { return Math.floor(p / 12); }
  function getStemForPc(pc) { return PC_TO_STEM[(pc + 12) % 12] || null; }

  function noteNameForPc(pc) {
    const p = ((pc % 12) + 12) % 12;
    const isAcc = [1, 3, 6, 8, 10].includes(p);
    if (!isAcc) return PC_NAMES_SHARP[p];
    return `${PC_NAMES_SHARP[p]}/${PC_NAMES_FLAT[p]}`;
  }

  function chordNotesLabel(pitches) {
    const pcs = pitches.map(pcFromPitch);
    const uniq = [];
    for (const pc of pcs) if (!uniq.includes(pc)) uniq.push(pc);
    return uniq.map(noteNameForPc).join(", ");
  }

  async function loadPitchBuffer(pitch) {
    const pc = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    const stem = getStemForPc(pc);
    if (!stem) return null;
    const url = noteUrl(stem, oct);
    const buf = await loadBuffer(url);
    if (!buf) return { missingUrl: url, buffer: null };
    return { missingUrl: null, buffer: buf };
  }

  async function playChordWindowed(pitches, whenSec, playSec, fadeOutSec) {
    await resumeAudioIfNeeded();

    const results = await Promise.all(pitches.map((p) => loadPitchBuffer(p)));
    const missing = results.find((r) => r && r.missingUrl);
    if (missing?.missingUrl) {
      setFeedback(`Missing audio: <code>${missing.missingUrl}</code>`);
      return false;
    }

    const bufs = results.map((r) => r?.buffer).filter(Boolean);
    if (!bufs.length) return false;

    const perNoteGain = 0.75 / Math.max(1, bufs.length);
    for (let i = 0; i < bufs.length; i++) {
      playBufferWindowed(bufs[i], whenSec, playSec, fadeOutSec, perNoteGain);
    }

    return true;
  }

  // ---------------- mini chord diagram ----------------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs = {}, children = []) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const ch of children) n.appendChild(ch);
    return n;
  }

  function makeMiniDiagram(pitches) {
    // Simple triad diagram (3 stacked dots + note names)
    const w = 380;
    const h = 120;

    const svg = el("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}` });

    const bg = el("rect", { x: 0, y: 0, width: w, height: h, rx: 14, fill: "#fff" });
    const border = el("rect", { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: 14, fill: "none", stroke: "rgba(0,0,0,.15)" });

    const title = el("text", { x: 16, y: 26, "font-size": 14, "font-weight": 900, fill: "#111" });
    title.textContent = "Chord tones";

    const pcs = pitches.map(pcFromPitch);
    const names = pcs.map(noteNameForPc);

    const baseY = 54;
    const dotX = 22;
    const textX = 44;

    for (let i = 0; i < names.length; i++) {
      const y = baseY + (i * 22);
      const dot = el("circle", { cx: dotX, cy: y - 5, r: 6, fill: "var(--chordTone)", stroke: "rgba(0,0,0,.2)" });
      const t = el("text", { x: textX, y, "font-size": 14, "font-weight": 900, fill: "#111" });
      t.textContent = names[i];
      svg.appendChild(dot);
      svg.appendChild(t);
    }

    svg.appendChild(bg);
    svg.appendChild(border);
    svg.appendChild(title);

    return svg;
  }

  function renderMiniDiagram(pitches) {
    if (!miniMount) return;
    miniMount.innerHTML = "";
    miniMount.appendChild(makeMiniDiagram(pitches));
  }

  // ---------------- game state ----------------
  let chord = null;          // { rootPitch, quality, pitches[] }
  let awaitingAnswer = false;
  let awaitingNext = false;

  const score = {
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    total: 0,
  };

  function setFeedback(html) {
    feedbackOut.innerHTML = html;
  }

  function updateScoreUI() {
    scoreOut.textContent =
      `Correct: ${score.correct}\n` +
      `Wrong: ${score.wrong}\n` +
      `Streak: ${score.streak}\n` +
      `Best: ${score.bestStreak}\n` +
      `Total: ${score.total}`;
  }

  function setButtons({ canBegin, canReplay, canAnswer, canNext }) {
    beginBtn.disabled = !canBegin;
    replayBtn.disabled = !canReplay;
    minorBtn.disabled = !canAnswer;
    majorBtn.disabled = !canAnswer;
    nextBtn.disabled = !canNext;

    beginBtn.classList.toggle("pulse", canBegin);
  }

  function setNextStyled(styled) {
    nextBtn.classList.toggle("nextStyled", styled);
    nextBtn.classList.toggle("nextPulse", styled);
  }

  function randomInt(minInclusive, maxInclusive) {
    const a = Math.ceil(minInclusive);
    const b = Math.floor(maxInclusive);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function pickRandomRootPitch() {
    const r = RANGES[LOCKED_ROOT_RANGE] || RANGES["hard-3oct"];
    const startOct = r.startOctave;
    const octaves = r.octaves;

    const pc = randomInt(0, 11);
    const oct = randomInt(startOct, startOct + (octaves - 1));

    return pitchFromPcOct(pc, oct);
  }

  function buildTriad(rootPitch, quality) {
    // Root position triad intervals:
    // Major: 0, +4, +7
    // Minor: 0, +3, +7
    const third = quality === "maj" ? 4 : 3;
    const fifth = 7;
    const pitches = [rootPitch, rootPitch + third, rootPitch + fifth];
    return { rootPitch, quality, pitches };
  }

  function randomChord() {
    const root = pickRandomRootPitch();
    const quality = Math.random() < 0.5 ? "maj" : "min";
    return buildTriad(root, quality);
  }

  async function playCurrentChord() {
    if (!chord) return;

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotes(0.04);

    const when = ctx.currentTime + 0.02;
    await playChordWindowed(chord.pitches, when, CHORD_PLAY_SEC, FADE_OUT_SEC);

    renderMiniDiagram(chord.pitches);
  }

  function showPrompt() {
    const rootName = noteNameForPc(pcFromPitch(chord.rootPitch));
    setFeedback(`What quality is this triad? (Root: <strong>${rootName}</strong>)`);
  }

  function revealAnswer(userQuality) {
    if (!chord) return;

    const isCorrect = userQuality === chord.quality;
    score.total += 1;

    if (isCorrect) {
      score.correct += 1;
      score.streak += 1;
      score.bestStreak = Math.max(score.bestStreak, score.streak);
    } else {
      score.wrong += 1;
      score.streak = 0;
    }

    updateScoreUI();

    const rootName = noteNameForPc(pcFromPitch(chord.rootPitch));
    const qualityLabel = chord.quality === "maj" ? "Major" : "Minor";
    const userLabel = userQuality === "maj" ? "Major" : "Minor";

    const notes = chordNotesLabel(chord.pitches);

    setFeedback(
      `<div><strong>${isCorrect ? "✅ Correct!" : "❌ Wrong."}</strong></div>` +
      `<div>Root: <strong>${rootName}</strong></div>` +
      `<div>Answer: <strong>${qualityLabel}</strong> (you chose ${userLabel})</div>` +
      `<div>Notes: <strong>${notes}</strong></div>`
    );

    awaitingAnswer = false;
    awaitingNext = true;

    setButtons({ canBegin: false, canReplay: true, canAnswer: false, canNext: true });
    setNextStyled(true);

    refreshComparePanel();
  }

  function startRound() {
    chord = randomChord();

    awaitingAnswer = false;
    awaitingNext = false;

    setIntroVisible(false);

    setButtons({ canBegin: false, canReplay: false, canAnswer: false, canNext: false });
    setNextStyled(false);

    renderMiniDiagram(chord.pitches);
    setFeedback("Listen…");

    setTimeout(async () => {
      await playCurrentChord();
      awaitingAnswer = true;

      showPrompt();
      setButtons({ canBegin: false, canReplay: true, canAnswer: true, canNext: false });

      // Enable pulse animations on answer buttons
      minorBtn.classList.add("answerPulseMinor");
      majorBtn.classList.add("answerPulseMajor");
    }, Math.max(0, ROUND_START_DELAY_SEC) * 1000);
  }

  function nextRound() {
    chord = null;
    awaitingAnswer = false;
    awaitingNext = false;

    minorBtn.classList.remove("answerPulseMinor");
    majorBtn.classList.remove("answerPulseMajor");

    setCompareVisible(false);
    setNextStyled(false);

    startRound();
  }

  function beginGame() {
    score.correct = 0;
    score.wrong = 0;
    score.streak = 0;
    score.bestStreak = 0;
    score.total = 0;

    updateScoreUI();

    beginBtn.classList.remove("pulse");
    startRound();
  }

  // ---------------- compare panel ----------------
  async function playCompare(quality) {
    if (!chord) return;

    const compareTriad = buildTriad(chord.rootPitch, quality);
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotes(0.04);

    const when = ctx.currentTime + 0.02;
    await playChordWindowed(compareTriad.pitches, when, CHORD_PLAY_SEC, FADE_OUT_SEC);

    renderMiniDiagram(compareTriad.pitches);
  }

  compareMajorBtn?.addEventListener("click", () => playCompare("maj"));
  compareMinorBtn?.addEventListener("click", () => playCompare("min"));

  // ---------------- streak modal ----------------
  function showStreakModal() {
    if (!streakModal || !modalTitle || !modalBody) return;

    modalTitle.textContent = "Nice streak!";
    modalBody.innerHTML =
      `<p>Your current streak is <strong>${score.streak}</strong>.</p>` +
      `<p>Best streak: <strong>${score.bestStreak}</strong>.</p>`;

    streakModal.classList.remove("hidden");
  }

  function hideStreakModal() {
    streakModal?.classList.add("hidden");
  }

  modalClose?.addEventListener("click", hideStreakModal);

  // Close if user clicks the overlay (outside card)
  streakModal?.addEventListener("click", (e) => {
    if (e.target === streakModal) hideStreakModal();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !streakModal?.classList.contains("hidden")) hideStreakModal();
  });

  // ---------------- score card download ----------------
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function scoreCardText() {
    return (
      "Major Or Minor?!\n" +
      "================\n\n" +
      `Correct: ${score.correct}\n` +
      `Wrong: ${score.wrong}\n` +
      `Streak: ${score.streak}\n` +
      `Best streak: ${score.bestStreak}\n` +
      `Total: ${score.total}\n`
    );
  }

  function downloadScoreCard() {
    downloadText("major-or-minor-score.txt", scoreCardText());
  }

  downloadScoreBtn.addEventListener("click", downloadScoreCard);
  modalDownload?.addEventListener("click", downloadScoreCard);

  // ---------------- interactions ----------------
  beginBtn.addEventListener("click", beginGame);

  replayBtn.addEventListener("click", async () => {
    await playCurrentChord();
  });

  minorBtn.addEventListener("click", () => {
    if (!awaitingAnswer) return;
    revealAnswer("min");
  });

  majorBtn.addEventListener("click", () => {
    if (!awaitingAnswer) return;
    revealAnswer("maj");
  });

  minorRefBtn?.addEventListener("click", () => playCompare("min"));
  majorRefBtn?.addEventListener("click", () => playCompare("maj"));

  nextBtn.addEventListener("click", () => {
    if (!awaitingNext) return;
    nextRound();
  });

  // Keyboard shortcuts:
  // R = replay, Left = minor, Right = major, Space = next
  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    const k = e.key;

    if (k === "r" || k === "R") {
      replayBtn.click();
      return;
    }

    if (k === "ArrowLeft") {
      minorBtn.click();
      return;
    }

    if (k === "ArrowRight") {
      majorBtn.click();
      return;
    }

    if (k === " " || k === "Spacebar") {
      nextBtn.click();
      return;
    }
  });

  // Initial UI state
  setButtons({ canBegin: true, canReplay: false, canAnswer: false, canNext: false });
  setNextStyled(false);
  updateScoreUI();
})();
