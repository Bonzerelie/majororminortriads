/* /script.js
   Major Or Minor?! (single triad quality)
   - audio/{stem}{octave}.mp3
   - Squarespace iframe sizing + scroll forwarding preserved
*/
(() => {
  "use strict";

  const AUDIO_DIR = "audio";

  const CHORD_PLAY_SEC = 4.6;
  const FADE_OUT_SEC = 0.12;
  const ROUND_START_DELAY_SEC = 0.35;
  const LIMITER_THRESHOLD_DB = -3; // Increased headroom

  const UI_SND_SELECT = "select1.mp3";
  const UI_SND_BACK = "back1.mp3";
  const UI_SND_CORRECT = "correct1.mp3";
  const UI_SND_INCORRECT = "incorrect1.mp3";

  const PC_TO_STEM = {
    0: "c", 1: "csharp", 2: "d", 3: "dsharp", 4: "e", 5: "f",
    6: "fsharp", 7: "g", 8: "gsharp", 9: "a", 10: "asharp", 11: "b",
  };

  const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PC_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  const RANGES = {
    "easy-1oct": { label: "Root Range: 1 Octave", startOctave: 4, octaves: 1 },
    "med-2oct":  { label: "Root Range: 2 Octaves", startOctave: 3, octaves: 2 },
    "hard-3oct": { label: "Root Range: 3 Octaves", startOctave: 3, octaves: 3 },
  };

  const LOCKED_ROOT_RANGE = "hard-3oct";

  const $ = (id) => document.getElementById(id);

  const titleWrap = $("titleWrap");
  const titleImgWide = $("titleImgWide");
  const titleImgWrapped = $("titleImgWrapped");

  const beginBtn = $("beginBtn");
  const replayBtn = $("replayBtn");
  const minorBtn = $("minorBtn");
  const majorBtn = $("majorBtn");
  const minorRefBtn = $("minorRefBtn");
  const majorRefBtn = $("majorRefBtn");
  const nextBtn = $("nextBtn");
  
  const feedbackOut = $("feedbackOut");
  const miniMount = $("miniMount");

  const compareSection = $("compareSection");
  const compareMinorBtn = $("compareMinorBtn");
  const compareMajorBtn = $("compareMajorBtn");

  const introModal = $("introModal");
  const introBeginBtn = $("introBeginBtn");
  const scoreModal = $("scoreModal");
  const scoreModalContinueBtn = $("scoreModalContinueBtn");

  const streakModal = $("streakModal");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalClose = $("modalClose");
  const modalDownload = $("modalDownload");

  const infoBtn = $("infoBtn");
  const infoModal = $("infoModal");
  const infoClose = $("infoClose");
  const infoOk = $("infoOk");

  const playerNameInput = $("playerNameInput");
  const downloadScorecardBtn = $("downloadScorecardBtn");
  const modalPlayerNameInput = $("modalPlayerNameInput");
  const modalDownloadScorecardBtn = $("modalDownloadScorecardBtn");

  // ---------- dynamic title resizing ----------
  function setTitleMode(mode) {
    if (!titleWrap) return;
    titleWrap.classList.toggle("titleModeWide", mode === "wide");
    titleWrap.classList.toggle("titleModeWrapped", mode === "wrapped");
  }
  function computeDesiredWideWidthPx() {
    const cssMax = 600;
    const natural = titleImgWide?.naturalWidth || cssMax;
    return Math.min(cssMax, natural);
  }
  function updateTitleForWidth() {
    if (!titleWrap || !titleImgWide || !titleImgWrapped) return;
    const available = Math.floor(titleWrap.getBoundingClientRect().width);
    const desiredWide = computeDesiredWideWidthPx();
    if (available + 1 < desiredWide) setTitleMode("wrapped");
    else setTitleMode("wide");
  }

  function syncNames(val) {
    if (playerNameInput && playerNameInput.value !== val) playerNameInput.value = val;
    if (modalPlayerNameInput && modalPlayerNameInput.value !== val) modalPlayerNameInput.value = val;
  }
  playerNameInput?.addEventListener("input", (e) => syncNames(e.target.value));
  modalPlayerNameInput?.addEventListener("input", (e) => syncNames(e.target.value));

  let lastFocusEl = null;
  function openModal(modalEl) {
    lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalEl?.classList.remove("hidden");
    postHeightNow();
  }
  function closeModal(modalEl) {
    modalEl?.classList.add("hidden");
    postHeightNow();
    if (lastFocusEl) {
      try { lastFocusEl.focus(); } catch {}
    }
  }

  function showInfo() { openModal(infoModal); }
  function hideInfo() { closeModal(infoModal); }

  infoBtn?.addEventListener("click", () => { playUiSound(UI_SND_SELECT); showInfo(); });
  infoClose?.addEventListener("click", () => { playUiSound(UI_SND_BACK); hideInfo(); });
  infoOk?.addEventListener("click", () => { playUiSound(UI_SND_BACK); hideInfo(); });

  [infoModal, introModal].forEach((m) => {
    m?.addEventListener("click", (e) => {
      if (e.target === m) {
        playUiSound(UI_SND_BACK);
        if (m === infoModal) hideInfo();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !infoModal?.classList.contains("hidden")) {
      playUiSound(UI_SND_BACK);
      hideInfo();
    }
  });

  let lastHeight = 0;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height = Math.ceil(entry.contentRect.height);
      if (height !== lastHeight) {
        parent.postMessage({ iframeHeight: height }, "*");
        lastHeight = height;
      }
    }
  });
  ro.observe(document.documentElement);

  function postHeightNow() {
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ iframeHeight: h }, "*");
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
  const activeUiAudios = new Set();

  function ensureAudioGraph() {
    if (audioCtx) return audioCtx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    audioCtx = new Ctx();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0; // Boosted base output

    limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

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
    activeVoices.clear();
  }
  
  function stopAllUiSounds() {
    for (const a of Array.from(activeUiAudios)) {
      try { a.pause(); a.currentTime = 0; } catch {}
      activeUiAudios.delete(a);
    }
  }

  function stopAllAudio() {
    stopAllNotes(0.04);
    stopAllUiSounds();
  }

  function stopAllNotesWithUi(fadeSec = 0.05) {
    stopAllNotes(fadeSec);
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

  async function playUiSound(filename) {
    try {
      stopAllAudio(); 
      const url = `${AUDIO_DIR}/${filename}`;
      const buffer = await loadBuffer(url);
      if (!buffer) return;
      const ctx = ensureAudioGraph();
      if (!ctx) return;
      
      const when = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(2.0, when); // Mixed down for balance

      src.connect(g);
      g.connect(masterGain);
      trackVoice(src, g, when);
      src.start(when);
    } catch (e) { console.error("UI Sound error:", e); }
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

    const perNoteGain = 0.80; // Allows chords to naturally ring loud, while limiter prevents clipping
    for (let i = 0; i < bufs.length; i++) {
      playBufferWindowed(bufs[i], whenSec, playSec, fadeOutSec, perNoteGain);
    }
    return true;
  }

  async function playReferenceChord(quality) {
    playUiSound(UI_SND_SELECT);
    await resumeAudioIfNeeded();
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotesWithUi(0.08);

    const root = pitchFromPcOct(0, 4); // C4
    const third = root + (quality === "major" ? 4 : 3);
    const fifth = root + 7;

    const whenSec = ctx.currentTime + 0.03;
    await playChordWindowed([root, third, fifth], whenSec, 2.2, FADE_OUT_SEC);
  }

  async function playCompareChord(quality) {
    if (!started || !chord) return;
    playUiSound(UI_SND_SELECT);
    await resumeAudioIfNeeded();
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotesWithUi(0.08);

    const root = chord.rootPitch;
    const third = root + (quality === "major" ? 4 : 3);
    const fifth = root + 7;

    const whenSec = ctx.currentTime + 0.03;
    await playChordWindowed([root, third, fifth], whenSec, 2.2, FADE_OUT_SEC);
  }

  // ---------------- game state ----------------
  const score = { asked: 0, correct: 0, incorrect: 0, streak: 0, longestStored: 0 };

  let started = false;
  let awaitingNext = false;
  let canAnswer = false;

  let rootMin = 0;
  let rootMax = 0;

  let chord = null; 

  function randomInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function currentMode() {
    return RANGES[LOCKED_ROOT_RANGE] || RANGES["hard-3oct"];
  }

  function modeLabel() {
    return currentMode().label;
  }

  function computeRootBounds() {
    const m = currentMode();
    rootMin = pitchFromPcOct(0, m.startOctave);           
    rootMax = pitchFromPcOct(0, m.startOctave + m.octaves); 

    const c3 = pitchFromPcOct(0, 3);
    const f5 = pitchFromPcOct(5, 5);
    rootMin = Math.max(rootMin, c3);
    rootMax = Math.min(rootMax, f5);
  }

  function pickChord() {
    computeRootBounds();

    const rootPitch = randomInt(rootMin, rootMax);
    const quality = Math.random() < 0.5 ? "major" : "minor";
    const third = rootPitch + (quality === "major" ? 4 : 3);
    const fifth = rootPitch + 7;

    return {
      quality,
      rootPitch,
      pitches: [rootPitch, third, fifth],
    };
  }

  function scorePercent() {
    if (score.asked <= 0) return 0;
    return Math.round((score.correct / score.asked) * 1000) / 10;
  }

  function displayLongest() {
    return Math.max(score.longestStored, score.streak);
  }

  function renderScore() {
    if ($("correctOut")) $("correctOut").textContent = score.correct;
    if ($("incorrectOut")) $("incorrectOut").textContent = score.incorrect;
    if ($("streakOut")) $("streakOut").textContent = score.streak;
    if ($("longestOut")) $("longestOut").textContent = displayLongest();
    if ($("accuracyOut")) $("accuracyOut").textContent = `${scorePercent()}%`;

    if ($("modalCorrectOut")) $("modalCorrectOut").textContent = score.correct;
    if ($("modalIncorrectOut")) $("modalIncorrectOut").textContent = score.incorrect;
    if ($("modalStreakOut")) $("modalStreakOut").textContent = score.streak;
    if ($("modalLongestOut")) $("modalLongestOut").textContent = displayLongest();
    if ($("modalAccuracyOut")) $("modalAccuracyOut").textContent = `${scorePercent()}%`;
  }

  function setFeedback(html) {
    feedbackOut.innerHTML = html || "";
  }

  function updateControls() {
    replayBtn.disabled = !started || !chord;

    const answerDisabled = !started || awaitingNext || !canAnswer || !chord;
    minorBtn.disabled = answerDisabled;
    majorBtn.disabled = answerDisabled;

    const answerEnabled = !answerDisabled;
    minorBtn.classList.toggle("answerPulseMinor", answerEnabled);
    majorBtn.classList.toggle("answerPulseMajor", answerEnabled);

    nextBtn.disabled = !started || !awaitingNext;

    nextBtn.classList.toggle("nextStyled", started);
    nextBtn.classList.toggle("nextPulse", started && awaitingNext);
  }

  function updateBeginButton() {
    beginBtn.textContent = started ? "End / Restart Game" : "Begin Game";
    beginBtn.classList.toggle("pulse", !started);
    beginBtn.classList.toggle("primary", !started);
    beginBtn.classList.toggle("isRestart", started);
  }

  // ---------------- mini keyboard ----------------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const c of children) n.appendChild(c);
    return n;
  }

  function isBlackPc(pc) {
    return [1, 3, 6, 8, 10].includes(pc);
  }

  function whiteIndexInOctave(pc) {
    const m = { 0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6 };
    return m[pc] ?? null;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function computeTwoOctaveWindowForSet(pitches) {
    const minP = Math.min(...pitches);
    const maxP = Math.max(...pitches);

    let startC = pitchFromPcOct(0, octFromPitch(minP));
    let endC = startC + 24;

    if (maxP > endC) {
      startC += 12;
      endC = startC + 24;
    }

    const c3 = pitchFromPcOct(0, 3);
    const c6 = pitchFromPcOct(0, 6);
    const hardLo = c3;
    const hardHi = c6 + 12; 

    startC = clamp(startC, hardLo, hardHi);
    endC = clamp(endC, hardLo, hardHi);

    return { lo: startC, hi: endC };
  }

  function buildMiniKeyboardChord(pitches, highlightSet) {
    miniMount.innerHTML = "";

    if (!pitches?.length) {
      const s = el("svg", { width: 780, height: 128, viewBox: "0 0 780 128", preserveAspectRatio: "xMidYMid meet" });
      miniMount.appendChild(s);
      return;
    }

    const { lo, hi } = computeTwoOctaveWindowForSet(pitches);

    const all = [];
    for (let p = lo; p <= hi; p++) all.push(p);

    const WHITE_W = 26;
    const WHITE_H = 92;
    const BLACK_W = 16;
    const BLACK_H = 58;
    const BORDER = 8;
    const RADIUS = 14;

    const whitePitches = all.filter(p => whiteIndexInOctave(pcFromPitch(p)) != null);
    if (!whitePitches.length) {
      const s = el("svg", { width: 780, height: 128, viewBox: "0 0 780 128" });
      miniMount.appendChild(s);
      return;
    }

    const totalWhite = whitePitches.length;
    const innerW = totalWhite * WHITE_W;
    const outerW = innerW + BORDER * 2;
    const outerH = WHITE_H + BORDER * 2;

    const s = el("svg", {
      width: outerW,
      height: outerH,
      viewBox: `0 0 ${outerW} ${outerH}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Chord keyboard diagram (2 octaves)",
    });
    s.style.maxWidth = `${outerW}px`;

    const style = el("style");
    style.textContent = `
      .frame{ fill:#fff; stroke:#000; stroke-width:${BORDER}; rx:${RADIUS}; ry:${RADIUS}; }
      .w rect{ fill:#fff; stroke:#222; stroke-width:1; }
      .b rect{ fill:#111; stroke:#000; stroke-width:1; rx:3; ry:3; }
      .lbl{ font-family: Arial, Helvetica, sans-serif; font-size:11px; fill: rgba(0,0,0,0.55); font-weight:800; user-select:none; }

      .tone rect{ fill: var(--chordTone) !important; }
      .tone .lbl{ fill: rgba(255,255,255,0.95) !important; }
    `;
    s.appendChild(style);

    s.appendChild(el("rect", {
      x: BORDER / 2,
      y: BORDER / 2,
      width: outerW - BORDER,
      height: outerH - BORDER,
      rx: RADIUS,
      ry: RADIUS,
      class: "frame",
    }));

    const gW = el("g");
    const gB = el("g");
    s.appendChild(gW);
    s.appendChild(gB);

    const startX = BORDER;
    const startY = BORDER;

    const whiteIndexByPitch = new Map();
    whitePitches.forEach((p, i) => whiteIndexByPitch.set(p, i));

    const isHighlighted = (p) => highlightSet instanceof Set && highlightSet.has(p);

    for (let i = 0; i < whitePitches.length; i++) {
      const p = whitePitches[i];
      const x = startX + i * WHITE_W;

      const pc = pcFromPitch(p);
      const oct = octFromPitch(p);
      const name = PC_NAMES_SHARP[pc] + oct;

      const grp = el("g", { class: "w" });
      grp.appendChild(el("rect", { x, y: startY, width: WHITE_W, height: WHITE_H }));

      const text = el("text", { x: x + WHITE_W / 2, y: startY + WHITE_H - 12, "text-anchor": "middle", class: "lbl" });
      text.textContent = (pc === 0) ? name : "";
      grp.appendChild(text);
      if (isHighlighted(p)) grp.classList.add("tone");

      gW.appendChild(grp);
    }

    for (let p = lo; p <= hi; p++) {
      const pc = pcFromPitch(p);
      if (!isBlackPc(pc)) continue;

      const leftPcByBlack = { 1:0, 3:2, 6:5, 8:7, 10:9 };
      const leftPc = leftPcByBlack[pc];
      if (leftPc == null) continue;

      const oct = octFromPitch(p);
      const leftWhitePitch = pitchFromPcOct(leftPc, oct);

      const wi = whiteIndexByPitch.get(leftWhitePitch);
      if (wi == null) continue;

      const leftX = startX + wi * WHITE_W;
      const x = leftX + WHITE_W - (BLACK_W / 2);

      const grp = el("g", { class: "b" });
      grp.appendChild(el("rect", { x, y: startY, width: BLACK_W, height: BLACK_H }));
      if (isHighlighted(p)) grp.classList.add("tone");

      gB.appendChild(grp);
    }

    miniMount.appendChild(s);
  }

  // ---------------- flow ----------------
  let lastPlayToken = 0;

  async function playCurrentChord({ allowAnswerAfter = true, delaySec = 0 } = {}) {
    if (!started || !chord) return;

    const token = ++lastPlayToken;

    canAnswer = false;
    updateControls();
    stopAllNotesWithUi(0.08);

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    const safeDelay = Math.max(0, Number.isFinite(delaySec) ? delaySec : 0);
    const t0 = ctx.currentTime + 0.03 + safeDelay;

    if (allowAnswerAfter) {
      window.setTimeout(() => {
        if (token !== lastPlayToken) return;
        canAnswer = true;
        updateControls();
      }, Math.round(safeDelay * 1000));
    }

    const ok = await playChordWindowed(chord.pitches, t0, CHORD_PLAY_SEC, FADE_OUT_SEC);
    if (!ok || token !== lastPlayToken) return;
  }

  async function startNewRound({ autoplay = true } = {}) {
    if (!started) return;

    awaitingNext = false;
    canAnswer = false;
    updateControls();

    chord = pickChord();

    buildMiniKeyboardChord(null, null);
    compareSection.classList.add("hidden");
    setFeedback("Listen carefully…");

    if (autoplay) {
      await new Promise(requestAnimationFrame);
      setFeedback("Decide if the chord is <strong>Major</strong> or <strong>Minor</strong>.");
      await playCurrentChord({ allowAnswerAfter: true, delaySec: ROUND_START_DELAY_SEC });
    } else {
      setFeedback("Press <strong>Replay Chord</strong> to hear it.");
    }
  }

  async function replay() {
    if (!started || !chord) return;
    stopAllNotesWithUi(0.08);
    setFeedback("Replaying…");
    buildMiniKeyboardChord(null, null);
    awaitingNext = false;
    compareSection.classList.add("hidden");
    await playCurrentChord({ allowAnswerAfter: true, delaySec: ROUND_START_DELAY_SEC });
  }

  function showPopup(title, message, { showDownload = false } = {}) {
    if (!streakModal || !modalTitle || !modalBody || !modalDownload || !modalClose) return;
    modalTitle.textContent = title;
    modalBody.textContent = message;
    modalDownload.classList.toggle("hidden", !showDownload);
    openModal(streakModal);
  }

  function considerStreakForLongestOnFail(prevStreak) {
    if (prevStreak > score.longestStored) {
      score.longestStored = prevStreak;
      showPopup(
        "New Longest Streak!",
        `New Longest Streak! That's ${prevStreak} correct in a row!`,
        { showDownload: true }
      );
    }
  }

  function lockAfterAnswer() {
    canAnswer = false;
    awaitingNext = true;
    updateControls();
  }

  function expectedAnswer() {
    return chord?.quality || null;
  }

  function pitchSetForChord(ch) {
    const s = new Set();
    if (!ch?.pitches?.length) return s;
    for (const p of ch.pitches) s.add(p);
    return s;
  }

  function answer(choice) {
    if (!started || !canAnswer || !chord) return;
    stopAllNotesWithUi(0.06);

    score.asked += 1;

    const correct = expectedAnswer();
    const isCorrect = choice === correct;

    const rootName = noteNameForPc(pcFromPitch(chord.rootPitch));
    const qualityName = chord.quality === "major" ? "Major" : "Minor";
    const notesLabel = chordNotesLabel(chord.pitches);

    if (isCorrect) {
      score.correct += 1;
      score.streak += 1;
      setTimeout(() => playUiSound(UI_SND_CORRECT), 20);
      setFeedback(
        `Correct! ✅<br/>` +
        `Chord: <strong>${rootName} ${qualityName}</strong> — notes ${notesLabel}.`
      );
    } else {
      score.incorrect += 1;
      const prev = score.streak;
      score.streak = 0;
      considerStreakForLongestOnFail(prev);
      playUiSound(UI_SND_INCORRECT);
      setFeedback(
        `Incorrect ❌ (You chose <strong>${choice}</strong>.)<br/>` +
        `Chord: <strong>${rootName} ${qualityName}</strong> — notes ${notesLabel} ` +
        `(Answer: <strong>${correct}</strong>).`
      );
    }

    renderScore();
    buildMiniKeyboardChord(chord.pitches, pitchSetForChord(chord));

    // Show compare buttons dynamically labelled with the current root
    compareSection.classList.remove("hidden");
    compareMinorBtn.textContent = `Play ${rootName} Minor`;
    compareMajorBtn.textContent = `Play ${rootName} Major`;

    lockAfterAnswer();
  }

  async function goNext() {
    if (!started || !awaitingNext) return;
    playUiSound(UI_SND_SELECT);
    stopAllNotesWithUi(0.08);
    setFeedback("");
    await startNewRound({ autoplay: true });
  }

  async function beginGame() {
    await resumeAudioIfNeeded();

    started = true;
    updateBeginButton();

    score.asked = 0;
    score.correct = 0;
    score.incorrect = 0;
    score.streak = 0;
    score.longestStored = 0;
    renderScore();

    await startNewRound({ autoplay: true });
  }

  function returnToStartScreen({ openIntro = false } = {}) {
    stopAllNotesWithUi(0.06);

    started = false;
    awaitingNext = false;
    chord = null;

    score.asked = 0;
    score.correct = 0;
    score.incorrect = 0;
    score.streak = 0;
    score.longestStored = 0;
    
    renderScore();
    updateControls();
    updateBeginButton();
    
    buildMiniKeyboardChord(null, null);
    compareSection.classList.add("hidden");
    setFeedback("Press <strong>Begin Game</strong> to start.");

    if (openIntro && introModal) {
      openModal(introModal);
      try { introBeginBtn.focus(); } catch {}
    }
  }

  let scoreModalContinueCallback = null;
  function showScoreModal(onContinue) {
    scoreModalContinueCallback = onContinue;
    openModal(scoreModal);
    try { scoreModalContinueBtn.focus(); } catch {}
  }

  // ---------------- downloads ----------------
  async function loadImage(src) {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  
  function drawImageContain(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const r = Math.min(w / iw, h / ih);
    const dw = Math.max(1, iw * r);
    const dh = Math.max(1, ih * r);
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    return { w: dw, h: dh, x: dx, y: dy };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function sanitizeFilenamePart(s) {
    const v = String(s || "").trim().replace(/\s+/g, "_");
    const cleaned = v.replace(/[^a-zA-Z0-9_\-]+/g, "");
    return cleaned.slice(0, 32) || "";
  }
  function safeText(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(); }

  function saveName(name) { try { localStorage.setItem("hol_player_name", String(name || "").trim().slice(0, 32)); } catch {} }

  async function downloadScorecardPng(nameInputEl) {
    const LAYOUT = {
      gapAfterImage: 32,           
      gapAfterUrl: 36,             
      gapAfterTitle: 30,           
      gapAfterMeta: 28,            
      gapAfterName: 22,            
      gapNoNameCompensation: 12,   
      mainGridRowGap: 14,          
    };

    const name = safeText(nameInputEl?.value);
    if (nameInputEl) saveName(name);

    const W = 720;
    const rowsCount = 5;
    const rowH = 58;
    const baseContentH = 340; 
    const H = baseContentH + (rowsCount * (rowH + LAYOUT.mainGridRowGap)) + 80; 
    
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const pad = 34;
    const cardX = pad;
    const cardY = pad;
    const cardW = W - pad * 2;
    const cardH = H - pad * 2;

    ctx.fillStyle = "#f9f9f9";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.stroke();

    const titleSrc = titleImgWide?.getAttribute("src") || "images/title.png";
    const titleImg = await loadImage(titleSrc);

    let yCursor = cardY + 26;

    if (titleImg) {
      const imgMaxW = Math.min(520, cardW - 40);
      const imgMaxH = 92;
      drawImageContain(ctx, titleImg, (W - imgMaxW) / 2, yCursor, imgMaxW, imgMaxH);
      yCursor += imgMaxH + LAYOUT.gapAfterImage;
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "800 18px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("www.eartraininglab.com", W / 2, yCursor);
    yCursor += LAYOUT.gapAfterUrl;

    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.font = "700 26px Arial, Helvetica, sans-serif";
    ctx.fillText("Score Card", W / 2, yCursor);
    yCursor += LAYOUT.gapAfterTitle;

    ctx.font = "800 18px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.fillText(`Mode: ${modeLabel()}`, W / 2, yCursor);
    yCursor += LAYOUT.gapAfterMeta;

    if (name) {
      ctx.fillStyle = "#111";
      ctx.fillText(`Name: ${name}`, W / 2, yCursor);
      yCursor += LAYOUT.gapAfterName;
    } else {
      yCursor += LAYOUT.gapNoNameCompensation;
    }

    ctx.fillStyle = "#111";
    ctx.textAlign = "left";

    const rowX = cardX + 26;
    const rowW = cardW - 52;

    const rows = [
      ["Correct", String(score.correct)],
      ["Incorrect", String(score.incorrect)],
      ["Correct in a row", String(score.streak)],
      ["Longest streak", String(displayLongest())],
      ["Percentage Correct", `${scorePercent()}%`],
    ];

    for (const [k, v] of rows) {
      ctx.fillStyle = "#ffffff";
      drawRoundRect(ctx, rowX, yCursor, rowW, rowH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.font = "900 18px Arial, Helvetica, sans-serif";
      ctx.fillText(k, rowX + 16, yCursor + 33);

      ctx.fillStyle = "#111";
      ctx.font = "900 22px Arial, Helvetica, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v, rowX + rowW - 16, yCursor + 37);
      ctx.textAlign = "left";

      yCursor += rowH + LAYOUT.mainGridRowGap;
    }

    ctx.textAlign = "center";
    ctx.font = "800 14px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText("Major Or Minor?! - www.eartraininglab.com", W / 2, cardY + cardH - 24);

    const fileBase = name ? `${sanitizeFilenamePart(name)}_scorecard` : "scorecard";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function initTitleSwap() {
    if (!titleWrap || !titleImgWide || !titleImgWrapped) return;
    const tryUpdate = () => updateTitleForWidth();

    if (titleImgWide.complete) tryUpdate();
    else titleImgWide.addEventListener("load", tryUpdate, { once: true });

    if (titleImgWrapped.complete) tryUpdate();
    else titleImgWrapped.addEventListener("load", tryUpdate, { once: true });

    const tro = new ResizeObserver(() => updateTitleForWidth());
    tro.observe(titleWrap);
  }

  // ---------------- events ----------------
  function bind() {
    introBeginBtn?.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(introModal);
      setFeedback("Press <strong>Begin Game</strong> to start.");
      try { beginBtn.focus(); } catch {}
    });

    scoreModalContinueBtn?.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(scoreModal);
      if (scoreModalContinueCallback) scoreModalContinueCallback();
    });

    beginBtn.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      if (!started) {
        if (introModal && !introModal.classList.contains("hidden")) closeModal(introModal);
        await beginGame();
      } else {
        showScoreModal(() => {
          returnToStartScreen({ openIntro: true });
        });
      }
    });

    replayBtn.addEventListener("click", replay);

    minorBtn.addEventListener("click", () => answer("minor"));
    majorBtn.addEventListener("click", () => answer("major"));

    minorRefBtn?.addEventListener("click", () => playReferenceChord("minor"));
    majorRefBtn?.addEventListener("click", () => playReferenceChord("major"));

    compareMinorBtn?.addEventListener("click", () => playCompareChord("minor"));
    compareMajorBtn?.addEventListener("click", () => playCompareChord("major"));

    nextBtn.addEventListener("click", goNext);

    downloadScorecardBtn?.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      await downloadScorecardPng(playerNameInput);
    });

    modalDownloadScorecardBtn?.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      await downloadScorecardPng(modalPlayerNameInput);
    });

    modalClose?.addEventListener("click", () => {
      playUiSound(UI_SND_BACK);
      closeModal(streakModal);
    });
    streakModal?.addEventListener("click", (e) => { 
      if (e.target === streakModal) {
        playUiSound(UI_SND_BACK);
        closeModal(streakModal);
      }
    });
    modalDownload?.addEventListener("click", async () => {
      playUiSound(UI_SND_SELECT);
      await downloadScorecardPng(playerNameInput);
    });

    window.addEventListener("resize", () => {
      updateTitleForWidth();
    });

    document.addEventListener("keydown", async (e) => {
      if (!started) return;
      if (e.key === "Escape") return;

      if (e.code === "KeyR") {
        await replay();
        return;
      }

      if (e.code === "KeyM" || e.code === "ArrowLeft") { answer("minor"); return; }
      if (e.code === "KeyJ" || e.code === "ArrowRight") { answer("major"); return; }

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (awaitingNext) await goNext();
      }
    });
  }

  function init() {
    bind();
    initTitleSwap();
    
    const initialName = (localStorage.getItem("hol_player_name") || "").slice(0, 32);
    if (playerNameInput) playerNameInput.value = initialName;
    if (modalPlayerNameInput) modalPlayerNameInput.value = initialName;

    computeRootBounds();
    score.incorrect = 0; 
    renderScore();
    updateBeginButton();
    updateTitleForWidth();
    buildMiniKeyboardChord(null, null);
    compareSection?.classList.add("hidden");
    setFeedback("Press <strong>Begin Game</strong> to start.");
    updateControls();

    openModal(introModal);
    try { introBeginBtn.focus(); } catch {}
  }

  init();
})();
