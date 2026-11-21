"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [businessDay, setBusinessDay] = useState(null);

  const [settings, setSettings] = useState({
    indoor_tables: 10,
    outdoor_tables: 6,
    seats_per_table: 4,
  });

  const [permissions, setPermissions] = useState({
    dashboardView: false,
    ordersView: false,
    reservationsView: false,
    hallView: false,
    hallUpdate: false,
  });

  const [accessLoading, setAccessLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const can = (permission) => permissions[permission] === true;

  useEffect(() => {
    initializeDashboard();
  }, []);

  async function initializeDashboard() {
    setAccessLoading(true);
    setLoading(true);
    setMessage("");

    try {
      const [
        adminResult,
        dashboardResult,
        ordersResult,
        reservationsResult,
        hallViewResult,
        hallUpdateResult,
      ] = await Promise.all([
        supabase.rpc("is_admin"),
        supabase.rpc("has_permission", {
          requested_permission: "dashboard.view",
        }),
        supabase.rpc("has_permission", {
          requested_permission: "orders.view",
        }),
        supabase.rpc("has_permission", {
          requested_permission: "reservations.view",
        }),
        supabase.rpc("has_permission", {
          requested_permission: "hall.view",
        }),
        supabase.rpc("has_permission", {
          requested_permission: "hall.update",
        }),
      ]);

      const results = [
        adminResult,
        dashboardResult,
        ordersResult,
        reservationsResult,
        hallViewResult,
        hallUpdateResult,
      ];

      const failedResult = results.find((result) => result.error);
      if (failedResult) throw failedResult.error;

      const isAdmin = Boolean(adminResult.data);

      const currentPermissions = {
        dashboardView: isAdmin || Boolean(dashboardResult.data),
        ordersView: isAdmin || Boolean(ordersResult.data),
        reservationsView: isAdmin || Boolean(reservationsResult.data),
        hallView: isAdmin || Boolean(hallViewResult.data),
        hallUpdate: isAdmin || Boolean(hallUpdateResult.data),
      };

      setPermissions(currentPermissions);
      setAccessLoading(false);

      if (!currentPermissions.dashboardView) {
        setLoading(false);
        return;
      }

      await loadDashboard(currentPermissions);
    } catch (error) {
      console.error("Dashboard permissions error:", error);
      setMessage("حصل خطأ أثناء التحقق من الصلاحيات: " + error.message);
      setAccessLoading(false);
      setLoading(false);
    }
  }

  async function loadDashboard(currentPermissions = permissions) {
    if (!currentPermissions.dashboardView) return;

    setLoading(true);
    setMessage("");

    try {
      const [dayResult, reservationsResult, settingsResult] =
        await Promise.all([
          supabase
            .from("business_days")
            .select("*")
            .eq("status", "open")
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle(),

          currentPermissions.reservationsView
            ? supabase
                .from("reservations")
                .select("*")
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),

          currentPermissions.hallView
            ? supabase
                .from("restaurant_settings")
                .select("*")
                .eq("id", 1)
                .single()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (dayResult.error) throw dayResult.error;
      if (reservationsResult.error) throw reservationsResult.error;
      if (settingsResult.error) throw settingsResult.error;

      const currentDay = dayResult.data;
      setBusinessDay(currentDay);

      let currentOrders = [];

      if (currentDay && currentPermissions.ordersView) {
        const ordersResult = await supabase
          .from("orders")
          .select("*")
          .eq("business_day_id", currentDay.id)
          .order("created_at", { ascending: false });

        if (ordersResult.error) throw ordersResult.error;

        currentOrders = ordersResult.data || [];
      }

      setOrders(currentOrders);
      setReservations(reservationsResult.data || []);

      if (settingsResult.data) {
        setSettings({
          indoor_tables: settingsResult.data.indoor_tables,
          outdoor_tables: settingsResult.data.outdoor_tables,
          seats_per_table: settingsResult.data.seats_per_table,
        });
      }

      if (!currentDay) {
        setMessage(
          "لا توجد يومية مفتوحة حاليًا. لا يمكن تسجيل طلبات جديدة حتى فتح يومية."
        );
      }
    } catch (error) {
      console.error("Dashboard error:", error);
      setMessage("حصل خطأ أثناء تحميل البيانات: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!can("hallUpdate")) {
      setMessage("ليس لديك صلاحية تعديل إعدادات الصالة.");
      return;
    }

    const indoor = Number(settings.indoor_tables);
    const outdoor = Number(settings.outdoor_tables);
    const seats = Number(settings.seats_per_table);

    if (
      !Number.isInteger(indoor) ||
      !Number.isInteger(outdoor) ||
      !Number.isInteger(seats) ||
      indoor < 0 ||
      outdoor < 0 ||
      seats < 1
    ) {
      setMessage(
        "راجع الأرقام: عدد الطاولات لا يقل عن صفر، والأفراد لا يقل عن 1."
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update({
          indoor_tables: indoor,
          outdoor_tables: outdoor,
          seats_per_table: seats,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setMessage("تم حفظ إعدادات الصالة بنجاح.");
      await loadDashboard();
    } catch (error) {
      console.error("Save settings error:", error);
      setMessage("تعذر حفظ الإعدادات: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  const activeOrders = orders.filter(
    (order) =>
      !["cancelled", "canceled"].includes(
        String(order.status || "").toLowerCase()
      )
  );

  const cancelledOrders = orders.filter((order) =>
    ["cancelled", "canceled"].includes(
      String(order.status || "").toLowerCase()
    )
  );

  const totalSales = activeOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const pendingOrders = orders.filter(
    (order) => order.status === "pending"
  ).length;

  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "pending"
  ).length;

  const salesByType = {
    delivery: 0,
    takeaway: 0,
    dine_in: 0,
  };

  activeOrders.forEach((order) => {
    const type = String(order.order_type || "").toLowerCase();

    if (type === "delivery") {
      salesByType.delivery += Number(order.total_amount || 0);
    } else if (type === "takeaway") {
      salesByType.takeaway += Number(order.total_amount || 0);
    } else if (
      type === "dine_in" ||
      type === "dine-in" ||
      type === "dinein"
    ) {
      salesByType.dine_in += Number(order.total_amount || 0);
    }
  });

  const recentOrders = orders.slice(0, 5);
  const recentReservations = reservations.slice(0, 5);

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString("ar-EG", {
      maximumFractionDigits: 2,
    }) + " ج.م";

  const formatDate = (date) => {
    if (!date) return "—";

    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleDateString("ar-EG");
  };

  if (accessLoading) {
    return (
      <div className="admin-panel">
        جاري التحقق من الصلاحيات...
      </div>
    );
  }

  if (!can("dashboardView")) {
    return (
      <div className="admin-panel">
        ليس لديك صلاحية الوصول إلى لوحة التحكم.
      </div>
    );
  }

  return (
    <>
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">OVERVIEW</span>
          <h1>لوحة التحكم</h1>
          <p>أهلاً بيك في نظام إدارة مطعم أركان</p>
        </div>

        <div className="admin-date">
          {new Date().toLocaleDateString("ar-EG")}
        </div>
      </header>

      {message && (
        <div className="admin-panel" style={{ marginBottom: 20 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="admin-panel">جاري تحميل البيانات...</div>
      ) : (
        <>
          <section className="admin-panel" style={{ marginBottom: 25 }}>
            <div className="admin-panel-heading">
              <div>
                <h2>اليومية الحالية</h2>
                <p>
                  {businessDay
                    ? `يومية رقم #${businessDay.id} · ${formatDate(
                        businessDay.business_date
                      )}`
                    : "لا توجد يومية مفتوحة"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadDashboard()}
                style={{
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: "#b88946",
                  color: "#fff",
                  fontWeight: "bold",
                }}
              >
                تحديث البيانات
              </button>
            </div>
          </section>

          {can("ordersView") && (
            <>
              <div className="admin-stats">
                <article className="admin-stat-card">
                  <span className="stat-icon">▤</span>
                  <p>إجمالي الطلبات</p>
                  <h2>{orders.length}</h2>
                  <small>طلبات اليومية الحالية</small>
                </article>

                <article className="admin-stat-card">
                  <span className="stat-icon">◷</span>
                  <p>طلبات قيد الانتظار</p>
                  <h2>{pendingOrders}</h2>
                  <small>تحتاج إلى متابعة</small>
                </article>

                <article className="admin-stat-card">
                  <span className="stat-icon">✕</span>
                  <p>الطلبات الملغاة</p>
                  <h2>{cancelledOrders.length}</h2>
                  <small>مستبعدة من المبيعات</small>
                </article>

                <article className="admin-stat-card">
                  <span className="stat-icon">ج.م</span>
                  <p>إجمالي المبيعات</p>
                  <h2>{formatMoney(totalSales)}</h2>
                  <small>طلبات اليومية غير الملغاة</small>
                </article>
              </div>

              <section className="admin-panel" style={{ marginBottom: 25 }}>
                <div className="admin-panel-heading">
                  <div>
                    <h2>مبيعات حسب نوع الطلب</h2>
                    <p>تشمل طلبات اليومية الحالية غير الملغاة</p>
                  </div>
                </div>

                <div className="admin-stats">
                  <article className="admin-stat-card">
                    <p>Delivery</p>
                    <h2>{formatMoney(salesByType.delivery)}</h2>
                  </article>

                  <article className="admin-stat-card">
                    <p>Takeaway</p>
                    <h2>{formatMoney(salesByType.takeaway)}</h2>
                  </article>

                  <article className="admin-stat-card">
                    <p>Dine In</p>
                    <h2>{formatMoney(salesByType.dine_in)}</h2>
                  </article>
                </div>
              </section>
            </>
          )}

          {can("hallView") && (
            <section className="admin-panel" style={{ marginBottom: 25 }}>
              <div className="admin-panel-heading">
                <div>
                  <h2>إعدادات الصالة</h2>
                  <p>سعة الصالة الداخلية والخارجية</p>
                </div>
              </div>

              <div className="admin-stats">
                <article className="admin-stat-card">
                  <span className="stat-icon">⌂</span>
                  <p>عدد طاولات الصالة الداخلية</p>

                  {can("hallUpdate") ? (
                    <input
                      type="number"
                      min="0"
                      value={settings.indoor_tables}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          indoor_tables: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <h2>{settings.indoor_tables}</h2>
                  )}
                </article>

                <article className="admin-stat-card">
                  <span className="stat-icon">☀</span>
                  <p>عدد طاولات الصالة الخارجية</p>

                  {can("hallUpdate") ? (
                    <input
                      type="number"
                      min="0"
                      value={settings.outdoor_tables}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          outdoor_tables: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <h2>{settings.outdoor_tables}</h2>
                  )}
                </article>

                <article className="admin-stat-card">
                  <span className="stat-icon">♙</span>
                  <p>عدد الأفراد لكل طاولة</p>

                  {can("hallUpdate") ? (
                    <input
                      type="number"
                      min="1"
                      value={settings.seats_per_table}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          seats_per_table: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <h2>{settings.seats_per_table}</h2>
                  )}
                </article>
              </div>

              {can("hallUpdate") && (
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving}
                  style={{
                    marginTop: 20,
                    padding: "12px 28px",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                    background: "#b88946",
                    color: "#fff",
                    fontWeight: "bold",
                  }}
                >
                  {saving ? "جاري الحفظ..." : "حفظ إعدادات الصالة"}
                </button>
              )}
            </section>
          )}

          <div className="admin-content-grid">
            {can("ordersView") && (
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>أحدث الطلبات</h2>
                    <p>آخر طلبات اليومية الحالية</p>
                  </div>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="admin-empty">
                    لا توجد طلبات في اليومية الحالية
                  </div>
                ) : (
                  <div className="admin-table-wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>رقم الطلب</th>
                          <th>العميل</th>
                          <th>الإجمالي</th>
                          <th>الحالة</th>
                          <th>التاريخ</th>
                        </tr>
                      </thead>

                      <tbody>
                        {recentOrders.map((order) => (
                          <tr key={order.id}>
                            <td>#{order.id}</td>
                            <td>{order.customer_name || "عميل"}</td>
                            <td>{formatMoney(order.total_amount)}</td>
                            <td>{order.status}</td>
                            <td>{formatDate(order.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {can("reservationsView") && (
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>أحدث الحجوزات</h2>
                    <p>
                      {pendingReservations} حجز في انتظار المراجعة
                    </p>
                  </div>
                </div>

                {recentReservations.length === 0 ? (
                  <div className="admin-empty">
                    لا توجد حجوزات حتى الآن
                  </div>
                ) : (
                  <div className="admin-reservation-list">
                    {recentReservations.map((reservation) => (
                      <div
                        className="admin-reservation-item"
                        key={reservation.id}
                      >
                        <div>
                          <strong>
                            {reservation.customer_name || "عميل"}
                          </strong>
                          <p>
                            {reservation.guests} أفراد ·{" "}
                            {reservation.reservation_time || "—"}
                          </p>
                        </div>

                        <span>
                          {formatDate(reservation.reservation_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}