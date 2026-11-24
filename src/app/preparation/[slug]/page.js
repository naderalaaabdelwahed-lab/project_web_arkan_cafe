"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function elapsedLabel(createdAt, now) {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ConfigurablePreparationScreen() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const [screen, setScreen] = useState(null);
  const [categoryIds, setCategoryIds] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const loadTickets = useCallback(async (screenId, ids) => {
    if (!screenId || !ids?.length) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setError("");
    try {
      const { data: businessDay, error: dayError } = await supabase
        .from("business_days").select("id").eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      if (dayError) throw dayError;
      if (!businessDay) {
        setTickets([]);
        return;
      }
      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id,customer_name,order_type,created_at,status,notes,order_items(id,product_name,quantity,preparation_category_id,preparation_status,preparation_note)")
        .eq("business_day_id", businessDay.id)
        .in("status", ["pending", "confirmed", "preparing"])
        .order("created_at", { ascending: true });
      if (ordersError) throw ordersError;
      setTickets((data || []).map((order) => ({
        ...order,
        stationItems: (order.order_items || []).filter((item) =>
          ids.includes(item.preparation_category_id) && item.preparation_status !== "ready"
        ),
      })).filter((order) => order.stationItems.length));
    } catch (loadError) {
      setError(loadError.message || "تعذر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    if (!slug) return;
    setChecking(true);
    setLoading(true);
    try {
      const { data: screenRow, error: screenError } = await supabase
        .from("preparation_screens")
        .select("id,name,station_type,is_active")
        .eq("slug", slug).eq("is_active", true).maybeSingle();
      if (screenError) throw screenError;
      if (!screenRow) throw new Error("الشاشة غير موجودة أو متوقفة.");
      const { data: permitted, error: permissionError } = await supabase.rpc("has_permission", {
        requested_permission: `${screenRow.station_type}.view`,
      });
      const { data: admin, error: adminError } = await supabase.rpc("is_admin");
      if (permissionError) throw permissionError;
      if (adminError) throw adminError;
      const canOpen = Boolean(admin || permitted);
      setAllowed(canOpen);
      setScreen(screenRow);
      if (!canOpen) return;
      const { data: links, error: linksError } = await supabase
        .from("preparation_screen_categories").select("category_id").eq("screen_id", screenRow.id);
      if (linksError) throw linksError;
      const ids = (links || []).map((link) => link.category_id);
      setCategoryIds(ids);
      await loadTickets(screenRow.id, ids);
    } catch (loadError) {
      setError(loadError.message || "تعذر فتح شاشة التجهيز.");
    } finally {
      setChecking(false);
    }
  }, [slug, loadTickets]);

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    if (!allowed || !screen) return undefined;
    const channel = supabase
      .channel(`prep-screen-${screen.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadTickets(screen.id, categoryIds))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => loadTickets(screen.id, categoryIds))
      .on("postgres_changes", { event: "*", schema: "public", table: "preparation_screens" }, initialize)
      .on("postgres_changes", { event: "*", schema: "public", table: "preparation_screen_categories" }, initialize)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowed, screen, categoryIds, loadTickets]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function markOrderReady(order) {
    setBusyOrder(order.id);
    setError("");
    try {
      const { error: updateError } = await supabase.rpc("complete_preparation_screen_order", {
        p_order_id: order.id,
        p_screen_id: screen.id,
      });
      if (updateError) throw updateError;
      await loadTickets(screen.id, categoryIds);
    } catch (updateError) {
      setError(updateError.message || "تعذر تحديث حالة التجهيز.");
    } finally {
      setBusyOrder(null);
    }
  }

  const pendingCount = useMemo(() => tickets.reduce((sum, order) => sum + order.stationItems.length, 0), [tickets]);

  if (checking) return <main dir="rtl" style={styles.center}>جاري فتح الشاشة...</main>;
  if (!allowed) return <main dir="rtl" style={styles.center}><p>{error || "ليس لديك صلاحية الدخول إلى هذه الشاشة."}</p></main>;

  return (
    <main dir="rtl" style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>ARKAN POS · LIVE PREPARATION</span>
          <h1 style={styles.title}>{screen?.name || "شاشة التجهيز"}</h1>
          <p style={styles.subtitle}>{screen?.station_type === "bar" ? "شاشة البار" : "شاشة المطبخ"} · التحديث تلقائي</p>
        </div>
        <div style={styles.counter}>
          <strong>{tickets.length}</strong><span>أوردر نشط</span><small>{pendingCount} صنف قيد التجهيز</small>
        </div>
      </header>
      {error && <div role="alert" style={styles.error}>{error}</div>}
      {loading ? <div style={styles.empty}>جاري تحميل الطلبات...</div> : tickets.length === 0 ? (
        <div style={styles.empty}><strong>مفيش طلبات حالياً</strong><span>أي طلب جديد للأقسام المرتبطة بالشاشة هيظهر هنا.</span></div>
      ) : (
        <section style={styles.grid}>
          {tickets.map((order) => {
            const minutes = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
            const late = minutes >= 20;
            return (
              <article key={order.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div><span style={styles.orderNumber}>طلب #ARK-{order.id}</span><h2 style={styles.customer}>{order.customer_name || "طلب بدون اسم"}</h2><span style={styles.orderType}>{order.order_type === "dine-in" ? "صالة" : order.order_type === "takeaway" ? "تيك أواي" : "دليفري"}</span></div>
                  <div style={{ ...styles.timer, ...(late ? styles.timerLate : {}) }}><small>وقت الطلب</small><strong>{elapsedLabel(order.created_at, now)}</strong>{late && <b>تأخير أكثر من 20 دقيقة</b>}</div>
                </div>
                {order.notes && <p style={styles.note}>ملاحظة الطلب: {order.notes}</p>}
                <ul style={styles.items}>
                  {order.stationItems.map((item) => <li key={item.id} style={styles.item}><div><strong>{item.product_name}</strong><span>الكمية: {item.quantity}</span>{item.preparation_note && <small>ملاحظة: {item.preparation_note}</small>}</div><span style={styles.pending}>قيد التجهيز</span></li>)}
                </ul>
                <button type="button" disabled={busyOrder === order.id} onClick={() => markOrderReady(order)} style={styles.readyButton}>{busyOrder === order.id ? "جاري الحفظ..." : "✓ تم التجهيز"}</button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 28, background: "#101820", color: "#f5f2ec" },
  center: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#101820", color: "#fff", padding: 24 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 28 },
  eyebrow: { color: "#d3a45f", letterSpacing: 2, fontSize: 12, fontWeight: 800 },
  title: { margin: "8px 0", fontSize: 32 },
  subtitle: { margin: 0, color: "#aab4bd" },
  counter: { display: "grid", gap: 3, minWidth: 140, padding: 16, border: "1px solid #33414c", borderRadius: 14, background: "#17232d", textAlign: "center" },
  error: { padding: 14, marginBottom: 18, color: "#ffd8d8", background: "#612b2b", borderRadius: 10 },
  empty: { minHeight: 220, display: "grid", alignContent: "center", justifyItems: "center", gap: 8, border: "1px dashed #47545f", borderRadius: 16, color: "#aab4bd" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18 },
  card: { padding: 18, border: "1px solid #394650", borderRadius: 16, background: "#1a2731", boxShadow: "0 10px 28px #0003" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  orderNumber: { color: "#d3a45f", fontWeight: 800, fontSize: 13 },
  customer: { margin: "7px 0 3px", fontSize: 21 },
  orderType: { color: "#aab4bd", fontSize: 13 },
  timer: { minWidth: 105, display: "grid", gap: 3, padding: "9px 12px", borderRadius: 10, background: "#263a47", color: "#f5f2ec", textAlign: "center" },
  timerLate: { background: "#7b2929", color: "#fff" },
  note: { padding: 10, background: "#25343f", borderRadius: 8, color: "#e8d7bd" },
  items: { listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gap: 10 },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, background: "#24333e" },
  pending: { whiteSpace: "nowrap", color: "#f0c47c", fontSize: 12 },
  readyButton: { width: "100%", border: 0, borderRadius: 10, padding: 14, background: "#c99a52", color: "#17202a", fontSize: 16, fontWeight: 900, cursor: "pointer" },
};
