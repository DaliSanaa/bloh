import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

/**
 * Initializes the SQLite database and creates schema if needed.
 * @param databasePath - Path to the SQLite database file
 */
export function initDatabase(databasePath: string): void {
  const dir = path.dirname(databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '!clerk',
      clerk_user_id TEXT,
      stripe_customer_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id),
      credits INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      document_type TEXT,
      processing_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_usage_key_created ON usage(api_key_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  `);

  migrateSchema(db);
}

/**
 * Applies incremental schema migrations for existing databases.
 * @param database - SQLite database handle
 */
function migrateSchema(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('clerk_user_id')) {
    database.exec('ALTER TABLE users ADD COLUMN clerk_user_id TEXT');
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id)
      WHERE clerk_user_id IS NOT NULL
  `);

  database.prepare("UPDATE users SET plan = 'max' WHERE plan = 'business'").run();
}

/**
 * Returns the initialized database instance.
 * @returns SQLite database handle
 */
export function getDb(): Database.Database {
  if (db === null) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
