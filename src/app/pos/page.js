"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const tabs = [
  { id: "dine-in", label: "الصالة" },
  { id: "takeaway", label: "تيك أواي" },
  { id: "delivery", label: "دليفري" },
  { id: "all", label: "الكل" },
];
const fmt = (n) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

export default function PosPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("dine-in");
  const [screen, setScreen] = useState("tables");
  const [mode, setMode] = useState("dine-in");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderTypeFilter, setOrderTypeFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [orderTableFilter, setOrderTableFilter] = useState("");
  const [reservations, setReservations] = useState([]);
  const [settings, setSettings] = useState({ indoor_tables: 0, outdoor_tables: 0 });
  const [area, setArea] = useState("indoor");
  const [table, setTable] = useState(null);
  const [reservationId, setReservationId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrderTotal, setEditingOrderTotal] = useState(null);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [payment, setPayment] = useState("cash");

  const load = useCallback(async () => {
    setError("");
    try {
      const [adminResult, permissionResult] = await Promise.all([
        supabase.rpc("is_admin"),
        supabase.rpc("has_permission", { requested_permission: "pos.use" }),
      ]);
      if (adminResult.error) throw adminResult.error;
      if (permissionResult.error) throw permissionResult.error;
      const canUse = Boolean(adminResult.data || permissionResult.data);
      setAllowed(canUse);
      if (!canUse) return;

      const [p, c, st, r] = await Promise.all([
        supabase.from("products").select("id,name,price,image_url,category_id,is_available").eq("is_available", true).order("name"),
        supabase.from("categories").select("id,name,display_order").eq("is_active", true).order("display_order"),
        supabase.from("restaurant_settings").select("indoor_tables,outdoor_tables").eq("id", 1).single(),
        supabase.from("reservations").select("id,customer_name,phone,reservation_date,reservation_time,status,seating_area,table_number").in("status", ["pending","confirmed"]),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      if (st.error) throw st.error;
      if (r.error) throw r.error;
      setProducts(p.data || []);
      setCategories(c.data || []);
      setSettings(st.data || { indoor_tables: 0, outdoor_tables: 0 });
      const today = new Date().toLocaleDateString("en-CA");
      setReservations((r.data || []).filter((x) => x.reservation_date === today));
      const allOrders = [];
      for (let from = 0; ; from += 1000) {
        const result = await supabase.from("orders").select("*,order_items(*)").order("created_at", { ascending: false }).range(from, from + 999);
        if (result.error) throw result.error;
        allOrders.push(...(result.data || []));
        if (!result.data || result.data.length < 1000) break;
      }
      setOrders(allOrders);
    } catch (e) {
      setError("تعذر تحميل شاشة الكاشير: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase.channel("arkan-pos")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const subtotal = useMemo(() => cart.reduce((sum, x) => sum + x.price * x.quantity, 0), [cart]);
  const newItemsSubtotal = useMemo(() => cart.reduce((sum, x) => sum + x.price * (x.quantity - (x.originalQuantity || 0)), 0), [cart]);
  const discount = Math.min(subtotal, discountType === "percent" ? subtotal * Math.min(100, Math.max(0, Number(discountValue) || 0)) / 100 : Math.max(0, Number(discountValue) || 0));
  const total = Math.max(0, subtotal - discount);
  const productsShown = products.filter((p) => (category === "all" || String(p.category_id) === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const allOrdersFiltered = orders.filter((o) => {
    const query = orderSearch.trim().toLowerCase();
    const created = o.created_at ? new Date(o.created_at) : null;
    const orderDate = created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString("en-CA") : "";
    const matchesSearch = !query || [String(o.id), `ark-${o.id}`, o.customer_name || "", o.phone || "", String(o.table_number || "")].some((v) => v.toLowerCase().includes(query));
    const matchesType = orderTypeFilter === "all" || o.order_type === orderTypeFilter;
    const matchesStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
    const matchesFrom = !orderDateFrom || orderDate >= orderDateFrom;
    const matchesTo = !orderDateTo || orderDate <= orderDateTo;
    const matchesTable = !orderTableFilter || (o.order_type === "dine-in" && String(o.table_number || "") === orderTableFilter.trim());
    return matchesSearch && matchesType && matchesStatus && matchesFrom && matchesTo && matchesTable;
  });
  const activeTables = orders.filter((o) => o.order_type === "dine-in" && !["delivered","cancelled"].includes(o.status));

  function add(p) {
    setCart((old) => {
      const found = old.find((x) => x.product_id === p.id);
      return found
        ? old.map((x) => x.cartKey === found.cartKey ? { ...x, quantity: x.quantity + 1 } : x)
        : [...old, { cartKey: "new-" + p.id, product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, originalQuantity: 0, note: "" }];
    });
  }
  function qty(cartKey, delta) {
    setCart((old) => old.map((x) => x.cartKey === cartKey
      ? { ...x, quantity: Math.max(x.originalQuantity || 0, x.quantity + delta) }
      : x).filter((x) => x.quantity > 0));
  }
  function reset() {
    setCart([]); setCustomer(""); setPhone(""); setAddress(""); setNotes("");
    setDiscountValue("0"); setTable(null); setReservationId(null);
    setEditingOrderId(null); setEditingOrderTotal(null);
  }
  function openTable(n, selectedArea) {
    const currentOrder = activeTables.find((o) => o.table_number === n && o.table_area === selectedArea);
    const booking = reservations.find((r) => r.table_number === n && (r.seating_area || "indoor") === selectedArea);
    reset();
    setArea(selectedArea);
    setTable(n);
    setMode("dine-in");
    setTab("dine-in");
    setScreen("order");
    if (currentOrder) {
      setEditingOrderId(currentOrder.id);
      setEditingOrderTotal(Number(currentOrder.total_amount || 0));
      setCart((currentOrder.order_items || []).map((item) => ({
        cartKey: "existing-" + item.id,
        product_id: item.product_id,
        name: item.product_name,
        price: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 0),
        originalQuantity: Number(item.quantity || 0),
        note: item.item_note || "",
        existing: true,
      })));
      setCustomer(currentOrder.customer_name || "");
      setPhone(currentOrder.phone || "");
      setNotes(currentOrder.notes || "");
      setReservationId(currentOrder.reservation_id || null);
    } else {
      setReservationId(booking ? booking.id : null);
      if (booking) { setCustomer(booking.customer_name || ""); setPhone(booking.phone || ""); }
    }
  }
  async function checkout() {
    if (!cart.length) return setError("اختار أصناف الأول.");
    if (mode === "dine-in" && !table) return setError("اختار الطاولة الأول.");
    if (mode === "delivery" && !address.trim()) return setError("اكتب عنوان التوصيل.");
    setSaving(true); setError(""); setMessage("");
    try {
      if (editingOrderId) {
        const additions = cart
          .map((x) => ({ product_id: x.product_id, quantity: x.quantity - (x.originalQuantity || 0), note: x.note }))
          .filter((x) => x.quantity > 0);
        if (!additions.length) throw new Error("أضف صنفًا جديدًا أو زوّد كمية صنف قبل الحفظ.");
        const result = await supabase.rpc("append_pos_order_items", {
          p_order_id: editingOrderId,
          p_items: additions,
        });
        if (result.error) throw result.error;
        setMessage("تمت إضافة الأصناف إلى نفس الأوردر ARK-" + editingOrderId + " بنجاح.");
        reset();
        setScreen("tables");
        await load();
        return;
      }
      const result = await supabase.rpc("create_pos_order", {
        p_order_type: mode,
        p_items: cart.map((x) => ({ product_id: x.product_id, quantity: x.quantity, note: x.note })),
        p_table_number: mode === "dine-in" ? table : null,
        p_table_area: mode === "dine-in" ? area : null,
        p_customer_name: customer || null,
        p_phone: phone || null,
        p_address: address || null,
        p_notes: notes || null,
        p_reservation_id: reservationId,
        p_discount_type: discountType,
        p_discount_value: Number(discountValue) || 0,
        p_payments: total > 0 ? [{ method: payment, amount: Number(total.toFixed(2)) }] : [],
      });
      if (result.error) throw result.error;
      setMessage("تم إنشاء الطلب رقم ARK-" + result.data + " وإرساله للتجهيز.");
      reset();
      if (mode === "dine-in") setScreen("tables");
      await load();
    } catch (e) {
      setError("فشل إنشاء الطلب: " + e.message);
    } finally { setSaving(false); }
  }

  if (loading) return <main dir="rtl" className="arkan-pos-page" style={s.page}>جاري تحميل ARKAN POS...</main>;
  if (!allowed) return <main dir="rtl" className="arkan-pos-page" style={s.page}><h2>شاشة الكاشير</h2><p>ليس لديك صلاحية pos.use. اطلب من المدير تفعيلها لحسابك.</p></main>;

  return (
    <main dir="rtl" className="arkan-pos-page" style={s.page}>
      <style jsx global>{`.arkan-pos-page input,.arkan-pos-page textarea,.arkan-pos-page select{color:#000!important;-webkit-text-fill-color:#000!important;background-color:#fff!important;caret-color:#000!important;opacity:1!important}.arkan-pos-page input::placeholder,.arkan-pos-page textarea::placeholder{color:#555!important;-webkit-text-fill-color:#555!important;opacity:1!important}.arkan-pos-page select option{color:#000!important;background:#fff!important}.arkan-pos-page input:-webkit-autofill,.arkan-pos-page input:-webkit-autofill:hover,.arkan-pos-page input:-webkit-autofill:focus{ -webkit-text-fill-color:#000!important;box-shadow:0 0 0 1000px #fff inset!important;caret-color:#000!important}.arkan-pos-page .pos-filter-control{font-weight:600}.arkan-pos-page input::-webkit-calendar-picker-indicator{opacity:1}`}</style>
      <header style={s.header}>
        <div><small style={s.eyebrow}>ARKAN POS WEB</small><h1 style={{ margin: "5px 0" }}>نقطة البيع</h1><small style={s.muted}>إدارة الصالة والتيك أواي والدليفري</small></div>
        <button style={s.secondary} onClick={load}>تحديث البيانات</button>
      </header>
      {error && <p style={s.error}>{error}</p>}
      {message && <p style={s.success}>{message}</p>}
      <nav style={s.tabs}>{tabs.map((t) => <button key={t.id} style={{ ...s.tab, ...(tab === t.id ? s.selectedTab : {}) }} onClick={() => { setTab(t.id); if (t.id !== "all") { setMode(t.id); setScreen(t.id === "dine-in" ? "tables" : "order"); } }}>{t.label}</button>)}</nav>
      {tab === "all" ? (
        <section style={s.allOrdersPage}>
          <div style={s.allOrdersHeading}>
            <div><h2 style={{margin:"0 0 5px"}}>كل الطلبات</h2><small style={s.muted}>عرض شامل لكل الطلبات المسجلة، وليس يوم العمل الحالي فقط</small></div>
            <b>{allOrdersFiltered.length} / {orders.length} طلب</b>
          </div>
          <div style={s.orderFilters}>
            <input className="pos-filter-control" style={s.filterInput} placeholder="بحث برقم الأوردر أو الفاتورة أو العميل أو الطاولة" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} />
            <select className="pos-filter-control" style={s.filterInput} value={orderTypeFilter} onChange={e=>setOrderTypeFilter(e.target.value)}><option value="all">كل الأنواع</option><option value="dine-in">الصالة</option><option value="takeaway">تيك أواي</option><option value="delivery">دليفري</option></select>
            <select className="pos-filter-control" style={s.filterInput} value={orderStatusFilter} onChange={e=>setOrderStatusFilter(e.target.value)}><option value="all">كل الحالات</option><option value="pending">جديد</option><option value="confirmed">مؤكد</option><option value="preparing">قيد التحضير</option><option value="delivered">تم التسليم / مغلق</option><option value="cancelled">ملغي</option></select>
            <input className="pos-filter-control" style={s.filterInput} type="date" aria-label="من تاريخ" value={orderDateFrom} onChange={e=>setOrderDateFrom(e.target.value)} />
            <input className="pos-filter-control" style={s.filterInput} type="date" aria-label="إلى تاريخ" value={orderDateTo} onChange={e=>setOrderDateTo(e.target.value)} />
            <input className="pos-filter-control" style={s.filterInput} type="number" min="1" placeholder="رقم الطاولة" value={orderTableFilter} onChange={e=>setOrderTableFilter(e.target.value)} />
            <button style={s.secondary} onClick={()=>{setOrderSearch("");setOrderTypeFilter("all");setOrderStatusFilter("all");setOrderDateFrom("");setOrderDateTo("");setOrderTableFilter("");}}>مسح الفلاتر</button>
          </div>
          <div style={s.ordersTableWrap}>
            <table style={s.ordersTable}>
              <thead>
                <tr>
                  <th style={s.ordersTh}>رقم الأوردر</th>
                  <th style={s.ordersTh}>رقم الفاتورة</th>
                  <th style={s.ordersTh}>التاريخ</th>
                  <th style={s.ordersTh}>الساعة</th>
                  <th style={s.ordersTh}>النوع</th>
                  <th style={s.ordersTh}>الطاولة</th>
                  <th style={s.ordersTh}>حالة الطاولة</th>
                  <th style={s.ordersTh}>حالة الطلب</th>
                  <th style={s.ordersTh}>الخصم</th>
                  <th style={s.ordersTh}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {allOrdersFiltered.map(o => {
                  const dineIn = o.order_type === "dine-in";
                  const closed = ["delivered","cancelled"].includes(o.status);
                  const typeLabel = dineIn ? "صالة" : o.order_type === "takeaway" ? "تيك أواي" : "دليفري";
                  const statusLabel = ({pending:"جديد",confirmed:"مؤكد",preparing:"قيد التحضير",delivered:"تم التسليم",cancelled:"ملغي"})[o.status] || o.status || "غير محدد";
                  const created = o.created_at ? new Date(o.created_at) : null;
                  return <tr key={o.id}>
                    <td style={s.ordersTd}><b>#{o.id}</b></td>
                    <td style={s.ordersTd}>ARK-{o.id}</td>
                    <td style={s.ordersTd}>{created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString("ar-EG") : "—"}</td>
                    <td style={s.ordersTd}>{created && !Number.isNaN(created.getTime()) ? created.toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                    <td style={s.ordersTd}>{typeLabel}</td>
                    <td style={s.ordersTd}>{dineIn ? o.table_number || "—" : "—"}</td>
                    <td style={s.ordersTd}>{dineIn ? <b style={{color:closed?"#267447":"#a66a19"}}>{closed ? "مغلقة" : "مفتوحة"}</b> : "—"}</td>
                    <td style={s.ordersTd}>{statusLabel}</td>
                    <td style={s.ordersTd}>{fmt(Number(o.discount_amount ?? 0))} ج.م</td>
                    <td style={{...s.ordersTd,fontWeight:800,color:"#267447"}}>{fmt(o.total_amount)} ج.م</td>
                  </tr>;
                })}
                {!allOrdersFiltered.length && <tr><td style={s.ordersTd} colSpan={10}>لا توجد طلبات مطابقة للفلاتر.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : mode === "dine-in" && screen === "tables" ? (
        <section style={s.panel}>
          <div style={s.head}>
            <div><h2>اختار الطاولة</h2><small style={s.muted}>اختار طاولة لفتح المنيو وإنشاء الطلب</small></div>
            <b>{Number(settings.indoor_tables || 0) + Number(settings.outdoor_tables || 0)} طاولة</b>
          </div>
          <div style={s.tableSection}>
            <h3>الطاولات الداخلية ({Number(settings.indoor_tables || 0)})</h3>
            <div style={s.fullTableGrid}>
              {Array.from({length:Number(settings.indoor_tables)||0},(_,i)=>i+1).map(n => {
                const occupied = activeTables.some(o => o.table_number === n && o.table_area === "indoor");
                const reserved = reservations.some(r => r.table_number === n && (r.seating_area || "indoor") === "indoor");
                return <button key={"indoor-"+n} onClick={() => openTable(n, "indoor")} style={{...s.tableTile,...(occupied?s.occupiedTile:{}),...(reserved&&!occupied?s.reservedTile:{})}}>
                  <b>{n}</b><small>{occupied ? "مشغولة" : reserved ? "محجوزة" : "متاحة"}</small>
                </button>;
              })}
              {!Number(settings.indoor_tables) && <small style={s.muted}>لا توجد طاولات داخلية محددة.</small>}
            </div>
          </div>
          <div style={s.tableSection}>
            <h3>الطاولات الخارجية ({Number(settings.outdoor_tables || 0)})</h3>
            <div style={s.fullTableGrid}>
              {Array.from({length:Number(settings.outdoor_tables)||0},(_,i)=>i+1).map(n => {
                const occupied = activeTables.some(o => o.table_number === n && o.table_area === "outdoor");
                const reserved = reservations.some(r => r.table_number === n && r.seating_area === "outdoor");
                return <button key={"outdoor-"+n} onClick={() => openTable(n, "outdoor")} style={{...s.tableTile,...(occupied?s.occupiedTile:{}),...(reserved&&!occupied?s.reservedTile:{})}}>
                  <b>{n}</b><small>{occupied ? "مشغولة" : reserved ? "محجوزة" : "متاحة"}</small>
                </button>;
              })}
              {!Number(settings.outdoor_tables) && <small style={s.muted}>لا توجد طاولات خارجية محددة.</small>}
            </div>
          </div>
          <div style={s.legend}><span>🟢 متاحة</span><span>🔴 مشغولة</span><span>🟡 محجوزة</span></div>
        </section>
      ) : (
        <div style={s.orderWorkspace}>
          <aside style={s.menuSidebar}>
            <div style={s.menuSidebarHead}>
              <div><h2>المنيو</h2><small style={s.muted}>اضغط على الصنف لإضافته</small></div>
              <input style={s.search} placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={s.categories}>
              <button style={s.category} onClick={() => setCategory("all")}>الكل</button>
              {categories.map(c => <button key={c.id} style={s.category} onClick={() => setCategory(String(c.id))}>{c.name}</button>)}
            </div>
            <div style={s.products}>
              {productsShown.map(p => <button key={p.id} style={s.product} onClick={() => add(p)}>
                {p.image_url ? <img src={p.image_url} alt="" style={s.image} /> : <span style={s.imageBlank}>＋</span>}
                <b>{p.name}</b><small>{fmt(p.price)} ج.م</small>
              </button>)}
              {!productsShown.length && <p>لا توجد أصناف.</p>}
            </div>
          </aside>
          <section style={s.orderPanel}>
            <div style={s.head}>
              <div><h2>{editingOrderId ? "تعديل الأوردر الحالي #" + editingOrderId : "الطلب الحالي"}</h2><small style={s.muted}>{mode === "dine-in" ? (area === "indoor" ? "طاولة داخلية " : "طاولة خارجية ") + table : mode === "takeaway" ? "تيك أواي" : "دليفري"}</small></div>
              <div style={{display:"flex",gap:7}}>
                {mode === "dine-in" && <button style={s.secondary} onClick={() => setScreen("tables")}>رجوع للطاولات</button>}
                <button style={s.clear} onClick={reset}>مسح الطلب</button>
              </div>
            </div>
            {mode === "delivery" && <input style={s.field} placeholder="عنوان التوصيل *" value={address} onChange={e=>setAddress(e.target.value)} />}
            <div style={s.cart}>{cart.map(x => <div key={x.id} style={s.cartItem}>
              <div style={s.head}><div><b>{x.name}</b><small style={s.muted}> {fmt(x.price)} ج.م</small></div><b>{fmt(x.price*x.quantity)} ج.م</b></div>
              <div style={s.head}><div style={s.qty}><button disabled={x.existing && x.quantity <= x.originalQuantity} onClick={() => qty(x.cartKey,-1)}>−</button><b>{x.quantity}</b><button onClick={() => qty(x.cartKey,1)}>+</button></div><input style={s.note} placeholder="ملاحظة للصنف" value={x.note} disabled={x.existing} onChange={e => setCart(old => old.map(i => i.cartKey === x.cartKey ? {...i,note:e.target.value} : i))} /></div>
            </div>)}{!cart.length && <p style={s.empty}>السلة فارغة — اختار أصناف من المنيو.</p>}</div>
            <div style={s.fields}>
              <input style={s.field} placeholder="اسم العميل (اختياري)" value={customer} onChange={e=>setCustomer(e.target.value)} />
              <input style={s.field} placeholder="رقم الموبايل (اختياري)" value={phone} onChange={e=>setPhone(e.target.value)} />
              <textarea style={s.field} rows={2} placeholder="ملاحظات الطلب" value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
            {!editingOrderId && <div style={s.discountBox}><b style={{fontSize:15}}>الخصم على الأوردر</b><small style={s.muted}>الخصم اختياري — سيُسجل 0 ج.م لو سبت القيمة صفر</small><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><select className="pos-filter-control" aria-label="نوع الخصم" style={{...s.select,color:"#000",WebkitTextFillColor:"#000"}} value={discountType} onChange={e=>setDiscountType(e.target.value)}><option value="amount">خصم مبلغ (ج.م)</option><option value="percent">خصم نسبة (%)</option></select><input className="pos-filter-control" aria-label="قيمة الخصم" style={{...s.discountInput,color:"#000",WebkitTextFillColor:"#000",opacity:1}} type="number" min="0" max={discountType === "percent" ? 100 : subtotal} step="0.01" placeholder={discountType === "percent" ? "النسبة %" : "المبلغ ج.م"} value={discountValue} onChange={e=>setDiscountValue(e.target.value)} /></div></div>}
            {editingOrderId ? <div style={s.totals}><div><span>إجمالي الأوردر الحالي</span><b>{fmt(editingOrderTotal)} ج.م</b></div><div><span>قيمة الإضافات</span><b>{fmt(newItemsSubtotal)} ج.م</b></div><div style={s.grand}><b>الإجمالي بعد الإضافة</b><b>{fmt(Number(editingOrderTotal || 0) + newItemsSubtotal)} ج.م</b></div></div> : <><div style={s.totals}><div><span>الإجمالي</span><b>{fmt(subtotal)} ج.م</b></div><div><span>الخصم</span><b>{fmt(discount)} ج.م</b></div><div style={s.grand}><b>المطلوب</b><b>{fmt(total)} ج.م</b></div></div><div style={s.pay}><span>الدفع</span>{["cash","card"].map(v=><button key={v} style={s.secondary} onClick={()=>setPayment(v)}>{payment === v ? "✓ " : ""}{v === "cash" ? "نقدي" : "بطاقة"}</button>)}</div></>}
            <button style={s.submit} disabled={saving || (editingOrderId ? newItemsSubtotal <= 0 : !cart.length) || (mode === "dine-in" && !table)} onClick={checkout}>{saving ? "جاري الحفظ..." : editingOrderId ? "حفظ الإضافات على نفس الأوردر" : "تأكيد الطلب وإرساله للتجهيز"}</button>
          </section>
        </div>
      )}

    </main>
  );
}

const s = {
 page:{minHeight:"100vh",padding:24,background:"#f4f2ee",color:"#242424"},
 allOrdersPage:{background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,padding:18,minWidth:0},
 allOrdersHeading:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16},
 orderFilters:{display:"grid",gridTemplateColumns:"minmax(220px,2fr) repeat(5,minmax(130px,1fr)) auto",gap:8,marginBottom:16},
 filterInput:{minWidth:0,width:"100%",boxSizing:"border-box",padding:"10px 11px",border:"1px solid #cfcfcf",borderRadius:8,background:"#fff",color:"#242424",fontFamily:"inherit",fontSize:14},
 ordersTableWrap:{width:"100%",maxHeight:"calc(100vh - 310px)",minHeight:300,overflow:"auto",border:"1px solid #e3ded5",borderRadius:10},
 ordersTable:{width:"100%",minWidth:1050,borderCollapse:"separate",borderSpacing:0,textAlign:"right",background:"#fff",fontSize:13},
 ordersTh:{position:"sticky",top:0,zIndex:2,background:"#29251f",color:"#fff",padding:"14px 12px",whiteSpace:"nowrap",fontWeight:800,borderBottom:"2px solid #b88946"},
 ordersTd:{padding:"13px 12px",whiteSpace:"nowrap",borderBottom:"1px solid #eee9e1",color:"#302d29"},
 allOrdersList:{display:"grid",gap:9},
 orderRow:{display:"grid",gridTemplateColumns:"minmax(230px,0.8fr) minmax(0,2fr)",alignItems:"center",gap:14,padding:"14px 16px",border:"1px solid #eee8df",borderRadius:10,background:"#fff"},
 orderMainInfo:{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"},
 orderDetailsLine:{display:"flex",alignItems:"center",gap:"10px 20px",flexWrap:"wrap",fontSize:13,color:"#666"},
 orderAmount:{fontSize:16,color:"#267447",marginRight:"auto"},
 header:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18},eyebrow:{color:"#a7793d",fontWeight:800,letterSpacing:2},muted:{color:"#777",fontSize:12},
 secondary:{padding:"9px 13px",border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"},
 error:{padding:12,background:"#ffeded",color:"#a12c2c",borderRadius:9},success:{padding:12,background:"#e9f7ee",color:"#246c45",borderRadius:9},
 tabs:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"},tab:{padding:"12px 24px",border:"1px solid #ddd",borderRadius:9,background:"#fff",cursor:"pointer",fontWeight:700},selectedTab:{background:"#2c2823",color:"#fff"},
 stats:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:15},stat:{background:"#fff",padding:15,border:"1px solid #e9e4dc",borderRadius:10,display:"grid",gap:7},workspace:{display:"grid",gridTemplateColumns:"minmax(0,1.5fr) minmax(320px,0.9fr)",gap:14,alignItems:"start"},orderWorkspace:{display:"grid",gridTemplateColumns:"minmax(280px,0.85fr) minmax(0,1.5fr)",gap:14,alignItems:"start"},menuSidebar:{background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,padding:14,minWidth:0},menuSidebarHead:{display:"grid",gap:9,marginBottom:10},orderPanel:{background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,padding:16,minWidth:0},
 panel:{background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,padding:16,minWidth:0},head:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:9,marginBottom:12},search:{padding:10,border:"1px solid #ddd",borderRadius:8,width:"40%"},
 categories:{display:"flex",gap:7,overflowX:"auto",paddingBottom:12},category:{padding:"8px 12px",border:"1px solid #e5dfd6",borderRadius:20,background:"#fff",whiteSpace:"nowrap",cursor:"pointer"},
 products:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(125px,1fr))",gap:9},product:{display:"grid",gap:6,textAlign:"right",padding:9,border:"1px solid #eee8df",borderRadius:10,background:"#fff",cursor:"pointer"},image:{width:"100%",height:78,objectFit:"cover",borderRadius:7},imageBlank:{height:78,display:"grid",placeItems:"center",background:"#f6f1e9",borderRadius:7,fontSize:24,color:"#a7793d"},
 tableSection:{marginTop:18},fullTableGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12},tableTile:{minHeight:112,display:"grid",placeContent:"center",gap:8,border:"1px solid #cde5d4",background:"#eaf7ee",color:"#246c45",borderRadius:12,cursor:"pointer",fontSize:18},occupiedTile:{background:"#fdeaea",borderColor:"#efc1c1",color:"#a12c2c"},reservedTile:{background:"#fff4d9",borderColor:"#e9cb7a",color:"#8b681b"},legend:{display:"flex",gap:18,marginTop:18,color:"#666",fontSize:13},clear:{border:0,background:"none",color:"#a12c2c",cursor:"pointer"},tableBox:{padding:10,background:"#faf8f5",borderRadius:9,marginBottom:10},switch:{display:"flex",gap:7,marginBottom:9},tableGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6},table:{padding:8,display:"grid",gap:4,border:"1px solid #cde5d4",background:"#eaf7ee",color:"#246c45",borderRadius:7,cursor:"pointer"},chosen:{outline:"2px solid #b88946"},occupied:{background:"#fdeaea",borderColor:"#efc1c1",color:"#a12c2c"},reserved:{background:"#fff4d9",borderColor:"#e9cb7a",color:"#8b681b"},
 cart:{maxHeight:280,overflowY:"auto"},cartItem:{padding:"10px 0",borderBottom:"1px solid #eee"},qty:{display:"flex",alignItems:"center",gap:9},note:{width:"55%",padding:7,border:"1px solid #eee",borderRadius:6,fontSize:12},empty:{textAlign:"center",padding:18,color:"#888"},fields:{display:"grid",gap:7,marginTop:10},field:{padding:9,border:"1px solid #e4dfd7",borderRadius:7,width:"100%",boxSizing:"border-box",fontFamily:"inherit"},
 select:{flex:1,padding:10,border:"1px solid #cfcfcf",borderRadius:7,background:"#fff",color:"#242424",fontSize:14},discount:{width:90,padding:8,border:"1px solid #ddd",borderRadius:7},discountBox:{display:"grid",gap:8,marginTop:14,padding:12,border:"2px solid #b88946",borderRadius:10,background:"#fffaf1"},discountInput:{width:"100%",minWidth:0,boxSizing:"border-box",padding:10,border:"1px solid #cfcfcf",borderRadius:7,background:"#fff",color:"#242424",fontSize:14},totals:{display:"grid",gap:7,padding:"12px 0"},grand:{display:"flex",justifyContent:"space-between",fontSize:18,color:"#8b622e",paddingTop:7},pay:{display:"flex",gap:8,alignItems:"center",marginBottom:10},submit:{width:"100%",padding:13,border:0,borderRadius:8,background:"#b88946",color:"#fff",fontWeight:800,cursor:"pointer"},
 orders:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:9},order:{display:"grid",gap:6,padding:12,border:"1px solid #eee8df",borderRadius:9}
};
