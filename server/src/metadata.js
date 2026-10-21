import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.resolve(__dirname, '../data/metadata-cache.json');

class MetadataService {
  constructor() {
    this.cache = {};
    this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      }
    } catch (err) {
      this.cache = {};
    }
  }

  saveCache() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MetadataService] Failed to save metadata cache:', err.message);
    }
  }

  /**
   * Probes duration using ffprobe CLI as fallback.
   */
  _probeWithFfprobe(filePath) {
    return new Promise((resolve) => {
      execFile(
        'ffprobe',
        [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          filePath
        ],
        { timeout: 5000 },
        (error, stdout) => {
          if (error) {
            resolve(0);
            return;
          }
          const dur = parseFloat(stdout.trim());
          resolve(isNaN(dur) ? 0 : Math.round(dur));
        }
      );
    });
  }

  /**
   * Retrieves duration in seconds for a given video file.
   * Uses caching based on file path, mtime, and size.
   */
  async getVideoDuration(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const cacheKey = `${filePath}::${stat.size}::${stat.mtimeMs}`;

      if (this.cache[cacheKey] && typeof this.cache[cacheKey].duration === 'number') {
        return this.cache[cacheKey].duration;
      }

      let duration = 0;

      // 1. Try fast pure-JS music-metadata
      try {
        const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true });
        if (metadata && metadata.format && metadata.format.duration) {
          duration = Math.round(metadata.format.duration);
        }
      } catch (mmErr) {
        // Fallback to ffprobe
      }

      // 2. Fallback to ffprobe if duration couldn't be determined
      if (!duration || duration <= 0) {
        duration = await this._probeWithFfprobe(filePath);
      }

      // Cache result
      this.cache[cacheKey] = {
        duration,
        size: stat.size,
        updatedAt: Date.now()
      };
      this.saveCache();

      return duration;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Manually store/update duration (e.g. if reported by browser video element)
   */
  setDuration(filePath, duration) {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      const cacheKey = `${filePath}::${stat.size}::${stat.mtimeMs}`;
      this.cache[cacheKey] = {
        duration: Math.round(duration),
        size: stat.size,
        updatedAt: Date.now()
      };
      this.saveCache();
    } catch (e) {}
  }
}

export const metadataService = new MetadataService();
