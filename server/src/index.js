import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

import { getLanAddresses, checkCandidatePorts, getTailscaleIp } from './network.js';
import { configManager } from './configManager.js';
import { scanFolder, resolveSecurePath, generateLectureKey } from './scanner.js';
import { streamVideoFile } from './streamer.js';
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

// 2. Folder browser dialog (Windows native)
app.post('/api/system/pick-folder', (req, res) => {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Select your Courseflix Lectures folder"
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $dialog.SelectedPath
    } else {
        Write-Output "CANCELLED"
    }
  `;

  execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 60000 }, (err, stdout) => {
    if (err) {
      return res.status(500).json({ error: 'Folder dialog failed', details: err.message });
    }
    const chosen = stdout.trim();
    if (!chosen || chosen === 'CANCELLED') {
      return res.json({ cancelled: true });
    }
    res.json({ path: chosen, cancelled: false });
  });
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

// 5. Video streaming endpoint with HTTP byte range
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
    streamVideoFile(req, res, secureFilePath);
  } catch (err) {
    res.status(403).json({ error: err.message });
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
