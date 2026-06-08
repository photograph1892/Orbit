const STORAGE_KEY = "orbit.archive.items.v1";
const PLAYER_STORAGE_KEY = "orbit.archive.player.v1";
const DB_NAME = "orbit.archive.db";
const DB_VERSION = 1;
const DB_STORE = "items";
const PLAY_DURATION = 30;
const COMPACT_ORBIT_THRESHOLD = 24;
const COMPACT_ORBIT_STEP = 14;

const root = document.documentElement;
const stage = document.querySelector(".stage");
const ambientLayers = [...document.querySelectorAll(".ambient-layer")];
const orbitWrap = document.querySelector(".orbit-wrap");
const orbit = document.querySelector(".orbit");
const albumTitle = document.querySelector(".album-title");
const albumDate = document.querySelector(".album-date");
const modeButtons = [...document.querySelectorAll("[data-mode-target]")];
const panels = [...document.querySelectorAll("[data-panel]")];
const playerToggle = document.querySelector("[data-player-action='toggle']");
const playerSeek = document.querySelector(".player-seek");
const currentTimeEl = document.querySelector(".current-time");
const durationTimeEl = document.querySelector(".duration-time");
const playerPanel = document.querySelector(".player-panel");
const nowPlaying = document.querySelector(".now-playing");
const editList = document.querySelector(".edit-list");
const cameraPreview = document.querySelector(".camera-preview");
const captureCanvas = document.querySelector(".capture-canvas");
const capturedPreview = document.querySelector(".captured-preview");
const createTitle = document.querySelector(".create-title");
const createComment = document.querySelector(".create-comment");
const createSubmit = document.querySelector(".create-submit");
const recordStatus = document.querySelector(".record-status");
const captureMemoryButton = document.querySelector("[data-create-action='capture']");

const state = {
  mode: "play",
  items: [],
  selectedItemId: null,
  activeTrackId: null,
  playlistMonth: null,
  frontItemIndex: 0,
  currentTrackIndex: 0,
  isPlaying: false,
  playbackStartedAt: 0,
  playbackOffset: 0,
  lastPlayerSaveAt: 0,
  rotation: {
    autoRotation: 0,
    userRotation: 0,
    targetUserRotation: 0,
    dragRotation: 0,
    renderedRotation: 0,
  },
  orbitHover: false,
  hoverAmount: 0,
  lastWheelStepAt: 0,
  snapTimer: null,
  ambientLayerIndex: 0,
  createDraft: {
    image: null,
    audio: null,
    palette: null,
  },
  media: {
    stream: null,
    recorder: null,
    chunks: [],
  },
  edit: {
    selectedMonth: null,
  },
  audio: {
    ctx: null,
    master: null,
    oscillators: [],
    ambient: null,
    currentItemId: null,
  },
};

