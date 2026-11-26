const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");
const { randomUUID } = require("node:crypto");
const { openDatabase } = require("./database.cjs");
const { createSupabaseRestClient } = require("./supabase.cjs");

function startLocalServer({ userDataPath, port = 4317 }) {
  const { db, databasePath } = openDatabase(userDataPath);
  const app = express();
  const supabase = createSupabaseRestClient();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "egsoft-local",
      version: "0.2.0",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  });


  app.get("/api/auth/session", (_req,res) => res.json(supabase.getSession()));
  app.post("/api/auth/login", async (req,res) => {
    const email=String(req.body?.email||"").trim(), password=String(req.body?.password||"");
    if(!email||!password) return res.status(400).json({error:"أدخل البريد الإلكتروني وكلمة المرور."});
    try { res.json(await supabase.signIn(email,password)); }
    catch(error) { res.status(401).json({error:error.message}); }
  });
  app.post("/api/auth/logout", async (_req,res) => res.json(await supabase.signOut()));
  app.get("/api/cloud/status", async (_req, res) => {
    const status = await supabase.getStatus();
    res.status(status.connected || !status.configured ? 200 : 503).json(status);
  });

  app.get("/api/menu", async (_req, res) => {
    let source = "local";
    let cloudError = null;
    if (supabase.configured) {
      try {
        const remote = await supabase.getMenu();
        const syncMenu = db.transaction(() => {
          const addCategory = db.prepare(
            "INSERT INTO menu_categories (id, name, sort_order, is_active, updated_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort_order=excluded.sort_order, is_active=1, updated_at=excluded.updated_at"
          );
          const addItem = db.prepare(
            "INSERT INTO menu_items (id, category_id, name, description, price_minor, is_available, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id, name=excluded.name, description=excluded.description, price_minor=excluded.price_minor, is_available=1, updated_at=excluded.updated_at"
          );
          const now = new Date().toISOString();
          remote.categories.forEach((category, index) => addCategory.run(
            String(category.id), String(category.name), index, now
          ));
          remote.products.forEach((product) => addItem.run(
            String(product.id), String(product.category_id), String(product.name),
            product.description || null, Math.round(Number(product.price) * 100), now
          ));
          const categoryIds = remote.categories.map((category) => String(category.id));
          if (categoryIds.length) {
            const placeholders = categoryIds.map(() => "?").join(",");
            db.prepare("UPDATE menu_categories SET is_active=0 WHERE id NOT IN (" + placeholders + ")").run(...categoryIds);
          }
          const productIds = remote.products.map((product) => String(product.id));
          if (productIds.length) {
            const placeholders = productIds.map(() => "?").join(",");
            db.prepare("UPDATE menu_items SET is_available=0 WHERE id NOT IN (" + placeholders + ")").run(...productIds);
          }
        });
        syncMenu();
        source = "supabase";
      } catch (error) {
        cloudError = error.message;
      }
    }
    const categories = db.prepare(
      "SELECT id, name, sort_order FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, name"
    ).all();
    const items = db.prepare(
      "SELECT id, category_id, name, description, price_minor, is_available FROM menu_items WHERE is_available = 1 ORDER BY name"
    ).all();
    res.json({ categories, items, source, cloudError });
  });

  // Import a menu snapshot exported from the existing menu admin system.
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



  const adminModules = new Set(["reservations","business_days","cash_transactions","printers","preparation_screens","inventory_units","inventory_suppliers","inventory_items","inventory_movements","inventory_recipes","inventory_purchases","hr_employees","hr_shifts","hr_attendance","hr_leave_balances","hr_payroll_runs","audit_logs"]);
  app.get("/api/admin/records/:module", (req,res) => {
    const module=req.params.module;
    if(!adminModules.has(module)) return res.status(404).json({error:"القسم غير موجود."});
    const rows=db.prepare("SELECT id,data_json,created_at,updated_at FROM admin_records WHERE module=? ORDER BY updated_at DESC").all(module);
    let result=rows.map(r=>({id:r.id,...JSON.parse(r.data_json),created_at:r.created_at,updated_at:r.updated_at}));
    if(supabase.getSession().authenticated) {
      try {
        const remote=await supabase.listRecords(module);
        const replace=db.transaction(()=>{
          const add=db.prepare("INSERT OR REPLACE INTO admin_records(module,id,data_json,created_at,updated_at) VALUES(?,?,?,?,?)");
          for(const row of remote||[]) { const {id,created_at,updated_at,...data}=row; add.run(module,String(id),JSON.stringify(data),created_at||new Date().toISOString(),updated_at||new Date().toISOString()); }
        });
        replace();
        const remoteIds=new Set((remote||[]).map(row=>String(row.id)));
        const offline= db.prepare("SELECT id,data_json,created_at,updated_at FROM admin_records WHERE module=?").all(module).filter(row=>!remoteIds.has(String(row.id))).map(row=>({id:row.id,...JSON.parse(row.data_json),created_at:row.created_at,updated_at:row.updated_at}));
        result=[...(remote||[]),...offline];
      } catch(error) { if(error.status===401||error.status===403) return res.status(error.status).json({error:error.message}); }
    }
    res.json(result);
  });
  app.post("/api/admin/records/:module", (req,res) => {
    const module=req.params.module, data=req.body||{};
    if(!adminModules.has(module)) return res.status(404).json({error:"القسم غير موجود."});
    const id=randomUUID(), now=new Date().toISOString(), clean={};
    for(const [k,v] of Object.entries(data)) if(/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(k) && !["id","created_at","updated_at"].includes(k)) clean[k]=v;
    if(!Object.keys(clean).length) return res.status(400).json({error:"أدخل بيانات السجل."});
    let saved={id,...clean,created_at:now,updated_at:now};
    if(supabase.getSession().authenticated) {
      try { saved=await supabase.insertRecord(module,clean); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
    db.prepare("INSERT OR REPLACE INTO admin_records(module,id,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").run(module,String(saved.id||id),JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([k])=>!["id","created_at","updated_at"].includes(k)))),saved.created_at||now,saved.updated_at||now);
    res.status(201).json(saved);
  });
  app.patch("/api/admin/records/:module/:id", (req,res) => {
    const module=req.params.module, data=req.body||{};
    if(!adminModules.has(module)) return res.status(404).json({error:"القسم غير موجود."});
    const old=db.prepare("SELECT data_json FROM admin_records WHERE module=? AND id=?").get(module,req.params.id);
    if(!old) return res.status(404).json({error:"السجل غير موجود."});
    const clean={...JSON.parse(old.data_json)};
    for(const [k,v] of Object.entries(data)) if(/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(k) && !["id","created_at","updated_at"].includes(k)) clean[k]=v;
    const now=new Date().toISOString();
    let saved={id:req.params.id,...clean,updated_at:now};
    if(supabase.getSession().authenticated) {
      try { saved=await supabase.updateRecord(module,req.params.id,data); if(!saved) return res.status(404).json({error:"السجل غير موجود في السحابة."}); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
    db.prepare("UPDATE admin_records SET data_json=?,updated_at=? WHERE module=? AND id=?").run(JSON.stringify(clean),now,module,req.params.id);
    res.json(saved);
  });
  app.delete("/api/admin/records/:module/:id", (req,res) => {
    if(!adminModules.has(req.params.module)) return res.status(404).json({error:"القسم غير موجود."});
    if(supabase.getSession().authenticated) {
      try { await supabase.deleteRecord(req.params.module,req.params.id); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
    const result=db.prepare("DELETE FROM admin_records WHERE module=? AND id=?").run(req.params.module,req.params.id);
    if(!result.changes && !supabase.getSession().authenticated) return res.status(404).json({error:"السجل غير موجود."});
    res.json({ok:true});
  });

  app.get("/api/admin/summary", (_req,res) => {
    const count = table => db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
    const sales = db.prepare("SELECT COALESCE(SUM(total_minor),0) AS total FROM orders WHERE status <> 'cancelled'").get().total;
    res.json({categories:count("menu_categories"),products:count("menu_items"),orders:count("orders"),sales_minor:sales,cloud:supabase.configured});
  });
  app.get("/api/admin/menu", (_req,res) => res.json({
    categories:db.prepare("SELECT id,name,sort_order,is_active FROM menu_categories WHERE is_active=1 ORDER BY sort_order,name").all(),
    products:db.prepare("SELECT id,category_id,name,description,price_minor,is_available FROM menu_items WHERE is_available=1 ORDER BY name").all()
  }));
  app.post("/api/admin/categories", (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,100);
    if(!name)return res.status(400).json({error:"اسم الفئة مطلوب."});
    const id=randomUUID();
    try{db.prepare("INSERT INTO menu_categories(id,name,sort_order,is_active) VALUES(?,?,?,1)").run(id,name,Number(req.body?.sort_order||0));res.status(201).json({id,name});}
    catch(e){res.status(400).json({error:e.message});}
  });
  app.patch("/api/admin/categories/:id", (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,100);
    if(!name)return res.status(400).json({error:"اسم الفئة مطلوب."});
    const r=db.prepare("UPDATE menu_categories SET name=?,sort_order=?,is_active=? WHERE id=?").run(name,Number(req.body?.sort_order||0),req.body?.is_active===false?0:1,req.params.id);
    if(!r.changes)return res.status(404).json({error:"الفئة غير موجودة."});res.json({ok:true});
  });
  app.post("/api/admin/products", (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,150),category=String(req.body?.category_id||""),price=Number(req.body?.price);
    if(!name||!category||!Number.isFinite(price)||price<0)return res.status(400).json({error:"راجع اسم المنتج والفئة والسعر."});
    const id=randomUUID();
    try{db.prepare("INSERT INTO menu_items(id,category_id,name,description,price_minor,is_available) VALUES(?,?,?,?,?,1)").run(id,category,name,String(req.body?.description||"").slice(0,500),Math.round(price*100));res.status(201).json({id,name});}
    catch(e){res.status(400).json({error:e.message});}
  });
  app.patch("/api/admin/products/:id", (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,150),category=String(req.body?.category_id||""),price=Number(req.body?.price);
    if(!name||!category||!Number.isFinite(price)||price<0)return res.status(400).json({error:"راجع اسم المنتج والفئة والسعر."});
    const r=db.prepare("UPDATE menu_items SET name=?,category_id=?,description=?,price_minor=?,is_available=? WHERE id=?").run(name,category,String(req.body?.description||"").slice(0,500),Math.round(price*100),req.body?.is_available===false?0:1,req.params.id);
    if(!r.changes)return res.status(404).json({error:"المنتج غير موجود."});res.json({ok:true});
  });
  app.get("/api/admin/orders", (_req,res) => res.json(db.prepare("SELECT id,order_number,order_type,status,total_minor,created_at,sync_status FROM orders ORDER BY created_at DESC LIMIT 300").all()));

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
    socket.emit("server:ready", { service: "egsoft-local", timestamp: new Date().toISOString() });
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
