const IMAGES = [
  "spring-1.jpg", "spring-2.jpg",
  "summer-1.jpg", "summer-2.jpg", "summer-3.png", "summer-4.jpg", "summer-5.jpg",
  "fall-1.jpg", "fall-2.jpg", "fall-3.jpg",
  "winter-1.jpeg", "winter-2.jpg", "winter-3.jpg",
  "night-1.jpg", "night-2.jpg",
  "home-1.jpg", "home-2.jpg",
];
const INTERVAL_KEY = "berrycrossing.intervalMinutes";
const KEEP_AWAKE_KEY = "berrycrossing.keepAwake";
const AWAKE_MINUTES_KEY = "berrycrossing.awakeMinutes";
const DEFAULT_MINUTES = 30;
const DEFAULT_AWAKE_MINUTES = 60;
const SKIP_SECONDS = 15;

const $ = (id) => document.getElementById(id);
const audio = $("music");
const playBtn = $("play");
const modal = $("modal");
const intervalInput = $("interval");
const keepAwakeInput = $("keep-awake");
const awakeTimer = $("awake-timer");
const awakeInput = $("awake-minutes");

/* ---------- saved settings ---------- */

function clampMinutes(value, fallback = DEFAULT_MINUTES) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(240, Math.max(1, n)) : fallback;
}

function readSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function loadMinutes(key, fallback) {
  const stored = readSetting(key);
  return stored ? clampMinutes(stored, fallback) : fallback;
}

let pictureMinutes = loadMinutes(INTERVAL_KEY, DEFAULT_MINUTES);
let keepAwake = readSetting(KEEP_AWAKE_KEY) !== "false"; // on unless switched off
let awakeMinutes = loadMinutes(AWAKE_MINUTES_KEY, DEFAULT_AWAKE_MINUTES);

/* ---------- wallpapers ---------- */

const layers = document.querySelectorAll(".bg");
let front = 0;
let index = Math.floor(Math.random() * IMAGES.length);
let pictureTimer;

function show(i) {
  const src = `backgrounds/${IMAGES[i]}`;
  const img = new Image();
  img.onload = () => {
    const back = layers[1 - front];
    back.style.backgroundImage = `url("${src}")`;
    back.classList.add("visible");
    layers[front].classList.remove("visible");
    front = 1 - front;
    // warm the cache for the next one
    new Image().src = `backgrounds/${IMAGES[(i + 1) % IMAGES.length]}`;
  };
  img.src = src;
}

function next() {
  index = (index + 1) % IMAGES.length;
  show(index);
}

function startPictureTimer() {
  clearInterval(pictureTimer);
  pictureTimer = setInterval(next, pictureMinutes * 60_000);
}

show(index);
startPictureTimer();

// skipping ahead by hand restarts the countdown so the new picture gets a full interval
$("next-bg").addEventListener("click", () => {
  next();
  startPictureTimer();
});

/* ---------- music ---------- */

function togglePlay() {
  playBtn.classList.remove("nudge");
  if (audio.paused) audio.play();
  else audio.pause();
}

function skip(seconds) {
  if (!Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + seconds));
}

audio.addEventListener("play", () => {
  playBtn.classList.add("playing");
  playBtn.setAttribute("aria-label", "pause");
  playBtn.title = "pause";
});

audio.addEventListener("pause", () => {
  playBtn.classList.remove("playing");
  playBtn.setAttribute("aria-label", "play");
  playBtn.title = "play";
});

playBtn.addEventListener("click", togglePlay);
$("restart").addEventListener("click", () => { audio.currentTime = 0; });
$("back").addEventListener("click", () => skip(-SKIP_SECONDS));
$("forward").addEventListener("click", () => skip(SKIP_SECONDS));

/* ---------- keep the screen awake while music plays ---------- */

let wakeLock = null; // promise of a WakeLockSentinel, or null when we don't hold one
let sleepTimer;
let sleepy = false; // the sleep timer ran out, so let the device sleep until play is pressed again