const landscapes = [
  ["#f7b7a6", "#d84e54", "#24343c", "#8fb7c8", "#f7eee1"],
  ["#dfeef7", "#9fc4d6", "#5e7474", "#d9e7d2", "#fff7dd"],
  ["#f6d7b4", "#ef8758", "#445454", "#a9bf8a", "#fff5cf"],
  ["#f3f0dc", "#bdd0bb", "#62755e", "#c74c49", "#fffaf0"],
  ["#d8e6ef", "#acc5d2", "#303b40", "#dae2e4", "#fff8e9"],
  ["#f8d4da", "#d56a6e", "#4f3a3f", "#e7b48a", "#fff1d3"],
  ["#edf2e7", "#c8d8b8", "#586b4c", "#e46f4f", "#fff8e6"],
  ["#f2ece3", "#e8baa4", "#826b5e", "#b8c6ca", "#fffaf3"],
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function mixAngle(from, to, amount) {
  return from + normalizeAngle(to - from) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function normalizeAngle(angle) {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

function formatItemDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}. ${pad(date.getDate())}.`;
}

function monthKeyForItem(item) {
  const date = new Date(item.createdAt);
  return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}.`;
}

function formatTime(value) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${pad(seconds)}`;
}

function makeArt(index) {
  const [sky, sunset, mountain, ground, light] = landscapes[index % landscapes.length];
  const sunX = 18 + ((index * 19) % 64);
  const sunY = 18 + ((index * 11) % 36);
  return `
    radial-gradient(circle at ${sunX}% ${sunY}%, ${light} 0 7%, rgba(255, 255, 255, 0.45) 8% 12%, transparent 13%),
    conic-gradient(from 130deg at 28% 78%, transparent 0 18%, color-mix(in srgb, ${mountain} 80%, white) 19% 30%, transparent 31%),
    conic-gradient(from 220deg at 76% 76%, transparent 0 17%, ${mountain} 18% 31%, transparent 32%),
    linear-gradient(to bottom, ${sky} 0%, ${sunset} 42%, ${ground} 43% 62%, ${mountain} 100%)
  `;
}

function sortedItems() {
  return [...state.items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getOrbitItems() {
  if (!state.playlistMonth) return state.items;
  const playlistItems = state.items.filter((item) => monthKeyForItem(item) === state.playlistMonth);
  return playlistItems.length ? playlistItems : state.items;
}

function getOrbitIndexById(id) {
  return getOrbitItems().findIndex((item) => item.id === id);
}

function getCardStep() {
  const itemCount = getOrbitItems().length;
  if (!itemCount) return COMPACT_ORBIT_STEP;
  return itemCount < COMPACT_ORBIT_THRESHOLD ? COMPACT_ORBIT_STEP : 360 / itemCount;
}

function isFiniteOrbit() {
  const itemCount = getOrbitItems().length;
  return itemCount > 0 && itemCount < COMPACT_ORBIT_THRESHOLD;
}

function clampTrackIndex(index) {
  const itemCount = getOrbitItems().length;
  if (!itemCount) return 0;
  return isFiniteOrbit()
    ? clamp(index, 0, itemCount - 1)
    : ((index % itemCount) + itemCount) % itemCount;
}

function getFiniteRotationBounds() {
  const lastIndex = Math.max(0, getOrbitItems().length - 1);
  return {
    min: -lastIndex * getCardStep(),
    max: 0,
  };
}

function clampFinalRotation(value) {
  if (!isFiniteOrbit()) return value;
  const bounds = getFiniteRotationBounds();
  return clamp(value, bounds.min, bounds.max);
}

function normalizeRotationBounds(immediate = false) {
  if (!isFiniteOrbit()) return;
  const currentFinal =
    state.rotation.autoRotation +
    state.rotation.userRotation +
    state.rotation.dragRotation;
  const targetFinal =
    state.rotation.autoRotation +
    state.rotation.targetUserRotation +
    state.rotation.dragRotation;
  const clampedCurrent = clampFinalRotation(currentFinal);
  const clampedTarget = clampFinalRotation(targetFinal);

  state.rotation.targetUserRotation =
    clampedTarget -
    state.rotation.autoRotation -
    state.rotation.dragRotation;

  if (immediate || clampedCurrent !== currentFinal) {
    state.rotation.userRotation =
      clampedCurrent -
      state.rotation.autoRotation -
      state.rotation.dragRotation;
  }
}

function getSelectedIndex() {
  return Math.max(0, getOrbitIndexById(state.selectedItemId));
}

function openArchiveDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runItemStore(mode, callback) {
  return openArchiveDb().then((db) => new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    const transaction = db.transaction(DB_STORE, mode);
    const store = transaction.objectStore(DB_STORE);
    const result = callback(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  }));
}

async function loadStoredItems() {
  try {
    const db = await openArchiveDb();
    if (db) {
      const items = await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readonly");
        const store = transaction.objectStore(DB_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      if (items.length) return items;
    }
  } catch {
    // Fallback to localStorage below.
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

async function saveData() {
  try {
    const saved = await runItemStore("readwrite", (store) => {
      store.clear();
      state.items.forEach((item) => store.put(item));
      return true;
    });
    if (!saved) throw new Error("IndexedDB is unavailable.");
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      return true;
    } catch {
      recordStatus.textContent = "Storage is full. This memory can play now, but may not persist after refresh.";
      return false;
    }
  }
}

function savePlayerState() {
  const payload = {
    activeTrackId: state.activeTrackId,
    playlistMonth: state.playlistMonth,
    currentTrackIndex: state.currentTrackIndex,
    playbackOffset: getPlaybackTime(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
}

function loadPlayerState() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }
  if (!stored) return;
  const index = state.items.findIndex((item) => item.id === stored.activeTrackId);
  if (index < 0) return;
  state.activeTrackId = stored.activeTrackId;
  state.selectedItemId = stored.activeTrackId;
  state.playlistMonth = stored.playlistMonth || null;
  const orbitIndex = getOrbitIndexById(stored.activeTrackId);
  state.currentTrackIndex = orbitIndex >= 0 ? orbitIndex : 0;
  state.playbackOffset = clamp(Number(stored.playbackOffset) || 0, 0, PLAY_DURATION);
  state.playbackStartedAt = performance.now();
  state.isPlaying = false;
  seekToIndex(state.currentTrackIndex, true);
}

async function loadData() {
  const stored = await loadStoredItems();
  state.items = stored.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  state.selectedItemId = state.items[0]?.id || null;
  if (stored.length) saveData();
}

function artForItem(item) {
  if (item.image) return `url("${item.image}")`;
  return item.art || makeArt(0);
}

function colorWithAlpha(palette, alpha) {
  const r = Math.round(palette.r ?? 130);
  const g = Math.round(palette.g ?? 140);
  const b = Math.round(palette.b ?? 150);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hslWithAlpha(h, s, l, alpha) {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}% / ${alpha})`;
}

