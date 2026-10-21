import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSecurePath } from '../src/scanner.js';
import { startServer } from '../src/index.js';
import { configManager } from '../src/configManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

test('Filesystem Path Traversal Protection', async (t) => {
  await t.test('resolves legitimate child paths safely', () => {
    const p = resolveSecurePath(FIXTURES_DIR, 'sample.mp4');
    assert.strictEqual(p, path.join(FIXTURES_DIR, 'sample.mp4'));
  });

  await t.test('blocks parent directory traversal ../', () => {
    assert.throws(() => {
      resolveSecurePath(FIXTURES_DIR, '../../index.js');
    }, /directory traversal detected/i);
  });

  await t.test('blocks nested escape traversal', () => {
    assert.throws(() => {
      resolveSecurePath(FIXTURES_DIR, 'sub/../../../../Windows/System32');
    }, /directory traversal detected/i);
  });

  await t.test('streaming API rejects path traversal attempts with 403', async () => {
    const testPort = 5992;
    const { server } = await startServer(testPort);
    const root = configManager.addRoot(FIXTURES_DIR, 'SecRoot');

    try {
      const res = await fetch(`http://localhost:${testPort}/api/stream?rootId=${root.id}&path=../../package.json`);
      assert.strictEqual(res.status, 403);
    } finally {
      server.close();
    }
  });
});
