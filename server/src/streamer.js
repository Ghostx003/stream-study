import fs from 'fs';
import path from 'path';

const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.ogv': 'video/ogg',
  '.flv': 'video/x-flv'
};

/**
 * Gets the MIME type based on file extension.
 */
export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
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

/**
 * Handles HTTP Range video streaming for a file.
 * Supports both GET and HEAD requests.
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
      'Accept-Ranges': 'bytes'
    });
    return res.end();
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);

    if (!range) {
      // 416 Range Not Satisfiable
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': mimeType
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