function updateAmbientBackground(item) {
  if (!item || !ambientLayers.length) {
    stage.classList.remove("has-ambient");
    return;
  }

  const palette = item.palette || { r: 120, g: 132, b: 142, h: 215, s: 0.35, v: 0.65 };
  const hue = palette.h ?? 215;
  const saturation = clamp((palette.s ?? 0.35) * 150, 44, 96);
  const brightness = clamp((palette.v ?? 0.65) * 76, 36, 72);
  const nextIndex = (state.ambientLayerIndex + 1) % ambientLayers.length;
  const layer = ambientLayers[nextIndex];

  layer.style.setProperty("--ambient-core", colorWithAlpha(palette, 0.82));
  layer.style.setProperty("--ambient-left", hslWithAlpha(hue + 34, saturation, brightness + 8, 0.7));
  layer.style.setProperty("--ambient-right", hslWithAlpha(hue - 42, saturation + 8, brightness - 2, 0.66));
  layer.style.setProperty("--ambient-base", hslWithAlpha(hue + 178, saturation * 0.82, brightness * 0.78, 0.54));

  ambientLayers.forEach((entry, index) => {
    entry.classList.toggle("is-active", index === nextIndex);
  });
  state.ambientLayerIndex = nextIndex;
  stage.classList.add("has-ambient");
}

function renderOrbit() {
  orbit.innerHTML = "";
  const orbitItems = getOrbitItems();
  stage.classList.toggle("has-items", orbitItems.length > 0);
  orbitItems.forEach((item, index) => {
    const card = document.createElement("button");
    const art = document.createElement("span");
    card.className = "orbit-card";
    card.type = "button";
    card.dataset.itemId = item.id;
    card.dataset.index = String(index);
    art.className = "album-art";
    card.style.setProperty("--w", "clamp(150px, 8.6vw, 290px)");
    card.style.setProperty("--art", artForItem(item));
    card.appendChild(art);
    card.addEventListener("click", () => {
      if (state.orbitHover) playFocusedTrack();
      else playTrack(index);
    });
    orbit.appendChild(card);
  });
}

function renderMode() {
  root.dataset.mode = state.mode;
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeTarget === state.mode);
  });
  panels.forEach((panel) => {
    const visible = panel.dataset.panel === state.mode;
    panel.classList.toggle("is-visible", visible);
    panel.setAttribute("aria-hidden", String(!visible));
  });
  if (state.mode === "edit") renderEdit();
}

function switchMode(nextMode) {
  state.mode = nextMode;
  renderMode();
  if (nextMode === "create") {
    startCamera().catch(() => {
      recordStatus.textContent = "Camera or microphone permission was blocked.";
      captureMemoryButton.disabled = true;
    });
  }
  if (nextMode !== "create") stopCamera();
}

function updateAlbumInfo(index = state.currentTrackIndex) {
  const item = getOrbitItems()[index];
  const fallbackItem = state.items.find((entry) => entry.id === state.activeTrackId);
  const displayItem = item || fallbackItem;
  if (!displayItem) {
    albumTitle.textContent = "";
    albumDate.textContent = "";
    return;
  }
  albumTitle.textContent = displayItem.title;
  albumDate.textContent = formatItemDate(displayItem.createdAt);
}

function resetEmptyState() {
  state.playlistMonth = null;
  state.selectedItemId = null;
  state.activeTrackId = null;
  state.frontItemIndex = 0;
  state.currentTrackIndex = 0;
  state.playbackOffset = 0;
  state.playbackStartedAt = performance.now();
  state.isPlaying = false;
  state.edit.selectedMonth = null;
  state.rotation.userRotation = 0;
  state.rotation.targetUserRotation = 0;
  state.rotation.dragRotation = 0;
  localStorage.removeItem(PLAYER_STORAGE_KEY);
  updateAmbientBackground(null);
  updateAlbumInfo(0);
}

function setPlaylistMonth(monthKey) {
  state.playlistMonth = monthKey;
  const activeIndex = getOrbitIndexById(state.activeTrackId || state.selectedItemId);
  state.currentTrackIndex = activeIndex >= 0 ? activeIndex : 0;
  state.frontItemIndex = clamp(state.frontItemIndex, 0, Math.max(0, getOrbitItems().length - 1));
  renderOrbit();
  seekToIndex(state.currentTrackIndex);
  normalizeRotationBounds();
  updateAlbumInfo(state.currentTrackIndex);
}

function playItemFromMonth(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  setPlaylistMonth(monthKeyForItem(item));
  const playlistIndex = getOrbitIndexById(id);
  if (playlistIndex >= 0) playTrack(playlistIndex);
  switchMode("play");
}

function updateRotation() {
  const rotationEase = state.orbitHover || state.hoverAmount > 0.02 ? 0.105 : 0.135;
  const hoverEase = state.orbitHover ? 0.095 : 0.105;
  state.rotation.userRotation += (state.rotation.targetUserRotation - state.rotation.userRotation) * rotationEase;
  if (Math.abs(state.rotation.targetUserRotation - state.rotation.userRotation) < 0.001) {
    state.rotation.userRotation = state.rotation.targetUserRotation;
  }
  state.hoverAmount += ((state.orbitHover ? 1 : 0) - state.hoverAmount) * hoverEase;
}

