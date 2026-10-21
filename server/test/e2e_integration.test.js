import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { startServer } from '../src/index.js';
import { configManager } from '../src/configManager.js';
import { isPortAvailable } from '../src/network.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_LECTURES_DIR = path.resolve(__dirname, '../../test-lectures');

// Ensure mock fixtures exist for e2e testing
function ensureFixtures() {
  if (!fs.existsSync(TEST_LECTURES_DIR)) {
    fs.mkdirSync(path.join(TEST_LECTURES_DIR, 'Mathematics/Calculus'), { recursive: true });
    fs.mkdirSync(path.join(TEST_LECTURES_DIR, 'Mathematics/Linear Algebra'), { recursive: true });
    fs.mkdirSync(path.join(TEST_LECTURES_DIR, 'Computer Networks'), { recursive: true });
  }
  fs.writeFileSync(path.join(TEST_LECTURES_DIR, 'Overview.mp4'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(TEST_LECTURES_DIR, 'Mathematics/Calculus/Lecture 1 - Limits.mp4'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(TEST_LECTURES_DIR, 'Mathematics/Calculus/Lecture 2 - Derivatives.mp4'), Buffer.alloc(4096));
  fs.writeFileSync(path.join(TEST_LECTURES_DIR, 'Mathematics/Calculus/Lecture 10 - Integration.mp4'), Buffer.alloc(4096));
}
ensureFixtures();

test('Complete Courseflix LAN End-to-End System Integration', async (t) => {
  const testPort = 5800 + Math.floor(Math.random() * 1500);
  const { server } = await startServer(testPort);
  const baseUrl = `http://localhost:${testPort}`;
  let rootId = null;

  try {
    // 1. Verify network endpoint
    await t.test('GET /api/network reports LAN IP and port', async () => {
      const res = await fetch(`${baseUrl}/api/network`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.primaryLanIp);
      assert.strictEqual(data.port, testPort);
      assert.strictEqual(data.localUrl, `http://localhost:${testPort}`);
      assert.strictEqual(data.lanUrl, `http://${data.primaryLanIp}:${testPort}`);
    });

    // 2. Folder registration and persistence
    await t.test('POST /api/roots registers the lecture directory', async () => {
      const res = await fetch(`${baseUrl}/api/roots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: TEST_LECTURES_DIR, label: 'E2E Test Lectures' })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.root.id);
      rootId = data.root.id;

      // Verify active root
      const rootsRes = await fetch(`${baseUrl}/api/roots`);
      const rootsData = await rootsRes.json();
      assert.strictEqual(rootsData.activeRoot.id, rootId);
      assert.strictEqual(rootsData.activeRoot.label, 'E2E Test Lectures');
    });

    // 3. Root directory scanning & top-level folders
    await t.test('GET /api/scan displays top-level folders and standalone videos', async () => {
      const res = await fetch(`${baseUrl}/api/scan?rootId=${rootId}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.currentPath, '');
      assert.strictEqual(data.breadcrumbs.length, 1);
      assert.strictEqual(data.breadcrumbs[0].name, 'E2E Test Lectures');

      // Top-level folders: Mathematics, Computer Networks
      const folderNames = data.folders.map(f => f.name);
      assert.ok(folderNames.includes('Computer Networks'));
      assert.ok(folderNames.includes('Mathematics'));

      // Standalone video: Overview
      assert.strictEqual(data.lectures.length, 1);
      assert.strictEqual(data.lectures[0].name, 'Overview');
    });

    // 4. Nested folder navigation: Mathematics -> Calculus
    await t.test('GET /api/scan?path=Mathematics displays subfolders', async () => {
      const res = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.breadcrumbs.length, 2);
      assert.strictEqual(data.breadcrumbs[1].name, 'Mathematics');

      const subfolderNames = data.folders.map(f => f.name);
      assert.ok(subfolderNames.includes('Calculus'));
      assert.ok(subfolderNames.includes('Linear Algebra'));
    });

    // 5. Natural sorting inside Calculus: Lecture 1, Lecture 2, Lecture 10
    await t.test('Natural sorting arranges Lecture 2 before Lecture 10 in Calculus', async () => {
      const res = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.lectures.length, 3);
      const lectureTitles = data.lectures.map(l => l.name);
      assert.deepStrictEqual(lectureTitles, [
        'Lecture 1 - Limits',
        'Lecture 2 - Derivatives',
        'Lecture 10 - Integration'
      ]);
    });

    // 6. Dynamic duration calculations & completion toggle
    await t.test('Toggling lecture completion updates folder stats immediately', async () => {
      // Get initial Calculus stats
      const initialRes = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      const initialData = await initialRes.json();
      const targetLecture = initialData.lectures[1]; // Lecture 2 - Derivatives

      const initialRemaining = initialData.stats.remainingDuration;
      const lectureDur = targetLecture.duration;

      // Toggle completed: true
      const toggleRes = await fetch(`${baseUrl}/api/progress/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: targetLecture.id, completed: true })
      });
      assert.strictEqual(toggleRes.status, 200);
      const toggleData = await toggleRes.json();
      assert.strictEqual(toggleData.progress.completed, true);

      // Re-scan Calculus and verify stats
      const afterRes = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      const afterData = await afterRes.json();
      assert.strictEqual(afterData.stats.completedLectures, 1);
      assert.strictEqual(afterData.stats.remainingDuration, initialRemaining - lectureDur);

      // Toggle back to false
      await fetch(`${baseUrl}/api/progress/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: targetLecture.id, completed: false })
      });

      const resetRes = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      const resetData = await resetRes.json();
      assert.strictEqual(resetData.stats.completedLectures, 0);
      assert.strictEqual(resetData.stats.remainingDuration, initialRemaining);
    });

    // 7. Bookmarks save, query, and remove
    await t.test('Bookmark management for lectures', async () => {
      const scanRes = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      const scanData = await scanRes.json();
      const targetLecture = scanData.lectures[0];

      // Add bookmark at 3.5s
      const addRes = await fetch(`${baseUrl}/api/progress/bookmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: targetLecture.id, time: 3.5 })
      });
      assert.strictEqual(addRes.status, 200);
      const addData = await addRes.json();
      assert.ok(addData.progress.bookmarks.includes(3.5));

      // Query progress
      const progRes = await fetch(`${baseUrl}/api/progress?key=${encodeURIComponent(targetLecture.id)}`);
      const progData = await progRes.json();
      assert.deepStrictEqual(progData.bookmarks, [3.5]);

      // Remove bookmark
      const delRes = await fetch(`${baseUrl}/api/progress/bookmark`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: targetLecture.id, time: 3.5 })
      });
      assert.strictEqual(delRes.status, 200);
      const delData = await delRes.json();
      assert.strictEqual(delData.progress.bookmarks.length, 0);
    });

    // 8. Streaming with Range
    await t.test('Stream video with byte-range from nested folder', async () => {
      const scanRes = await fetch(`${baseUrl}/api/scan?rootId=${rootId}&path=Mathematics/Calculus`);
      const scanData = await scanRes.json();
      const targetLecture = scanData.lectures[0];

      const streamRes = await fetch(`${baseUrl}/api/stream?key=${encodeURIComponent(targetLecture.id)}`, {
        headers: { 'Range': 'bytes=0-1024' }
      });
      assert.strictEqual(streamRes.status, 206);
      assert.strictEqual(streamRes.headers.get('content-range').startsWith('bytes 0-1024/'), true);
      assert.strictEqual(streamRes.headers.get('content-length'), '1025');
    });

    // 9. Unavailable folder handling
    await t.test('Handling unavailable or moved media directory gracefully', async () => {
      // Add fake non-existent directory via config directly
      const fakeRootId = 'root_fake_unavailable';
      configManager.config.mediaRoots.push({
        id: fakeRootId,
        path: 'Z:\\NonExistent\\Drive\\Lectures',
        label: 'Missing Drive'
      });

      const res = await fetch(`${baseUrl}/api/scan?rootId=${fakeRootId}`);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes('unavailable or was moved'));

      // Clean up fake root
      configManager.removeRoot(fakeRootId);
    });

    // 10. Occupied port handling
    await t.test('Occupied port detection properly recognizes in-use ports', async () => {
      const isFree = await isPortAvailable(testPort);
      // Since testPort is currently listening, it must NOT be available
      assert.strictEqual(isFree, false);
    });

  } finally {
    if (rootId) {
      configManager.removeRoot(rootId);
    }
    configManager.config.lectureProgress = {};
    configManager.save();
    server.close();
  }
});
