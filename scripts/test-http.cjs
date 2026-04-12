async function test() {
  console.log("Sending initialize request...");
  const devResponse = await fetch('http://localhost:3000/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      }
    })
  });

  const statusCode = devResponse.status;
  const sessionId = devResponse.headers.get('mcp-session-id');
  const text = await devResponse.text();
  console.log(`Status: ${statusCode}`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Raw Response Text:\n${text}`);

  // Extract the data line from the SSE message
  const dataMatch = text.match(/^data: (.*)$/m);
  if (dataMatch) {
    const body = JSON.parse(dataMatch[1]);
    console.log(`Parsed JSON Body:`, JSON.stringify(body, null, 2));

    if (statusCode === 200 && sessionId && body.result) {
      console.log("SUCCESS: HTTP Transport initialized correctly.");
    } else {
      console.log("FAILURE: HTTP Transport failed to initialize.");
      process.exit(1);
    }
  } else {
    console.log("FAILURE: No data found in SSE response.");
    process.exit(1);
  }
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
