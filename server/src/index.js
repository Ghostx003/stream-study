import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

import { getLanAddresses, checkCandidatePorts, getTailscaleIp } from './network.js';
import { configManager } from './configManager.js';
import { scanFolder, resolveSecurePath, generateLectureKey } from './scanner.js';
import { streamVideoFile, serveSubtitleFile, streamRemuxFile, serveEmbeddedSubtitle, serveAudioTrack, prewarmAudioTrack } from './streamer.js';
import { metadataService } from './metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Determine port from CLI arguments or config
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const CLI_PORT = portArg ? parseInt(portArg.split('=')[1], 10) : null;
const PORT = CLI_PORT || process.env.PORT || configManager.getSettings().preferredPort || 5174;
const HOST = '0.0.0.0';

// ==========================================
// API ROUTES
// ==========================================

// 1. Network info
app.get('/api/network', (req, res) => {
  const lan = getLanAddresses();
  const tailscaleIp = getTailscaleIp();
  const currentPort = req.socket.localPort || PORT;
  res.json({
    primaryLanIp: lan.primary,
    allLanIps: lan.all,
    tailscaleIp: tailscaleIp,
    tailscaleUrl: tailscaleIp ? `http://${tailscaleIp}:${currentPort}` : null,
    port: currentPort,
    localUrl: `http://localhost:${currentPort}`,
    lanUrl: `http://${lan.primary}:${currentPort}`
  });
});

// Candidate ports check
app.get('/api/network/candidate-ports', async (req, res) => {
  const ports = await checkCandidatePorts([5173, 5174, 5175, 5176]);
  res.json({ ports });
});

// 2. Folder browser dialog & Host Directory Explorer
app.get('/api/system/drives', (req, res) => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const drives = [];
  for (const letter of letters) {
    const drivePath = `${letter}:\\`;
    try {
      if (fs.existsSync(drivePath)) {
        drives.push({ path: drivePath, label: `Local Disk (${letter}:)` });
      }
    } catch {}
  }
  res.json({ drives });
});

app.get('/api/system/browse', (req, res) => {
  const targetPath = req.query.path ? String(req.query.path).trim() : '';

  if (!targetPath) {
    // Return root drives on host PC
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const drives = [];
    for (const letter of letters) {
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          drives.push({ name: `Local Disk (${letter}:)`, path: drivePath, isDrive: true });
        }
      } catch {}
    }
    return res.json({ currentPath: '', parentPath: null, folders: drives });
  }

  try {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const folders = entries
      .filter(e => {
        try {
          return e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$');
        } catch {
          return false;
        }
      })
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const parsed = path.parse(resolved);
    const isDriveRoot = resolved.toLowerCase() === parsed.root.toLowerCase();
    const parentPath = isDriveRoot ? '' : path.dirname(resolved);

    res.json({
      currentPath: resolved,
      parentPath,
      folders
    });
  } catch (err) {
    res.status(500).json({ error: 'Cannot read directory', details: err.message });
  }
});

app.post('/api/system/pick-folder', (req, res) => {
  // Gracefully instruct client to use the in-app Web Folder Explorer
  res.json({ cancelled: true, useWebPicker: true });
});

// 3. Media roots management
app.get('/api/roots', (req, res) => {
  const roots = configManager.getRoots();
  const activeRoot = configManager.getActiveRoot();
  res.json({ roots, activeRoot });
});

app.post('/api/roots', (req, res) => {
  const { path: folderPath, label } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'Folder path is required' });
  }

  try {
    const root = configManager.addRoot(folderPath, label);
    res.json({ success: true, root });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/roots/select', (req, res) => {
  const { rootId } = req.body;
  try {
    const root = configManager.setActiveRoot(rootId);
    res.json({ success: true, root });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/roots/:rootId', (req, res) => {
  configManager.removeRoot(req.params.rootId);
  res.json({ success: true });
});

