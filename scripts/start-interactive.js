import readline from 'readline';
import { getLanAddresses, checkCandidatePorts, isPortAvailable, getTailscaleIp } from '../server/src/network.js';
import { configManager } from '../server/src/configManager.js';
import { startServer } from '../server/src/index.js';

const preferred = configManager.getSettings().preferredPort || 5175;
const CANDIDATE_PORTS = [preferred, 5175, 5174, 5173, 5176].filter((v, i, a) => a.indexOf(v) === i);

async function main() {
  console.log('\n============================================================');
  console.log('   Courseflix — LAN & Tailscale Remote Streaming');
  console.log('============================================================');

  const lan = getLanAddresses();
  const tailscaleIp = getTailscaleIp();

  console.log(`\n  Local Host IP:     127.0.0.1`);
  console.log(`  Wi-Fi / LAN IP:    ${lan.primary}`);
  if (tailscaleIp) {
    console.log(`  Tailscale IP:      ${tailscaleIp}  (Remote streaming active)`);
  } else {
    console.log(`  Tailscale IP:      Offline (Start Tailscale app to stream 100km away)`);
  }
  if (lan.all.length > 1) {
    console.log(`  Other Interfaces:  ${lan.all.slice(1).join(', ')}`);
  }

  console.log('\n  Scanning candidate ports...');
  const portChecks = await checkCandidatePorts(CANDIDATE_PORTS);

  console.log('\n  Available Port Choices:');
  const availableChoices = [];
  let defaultPort = null;

  portChecks.forEach((pc, idx) => {
    const isAvail = pc.available;
    const statusText = isAvail ? 'AVAILABLE' : 'IN USE / OCCUPIED';
    const isDef = isAvail && defaultPort === null;
    if (isDef) defaultPort = pc.port;
    if (isAvail) availableChoices.push(pc.port);

    console.log(`    [${idx + 1}] Port ${pc.port} (${statusText})${isDef ? '  <-- [DEFAULT]' : ''}`);
  });

  if (!defaultPort) {
    defaultPort = 5174;
    console.log(`\n  Note: All standard ports are in use. Fallback default is ${defaultPort}.`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => new Promise((resolve) => {
    rl.question(`\n  Select option (1-${CANDIDATE_PORTS.length}) or enter custom port [Default: ${defaultPort}]: `, (answer) => {
      resolve(answer.trim());
    });
  });

  let chosenPort = defaultPort;
  const answer = await promptUser();
  rl.close();

  if (answer) {
    const num = parseInt(answer, 10);
    if (!isNaN(num)) {
      if (num >= 1 && num <= CANDIDATE_PORTS.length) {
        chosenPort = CANDIDATE_PORTS[num - 1];
      } else if (num >= 1024 && num <= 65535) {
        chosenPort = num;
      }
    }
  }

  // Validate port availability before launching
  const isFree = await isPortAvailable(chosenPort);
  if (!isFree) {
    console.warn(`\n  Warning: Port ${chosenPort} is currently occupied! Searching next available port...`);
    let fallback = chosenPort + 1;
    while (!(await isPortAvailable(fallback)) && fallback < 60000) {
      fallback++;
    }
    console.log(`  Switching to available port: ${fallback}`);
    chosenPort = fallback;
  }

  console.log(`\n  Starting Courseflix Server on port ${chosenPort}...`);

  try {
    await startServer(chosenPort);
    console.log('  Press Ctrl+C in this window at any time to stop the server.');
    console.log('  Closing your web browser will NOT stop the server.\n');
  } catch (err) {
    console.error(`\n  [Fatal Error] Could not start server on port ${chosenPort}:`, err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n  [Fatal Startup Error]:', err.message);
  process.exit(1);
});
