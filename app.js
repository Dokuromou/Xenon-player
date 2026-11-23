/* XENON v3 — Dashboard Player Engine */
"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LS = {
  get(k, d) { try { const v = localStorage.getItem("xbm_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("xbm_" + k, JSON.stringify(v)); } catch {} },
};
const fmt = (s) => { if (!isFinite(s) || s < 0) return "0:00"; s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const fmtLong = (s) => { if (!isFinite(s) || s <= 0) return "0h"; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- STATE ---------- */
const state = {
  tracks: [],
  currentId: null,
  queue: [],
  shuffle: LS.get("shuffle", false),
  repeat: LS.get("repeat", 0),
  favorites: new Set(LS.get("favorites", [])),
  playlists: LS.get("playlists", []),
  tagOverrides: LS.get("tagOverrides", {}),
  lyricsStore: LS.get("lyrics", {}),
  playCounts: LS.get("playCounts", {}), // id -> {count, lastPlayed}
  theme: LS.get("theme", "toxic"),
  sounds: LS.get("sounds", true),
  autoplay: LS.get("autoplay", true),
  showViz: LS.get("showViz", true),
  fade: LS.get("fade", true),
  haptics: LS.get("haptics", true),
  vizMode: LS.get("vizMode", "round"),
  speed: LS.get("speed", 1),
  volume: LS.get("volume", 0.8),
  eq: LS.get("eq", { enabled: true, preset: "flat", gains: [0,0,0,0,0,0,0,0,0,0] }),
  sleepUntil: 0, sleepTimer: null, sleepTick: null,
  view: "home",
  search: "",
  sort: "recent",
  activePlaylistId: null,
  menuTrackId: null,
  pickerTrackId: null,
  playlistEditId: null,
  playlistSelection: new Set(),
  parsedLyrics: [],
  radioPlaying: null, // {name, url}
  editMode: "track", // or "album"
  pendingCover: null, // null = unchanged, "" = remove, dataURL = new
  _albumsCache: [],
  _artistsCache: [],
};
const DEMO = [
  { title: "Neon Horizon", artist: "Synthwave Collective", album: "Midnight Drive", track: 1, year: 2024, genre: "Electronic", url: "https://www.soundhelix.com/examples/js/soundhelix-song-1.mp3" },
  { title: "Toxic Pulse", artist: "Green Reactor", album: "Dashboard", track: 2, year: 2023, genre: "Rock", url: "https://www.soundhelix.com/examples/js/soundhelix-song-2.mp3" },
  { title: "Danger Zone", artist: "Red Alert", album: "Arcade Nights", track: 1, year: 2024, genre: "Synthpop", url: "https://www.soundhelix.com/examples/js/soundhelix-song-3.mp3" },
  { title: "Blue Circuit", artist: "Pixel Dreams", album: "Midnight Drive", track: 2, year: 2022, genre: "Chillwave", url: "https://www.soundhelix.com/examples/js/soundhelix-song-4.mp3" },
  { title: "Game Over", artist: "8-Bit Heroes", album: "Arcade Nights", track: 2, year: 2021, genre: "Chiptune", url: "https://www.soundhelix.com/examples/js/soundhelix-song-5.mp3" },
  { title: "Respawn", artist: "Synthwave Collective", album: "Dashboard", track: 3, year: 2024, genre: "Electronic", url: "https://www.soundhelix.com/examples/js/soundhelix-song-6.mp3" },
  { title: "Level Up", artist: "Green Reactor", album: "Dashboard", track: 4, year: 2023, genre: "Rock", url: "https://www.soundhelix.com/examples/js/soundhelix-song-7.mp3" },
  { title: "Final Boss", artist: "Pixel Dreams", album: "Arcade Nights", track: 3, year: 2022, genre: "Electronic", url: "https://www.soundhelix.com/examples/js/soundhelix-song-8.mp3" },
];
const RADIO_PRESETS = [
  { name: "Groove Salad", genre: "Ambient / Chill", icon: "🥗", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { name: "Drone Zone", genre: "Ambient Drone", icon: "🌌", url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { name: "Lush", genre: "Mellow / Vocal", icon: "🌸", url: "https://ice1.somafm.com/lush-128-mp3" },
  { name: "Secret Agent", genre: "Spy / Lounge", icon: "🕶️", url: "https://ice1.somafm.com/secretagent-128-mp3" },
  { name: "Metal", genre: "Metal", icon: "🤘", url: "https://ice1.somafm.com/metal-128-mp3" },
  { name: "Radio Swiss Pop", genre: "Pop Hits", icon: "🇨🇭", url: "https://stream.srg-ssr.ch/m/rsz/mp3_128" },
  { name: "Radio Swiss Jazz", genre: "Jazz", icon: "🎷", url: "https://stream.srg-ssr.ch/m/rsj/mp3_128" },
  { name: "Nightride FM", genre: "Synthwave", icon: "🌃", url: "https://stream.nightride.fm/nightride.mp3" },
];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ---------- AUDIO ENGINE ---------- */
const audio = $("#audio");
const radioAudio = $("#radioAudio");
let actx = null, analyser = null, eqNodes = [], masterGain = null, audioReady = false;
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ["31","62","125","250","500","1k","2k","4k","8k","16k"];
const EQ_PRESETS = {
  flat: [0,0,0,0,0,0,0,0,0,0], bass: [8,7,5,2,0,0,0,1,2,3], treble: [-2,-1,0,1,2,3,4,5,6,7],
  vocal: [-3,-1,0,2,4,5,4,2,0,-1], rock: [4,2,-1,-2,1,3,5,6,6,6], pop: [-1,0,2,3,4,2,0,-1,-2,-2],
  jazz: [2,1,0,1,3,4,3,1,0,-1], electronic: [6,5,2,0,-1,1,3,4,5,6],
};
function initAudioGraph() {
  if (audioReady) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audio);
    masterGain = actx.createGain(); masterGain.gain.value = 1; // volume handled via audio.volume (fade-friendly)
    analyser = actx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.82;
    let node = src;
    eqNodes = EQ_FREQS.map((f, i) => {
      const b = actx.createBiquadFilter();
      b.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
      b.frequency.value = f; b.Q.value = 1.1; b.gain.value = state.eq.enabled ? (state.eq.gains[i] || 0) : 0;
      node.connect(b); return b;
    });
    node = eqNodes.length ? eqNodes[eqNodes.length - 1] : node;
    node.connect(masterGain); masterGain.connect(analyser); analyser.connect(actx.destination);
    audioReady = true;
  } catch (e) { console.warn("WebAudio unavailable, using plain playback", e); }
}
function applyEQ() {
  if (!audioReady) return;
  eqNodes.forEach((b, i) => { b.gain.setTargetAtTime(state.eq.enabled ? (state.eq.gains[i] || 0) : 0, actx.currentTime, 0.03); });
  LS.set("eq", state.eq);
}
function ensureCtx() { initAudioGraph(); if (actx && actx.state === "suspended") actx.resume(); }

/* fade helper */
let fadeToken = 0;
function fadeTo(el, target, ms = 350) {
  if (!state.fade) { el.volume = target; return; }
  const token = ++fadeToken, start = el.volume, t0 = performance.now();
  (function step(now) {
    if (token !== fadeToken) return;
    const p = Math.min((now - t0) / ms, 1);
    el.volume = start + (target - start) * p;
    if (p < 1) requestAnimationFrame(step); else el.volume = target;
  })(t0);
}
function restoreVolume() { audio.volume = state.volume; radioAudio.volume = state.volume; }

/* ---------- UI SOUNDS + HAPTICS ---------- */
let uiCtx = null;
function beep(freq = 660, dur = 0.07, type = "square", vol = 0.05) {
  if (!state.sounds) return;
  try {
    uiCtx = uiCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (uiCtx.state === "suspended") uiCtx.resume();
    const o = uiCtx.createOscillator(), g = uiCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, uiCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, uiCtx.currentTime + dur);
    o.connect(g); g.connect(uiCtx.destination); o.start(); o.stop(uiCtx.currentTime + dur);
  } catch {}
}
const sfx = { nav: () => beep(520, .06), select: () => { beep(880, .07); setTimeout(() => beep(1320, .09), 60); }, back: () => beep(330, .08), play: () => { beep(660, .06); setTimeout(() => beep(990, .1), 55); }, error: () => beep(180, .15, "sawtooth", .06) };
function buzz(ms = 10) { if (state.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch {} }

/* ---------- TOAST ---------- */
let toastT = null;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 2600); }

/* ---------- THEME ---------- */
const THEME_COLORS = { toxic: "#107C10", neon: "#2979ff", danger: "#d50000", void: "#651fff" };
function setTheme(name) {
  state.theme = name; document.documentElement.dataset.theme = name;
  LS.set("theme", name);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = THEME_COLORS[name] || "#107C10";
  $$("[data-set-theme]").forEach(b => b.classList.toggle("active", b.dataset.setTheme === name));
  sfx.nav();
}

/* ---------- INDEXEDDB (folder handle) ---------- */
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (this.db) return res(this.db);
      if (!("indexedDB" in window)) return rej(new Error("no idb"));
      const r = indexedDB.open("xbox-music", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async set(k, v) { try { const db = await this.open(); return new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = res; }); } catch {} },
  async get(k) { try { const db = await this.open(); return new Promise((res) => { const rq = db.transaction("kv").objectStore("kv").get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }); } catch { return null; } },
};

