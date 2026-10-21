import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseRange, getMimeType } from '../src/streamer.js';
import app, { startServer } from '../src/index.js';
import { configManager } from '../src/configManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const SAMPLE_MP4 = path.join(FIXTURES_DIR, 'sample.mp4');

test('Range Parser Unit Tests', async (t) => {
  const totalSize = 10000;

  await t.test('parses standard range header', () => {
    const r = parseRange('bytes=0-499', totalSize);
    assert.deepStrictEqual(r, { start: 0, end: 499 });
  });

  await t.test('parses open-ended range header', () => {
    const r = parseRange('bytes=500-', totalSize);
    assert.deepStrictEqual(r, { start: 500, end: 9999 });
  });

  await t.test('parses suffix range header', () => {
    const r = parseRange('bytes=-500', totalSize);
    assert.deepStrictEqual(r, { start: 9500, end: 9999 });
  });

  await t.test('returns null for invalid range', () => {
    assert.strictEqual(parseRange('invalid', totalSize), null);
    assert.strictEqual(parseRange('bytes=5000-100', totalSize), null);
  });
});

test('MIME Types Detection', () => {
  assert.strictEqual(getMimeType('video.mp4'), 'video/mp4');
  assert.strictEqual(getMimeType('video.mkv'), 'video/x-matroska');
  assert.strictEqual(getMimeType('video.webm'), 'video/webm');
  assert.strictEqual(getMimeType('video.mov'), 'video/quicktime');
});

test('HTTP Byte-Range Video Streaming Integration', async (t) => {
  const testPort = 5991;
  const { server } = await startServer(testPort);

  // Register fixtures dir as media root
  const root = configManager.addRoot(FIXTURES_DIR, 'Test Fixtures');
  const fileSize = fs.statSync(SAMPLE_MP4).size;

  try {
    await t.test('HEAD request returns 200 with Content-Length and Accept-Ranges', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/stream?rootId=${root.id}&path=sample.mp4`, {
        method: 'HEAD'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
      assert.strictEqual(res.headers.get('content-length'), String(fileSize));
      assert.strictEqual(res.headers.get('content-type'), 'video/mp4');
    });

    await t.test('GET request with Range returns 206 Partial Content', async () => {
      const rangeStart = 100;
      const rangeEnd = 5000;
      const expectedChunk = rangeEnd - rangeStart + 1;

      const res = await fetch(`http://localhost:${testPort}/api/stream?rootId=${root.id}&path=sample.mp4`, {
        headers: {
          'Range': `bytes=${rangeStart}-${rangeEnd}`
        }
      });

      assert.strictEqual(res.status, 206);
      assert.strictEqual(res.headers.get('content-range'), `bytes ${rangeStart}-${rangeEnd}/${fileSize}`);
      assert.strictEqual(res.headers.get('content-length'), String(expectedChunk));
      assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');

      const buffer = await res.arrayBuffer();
      assert.strictEqual(buffer.byteLength, expectedChunk);
    });

    await t.test('GET request without Range returns 200 and entire file', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/stream?rootId=${root.id}&path=sample.mp4`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-length'), String(fileSize));
      const buffer = await res.arrayBuffer();
      assert.strictEqual(buffer.byteLength, fileSize);
    });

    await t.test('Invalid Range returns 416 Range Not Satisfiable', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/stream?rootId=${root.id}&path=sample.mp4`, {
        headers: {
          'Range': `bytes=9999999-99999999`
        }
      });
      assert.strictEqual(res.status, 416);
      assert.strictEqual(res.headers.get('content-range'), `bytes */${fileSize}`);
    });

  } finally {
    server.close();
  }
});
