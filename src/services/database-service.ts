import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DatabaseService {
  public db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.resolve(__dirname, '../../omnibridge.db');
    this.db = new Database(dbPath || process.env.DB_PATH || defaultPath);
    
    // Enable WAL mode for better concurrency performance
    this.db.pragma('journal_mode = WAL');
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    this.runMigrations();
  }

  private runMigrations() {
    // Ensure migrations table exists
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `).run();

    let currentVersion = 0;
    try {
      const row = this.db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number | null };
      currentVersion = row.v || 0;
    } catch (e) {
      // Ignored
    }

    const migrations = [
      // Version 1: Initial schema for Phase 3
      `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        container_id TEXT NOT NULL,
        total_ttl INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_accessed_at INTEGER NOT NULL
      );

      CREATE TABLE webhook_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE chain_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        receipt_json TEXT NOT NULL,
        signature TEXT NOT NULL,
        parent_hash TEXT,
        node_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE webhook_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT NOT NULL,
        secret TEXT,
        attempts INTEGER DEFAULT 0,
        last_attempt TEXT,
        next_retry TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING', -- PENDING, DEAD, DELIVERED
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      `,
      // Version 2: Add client_id to sessions for Governance Phase
      `
      ALTER TABLE sessions ADD COLUMN client_id TEXT;
      `
      ,
      // Version 3: Track session image to prevent runtime confusion/spoofing
      `
      ALTER TABLE sessions ADD COLUMN image TEXT;
      `
    ];

    const runTransaction = this.db.transaction((version: number, sql: string) => {
      this.db.exec(sql);
      this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    });

    migrations.forEach((sql, index) => {
      const targetVersion = index + 1;
      if (currentVersion < targetVersion) {
        console.error(`[DatabaseService] Running migration v${targetVersion}...`);
        try {
          runTransaction(targetVersion, sql);
          console.error(`[DatabaseService] Migration v${targetVersion} applied successfully.`);
        } catch (error: any) {
          console.error(`[DatabaseService] Migration v${targetVersion} failed: ${error.message}`);
          throw error;
        }
      }
    });
  }

  public close() {
    this.db.close();
  }
}