/* ---------- FILE LOADING + TAG PARSING ---------- */
let scanCancel = false;
function showScan(on) { $("#scanOverlay").classList.toggle("hidden", !on); }
function updateScan(i, total, name) {
  $("#scanFill").style.width = total ? Math.round((i / total) * 100) + "%" : "0%";
  $("#scanText").textContent = `(${i}/${total}) ${name}`;
}
function parseTags(file) {
  return new Promise((resolve) => {
    const fallback = { title: file.name.replace(/\.[^.]+$/, "").replace(/^\d+\s*[-_.]\s*/, ""), artist: "Unknown Artist", album: "Unknown Album", track: 0, year: "", genre: "", cover: null };
    if (typeof jsmediatags === "undefined") return resolve(fallback);
    try {
      jsmediatags.read(file, {
        onSuccess: (tag) => {
          const t = tag.tags || {};
          let cover = null;
          if (t.picture && t.picture.data) {
            const bytes = new Uint8Array(t.picture.data);
            let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
            cover = "data:" + (t.picture.format || "image/jpeg") + ";base64," + btoa(bin);
          }
          resolve({
            title: t.title || fallback.title, artist: t.artist || "Unknown Artist", album: t.album || "Unknown Album",
            track: typeof t.track === "number" ? t.track : parseInt(t.track) || 0,
            year: t.year || "", genre: t.genre || "", cover,
          });
        },
        onError: () => resolve(fallback),
      });
    } catch { resolve(fallback); }
  });
}
async function addFiles(fileList) {
  const files = [...fileList].filter(f => /audio|\.(mp3|m4a|ogg|oga|wav|flac|aac|opus|webm)$/i.test(f.type + f.name));
  if (!files.length) { toast("No audio files found in that selection"); sfx.error(); return; }
  showScan(true); scanCancel = false;
  let added = 0;
  for (let i = 0; i < files.length; i++) {
    if (scanCancel) break;
    const f = files[i];
    updateScan(i + 1, files.length, f.name);
    const id = "f_" + f.name + "_" + f.size + "_" + f.lastModified;
    if (state.tracks.some(t => t.id === id)) continue;
    const tags = await parseTags(f);
    const ov = state.tagOverrides[id] || {};
    state.tracks.push({
      id, fileName: f.name, url: URL.createObjectURL(f), size: f.size || 0,
      title: ov.title || tags.title, artist: ov.artist || tags.artist, album: ov.album || tags.album,
      track: ov.track ?? tags.track, year: ov.year || tags.year, genre: ov.genre || tags.genre,
      cover: ov.cover !== undefined ? ov.cover : tags.cover, duration: 0, addedAt: Date.now() + added,
    });
    added++;
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }
  showScan(false);
  if (added) { toast(`✅ Added ${added} track(s)!`); sfx.select(); }
  else if (!scanCancel) toast("Those files are already in your library");
  renderAll();
  if (!state.currentId && !state.radioPlaying && state.tracks.length) playTrack(state.tracks[0].id, state.tracks.map(t => t.id));
}
async function scanDirHandle(handle) {
  const files = [];
  async function walk(dir, depth = 0) {
    if (depth > 8) return;
    for await (const entry of dir.values()) {
      if (entry.kind === "file") {
        if (/\.(mp3|m4a|ogg|oga|wav|flac|aac|opus|webm)$/i.test(entry.name)) files.push(await entry.getFile());
      } else if (entry.kind === "directory") await walk(entry, depth + 1);
    }
  }
  await walk(handle);
  return files;
}
async function pickMusicFolder() {
  ensureCtx();
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await idb.set("musicDir", handle);
      updateFolderStatus(handle.name);
      const files = await scanDirHandle(handle);
      await addFiles(files);
      enterApp();
      return;
    } catch (e) { if (e.name === "AbortError") return; console.warn(e); }
  }
  $("#folderInput").click();
}
async function tryAutoScan() {
  try {
    const handle = await idb.get("musicDir");
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm === "granted") {
      const files = await scanDirHandle(handle);
      if (files.length) { await addFiles(files); enterApp(); updateFolderStatus(handle.name); }
    } else {
      updateFolderStatus(handle.name + " — tap “Rescan Music Folder” in Settings to reconnect");
    }
  } catch {}
}
function updateFolderStatus(name) { $("#folderStatus").textContent = "Folder auto-scan: " + name; }
function loadDemo() {
  DEMO.forEach((d, i) => {
    const id = "demo_" + i;
    if (state.tracks.some(t => t.id === id)) return;
    const ov = state.tagOverrides[id] || {};
    state.tracks.push({ id, fileName: d.title + ".mp3", url: d.url, cover: null, duration: 0, addedAt: Date.now() + i, size: 0, ...d, ...ov });
  });
  toast("🎮 Demo library loaded — 8 tracks");
  sfx.select(); checkMilestones(); renderAll();
  if (!state.currentId && !state.radioPlaying) playTrack(state.tracks[0].id, state.tracks.map(t => t.id));
}
function enterApp() {
  const boot = $("#bootOverlay"), app = $("#app");
  finishIntro(true);
  app.classList.remove("hidden");
  app.classList.remove("entered"); void app.offsetWidth; app.classList.add("entered");
  renderAll();
  if (!boot.classList.contains("hidden")) {
    boot.classList.add("exiting");
    setTimeout(() => { boot.classList.add("hidden"); boot.classList.remove("exiting"); }, 520);
  }
}

/* ---------- ACHIEVEMENTS ---------- */
function unlock(id, name) {
  if (state.achievements[id]) return;
  state.achievements[id] = Date.now(); LS.set("achievements", state.achievements);
  toast(`🏆 Achievement unlocked: ${name}`); sfx.select(); buzz(30);
}
function checkMilestones() {
  const n = state.tracks.length;
  if (n >= 10) unlock("collector", "Collector — 10 tracks loaded");
  if (n >= 50) unlock("hoarder", "Hoarder — 50 tracks loaded");
  if (n >= 100) unlock("archivist", "Archivist — 100 tracks loaded");
}

/* ---------- HELPERS ---------- */
const byId = (id) => state.tracks.find(t => t.id === id);
const current = () => byId(state.currentId);
function filteredTracks(list) {
  let arr = [...list];
  if (state.search) {
    const q = state.search.toLowerCase();
    arr = arr.filter(t => (t.title + " " + t.artist + " " + t.album + " " + (t.genre || "")).toLowerCase().includes(q));
  }
  const s = state.sort, pc = (t) => state.playCounts[t.id]?.count || 0;
  arr.sort((a, b) => s === "title" ? a.title.localeCompare(b.title) : s === "artist" ? a.artist.localeCompare(b.artist) : s === "album" ? a.album.localeCompare(b.album) : s === "duration" ? (a.duration || 0) - (b.duration || 0) : s === "plays" ? pc(b) - pc(a) : (b.addedAt || 0) - (a.addedAt || 0));
  return arr;
}
function albumsOf(list) {
  const map = new Map();
  list.forEach(t => {
    const key = (t.album || "Unknown Album") + "||" + (t.artist || "Unknown Artist");
    if (!map.has(key)) map.set(key, { album: t.album || "Unknown Album", artist: t.artist || "Unknown Artist", tracks: [], cover: null });
    const a = map.get(key); a.tracks.push(t); if (!a.cover && t.cover) a.cover = t.cover;
  });
  return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
}
function artistsOf(list) {
  const map = new Map();
  list.forEach(t => {
    const key = t.artist || "Unknown Artist";
    if (!map.has(key)) map.set(key, { artist: key, tracks: [], cover: null, albums: new Set() });
    const a = map.get(key); a.tracks.push(t); a.albums.add(t.album); if (!a.cover && t.cover) a.cover = t.cover;
  });
  return [...map.values()].sort((a, b) => a.artist.localeCompare(b.artist));
}
function coverHTML(t) { return t.cover ? `<img src="${t.cover}" alt="">` : `<span>🎵</span>`; }
function favBtnHTML(t) { return `<button class="t-fav ${state.favorites.has(t.id) ? "on" : ""}" data-fav="${t.id}" title="Favorite">${state.favorites.has(t.id) ? "♥" : "♡"}</button>`; }
function trackRowHTML(t, i) {
  const playing = t.id === state.currentId && !state.radioPlaying;
  const plays = state.playCounts[t.id]?.count || 0;
  return `<div class="track-row ${playing ? "playing" : ""}" data-play="${t.id}">
    <span class="t-num">${playing ? '<span class="eq-bars"><i></i><i></i><i></i></span>' : (i + 1)}</span>
    <span class="t-cover">${coverHTML(t)}</span>
    <span class="t-meta"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)} • ${esc(t.album)}${t.track ? " • #" + t.track : ""}${plays > 1 ? " • ▶" + plays : ""}</div></span>
    <span class="t-dur">${fmt(t.duration)}</span>
    ${favBtnHTML(t)}
    <button class="t-menu" data-menu="${t.id}" title="More">⋯</button>
  </div>`;
}