// 4. Directory scanner & navigation
app.get('/api/scan', async (req, res) => {
  try {
    let root = null;
    if (req.query.rootId) {
      root = configManager.getRoots().find(r => r.id === req.query.rootId);
    }
    if (!root) {
      root = configManager.getActiveRoot();
    }

    if (!root) {
      return res.json({ noRootConfigured: true, folders: [], lectures: [] });
    }

    // Verify folder still exists on host
    if (!fs.existsSync(root.path)) {
      return res.status(404).json({
        error: `The media root directory "${root.path}" is unavailable or was moved/disconnected.`,
        unavailableRoot: root
      });
    }

    const subPath = req.query.path || '';
    const result = await scanFolder(root, subPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Video streaming endpoint with HTTP byte range & on-the-fly FFmpeg remuxing
app.all('/api/stream', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  const { key, rootId, path: subPath } = req.query;

  let targetRoot = null;
  let relativeFilePath = null;

  if (key) {
    // Key format: `${rootId}::${relativePath}`
    const parts = key.split('::');
    if (parts.length >= 2) {
      const rId = parts[0];
      const rel = parts.slice(1).join('::');
      targetRoot = configManager.getRoots().find(r => r.id === rId);
      relativeFilePath = rel;
    }
  } else if (rootId && subPath) {
    targetRoot = configManager.getRoots().find(r => r.id === rootId);
    relativeFilePath = subPath;
  }

  if (!targetRoot) {
    return res.status(400).json({ error: 'Invalid or missing media root' });
  }

  try {
    const secureFilePath = resolveSecurePath(targetRoot.path, relativeFilePath);
    const forceRemux = req.query.remux === '1' || req.query.remux === 'true';

    // Direct byte-range streaming without conversion (native Chrome playback)
    if (forceRemux) {
      const audioIdx = req.query.audio !== undefined && req.query.audio !== '' ? parseInt(req.query.audio, 10) : null;
      const startTime = req.query.startTime !== undefined && req.query.startTime !== '' ? parseFloat(req.query.startTime) : null;
      streamRemuxFile(req, res, secureFilePath, {
        startTime: startTime || 0,
        audioStreamIndex: audioIdx !== null && !isNaN(audioIdx) ? audioIdx : undefined
      });
    } else {
      streamVideoFile(req, res, secureFilePath);
    }
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// 5b. Media Tracks Discovery (Audio & Embedded Subtitles)
app.get('/api/media/tracks', async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing lecture key' });

  const parts = key.split('::');
  if (parts.length < 2) return res.status(400).json({ error: 'Invalid lecture key' });

  const root = configManager.getRoots().find(r => r.id === parts[0]);
  if (!root) return res.status(404).json({ error: 'Media root not found' });

  try {
    const relativeFilePath = parts.slice(1).join('::');
    const secureFilePath = resolveSecurePath(root.path, relativeFilePath);
    const mediaInfo = await metadataService.getMediaInfo(secureFilePath);

    // Format embedded subtitles with stream endpoint
    const embeddedSubtitles = (mediaInfo.subtitles || []).map(s => ({
      id: `embedded_${s.streamIndex}`,
      isEmbedded: true,
      streamIndex: s.streamIndex,
      label: s.label,
      srclang: s.language || 'en',
      src: `/api/subtitles/embedded?key=${encodeURIComponent(key)}&streamIndex=${s.streamIndex}`
    }));

    // Pre-extract secondary audio tracks in the background so language switching is instant
    if (Array.isArray(mediaInfo.audioTracks) && mediaInfo.audioTracks.length > 1) {
      for (const track of mediaInfo.audioTracks) {
        if (typeof track.streamIndex === 'number' && track.index > 0) {
          prewarmAudioTrack(secureFilePath, track.streamIndex, track.codec).catch(() => {});
        }
      }
    }

    res.json({
      duration: mediaInfo.duration,
      isMkv: mediaInfo.isMkv,
      needsRemux: mediaInfo.needsRemux,
      audioTracks: mediaInfo.audioTracks || [],
      subtitles: embeddedSubtitles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Embedded subtitle delivery endpoint
app.get('/api/subtitles/embedded', (req, res) => {
  const { key, streamIndex } = req.query;
  if (!key || streamIndex === undefined) return res.status(400).send('Missing key or streamIndex');

  const parts = key.split('::');
  if (parts.length < 2) return res.status(400).send('Invalid lecture key');

  const root = configManager.getRoots().find(r => r.id === parts[0]);
  if (!root) return res.status(404).send('Media root not found');

  try {
    const relativeFilePath = parts.slice(1).join('::');
    const secureFilePath = resolveSecurePath(root.path, relativeFilePath);
    serveEmbeddedSubtitle(req, res, secureFilePath, streamIndex);
  } catch (err) {
    res.status(403).send('Forbidden: Access denied');
  }
});

// Audio track delivery endpoint (for secondary/alternate audio stream switching)
app.get('/api/audio/track', (req, res) => {
  const { key, streamIndex } = req.query;
  if (!key || streamIndex === undefined) return res.status(400).send('Missing key or streamIndex');

  const parts = key.split('::');
  if (parts.length < 2) return res.status(400).send('Invalid lecture key');

  const root = configManager.getRoots().find(r => r.id === parts[0]);
  if (!root) return res.status(404).send('Media root not found');

  try {
    const relativeFilePath = parts.slice(1).join('::');
    const secureFilePath = resolveSecurePath(root.path, relativeFilePath);
    serveAudioTrack(req, res, secureFilePath, streamIndex);
  } catch (err) {
    res.status(403).send('Forbidden: Access denied');
  }
});

// Subtitle delivery endpoint with on-the-fly WebVTT conversion
app.get('/api/subtitles', (req, res) => {
  const { key, file } = req.query;
  if (!key || !file) return res.status(400).send('Missing key or file');

  const parts = key.split('::');
  if (parts.length < 2) return res.status(400).send('Invalid lecture key');

  const root = configManager.getRoots().find(r => r.id === parts[0]);
  if (!root) return res.status(404).send('Media root not found');

  const videoRelDir = path.dirname(parts.slice(1).join('::'));
  const subRelPath = videoRelDir && videoRelDir !== '.' ? `${videoRelDir}/${file}` : file;

  try {
    const secureSubPath = resolveSecurePath(root.path, subRelPath);
    serveSubtitleFile(req, res, secureSubPath);
  } catch (err) {
    res.status(403).send('Forbidden: Access denied');
  }
});

// 6. Progress and bookmarks endpoints
app.get('/api/progress', (req, res) => {
  const { key } = req.query;
  if (key) {
    return res.json(configManager.getLectureProgress(key));
  }
  res.json(configManager.getAllProgress());
});

app.post('/api/progress', (req, res) => {
  const { key, completed, currentTime, duration } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing lecture key' });

  const updates = {};
  if (typeof completed === 'boolean') updates.completed = completed;
  if (typeof currentTime === 'number') updates.currentTime = Math.round(currentTime * 10) / 10;
  if (typeof duration === 'number' && duration > 0) updates.duration = Math.round(duration);

  const updated = configManager.updateLectureProgress(key, updates);
  res.json({ success: true, progress: updated });
});

app.post('/api/progress/toggle', (req, res) => {
  const { key, completed } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing lecture key' });

  const updated = configManager.toggleLectureCompleted(key, typeof completed === 'boolean' ? completed : null);
  res.json({ success: true, progress: updated });
});

app.post('/api/progress/bookmark', (req, res) => {
  const { key, time } = req.body;
  if (!key || typeof time !== 'number') return res.status(400).json({ error: 'Invalid bookmark payload' });

  const updated = configManager.saveBookmark(key, time);
  res.json({ success: true, progress: updated });
});

app.delete('/api/progress/bookmark', (req, res) => {
  const { key, time } = req.body;
  if (!key || typeof time !== 'number') return res.status(400).json({ error: 'Invalid bookmark payload' });

  const updated = configManager.removeBookmark(key, time);
  res.json({ success: true, progress: updated });
});

app.delete('/api/progress/bookmarks/clear', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing lecture key' });

  const updated = configManager.clearBookmarks(key);
  res.json({ success: true, progress: updated });
});

// Client reporting probed duration
app.post('/api/progress/duration', (req, res) => {
  const { key, duration } = req.body;
  if (!key || !duration) return res.status(400).json({ error: 'Missing key or duration' });

  const current = configManager.getLectureProgress(key);
  if (!current.duration || Math.abs(current.duration - duration) > 1) {
    configManager.updateLectureProgress(key, { duration: Math.round(duration) });
  }
  res.json({ success: true });
});

// 7. Settings
app.get('/api/settings', (req, res) => {
  res.json(configManager.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = configManager.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

// ==========================================
// SERVE CLIENT DIST STATIC FILES (Production)
// ==========================================
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ==========================================
// SERVER INITIALIZATION
// ==========================================
export function startServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const lan = getLanAddresses();
      const tailscaleIp = getTailscaleIp();
      console.log('\n============================================================');
      console.log('  Courseflix — LAN & Tailscale Remote Streaming Server');
      console.log('============================================================');
      console.log(`  Local URL:        http://localhost:${port}`);
      console.log(`  LAN URL (Wi-Fi):  http://${lan.primary}:${port}`);
      if (tailscaleIp) {
        console.log(`  Tailscale Remote: http://${tailscaleIp}:${port}  <-- [STREAM FROM 100KM AWAY]`);
      } else {
        console.log(`  Tailscale Remote: Offline / Not running (Open Tailscale app to stream remotely)`);
      }
      if (lan.all.length > 1) {
        console.log(`  Other LAN IPs:    ${lan.all.slice(1).map(ip => `http://${ip}:${port}`).join(', ')}`);
      }
      console.log('============================================================\n');
      resolve({ server, port, lanIp: lan.primary, tailscaleIp });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startServer().catch((err) => {
    console.error(`[Error] Failed to bind to port ${PORT}:`, err.message);
    process.exit(1);
  });
}

export default app;
