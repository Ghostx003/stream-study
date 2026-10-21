import readline from 'readline';
import { getLanAddresses, checkCandidatePorts, isPortAvailable } from '../server/src/network.js';
import { startServer } from '../server/src/index.js';

const CANDIDATE_PORTS = [5174, 5173, 5175, 5176];

async function main() {
  console.log('\n============================================================');
  console.log('   Courseflix LAN — Local Network Lecture Streaming');
  console.log('============================================================');

  const lan = getLanAddresses();
  console.log(`\n  Detected LAN IPv4: ${lan.primary}`);
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

  console.log(`\n  Starting Courseflix LAN Server on port ${chosenPort}...`);

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
