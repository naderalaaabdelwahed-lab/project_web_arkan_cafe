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
  app.use((req,res,next) => {
    const origin = req.headers.origin;
    // The renderer is loaded from file:// (serialized by Chromium as "null").
    // Do not expose the loopback POS API to arbitrary websites.
    const allowedOrigins = new Set(["null","file://","http://127.0.0.1","http://localhost"]);
    if (origin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: "Origin is not allowed." });
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
    if(req.method==="OPTIONS") return res.sendStatus(204);
    next();
  });
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
    try { const session=await supabase.signIn(email,password); await syncPendingOrders(); res.json(session); }
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



  // Protect every administration endpoint before registering any /api/admin route.
  // Previously this guard was registered after summary and CRUD routes, leaving
  // sensitive business data and records publicly readable on the local API.
  const adminModules = new Set(["reservations","business_days","cash_transactions","printers","preparation_screens","inventory_units","inventory_suppliers","inventory_items","inventory_movements","inventory_recipes","inventory_purchases","hr_employees","hr_shifts","hr_attendance","hr_leave_balances","hr_payroll_runs","hr_payroll_adjustments","hr_payroll_items","hr_employee_shift_assignments","inventory_purchase_items","inventory_recipe_items","restaurant_tables","preparation_screen_categories","audit_logs"]);
  app.get("/api/admin/records/:module", async (req,res) => {
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
        const localRows=db.prepare("SELECT id,data_json,created_at,updated_at FROM admin_records WHERE module=?").all(module);
        const tombstones=new Set(localRows.filter(row=>JSON.parse(row.data_json)._deleted===true).map(row=>String(row.id)));
        const remoteIds=new Set((remote||[]).map(row=>String(row.id)));
        const visibleRemote=(remote||[]).filter(row=>!tombstones.has(String(row.id)));
        const offline=localRows.filter(row=>!remoteIds.has(String(row.id)) && !tombstones.has(String(row.id))).map(row=>({id:row.id,...JSON.parse(row.data_json),created_at:row.created_at,updated_at:row.updated_at}));
        result=[...visibleRemote,...offline];
      } catch(error) { if(error.status===401||error.status===403) return res.status(error.status).json({error:error.message}); }
    }
    res.json(result);
  });
  app.post("/api/admin/records/:module", async (req,res) => {
    const module=req.params.module, data=req.body||{};
    if(!adminModules.has(module)) return res.status(404).json({error:"القسم غير موجود."});
    const id=randomUUID(), now=new Date().toISOString(), clean={};
    for(const [k,v] of Object.entries(data)) if(/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(k) && !["id","created_at","updated_at"].includes(k) && v!=="") clean[k]=v;
    if(!Object.keys(clean).length) return res.status(400).json({error:"أدخل بيانات السجل."});
    let saved={id,...clean,created_at:now,updated_at:now};
    let cloudPending=false;
    if(supabase.getSession().authenticated) {
      try { saved=await supabase.insertRecord(module,{id,...clean}); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); cloudPending=true; }
    }
    db.prepare("INSERT OR REPLACE INTO admin_records(module,id,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").run(module,String(saved.id||id),JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([k])=>!["id","created_at","updated_at"].includes(k)))),saved.created_at||now,saved.updated_at||now);
    if(cloudPending) db.prepare("INSERT INTO sync_outbox(id,aggregate_type,aggregate_id,operation,payload_json,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),"admin:"+module,id,"create",JSON.stringify(clean),now);
    res.status(201).json(saved);
  });
  app.patch("/api/admin/records/:module/:id", async (req,res) => {
    const module=req.params.module, data=req.body||{};
    if(!adminModules.has(module)) return res.status(404).json({error:"القسم غير موجود."});
    const old=db.prepare("SELECT data_json FROM admin_records WHERE module=? AND id=?").get(module,req.params.id);
    if(!old) return res.status(404).json({error:"السجل غير موجود."});
    const clean={...JSON.parse(old.data_json)};
    for(const [k,v] of Object.entries(data)) if(/^[a-zA-Z_][a-zA-Z0-9_]{0,60}$/.test(k) && !["id","created_at","updated_at"].includes(k) && v!=="") clean[k]=v;
    const now=new Date().toISOString();
    let saved={id:req.params.id,...clean,updated_at:now}, cloudPending=false;
    if(supabase.getSession().authenticated) {
      try { saved=await supabase.updateRecord(module,req.params.id,clean); if(!saved) return res.status(404).json({error:"السجل غير موجود في السحابة."}); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); cloudPending=true; }
    }
    db.prepare("UPDATE admin_records SET data_json=?,updated_at=? WHERE module=? AND id=?").run(JSON.stringify(clean),now,module,req.params.id);
    if(cloudPending) db.prepare("INSERT INTO sync_outbox(id,aggregate_type,aggregate_id,operation,payload_json,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),"admin:"+module,req.params.id,"update",JSON.stringify(clean),now);
    res.json(saved);
  });
  app.delete("/api/admin/records/:module/:id", async (req,res) => {
    if(!adminModules.has(req.params.module)) return res.status(404).json({error:"القسم غير موجود."});
    let cloudPending=false;
    if(supabase.getSession().authenticated) {
      try { await supabase.deleteRecord(req.params.module,req.params.id); }
      catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); cloudPending=true; }
    }
    const result=db.prepare("DELETE FROM admin_records WHERE module=? AND id=?").run(req.params.module,req.params.id);
    if(!result.changes && !supabase.getSession().authenticated) return res.status(404).json({error:"السجل غير موجود."});
    if(cloudPending) {
      const now=new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO admin_records(module,id,data_json,created_at,updated_at) VALUES(?,?,?,?,?)").run(req.params.module,req.params.id,JSON.stringify({_deleted:true}),now,now);
      db.prepare("INSERT INTO sync_outbox(id,aggregate_type,aggregate_id,operation,payload_json,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),"admin:"+req.params.module,req.params.id,"delete","{}",now);
    }
    res.json({ok:true});
  });

  app.get("/api/admin/restaurant-settings", async (_req,res) => {
    try {
      const rows=await supabase.listRecords("restaurant_settings");
      res.json(rows?.[0]||{id:1,indoor_tables:10,outdoor_tables:6,seats_per_table:4});
    } catch(error) { res.status(error.status||503).json({error:error.message}); }
  });
  app.put("/api/admin/restaurant-settings", async (req,res) => {
    const values={indoor_tables:Number(req.body?.indoor_tables),outdoor_tables:Number(req.body?.outdoor_tables),seats_per_table:Number(req.body?.seats_per_table),updated_at:new Date().toISOString()};
    if(!Number.isInteger(values.indoor_tables)||values.indoor_tables<0||!Number.isInteger(values.outdoor_tables)||values.outdoor_tables<0||!Number.isInteger(values.seats_per_table)||values.seats_per_table<1) return res.status(400).json({error:"راجع عدد الطاولات والمقاعد."});
    try { const saved=await supabase.updateRecord("restaurant_settings","1",values); res.json(saved||values); }
    catch(error) { res.status(error.status||503).json({error:error.message}); }
  });

  app.get("/api/admin/summary", async (_req,res) => {
    const count = table => db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
    let categories=count("menu_categories"), products=count("menu_items"), orders=count("orders");
    let sales=db.prepare("SELECT COALESCE(SUM(total_minor),0) AS total FROM orders WHERE status <> 'cancelled'").get().total;
    if(supabase.getSession().authenticated) {
      try {
        const [menu,remoteOrders]=await Promise.all([supabase.getAdminMenu(),supabase.getOrders()]);
        categories=(menu.categories||[]).length; products=(menu.products||[]).length;
        orders=(remoteOrders||[]).length;
        sales=Math.round((remoteOrders||[]).filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Number(o.total||0),0)*100);
      } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
    res.json({categories,products,orders,sales_minor:sales,cloud:supabase.configured});
  });
  app.use("/api/admin", (req,res,next) => {
    if(!supabase.getSession().authenticated) return res.status(401).json({error:"سجل الدخول أولاً."});
    next();
  });

  app.get("/api/admin/menu", async (_req,res) => {
    if(supabase.getSession().authenticated) {
      try {
        const remote=await supabase.getAdminMenu();
        return res.json({
          categories:(remote.categories||[]).map(c=>({id:c.id,name:c.name,sort_order:c.display_order||0,is_active:c.is_active})),
          products:(remote.products||[]).map(p=>({id:p.id,category_id:p.category_id,name:p.name,description:p.description,price_minor:Math.round(Number(p.price||0)*100),is_available:p.is_available}))
        });
      } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
    res.json({categories:db.prepare("SELECT id,name,sort_order,is_active FROM menu_categories WHERE is_active=1 ORDER BY sort_order,name").all(),products:db.prepare("SELECT id,category_id,name,description,price_minor,is_available FROM menu_items WHERE is_available=1 ORDER BY name").all()});
  });
  app.post("/api/admin/categories", async (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,100);
    if(!name)return res.status(400).json({error:"اسم الفئة مطلوب."});
    let id=randomUUID();
    try {
      if(supabase.getSession().authenticated) { const saved=await supabase.insertRecord("categories",{name,display_order:Number(req.body?.sort_order||0),is_active:true}); id=saved.id; }
      if(!supabase.getSession().authenticated) db.prepare("INSERT OR REPLACE INTO menu_categories(id,name,sort_order,is_active) VALUES(?,?,?,1)").run(id,name,Number(req.body?.sort_order||0));
      res.status(201).json({id,name});
    } catch(e){res.status(e.status||400).json({error:e.message});}
  });
  app.patch("/api/admin/categories/:id", async (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,100);
    if(!name)return res.status(400).json({error:"اسم الفئة مطلوب."});
    try {
      if(supabase.getSession().authenticated) await supabase.updateRecord("categories",req.params.id,{name,display_order:Number(req.body?.sort_order||0),is_active:req.body?.is_active!==false});
      const r=db.prepare("UPDATE menu_categories SET name=?,sort_order=?,is_active=? WHERE id=?").run(name,Number(req.body?.sort_order||0),req.body?.is_active===false?0:1,req.params.id);
      if(!r.changes && !supabase.getSession().authenticated)return res.status(404).json({error:"الفئة غير موجودة."});
      res.json({ok:true});
    } catch(e){res.status(e.status||400).json({error:e.message});}
  });
  app.post("/api/admin/products", async (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,150),category=String(req.body?.category_id||""),price=Number(req.body?.price);
    const isAvailable=req.body?.is_available!==false;
    if(!name||!category||!Number.isFinite(price)||price<0)return res.status(400).json({error:"راجع اسم المنتج والفئة والسعر."});
    let id=randomUUID();
    try {
      if(supabase.getSession().authenticated) { const saved=await supabase.insertRecord("products",{category_id:category,name,description:String(req.body?.description||""),price,is_available:isAvailable}); id=saved.id; }
      if(!supabase.getSession().authenticated) db.prepare("INSERT OR REPLACE INTO menu_items(id,category_id,name,description,price_minor,is_available) VALUES(?,?,?,?,?,?)").run(id,category,name,String(req.body?.description||""),Math.round(price*100),isAvailable?1:0);
      res.status(201).json({id,name,is_available:isAvailable});
    } catch(e){res.status(e.status||400).json({error:e.message});}
  });
  app.patch("/api/admin/products/:id", async (req,res) => {
    const name=String(req.body?.name||"").trim().slice(0,150),category=String(req.body?.category_id||""),price=Number(req.body?.price);
    if(!name||!category||!Number.isFinite(price)||price<0)return res.status(400).json({error:"راجع اسم المنتج والفئة والسعر."});
    try {
      if(supabase.getSession().authenticated) await supabase.updateRecord("products",req.params.id,{name,category_id:category,description:String(req.body?.description||"").slice(0,500),price,is_available:req.body?.is_available!==false});
      const r=db.prepare("UPDATE menu_items SET name=?,category_id=?,description=?,price_minor=?,is_available=? WHERE id=?").run(name,category,String(req.body?.description||"").slice(0,500),Math.round(price*100),req.body?.is_available===false?0:1,req.params.id);
      if(!r.changes && !supabase.getSession().authenticated)return res.status(404).json({error:"المنتج غير موجود."});
      res.json({ok:true});
    } catch(e){res.status(e.status||400).json({error:e.message});}
  });
  app.get("/api/admin/orders", async (_req,res) => {
    if(supabase.getSession().authenticated) { try { const rows=await supabase.getOrders(); return res.json((rows||[]).map(o=>({id:o.id,order_number:o.order_number,order_type:o.order_type,status:o.status,total_minor:Math.round(Number(o.total||0)*100),created_at:o.created_at,sync_status:"cloud"}))); } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); } }
    res.json(db.prepare("SELECT id,order_number,order_type,status,total_minor,created_at,sync_status FROM orders ORDER BY created_at DESC LIMIT 300").all());
  });

  app.get("/api/tables", async (_req,res) => {
    if(!supabase.getSession().authenticated) return res.json([]);
    try { return res.json(await supabase.listRecords("restaurant_tables")); }
    catch(error) { return res.status(error.status||503).json({error:error.message}); }
  });
  app.get("/api/reservations", async (_req,res) => {
    if(!supabase.getSession().authenticated) return res.json([]);
    try {
      const [reservations,tables]=await Promise.all([supabase.listRecords("reservations"),supabase.listRecords("restaurant_tables")]);
      const tableMap=new Map((tables||[]).map(t=>[String(t.id),t]));
      return res.json((reservations||[]).map(r=>{const table=tableMap.get(String(r.table_id));return {...r,area:table?.area||"indoor",table_number:r.table_number||table?.table_number||null};}));
    } catch(error) { return res.status(error.status||503).json({error:error.message}); }
  });

  app.get("/api/orders", async (_req, res) => {
    if(supabase.getSession().authenticated) {
      try {
        const remote=await supabase.getOrders();
        const remoteRows=(remote||[]).map(o=>({id:o.id,order_number:o.order_number,order_type:o.order_type,status:o.status,table_number:o.table_number,table_area:o.table_area,subtotal_minor:Math.round(Number(o.subtotal||0)*100),discount_minor:Math.round(Number(o.discount||0)*100),total_minor:Math.round(Number(o.total||0)*100),created_at:o.created_at,updated_at:o.updated_at,items:(o.order_items||[]).map(i=>({id:i.id,item_name_snapshot:i.product_name||i.item_name_snapshot||"صنف",unit_price_minor:Math.round(Number(i.unit_price||0)*100),quantity:i.quantity,line_total_minor:Math.round(Number(i.line_total ?? (Number(i.unit_price||0)*Number(i.quantity||0)))*100),notes:i.item_note||i.notes||""}))}));
        const remoteIds=new Set(remoteRows.map(o=>String(o.id)));
        const pending=db.prepare("SELECT * FROM orders WHERE sync_status <> 'synced' ORDER BY created_at DESC").all();
        const getLocalItems=db.prepare("SELECT * FROM order_items WHERE order_id=?");
        const localRows=pending.filter(o=>!remoteIds.has(String(o.id))).map(o=>({...o,items:getLocalItems.all(o.id)}));
        return res.json([...remoteRows,...localRows]);
      } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
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
      table_id: body.table_id ? String(body.table_id) : null,
      table_number: body.table_number != null && body.table_number !== "" && Number.isInteger(Number(body.table_number)) && Number(body.table_number) > 0 ? Number(body.table_number) : null,
      table_area: ["indoor","outdoor"].includes(body.table_area) ? body.table_area : null,
      payment_method: ["cash", "card", "wallet"].includes(body.payment_method) ? body.payment_method : "cash",
      created_at: createdAt, updated_at: createdAt, sync_status: "pending"
    };

    const saveOrder = db.transaction(() => {
      db.prepare(`INSERT INTO orders
        (id, order_number, order_type, status, subtotal_minor, discount_minor,
         total_minor, notes, customer_name, phone, address, table_id, table_number,
         table_area, payment_method, created_at, updated_at, sync_status)
        VALUES (@id, @order_number, @order_type, @status, @subtotal_minor,
         @discount_minor, @total_minor, @notes, @customer_name, @phone, @address,
         @table_id, @table_number, @table_area, @payment_method, @created_at, @updated_at, @sync_status)`
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

  app.patch("/api/orders/:id/status", async (req, res) => {
    const allowed = ["pending", "preparing", "ready", "delivered", "cancelled"];
    const status = req.body?.status;
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة الطلب غير صحيحة." });
    const now = new Date().toISOString();
    if(supabase.getSession().authenticated) {
      try {
        const remote=await supabase.updateRecord("orders",req.params.id,{status,updated_at:now});
        if(remote) {
          db.prepare("UPDATE orders SET status=?,updated_at=?,sync_status='synced' WHERE id=?").run(status,now,req.params.id);
          io.emit("kitchen:order-updated",{id:req.params.id,status});
          return res.json({ok:true,id:req.params.id,status,sync_status:"cloud"});
        }
        // A local order may still be waiting for its first cloud insert.
        // Keep the status change in SQLite/outbox instead of losing the action.
        const local=db.prepare("SELECT id FROM orders WHERE id=?").get(req.params.id);
        if(!local) return res.status(404).json({error:"الطلب غير موجود."});
      } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); }
    }
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

  async function syncPendingOrders() {
    if(!supabase.getSession().authenticated) return;
    const pending=db.prepare("SELECT * FROM sync_outbox WHERE synced_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now')) ORDER BY created_at LIMIT 25").all();
    for(const task of pending) {
      try {
        const payload=JSON.parse(task.payload_json);
        if(task.operation==="create") {
          const order=payload.order;
          let remote=await supabase.getRecord("orders",task.aggregate_id);
          if(!remote) remote=await supabase.insertRecord("orders",{
            id:order.id,order_type:order.order_type,status:order.status,
            subtotal:Number(order.subtotal_minor||0)/100,discount:Number(order.discount_minor||0)/100,
            delivery_fee:0,total:Number(order.total_minor||0)/100,notes:order.notes||null,
            customer_name:order.customer_name||null,customer_phone:order.phone||null,
            delivery_address:order.address||null,payment_method:order.payment_method||"cash",
            table_id:order.table_id||null,table_number:order.table_number||null,table_area:order.table_area||null,
            created_at:order.created_at,updated_at:order.updated_at
          });
          const remoteItems=await supabase.getOrderItems(task.aggregate_id);
          if(!remoteItems.length && payload.items?.length) await supabase.insertMany("order_items",payload.items.map(item=>({
            order_id:task.aggregate_id,product_id:item.menu_item_id,
            product_name:item.product_name,unit_price:Number(item.unit_price_minor||0)/100,
            quantity:Math.round(Number(item.quantity)),item_note:item.notes||null
          })));
          db.prepare("UPDATE orders SET order_number=?,sync_status='synced',updated_at=? WHERE id=?").run(String(remote.order_number),new Date().toISOString(),task.aggregate_id);
        } else if(task.operation==="update_status") {
          const localOrder=db.prepare("SELECT sync_status FROM orders WHERE id=?").get(task.aggregate_id);
          // Do not mark a status update as synced while the order itself has
          // not yet been created in the cloud.
          if(localOrder && localOrder.sync_status!=="synced") {
            throw new Error("Order creation is still waiting to sync.");
          }
          const updated=await supabase.updateRecord("orders",task.aggregate_id,{status:payload.status,updated_at:new Date().toISOString()});
          if(!updated) throw new Error("Cloud order does not exist yet.");
          db.prepare("UPDATE orders SET sync_status='synced' WHERE id=?").run(task.aggregate_id);
        } else if(task.aggregate_type.startsWith("admin:")) {
          const module=task.aggregate_type.slice(6);
          if(task.operation==="create") {
            const existing=await supabase.getRecord(module,task.aggregate_id);
            if(!existing) await supabase.insertRecord(module,{id:task.aggregate_id,...payload});
          } else if(task.operation==="update") {
            await supabase.updateRecord(module,task.aggregate_id,payload);
          } else if(task.operation==="delete") {
            await supabase.deleteRecord(module,task.aggregate_id);
            db.prepare("DELETE FROM admin_records WHERE module=? AND id=?").run(module,task.aggregate_id);
          }
        }
        db.prepare("UPDATE sync_outbox SET synced_at=?,last_error=NULL,next_attempt_at=NULL WHERE id=?").run(new Date().toISOString(),task.id);
      } catch(error) {
        db.prepare("UPDATE sync_outbox SET attempts=attempts+1,last_error=?,next_attempt_at=datetime('now','+30 seconds') WHERE id=?").run(String(error.message||error).slice(0,1000),task.id);
      }
    }
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: false }, maxHttpBufferSize: 1e6 });
  const syncTimer=setInterval(()=>syncPendingOrders().catch(()=>{}),15000);
  syncTimer.unref?.();
  io.on("connection", (socket) => {
    socket.emit("server:ready", { service: "egsoft-local", timestamp: new Date().toISOString() });
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => resolve({
      db, io, databasePath, port: httpServer.address().port,
      close: async () => {
        clearInterval(syncTimer);
        await new Promise((done) => io.close(done));
        if (db.open) db.close();
      }
    }));
  });
}

module.exports = { startLocalServer };