function renderOrbitFrame() {
  updateRotation();
  normalizeRotationBounds();

  const cards = orbit.children;
  const orbitItems = getOrbitItems();
  const itemCount = Math.max(1, orbitItems.length);
  const cardStep = getCardStep();
  const finalRotation = clampFinalRotation(
    state.rotation.autoRotation +
    state.rotation.userRotation +
    state.rotation.dragRotation,
  );
  state.rotation.renderedRotation = finalRotation;

  const orbitWidth = orbit.clientWidth || 520;
  const orbitHeight = orbit.clientHeight || 240;
  const radiusX = orbitWidth * 0.36;
  const radiusY = orbitHeight * 0.21;
  const frontProjectionRadius = orbitWidth * 1.42;
  const frontViewDepth = 980;
  let frontIndex = 0;
  let frontDepth = -Infinity;

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const angle = (index * cardStep + finalRotation) % 360;
    const signedAngle = normalizeAngle(angle);
    const rad = (signedAngle * Math.PI) / 180;
    const orbitX = Math.sin(rad) * radiusX;
    const orbitY = Math.cos(rad) * radiusY;
    const orbitZ = Math.cos(rad) * 520;
    const depth = (Math.cos(rad) + 1) / 2;
    const orbitScale = 0.3 + depth * 0.82;
    const orbitOpacity = 0.2 + depth * 0.8;
    const orbitFace = -signedAngle;
    const frontOffset = signedAngle / cardStep;
    const frontX = Math.sin(rad) * frontProjectionRadius;
    const frontY = 0;
    const frontZ = Math.cos(rad) * frontViewDepth;
    const frontFocus = Math.max(0, 1 - Math.abs(frontOffset));
    const sideFocus = Math.max(0, 1 - Math.abs(Math.abs(frontOffset) - 1));
    const frontScale = Math.min(2.08, 0.52 + depth * 0.82 + frontFocus * 0.98 + sideFocus * 0.1728);
    const frontWindow = 1 - smoothstep(1.42, 2.35, Math.abs(frontOffset));
    const frontTurn = clamp(frontOffset, -2.4, 2.4);
    const frontFace = -frontTurn * 13;
    const frontTwist = frontTurn * 4.8;
    const frontBlur = Math.min(3.4, Math.max(0, Math.abs(frontOffset) - 1.05) * 1.25);
    const x = mix(orbitX, frontX, state.hoverAmount);
    const y = mix(orbitY, frontY, state.hoverAmount);
    const z = mix(orbitZ, frontZ, state.hoverAmount);
    const scale = mix(orbitScale, frontScale, state.hoverAmount);
    const opacity = mix(orbitOpacity, frontWindow, state.hoverAmount);
    const face = mixAngle(orbitFace, frontFace, state.hoverAmount);
    const twist = mix(0, frontTwist, state.hoverAmount);
    const blur = mix((1 - depth) * 1.8, frontBlur, state.hoverAmount);

    if (depth > frontDepth) {
      frontDepth = depth;
      frontIndex = index;
    }

    card.style.zIndex = String(Math.round(depth * 1200));
    card.style.opacity = opacity.toFixed(3);
    card.style.filter = `blur(${blur}px)`;
    card.style.setProperty("--shadow-y", `${mix(16, 44 + depth * 34, state.hoverAmount)}px`);
    card.style.setProperty("--shadow-blur", `${mix(26, 58 + depth * 58, state.hoverAmount)}px`);
    card.style.setProperty("--shadow-alpha", mix(0.2 + depth * 0.14, 0.34 + depth * 0.34, state.hoverAmount).toFixed(3));
    card.style.setProperty("--lift-y", `${mix(2, 5 + depth * 4, state.hoverAmount)}px`);
    card.style.setProperty("--lift-blur", `${mix(9, 18 + depth * 14, state.hoverAmount)}px`);
    card.style.setProperty("--lift-alpha", mix(0.035, 0.05 + depth * 0.055, state.hoverAmount).toFixed(3));
    card.style.transform = `
      translate(-50%, -50%)
      translate3d(${x}px, ${y}px, ${z}px)
      rotateX(${mix(2, 0, state.hoverAmount)}deg)
      rotateY(${face}deg)
      rotateZ(${twist}deg)
      scale(${scale})
    `;
  }

  if (orbitItems[frontIndex]) {
    state.frontItemIndex = frontIndex;
    updateAlbumInfo(frontIndex);
  }

}

function tick() {
  renderOrbitFrame();
  updateProgress();
  requestAnimationFrame(tick);
}

function snapRotation(value) {
  return clampFinalRotation(Math.round(value / getCardStep()) * getCardStep());
}