/* ---------- RENDER ---------- */
function renderAll() {
  const albums = albumsOf(state.tracks), artists = artistsOf(state.tracks);
  $("#libraryCount").textContent = `${state.tracks.length} tracks • ${albums.length} albums • ${artists.length} artists`;
  renderCarousel(albums); renderAlbumGrid(albums); renderArtists(artists); renderHomeList(); renderAllSongs(); renderPlaylists(); renderFavorites(); renderQueue(); renderRadio(); renderStats(); renderRecentTop(); updatePlayerUI();
}
function albumCardHTML(a, idx) {
  return `<div class="album-card" data-album-idx="${idx}" tabindex="0">
    <div class="cover">${a.cover ? `<img src="${a.cover}" alt="">` : `<span>🎮</span>`}<span class="play-badge">▶</span></div>
    <div class="a-title">${esc(a.album)}</div><div class="a-artist">${esc(a.artist)}</div>
    <div class="a-meta">${a.tracks.length} track${a.tracks.length > 1 ? "s" : ""}</div>
  </div>`;
}
function renderCarousel(albums) {
  state._albumsCache = albums;
  const wrap = $("#albumCarousel"), dots = $("#albumDots");
  wrap.innerHTML = albums.length ? albums.map((a, i) => albumCardHTML(a, i)).join("") : `<div class="empty-state" style="width:100%"><div class="empty-icon">🎮</div><h3>No albums yet</h3><p>Load music to see your game selection.</p></div>`;
  dots.innerHTML = albums.map((_, i) => `<span class="${i === 0 ? "on" : ""}"></span>`).join("");
}
function renderAlbumGrid(albums) {
  $("#albumGrid").innerHTML = albums.length ? albums.map((a, i) => albumCardHTML(a, i)).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎮</div><p>No albums yet.</p></div>`;
}
function renderArtists(artists) {
  state._artistsCache = artists;
  $("#artistGrid").innerHTML = artists.length ? artists.map((a, i) => `
    <div class="album-card" data-artist-idx="${i}">
      <div class="cover">${a.cover ? `<img src="${a.cover}" alt="">` : `<span>🎤</span>`}<span class="play-badge">▶</span></div>
      <div class="a-title">${esc(a.artist)}</div><div class="a-artist">${a.albums.size} album${a.albums.size > 1 ? "s" : ""}</div>
      <div class="a-meta">${a.tracks.length} track${a.tracks.length > 1 ? "s" : ""}</div>
    </div>`).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎤</div><p>No artists yet.</p></div>`;
}
function renderHomeList() {
  const list = filteredTracks(state.tracks);
  $("#trackList").innerHTML = list.map((t, i) => trackRowHTML(t, i)).join("");
  $("#emptyState").classList.toggle("hidden", state.tracks.length > 0);
  $("#upNextCount").textContent = list.length;
}
function renderAllSongs() {
  const list = filteredTracks(state.tracks);
  $("#allSongsList").innerHTML = list.map((t, i) => trackRowHTML(t, i)).join("");
  $("#songsCount").textContent = `${list.length} tracks`;
}
function renderRecentTop() {
  const recent = state.tracks.filter(t => state.playCounts[t.id]?.lastPlayed).sort((a, b) => state.playCounts[b.id].lastPlayed - state.playCounts[a.id].lastPlayed).slice(0, 8);
  const top = state.tracks.filter(t => (state.playCounts[t.id]?.count || 0) > 0).sort((a, b) => (state.playCounts[b.id].count || 0) - (state.playCounts[a.id].count || 0)).slice(0, 8);
  $("#recentSection").classList.toggle("hidden", !recent.length);
  $("#topSection").classList.toggle("hidden", !top.length);
  $("#recentList").innerHTML = recent.map((t, i) => trackRowHTML(t, i)).join("");
  $("#topList").innerHTML = top.map((t, i) => trackRowHTML(t, i)).join("");
}
function renderPlaylists() {
  const grid = $("#playlistGrid");
  grid.innerHTML = state.playlists.length ? state.playlists.map(p => `
    <div class="pl-card" data-pl="${p.id}"><div class="pl-icon">📋</div><h3>${esc(p.name)}</h3><p>${p.ids.length} track${p.ids.length === 1 ? "" : "s"}</p></div>`).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📋</div><h3>No playlists yet</h3><p>Create one, then add songs from the ⋯ menu.</p></div>`;
  if (state.activePlaylistId) renderPlaylistDetail();
}
function renderPlaylistDetail() {
  const p = state.playlists.find(x => x.id === state.activePlaylistId);
  if (!p) { $("#playlistDetail").classList.add("hidden"); return; }
  $("#playlistDetail").classList.remove("hidden");
  $("#plDetailTitle").textContent = "📋 " + p.name;
  $("#plDetailCount").textContent = `${p.ids.length} tracks`;
  const tracks = p.ids.map(byId).filter(Boolean);
  $("#playlistTracks").innerHTML = tracks.length ? tracks.map((t, i) => trackRowHTML(t, i)).join("") : `<div class="empty-state"><p>This playlist is empty. Add songs via the ⋯ menu on any track.</p></div>`;
}
function renderFavorites() {
  const favs = filteredTracks(state.tracks.filter(t => state.favorites.has(t.id)));
  $("#favList").innerHTML = favs.length ? favs.map((t, i) => trackRowHTML(t, i)).join("") : `<div class="empty-state"><div class="empty-icon">❤️</div><h3>No favorites yet</h3><p>Tap ♡ on any song to save it here.</p></div>`;
}
function renderQueue() {
  const q = state.queue.map(byId).filter(Boolean);
  $("#queueList").innerHTML = q.length ? q.map((t, i) => `<div class="queue-item ${t.id === state.currentId ? "playing" : ""}" data-play="${t.id}"><span class="q-num">${i + 1}</span><span style="flex:1;min-width:0"><b>${esc(t.title)}</b><br><small style="color:var(--muted)">${esc(t.artist)}</small></span><span>${fmt(t.duration)}</span><button class="q-del" data-qdel="${t.id}" title="Remove from queue">✕</button></div>`).join("") : `<p class="hint">Queue is empty. Play something!</p>`;
}
function renderRadio() {
  const custom = LS.get("radioStations", []);
  const all = [...RADIO_PRESETS.map(p => ({ ...p, preset: true })), ...custom];
  $("#radioGrid").innerHTML = all.map(s => `
    <div class="pl-card ${state.radioPlaying?.url === s.url ? "live" : ""}" data-radio="${esc(s.url)}" data-rname="${esc(s.name)}">
      <div class="pl-icon">${state.radioPlaying?.url === s.url ? "🔴" : "📻"} ${s.icon || ""}</div>
      <h3>${esc(s.name)}</h3><p>${esc(s.genre || "Live stream")}</p>
      ${!s.preset ? `<button class="pl-del" data-radiodel="${s.id}" title="Remove station">✕</button>` : ""}
    </div>`).join("");
}
function renderStats() {
  const box = $("#statsBox");
  if (!state.tracks.length) { box.innerHTML = "Load music to see stats."; return; }
  const totalDur = state.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const plays = Object.values(state.playCounts).reduce((s, p) => s + (p.count || 0), 0);
  const albums = albumsOf(state.tracks).length, artists = artistsOf(state.tracks).length;
  box.innerHTML = `
    <div class="stat"><b>${state.tracks.length}</b><span>Tracks</span></div>
    <div class="stat"><b>${albums}</b><span>Albums</span></div>
    <div class="stat"><b>${artists}</b><span>Artists</span></div>
    <div class="stat"><b>${fmtLong(totalDur)}</b><span>Total Time</span></div>
    <div class="stat"><b>${state.favorites.size}</b><span>Favorites</span></div>
    <div class="stat"><b>${plays}</b><span>Total Plays</span></div>`;
}
function updatePlayerUI() {
  const t = current(), r = state.radioPlaying;
  if (r) {
    $("#playerTitle").textContent = r.name;
    $("#playerArtist").textContent = "📻 Live Radio";
    $("#playerCover").innerHTML = "<span>📻</span>";
    $("#npTitle").textContent = r.name; $("#npArtist").textContent = "📻 Live Radio"; $("#npAlbum").textContent = "Streaming live";
    $("#npCover").innerHTML = "<span>📻</span>";
    $("#btnFavPlayer").textContent = "📻"; $("#btnFavPlayer").classList.remove("on");
    $("#npFav").textContent = "📻 Live";
    $("#timeTotal").textContent = "LIVE"; $("#npTotal").textContent = "LIVE";
    $("#progress").disabled = true; $("#npProgress").disabled = true;
  } else {
    $("#playerTitle").textContent = t ? t.title : "No track selected";
    $("#playerArtist").textContent = t ? `${t.artist} • ${t.album}` : "Load music to begin";
    $("#playerCover").innerHTML = t ? coverHTML(t) : "<span>🎵</span>";
    $("#npTitle").textContent = t ? t.title : "—";
    $("#npArtist").textContent = t ? t.artist : "—";
    $("#npAlbum").textContent = t ? `${t.album}${t.year ? " • " + t.year : ""}${t.genre ? " • " + t.genre : ""}` : "—";
    $("#npCover").innerHTML = t ? coverHTML(t) : "<span>🎵</span>";
    const isFav = t && state.favorites.has(t.id);
    $("#btnFavPlayer").textContent = isFav ? "♥" : "♡"; $("#btnFavPlayer").classList.toggle("on", !!isFav);
    $("#npFav").textContent = isFav ? "♥ Favorited" : "♡ Favorite";
    $("#timeTotal").textContent = fmt(audio.duration); $("#npTotal").textContent = fmt(audio.duration);
    $("#progress").disabled = false; $("#npProgress").disabled = false;
  }
  const playing = r ? !radioAudio.paused : !audio.paused;
  $("#btnPlay").textContent = playing ? "⏸" : "▶";
  $("#npPlay").textContent = playing ? "⏸" : "▶";
  $("#btnShuffle").classList.toggle("on", state.shuffle); $("#npShuffle").classList.toggle("on", state.shuffle);
  $("#btnRepeat").classList.toggle("on", state.repeat > 0); $("#npRepeat").classList.toggle("on", state.repeat > 0);
  $("#btnRepeat").textContent = state.repeat === 2 ? "🔂" : "🔁"; $("#npRepeat").textContent = state.repeat === 2 ? "🔂" : "🔁";
  $("#btnSpeed").textContent = state.speed + "×";
  $("#npBg").style.backgroundImage = (!r && t && t.cover) ? `url("${t.cover}")` : "none";
  if (navigator.mediaSession) {
    if (r) navigator.mediaSession.metadata = new MediaMetadata({ title: r.name, artist: "Live Radio" });
    else if (t) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: t.cover ? [{ src: t.cover, sizes: "512x512" }] : [] });
  }
  renderQueue();
}

/* ---------- PLAYBACK ---------- */
function playTrack(id, queueIds) {
  const t = byId(id); if (!t) return;
  ensureCtx(); stopRadio(true);
  if (queueIds) state.queue = [...queueIds];
  else if (!state.queue.includes(id)) state.queue = [id, ...state.queue.filter(x => x !== id)];
  state.currentId = id;
  audio.playbackRate = state.speed;
  audio.volume = state.fade ? 0 : state.volume;
  audio.src = t.url;
  audio.play().then(() => { if (state.fade) fadeTo(audio, state.volume, 400); }).catch(() => {});
  const pc = state.playCounts[id] || { count: 0, lastPlayed: 0 };
  pc.count++; pc.lastPlayed = Date.now(); state.playCounts[id] = pc; LS.set("playCounts", state.playCounts);
  sfx.play(); buzz(12); updatePlayerUI(); loadLyricsFor(t); renderHomeList(); renderAllSongs(); renderFavorites(); renderPlaylistDetail(); renderRecentTop();
}
function togglePlay() {
  ensureCtx(); buzz(8);
  if (state.radioPlaying) { radioAudio.paused ? radioAudio.play().catch(() => {}) : radioAudio.pause(); return; }
  if (!current()) { if (state.tracks.length) playTrack(state.tracks[0].id, state.tracks.map(t => t.id)); return; }
  if (audio.paused) { audio.play().then(() => { if (state.fade) fadeTo(audio, state.volume, 300); }).catch(() => {}); }
  else { fadeTo(audio, 0, 250); setTimeout(() => { if (audio.volume < 0.05) audio.pause(); }, 260); }
}
function next(auto = false) {
  if (state.radioPlaying) { toast("📻 Radio is live — no next/prev"); return; }
  if (!state.queue.length) return;
  buzz(8);
  if (state.repeat === 2 && auto) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  let idx = state.queue.indexOf(state.currentId);
  if (state.shuffle) { let n; do { n = Math.floor(Math.random() * state.queue.length); } while (state.queue.length > 1 && n === idx); idx = n; }
  else idx = idx + 1;
  if (idx >= state.queue.length) { if (state.repeat === 1 || !auto) idx = 0; else { audio.pause(); return; } }
  playTrack(state.queue[idx]);
}
function prev() {
  if (state.radioPlaying) { toast("📻 Radio is live — no next/prev"); return; }
  buzz(8);
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let idx = state.queue.indexOf(state.currentId); idx = idx <= 0 ? state.queue.length - 1 : idx - 1;
  if (state.queue[idx]) playTrack(state.queue[idx]);
}
function toggleFav(id) {
  if (state.radioPlaying) { toast("📻 Radio can't be favorited"); return; }
  const tid = id || state.currentId; if (!tid) return;
  state.favorites.has(tid) ? state.favorites.delete(tid) : state.favorites.add(tid);
  LS.set("favorites", [...state.favorites]); sfx.select(); buzz(10); renderAll();
  const isNowFav = state.favorites.has(tid);
  if (isNowFav && !state.achievements.heart) unlock("heart", "Music Lover — first favorite");
  else toast(isNowFav ? "❤️ Added to favorites" : "Removed from favorites");
}
function setSpeed(v) {
  state.speed = v; LS.set("speed", v);
  audio.playbackRate = v; radioAudio.playbackRate = v;
  $("#speedSelect").value = String(v); updatePlayerUI();
}
function cycleSpeed() {
  if (state.radioPlaying) { toast("📻 Speed doesn't apply to live radio"); return; }
  const i = SPEEDS.indexOf(state.speed);
  setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  toast(`⏩ Speed ${state.speed}×`); sfx.nav();
}
audio.addEventListener("play", updatePlayerUI);
audio.addEventListener("pause", updatePlayerUI);
radioAudio.addEventListener("play", updatePlayerUI);
radioAudio.addEventListener("pause", updatePlayerUI);
audio.addEventListener("ended", () => { if (state.autoplay) next(true); });
audio.addEventListener("loadedmetadata", () => { const t = current(); if (t) t.duration = audio.duration; $("#timeTotal").textContent = fmt(audio.duration); $("#npTotal").textContent = fmt(audio.duration); renderHomeList(); renderAllSongs(); renderStats(); });
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  $("#progress").value = pct; $("#npProgress").value = pct;
  $("#timeCurrent").textContent = fmt(audio.currentTime); $("#npCurrent").textContent = fmt(audio.currentTime);
  highlightLyricLine();
});
radioAudio.addEventListener("timeupdate", () => { $("#timeCurrent").textContent = fmt(radioAudio.currentTime); $("#npCurrent").textContent = fmt(radioAudio.currentTime); });
audio.addEventListener("volumechange", () => { state.volume = audio.volume; LS.set("volume", audio.volume); $("#volume").value = Math.round(audio.volume * 100); });
if (navigator.mediaSession) {
  navigator.mediaSession.setActionHandler("play", togglePlay);
  navigator.mediaSession.setActionHandler("pause", togglePlay);
  navigator.mediaSession.setActionHandler("previoustrack", prev);
  navigator.mediaSession.setActionHandler("nexttrack", () => next(false));
}

/* ---------- RADIO ---------- */
function playRadio(station) {
  ensureCtx();
  audio.pause();
  state.radioPlaying = station;
  radioAudio.playbackRate = state.speed;
  radioAudio.volume = state.volume;
  radioAudio.src = station.url;
  radioAudio.play().catch(() => toast("⚠️ Stream failed — station may block playback"));
  sfx.play(); buzz(15); updatePlayerUI(); renderRadio();
  toast(`📻 Playing ${station.name}`);
}
function stopRadio(silent = false) {
  if (state.radioPlaying) { radioAudio.pause(); state.radioPlaying = null; if (!silent) renderRadio(); }
}
radioAudio.addEventListener("error", () => { if (state.radioPlaying) toast("⚠️ Radio stream error"); });

/* ---------- VISUALIZER (round / bars / wave) ---------- */
const viz = $("#vizCanvas"), vctx = viz.getContext("2d");
const miniViz = $("#miniViz"), mctx = miniViz.getContext("2d");
function drawViz() {
  requestAnimationFrame(drawViz);
  const W = viz.width, H = viz.height, cx = W / 2, cy = H / 2;
  vctx.clearRect(0, 0, W, H);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7ac74f";
  let data = null, wave = null;
  if (analyser && state.showViz && !state.radioPlaying) {
    data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(data);
    wave = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(wave);
  }
  const idle = audio.paused && !state.radioPlaying;
  // mini visualizer in player bar
  if (miniViz.offsetParent !== null) {
    const MW = miniViz.width, MH = miniViz.height, mb = 14, mbw = MW / mb;
    mctx.clearRect(0, 0, MW, MH);
    for (let i = 0; i < mb; i++) {
      const v = data ? data[Math.floor(i / mb * data.length * 0.72)] / 255 : (idle ? 0.06 : 0.1 + Math.random() * 0.08);
      const h = 3 + v * (MH - 4);
      mctx.fillStyle = accent; mctx.globalAlpha = 0.4 + v * 0.6;
      mctx.beginPath(); mctx.roundRect(i * mbw + 1, MH - h, mbw - 2, h, 2); mctx.fill();
    }
    mctx.globalAlpha = 1;
  }
  if (state.vizMode === "bars") {
    const bars = 48, bw = W / bars;
    for (let i = 0; i < bars; i++) {
      const v = data ? data[Math.floor(i / bars * data.length * 0.72)] / 255 : (idle ? 0.04 : 0.08 + Math.random() * 0.06);
      const h = 8 + v * H * 0.62;
      vctx.fillStyle = accent; vctx.globalAlpha = 0.35 + v * 0.65;
      vctx.beginPath(); vctx.roundRect(i * bw + 2, H - h, bw - 4, h, 4); vctx.fill();
    }
    vctx.globalAlpha = 1; return;
  }
  if (state.vizMode === "wave") {
    vctx.beginPath();
    const n = wave ? wave.length : 200;
    for (let i = 0; i < n; i++) {
      const v = wave ? (wave[i] - 128) / 128 : (idle ? 0 : Math.sin(i * 0.1) * 0.08);
      const x = (i / n) * W, y = cy + v * H * 0.32;
      i === 0 ? vctx.moveTo(x, y) : vctx.lineTo(x, y);
    }
    vctx.strokeStyle = accent; vctx.lineWidth = 3; vctx.globalAlpha = 0.9; vctx.stroke();
    vctx.lineTo(W, H); vctx.lineTo(0, H); vctx.closePath();
    vctx.globalAlpha = 0.12; vctx.fillStyle = accent; vctx.fill(); vctx.globalAlpha = 1; return;
  }
  // round (default)
  vctx.beginPath(); vctx.arc(cx, cy, W * 0.485, 0, Math.PI * 2);
  vctx.strokeStyle = "rgba(255,255,255,.12)"; vctx.lineWidth = 2; vctx.stroke();
  const bars = 72, R = W * 0.40;
  for (let i = 0; i < bars; i++) {
    const v = data ? data[Math.floor(i / bars * data.length * 0.72)] / 255 : (idle ? 0.04 : 0.08 + Math.random() * 0.06);
    const ang = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const len = 6 + v * W * 0.075;
    vctx.beginPath();
    vctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    vctx.lineTo(cx + Math.cos(ang) * (R + len), cy + Math.sin(ang) * (R + len));
    vctx.strokeStyle = accent; vctx.globalAlpha = 0.35 + v * 0.65; vctx.lineWidth = 4; vctx.lineCap = "round"; vctx.stroke();
  }
  vctx.globalAlpha = 1;
}
requestAnimationFrame(drawViz);
function setVizMode(m) {
  state.vizMode = m; LS.set("vizMode", m);
  $$(".np-viz-modes button").forEach(b => b.classList.toggle("active", b.dataset.viz === m));
  $("#vizModeSelect").value = m;
  $("#npCover").classList.toggle("bars-mode", m !== "round");
  $("#npCover").classList.toggle("wave-mode", m !== "round");
  sfx.nav();
}

/* ---------- EQUALIZER UI ---------- */
function buildEQ() {
  $("#eqSliders").innerHTML = EQ_FREQS.map((f, i) => `
    <div class="eq-band">
      <b id="eqVal${i}">${(state.eq.gains[i] || 0) > 0 ? "+" : ""}${state.eq.gains[i] || 0}</b>
      <input type="range" min="-12" max="12" step="1" value="${state.eq.gains[i] || 0}" data-eq-band="${i}">
      <span>${EQ_LABELS[i]}</span>
    </div>`).join("");
  $("#eqEnabled").checked = state.eq.enabled;
  $$("#eqPresets button").forEach(b => b.classList.toggle("active", b.dataset.eq === state.eq.preset));
  $("#eqStatus").textContent = state.eq.preset === "custom" ? "Custom" : state.eq.preset;
}
function setEQBand(i, v) {
  state.eq.gains[i] = v; state.eq.preset = "custom";
  const el = $("#eqVal" + i); if (el) el.textContent = (v > 0 ? "+" : "") + v;
  $$("#eqPresets button").forEach(b => b.classList.remove("active"));
  $("#eqStatus").textContent = "Custom"; applyEQ();
}

/* ---------- LYRICS ---------- */
function parseLRC(text) {
  const lines = [];
  text.split("\n").forEach(line => {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
    if (m) lines.push({ time: +m[1] * 60 + +m[2], text: m[3] });
    else if (line.trim()) lines.push({ time: -1, text: line });
  });
  return lines;
}
function renderLyrics() {
  const box = $("#lyricsBox");
  if (!state.parsedLyrics.length) { box.innerHTML = `<p class="hint">No lyrics loaded.<br>Tap “Fetch Lyrics” to search online, or “Paste / Edit” to add your own.</p>`; return; }
  box.innerHTML = state.parsedLyrics.map((l, i) => `<div class="line" data-li="${i}">${esc(l.text)}</div>`).join("");
}
function highlightLyricLine() {
  if (!state.parsedLyrics.length || $("#npTabLyrics").classList.contains("hidden")) return;
  let active = -1;
  state.parsedLyrics.forEach((l, i) => { if (l.time >= 0 && audio.currentTime >= l.time) active = i; });
  $$("#lyricsBox .line").forEach(el => el.classList.toggle("active", +el.dataset.li === active));
  const act = $("#lyricsBox .line.active");
  if (act) act.scrollIntoView({ block: "center", behavior: "smooth" });
}
async function loadLyricsFor(t) {
  state.parsedLyrics = [];
  const saved = state.lyricsStore[t.id];
  if (saved) { state.parsedLyrics = parseLRC(saved); renderLyrics(); return; }
  renderLyrics();
}
async function fetchLyrics() {
  const t = current(); if (!t) return toast("Play a track first");
  toast("🔎 Searching lyrics...");
  const artist = encodeURIComponent(t.artist), title = encodeURIComponent(t.title);
  let text = "";
  try {
    const r = await fetch(`https://lrclib.net/api/get?artist_name=${artist}&track_name=${title}`);
    if (r.ok) { const j = await r.json(); text = j.syncedLyrics || j.plainLyrics || ""; }
  } catch {}
  if (!text) {
    try {
      const r = await fetch(`https://api.lyrics.ovh/v1/${artist}/${title}`);
      if (r.ok) { const j = await r.json(); text = j.lyrics || ""; }
    } catch {}
  }
  if (text) {
    state.lyricsStore[t.id] = text; LS.set("lyrics", state.lyricsStore);
    state.parsedLyrics = parseLRC(text); renderLyrics(); toast("🎤 Lyrics loaded!"); sfx.select();
  } else { toast("No lyrics found — try Paste / Edit"); sfx.error(); }
}

