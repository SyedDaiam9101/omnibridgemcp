const Database = require('better-sqlite3');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPhase3() {
  console.log("--- Phase 3 Integration Test ---");

  try {
    const { DatabaseService } = require('../dist/services/database-service.js');
    const { WebhookService } = require('../dist/services/webhook-service.js');

    const dbService = new DatabaseService();
    const webhookService = new WebhookService(dbService);
    const db = dbService.db;

    console.log("[1/3] Adding failing Webhook to trigger Dead-Letter queue...");
    
    // Insert test session
    db.prepare(`
      INSERT INTO sessions (id, container_id, total_ttl, created_at, last_accessed_at) 
      VALUES ('test-session', 'mock-container', 120, '2026-04-13T00:00:00.000Z', ?) 
      ON CONFLICT DO NOTHING;
    `).run(Date.now());
    
    // Clean queue first
    db.prepare('DELETE FROM webhook_queue;').run();

    // Insert a pending item with 10 attempts so next attempt marks it dead
    const nowISO = new Date().toISOString();
    db.prepare(`
      INSERT INTO webhook_queue (session_id, url, payload, attempts, next_retry, status, created_at) 
      VALUES ('test-session', 'http://127.0.0.1:9999/fail', '{"mock":true}', 10, ?, 'PENDING', ?)
    `).run(nowISO, nowISO);
    
    console.log("[2/3] Waiting for worker to process queue...");
    webhookService.start();
    await sleep(6000); 

    console.log("[3/3] Verifying dead-letter status...");
    const row = db.prepare(`SELECT status FROM webhook_queue WHERE session_id = 'test-session';`).get();
    
    if (!row || row.status !== 'DEAD') {
      throw new Error(`Expected DEAD but got ${row ? row.status : 'undefined'}`);
    }
    
    console.log("  Webhook retry logic successfully capped and marked DEAD.");

    webhookService.stop();
    db.prepare(`DELETE FROM sessions WHERE id = 'test-session';`).run();
    db.close();

    console.log("--- ALL PHASE 3 TESTS PASSED ---");

  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testPhase3();

