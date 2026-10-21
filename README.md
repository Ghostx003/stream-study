# Courseflix LAN — Local Network Lecture Streaming Application

A high-performance, local-network video streaming application built with **React, Vite, Node.js, Express, and Modern CSS**. 

Courseflix LAN turns your primary computer into a private, Wi-Fi media server for your study lectures. You configure your lecture directory once on your host computer; then stream and watch your lectures from any phone, tablet, or laptop on the same Wi-Fi network without copying any video files.

---

## 1. Quick Start

### Option A: The One-Click Windows Batch File (Recommended)
Simply double-click:
```
Start-Courseflix-LAN.bat
```
This batch file will:
1. Verify Node.js and dependencies.
2. Build the client if needed.
3. Check candidate ports (`5174`, `5173`, `5175`, `5176`).
4. Display available port choices and let you press **Enter** for default (`5174`) or pick a custom port.
5. Display your **Local URL** (`http://localhost:5174`) and **LAN URL** (e.g. `http://192.168.1.100:5174`).
6. Keep running in the Command Prompt window even if you close your web browser.

### Option B: Manual Command Line
```bash
# Start backend server directly
cd server
npm start

# Or with a custom port:
node src/index.js --port=5174
```

---

## 2. Accessing from Any Device on Your Wi-Fi

1. **Host Computer**:
   - Open your browser to `http://localhost:5174`.
   - On first launch, click **"Browse Folder on this Computer"** to choose your lecture directory using the native Windows folder dialog, or paste the folder path (e.g. `D:\Lectures`).
2. **Phone, Tablet, or Another Laptop**:
   - Ensure the device is connected to the same Wi-Fi network.
   - Look at the top bar on the host computer or the startup terminal for the **LAN URL** badge (e.g., `http://192.168.29.189:5174`).
   - Open that URL in Chrome, Safari, or Edge on your mobile device.
   - Browse your subjects, nested folders, and start streaming!

---

## 3. Integrated Courseflix Player Features

The lecture player faithfully adapts and integrates the authentic **Courseflix** video player from the repository:

- **Playback Controls**: Play, pause, seek forward/backward with instant visual response.
- **Dynamic Time Display**: Toggle duration format by clicking on the time display (switch between standard time remaining `-MM:SS` and real-time playback remaining `-(duration - currentTime) / playbackRate`).
- **Estimated End Time**: Shows the calculated real-world clock time when the lecture will finish (e.g., `"Ends at 4:35 PM"`).
- **Speed Controls**:
  - One-click preset cycling: `1x`, `1.25x`, `1.5x`, `1.6x`, `1.75x`, `1.85x`, `2x`, `2.25x`, `2.5x`, `3x`.
  - Custom speed popover with direct numeric input from `0.1x` to `5.0x`.
  - Keyboard shortcuts `C` (+0.1x) and `X` (-0.1x).
- **Double-Tap / Double-Click Gestures**:
  - Left half of video: seeks backward 10s with pulsing backward animation overlay.
  - Right half of video: seeks forward 10s with pulsing forward animation overlay.
  - Mouse wheel over video wrapper seeks 10s forward/backward.
- **Bookmarks**:
  - Flag markers displayed directly on the timeline scrub bar.
  - Hovering a bookmark dot reveals a delete trash icon; clicking jumps immediately to that timestamp.
  - Lecture Bookmarks Popover listing all timestamps with one-click jump links and delete buttons.
  - Press `Z` to add a bookmark at the current playback position.
  - Press `Ctrl + Z` to cycle sequentially through bookmarks.
  - Press `Ctrl + P` or `Ctrl + T` to jump back to your saved timeline position.
- **Intro Skip**:
  - Floating `Skip Intro` button appears during the first 25 seconds if video duration > 25s.
- **Brown Noise Background Audio**:
  - Integrates authentic `brown.dat` brown noise for focused studying.
  - Toggle with `B` key or audio wave button in controls.
  - Adjust brown noise volume with `PageUp` and `PageDown`.
  - Automatically pauses and resumes with lecture video.
- **Playlist Context & Navigation**:
  - Previous (`P`) and Next (`N`) lecture navigation.
  - Collapsible side menu with folder stats and completion progress bar.
  - Completion checkbox next to each lecture for instant marking.
- **Keyboard Shortcuts Dialog**:
  - Press `/` to toggle the full keyboard shortcuts overlay.
  - `Space`: Play/Pause
  - `ArrowLeft` / `ArrowRight`: Seek 10s
  - `Ctrl + ArrowLeft` / `Ctrl + ArrowRight`: Seek 30s
  - `ArrowUp` / `ArrowDown`: Volume +/- 2%
  - `M`: Mute / Unmute
  - `F`: Fullscreen

---

## 4. Architecture & Technical Details

