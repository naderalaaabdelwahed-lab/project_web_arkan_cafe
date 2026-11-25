const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function openDatabase(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });

  const databasePath = path.join(userDataPath, "arkan-local.sqlite");
  const db = new Database(databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
      is_available INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal_minor INTEGER NOT NULL DEFAULT 0,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      total_minor INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      menu_item_id TEXT,
      item_name_snapshot TEXT NOT NULL,
      unit_price_minor INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      line_total_minor INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      synced_at TEXT,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created_at
      ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_sync_status
      ON orders(sync_status);
    CREATE INDEX IF NOT EXISTS idx_outbox_pending
      ON sync_outbox(synced_at, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id
      ON order_items(order_id);
  `);

  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)"
  ).run(1);

  return { db, databasePath };
}

module.exports = { openDatabase };
