import { getLanAddresses, checkCandidatePorts } from '../server/src/network.js';

async function main() {
  const lan = getLanAddresses();
  const ports = await checkCandidatePorts([5173, 5174, 5175, 5176]);

  console.log(JSON.stringify({
    lanIp: lan.primary,
    allIps: lan.all,
    candidatePorts: ports
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