async function updateWakeLock() {
  if (!("wakeLock" in navigator)) return;
  const wanted = keepAwake && !sleepy && !audio.paused && document.visibilityState === "visible";

  if (wanted && !wakeLock) {
    wakeLock = navigator.wakeLock.request("screen").catch(() => null);
    const sentinel = await wakeLock;
    if (!sentinel) { wakeLock = null; return; }
    // fires when we let go, and also when the browser takes it back (e.g. the tab is hidden)
    sentinel.addEventListener("release", () => { wakeLock = null; updateWakeLock(); });
  } else if (!wanted && wakeLock) {
    (await wakeLock)?.release();
  }
}

// counts down from each press of play; pausing or saving settings starts it over
function resetSleepTimer() {
  clearTimeout(sleepTimer);
  sleepy = false;
  if (keepAwake && !audio.paused) {
    sleepTimer = setTimeout(() => { sleepy = true; updateWakeLock(); }, awakeMinutes * 60_000);
  }
  updateWakeLock();
}

audio.addEventListener("play", resetSleepTimer);
audio.addEventListener("pause", resetSleepTimer);
document.addEventListener("visibilitychange", updateWakeLock);

/* ---------- collapse ---------- */

const collapseBtn = $("collapse");

collapseBtn.addEventListener("click", () => {
  const collapsed = document.querySelector(".dock").classList.toggle("collapsed");
  const label = collapsed ? "show controls" : "hide controls";
  collapseBtn.setAttribute("aria-expanded", String(!collapsed));
  collapseBtn.setAttribute("aria-label", label);
  collapseBtn.title = label;
});

/* ---------- full screen ---------- */

// Safari still wants the webkit-prefixed versions; iPhones don't allow it at all, so the button hides there
const fullscreenBtn = $("fullscreen");
const root = document.documentElement;
fullscreenBtn.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  const result = isFullscreen()
    ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  Promise.resolve(result).catch(() => {});
}

// also catches leaving full screen with Esc
function syncFullscreenButton() {
  const on = isFullscreen();
  const label = on ? "exit full screen" : "full screen";
  fullscreenBtn.classList.toggle("active", on);
  fullscreenBtn.setAttribute("aria-label", label);
  fullscreenBtn.title = label;
}

fullscreenBtn.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", syncFullscreenButton);
document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

document.addEventListener("keydown", (e) => {
  if (modal.open || e.target.closest("button, input")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowLeft") skip(-SKIP_SECONDS);
  else if (e.key === "ArrowRight") skip(SKIP_SECONDS);
});

/* ---------- settings modal ---------- */

const settingsForm = $("settings-form");

function fillSettings() {
  intervalInput.value = pictureMinutes;
  keepAwakeInput.checked = keepAwake;
  awakeInput.value = awakeMinutes;
  awakeTimer.disabled = !keepAwake;
}

// changes take effect right away; a cleared box keeps the current value until something is typed
function applySettings() {
  const picture = intervalInput.value === "" ? pictureMinutes : clampMinutes(intervalInput.value);
  const awake = awakeInput.value === "" ? awakeMinutes : clampMinutes(awakeInput.value);
  const awakeOn = keepAwakeInput.checked;
  awakeTimer.disabled = !awakeOn;

  if (picture !== pictureMinutes) {
    pictureMinutes = picture;
    saveSetting(INTERVAL_KEY, pictureMinutes);
    startPictureTimer();
  }
  if (awake !== awakeMinutes || awakeOn !== keepAwake) {
    awakeMinutes = awake;
    keepAwake = awakeOn;
    saveSetting(AWAKE_MINUTES_KEY, awakeMinutes);
    saveSetting(KEEP_AWAKE_KEY, keepAwake);
    resetSleepTimer();
  }
}

$("settings").addEventListener("click", () => {
  fillSettings();
  modal.showModal();
});

// each stepper's buttons nudge the number box next to them
modal.querySelectorAll(".step").forEach((btn) => {
  btn.addEventListener("click", () => {
    const field = btn.parentElement.querySelector("input");
    field.value = clampMinutes(Number(field.value) + Number(btn.dataset.step));
    applySettings();
  });
});

settingsForm.addEventListener("input", applySettings);
// once a box is left, tidy it up (e.g. 500 → 240, empty → the current value)
settingsForm.addEventListener("change", () => {
  applySettings();
  fillSettings();
});

// clicks on the backdrop land on the <dialog> itself
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.close();
});