function getFrontIndexFromRotation(value) {
  const orbitItems = getOrbitItems();
  if (!orbitItems.length) return 0;
  if (isFiniteOrbit()) {
    return clamp(Math.round(-clampFinalRotation(value) / getCardStep()), 0, orbitItems.length - 1);
  }
  return ((Math.round(-value / getCardStep()) % orbitItems.length) + orbitItems.length) % orbitItems.length;
}

function snapToNearestCard(immediate = false) {
  const currentFinal =
    state.rotation.autoRotation +
    state.rotation.userRotation +
    state.rotation.dragRotation;
  const snappedFinal = snapRotation(currentFinal);
  state.rotation.targetUserRotation =
    snappedFinal -
    state.rotation.autoRotation -
    state.rotation.dragRotation;
  if (immediate) {
    state.rotation.userRotation = state.rotation.targetUserRotation;
  }
  normalizeRotationBounds(immediate);
  const normalizedFinal =
    state.rotation.autoRotation +
    state.rotation.targetUserRotation +
    state.rotation.dragRotation;
  state.frontItemIndex = getFrontIndexFromRotation(normalizedFinal);
}

function scheduleSnap(delay = 180) {
  window.clearTimeout(state.snapTimer);
  state.snapTimer = window.setTimeout(snapToNearestCard, delay);
}

function setOrbitHover(active) {
  if (state.orbitHover === active) return;
  state.orbitHover = active;
  stage.classList.toggle("is-orbit-hover", active);
  if (active) {
    snapToNearestCard(true);
  }
}

function updateHoverFromPointer(event) {
  if (state.mode !== "play" || !getOrbitItems().length) {
    setOrbitHover(false);
    return;
  }
  const rect = orbitWrap.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / rect.width;
  const localY = (event.clientY - rect.top) / rect.height;
  const centerY = state.orbitHover ? 0.5 : 0.62;
  const radiusX = state.orbitHover ? 0.44 : 0.38;
  const radiusY = state.orbitHover ? 0.31 : 0.21;
  const ellipse =
    ((localX - 0.5) / radiusX) ** 2 +
    ((localY - centerY) / radiusY) ** 2;
  setOrbitHover(ellipse <= 1);
}

function seekToIndex(index, immediate = false) {
  const target = clampFinalRotation(-clampTrackIndex(index) * getCardStep());
  state.rotation.targetUserRotation = target - state.rotation.autoRotation;
  if (immediate) {
    state.rotation.userRotation = state.rotation.targetUserRotation;
  }
}

function playTrack(index = state.currentTrackIndex, options = {}) {
  const reset = options.reset ?? true;
  const orbitItems = getOrbitItems();
  if (!orbitItems.length) return;
  state.currentTrackIndex = clampTrackIndex(index);
  state.selectedItemId = orbitItems[state.currentTrackIndex].id;
  state.activeTrackId = state.selectedItemId;
  seekToIndex(state.currentTrackIndex);
  const item = orbitItems[state.currentTrackIndex];
  startAudioForItem(item);
  updateAmbientBackground(item);
  state.isPlaying = true;
  state.playbackStartedAt = performance.now();
  if (reset) state.playbackOffset = 0;
  updateAlbumInfo();
  renderPlayer();
  savePlayerState();
}

function pauseTrack() {
  state.playbackOffset = getPlaybackTime();
  state.isPlaying = false;
  stopGeneratedAudio(true);
  updateAmbientBackground(null);
  renderPlayer();
  savePlayerState();
}

function stopTrack(clearActive = false) {
  state.playbackOffset = getPlaybackTime();
  state.isPlaying = false;
  stopGeneratedAudio(true);
  if (clearActive) {
    state.activeTrackId = null;
    state.selectedItemId = null;
    state.playbackOffset = 0;
    updateAmbientBackground(null);
    localStorage.removeItem(PLAYER_STORAGE_KEY);
  } else {
    savePlayerState();
  }
  renderPlayer();
}

function nextTrack() {
  navigateTrack(1);
}

function prevTrack() {
  navigateTrack(-1);
}

function navigateTrack(delta) {
  const baseIndex = state.activeTrackId ? state.currentTrackIndex : state.frontItemIndex;
  const nextIndex = clampTrackIndex(baseIndex + delta);
  if (isFiniteOrbit() && nextIndex === baseIndex) return;
  if (state.isPlaying) {
    playTrack(nextIndex);
    return;
  }
  const orbitItems = getOrbitItems();
  state.currentTrackIndex = nextIndex;
  state.frontItemIndex = nextIndex;
  state.selectedItemId = orbitItems[nextIndex]?.id || null;
  seekToIndex(nextIndex);
  updateAlbumInfo(nextIndex);
  renderPlayer();
  savePlayerState();
}

function playDirectionalTrack(delta) {
  navigateTrack(delta);
}

function playFocusedTrack() {
  playTrack(state.frontItemIndex);
}

function handleKeyboard(event) {
  if (state.mode !== "play") return;
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    playDirectionalTrack(1);
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    playDirectionalTrack(-1);
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (state.isPlaying) pauseTrack();
    else playTrack(state.activeTrackId ? state.currentTrackIndex : state.frontItemIndex, { reset: !state.activeTrackId });
  }
}

