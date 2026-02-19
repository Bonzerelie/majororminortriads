/* /script.js
   Major Or Minor?! (single triad quality)
   - audio/{stem}{octave}.mp3
   - Squarespace iframe sizing + scroll forwarding preserved
*/
(() => {
  "use strict";

  

  function lockIframeScrolling() {
    const de = document.documentElement;
    const b = document.body;

    de.style.overflow = "hidden";
    de.style.overscrollBehavior = "none";
    de.style.touchAction = "pan-x";

    if (b) {
      b.style.overflow = "hidden";
      b.style.overscrollBehavior = "none";
      b.style.touchAction = "pan-x";
    }
  }

  lockIframeScrolling();
  window.addEventListener("load", lockIframeScrolling, { passive: true });

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
      parent.postMessage({ iframeHeight: height }, "*");
      lastHeight = height;
    }
  });

  ro.observe(document.documentElement);
  if (document.body) ro.observe(document.body);

function postHeightNow() {
    try {
      const h = measureDocHeightPx();
      if (h) parent.postMessage({ iframeHeight: h }, "*");
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

  function enableScrollForwardingToParent() {
  // If the iframe actually becomes taller than the viewport (rare here),
  // let the iframe scroll naturally and do NOT forward.
  const isVerticallyScrollable = () =>
    document.documentElement.scrollHeight > window.innerHeight + 2;

  const isInteractiveTarget = (t) =>
    t instanceof Element && !!t.closest("button, a, input, select, textarea, label");

  const AXIS_SLOP_PX = 6; // small deadzone to decide axis

  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lockedMode = null; // "y" | "x" | null

  // Velocity estimation
  let lastMoveTs = 0;
  let vScrollTop = 0; // px/ms

  window.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;

    lockedMode = null;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastY = startY;

    lastMoveTs = e.timeStamp || performance.now();
    vScrollTop = 0;

    if (isInteractiveTarget(e.target)) lockedMode = "x";
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    if (isVerticallyScrollable()) return;

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;

    const dx = x - startX;
    const dy = y - startY;

    // Decide axis (but don't “buffer” movement)
    if (!lockedMode) {
      if (Math.abs(dy) >= Math.abs(dx) + AXIS_SLOP_PX) lockedMode = "y";
      else if (Math.abs(dx) >= Math.abs(dy) + AXIS_SLOP_PX) lockedMode = "x";
      // IMPORTANT: still update lastY to prevent jump on slow moves
      lastY = y;
      return;
    }

    if (lockedMode !== "y") {
      lastY = y;
      return;
    }

    const nowTs = e.timeStamp || performance.now();
    const dt = Math.max(1, nowTs - lastMoveTs);
    lastMoveTs = nowTs;

    // 1:1 finger movement -> scrollTop delta
    const fingerDy = y - lastY;
    lastY = y;

    const scrollTopDelta = -fingerDy; // finger down => page down
    if (scrollTopDelta === 0) {
      e.preventDefault();
      return;
    }

    const instV = scrollTopDelta / dt;
    vScrollTop = (vScrollTop * 0.65) + (instV * 0.35);

    e.preventDefault();
    parent.postMessage({ scrollTopDelta }, "*");
  }, { passive: false });

  function endGesture() {
    if (lockedMode === "y" && Math.abs(vScrollTop) > 0.02) {
      // Conservative cap: avoids “rocket fling” on some devices
      const capped = Math.max(-3.5, Math.min(3.5, vScrollTop));
      parent.postMessage({ scrollTopVelocity: capped }, "*");
    }
    lockedMode = null;
    vScrollTop = 0;
  }

  window.addEventListener("touchend", endGesture, { passive: true });
  window.addEventListener("touchcancel", endGesture, { passive: true });

  // Mouse/trackpad users: forward wheel 1:1 too
  window.addEventListener("wheel", (e) => {
    if (isVerticallyScrollable()) return;
    parent.postMessage({ scrollTopDelta: e.deltaY }, "*");
  }, { passive: true });
}
  enableScrollForwardingToParent();

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

  // Reference chords (do not alter game state / UI)
  async function playReferenceChord(quality) {
    await resumeAudioIfNeeded();
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotes(0.08);

    const root = pitchFromPcOct(0, 4); // C4
    const third = root + (quality === "major" ? 4 : 3);
    const fifth = root + 7;

    const whenSec = ctx.currentTime + 0.03;
    await playChordWindowed([root, third, fifth], whenSec, 2.2, FADE_OUT_SEC);
  }

  async function playCompareChord(quality) {
    if (!started || !chord) return;

    await resumeAudioIfNeeded();
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllNotes(0.08);

    const root = chord.rootPitch;
    const third = root + (quality === "major" ? 4 : 3);
    const fifth = root + 7;

    const whenSec = ctx.currentTime + 0.03;
    await playChordWindowed([root, third, fifth], whenSec, 2.6, FADE_OUT_SEC);
  }

  // ---------------- game state ----------------
  const score = { asked: 0, correct: 0, streak: 0, longestStored: 0 };

  let started = false;
  let awaitingNext = false;
  let canAnswer = false;

  let rootMin = 0;
  let rootMax = 0;

  let chord = null; // { quality: 'major'|'minor', rootPitch, pitches:[r, t, f] }

  function randomInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function currentMode() {
    if (RANGES[LOCKED_ROOT_RANGE]) return RANGES[LOCKED_ROOT_RANGE];
    const key = noteRangeSel?.value;
    return (key && RANGES[key]) || RANGES["hard-3oct"];
  }

  function computeRootBounds() {
    const m = currentMode();
    rootMin = pitchFromPcOct(0, m.startOctave);
    rootMax = pitchFromPcOct(0, m.startOctave + m.octaves);

    // Hard clamp to requested C3..C6 root range
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
    const items = [
      ["Questions asked", score.asked],
      ["Answers correct", score.correct],
      ["Correct in a row", score.streak],
      ["Longest correct streak", displayLongest()],
      ["Percentage correct", `${scorePercent()}%`],
    ];

    scoreOut.innerHTML =
      `<div class="scoreGrid scoreGridVertical">` +
      items.map(([k, v]) =>
        `<div class="scoreItem"><span class="scoreK">${k}</span><span class="scoreV">${v}</span></div>`
      ).join("") +
      `</div>`;
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
    beginBtn.textContent = started ? "Restart Game" : "Begin Game";
    beginBtn.classList.toggle("pulse", !started);
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

    const whitePitches = all.filter(p => whiteIndexInOctave(((p % 12) + 12) % 12) != null);
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

      const pc = ((p % 12) + 12) % 12;
      const oct = Math.floor(p / 12);
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
      const pc = ((p % 12) + 12) % 12;
      if (!isBlackPc(pc)) continue;

      const leftPcByBlack = { 1:0, 3:2, 6:5, 8:7, 10:9 };
      const leftPc = leftPcByBlack[pc];
      if (leftPc == null) continue;

      const oct = Math.floor(p / 12);
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
    stopAllNotes(0.08);

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

    setCompareVisible(false);

    buildMiniKeyboardChord(null, null);
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

    const lockedForNext = awaitingNext;
    setFeedback("Replaying…");

    if (!lockedForNext) buildMiniKeyboardChord(null, null);
    updateControls();

    await playCurrentChord({
      allowAnswerAfter: !lockedForNext,
      delaySec: ROUND_START_DELAY_SEC,
    });

    if (lockedForNext) updateControls();
  }

  function showPopup(title, message, { showDownload = false } = {}) {
    if (!streakModal || !modalTitle || !modalBody || !modalDownload || !modalClose) return;
    modalTitle.textContent = title;
    modalBody.textContent = message;
    modalDownload.classList.toggle("hidden", !showDownload);
    streakModal.classList.remove("hidden");
    modalClose.focus();
  }

  function hidePopup() {
    streakModal?.classList.add("hidden");
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

    score.asked += 1;

    const correct = expectedAnswer();
    const isCorrect = choice === correct;

    const rootName = noteNameForPc(pcFromPitch(chord.rootPitch));
    const qualityName = chord.quality === "major" ? "Major" : "Minor";
    const notesLabel = chordNotesLabel(chord.pitches);

    if (isCorrect) {
      score.correct += 1;
      score.streak += 1;
      renderScore();
      setFeedback(
        `Correct! ✅<br/>` +
        `Chord: <strong>${rootName} ${qualityName}</strong> — notes ${notesLabel}.`
      );
    } else {
      const prev = score.streak;
      score.streak = 0;
      considerStreakForLongestOnFail(prev);
      renderScore();
      setFeedback(
        `Incorrect ❌ (You chose <strong>${choice}</strong>.)<br/>` +
        `Chord: <strong>${rootName} ${qualityName}</strong> — notes ${notesLabel} ` +
        `(Answer: <strong>${correct}</strong>).`
      );
    }

    buildMiniKeyboardChord(chord.pitches, pitchSetForChord(chord));
    lockAfterAnswer();
    refreshComparePanel();
  }

  async function goNext() {
    if (!started || !awaitingNext) return;

    // Hide compare UI immediately on Next (no async lag).
    setCompareVisible(false);

    setFeedback("");
    await startNewRound({ autoplay: true });
  }

  async function beginGame() {
    await resumeAudioIfNeeded();

    started = true;
    setIntroVisible(false);
    updateBeginButton();

    score.asked = 0;
    score.correct = 0;
    score.streak = 0;
    score.longestStored = 0;
    renderScore();

    await startNewRound({ autoplay: true });
  }

  function resetToInitialScreen() {
    stopAllNotes(0.08);
    hidePopup();
    hideInfo();

    started = false;
    awaitingNext = false;
    canAnswer = false;
    chord = null;

    score.asked = 0;
    score.correct = 0;
    score.streak = 0;
    score.longestStored = 0;

    renderScore();
    updateBeginButton();
    setIntroVisible(true);
    buildMiniKeyboardChord(null, null);
    setCompareVisible(false);
    setFeedback("Press <strong>Begin Game</strong> to start.");
    updateControls();
  }

  function restartGame() {
    resetToInitialScreen();
  }

  // ---------------- downloads ----------------
  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }

  function drawCardBase(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfbfc";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = "#111";
    ctx.fillRect(8, 8, w - 16, 74);
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  function getPlayerName() {
    const prev = localStorage.getItem("hol_player_name") || "";
    const name = window.prompt("Enter your name for the score card:", prev) ?? "";
    const trimmed = String(name).trim();
    if (trimmed) localStorage.setItem("hol_player_name", trimmed);
    return trimmed || "Player";
  }

  async function downloadScoreCardPng(playerName) {
    const w = 560;
    const h = 520;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCardBase(ctx, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "900 30px Arial";
    ctx.fillText("Major Or Minor?! — Scorecard", 28, 56);

    const bodyX = 28;
    const bodyY = 130;

    ctx.fillStyle = "#111";
    ctx.font = "900 22px Arial";
    ctx.fillText("Summary", bodyX, bodyY);

    ctx.font = "700 20px Arial";
    const lines = [
      `Name: ${playerName}`,
      `Questions asked: ${score.asked}`,
      `Answers correct: ${score.correct}`,
      `Correct in a row: ${score.streak}`,
      `Longest correct streak: ${displayLongest()}`,
      `Percentage correct: ${scorePercent()}%`,
    ];

    let y = bodyY + 44;
    for (const ln of lines) {
      ctx.fillText(ln, bodyX, y);
      y += 34;
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "700 16px Arial";
    ctx.fillText("Downloaded from www.eartraininglab.com 🎶", bodyX, h - 36);

    const blob = await canvasToPngBlob(canvas);
    if (blob) downloadBlob(blob, "Major Or Minor Scorecard.png");
  }

  async function downloadRecordPng(streakValue, playerName) {
    const w = 980;
    const h = 420;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCardBase(ctx, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "900 30px Arial";
    ctx.fillText("Major Or Minor?! — Record", 28, 56);

    ctx.fillStyle = "#111";
    ctx.font = "900 28px Arial";
    ctx.fillText(`${streakValue} correct in a row!`, 28, 142);

    ctx.font = "700 22px Arial";
    ctx.fillStyle = "#111";
    const msg = `${playerName} just scored ${streakValue} correct answers in a row on the Major Or Minor?! game 🎉🎶🥳`;
    drawWrappedText(ctx, msg, 28, 200, w - 56, 34);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "700 16px Arial";
    ctx.fillText("Downloaded from www.eartraininglab.com 🎶", 28, h - 36);

    const blob = await canvasToPngBlob(canvas);
    if (blob) downloadBlob(blob, "Major Or Minor Record.png");
  }

  async function onDownloadScoreCard() {
    const name = getPlayerName();
    await downloadScoreCardPng(name);
  }

  async function onDownloadRecord() {
    const name = getPlayerName();
    const v = score.longestStored || displayLongest();
    await downloadRecordPng(v, name);
  }

  // ---------------- events ----------------
  function bind() {
    beginBtn.addEventListener("click", async () => {
      if (!started) await beginGame();
      else restartGame();
    });

    replayBtn.addEventListener("click", replay);

    minorBtn.addEventListener("click", () => answer("minor"));
    majorBtn.addEventListener("click", () => answer("major"));

    minorRefBtn?.addEventListener("click", () => playReferenceChord("minor"));
    majorRefBtn?.addEventListener("click", () => playReferenceChord("major"));

    compareMajorBtn?.addEventListener("click", () => playCompareChord("major"));
    compareMinorBtn?.addEventListener("click", () => playCompareChord("minor"));

    nextBtn.addEventListener("click", goNext);
    downloadScoreBtn.addEventListener("click", onDownloadScoreCard);

    modalClose?.addEventListener("click", hidePopup);
    streakModal?.addEventListener("click", (e) => { if (e.target === streakModal) hidePopup(); });
    modalDownload?.addEventListener("click", onDownloadRecord);

    noteRangeSel?.addEventListener("change", () => {
      if (noteRangeSel.disabled) return;
      computeRootBounds();
      buildMiniKeyboardChord(null, null);
      if (started) startNewRound({ autoplay: true });
    });

    document.addEventListener("keydown", async (e) => {
      if (!started) return;

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
    computeRootBounds();
    renderScore();
    updateBeginButton();
    setIntroVisible(true);
    setCompareVisible(false);
    buildMiniKeyboardChord(null, null);
    setFeedback("Press <strong>Begin Game</strong> to start.");
    updateControls();
  }

  init();
})();
