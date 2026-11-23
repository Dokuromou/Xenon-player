# 🟢 XENON — Dashboard Player (v3.0)

> Named after **Xenon**, the codename of the Xbox 360 — a retro **Xbox 360–style local music player** that runs entirely in the browser. No uploads, no servers — your MP3s stay on your phone/PC.

![Themes](https://img.shields.io/badge/themes-Toxic%20%7C%20Neon%20%7C%20Danger%20%7C%20Void-green) ![PWA](https://img.shields.io/badge/PWA-installable-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- 🎬 **Animated boot intro** — orbit-ring logo draw-in, staggered XENON letter reveal, loading bar, then a smooth zoom-blur transition into the dashboard (tap to skip, replay anytime in Settings)
- 🎮 **Xbox 360 dashboard UI** — blades navigation, glowing guide button (now a quick-actions menu), game-case album carousel (scroll sideways like a game selection), live dashboard clock
- 🎨 **4 dark themes** — **Toxic** (Original Xbox green), **Neon** (electric blue), **Danger** (hot red), **Void** (deep purple)
- 🔊 **Retro UI sounds** you can turn on/off + 📳 haptic feedback on phones
- 🎚️ **10-band equalizer** with presets (Flat, Bass, Treble, Vocal, Rock, Pop, Jazz, Electro) + custom
- ⭕ **3 visualizers** — Round (default), Bars, Wave — plus a **mini visualizer** in the player bar
- 🎤 **Lyrics** — auto-fetch (Lrclib / Lyrics.ovh), synced LRC highlighting, or paste your own
- ❤️ **Favorites**, 📋 **Playlists** (create / rename / delete / add, import `.M3U`), 🔀 shuffle, 🔁 repeat (off/all/one)
- ✏️ **Edit tags** — title, artist, album, track #, year, genre **+ cover art** (upload/remove), batch-edit whole albums
- ⏱ **Sleep timer** with fade-out (5–60 min), ⏩ playback speed (0.5×–2×), fade in/out, `M` to mute
- 🕐 **Recently Played** & 🔥 **Most Played** sections + play-count tracking
- 🎤 **Artists** view, 🎮 **album detail** view (tap any game case), 🎲 **Surprise Me** random track
- 🏆 **Achievements** — unlock trophies for milestones (Collector, DJ, Night Owl, On Air…)
- 📻 **Radio** — 8 built-in live stations + add your own stream URLs
- 📂 **Folder auto-scan** (Chrome File System Access API) — grant once, rescan automatically on every open
- 📱 **Installable PWA** — works offline, add to home screen like a real app
- 🔍 search, sorting (incl. Most Played), queue management (play next / add / remove / clear), lock-screen controls
- 💾 **Offline-ready** — favorites/playlists/tags persist in `localStorage`; export/import library as JSON

## 🚀 Run it on GitHub Pages (free hosting)

1. Create a new GitHub repo (e.g. `xenon-player`)
2. Upload everything to the repo root:
   - `index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `404.html`, `README.md`
   - `icons/` folder (4 PNGs)
3. Go to **Settings → Pages → Source: Deploy from branch → `main` / `(root)` → Save**
4. Open `https://<your-username>.github.io/xenon-player/` on your phone → tap **Install App** 🎉

> No build step needed — plain HTML/CSS/JS. Works on any static host (Netlify, Vercel, etc.) too. For PWA install + folder auto-scan, serve over **HTTPS** (GitHub Pages is HTTPS by default).

## 📱 How to load your music

| Device | Steps |
|---|---|
| **Android (Chrome)** | Tap **Load My Music → Choose Folder** → pick `Music` or `Download` → Allow. Loads hundreds of songs at once + auto-scans on every open. |
| **iPhone (Safari)** | Tap **Load My Music → Choose Files** → Files app → select MP3s (iOS doesn't allow folder picking). Repeat in batches. |
| **PC** | Drag & drop MP3s anywhere, or use the file/folder picker. |

Cover art + ID3 tags are read automatically. Use **⋯ → Edit Tags** to fix track # / artist / album / cover.

> **Why the permission prompt?** Browsers can't scan your storage silently — you must tap *Allow / Select* once so the page can read your files. Nothing is uploaded anywhere.

## ⌨️ Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `→` / `←` | Next / Previous |
| `M` | Mute / Unmute |
| `Esc` | Close dialogs / Now Playing |

## 🛠️ Tech

- Vanilla JS + Web Audio API (EQ via `BiquadFilter`, visualizer via `AnalyserNode`)
- File System Access API (`showDirectoryPicker`) + IndexedDB for folder persistence
- `jsmediatags` (CDN) for ID3 parsing & cover art
- Lyrics via [Lrclib](https://lrclib.net) & [Lyrics.ovh](https://lyrics.ovh)
- Radio presets: [SomaFM](https://somafm.com), [Radio Swiss](https://www.radioswisspop.ch), [Nightride FM](https://nightride.fm)
- Demo tracks: [SoundHelix](https://www.soundhelix.com/examples/js/soundhelix-song-1.mp3) samples

## 📄 License

MIT — do whatever you want, just keep the vibe. 🎮
