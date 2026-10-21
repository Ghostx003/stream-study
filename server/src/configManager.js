import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Default initial config
const DEFAULT_CONFIG = {
  mediaRoots: [],      // Array of { id: string, path: string, label: string }
  activeRootId: null,  // Currently active root folder ID
  lectureProgress: {}, // Keyed by unique lecture key: { completed: bool, currentTime: num, duration: num, bookmarks: [] }
  settings: {
    preferredPort: 5174,
    defaultPlaybackSpeed: 1.75,
    brownNoiseVolume: 0.2
  }
};

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this._ensureDir();
    this.load();
  }

  _ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  load() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
          if (!raw.trim()) continue;
          const parsed = JSON.parse(raw);
          this.config = {
            ...DEFAULT_CONFIG,
            ...parsed,
            settings: { ...DEFAULT_CONFIG.settings, ...(parsed.settings || {}) },
            lectureProgress: parsed.lectureProgress || {}
          };
          return;
        } else {
          this.save();
          return;
        }
      } catch (err) {
        // If file was being written concurrently, retry briefly
        if (attempt === 2) {
          console.error('[ConfigManager] Error reading config file, using defaults:', err.message);
          this.config = { ...DEFAULT_CONFIG };
        }
      }
    }
  }

  save() {
    try {
      this._ensureDir();
      const tmpFile = path.join(DATA_DIR, `.config.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`);
      fs.writeFileSync(tmpFile, JSON.stringify(this.config, null, 2), 'utf-8');
      fs.renameSync(tmpFile, CONFIG_FILE);
    } catch (err) {
      console.error('[ConfigManager] Error writing config atomically:', err.message);
    }
  }

  getRoots() {
    return this.config.mediaRoots;
  }

  getActiveRoot() {
    if (!this.config.activeRootId && this.config.mediaRoots.length > 0) {
      return this.config.mediaRoots[0];
    }
    return this.config.mediaRoots.find(r => r.id === this.config.activeRootId) || null;
  }

  addRoot(folderPath, label = null) {
    const normalized = path.normalize(path.resolve(folderPath));
    if (!fs.existsSync(normalized)) {
      throw new Error(`Directory does not exist: "${folderPath}"`);
    }
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: "${folderPath}"`);
    }

    const existing = this.config.mediaRoots.find(r => path.normalize(r.path).toLowerCase() === normalized.toLowerCase());
    if (existing) {
      this.config.activeRootId = existing.id;
      this.save();
      return existing;
    }

    const id = `root_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const folderLabel = label || path.basename(normalized) || normalized;
    const newRoot = { id, path: normalized, label: folderLabel };
    this.config.mediaRoots.push(newRoot);
    this.config.activeRootId = id;
    this.save();
    return newRoot;
  }

  setActiveRoot(rootId) {
    const root = this.config.mediaRoots.find(r => r.id === rootId);
    if (!root) {
      throw new Error(`Root not found with ID: ${rootId}`);
    }
    this.config.activeRootId = rootId;
    this.save();
    return root;
  }

  removeRoot(rootId) {
    this.config.mediaRoots = this.config.mediaRoots.filter(r => r.id !== rootId);
    if (this.config.activeRootId === rootId) {
      this.config.activeRootId = this.config.mediaRoots.length > 0 ? this.config.mediaRoots[0].id : null;
    }
    this.save();
  }

  getLectureProgress(lectureKey) {
    return this.config.lectureProgress[lectureKey] || {
      completed: false,
      currentTime: 0,
      duration: 0,
      bookmarks: [],
      lastWatched: null
    };
  }

  getAllProgress() {
    return this.config.lectureProgress;
  }

  updateLectureProgress(lectureKey, updates) {
    const current = this.getLectureProgress(lectureKey);
    const updated = {
      ...current,
      ...updates,
      lastWatched: new Date().toISOString()
    };
    this.config.lectureProgress[lectureKey] = updated;
    this.save();
    return updated;
  }

  toggleLectureCompleted(lectureKey, forceState = null) {
    const current = this.getLectureProgress(lectureKey);
    const newCompleted = forceState !== null ? forceState : !current.completed;
    return this.updateLectureProgress(lectureKey, { completed: newCompleted });
  }

  saveBookmark(lectureKey, timeInSeconds) {
    const current = this.getLectureProgress(lectureKey);
    const bookmarks = Array.isArray(current.bookmarks) ? [...current.bookmarks] : [];
    const rounded = Math.round(timeInSeconds * 10) / 10;
    if (!bookmarks.some(b => Math.abs(b - rounded) < 1)) {
      bookmarks.push(rounded);
      bookmarks.sort((a, b) => a - b);
    }
    return this.updateLectureProgress(lectureKey, { bookmarks });
  }

  removeBookmark(lectureKey, timeInSeconds) {
    const current = this.getLectureProgress(lectureKey);
    const bookmarks = (current.bookmarks || []).filter(b => Math.abs(b - timeInSeconds) >= 1);
    return this.updateLectureProgress(lectureKey, { bookmarks });
  }

  clearBookmarks(lectureKey) {
    return this.updateLectureProgress(lectureKey, { bookmarks: [] });
  }

  getSettings() {
    return this.config.settings;
  }

  updateSettings(newSettings) {
    this.config.settings = { ...this.config.settings, ...newSettings };
    this.save();
    return this.config.settings;
  }
}

export const configManager = new ConfigManager();
