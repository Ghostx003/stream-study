import os from 'os';
import net from 'net';

/**
 * Detects all non-internal IPv4 LAN addresses on the host.
 * @returns {{ primary: string, all: string[] }}
 */
export function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4 only, skip loopback (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  // Prioritize private network addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  addresses.sort((a, b) => {
    const isAPrivate = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(a);
    const isBPrivate = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(b);
    if (isAPrivate && !isBPrivate) return -1;
    if (!isAPrivate && isBPrivate) return 1;
    return 0;
  });

  return {
    primary: addresses.length > 0 ? addresses[0] : '127.0.0.1',
    all: addresses
  };
}

/**
 * Checks if a TCP port is currently free for binding on the specified host.
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
export function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          resolve(false);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

/**
 * Checks candidate ports and returns the status of each.
 * @param {number[]} candidatePorts
 * @returns {Promise<Array<{ port: number, available: boolean }>>}
 */
export async function checkCandidatePorts(candidatePorts = [5173, 5174, 5175, 5176]) {
  const results = [];
  for (const port of candidatePorts) {
    const available = await isPortAvailable(port);
    results.push({ port, available });
  }
  return results;
}
