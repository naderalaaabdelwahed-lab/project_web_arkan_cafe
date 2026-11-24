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
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingOrderClosed, setEditingOrderClosed] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [showItemTransfer, setShowItemTransfer] = useState(false);
  const [transferQuantities, setTransferQuantities] = useState({});
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [payment, setPayment] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [paymentSummary, setPaymentSummary] = useState({});
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [showCashModal, setShowCashModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

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
      const paymentsResult = await supabase.from("pos_payments").select("order_id,amount");
      if (paymentsResult.error) throw paymentsResult.error;
      const paidByOrder = {};
      (paymentsResult.data || []).forEach((row) => { paidByOrder[row.order_id] = (paidByOrder[row.order_id] || 0) + Number(row.amount || 0); });
      setPaymentSummary(paidByOrder);
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
  const selectedTableOrder = activeTables.find((o) => selectedTableKey === (o.table_area + ":" + o.table_number)) || null;
  const floorTotal = activeTables.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const selectedDue = selectedTableOrder ? Math.max(0, Number(selectedTableOrder.total_amount || 0) - Number(paymentSummary[selectedTableOrder.id] || 0)) : 0;
  const mergeTargets = activeTables.filter((o) => o.id !== selectedTableOrder?.id);
  const transferTargets = [
    ...Array.from({ length: Number(settings.indoor_tables) || 0 }, (_, i) => ({ area: "indoor", number: i + 1 })),
    ...Array.from({ length: Number(settings.outdoor_tables) || 0 }, (_, i) => ({ area: "outdoor", number: i + 1 })),
  ].filter((target) =>
    !(target.area === area && target.number === table) &&
    !reservations.some((r) => r.table_number === target.number && (r.seating_area || "indoor") === target.area)
  );
  const availableTransferTargets = transferTargets.filter((target) =>
    !activeTables.some((o) => o.table_area === target.area && o.table_number === target.number)
  );

  function add(p) {
    setCart((old) => {
      const found = old.find((x) => x.product_id === p.id && !x.existing);
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
    setEditingOrderId(null); setEditingOrderTotal(null); setSelectedOrder(null); setEditingOrderClosed(false);
    setShowTransfer(false); setTransferTarget("");
    setShowItemTransfer(false); setTransferQuantities({});
  }
  function selectTable(n, selectedArea) {
    setSelectedTableKey(selectedArea + ":" + n);
    setArea(selectedArea);
    setTable(n);
  }

  function openTable(n, selectedArea) {
    setSelectedTableKey(selectedArea + ":" + n);
    const currentOrder = activeTables.find((o) => o.table_number === n && o.table_area === selectedArea);
    const booking = reservations.find((r) => r.table_number === n && (r.seating_area || "indoor") === selectedArea);
    reset();
    setArea(selectedArea);
    setTable(n);
    setMode("dine-in");
    setTab("dine-in");
    setScreen("order");
    if (currentOrder) {
      setSelectedOrder(currentOrder);
      setDiscountType("amount"); setDiscountValue(String(currentOrder.discount_amount || 0)); setCashReceived("");
      setEditingOrderClosed(false);
      setEditingOrderId(currentOrder.id);
      setEditingOrderTotal(Number(currentOrder.total_amount || 0));
      setCart((currentOrder.order_items || []).map((item) => ({
        cartKey: "existing-" + item.id,
        orderItemId: item.id,
        preparationStatus: item.preparation_status,
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
      setSelectedOrder(null);
      setEditingOrderClosed(false);
      setReservationId(booking ? booking.id : null);
      if (booking) { setCustomer(booking.customer_name || ""); setPhone(booking.phone || ""); }
    }
  }
  function openOrderFromAll(order) {
    reset();
    setSelectedOrder(order);
    setDiscountType("amount"); setDiscountValue(String(order.discount_amount || 0)); setCashReceived("");
    setEditingOrderId(order.id);
    setEditingOrderTotal(Number(order.total_amount || 0));
    setEditingOrderClosed(["delivered", "cancelled"].includes(order.status));
    setMode(order.order_type || "takeaway");
    setTab("all");
    setScreen("order");
    setArea(order.table_area || "indoor");
    setTable(order.table_number || null);
    setCustomer(order.customer_name || "");
    setPhone(order.phone || "");
    setAddress(order.address || "");
    setNotes(order.notes || "");
    setCart((order.order_items || []).map((item) => ({
      cartKey: "existing-" + item.id, orderItemId: item.id,
      preparationStatus: item.preparation_status, product_id: item.product_id,
      name: item.product_name, price: Number(item.unit_price || 0),
      quantity: Number(item.quantity || 0), originalQuantity: Number(item.quantity || 0),
      note: item.item_note || "", existing: true,
    })));
  }

  async function printReceipt(order = selectedOrder) {
    if (!order) return setError("افتح أوردر الأول علشان تطبع الفاتورة.");
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const rows = (order.order_items || []).map((it) => "<tr><td>"+esc(it.product_name || it.name)+"</td><td>"+fmt(it.quantity)+"</td><td>"+fmt(it.unit_price)+"</td><td>"+fmt(Number(it.quantity||0)*Number(it.unit_price||0))+"</td></tr>").join("");
    const d = order.created_at ? new Date(order.created_at) : new Date();
    const html = [
      "<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>فاتورة ARK-"+esc(order.id)+"</title>",
      "<style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{width:74mm;margin:0 auto;font-family:Tahoma,Arial,sans-serif;color:#000;font-size:12px}h2,p{text-align:center;margin:4px 0}.muted{font-size:10px}.line{border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:4px 1px;text-align:right;border-bottom:1px dotted #aaa}.totals div{display:flex;justify-content:space-between;margin:5px 0}.grand{font-weight:bold;font-size:15px}.foot{text-align:center;margin-top:12px}</style></head><body>",
      "<h2>ARKAN CAFE</h2><p class='muted'>فاتورة بيع</p><div class='line'></div>",
      "<p>رقم الفاتورة: ARK-"+esc(order.id)+"</p><p>التاريخ: "+esc(d.toLocaleDateString("ar-EG"))+" — "+esc(d.toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}))+"</p>",
      "<p>النوع: "+esc(order.order_type==="dine-in"?"صالة":order.order_type==="delivery"?"دليفري":"تيك أواي")+(order.table_number?" — طاولة "+esc(order.table_number):"")+"</p>",
      (order.customer_name ? "<p>العميل: "+esc(order.customer_name)+"</p>" : ""),
      "<div class='line'></div><table><thead><tr><th>الصنف</th><th>ك</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>"+rows+"</tbody></table>",
      "<div class='line'></div><div class='totals'><div><span>الخصم</span><b>"+fmt(order.discount_amount)+" ج.م</b></div><div class='grand'><span>الإجمالي</span><b>"+fmt(order.total_amount)+" ج.م</b></div></div>",
      "<div class='line'></div><p class='foot'>شكراً لزيارتكم<br>نتمنى لكم يوماً سعيداً</p>",
      "<script>window.onload=()=>{window.focus();window.print();};window.onafterprint=()=>window.close();</scr"+"ipt></body></html>"
    ].join("");
    const w = window.open("", "arkan-receipt", "width=420,height=700");
    if (!w) return setError("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة للموقع ثم حاول مرة أخرى.");
    w.document.open(); w.document.write(html); w.document.close();
    if (order.order_type === "dine-in") {
      const marked = await supabase.rpc("pos_mark_receipt_printed", { p_order_id: order.id });
      if (marked.error) setError("تم فتح الطباعة لكن تعذر تحديث لون الطاولة: " + marked.error.message);
      else await load();
    }
  }

  async function checkout() {
    if (editingOrderClosed) return setError("الأوردر مغلق أو ملغي ولا يمكن إضافة أصناف إليه.");
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
        p_payments: mode === "dine-in" ? [] : (total > 0 ? [{ method: payment, amount: Number(total.toFixed(2)) }] : []),
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

  async function applyOrderDiscount() {
    if (!editingOrderId) return;
    if (newItemsSubtotal > 0) return setError("احفظ الأصناف الجديدة أولًا ثم طبّق الخصم.");
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("pos_update_order_discount", { p_order_id: editingOrderId, p_discount_type: discountType, p_discount_value: Number(discountValue) || 0 });
      if (result.error) throw result.error;
      setEditingOrderTotal(Number(result.data.total_amount));
      setSelectedOrder((old) => old ? { ...old, total_amount: result.data.total_amount, discount_amount: result.data.discount_amount } : old);
      setMessage("تم تحديث الخصم على الأوردر ARK-" + editingOrderId + " بنجاح.");
      await load();
    } catch (e) { setError("تعذر تطبيق الخصم: " + e.message); }
    finally { setSaving(false); }
  }

  async function recordCashPayment(orderId = editingOrderId) {
    if (!orderId) return;
    const received = Number(cashReceived);
    if (!Number.isFinite(received) || received <= 0) return setError("اكتب المبلغ النقدي المستلم.");
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("pos_settle_and_close_cash", { p_order_id: orderId, p_received: received });
      if (result.error) throw result.error;
      setMessage("تم سداد الأوردر وإغلاقه وتفريغ الطاولة. الباقي للعميل: " + fmt(result.data.change) + " ج.م");
      setCashReceived("");
      setShowCashModal(false);
      reset();
      setScreen("tables");
      await load();
    } catch (e) { setError("تعذر تسجيل السداد: " + e.message); }
    finally { setSaving(false); }
  }

  function startItemTransfer() {
    const eligible = cart.filter((item) => item.existing && item.preparationStatus === "pending");
    setTransferQuantities(Object.fromEntries(eligible.map((item) => [String(item.orderItemId), "0"])));
    setTransferTarget("");
    setShowTransfer(false);
    setShowItemTransfer(true);
  }

  async function transferSelectedItems() {
    if (!editingOrderId) return;
    if (!transferTarget) return setError("اختار الطاولة المستقبِلة.");
    const selectedItems = Object.entries(transferQuantities)
      .map(([id, quantity]) => ({ order_item_id: Number(id), quantity: Number(quantity) }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
    if (!selectedItems.length) return setError("حدد صنفًا واحدًا على الأقل والكمية المطلوب نقلها.");

    const [targetArea, targetNumber] = transferTarget.split(":");
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("transfer_pos_order_items", {
        p_source_order_id: editingOrderId,
        p_target_table_number: Number(targetNumber),
        p_target_table_area: targetArea,
        p_items: selectedItems,
      });
      if (result.error) throw result.error;
      const moved = result.data || {};
      setMessage(
        "تم نقل " + (moved.moved_items_count || selectedItems.length) +
        " صنف إلى الطاولة " + targetNumber + " — الأوردر ARK-" + moved.target_order_id + " بنجاح."
      );
      reset();
      setScreen("tables");
      await load();
    } catch (e) {
      setError("فشل نقل الأصناف: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removePendingItem(itemId) {
    if (!editingOrderId || editingOrderClosed) return setError("لا يمكن تعديل أوردر مغلق.");
    if (!window.confirm("هل تريد حذف هذا الصنف من الأوردر؟")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result=await supabase.rpc("pos_remove_pending_order_item",{p_order_item_id:itemId});
      if(result.error) throw result.error;
      setMessage(result.data.order_closed?"تم حذف آخر صنف وإغلاق الأوردر وإخلاء الطاولة.":"تم حذف الصنف وتحديث إجمالي الأوردر.");
      reset(); setScreen("tables"); await load();
    } catch(e){setError("تعذر حذف الصنف: "+e.message);}
    finally{setSaving(false);}
  }

  async function emptySelectedTable() {
    if(!selectedTableOrder) return setError("حدد طاولة مشغولة أولًا.");
    if(!window.confirm("تأكيد إفراغ الطاولة؟ سيتم إلغاء الأوردر وحذف أصنافه، بشرط عدم وجود دفعات أو أصناف بدأ تجهيزها.")) return;
    setSaving(true);setError("");setMessage("");
    try{
      const result=await supabase.rpc("pos_empty_table_order",{p_order_id:selectedTableOrder.id,p_reason:"تم إفراغ الطاولة من شاشة الصالة"});
      if(result.error) throw result.error;
      setMessage("تم إلغاء الأوردر وإفراغ الطاولة رقم "+selectedTableOrder.table_number+".");
      setSelectedTableKey(""); await load();
    }catch(e){setError("تعذر إفراغ الطاولة: "+e.message);}
    finally{setSaving(false);}
  }

  async function mergeSelectedTable() {
    if (!selectedTableOrder) return setError("حدد طاولة مشغولة أولًا.");
    if (!mergeTargetId) return setError("اختار الطاولة المستقبِلة.");
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("pos_merge_table_orders", {
        p_source_order_id: selectedTableOrder.id,
        p_target_order_id: Number(mergeTargetId),
      });
      if (result.error) throw result.error;
      setMessage("تم دمج الأوردر ARK-" + selectedTableOrder.id + " في الأوردر ARK-" + result.data.target_order_id + "، والطاولة المصدر أصبحت متاحة.");
      setMergeTargetId("");
      setSelectedTableKey("");
      await load();
    } catch (e) { setError("تعذر دمج الطاولتين: " + e.message); }
    finally { setSaving(false); }
  }

  async function transferTable(orderId = editingOrderId) {
    if (!orderId) return;
    if (!transferTarget) return setError("اختار الطاولة الجديدة.");
    const [targetArea, targetNumber] = transferTarget.split(":");
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("move_pos_order_between_tables", {
        p_order_id: orderId,
        p_target_table_number: Number(targetNumber),
        p_target_table_area: targetArea,
      });
      if (result.error) throw result.error;
      setMessage("تم نقل الأوردر ARK-" + orderId + " إلى الطاولة " + targetNumber + " بنجاح.");
      setShowTransfer(false);
      setTransferTarget("");
      reset();
      setScreen("tables");
      await load();
    } catch (e) {
      setError("فشل نقل الطاولة: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main dir="rtl" className="arkan-pos-page" style={s.page}>جاري تحميل ARKAN POS...</main>;
  if (!allowed) return <main dir="rtl" className="arkan-pos-page" style={s.page}><h2>شاشة الكاشير</h2><p>ليس لديك صلاحية pos.use. اطلب من المدير تفعيلها لحسابك.</p></main>;

  return (
    <main dir="rtl" className="arkan-pos-page" style={s.page}>
      <style jsx global>{`.arkan-floor-dashboard{min-width:0}@media(max-width:1100px){.arkan-floor-dashboard{grid-template-columns:1fr!important}.arkan-floor-dashboard .floorDetails{grid-column:1!important}}.arkan-pos-page input,.arkan-pos-page textarea,.arkan-pos-page select{color:#000!important;-webkit-text-fill-color:#000!important;background-color:#fff!important;caret-color:#000!important;opacity:1!important}.arkan-pos-page input::placeholder,.arkan-pos-page textarea::placeholder{color:#555!important;-webkit-text-fill-color:#555!important;opacity:1!important}.arkan-pos-page select option{color:#000!important;background:#fff!important}.arkan-pos-page input:-webkit-autofill,.arkan-pos-page input:-webkit-autofill:hover,.arkan-pos-page input:-webkit-autofill:focus{ -webkit-text-fill-color:#000!important;box-shadow:0 0 0 1000px #fff inset!important;caret-color:#000!important}.arkan-pos-page .pos-filter-control{font-weight:600}.arkan-pos-page input::-webkit-calendar-picker-indicator{opacity:1}`}</style>
      <header style={s.header}>
        <div><small style={s.eyebrow}>ARKAN POS WEB</small><h1 style={{ margin: "5px 0" }}>نقطة البيع</h1><small style={s.muted}>إدارة الصالة والتيك أواي والدليفري</small></div>
        <button style={s.secondary} onClick={load}>تحديث البيانات</button>
      </header>
      {error && <p style={s.error}>{error}</p>}
      {message && <p style={s.success}>{message}</p>}
      <nav style={s.tabs}>{tabs.map((t) => <button key={t.id} style={{ ...s.tab, ...(tab === t.id ? s.selectedTab : {}) }} onClick={() => { setTab(t.id); if (t.id === "all") { setScreen("all"); } else { setMode(t.id); setScreen(t.id === "dine-in" ? "tables" : "order"); } }}>{t.label}</button>)}</nav>
      {tab === "all" && screen !== "order" ? (
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
                  <th style={s.ordersTh}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {allOrdersFiltered.map(o => {
                  const dineIn = o.order_type === "dine-in";
                  const closed = ["delivered","cancelled"].includes(o.status);
                  const typeLabel = dineIn ? "صالة" : o.order_type === "takeaway" ? "تيك أواي" : "دليفري";
                  const statusLabel = ({pending:"جديد",confirmed:"مؤكد",preparing:"قيد التحضير",delivered:"تم التسليم",cancelled:"ملغي"})[o.status] || o.status || "غير محدد";
                  const created = o.created_at ? new Date(o.created_at) : null;
                  return <tr key={o.id} onClick={() => openOrderFromAll(o)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openOrderFromAll(o); } }} tabIndex={0} role="button" title="اضغط لفتح تفاصيل الأوردر وإضافة أصناف" style={{cursor:"pointer"}}>
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
                    <td style={s.ordersTd}><button type="button" style={s.secondary} onClick={e => { e.stopPropagation(); openOrderFromAll(o); }}>فتح الأوردر وإضافة أصناف</button></td>
                  </tr>;
                })}
                {!allOrdersFiltered.length && <tr><td style={s.ordersTd} colSpan={11}>لا توجد طلبات مطابقة للفلاتر.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : mode === "dine-in" && screen === "tables" ? (
        <>
        <section className="arkan-floor-dashboard" style={s.floorDashboard}>
          <aside style={s.floorSidebar}>
            <div style={s.floorTotal}>
              <small>إجمالي أوردرات الصالة المفتوحة</small><strong style={{fontSize:28}}>{fmt(floorTotal)} ج.م</strong>
              <small>{activeTables.length} أوردر نشط</small>
              <button style={s.secondary} onClick={load} disabled={loading}>↻ تحديث الإجمالي والبيانات</button>
            </div>
            <div style={s.floorTools}>
              <h3>أدوات الطاولة المحددة</h3>
              {selectedTableOrder ? <>
                <b>{selectedTableOrder.table_area==="indoor"?"داخلية":"خارجية"} — طاولة {selectedTableOrder.table_number}</b>
                <small>الأوردر ARK-{selectedTableOrder.id}</small>
                <small>الإجمالي: {fmt(selectedTableOrder.total_amount)} ج.م</small>
                <small>المدفوع: {fmt(paymentSummary[selectedTableOrder.id]||0)} ج.م</small>
                <small>المتبقي: {fmt(selectedDue)} ج.م</small>
                <button style={s.submit} onClick={()=>openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>إضافة أصناف / فتح الأوردر</button>
                <button style={s.secondary} onClick={()=>openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>حذف أصناف من الطلب</button>
                <button style={s.secondary} onClick={()=>openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>خصم من الفاتورة</button>
                <button style={s.secondary} onClick={()=>{setCashReceived("");setShowCashModal(true);}}>السداد النقدي وإغلاق الأوردر</button>
                <button style={s.secondary} onClick={()=>{setShowTransfer(true);setTransferTarget("");}}>نقل الطاولة بالكامل</button>
                <div style={{display:"grid",gap:7}}>
                  <label style={s.floorLabel}>دمج الطاولة في طاولة مشغولة</label>
                  <select style={s.filterInput} value={mergeTargetId} onChange={e=>setMergeTargetId(e.target.value)}>
                    <option value="">اختار الطاولة المستقبِلة</option>
                    {mergeTargets.map(o=><option key={o.id} value={o.id}>{o.table_area==="indoor"?"داخلية":"خارجية"} — طاولة {o.table_number} (ARK-{o.id})</option>)}
                  </select>
                  <button style={s.secondary} disabled={saving||!mergeTargetId} onClick={mergeSelectedTable}>دمج الأوردر وإخلاء الطاولة المصدر</button>
                </div>
                <button style={s.secondary} onClick={()=>openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>نقل أصناف من الطلب</button>
                <button style={s.clear} disabled={saving} onClick={emptySelectedTable}>إفراغ الطاولة وإنهاء الطلب</button>
                <small style={s.floorHint}>الدمج ينقل الأصناف والخصم وكل الدفعات، ويقفل أوردر المصدر. الأوردر المقفول لا يقبل أي تعديل.</small>
              </> : <>
                <p style={s.muted}>اضغط مرة على طاولة لتحديدها، واضغط مرتين لفتح الأوردر.</p>
                <button style={s.secondary} disabled={!selectedTableKey} onClick={()=>{const [a,n]=selectedTableKey.split(":");openTable(Number(n),a);}}>فتح الطاولة المحددة</button>
              </>}
            </div>
          </aside>
          <div style={s.floorTables}>
            <div style={s.head}><div><h2>صالة المطعم</h2><small style={s.muted}>ضغطة واحدة للتحديد — ضغطتان لفتح الأوردر</small></div><b>{Number(settings.indoor_tables||0)+Number(settings.outdoor_tables||0)} طاولة</b></div>
            {["indoor","outdoor"].map((a)=> <div key={a} style={s.tableSection}>
              <h3>{a==="indoor"?"الطاولات الداخلية":"الطاولات الخارجية"} ({Number(a==="indoor"?settings.indoor_tables:settings.outdoor_tables)||0})</h3>
              <div style={s.fullTableGrid}>
                {Array.from({length:Number(a==="indoor"?settings.indoor_tables:settings.outdoor_tables)||0},(_,i)=>i+1).map(n=>{
                  const o=activeTables.find(x=>x.table_number===n&&x.table_area===a);
                  const reserved=reservations.some(r=>r.table_number===n&&(r.seating_area||"indoor")===a);
                  const key=a+":"+n;
                  return <button key={key} onClick={()=>selectTable(n,a)} onDoubleClick={()=>openTable(n,a)} style={{...s.tableTile,...(o?s.occupiedTile:{}),...(o?.receipt_printed_at?s.printedTile:{}),...(reserved&&!o?s.reservedTile:{}),...(selectedTableKey===key?s.tableSelected:{})}}>
                    <b>{n}</b><small>{o?"مشغولة — "+fmt(o.total_amount)+" ج.م":reserved?"محجوزة":"متاحة"}</small>
                  </button>;
                })}
              </div>
            </div>)}
            <div style={s.legend}><span>🟢 متاحة</span><span>🔴 مشغولة</span><span>🔵 تمت طباعة الفاتورة</span><span>🟡 محجوزة</span><span>🟠 محددة</span></div>
          </div>
          <aside style={s.floorActions}>
            <div style={s.floorCashCard}>
              <h3>السداد النقدي</h3>
              {selectedTableOrder?<><small>طاولة {selectedTableOrder.table_number} — ARK-{selectedTableOrder.id}</small>
                <div>قيمة الفاتورة: <b>{fmt(selectedTableOrder.total_amount)} ج.م</b></div>
                <div>المدفوع: <b>{fmt(paymentSummary[selectedTableOrder.id]||0)} ج.م</b></div>
                <div>المتبقي: <b>{fmt(selectedDue)} ج.م</b></div>
                <button style={s.submit} disabled={selectedDue<=0} onClick={()=>{setCashReceived("");setShowCashModal(true);}}>استلام نقدية وإغلاق الطاولة</button></>
                :<p style={s.muted}>حدد طاولة مشغولة لعرض المبلغ المستحق.</p>}
            </div>
            <div style={s.floorOtherActions}><h3>عمليات أخرى</h3>
              <button style={s.secondary} disabled={!selectedTableOrder} onClick={()=>selectedTableOrder&&printReceipt(selectedTableOrder)}>طباعة الفاتورة</button>
              <button style={s.secondary} disabled={!selectedTableOrder} onClick={()=>selectedTableOrder&&openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>فتح تفاصيل الأوردر</button>
              <button style={s.secondary} disabled={!selectedTableOrder} onClick={()=>{setShowTransfer(true);setTransferTarget("");}}>نقل الطاولة</button>
              <button style={s.secondary} disabled={!selectedTableOrder} onClick={()=>selectedTableOrder&&openTable(selectedTableOrder.table_number,selectedTableOrder.table_area)}>نقل أصناف</button>
              <button style={s.clear} disabled={!selectedTableOrder||saving} onClick={emptySelectedTable}>إفراغ الطاولة</button>
            </div>
          </aside>
          <div style={s.floorDetails}><b>تفاصيل الطاولة المحددة</b>
            {selectedTableOrder?<div style={s.floorDetailRow}>
              <span>طاولة {selectedTableOrder.table_number} ({selectedTableOrder.table_area==="indoor"?"داخلية":"خارجية"})</span>
              <span>ARK-{selectedTableOrder.id}</span><span>الأصناف: {(selectedTableOrder.order_items||[]).length}</span>
              <span>الإجمالي: {fmt(selectedTableOrder.total_amount)} ج.م</span><span>المدفوع: {fmt(paymentSummary[selectedTableOrder.id]||0)} ج.م</span>
              <span>المتبقي: {fmt(selectedDue)} ج.م</span><span>{selectedTableOrder.status==="pending"?"قيد الانتظار":"قيد التنفيذ"}</span>
            </div>:<small style={s.muted}>لم يتم تحديد طاولة مشغولة بعد.</small>}
          </div>
        </section>
        {showTransfer&&selectedTableOrder&&<div style={s.floorInlineModal}>
          <b>نقل الطاولة بالكامل — ARK-{selectedTableOrder.id}</b>
          <select style={s.filterInput} value={transferTarget} onChange={e=>setTransferTarget(e.target.value)}>
            <option value="">اختار طاولة فارغة</option>
            {availableTransferTargets.map(t=><option key={t.area+":"+t.number} value={t.area+":"+t.number}>{t.area==="indoor"?"داخلية":"خارجية"} — طاولة {t.number}</option>)}
          </select>
          <button style={s.submit} disabled={saving||!transferTarget} onClick={()=>transferTable(selectedTableOrder.id)}>تأكيد النقل</button>
          <button style={s.secondary} onClick={()=>setShowTransfer(false)}>إلغاء</button>
        </div>}
        {showCashModal&&selectedTableOrder&&<div style={s.modalBackdrop} onClick={()=>!saving&&setShowCashModal(false)}>
          <div style={s.cashModal} onClick={e=>e.stopPropagation()}>
            <h2>سداد الأوردر وإغلاق الطاولة</h2><small>ARK-{selectedTableOrder.id} — طاولة {selectedTableOrder.table_number}</small>
            <div style={s.modalAmount}>المتبقي: {fmt(selectedDue)} ج.م</div>
            <label style={s.floorLabel}>المبلغ المستلم من العميل</label>
            <input autoFocus type="number" min={selectedDue+0.01} step="0.01" style={s.discountInput} value={cashReceived} onChange={e=>setCashReceived(e.target.value)} placeholder="اكتب المبلغ المستلم"/>
            <div>الباقي للعميل: <b>{fmt(Math.max(0,Number(cashReceived||0)-selectedDue))} ج.م</b></div>
            <small style={s.floorHint}>لازم المبلغ المستلم يكون أكبر من المتبقي على الفاتورة.</small>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button style={s.submit} disabled={saving||!Number.isFinite(Number(cashReceived))||Number(cashReceived)<=selectedDue} onClick={()=>recordCashPayment(selectedTableOrder.id)}>{saving?"جاري السداد...":"سداد وإغلاق الأوردر"}</button>
              <button style={s.secondary} disabled={saving} onClick={()=>setShowCashModal(false)}>إلغاء</button>
            </div>
          </div>
        </div>}
        </>
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
              {productsShown.map(p => <button key={p.id} style={s.product} disabled={editingOrderClosed} onClick={() => add(p)}>
                {p.image_url ? <img src={p.image_url} alt="" style={s.image} /> : <span style={s.imageBlank}>＋</span>}
                <b>{p.name}</b><small>{fmt(p.price)} ج.م</small>
              </button>)}
              {!productsShown.length && <p>لا توجد أصناف.</p>}
            </div>
          </aside>
          <section style={s.orderPanel}>
            <div style={s.head}>
              <div><h2>{editingOrderId ? "الأوردر ARK-" + editingOrderId : "الطلب الحالي"}</h2><small style={s.muted}>{mode === "dine-in" ? (area === "indoor" ? "طاولة داخلية " : "طاولة خارجية ") + table : mode === "takeaway" ? "تيك أواي" : "دليفري"}</small></div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {editingOrderId && <button style={s.secondary} onClick={() => printReceipt()}>طباعة الفاتورة</button>}
                {tab === "all" && <button style={s.secondary} onClick={() => { reset(); setTab("all"); }}>رجوع لكل الأوردرات</button>}
                {editingOrderId && mode === "dine-in" && <button style={s.secondary} onClick={() => { setShowTransfer((v) => !v); setShowItemTransfer(false); setTransferTarget(""); }}>نقل الطاولة بالكامل</button>}
                {editingOrderId && mode === "dine-in" && <button style={s.secondary} onClick={startItemTransfer}>نقل أصناف لطاولة أخرى</button>}
                {mode === "dine-in" && <button style={s.secondary} onClick={() => setScreen("tables")}>رجوع للطاولات</button>}
                <button style={s.clear} onClick={() => { reset(); if (editingOrderId && mode === "dine-in") setScreen("tables"); }}>{editingOrderId ? "إلغاء التعديل" : "مسح الطلب"}</button>
              </div>
            </div>
            {editingOrderClosed && <p style={{padding:10,background:"#fff4d9",color:"#8b681b",borderRadius:8}}>هذا الأوردر مغلق/ملغي؛ يمكنك مراجعة تفاصيله وطباعته، لكن إضافة أصناف تتطلب إعادة فتح الأوردر بصلاحية المدير.</p>}
            {showTransfer && editingOrderId && !editingOrderClosed && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 8, alignItems: "center", padding: 12, marginBottom: 12, border: "1px solid #e5d3b8", borderRadius: 9, background: "#fffaf1" }}>
              <select className="pos-filter-control" style={s.filterInput} value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                <option value="">اختار الطاولة الجديدة</option>
                {availableTransferTargets.map((target) => <option key={target.area + ":" + target.number} value={target.area + ":" + target.number}>
                  {target.area === "indoor" ? "داخلية" : "خارجية"} — طاولة {target.number}
                </option>)}
              </select>
              <button style={s.submit} disabled={saving || !transferTarget} onClick={transferTable}>{saving ? "جاري النقل..." : "تأكيد النقل"}</button>
              <button style={s.secondary} disabled={saving} onClick={() => { setShowTransfer(false); setTransferTarget(""); }}>إلغاء</button>
              {!availableTransferTargets.length && <small style={{ gridColumn: "1 / -1", color: "#8b681b" }}>لا توجد طاولات متاحة للنقل حاليًا.</small>}
            </div>}
            {showItemTransfer && editingOrderId && !editingOrderClosed && <div style={{ display: "grid", gap: 10, padding: 14, marginBottom: 12, border: "1px solid #d9c39b", borderRadius: 10, background: "#fffaf1" }}>
              <div><b>نقل أصناف من الأوردر ARK-{editingOrderId}</b><small style={{ display: "block", color: "#75664f", marginTop: 4 }}>حدد الكمية من كل صنف، ثم اختار الطاولة المستقبِلة. الأصناف التي بدأ تجهيزها لا يمكن نقلها.</small></div>
              <select className="pos-filter-control" style={s.filterInput} value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                <option value="">اختار الطاولة المستقبِلة</option>
                {transferTargets.map((target) => {
                  const targetOrder = activeTables.find((o) => o.table_area === target.area && o.table_number === target.number);
                  return <option key={target.area + ":" + target.number} value={target.area + ":" + target.number}>
                    {target.area === "indoor" ? "داخلية" : "خارجية"} — طاولة {target.number}{targetOrder ? " — مشغولة (الأوردر ARK-" + targetOrder.id + ")" : " — متاحة (أوردر جديد)"}
                  </option>;
                })}
              </select>
              {!cart.some((item) => item.existing && item.preparationStatus === "pending") && <small style={{ color: "#a12c2c" }}>لا توجد أصناف معلّقة قابلة للنقل في هذا الأوردر. الأصناف التي تم تجهيزها لا يمكن نقلها.</small>}
              <div style={{ display: "grid", gap: 7 }}>
                {cart.filter((item) => item.existing && item.preparationStatus === "pending").map((item) => (
                  <div key={item.cartKey} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eadfce" }}>
                    <div><b>{item.name}</b><small style={{ display: "block", color: "#75664f" }}>المتاح نقله: {item.quantity}</small></div>
                    <input className="pos-filter-control" type="number" min="0" max={item.quantity} step="1" aria-label={"كمية نقل " + item.name} style={s.filterInput} value={transferQuantities[String(item.orderItemId)] ?? "0"} onChange={(e) => {
                      const value = e.target.value === "" ? "" : String(Math.min(item.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))));
                      setTransferQuantities((old) => ({ ...old, [String(item.orderItemId)]: value }));
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={s.submit} disabled={saving || !transferTarget || !Object.values(transferQuantities).some((q) => Number(q) > 0)} onClick={transferSelectedItems}>{saving ? "جاري نقل الأصناف..." : "تأكيد نقل الأصناف"}</button>
                <button style={s.secondary} disabled={saving} onClick={() => { setShowItemTransfer(false); setTransferQuantities({}); setTransferTarget(""); }}>إلغاء</button>
              </div>
              {!transferTargets.length && <small style={{ color: "#8b681b" }}>لا توجد طاولات أخرى متاحة للنقل حاليًا.</small>}
            </div>}
            {mode === "delivery" && <input style={s.field} placeholder="عنوان التوصيل *" value={address} onChange={e=>setAddress(e.target.value)} />}
            <div style={s.cart}>{cart.map(x => <div key={x.cartKey} style={s.cartItem}>
              <div style={s.head}><div><b>{x.name}</b><small style={s.muted}> {fmt(x.price)} ج.م</small></div><div style={{display:"flex",gap:8,alignItems:"center"}}><b>{fmt(x.price*x.quantity)} ج.م</b>{x.existing&&x.preparationStatus==="pending"&&editingOrderId&&!editingOrderClosed&&<button type="button" style={s.clear} disabled={saving} onClick={()=>removePendingItem(x.orderItemId)}>حذف الصنف</button>}</div></div>
              <div style={s.head}><div style={s.qty}><button disabled={x.existing || x.quantity <= 1} onClick={() => qty(x.cartKey,-1)}>−</button><b>{x.quantity}</b><button disabled={x.existing} onClick={() => qty(x.cartKey,1)}>+</button></div><input style={s.note} placeholder="ملاحظة للصنف" value={x.note} disabled={x.existing} onChange={e => setCart(old => old.map(i => i.cartKey === x.cartKey ? {...i,note:e.target.value} : i))} /></div>
            </div>)}{!cart.length && <p style={s.empty}>السلة فارغة — اختار أصناف من المنيو.</p>}</div>
            <div style={s.fields}>
              <input style={s.field} placeholder="اسم العميل (اختياري)" value={customer} disabled={Boolean(editingOrderId)} onChange={e=>setCustomer(e.target.value)} />
              <input style={s.field} placeholder="رقم الموبايل (اختياري)" value={phone} disabled={Boolean(editingOrderId)} onChange={e=>setPhone(e.target.value)} />
              <textarea style={s.field} rows={2} placeholder="ملاحظات الطلب" value={notes} disabled={Boolean(editingOrderId)} onChange={e=>setNotes(e.target.value)} />
            </div>
            <div style={s.discountBox}><b style={{fontSize:15}}>الخصم على الأوردر</b><small style={s.muted}>الخصم اختياري — سيُسجل 0 ج.م لو سبت القيمة صفر</small><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><select className="pos-filter-control" aria-label="نوع الخصم" style={{...s.select,color:"#000",WebkitTextFillColor:"#000"}} value={discountType} onChange={e=>setDiscountType(e.target.value)}><option value="amount">خصم مبلغ (ج.م)</option><option value="percent">خصم نسبة (%)</option></select><input className="pos-filter-control" aria-label="قيمة الخصم" style={{...s.discountInput,color:"#000",WebkitTextFillColor:"#000",opacity:1}} type="number" min="0" max={discountType === "percent" ? 100 : subtotal} step="0.01" placeholder={discountType === "percent" ? "النسبة %" : "المبلغ ج.م"} value={discountValue} onChange={e=>setDiscountValue(e.target.value)} /></div></div>
            {editingOrderId && <button style={s.submit} disabled={saving || editingOrderClosed || newItemsSubtotal > 0} onClick={applyOrderDiscount}>{saving ? "جاري تطبيق الخصم..." : "تطبيق الخصم على الأوردر"}</button>}
            {editingOrderId ? <div style={s.totals}><div><span>إجمالي الأوردر الحالي</span><b>{fmt(editingOrderTotal)} ج.م</b></div><div><span>قيمة الإضافات</span><b>{fmt(newItemsSubtotal)} ج.م</b></div><div style={s.grand}><b>الإجمالي بعد الإضافة</b><b>{fmt(Number(editingOrderTotal || 0) + newItemsSubtotal)} ج.م</b></div></div> : <><div style={s.totals}><div><span>الإجمالي</span><b>{fmt(subtotal)} ج.م</b></div><div><span>الخصم</span><b>{fmt(discount)} ج.م</b></div><div style={s.grand}><b>المطلوب</b><b>{fmt(total)} ج.م</b></div></div><div style={s.pay}><span>الدفع</span>{["cash","card"].map(v=><button key={v} style={s.secondary} onClick={()=>setPayment(v)}>{payment === v ? "✓ " : ""}{v === "cash" ? "نقدي" : "بطاقة"}</button>)}</div></>}
            {editingOrderId && mode === "dine-in" && !editingOrderClosed && <div style={s.discountBox}><b>السداد النقدي</b><div>إجمالي الفاتورة: {fmt(editingOrderTotal)} ج.م</div><div>المدفوع: {fmt(paymentSummary[editingOrderId] || 0)} ج.م</div><div>المتبقي: {fmt(Math.max(0, Number(editingOrderTotal || 0) - Number(paymentSummary[editingOrderId] || 0)))} ج.م</div><input className="pos-filter-control" style={s.discountInput} type="number" min="0" step="0.01" placeholder="المبلغ المستلم من العميل" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} /><div>الباقي للعميل: {fmt(Math.max(0, Number(cashReceived || 0) - Math.max(0, Number(editingOrderTotal || 0) - Number(paymentSummary[editingOrderId] || 0))))} ج.م</div><button style={s.submit} disabled={saving || newItemsSubtotal > 0 || Math.max(0, Number(editingOrderTotal || 0) - Number(paymentSummary[editingOrderId] || 0)) <= 0 || Number(cashReceived) <= 0} onClick={recordCashPayment}>{saving ? "جاري تسجيل السداد..." : "تسجيل السداد النقدي"}</button></div>}
            {!editingOrderClosed && <button style={s.submit} disabled={saving || (editingOrderId ? newItemsSubtotal <= 0 : !cart.length) || (mode === "dine-in" && !table)} onClick={checkout}>{saving ? "جاري الحفظ..." : editingOrderId ? "حفظ الإضافات على نفس الأوردر" : "تأكيد الطلب وإرساله للتجهيز"}</button>}
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
 ordersTable:{width:"100%",minWidth:1160,borderCollapse:"separate",borderSpacing:0,textAlign:"right",background:"#fff",fontSize:13},
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
 floorDashboard:{display:"grid",gridTemplateColumns:"260px minmax(0,2fr) minmax(250px,1fr)",gap:12,alignItems:"start"},
 floorSidebar:{display:"grid",gap:12,minWidth:0},
 floorTotal:{display:"grid",gap:10,padding:16,background:"#29251f",color:"#fff",borderRadius:13},
 floorTools:{display:"grid",gap:9,padding:14,background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,minWidth:0},
 floorTables:{padding:16,background:"#fff",border:"1px solid #e9e4dc",borderRadius:13,minWidth:0},
 floorActions:{display:"grid",gap:12,minWidth:0},
 floorCashCard:{display:"grid",gap:10,padding:15,background:"#fff",border:"1px solid #e9e4dc",borderRadius:13},
 floorOtherActions:{display:"grid",gap:8,padding:15,background:"#fff",border:"1px solid #e9e4dc",borderRadius:13},
 floorDetails:{gridColumn:"1 / -1",display:"grid",gap:8,padding:14,background:"#fff",border:"1px solid #e9e4dc",borderRadius:13},
 floorDetailRow:{display:"flex",gap:"8px 22px",flexWrap:"wrap",fontSize:13},
 floorLabel:{fontSize:13,fontWeight:700},
 floorHint:{fontSize:12,color:"#77684f",lineHeight:1.6},
 tableSelected:{outline:"3px solid #d28c2c",boxShadow:"0 0 0 3px #fff2dc"},
 floorInlineModal:{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:14,marginTop:10,background:"#fffaf1",border:"1px solid #e5d3b8",borderRadius:10},
 modalBackdrop:{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.48)",display:"grid",placeItems:"center",padding:16},
 cashModal:{width:"min(440px,100%)",display:"grid",gap:12,padding:22,background:"#fff",borderRadius:14,boxShadow:"0 18px 60px rgba(0,0,0,.25)"},
 modalAmount:{fontSize:22,fontWeight:800,color:"#8b622e",padding:"10px 0"},
 tableSection:{marginTop:18},fullTableGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12},tableTile:{minHeight:112,display:"grid",placeContent:"center",gap:8,border:"1px solid #cde5d4",background:"#eaf7ee",color:"#246c45",borderRadius:12,cursor:"pointer",fontSize:18},printedTile:{background:"#e3f0ff",borderColor:"#8bb9e8",color:"#1e5b94"},occupiedTile:{background:"#fdeaea",borderColor:"#efc1c1",color:"#a12c2c"},reservedTile:{background:"#fff4d9",borderColor:"#e9cb7a",color:"#8b681b"},legend:{display:"flex",gap:18,marginTop:18,color:"#666",fontSize:13},clear:{border:0,background:"none",color:"#a12c2c",cursor:"pointer"},tableBox:{padding:10,background:"#faf8f5",borderRadius:9,marginBottom:10},switch:{display:"flex",gap:7,marginBottom:9},tableGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6},table:{padding:8,display:"grid",gap:4,border:"1px solid #cde5d4",background:"#eaf7ee",color:"#246c45",borderRadius:7,cursor:"pointer"},chosen:{outline:"2px solid #b88946"},occupied:{background:"#fdeaea",borderColor:"#efc1c1",color:"#a12c2c"},reserved:{background:"#fff4d9",borderColor:"#e9cb7a",color:"#8b681b"},
 cart:{maxHeight:280,overflowY:"auto"},cartItem:{padding:"10px 0",borderBottom:"1px solid #eee"},qty:{display:"flex",alignItems:"center",gap:9},note:{width:"55%",padding:7,border:"1px solid #eee",borderRadius:6,fontSize:12},empty:{textAlign:"center",padding:18,color:"#888"},fields:{display:"grid",gap:7,marginTop:10},field:{padding:9,border:"1px solid #e4dfd7",borderRadius:7,width:"100%",boxSizing:"border-box",fontFamily:"inherit"},
 select:{flex:1,padding:10,border:"1px solid #cfcfcf",borderRadius:7,background:"#fff",color:"#242424",fontSize:14},discount:{width:90,padding:8,border:"1px solid #ddd",borderRadius:7},discountBox:{display:"grid",gap:8,marginTop:14,padding:12,border:"2px solid #b88946",borderRadius:10,background:"#fffaf1"},discountInput:{width:"100%",minWidth:0,boxSizing:"border-box",padding:10,border:"1px solid #cfcfcf",borderRadius:7,background:"#fff",color:"#242424",fontSize:14},totals:{display:"grid",gap:7,padding:"12px 0"},grand:{display:"flex",justifyContent:"space-between",fontSize:18,color:"#8b622e",paddingTop:7},pay:{display:"flex",gap:8,alignItems:"center",marginBottom:10},submit:{width:"100%",padding:13,border:0,borderRadius:8,background:"#b88946",color:"#fff",fontWeight:800,cursor:"pointer"},
 orders:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:9},order:{display:"grid",gap:6,padding:12,border:"1px solid #eee8df",borderRadius:9}
};
