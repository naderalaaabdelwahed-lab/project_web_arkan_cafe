"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function formatElapsed(createdAt, now) {
  const started = new Date(createdAt).getTime();
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function PreparationStationPage({ station }) {
  const isKitchen = station === "kitchen";
  const title = isKitchen ? "شاشة المطبخ" : "شاشة البار";
  const permission = `${station}.view`;

  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [busyOrder, setBusyOrder] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const loadTickets = useCallback(async () => {
    setError("");
    try {
      const { data: businessDay, error: dayError } = await supabase
        .from("business_days")
        .select("id")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dayError) throw dayError;
      if (!businessDay) {
        setTickets([]);
        return;
      }

      const { data, error: ordersError } = await supabase
        .from("orders")
        .select("id, customer_name, order_type, created_at, status, notes, order_items(id, product_name, quantity, preparation_station, preparation_status, preparation_note)")
        .eq("business_day_id", businessDay.id)
        .in("status", ["pending", "confirmed", "preparing"])
        .order("created_at", { ascending: true });

      if (ordersError) throw ordersError;

      const stationTickets = (data || [])
        .map((order) => ({
          ...order,
          stationItems: (order.order_items || []).filter(
            (item) =>
              item.preparation_station === station &&
              item.preparation_status !== "ready"
          ),
        }))
        .filter((order) => order.stationItems.length > 0);

      setTickets(stationTickets);
    } catch (loadError) {
      console.error("Preparation screen load error:", loadError);
      setError(loadError.message || "تعذر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    let active = true;

    async function checkPermission() {
      setChecking(true);
      try {
        const [{ data: admin, error: adminError }, { data: permitted, error: permissionError }] =
          await Promise.all([
            supabase.rpc("is_admin"),
            supabase.rpc("has_permission", { requested_permission: permission }),
          ]);

        if (adminError) throw adminError;
        if (permissionError) throw permissionError;

        if (!active) return;
        const canOpen = Boolean(admin || permitted);
        setAllowed(canOpen);
        if (canOpen) await loadTickets();
      } catch (permissionCheckError) {
        if (active) setError(permissionCheckError.message || "تعذر التحقق من الصلاحيات.");
      } finally {
        if (active) setChecking(false);
      }
    }

    checkPermission();

    return () => {
      active = false;
    };
  }, [permission, loadTickets]);

  useEffect(() => {
    if (!allowed) return undefined;

    const channel = supabase
      .channel(`pos-${station}-tickets`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadTickets)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, loadTickets)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed, station, loadTickets]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function markOrderReady(order) {
    setBusyOrder(order.id);
    setError("");
    try {
      const { error: updateError } = await supabase.rpc("complete_station_order", {
        p_order_id: order.id,
        p_station: station,
      });
      if (updateError) throw updateError;
      await loadTickets();
    } catch (updateError) {
      setError(updateError.message || "تعذر تحديث حالة التجهيز.");
    } finally {
      setBusyOrder(null);
    }
  }

  const pendingCount = useMemo(
    () => tickets.reduce((total, ticket) => total + ticket.stationItems.length, 0),
    [tickets]
  );

  if (checking) {
    return <main dir="rtl" style={styles.center}>جاري التحقق من الصلاحيات...</main>;
  }

  if (!allowed) {
    return (
      <main dir="rtl" style={styles.page}>
        <h1>{title}</h1>
        <p style={styles.error}>ليس لديك صلاحية الدخول إلى هذه الشاشة.</p>
      </main>
    );
  }

  return (
    <main dir="rtl" style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>ARKAN POS · LIVE PREPARATION</span>
          <h1 style={styles.heading}>{title}</h1>
          <p style={styles.subheading}>
            {isKitchen ? "طلبات الأكل فقط" : "طلبات المشروبات فقط"} · التحديث تلقائي
          </p>
        </div>
        <div style={styles.counter}>
          <strong>{tickets.length}</strong>
          <span>أوردر نشط</span>
          <small>{pendingCount} صنف قيد التجهيز</small>
        </div>
      </header>

      {error && <div role="alert" style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.empty}>جاري تحميل الطلبات...</div>
      ) : tickets.length === 0 ? (
        <div style={styles.empty}>
          <strong>مفيش طلبات حالياً</strong>
          <span>أي طلب جديد للقسم هيظهر هنا تلقائياً.</span>
        </div>
      ) : (
        <section style={styles.grid}>
          {tickets.map((order) => {
            const elapsed = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
            const late = elapsed >= 20;
            return (
              <article key={order.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div>
                    <span style={styles.orderNumber}>طلب #ARK-{order.id}</span>
                    <h2 style={styles.customer}>{order.customer_name || "طلب بدون اسم"}</h2>
                    <span style={styles.orderType}>
                      {order.order_type === "dine-in" ? "صالة" : order.order_type === "takeaway" ? "تيك أواي" : "دليفري"}
                    </span>
                  </div>
                  <div style={{ ...styles.timer, ...(late ? styles.timerLate : {}) }}>
                    <small>وقت الطلب</small>
                    <strong>{formatElapsed(order.created_at, now)}</strong>
                    {late && <b>تأخير أكثر من 20 دقيقة</b>}
                  </div>
                </div>

                {order.notes && <p style={styles.orderNote}>ملاحظة الطلب: {order.notes}</p>}

                <ul style={styles.items}>
                  {order.stationItems.map((item) => (
                    <li key={item.id} style={styles.item}>
                      <div>
                        <strong>{item.product_name}</strong>
                        <span>الكمية: {item.quantity}</span>
                        {item.preparation_note && <small>ملاحظة: {item.preparation_note}</small>}
                      </div>
                      <span style={styles.pending}>قيد التجهيز</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => markOrderReady(order)}
                  disabled={busyOrder === order.id}
                  style={styles.readyButton}
                >
                  {busyOrder === order.id ? "جاري الحفظ..." : "✓ تم التجهيز"}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: "28px", background: "#101820", color: "#f5f2ec" },
  center: { minHeight: "60vh", display: "grid", placeItems: "center", background: "#101820", color: "#fff" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 28 },
  eyebrow: { color: "#d3a45f", letterSpacing: 2, fontSize: 12, fontWeight: 800 },
  heading: { margin: "8px 0", fontSize: 32 },
  subheading: { margin: 0, color: "#aab4bd" },
  counter: { display: "grid", gap: 3, minWidth: 140, padding: 16, border: "1px solid #33414c", borderRadius: 14, background: "#17232d", textAlign: "center" },
  counterStrong: {},
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
  orderNote: { padding: 10, background: "#25343f", borderRadius: 8, color: "#e8d7bd" },
  items: { listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gap: 10 },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, background: "#24333e" },
  pending: { whiteSpace: "nowrap", color: "#f0c47c", fontSize: 12 },
  readyButton: { width: "100%", border: 0, borderRadius: 10, padding: 14, background: "#c99a52", color: "#17202a", fontSize: 16, fontWeight: 900, cursor: "pointer" },
};