/* ---------- SLEEP TIMER (with fade-out) ---------- */
function setSleep(min) {
  clearTimeout(state.sleepTimer); clearInterval(state.sleepTick);
  if (!min) { state.sleepUntil = 0; restoreVolume(); updateSleepUI(); toast("⏱ Sleep timer off"); return; }
  state.sleepUntil = Date.now() + min * 60000;
  state.sleepTimer = setTimeout(() => {
    fadeTo(audio, 0, 800); fadeTo(radioAudio, 0, 800);
    setTimeout(() => { audio.pause(); radioAudio.pause(); }, 850);
    toast("⏱ Sleep timer — music stopped"); sfx.back();
  }, min * 60000);
  state.sleepTick = setInterval(updateSleepUI, 500);
  updateSleepUI(); toast(`⏱ Music stops in ${min} min`); sfx.select();
}
function updateSleepUI() {
  const left = state.sleepUntil - Date.now();
  const txt = left > 0 ? `⏱ Stops in ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}` : "Timer off";
  $("#sleepStatus").textContent = txt; $("#sleepModalStatus").textContent = txt;
  $("#btnSleep").style.borderColor = left > 0 ? "var(--accent)" : "";
  if (left > 0 && left < 10000 && state.fade) {
    const f = left / 10000;
    audio.volume = state.volume * f; radioAudio.volume = state.volume * f;
  } else if (left > 0) restoreVolume();
  if (left <= 0 && state.sleepTick) { clearInterval(state.sleepTick); state.sleepTick = null; }
}

