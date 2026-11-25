const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");
const { randomUUID } = require("node:crypto");
const { openDatabase } = require("./database.cjs");

function startLocalServer({ userDataPath, port = 4317 }) {
  const { db, databasePath } = openDatabase(userDataPath);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "arkan-local",
      version: "0.2.0",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/menu", (_req, res) => {
    const categories = db.prepare(
      "SELECT id, name, sort_order FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, name"
    ).all();
    const items = db.prepare(
      "SELECT id, category_id, name, description, price_minor, is_available FROM menu_items WHERE is_available = 1 ORDER BY name"
    ).all();
    res.json({ categories, items });
  });

  // Import a menu snapshot exported from the existing ARKAN admin system.
  // The import is transactional: a malformed snapshot never leaves a partial menu.
  app.put("/api/menu/import", (req, res) => {
    const categories = req.body?.categories;
    const items = req.body?.items;
    if (!Array.isArray(categories) || !Array.isArray(items)) {
      return res.status(400).json({ error: "Expected categories[] and items[] arrays." });
    }
    if (categories.length > 500 || items.length > 5000) {
      return res.status(413).json({ error: "Menu snapshot is too large." });
    }

    const categoryIds = new Set();
    for (const category of categories) {
      if (!category || category.id == null || !String(category.name || "").trim()) {
        return res.status(400).json({ error: "Every category needs an id and name." });
      }
      categoryIds.add(String(category.id));
    }

    for (const item of items) {
      const price = Number(item?.price);
      if (!item || item.id == null || !String(item.name || "").trim() ||
          !Number.isFinite(price) || price < 0 ||
          !categoryIds.has(String(item.category_id))) {
        return res.status(400).json({ error: "Invalid menu item or category reference." });
      }
    }

    const importSnapshot = db.transaction(() => {
      db.prepare("DELETE FROM menu_items").run();
      db.prepare("DELETE FROM menu_categories").run();

      const addCategory = db.prepare(
        "INSERT INTO menu_categories (id, name, sort_order, is_active) VALUES (?, ?, ?, ?)"
      );
      categories.forEach((c, index) => addCategory.run(
        String(c.id), String(c.name).trim(), Number(c.sort_order ?? index), c.is_active === false ? 0 : 1
      ));

      const addItem = db.prepare(
        "INSERT INTO menu_items (id, category_id, name, description, price_minor, is_available) VALUES (?, ?, ?, ?, ?, ?)"
      );
      items.forEach((p) => addItem.run(
        String(p.id), String(p.category_id), String(p.name).trim(),
        p.description ? String(p.description) : null,
        Math.round(Number(p.price) * 100),
        p.is_available === false ? 0 : 1
      ));
    });

    try {
      importSnapshot();
      res.json({ ok: true, categories: categories.length, items: items.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders", (_req, res) => {
    const orders = db.prepare(
      "SELECT * FROM orders ORDER BY created_at DESC LIMIT 200"
    ).all();
    const getItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
    res.json(orders.map((order) => ({ ...order, items: getItems.all(order.id) })));
  });

  app.post("/api/orders", (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      return res.status(400).json({ error: "أضف صنفًا واحدًا على الأقل للطلب." });
    }

    const menuItems = db.prepare(
      "SELECT id, name, price_minor, is_available FROM menu_items WHERE id = ?"
    );
    const preparedItems = [];
    for (const requested of body.items) {
      const menuItem = menuItems.get(String(requested.menu_item_id || ""));
      const quantity = Number(requested.quantity);
      if (!menuItem || !menuItem.is_available || !Number.isFinite(quantity) ||
          quantity <= 0 || quantity > 99) {
        return res.status(400).json({ error: "يوجد صنف غير متاح أو كمية غير صحيحة." });
      }
      preparedItems.push({ menuItem, quantity, notes: String(requested.notes || "").slice(0, 300) });
    }

    const subtotal = preparedItems.reduce(
      (sum, item) => sum + Math.round(item.menuItem.price_minor * item.quantity), 0
    );
    const discount = Math.round(Number(body.discount_minor || 0));
    if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) {
      return res.status(400).json({ error: "قيمة الخصم غير صحيحة." });
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const orderType = ["dine_in", "takeaway", "delivery"].includes(body.order_type)
      ? body.order_type : "takeaway";
    const orderNumber = "LOCAL-" + createdAt.replace(/\D/g, "").slice(0, 14) +
      "-" + id.slice(0, 6).toUpperCase();
    const order = {
      id, order_number: orderNumber, order_type: orderType,
      status: "pending", subtotal_minor: subtotal, discount_minor: discount,
      total_minor: subtotal - discount,
      notes: String(body.notes || "").slice(0, 1000),
      customer_name: String(body.customer_name || "").slice(0, 120),
      phone: String(body.phone || "").slice(0, 30),
      address: String(body.address || "").slice(0, 500),
      payment_method: ["cash", "card", "wallet"].includes(body.payment_method) ? body.payment_method : "cash",
      created_at: createdAt, updated_at: createdAt, sync_status: "pending"
    };

    const saveOrder = db.transaction(() => {
      db.prepare(`INSERT INTO orders
        (id, order_number, order_type, status, subtotal_minor, discount_minor,
         total_minor, notes, customer_name, phone, address, payment_method,
         created_at, updated_at, sync_status)
        VALUES (@id, @order_number, @order_type, @status, @subtotal_minor,
         @discount_minor, @total_minor, @notes, @customer_name, @phone, @address,
         @payment_method, @created_at, @updated_at, @sync_status)`
      ).run(order);

      const addLine = db.prepare(`INSERT INTO order_items
        (id, order_id, menu_item_id, item_name_snapshot, unit_price_minor,
         quantity, line_total_minor, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      preparedItems.forEach(({ menuItem, quantity, notes }) => addLine.run(
        randomUUID(), id, menuItem.id, menuItem.name, menuItem.price_minor,
        quantity, Math.round(menuItem.price_minor * quantity), notes
      ));

      db.prepare(`INSERT INTO sync_outbox
        (id, aggregate_type, aggregate_id, operation, payload_json, created_at)
        VALUES (?, 'order', ?, 'create', ?, ?)`
      ).run(randomUUID(), id, JSON.stringify({
        order,
        items: preparedItems.map(({ menuItem, quantity, notes }) => ({
          menu_item_id: menuItem.id, product_name: menuItem.name,
          unit_price_minor: menuItem.price_minor, quantity, notes
        }))
      }), createdAt);
    });

    try {
      saveOrder();
      const savedItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(id);
      const response = { ...order, items: savedItems };
      io.emit("kitchen:new-order", response);
      res.status(201).json(response);
    } catch (error) {
      res.status(500).json({ error: "تعذر حفظ الطلب محليًا: " + error.message });
    }
  });

  app.patch("/api/orders/:id/status", (req, res) => {
    const allowed = ["pending", "preparing", "ready", "delivered", "cancelled"];
    const status = req.body?.status;
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة الطلب غير صحيحة." });
    const now = new Date().toISOString();
    const result = db.prepare(
      "UPDATE orders SET status = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?"
    ).run(status, now, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "الطلب غير موجود." });
    db.prepare(`INSERT INTO sync_outbox
      (id, aggregate_type, aggregate_id, operation, payload_json, created_at)
      VALUES (?, 'order', ?, 'update_status', ?, ?)`
    ).run(randomUUID(), req.params.id, JSON.stringify({ status }), now);
    io.emit("kitchen:order-updated", { id: req.params.id, status });
    res.json({ ok: true, id: req.params.id, status });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: false }, maxHttpBufferSize: 1e6 });
  io.on("connection", (socket) => {
    socket.emit("server:ready", { service: "arkan-local", timestamp: new Date().toISOString() });
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => resolve({
      db, io, databasePath, port,
      close: () => new Promise((done) => {
        io.close();
        if (db.open) db.close();
        done();
      })
    }));
  });
}

module.exports = { startLocalServer };
