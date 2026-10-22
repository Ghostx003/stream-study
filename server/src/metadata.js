import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import * as mm from 'music-metadata';
import { isNonNativeContainer, prewarmRemuxVideo } from './streamer.js';

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
   * Probes audio and subtitle streams using ffprobe.
   */
  getMediaStreams(filePath) {
    return new Promise((resolve) => {
      execFile(
        'ffprobe',
        [
          '-v', 'error',
          '-show_entries', 'stream=index,codec_name,codec_type:stream_tags=language,title',
          '-of', 'json',
          filePath
        ],
        { timeout: 8000 },
        (error, stdout) => {
          if (error || !stdout) {
            resolve({ audioTracks: [], subtitles: [], video: null });
            return;
          }
          try {
            const data = JSON.parse(stdout);
            const streams = data.streams || [];
            const audioTracks = [];
            const subtitles = [];
            let video = null;

            const LANG_MAP = {
              'eng': 'English', 'en': 'English',
              'jpn': 'Japanese', 'ja': 'Japanese',
              'hin': 'Hindi', 'hi': 'Hindi',
              'spa': 'Spanish', 'es': 'Spanish',
              'fra': 'French', 'fr': 'French',
              'deu': 'German', 'ger': 'German', 'de': 'German',
              'ita': 'Italian', 'it': 'Italian',
              'kor': 'Korean', 'ko': 'Korean',
              'zho': 'Chinese', 'chi': 'Chinese', 'zh': 'Chinese',
              'rus': 'Russian', 'ru': 'Russian',
              'ara': 'Arabic', 'ar': 'Arabic',
              'por': 'Portuguese', 'pt': 'Portuguese'
            };

            for (const s of streams) {
              const langCode = (s.tags?.language || '').toLowerCase();
              const langName = LANG_MAP[langCode] || (langCode ? langCode.toUpperCase() : '');
              const streamTitle = s.tags?.title || '';

              if (s.codec_type === 'video' && !video) {
                video = { index: s.index, codec: s.codec_name };
              } else if (s.codec_type === 'audio') {
                let label = '';
                if (langName && streamTitle) {
                  label = `${langName} — ${streamTitle}`;
                } else if (langName) {
                  label = `${langName} (${s.codec_name?.toUpperCase() || 'Audio'})`;
                } else if (streamTitle) {
                  label = streamTitle;
                } else {
                  label = `Audio Track ${audioTracks.length + 1} (${s.codec_name?.toUpperCase() || ''})`;
                }

                audioTracks.push({
                  id: `audio_${s.index}`,
                  index: audioTracks.length,
                  streamIndex: s.index,
                  codec: s.codec_name,
                  language: langCode || 'und',
                  title: streamTitle,
                  label
                });
              } else if (s.codec_type === 'subtitle') {
                let label = '';
                if (langName && streamTitle) {
                  label = `${langName} — ${streamTitle}`;
                } else if (langName) {
                  label = `${langName} Subtitles`;
                } else if (streamTitle) {
                  label = streamTitle;
                } else {
                  label = `Subtitle ${subtitles.length + 1}`;
                }

                subtitles.push({
                  index: subtitles.length,
                  streamIndex: s.index,
                  codec: s.codec_name,
                  language: langCode || 'en',
                  title: streamTitle,
                  label
                });
              }
            }

            resolve({ audioTracks, subtitles, video });
          } catch (e) {
            resolve({ audioTracks: [], subtitles: [], video: null });
          }
        }
      );
    });
  }

  /**
   * Retrieves full media info (duration, audio tracks, subtitles) with caching.
   */
  async getMediaInfo(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const cacheKey = `${filePath}::${stat.size}::${stat.mtimeMs}`;
      const cached = this.cache[cacheKey];

      if (cached && cached.audioTracks && cached.subtitles && typeof cached.duration === 'number' && cached.isNonNative !== undefined) {
        if (cached.isNonNative) {
          prewarmRemuxVideo(filePath).catch(() => {});
        }
        return cached;
      }

      const duration = await this.getVideoDuration(filePath);
      const streams = await this.getMediaStreams(filePath);

      const ext = path.extname(filePath).toLowerCase();
      const isMkv = ext === '.mkv';
      const isNonNative = isNonNativeContainer(filePath);
      const hasAc3OrDts = streams.audioTracks.some(a => ['ac3', 'eac3', 'dts', 'truehd'].includes(a.codec?.toLowerCase()));

      if (isNonNative) {
        prewarmRemuxVideo(filePath).catch(() => {});
      }

      const info = {
        duration,
        audioTracks: streams.audioTracks,
        subtitles: streams.subtitles,
        video: streams.video,
        isMkv,
        isNonNative,
        needsRemux: isMkv || isNonNative || hasAc3OrDts,
        size: stat.size,
        updatedAt: Date.now()
      };

      this.cache[cacheKey] = { ...this.cache[cacheKey], ...info };
      this.saveCache();

      return info;
    } catch (err) {
      return { duration: 0, audioTracks: [], subtitles: [], video: null, isMkv: false, needsRemux: false };
    }
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
      const isMkv = filePath.toLowerCase().endsWith('.mkv');

      // For MKV files, use fast ffprobe directly (avoids music-metadata stalling on EBML attachments)
      if (isMkv) {
        duration = await this._probeWithFfprobe(filePath);
      } else {
        // 1. Try fast pure-JS music-metadata for MP4/WebM
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