/* ---------- MODALS ---------- */
function openModal(id) { $("#modalBackdrop").classList.remove("hidden"); $$(".modal").forEach(m => m.classList.add("hidden")); $("#" + id).classList.remove("hidden"); }
function closeModals() { $("#modalBackdrop").classList.add("hidden"); }
function openEditTags(id, mode = "track") {
  const t = byId(id); if (!t) return;
  state.menuTrackId = id; state.editMode = mode; state.pendingCover = null;
  $("#editTitle").value = t.title; $("#editArtist").value = t.artist; $("#editAlbum").value = t.album;
  $("#editTrack").value = t.track || ""; $("#editYear").value = t.year || ""; $("#editGenre").value = t.genre || "";
  $("#editCoverPreview").innerHTML = t.cover ? `<img src="${t.cover}" alt="">` : "<span>🎵</span>";
  openModal("modalEdit");
}
function resizeImage(file, max = 512) {
  return new Promise((res) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}
function saveTags() {
  const t = byId(state.menuTrackId); if (!t) return;
  const ov = { title: $("#editTitle").value.trim() || t.title, artist: $("#editArtist").value.trim() || t.artist, album: $("#editAlbum").value.trim() || t.album, track: parseInt($("#editTrack").value) || 0, year: $("#editYear").value.trim(), genre: $("#editGenre").value.trim() };
  if (state.pendingCover !== null) ov.cover = state.pendingCover || null;
  const targets = state.editMode === "album" && albumDetail ? albumDetail.tracks : [t];
  targets.forEach(x => { Object.assign(x, ov); if (state.editMode === "album") { delete ov.track; } state.tagOverrides[x.id] = { ...state.tagOverrides[x.id], ...ov }; });
  LS.set("tagOverrides", state.tagOverrides);
  closeModals(); renderAll(); toast(state.editMode === "album" ? `💾 Album tags saved (${targets.length} tracks)!` : "💾 Tags saved!"); sfx.select();
}
/* album detail */
let albumDetail = null;
function openAlbumDetail(album, artist) {
  const tracks = state.tracks.filter(t => t.album === album && t.artist === artist).sort((a, b) => (a.track || 0) - (b.track || 0) || a.title.localeCompare(b.title));
  if (!tracks.length) return;
  albumDetail = { album, artist, tracks };
  $("#albumModalTitle").textContent = "🎮 " + album;
  $("#albumDetailArtist").textContent = artist;
  $("#albumDetailCover").innerHTML = tracks.find(t => t.cover)?.cover ? `<img src="${tracks.find(t => t.cover).cover}" alt="">` : "<span>🎮</span>";
  const years = [...new Set(tracks.map(t => t.year).filter(Boolean))];
  $("#albumDetailMeta").textContent = `${tracks.length} track${tracks.length > 1 ? "s" : ""}${years.length ? " • " + years.join(", ") : ""}`;
  $("#albumDetailTracks").innerHTML = tracks.map((t, i) => trackRowHTML(t, i)).join("");
  openModal("modalAlbum"); sfx.nav();
}
function openPlaylistModal(editId = null) {
  state.playlistEditId = editId;
  const p = editId ? state.playlists.find(x => x.id === editId) : null;
  $("#playlistName").value = p ? p.name : "";
  state.playlistSelection = new Set(p ? p.ids : []);
  $("#playlistPickList").innerHTML = state.tracks.map(t => `<div class="pick-item ${state.playlistSelection.has(t.id) ? "sel" : ""}" data-pick="${t.id}"><span>${state.playlistSelection.has(t.id) ? "☑" : "☐"}</span><span style="flex:1;min-width:0"><b>${esc(t.title)}</b> <small style="color:var(--muted)">• ${esc(t.artist)}</small></span></div>`).join("") || `<p class="hint">No tracks yet.</p>`;
  openModal("modalPlaylist");
}
function savePlaylist() {
  const name = $("#playlistName").value.trim() || "My Playlist";
  if (state.playlistEditId) {
    const p = state.playlists.find(x => x.id === state.playlistEditId);
    if (p) { p.name = name; p.ids = [...state.playlistSelection]; }
  } else {
    state.playlists.push({ id: "pl_" + Date.now(), name, ids: [...state.playlistSelection] });
  }
  LS.set("playlists", state.playlists); closeModals(); renderPlaylists(); toast("📋 Playlist saved!"); sfx.select();
}
function openPlaylistPicker(trackId) {
  state.pickerTrackId = trackId;
  $("#playlistPickerList").innerHTML = state.playlists.length
    ? state.playlists.map(p => `<button data-pickpl="${p.id}">📋 ${esc(p.name)} <small style="color:var(--muted)">(${p.ids.length} tracks)</small></button>`).join("")
    : `<p class="hint">No playlists yet — create one below.</p>`;
  openModal("modalPlaylistPicker");
}
function openMenu(id) {
  const t = byId(id); if (!t) return;
  state.menuTrackId = id;
  $("#menuTitle").textContent = t.title + " — " + t.artist;
  $("#menuFav").textContent = state.favorites.has(id) ? "💔 Remove Favorite" : "❤️ Add to Favorites";
  openModal("modalMenu");
}

/* ---------- SHARE / DOWNLOAD ---------- */
async function shareTrack(t) {
  if (!t) return;
  const text = `🎵 ${t.title} — ${t.artist} (${t.album})`;
  if (navigator.share) { try { await navigator.share({ title: t.title, text }); } catch {} }
  else { try { await navigator.clipboard.writeText(text); toast("📋 Copied to clipboard"); } catch { toast(text); } }
}
function downloadTrack(t) {
  if (!t) return;
  const a = document.createElement("a");
  a.href = t.url; a.download = t.fileName || (t.title + ".mp3");
  document.body.appendChild(a); a.click(); a.remove();
  toast("⬇ Download started");
}

/* ---------- IMPORT / EXPORT ---------- */
function exportLibrary() {
  const data = { app: "xenon", version: 3, exportedAt: new Date().toISOString(), tracks: state.tracks.map(t => ({ title: t.title, artist: t.artist, album: t.album, track: t.track, year: t.year, genre: t.genre })), favorites: [...state.favorites], playlists: state.playlists, tagOverrides: state.tagOverrides, lyrics: state.lyricsStore, playCounts: state.playCounts };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "xenon-library.json"; a.click(); toast("⬇ Library exported");
}
async function importLibrary(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.favorites) { data.favorites.forEach(id => state.favorites.add(id)); LS.set("favorites", [...state.favorites]); }
    if (data.playlists) { state.playlists = data.playlists; LS.set("playlists", state.playlists); }
    if (data.tagOverrides) { state.tagOverrides = { ...state.tagOverrides, ...data.tagOverrides }; LS.set("tagOverrides", state.tagOverrides); state.tracks.forEach(t => { const ov = state.tagOverrides[t.id]; if (ov) Object.assign(t, ov); }); }
    if (data.lyrics) { state.lyricsStore = { ...state.lyricsStore, ...data.lyrics }; LS.set("lyrics", state.lyricsStore); }
    if (data.playCounts) { state.playCounts = { ...state.playCounts, ...data.playCounts }; LS.set("playCounts", state.playCounts); }
    renderAll(); toast("✅ Library imported!"); sfx.select();
  } catch { toast("⚠️ Invalid library file"); sfx.error(); }
}
async function importM3U(file) {
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    const matched = [];
    lines.forEach(line => {
      let base = line.split("/").pop().split("\\").pop();
      try { base = decodeURIComponent(base); } catch {}
      const t = state.tracks.find(x => x.fileName === base || x.fileName?.toLowerCase() === base.toLowerCase() || x.title.toLowerCase() === base.replace(/\.[^.]+$/, "").toLowerCase());
      if (t && !matched.includes(t.id)) matched.push(t.id);
    });
    if (!matched.length) { toast("No matching tracks found in M3U — load the music first"); sfx.error(); return; }
    state.playlists.push({ id: "pl_" + Date.now(), name: "Imported M3U (" + file.name + ")", ids: matched });
    LS.set("playlists", state.playlists); renderPlaylists();
    toast(`📋 Imported ${matched.length}/${lines.length} tracks from M3U`); sfx.select();
  } catch { toast("⚠️ Could not read M3U file"); sfx.error(); }
}

