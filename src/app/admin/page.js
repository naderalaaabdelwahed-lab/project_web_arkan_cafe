
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);

  useEffect(() => {
    try {
      setOrders(JSON.parse(localStorage.getItem("arkan-orders") || "[]"));
      setReservations(
        JSON.parse(localStorage.getItem("arkan-reservations") || "[]")
      );
    } catch {
      setOrders([]);
      setReservations([]);
    }
  }, []);

  const getOrderTotal = (order) =>
    Number(
      order.total ??
      order.totalPrice ??
      order.grandTotal ??
      order.totalAmount ??
      0
    );

  const totalSales = orders.reduce(
    (sum, order) => sum + getOrderTotal(order),
    0
  );

  const pendingOrders = orders.filter(
    (order) =>
      ["pending", "new", "قيد الانتظار"].includes(
        String(order.status || "").toLowerCase()
      )
  ).length;

  const pendingReservations = reservations.filter(
    (reservation) =>
      ["pending", "new", "قيد الانتظار"].includes(
        String(reservation.status || "").toLowerCase()
      )
  ).length;

  const recentOrders = [...orders].slice(-5).reverse();
  const recentReservations = [...reservations].slice(-5).reverse();

  const formatDate = (date) => {
    if (!date) return "—";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleDateString("ar-EG");
  };

  return (
    <main className="admin-layout" dir="rtl">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-logo">
          ARKAN<span>.</span>
        </Link>

        <p className="admin-menu-title">القائمة الرئيسية</p>

        <nav className="admin-nav">
          <Link href="/admin" className="active">▦ لوحة التحكم</Link>
          <Link href="/admin/orders">▤ الطلبات</Link>
          <Link href="/admin/reservations">▣ الحجوزات</Link>
          <Link href="/admin/menu">☷ إدارة المنيو</Link>
          <Link href="/">↩ العودة للموقع</Link>
        </nav>

        <div className="admin-sidebar-footer">
          <span>ARKAN MANAGEMENT</span>
          <small>Admin Dashboard</small>
        </div>
      </aside>

      <section className="admin-main">
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

        <div className="admin-stats">
          <article className="admin-stat-card">
            <span className="stat-icon">▤</span>
            <p>إجمالي الطلبات</p>
            <h2>{orders.length}</h2>
            <small>كل الطلبات المسجلة</small>
          </article>

          <article className="admin-stat-card">
            <span className="stat-icon">◷</span>
            <p>طلبات قيد الانتظار</p>
            <h2>{pendingOrders}</h2>
            <small>تحتاج إلى متابعة</small>
          </article>

          <article className="admin-stat-card">
            <span className="stat-icon">▣</span>
            <p>الحجوزات</p>
            <h2>{reservations.length}</h2>
            <small>{pendingReservations} حجز في انتظار المراجعة</small>
          </article>

          <article className="admin-stat-card">
            <span className="stat-icon">ج.م</span>
            <p>إجمالي قيمة الطلبات</p>
            <h2>{totalSales.toLocaleString("en-US")}</h2>
            <small>جنيه مصري</small>
          </article>
        </div>

        <div className="admin-content-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h2>أحدث الطلبات</h2>
                <p>آخر الطلبات المسجلة</p>
              </div>
              <Link href="/admin/orders">عرض الكل ←</Link>
            </div>

            {recentOrders.length === 0 ? (
              <div className="admin-empty">لا توجد طلبات حتى الآن</div>
            ) : (
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>رقم الطلب</th>
                      <th>العميل</th>
                      <th>الإجمالي</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order, index) => (
                      <tr key={order.id || index}>
                        <td>#{String(order.id || index + 1).slice(-6)}</td>
                        <td>
                          {order.name ||
                            order.customerName ||
                            order.customer?.name ||
                            "عميل"}
                        </td>
                        <td>{getOrderTotal(order)} ج.م</td>
                        <td>
                          {formatDate(order.createdAt || order.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h2>أحدث الحجوزات</h2>
                <p>طلبات حجز الترابيزات</p>
              </div>
              <Link href="/admin/reservations">عرض الكل ←</Link>
            </div>

            {recentReservations.length === 0 ? (
              <div className="admin-empty">لا توجد حجوزات حتى الآن</div>
            ) : (
              <div className="admin-reservation-list">
                {recentReservations.map((reservation, index) => (
                  <div
                    className="admin-reservation-item"
                    key={reservation.id || index}
                  >
                    <div>
                      <strong>{reservation.name || "عميل"}</strong>
                      <p>
                        {reservation.guests || 1} أفراد ·{" "}
                        {reservation.time || "—"}
                      </p>
                    </div>
                    <span>{formatDate(reservation.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