```
STREAM STUDY/
  ├── client/                     # Vite + React single-page application
  │   ├── src/
  │   │   ├── components/
  │   │   │   ├── Player/         # Integrated Courseflix player & shortcuts modal
  │   │   │   ├── Navbar.jsx      # Top bar with LAN badge & folder switcher
  │   │   │   ├── CourseCard.jsx  # Subject card with dynamic durations
  │   │   │   ├── CourseGrid.jsx  # Responsive grid
  │   │   │   ├── LectureList.jsx # Natural-sorted lecture table with checkboxes
  │   │   │   ├── Breadcrumbs.jsx # Nested folder navigation
  │   │   │   └── SetupView.jsx   # Initial folder registration & picker
  │   │   ├── index.css           # Modern CSS theme & responsive queries
  │   │   └── player.css          # Courseflix player UI & gesture overlays
  │   └── dist/                   # Built production bundle
  ├── server/                     # Node.js + Express.js backend
  │   ├── src/
  │   │   ├── streamer.js         # HTTP byte-range video streaming (206 Partial Content)
  │   │   ├── scanner.js          # Filesystem scanner with natural sorting
  │   │   ├── metadata.js         # Duration probe (ffprobe + music-metadata cache)
  │   │   ├── configManager.js    # Local JSON atomic persistence (roots, progress, bookmarks)
  │   │   ├── network.js          # LAN IPv4 detection and port scanner
  │   │   └── index.js            # Express API & static dist server
  │   ├── data/                   # Persistent config.json and metadata cache
  │   └── test/                   # Automated backend & E2E tests
  ├── scripts/
  │   ├── start-interactive.js    # Interactive port selector
  │   └── check-ports.js          # Port availability diagnostic
  ├── Start-Courseflix-LAN.bat    # Windows batch startup launcher
  └── Temporary/COURCEFLIX-LIVE/  # Cloned original Courseflix repository
```

### Video Streaming Engine (`streamer.js`)
- Supports HTTP byte-range requests (`Range: bytes=start-end`).
- Returns HTTP status `206 Partial Content` with `Content-Range`, `Accept-Ranges: bytes`, and exact `Content-Length`.
- Streams using Node.js `fs.createReadStream` with backpressure and cleanup on client disconnection (`req.on('close', ...)`).
- Supports video formats: `.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, `.m4v`, `.ts`.
- Memory efficient: video files are streamed in chunks and never read entirely into memory.

### Security Boundary
- Strict path traversal protection (`resolveSecurePath`).
- Normalizes and checks that every requested media file path strictly resides within registered media roots.
- Directory traversal attempts (`../`, `..\\`, encoded characters) are rejected with HTTP 403.

### Dynamic Duration Calculations
- For every folder and subject:
  - **Total Duration**: $\sum \text{duration of all lectures}$
  - **Completed Duration**: $\sum \text{duration of completed lectures}$
  - **Remaining Duration**: $\max(0, \text{Total Duration} - \text{Completed Duration})$
  - **Percentage Completed**: $(\text{Completed Count} / \text{Total Count}) \times 100$
- Toggling any lecture completion checkbox immediately recalculates all stats across the UI and persists to `server/data/config.json`.

---

## 5. Automated Tests & Verification

Run the test suite at any time:
```bash
cd server
npm test
```

### Test Coverage (30 Tests Passing)
- **HTTP Byte-Range Streaming**: Verified `HEAD` 200, `GET` 206 Partial Content, exact chunk byte lengths, `Accept-Ranges`, and 416 on invalid ranges.
- **Path Traversal Security**: Verified rejection of `../`, nested directory escapes, and root boundaries.
- **Natural Alphanumeric Sorting**: Verified `Lecture 1`, `Lecture 2`, `Lecture 10` sort naturally.
- **Dynamic Duration Math**: Verified scenario with 10 lectures totaling 8 hours where checking off a 45-minute lecture decreases remaining duration by exactly 45 minutes.
- **Bookmarks Persistence**: Verified bookmark creation, duplicate prevention, sorting, and removal.
- **E2E Integration**: Verified folder registration, recursive navigation, breadcrumbs, completion toggle, and unavailable directory error handling.

---

## 6. Troubleshooting Guide

### 1. Other devices on Wi-Fi cannot connect to the LAN URL
- **Windows Firewall**: Windows may block incoming connections on private networks.
  - Open **Windows Security** → **Firewall & network protection**.
  - Click **"Allow an app through firewall"**.
  - Ensure **Node.js: Server-side JavaScript** is checked for **Private networks**.
- **Wi-Fi Network Profile**: Ensure your Wi-Fi network profile on the host computer is set to **Private Network** (not Public).

### 2. IP Address Changes (DHCP)
- If your router reboots or assigns your computer a new local IP address, the application automatically detects the new IPv4 address upon launch and displays it in the terminal and app header.

### 3. Port Occupied
- The startup batch script checks candidate ports (`5174`, `5173`, `5175`, `5176`) and notifies you if a port is in use, letting you select an available port or picking the next free port automatically.

### 4. Video Codecs & Browser Support
- Modern browsers (Chrome, Edge, Safari, Firefox) natively play H.264 (AVC) and VP9 video in MP4/WebM containers.
- If an MKV or AVI file uses an unusual video codec that the browser cannot decode natively, the application displays a clear notification. For best cross-device playback on mobile devices, H.264 MP4 is recommended.