/* ---------- VIEW SWITCHING ---------- */
function switchView(v) {
  state.view = v;
  $$(".blade").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach(s => s.classList.toggle("active", s.id === "view-" + v));
  $("#mainScroll").scrollTop = 0; sfx.nav();
}

/* ---------- INTRO ---------- */
let introTimers = [], introDone = false, introReturnToApp = false;
const INTRO_MSGS = ["Powering up…", "Loading dashboard…", "Tuning equalizer…", "Warming up the tubes…", "Ready!"];
function runIntro(returnToApp = false) {
  introReturnToApp = returnToApp; introDone = false;
  const boot = $("#bootOverlay"), stage = $("#introStage"), card = $("#bootCard");
  boot.classList.remove("hidden", "exiting");
  stage.classList.remove("gone");
  card.classList.add("pre");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const total = reduced ? 400 : 2600;
  const fill = $("#introFill"), status = $("#introStatus");
  fill.style.width = "0%";
  const t0 = performance.now();
  const tick = () => {
    if (introDone) return;
    const p = Math.min((performance.now() - t0) / total, 1);
    fill.style.width = Math.round(p * 100) + "%";
    status.textContent = INTRO_MSGS[Math.min(Math.floor(p * INTRO_MSGS.length), INTRO_MSGS.length - 1)];
    if (p < 1) introTimers.push(requestAnimationFrame(tick));
    else finishIntro(false);
  };
  tick();
  stage.onclick = () => finishIntro(false);
}
function finishIntro(forceHide) {
  if (introDone) return;
  introDone = true;
  introTimers.forEach(t => cancelAnimationFrame(t)); introTimers = [];
  const stage = $("#introStage"), card = $("#bootCard"), boot = $("#bootOverlay");
  stage.classList.add("gone");
  if (introReturnToApp) { boot.classList.add("hidden"); introReturnToApp = false; }
  else if (!forceHide) card.classList.remove("pre");
}
function startClock() {
  const el = $("#clock");
  const upd = () => { const d = new Date(); el.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  upd(); setInterval(upd, 15000);
}
function surpriseMe() {
  if (!state.tracks.length) { toast("Load some music first!"); return; }
  const t = state.tracks[Math.floor(Math.random() * state.tracks.length)];
  playTrack(t.id, state.tracks.map(x => x.id));
  toast(`🎲 ${t.title} — ${t.artist}`);
}
function toggleMute() {
  if (state.muted) { state.muted = false; audio.volume = state.prevVol || state.volume; radioAudio.volume = audio.volume; }
  else { state.prevVol = audio.volume; state.muted = true; audio.volume = 0; radioAudio.volume = 0; }
  $("#volume").value = Math.round(audio.volume * 100);
  toast(state.muted ? "🔇 Muted (M)" : "🔊 Unmuted");
}

/* ---------- EVENTS ---------- */
function bind() {
  // Boot
  $("#btnLoadFiles").addEventListener("click", pickMusicFolder);
  $("#btnDemo").addEventListener("click", () => { ensureCtx(); loadDemo(); enterApp(); });
  $("#folderInput").addEventListener("change", async (e) => { await addFiles(e.target.files); enterApp(); e.target.value = ""; });
  $("#fileInput").addEventListener("change", async (e) => { await addFiles(e.target.files); enterApp(); e.target.value = ""; });
  $("#btnAddFiles").addEventListener("click", pickMusicFolder);
  $("#btnCancelScan").addEventListener("click", () => { scanCancel = true; });
  // drag & drop
  ["dragenter", "dragover"].forEach(ev => window.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(ev => window.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.remove("dragging"); }));
  window.addEventListener("drop", async (e) => { if (e.dataTransfer?.files?.length) { await addFiles(e.dataTransfer.files); enterApp(); } });

  // Themes
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-set-theme]"); if (b) setTheme(b.dataset.setTheme); });

  // Nav
  $$(".blade").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("#guideBtn").addEventListener("click", () => { switchView("home"); toast("🎮 Guide: use the blades to navigate"); sfx.nav(); });
  $("#btnHelp").addEventListener("click", () => openModal("modalHelp"));

  // Search & sort
  $("#searchInput").addEventListener("input", (e) => { state.search = e.target.value.trim(); $("#clearSearch").classList.toggle("hidden", !state.search); renderHomeList(); renderAllSongs(); renderFavorites(); });
  $("#clearSearch").addEventListener("click", () => { $("#searchInput").value = ""; state.search = ""; $("#clearSearch").classList.add("hidden"); renderAll(); });
  $("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderHomeList(); renderAllSongs(); });

  // Carousel scroll buttons + dots
  $("#scrollLeft").addEventListener("click", () => { $("#albumCarousel").scrollBy({ left: -460, behavior: "smooth" }); sfx.nav(); });
  $("#scrollRight").addEventListener("click", () => { $("#albumCarousel").scrollBy({ left: 460, behavior: "smooth" }); sfx.nav(); });
  $("#albumCarousel").addEventListener("scroll", () => {
    const c = $("#albumCarousel"), idx = Math.round(c.scrollLeft / 228);
    $$("#albumDots span").forEach((d, i) => d.classList.toggle("on", i === idx));
  });

  // Delegated clicks
  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]"); if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    const menu = e.target.closest("[data-menu]"); if (menu) { e.stopPropagation(); openMenu(menu.dataset.menu); return; }
    const qdel = e.target.closest("[data-qdel]"); if (qdel) { e.stopPropagation(); state.queue = state.queue.filter(x => x !== qdel.dataset.qdel); renderQueue(); toast("Removed from queue"); return; }
    const rdel = e.target.closest("[data-radiodel]"); if (rdel) { e.stopPropagation(); const custom = LS.get("radioStations", []).filter(s => s.id !== rdel.dataset.radiodel); LS.set("radioStations", custom); renderRadio(); toast("Station removed"); return; }
    const radio = e.target.closest("[data-radio]");
    if (radio) { playRadio({ name: radio.dataset.rname, url: radio.dataset.radio }); return; }
    const album = e.target.closest("[data-album-idx]");
    if (album) { const a = state._albumsCache[+album.dataset.albumIdx]; if (a) openAlbumDetail(a.album, a.artist); return; }
    const artist = e.target.closest("[data-artist-idx]");
    if (artist) {
      const a = state._artistsCache[+artist.dataset.artistIdx];
      if (a) { const tracks = [...a.tracks].sort((x, y) => x.album.localeCompare(y.album) || (x.track || 0) - (y.track || 0)); playTrack(tracks[0].id, tracks.map(t => t.id)); toast(`🎤 Playing ${a.artist}`); }
      return;
    }
    const pl = e.target.closest("[data-pl]");
    if (pl) { state.activePlaylistId = pl.dataset.pl; renderPlaylistDetail(); $("#playlistDetail").scrollIntoView({ behavior: "smooth" }); sfx.nav(); return; }
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      const id = pick.dataset.pick;
      state.playlistSelection.has(id) ? state.playlistSelection.delete(id) : state.playlistSelection.add(id);
      pick.classList.toggle("sel"); pick.querySelector("span").textContent = state.playlistSelection.has(id) ? "☑" : "☐"; sfx.nav(); return;
    }
    const pickpl = e.target.closest("[data-pickpl]");
    if (pickpl) {
      const p = state.playlists.find(x => x.id === pickpl.dataset.pickpl);
      if (p && !p.ids.includes(state.pickerTrackId)) p.ids.push(state.pickerTrackId);
      LS.set("playlists", state.playlists); closeModals(); renderPlaylists(); toast(`📋 Added to “${p?.name}”`); sfx.select(); return;
    }
    const row = e.target.closest("[data-play]");
    if (row) {
      const id = row.dataset.play;
      if (id === state.currentId && !state.radioPlaying) togglePlay();
      else {
        const container = row.closest(".track-list, .queue-list");
        let ids = state.tracks.map(t => t.id);
        if (container) ids = [...container.querySelectorAll("[data-play]")].map(el => el.dataset.play);
        playTrack(id, ids);
      }
      return;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) return;
    if (!introDone && !$("#bootOverlay").classList.contains("hidden")) { finishIntro(false); return; }
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.key === "ArrowRight") next(false);
    if (e.key === "ArrowLeft") prev();
    if (e.key.toLowerCase() === "m") toggleMute();
    if (e.key === "Escape") { closeModals(); $("#nowPlaying").classList.add("hidden"); }
  });

  // Player controls
  $("#btnPlay").addEventListener("click", togglePlay); $("#npPlay").addEventListener("click", togglePlay);
  $("#btnNext").addEventListener("click", () => next(false)); $("#npNext").addEventListener("click", () => next(false));
  $("#btnPrev").addEventListener("click", prev); $("#npPrev").addEventListener("click", prev);
  $("#btnShuffle").addEventListener("click", () => { state.shuffle = !state.shuffle; LS.set("shuffle", state.shuffle); updatePlayerUI(); toast(state.shuffle ? "🔀 Shuffle on" : "Shuffle off"); sfx.nav(); });
  $("#npShuffle").addEventListener("click", () => $("#btnShuffle").click());
  $("#btnRepeat").addEventListener("click", () => { state.repeat = (state.repeat + 1) % 3; LS.set("repeat", state.repeat); updatePlayerUI(); toast(["🔁 Repeat off", "🔁 Repeat all", "🔂 Repeat one"][state.repeat]); sfx.nav(); });
  $("#npRepeat").addEventListener("click", () => $("#btnRepeat").click());
  $("#btnSpeed").addEventListener("click", cycleSpeed);
  $("#btnFavPlayer").addEventListener("click", () => toggleFav());
  $("#npFav").addEventListener("click", () => toggleFav());
  $("#progress").addEventListener("input", (e) => { if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration; });
  $("#npProgress").addEventListener("input", (e) => { if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration; });
  $("#volume").addEventListener("input", (e) => { ensureCtx(); const v = e.target.value / 100; audio.volume = v; radioAudio.volume = v; });

  // Now playing
  $("#btnNowPlaying").addEventListener("click", () => { $("#nowPlaying").classList.remove("hidden"); sfx.select(); });
  $("#btnCloseNP").addEventListener("click", () => { $("#nowPlaying").classList.add("hidden"); sfx.back(); });
  $$(".np-tab").forEach(t => t.addEventListener("click", () => {
    $$(".np-tab").forEach(x => x.classList.toggle("active", x === t));
    $("#npTabLyrics").classList.toggle("hidden", t.dataset.npTab !== "lyrics");
    $("#npTabEQ").classList.toggle("hidden", t.dataset.npTab !== "eq");
    $("#npTabQueue").classList.toggle("hidden", t.dataset.npTab !== "queue");
    sfx.nav();
  }));
  $("#btnLyrics").addEventListener("click", () => { $("#nowPlaying").classList.remove("hidden"); $$(".np-tab")[0].click(); });
  $("#npLyricsBtn").addEventListener("click", () => $$(".np-tab")[0].click());
  $("#btnEQ").addEventListener("click", () => { $("#nowPlaying").classList.remove("hidden"); $$(".np-tab")[1].click(); });
  $("#npEQBtn").addEventListener("click", () => $$(".np-tab")[1].click());
  $("#btnQueue").addEventListener("click", () => { $("#nowPlaying").classList.remove("hidden"); $$(".np-tab")[2].click(); });
  $("#btnSleep").addEventListener("click", () => openModal("modalSleep"));
  $("#npEdit").addEventListener("click", () => { if (state.currentId) openEditTags(state.currentId); });
  $("#npShare").addEventListener("click", () => shareTrack(current()));
  $("#npDownload").addEventListener("click", () => downloadTrack(current()));
  $$(".np-viz-modes button").forEach(b => b.addEventListener("click", () => setVizMode(b.dataset.viz)));

  // EQ events
  $("#eqSliders").addEventListener("input", (e) => { const b = e.target.closest("[data-eq-band]"); if (b) setEQBand(+b.dataset.eqBand, +b.value); });
  $("#eqPresets").addEventListener("click", (e) => { const b = e.target.closest("[data-eq]"); if (!b) return; state.eq.preset = b.dataset.eq; state.eq.gains = [...EQ_PRESETS[b.dataset.eq]]; buildEQ(); applyEQ(); sfx.select(); });
  $("#eqEnabled").addEventListener("change", (e) => { state.eq.enabled = e.target.checked; applyEQ(); });
  $("#btnResetEQ").addEventListener("click", () => { state.eq = { enabled: true, preset: "flat", gains: [...EQ_PRESETS.flat] }; buildEQ(); applyEQ(); toast("🎚️ EQ reset"); });

  // Lyrics events
  $("#btnFetchLyrics").addEventListener("click", fetchLyrics);
  $("#btnEditLyrics").addEventListener("click", () => {
    const t = current(); if (!t) return;
    $("#lyricsEdit").value = state.lyricsStore[t.id] || "";
    $("#lyricsEdit").classList.toggle("hidden"); $("#btnSaveLyrics").classList.toggle("hidden");
  });
  $("#btnSaveLyrics").addEventListener("click", () => {
    const t = current(); if (!t) return;
    const v = $("#lyricsEdit").value.trim();
    if (v) { state.lyricsStore[t.id] = v; } else { delete state.lyricsStore[t.id]; }
    LS.set("lyrics", state.lyricsStore); state.parsedLyrics = parseLRC(v); renderLyrics();
    $("#lyricsEdit").classList.add("hidden"); $("#btnSaveLyrics").classList.add("hidden");
    toast("🎤 Lyrics saved!"); sfx.select();
  });

  // Sleep
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-sleep]"); if (b) { setSleep(+b.dataset.sleep); if (!$("#modalSleep").classList.contains("hidden")) closeModals(); } });

  // Playlists
  $("#btnNewPlaylist").addEventListener("click", () => openPlaylistModal());
  $("#btnSavePlaylist").addEventListener("click", savePlaylist);
  $("#btnBackPlaylists").addEventListener("click", () => { state.activePlaylistId = null; $("#playlistDetail").classList.add("hidden"); sfx.back(); });
  $("#btnPlayPlaylist").addEventListener("click", () => { const p = state.playlists.find(x => x.id === state.activePlaylistId); if (p?.ids.length) playTrack(p.ids[0], p.ids); });
  $("#btnShufflePlaylist").addEventListener("click", () => { const p = state.playlists.find(x => x.id === state.activePlaylistId); if (p?.ids.length) { state.shuffle = true; playTrack(p.ids[Math.floor(Math.random() * p.ids.length)], p.ids); updatePlayerUI(); } });
  $("#btnRenamePlaylist").addEventListener("click", () => openPlaylistModal(state.activePlaylistId));
  $("#btnDeletePlaylist").addEventListener("click", () => { state.playlists = state.playlists.filter(x => x.id !== state.activePlaylistId); LS.set("playlists", state.playlists); state.activePlaylistId = null; $("#playlistDetail").classList.add("hidden"); renderPlaylists(); toast("🗑 Playlist deleted"); });
  $("#btnImportM3U").addEventListener("click", () => $("#m3uInput").click());
  $("#m3uInput").addEventListener("change", (e) => { if (e.target.files[0]) importM3U(e.target.files[0]); e.target.value = ""; });

  // Bulk play
  $("#btnPlayAll").addEventListener("click", () => { const l = filteredTracks(state.tracks); if (l.length) playTrack(l[0].id, l.map(t => t.id)); });
  $("#btnShuffleAll").addEventListener("click", () => { const l = filteredTracks(state.tracks); if (l.length) { state.shuffle = true; playTrack(l[Math.floor(Math.random() * l.length)].id, l.map(t => t.id)); updatePlayerUI(); } });
  $("#btnShuffleAll2").addEventListener("click", () => $("#btnShuffleAll").click());
  $("#btnPlayFavs").addEventListener("click", () => { const l = state.tracks.filter(t => state.favorites.has(t.id)); if (l.length) playTrack(l[0].id, l.map(t => t.id)); else toast("No favorites yet"); });

  // Album modal
  $("#btnPlayAlbum").addEventListener("click", () => { if (albumDetail?.tracks.length) { closeModals(); playTrack(albumDetail.tracks[0].id, albumDetail.tracks.map(t => t.id)); } });
  $("#btnShuffleAlbum").addEventListener("click", () => { if (albumDetail?.tracks.length) { closeModals(); state.shuffle = true; playTrack(albumDetail.tracks[Math.floor(Math.random() * albumDetail.tracks.length)].id, albumDetail.tracks.map(t => t.id)); updatePlayerUI(); } });
  $("#btnEditAlbum").addEventListener("click", () => { if (albumDetail?.tracks.length) openEditTags(albumDetail.tracks[0].id, "album"); });

  // Modals
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeModals(); });
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  $("#btnSaveTags").addEventListener("click", saveTags);
  $("#btnUploadCover").addEventListener("click", () => $("#coverInput").click());
  $("#coverInput").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const data = await resizeImage(f);
    if (data) { state.pendingCover = data; $("#editCoverPreview").innerHTML = `<img src="${data}" alt="">`; toast("🖼 Cover updated — Save Tags to apply"); }
    e.target.value = "";
  });
  $("#btnRemoveCover").addEventListener("click", () => { state.pendingCover = ""; $("#editCoverPreview").innerHTML = "<span>🎵</span>"; toast("Cover will be removed on save"); });

  // Track menu actions
  $("#menuPlay").addEventListener("click", () => { closeModals(); playTrack(state.menuTrackId); });
  $("#menuPlayNext").addEventListener("click", () => {
    closeModals();
    const idx = state.queue.indexOf(state.currentId);
    if (idx >= 0) state.queue.splice(idx + 1, 0, state.menuTrackId); else state.queue.unshift(state.menuTrackId);
    renderQueue(); toast("⏭ Will play next");
  });
  $("#menuAddQueue").addEventListener("click", () => { closeModals(); if (!state.queue.includes(state.menuTrackId)) state.queue.push(state.menuTrackId); renderQueue(); toast("➕ Added to queue"); });
  $("#menuFav").addEventListener("click", () => { closeModals(); toggleFav(state.menuTrackId); });
  $("#menuEdit").addEventListener("click", () => openEditTags(state.menuTrackId));
  $("#menuLyrics").addEventListener("click", () => { closeModals(); playTrack(state.menuTrackId); $("#nowPlaying").classList.remove("hidden"); $$(".np-tab")[0].click(); });
  $("#menuShare").addEventListener("click", () => { closeModals(); shareTrack(byId(state.menuTrackId)); });
  $("#menuAddPlaylist").addEventListener("click", () => { closeModals(); openPlaylistPicker(state.menuTrackId); });
  $("#btnPickerNew").addEventListener("click", () => { closeModals(); openPlaylistModal(); state.playlistSelection.add(state.pickerTrackId); $$("#playlistPickList .pick-item").forEach(el => { if (el.dataset.pick === state.pickerTrackId) { el.classList.add("sel"); el.querySelector("span").textContent = "☑"; } }); });
  $("#menuRemove").addEventListener("click", () => {
    const id = state.menuTrackId;
    state.tracks = state.tracks.filter(t => t.id !== id);
    state.queue = state.queue.filter(x => x !== id);
    state.playlists.forEach(p => p.ids = p.ids.filter(x => x !== id));
    LS.set("playlists", state.playlists);
    if (state.currentId === id) { audio.pause(); state.currentId = null; }
    closeModals(); renderAll(); toast("🗑 Removed from library");
  });
  $("#btnClearQueue").addEventListener("click", () => { state.queue = state.currentId ? [state.currentId] : []; renderQueue(); toast("🗑 Queue cleared"); });

  // Radio
  $("#btnAddRadio").addEventListener("click", () => {
    const url = $("#radioUrl").value.trim(), name = $("#radioName").value.trim() || "Custom Station";
    if (!/^https?:\/\//i.test(url)) { toast("⚠️ Paste a valid http(s) stream URL"); sfx.error(); return; }
    const custom = LS.get("radioStations", []);
    custom.push({ id: "rs_" + Date.now(), name, genre: "Custom stream", url });
    LS.set("radioStations", custom);
    $("#radioUrl").value = ""; $("#radioName").value = "";
    renderRadio(); playRadio({ name, url });
  });

  // Settings
  $("#toggleSounds").addEventListener("change", (e) => { state.sounds = e.target.checked; LS.set("sounds", state.sounds); $("#btnSound").textContent = state.sounds ? "🔊" : "🔇"; if (state.sounds) sfx.select(); });
  $("#toggleAutoplay").addEventListener("change", (e) => { state.autoplay = e.target.checked; LS.set("autoplay", state.autoplay); });
  $("#toggleVisualizer").addEventListener("change", (e) => { state.showViz = e.target.checked; LS.set("showViz", state.showViz); });
  $("#toggleFade").addEventListener("change", (e) => { state.fade = e.target.checked; LS.set("fade", state.fade); if (!state.fade) restoreVolume(); });
  $("#toggleHaptics").addEventListener("change", (e) => { state.haptics = e.target.checked; LS.set("haptics", state.haptics); buzz(20); });
  $("#speedSelect").addEventListener("change", (e) => setSpeed(+e.target.value));
  $("#vizModeSelect").addEventListener("change", (e) => setVizMode(e.target.value));
  $("#btnSound").addEventListener("click", () => { state.sounds = !state.sounds; LS.set("sounds", state.sounds); $("#toggleSounds").checked = state.sounds; $("#btnSound").textContent = state.sounds ? "🔊" : "🔇"; if (state.sounds) sfx.select(); });
  $("#btnRescan").addEventListener("click", async () => {
    try {
      const handle = await idb.get("musicDir");
      if (handle) {
        const perm = await handle.requestPermission({ mode: "read" });
        if (perm === "granted") { const files = await scanDirHandle(handle); await addFiles(files); updateFolderStatus(handle.name); return; }
      }
    } catch {}
    pickMusicFolder();
  });
  $("#btnExport").addEventListener("click", exportLibrary);
  $("#btnImport").addEventListener("click", () => $("#importInput").click());
  $("#importInput").addEventListener("change", (e) => { if (e.target.files[0]) importLibrary(e.target.files[0]); e.target.value = ""; });
  $("#btnClearData").addEventListener("click", () => { if (confirm("Clear favorites, playlists, tags, lyrics & play history saved in this browser?")) { ["favorites", "playlists", "tagOverrides", "lyrics", "playCounts", "radioStations"].forEach(k => localStorage.removeItem("xbm_" + k)); toast("🗑 Saved data cleared"); location.reload(); } });

  // PWA install
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("#btnInstall").classList.remove("hidden"); });
  $("#btnInstall").addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("#btnInstall").classList.add("hidden"); });
  window.addEventListener("appinstalled", () => { $("#btnInstall").classList.add("hidden"); toast("🎉 App installed!"); });
}

/* ---------- INIT ---------- */
(function init() {
  document.documentElement.dataset.theme = state.theme;
  $$("[data-set-theme]").forEach(b => b.classList.toggle("active", b.dataset.setTheme === state.theme));
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = THEME_COLORS[state.theme] || "#107C10";
  $("#toggleSounds").checked = state.sounds; $("#btnSound").textContent = state.sounds ? "🔊" : "🔇";
  $("#toggleAutoplay").checked = state.autoplay; $("#toggleVisualizer").checked = state.showViz;
  $("#toggleFade").checked = state.fade; $("#toggleHaptics").checked = state.haptics;
  $("#speedSelect").value = String(state.speed);
  audio.volume = state.volume; radioAudio.volume = state.volume; $("#volume").value = Math.round(state.volume * 100);
  buildEQ(); bind(); setVizMode(state.vizMode); renderAll(); startClock(); runIntro(false);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  tryAutoScan();
})();
