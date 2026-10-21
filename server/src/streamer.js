import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';

const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.ogv': 'video/ogg',
  '.flv': 'video/x-flv',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg; codecs=opus',
  '.flac': 'audio/flac'
};

/**
 * Gets the MIME type based on file extension.
 */
export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webm' && filePath.includes('cache') && filePath.includes('audio')) {
    return 'audio/webm';
  }
  return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Parses HTTP Range header: "bytes=123-456"
 * @param {string} rangeHeader
 * @param {number} totalSize
 * @returns {{ start: number, end: number } | null}
 */
export function parseRange(rangeHeader, totalSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const parts = rangeHeader.replace('bytes=', '').split('-');
  const rawStart = parts[0];
  const rawEnd = parts[1];

  let start = parseInt(rawStart, 10);
  let end = rawEnd ? parseInt(rawEnd, 10) : totalSize - 1;

  if (isNaN(start)) {
    // Suffix range: bytes=-500 (last 500 bytes)
    start = totalSize - parseInt(rawEnd, 10);
    end = totalSize - 1;
  }

  if (isNaN(end) || end >= totalSize) {
    end = totalSize - 1;
  }

  if (start < 0 || start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Serves subtitle files with automatic conversion from SRT to WebVTT.
 */
export function serveSubtitleFile(req, res, filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return res.status(404).send('Subtitle file not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  let vttContent = content;

  if (ext === '.srt' || ext === '.sub') {
    // Convert SRT to WebVTT
    vttContent = 'WEBVTT\n\n' + content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  } else if (!vttContent.trim().startsWith('WEBVTT')) {
    vttContent = 'WEBVTT\n\n' + vttContent;
  }

  res.writeHead(200, {
    'Content-Type': 'text/vtt; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600'
  });
  res.end(vttContent);
}

const subtitleVttCache = new Map();

/**
 * Extracts embedded subtitles from a video file (e.g. MKV) and streams as WebVTT.
 */
export function serveEmbeddedSubtitle(req, res, filePath, streamIndex) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Media file not found');
  }

  const sIdx = parseInt(streamIndex, 10);
  if (isNaN(sIdx) || sIdx < 0) {
    return res.status(400).send('Invalid stream index');
  }

  const cacheKey = `${filePath}::${sIdx}`;
  if (subtitleVttCache.has(cacheKey)) {
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end(subtitleVttCache.get(cacheKey));
  }

  res.writeHead(200, {
    'Content-Type': 'text/vtt; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400'
  });

  const ff = spawn('ffmpeg', [
    '-v', 'error',
    '-i', filePath,
    '-map', `0:${sIdx}`,
    '-f', 'webvtt',
    '-'
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  let buffer = '';
  ff.stdout.on('data', chunk => {
    buffer += chunk.toString();
  });

  ff.stdout.pipe(res);

  ff.on('close', code => {
    if (code === 0 && buffer) {
      subtitleVttCache.set(cacheKey, buffer);
    }
  });

  req.on('close', () => {
    try {
      ff.kill('SIGKILL');
    } catch {}
  });

  ff.on('error', () => {
    if (!res.headersSent) {
      res.status(500).send('Failed to extract subtitle');
    }
  });
}

const __streamer_filename = fileURLToPath(import.meta.url);
const __streamer_dirname = path.dirname(__streamer_filename);
const audioCacheDir = path.resolve(__streamer_dirname, '../data/cache/audio');
if (!fs.existsSync(audioCacheDir)) {
  fs.mkdirSync(audioCacheDir, { recursive: true });
}

const audioInFlight = new Map();

function getAudioFormatForCodec(codec) {
  const c = (codec || '').trim().toLowerCase();
  if (c === 'aac') return { ext: '.m4a', copy: true, format: 'mp4' };
  if (c === 'mp3') return { ext: '.mp3', copy: true, format: 'mp3' };
  if (c === 'opus') return { ext: '.webm', copy: true, format: 'webm' };
  if (c === 'vorbis') return { ext: '.webm', copy: true, format: 'webm' };
  if (c === 'flac') return { ext: '.flac', copy: true, format: 'flac' };
  // Non-native browser audio (ac3, eac3, dts, truehd): transcode to AAC in MP4
  return { ext: '.m4a', copy: false, format: 'mp4' };
}

function findExistingAudioCache(hash) {
  if (!fs.existsSync(audioCacheDir)) return null;
  const files = fs.readdirSync(audioCacheDir);
  const found = files.find(f => f.startsWith(hash) && !f.includes('.tmp'));
  return found ? path.join(audioCacheDir, found) : null;
}

/**
 * Asynchronously extracts or copies an individual audio track in the background.
 */
export function prewarmAudioTrack(filePath, streamIndex, knownCodec) {
  if (!fs.existsSync(filePath)) return Promise.reject(new Error('File not found'));
  const sIdx = parseInt(streamIndex, 10);
  if (isNaN(sIdx) || sIdx < 0) return Promise.reject(new Error('Invalid stream index'));

  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('md5').update(`${filePath}::${stat.size}::${stat.mtimeMs}::${sIdx}`).digest('hex');

  const existing = findExistingAudioCache(hash);
  if (existing) {
    return Promise.resolve(existing);
  }

  if (audioInFlight.has(hash)) {
    return audioInFlight.get(hash);
  }

  const extractionPromise = new Promise((resolve, reject) => {
    const doExtraction = (codec) => {
      const fmt = getAudioFormatForCodec(codec);
      const targetFilePath = path.join(audioCacheDir, `${hash}${fmt.ext}`);
      const tempFile = `${targetFilePath}.tmp_${Date.now()}`;

      const runFfmpeg = (tryCopy) => {
        const args = [
          '-v', 'error',
          '-threads', '0',
          '-i', filePath,
          '-map', `0:${sIdx}`,
          '-vn', '-sn', '-dn',
          ...(tryCopy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2']),
          '-f', fmt.format,
          ...(fmt.format === 'mp4' ? ['-movflags', '+faststart'] : []),
          tempFile,
          '-y'
        ];

        execFile('ffmpeg', args, { timeout: 120000 }, (ffErr) => {
          if (ffErr) {
            if (tryCopy) {
              // Fallback to transcoding to aac in mp4 if copy failed
              return runFfmpeg(false);
            }
            try { fs.unlinkSync(tempFile); } catch {}
            return reject(ffErr);
          }

          try {
            fs.renameSync(tempFile, targetFilePath);
          } catch (renameErr) {
            // Already renamed by concurrent process
          }
          resolve(targetFilePath);
        });
      };

      runFfmpeg(fmt.copy);
    };

    if (knownCodec) {
      doExtraction(knownCodec);
    } else {
      execFile('ffprobe', [
        '-v', 'error',
        '-select_streams', `${sIdx}`,
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ], (err, stdout) => {
        doExtraction(stdout || '');
      });
    }
  });

  audioInFlight.set(hash, extractionPromise);

  extractionPromise
    .finally(() => {
      audioInFlight.delete(hash);
    });

  return extractionPromise;
}

export function serveAudioTrack(req, res, filePath, streamIndex) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Media file not found');
  }

  const sIdx = parseInt(streamIndex, 10);
  if (isNaN(sIdx) || sIdx < 0) {
    return res.status(400).send('Invalid stream index');
  }

  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('md5').update(`${filePath}::${stat.size}::${stat.mtimeMs}::${sIdx}`).digest('hex');

  const existing = findExistingAudioCache(hash);
  if (existing) {
    return streamVideoFile(req, res, existing);
  }

  prewarmAudioTrack(filePath, sIdx)
    .then((extractedPath) => {
      streamVideoFile(req, res, extractedPath);
    })
    .catch((err) => {
      if (!res.headersSent) res.status(500).send('Audio extraction failed: ' + (err?.message || err));
    });
}

/**
 * Streams MKV / incompatible video files by remuxing to fragmented MP4 on the fly.
 * Video is copied directly (-c:v copy) for instantaneous startup and 0% CPU overhead.
 * Audio is converted to AAC 2.0 (-c:a aac) ensuring universal playback on all mobile devices.
 */
export function streamRemuxFile(req, res, filePath, options = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const startTime = options.startTime ? Math.max(0, parseFloat(options.startTime)) : 0;
  const audioStreamIndex = options.audioStreamIndex;

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const args = ['-v', 'error'];

  if (startTime > 0) {
    args.push('-ss', String(startTime));
  }

  args.push('-i', filePath);
  args.push('-map', '0:v:0');

  if (typeof audioStreamIndex === 'number' && audioStreamIndex >= 0) {
    args.push('-map', `0:${audioStreamIndex}`);
  } else {
    args.push('-map', '0:a:0?');
  }

  // Copy video 1:1 without re-encoding; convert audio to standard AAC stereo
  args.push(
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  );

  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });

  ff.stdout.pipe(res);

  req.on('close', () => {
    try {
      ff.kill('SIGKILL');
    } catch {}
  });

  ff.on('error', (err) => {
    try {
      ff.kill('SIGKILL');
    } catch {}
    if (!res.headersSent) {
      res.status(500).send('Remux error');
    }
  });
}

/**
 * Handles HTTP Range video streaming for a file without any conversion.
 * Directly streams the original video file (.mp4, .mkv, .webm, etc.) with HTTP 206 Partial Content byte ranges.
 */
export function streamVideoFile(req, res, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  if (!stat.isFile()) {
    return res.status(400).json({ error: 'Path is not a regular file' });
  }

  const fileSize = stat.size;
  const rangeHeader = req.headers.range;
  const mimeType = getMimeType(filePath);

  // If HEAD request, respond with basic headers
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    });
    return res.end();
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);

    if (!range) {
      // 416 Range Not Satisfiable
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;

    // HTTP 206 Partial Content
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    // Create stream with backpressure
    const stream = fs.createReadStream(filePath, { start, end });

    // Handle client disconnect gracefully
    req.on('close', () => {
      stream.destroy();
    });

    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.status(500).send('Error streaming media file');
      }
      stream.destroy();
    });

    stream.pipe(res);
  } else {
    // Regular 200 response for entire file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);

    req.on('close', () => {
      stream.destroy();
    });

    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.status(500).send('Error streaming media file');
      }
      stream.destroy();
    });

    stream.pipe(res);
  }
}