function getPlaybackTime() {
  if (!state.isPlaying) return state.playbackOffset;
  const elapsed = (performance.now() - state.playbackStartedAt) / 1000;
  return (state.playbackOffset + elapsed) % PLAY_DURATION;
}

function updateProgress() {
  const time = getPlaybackTime();
  playerSeek.value = String(time);
  currentTimeEl.textContent = formatTime(time);
  durationTimeEl.textContent = formatTime(PLAY_DURATION);
  if (state.activeTrackId && performance.now() - state.lastPlayerSaveAt > 1000) {
    state.lastPlayerSaveAt = performance.now();
    savePlayerState();
  }
  if (state.isPlaying && time > PLAY_DURATION - 0.04) {
    state.playbackStartedAt = performance.now();
    state.playbackOffset = 0;
  }
}

function seekTrack(value) {
  state.playbackOffset = clamp(Number(value), 0, PLAY_DURATION);
  state.playbackStartedAt = performance.now();
  if (state.audio.ambient) {
    try {
      state.audio.ambient.currentTime = state.playbackOffset % Math.max(0.1, state.audio.ambient.duration || 2);
    } catch {
      // Some data URLs report duration late.
    }
  }
  renderPlayer();
  savePlayerState();
}

function renderPlayer() {
  playerToggle.textContent = state.isPlaying ? "Ⅱ" : "▶";
  const item = state.items.find((entry) => entry.id === state.activeTrackId);
  nowPlaying.textContent = item ? `Now playing · ${item.title}` : "Not playing";
  playerPanel.classList.toggle("has-track", Boolean(item));
}

function ensureAudioContext() {
  if (state.audio.ctx) return state.audio.ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  state.audio.ctx = new AudioCtx();
  state.audio.master = state.audio.ctx.createGain();
  state.audio.master.gain.value = 0.26;
  state.audio.master.connect(state.audio.ctx.destination);
  return state.audio.ctx;
}

function stopGeneratedAudio(stopAmbient = true) {
  if (state.audio.ctx) {
    state.audio.oscillators.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(state.audio.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, state.audio.ctx.currentTime + 0.18);
        osc.stop(state.audio.ctx.currentTime + 0.2);
      } catch {
        // Already stopped.
      }
    });
  }
  state.audio.oscillators = [];
  if (stopAmbient && state.audio.ambient) {
    try {
      state.audio.ambient.pause();
      state.audio.ambient.currentTime = 0;
      state.audio.ambient.src = "";
      state.audio.ambient.load();
    } catch {
      // Some browsers reject currentTime changes during teardown.
    }
    state.audio.ambient = null;
  }
}

function generateColorAudio(item) {
  const ctx = ensureAudioContext();
  if (ctx.state === "suspended") ctx.resume();
  const palette = item.palette || { h: 220, s: 0.35, v: 0.7 };
  const base = 80 + palette.v * 260 + (palette.h / 360) * 120;
  const richness = 2 + Math.round(palette.s * 4);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700 + palette.v * 2600;
  filter.Q.value = 0.45 + palette.s * 1.2;
  filter.connect(state.audio.master);

  for (let index = 0; index < richness; index += 1) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const detune = (index - richness / 2) * (8 + palette.s * 16);
    osc.type = index % 2 ? "triangle" : "sine";
    osc.frequency.value = base * (1 + index * 0.502);
    osc.detune.value = detune;
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.015 + palette.s * 0.018, ctx.currentTime + 1.2 + index * 0.18);
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    state.audio.oscillators.push({ osc, gain, filter });
  }
}

function loopAmbientAudio(item) {
  if (!item.audio) return;
  const audio = new Audio(item.audio);
  audio.loop = true;
  audio.volume = 0;
  audio.addEventListener("loadedmetadata", () => {
    try {
      audio.currentTime = state.playbackOffset % Math.max(0.1, audio.duration || 2);
    } catch {
      // Metadata can be unavailable for some recorded blobs.
    }
  }, { once: true });
  audio.play().then(() => {
    audio.volume = 0.22;
  }).catch(() => {});
  state.audio.ambient = audio;
}

function startAudioForItem(item) {
  stopGeneratedAudio(true);
  state.audio.currentItemId = item.id;
  generateColorAudio(item);
  loopAmbientAudio(item);
}

function extractDominantColor(imageDataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 48;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let index = 0; index < data.length; index += 16) {
        r += data[index];
        g += data[index + 1];
        b += data[index + 2];
        count += 1;
      }
      resolve(rgbToHsv(Math.round(r / count), Math.round(g / count), Math.round(b / count)));
    };
    image.src = imageDataUrl;
  });
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta && max === rn) h = 60 * (((gn - bn) / delta) % 6);
  if (delta && max === gn) h = 60 * ((bn - rn) / delta + 2);
  if (delta && max === bn) h = 60 * ((rn - gn) / delta + 4);
  if (h < 0) h += 360;
  return { r, g, b, h, s: max ? delta / max : 0, v: max };
}

