import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

function dbPath(): string {
  const p = process.env.SQLITE_DB_PATH ?? './data/compliance.db';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function createDb() {
  const filePath = dbPath();

  // Ensure data dir exists
  const { mkdirSync, existsSync } = require('fs') as typeof import('fs');
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(filePath);

  // WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist (simple push — no migration runner needed for SQLite)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tracking_members (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      no                  INTEGER,
      project             TEXT,
      name                TEXT NOT NULL,
      email               TEXT,
      serial              TEXT,
      account             TEXT,
      device_type         TEXT,
      malware_alerts      TEXT,
      compliance_checks   TEXT,
      seed_configuration  TEXT,
      operating_system    TEXT,
      follow_up_action    TEXT,
      response_from_ticket TEXT,
      tracking_status     TEXT,
      removed_from_tracking INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT,
      updated_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id                                  INTEGER PRIMARY KEY AUTOINCREMENT,
      account                             TEXT NOT NULL,
      submission_type                     TEXT NOT NULL,
      image_path                          TEXT,
      image_url                           TEXT,
      image_original_name                 TEXT,
      image_saved_name                    TEXT,
      status                              TEXT NOT NULL DEFAULT 'PENDING',
      validation_result                   TEXT,
      validation_checklist                TEXT,
      submission_date                     TEXT NOT NULL,
      confidence_score                    REAL,
      has_clock                           INTEGER,
      has_windows_update                  INTEGER,
      has_device_name                     INTEGER,
      has_device_serial                   INTEGER,
      has_dashboard                       INTEGER,
      has_seed_dashboard                  INTEGER,
      has_trellix                         INTEGER,
      has_timestamp                       INTEGER,
      has_mac_info                        INTEGER,
      has_thin_virus_threat_protection    INTEGER,
      has_thin_account_protection         INTEGER,
      has_thin_firewall_network_protection INTEGER,
      has_thin_app_browser_control        INTEGER,
      has_thin_device_security            INTEGER,
      has_thin_device_performance_health  INTEGER,
      has_thin_windows_update             INTEGER,
      has_thin_serial_number              INTEGER,
      malware_alerts                      TEXT,
      compliance_check                    TEXT,
      seed_configuration                  TEXT,
      operating_system                    TEXT,
      device_serial                       TEXT,
      device_name                         TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id       TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email    TEXT,
      active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS _meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed meta version counter if missing
  sqlite.prepare(`INSERT OR IGNORE INTO _meta (key, value) VALUES ('tracking_version', '0')`).run();

  // Idempotent column additions for schema evolution (ALTER TABLE IF NOT EXISTS not available in older SQLite)
  try { sqlite.exec(`ALTER TABLE tracking_members ADD COLUMN removed_from_tracking INTEGER NOT NULL DEFAULT 0`); } catch { /* column already exists */ }

  return db;
}

// Singleton — always reuse across module reloads (both dev and production)
const globalForDb = globalThis as unknown as { _db?: ReturnType<typeof createDb> };

export const db = globalForDb._db ?? createDb();
globalForDb._db = db;

/** Increment tracking_version in _meta and return new value. */
export function bumpTrackingVersion(): number {
  const raw = (db as unknown as { $client: Database.Database }).$client;
  const row = raw.prepare(`UPDATE _meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'tracking_version' RETURNING value`).get() as { value: string } | undefined;
  const version = parseInt(row?.value ?? '0', 10);
  // Emit real-time event to all connected SSE clients (non-blocking)
  try {
    const { emitChange } = require('./event-bus') as typeof import('./event-bus');
    emitChange('tracking');
  } catch { /* event bus not available yet during boot */ }
  return version;
}

/** Get current tracking_version. */
export function getTrackingVersion(): number {
  const raw = (db as unknown as { $client: Database.Database }).$client;
  const row = raw.prepare(`SELECT value FROM _meta WHERE key = 'tracking_version'`).get() as { value: string } | undefined;
  return parseInt(row?.value ?? '0', 10);
}
