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
    CREATE TABLE IF NOT EXISTS admin_records (module TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(module,id));
    CREATE INDEX IF NOT EXISTS idx_admin_records_module ON admin_records(module,updated_at);
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS local_settings (
      setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY, category_id TEXT, name TEXT NOT NULL, description TEXT,
      price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
      is_available INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', subtotal_minor INTEGER NOT NULL DEFAULT 0,
      discount_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, menu_item_id TEXT,
      item_name_snapshot TEXT NOT NULL, unit_price_minor INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0), line_total_minor INTEGER NOT NULL, notes TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE,
      amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','wallet')),
      payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending','paid','refunded')),
      paid_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, synced_at TEXT, last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_sync_status ON orders(sync_status);
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(synced_at, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  `);

  // Additive local-only columns: safe for existing installations.
  const columns = new Set(db.prepare("PRAGMA table_info(orders)").all().map((column) => column.name));
  for (const [name, type] of [
    ["customer_name", "TEXT"], ["phone", "TEXT"], ["address", "TEXT"],
    ["payment_method", "TEXT NOT NULL DEFAULT 'cash'"],
    ["table_id", "TEXT"], ["table_number", "INTEGER"], ["table_area", "TEXT"],
    ["closed_at", "TEXT"]
  ]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  }

  // Seed clearly labelled demo data only when no menu has been imported yet.
  const menuCount = db.prepare("SELECT COUNT(*) AS count FROM menu_items").get().count;
  const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM menu_categories").get().count;
  if (menuCount === 0 && categoryCount === 0) {
    const categories = [
      ["test-pastry", "فطائر TEST", 1],
      ["test-pasta", "مكرونات TEST", 2],
      ["test-main", "أطباق رئيسية TEST", 3],
      ["test-drinks", "مشروبات TEST", 4]
    ];
    const items = [
      ["test-fatir-cheese", "test-pastry", "فطير مشلتت بالجبنة TEST", 85, "🥧"],
      ["test-fatir-sugar", "test-pastry", "فطير سكر TEST", 65, "🥮"],
      ["test-fatir-sausage", "test-pastry", "فطير سجق TEST", 110, "🥧"],
      ["test-pasta-red", "test-pasta", "مكرونة صلصة TEST", 55, "🍝"],
      ["test-pasta-bechamel", "test-pasta", "مكرونة بشاميل TEST", 95, "🍝"],
      ["test-pasta-sausage", "test-pasta", "مكرونة سجق TEST", 105, "🍝"],
      ["test-chicken", "test-main", "وجبة فراخ TEST", 145, "🍗"],
      ["test-kofta", "test-main", "كفتة مشوية TEST", 160, "🍢"],
      ["test-rice", "test-main", "أرز خلطة TEST", 45, "🍚"],
      ["test-tea", "test-drinks", "شاي TEST", 15, "🍵"],
      ["test-cola", "test-drinks", "كانز TEST", 25, "🥤"],
      ["test-juice", "test-drinks", "عصير مانجو TEST", 35, "🧃"]
    ];
    const seed = db.transaction(() => {
      const addCategory = db.prepare("INSERT INTO menu_categories (id,name,sort_order) VALUES (?,?,?)");
      categories.forEach((row) => addCategory.run(...row));
      const addItem = db.prepare("INSERT INTO menu_items (id,category_id,name,price_minor,description) VALUES (?,?,?,?,?)");
      items.forEach(([id, categoryId, name, price, icon]) => addItem.run(id, categoryId, name, price * 100, icon));
    });
    seed();
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)").run(2);
  return { db, databasePath };
}

module.exports = { openDatabase };
