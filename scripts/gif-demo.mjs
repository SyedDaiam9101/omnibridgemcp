const sleep = ms => new Promise(r => setTimeout(r, ms));
const dim = s => `\x1b[2m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

async function run() {
  console.log(bold('\n── OmniBridge MCP ───────────────────────────────\n'));
  await sleep(400);

  console.log(cyan('▸ sandbox_create') + dim('  python:3.12-slim  ttl=120s'));
  await sleep(900);
  console.log(green('  ✓ sessionId: ') + dim('8bbf0883-3b07-43e9-bfa5-ea9b3824debe') + '\n');
  await sleep(500);

  console.log(cyan('▸ sandbox_exec') + dim('  python3 -c "run tests..."'));
  await sleep(1200);
  console.log(dim('  │ ') + 'fib(10) = 55');
  console.log(dim('  │ ') + 'sha256  = a3f8c2d1e9b04712...');
  console.log(dim('  │ ') + 'status  = verified');
  console.log(dim('  │ ') + green('exitCode: 0') + '\n');
  await sleep(500);

  console.log(yellow('▸ attestation receipt'));
  console.log(dim('  stdoutHash : 7dfa96c6b6eefc2eb316a9dc6479e5...'));
  console.log(dim('  signature  : 987e04e2ab06e5d382af667ca7e5bd...'));
  console.log(dim('  timestamp  : 2026-04-14T16:10:08.897Z') + '\n');
  await sleep(700);

  console.log(cyan('▸ attestation_verify'));
  await sleep(900);
  console.log(green('  ✓ Receipt is authentic.\n'));
  await sleep(400);

  console.log(cyan('▸ sandbox_diff'));
  await sleep(600);
  console.log(dim('  [+] /workspace'));
  console.log(dim('  [+] /workspace/output.txt') + '\n');
  await sleep(400);

  console.log(cyan('▸ sandbox_destroy'));
  await sleep(700);
  console.log(green('  ✓ session cleaned up\n'));

  console.log(bold('── isolated · signed · verifiable ──────────────\n'));
  await sleep(1500);
}

run();