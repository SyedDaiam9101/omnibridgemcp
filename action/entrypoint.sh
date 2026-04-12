#!/usr/bin/env bash
set -euo pipefail

# ────────────────────────────────────────────────────────────
# OmniBridge GitHub Action Entrypoint
# Orchestrates: create -> exec -> destroy via Streamable HTTP
# ────────────────────────────────────────────────────────────

MCP_ENDPOINT="${OMNIBRIDGE_URL}/mcp"
HEADERS=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

if [ -n "${AUTH_TOKEN:-}" ]; then
  HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
fi

# Helper: Extract JSON data from SSE response
parse_sse() {
  grep -m1 '^data: ' | sed 's/^data: //'
}

# Helper: Extract result from JSON-RPC response
extract_result() {
  echo "$1" | jq -r '.result // empty'
}

echo "::group::OmniBridge - Creating Sandbox"

# ── Step 1: Initialize session ───────────────────────────────
INIT_RESPONSE=$(curl -s "${HEADERS[@]}" -X POST "${MCP_ENDPOINT}" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "github-action", "version": "1.0.0" }
  }
}')

SESSION_ID=$(echo "${INIT_RESPONSE}" | parse_sse | jq -r '.result.serverInfo.name // empty')
MCP_SESSION_HEADER=$(echo "${INIT_RESPONSE}" | grep -i 'mcp-session-id' | head -1 | tr -d '\r\n' || true)

if [ -z "${MCP_SESSION_HEADER:-}" ]; then
  # Try extracting from curl verbose output
  INIT_RESPONSE_FULL=$(curl -si "${HEADERS[@]}" -X POST "${MCP_ENDPOINT}" -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "github-action", "version": "1.0.0" }
    }
  }')
  SESSION_HEADER=$(echo "${INIT_RESPONSE_FULL}" | grep -i 'mcp-session-id' | awk '{print $2}' | tr -d '\r\n')
else
  SESSION_HEADER="${MCP_SESSION_HEADER}"
fi

echo "Session initialized: ${SESSION_HEADER:-unknown}"
HEADERS+=(-H "mcp-session-id: ${SESSION_HEADER}")

# ── Step 2: Create sandbox ───────────────────────────────────
CREATE_RESPONSE=$(curl -s "${HEADERS[@]}" -X POST "${MCP_ENDPOINT}" -d "{
  \"jsonrpc\": \"2.0\",
  \"id\": 2,
  \"method\": \"tools/call\",
  \"params\": {
    \"name\": \"sandbox_create\",
    \"arguments\": { \"image\": \"${IMAGE}\" }
  }
}")

SANDBOX_SESSION=$(echo "${CREATE_RESPONSE}" | parse_sse | jq -r '.result.content[0].text' | jq -r '.sessionId')
echo "Sandbox created: ${SANDBOX_SESSION}"
echo "::endgroup::"

# ── Step 3: Execute command ──────────────────────────────────
echo "::group::OmniBridge - Executing Command"

EXEC_RESPONSE=$(curl -s "${HEADERS[@]}" -X POST "${MCP_ENDPOINT}" -d "{
  \"jsonrpc\": \"2.0\",
  \"id\": 3,
  \"method\": \"tools/call\",
  \"params\": {
    \"name\": \"sandbox_exec\",
    \"arguments\": {
      \"sessionId\": \"${SANDBOX_SESSION}\",
      \"command\": ${COMMAND},
      \"timeoutMs\": ${TIMEOUT}
    }
  }
}")

EXEC_DATA=$(echo "${EXEC_RESPONSE}" | parse_sse | jq -r '.result.content[0].text')
EXIT_CODE=$(echo "${EXEC_DATA}" | jq -r '.exitCode // 1')
STDOUT=$(echo "${EXEC_DATA}" | jq -r '.stdout // ""')
ATTESTATION=$(echo "${EXEC_DATA}" | jq -r '.attestation.receipt // ""')

echo "Exit code: ${EXIT_CODE}"
echo "::endgroup::"

# ── Step 4: Destroy sandbox ──────────────────────────────────
echo "::group::OmniBridge - Cleanup"

curl -s "${HEADERS[@]}" -X POST "${MCP_ENDPOINT}" -d "{
  \"jsonrpc\": \"2.0\",
  \"id\": 4,
  \"method\": \"tools/call\",
  \"params\": {
    \"name\": \"sandbox_destroy\",
    \"arguments\": { \"sessionId\": \"${SANDBOX_SESSION}\" }
  }
}" > /dev/null

echo "Sandbox destroyed."
echo "::endgroup::"

# ── Set outputs ──────────────────────────────────────────────
{
  echo "exit_code=${EXIT_CODE}"
  echo "session_id=${SANDBOX_SESSION}"
  echo "attestation_signature=${ATTESTATION}"
  echo "stdout<<EOF"
  echo "${STDOUT}"
  echo "EOF"
} >> "${GITHUB_OUTPUT}"

# Fail the action if the execution failed
if [ "${EXIT_CODE}" != "0" ]; then
  echo "::error::OmniBridge execution failed with exit code ${EXIT_CODE}"
  exit 1
fi