async function startCamera() {
  if (state.media.stream) {
    captureMemoryButton.disabled = false;
    return;
  }
  state.media.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  cameraPreview.srcObject = state.media.stream;
  captureMemoryButton.disabled = false;
  recordStatus.textContent = "Camera is live. Capture Memory records image and ambient audio.";
}

function stopCamera() {
  if (!state.media.stream) return;
  state.media.stream.getTracks().forEach((track) => track.stop());
  state.media.stream = null;
  cameraPreview.srcObject = null;
  captureMemoryButton.disabled = true;
}

function recordAmbient(duration = 2200) {
  return new Promise((resolve, reject) => {
    const stream = state.media.stream;
    if (!stream) {
      reject(new Error("Camera is not active."));
      return;
    }
    const audioTracks = stream.getAudioTracks();
    const audioStream = new MediaStream(audioTracks);
    const recorder = new MediaRecorder(audioStream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    recorder.start();
    window.setTimeout(() => recorder.stop(), duration);
  });
}

async function captureMemory() {
  if (!state.media.stream) {
    recordStatus.textContent = "Start Camera first, then capture the memory.";
    return;
  }
  captureMemoryButton.disabled = true;
  const canvas = captureCanvas;
  const ctx = canvas.getContext("2d");
  const size = Math.min(cameraPreview.videoWidth || 960, cameraPreview.videoHeight || 960);
  const sx = ((cameraPreview.videoWidth || 960) - size) / 2;
  const sy = ((cameraPreview.videoHeight || 960) - size) / 2;
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraPreview, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  const image = canvas.toDataURL("image/jpeg", 0.9);
  capturedPreview.style.backgroundImage = `url("${image}")`;
  capturedPreview.classList.add("has-image");
  recordStatus.textContent = "Recording ambient air...";
  const audio = await recordAmbient();
  const palette = await extractDominantColor(image);
  state.createDraft = { image, audio, palette };
  recordStatus.textContent = "Image and ambient audio are ready.";
  validateCreate();
  captureMemoryButton.disabled = false;
}

function validateCreate() {
  createSubmit.disabled = !(state.createDraft.image && state.createDraft.audio && createTitle.value.trim());
}

async function createItem() {
  if (createSubmit.disabled) return;
  const item = {
    id: `item-${Date.now()}`,
    image: state.createDraft.image,
    audio: state.createDraft.audio,
    art: null,
    palette: state.createDraft.palette,
    title: createTitle.value.trim(),
    comment: createComment.value.trim(),
    createdAt: new Date().toISOString(),
  };
  state.items = [...state.items, item].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  renderOrbit();
  setPlaylistMonth(monthKeyForItem(item));
  const createdIndex = getOrbitIndexById(item.id);
  switchMode("play");
  if (createdIndex >= 0) {
    try {
      playTrack(createdIndex);
    } catch {
      state.currentTrackIndex = createdIndex;
      state.selectedItemId = item.id;
      state.activeTrackId = item.id;
      seekToIndex(createdIndex);
      updateAlbumInfo(createdIndex);
      renderPlayer();
    }
  }
  await saveData();
  state.createDraft = { image: null, audio: null, palette: null };
  createTitle.value = "";
  createComment.value = "";
  capturedPreview.classList.remove("has-image");
  capturedPreview.style.backgroundImage = "";
  validateCreate();
}

function editItem(id, patch) {
  state.items = state.items.map((item) => item.id === id ? { ...item, ...patch } : item);
  saveData();
  renderOrbit();
  renderEdit();
  updateAlbumInfo();
}

function deleteItem(id) {
  const wasActiveTrack = state.activeTrackId === id || state.audio.currentItemId === id;
  if (wasActiveTrack) {
    stopTrack(true);
    state.audio.currentItemId = null;
  }
  state.items = state.items.filter((item) => item.id !== id);
  saveData();
  if (!state.items.length) {
    resetEmptyState();
    renderOrbit();
    renderEdit();
    renderPlayer();
    return;
  }
  if (!getOrbitItems().length || !state.items.some((item) => monthKeyForItem(item) === state.playlistMonth)) {
    state.playlistMonth = null;
  }
  const orbitItems = getOrbitItems();
  state.currentTrackIndex = clamp(state.currentTrackIndex, 0, Math.max(0, orbitItems.length - 1));
  state.selectedItemId = orbitItems[state.currentTrackIndex]?.id || null;
  if (wasActiveTrack) state.selectedItemId = null;
  renderOrbit();
  renderEdit();
  updateAlbumInfo();
  renderPlayer();
}

function renderEdit() {
  const groups = new Map();
  sortedItems().forEach((item) => {
    const key = monthKeyForItem(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  editList.innerHTML = "";

  if (!groups.size) {
    state.edit.selectedMonth = null;
    editList.innerHTML = `<p class="empty-edit">record &amp; create your Orbit.</p>`;
    return;
  }

  if (!state.edit.selectedMonth || !groups.has(state.edit.selectedMonth)) {
    state.edit.selectedMonth = null;
    groups.forEach((items, month) => {
      const monthButton = document.createElement("button");
      const firstImage = items.find((item) => item.image);
      monthButton.className = "month-card";
      monthButton.type = "button";
      monthButton.dataset.monthKey = month;
      monthButton.innerHTML = `
        <span class="month-cover" style="background-image:${firstImage ? `url('${firstImage.image}')` : "none"}; background:${firstImage ? "" : artForItem(items[0])}"></span>
        <span>
          <strong>${month}</strong>
          <em>${items.length} orbit items</em>
        </span>
      `;
      editList.appendChild(monthButton);
    });
    return;
  }

  const header = document.createElement("div");
  header.className = "month-detail-head";
  header.innerHTML = `
    <button class="quiet-button" type="button" data-edit-back>← Months</button>
    <p>${state.edit.selectedMonth}</p>
  `;
  editList.appendChild(header);

  groups.get(state.edit.selectedMonth).forEach((item) => {
    const row = document.createElement("article");
    row.className = "edit-item";
    row.innerHTML = `
      <div class="edit-thumb" style="background-image:${item.image ? `url('${item.image}')` : "none"}; background:${item.image ? "" : artForItem(item)}"></div>
      <div class="edit-fields">
        <input value="${escapeHtml(item.title)}" aria-label="Title" data-edit-title="${item.id}" />
        <textarea rows="2" aria-label="Comment" data-edit-comment="${item.id}">${escapeHtml(item.comment || "")}</textarea>
      </div>
      <div class="edit-actions">
        <button class="quiet-button play-item-button" type="button" data-play-id="${item.id}">Play</button>
        <button class="quiet-button delete-button" type="button" data-delete-id="${item.id}">Delete</button>
      </div>
    `;
    editList.appendChild(row);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.modeTarget));
});

document.querySelector("[data-create-action='capture']").addEventListener("click", () => {
  captureMemory().catch(() => {
    recordStatus.textContent = "Could not capture memory.";
    captureMemoryButton.disabled = !state.media.stream;
  });
});

createTitle.addEventListener("input", validateCreate);
createSubmit.addEventListener("click", createItem);

editList.addEventListener("change", (event) => {
  const titleId = event.target.dataset.editTitle;
  const commentId = event.target.dataset.editComment;
  if (titleId) editItem(titleId, { title: event.target.value.trim() || "Untitled" });
  if (commentId) editItem(commentId, { comment: event.target.value.trim() });
});

editList.addEventListener("click", (event) => {
  const monthButton = event.target.closest("[data-month-key]");
  if (monthButton) {
    state.edit.selectedMonth = monthButton.dataset.monthKey;
    renderEdit();
    return;
  }
  if (event.target.closest("[data-edit-back]")) {
    state.edit.selectedMonth = null;
    renderEdit();
    return;
  }
  const playButton = event.target.closest("[data-play-id]");
  if (playButton) {
    playItemFromMonth(playButton.dataset.playId);
    return;
  }
  const id = event.target.dataset.deleteId;
  if (id) deleteItem(id);
});

document.querySelector("[data-player-action='prev']").addEventListener("click", prevTrack);
document.querySelector("[data-player-action='next']").addEventListener("click", nextTrack);
playerToggle.addEventListener("click", () => {
  if (state.isPlaying) pauseTrack();
  else playTrack(state.currentTrackIndex, { reset: !state.activeTrackId });
});
playerSeek.addEventListener("input", () => seekTrack(playerSeek.value));

window.addEventListener("wheel", (event) => {
  if (state.mode !== "play") return;
  if (!getOrbitItems().length) return;
  event.preventDefault();
  const now = performance.now();
  const interval = state.orbitHover ? 125 : 85;
  if (now - state.lastWheelStepAt < interval) return;
  state.lastWheelStepAt = now;
  const currentTargetFinal =
    state.rotation.autoRotation +
    state.rotation.targetUserRotation +
    state.rotation.dragRotation;
  const nextTargetFinal = clampFinalRotation(
    currentTargetFinal - Math.sign(event.deltaY || 1) * getCardStep(),
  );
  state.rotation.targetUserRotation =
    nextTargetFinal -
    state.rotation.autoRotation -
    state.rotation.dragRotation;
  normalizeRotationBounds();
  scheduleSnap(state.orbitHover ? 170 : 130);
}, { passive: false });

window.addEventListener("pointermove", updateHoverFromPointer);
window.addEventListener("pointerleave", () => setOrbitHover(false));
window.addEventListener("keydown", handleKeyboard);

async function initApp() {
  await loadData();
  loadPlayerState();
  renderOrbit();
  renderMode();
  updateAlbumInfo(state.frontItemIndex || state.currentTrackIndex || 0);
  renderPlayer();
  tick();
}

initApp();
