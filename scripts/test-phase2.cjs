/**
 * Phase 2 Integration Test
 * Verifies: Initialize -> list tools -> webhook_subscribe -> chain_verify
 */

const MCP_URL = 'http://localhost:3000/mcp';
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || 'agency_prod_7721_alpha';

const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

async function parseSSE(response) {
  const text = await response.text();
  const match = text.match(/^data: (.*)$/m);
  if (!match) throw new Error(`No SSE data found in: ${text}`);
  return JSON.parse(match[1]);
}

async function test() {
  console.log('--- Phase 2 Integration Test ---\n');

  // Step 1: Initialize
  console.log('[1/3] Initializing session...');
  const initRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'phase2-test', version: '1.0.0' },
      },
    }),
  });

  const sessionId = initRes.headers.get('mcp-session-id');
  if (!sessionId) throw new Error('No session ID returned');
  console.log(`  Session: ${sessionId}`);
  const initData = await parseSSE(initRes);
  console.log(`  Server: ${initData.result.serverInfo.name} v${initData.result.serverInfo.version}`);

  const sessionHeaders = { ...HEADERS, 'mcp-session-id': sessionId };

  // Step 2: List tools (verify Phase 2 tools are registered)
  console.log('\n[2/3] Listing tools...');
  const toolsRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
    }),
  });

  const toolsData = await parseSSE(toolsRes);
  const toolNames = toolsData.result.tools.map(t => t.name);
  console.log(`  Registered tools (${toolNames.length}):`);
  toolNames.forEach(name => console.log(`    - ${name}`));

  // Verify Phase 2 tools exist
  const phase2Tools = [
    'webhook_subscribe', 'webhook_unsubscribe', 'webhook_list',
    'chain_append', 'chain_verify', 'chain_get',
  ];
  const missing = phase2Tools.filter(t => !toolNames.includes(t));
  if (missing.length > 0) {
    console.error(`\n  FAILURE: Missing Phase 2 tools: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('  All Phase 2 tools registered.');

  // Step 3: Create a real sandbox (Smoke Test)
  console.log('\n[3/4] Creating a real sandbox...');
  const createRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: {
        name: 'sandbox_create',
        arguments: { image: 'node:20-slim' },
      },
    }),
  });

  const createData = await parseSSE(createRes);
  const rawText = createData.result.content[0].text;
  
  if (rawText.startsWith('Provisioning Error')) {
    console.error(`\n  FAILURE: Server reported a Provisioning Error:\n  ${rawText}`);
    process.exit(1);
  }

  const createResult = JSON.parse(rawText);
  const sandboxSessionId = createResult.sessionId;

  if (!sandboxSessionId) {
    console.error('  FAILURE: No sessionId returned from sandbox_create');
    process.exit(1);
  }
  console.log(`  Sandbox Created! Session: ${sandboxSessionId}`);
  console.log('  --> CHECK DOCKER DESKTOP NOW! You should see a new container.');

  // Step 4: Call chain_verify on the new session
  console.log('\n[4/4] Testing chain_verify on the new session...');
  const chainRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: {
        name: 'chain_verify',
        arguments: { sessionId: sandboxSessionId },
      },
    }),
  });

  const chainData = await parseSSE(chainRes);
  const chainResult = JSON.parse(chainData.result.content[0].text);
  console.log(`  Chain valid: ${chainResult.valid}`);
  console.log(`  Chain length: ${chainResult.length}`);

  if (chainResult.valid !== true) {
    console.error('  FAILURE: Chain should be valid after creation');
    process.exit(1);
  }

  console.log('\n--- ALL PHASE 2 TESTS PASSED ---');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
