
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const statuses = [
  { value: "pending", label: "طلب جديد" },
  { value: "confirmed", label: "تم التأكيد" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغي" },
];

export default function ReservationsManagementPage() {
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("arkan-reservations") || "[]"
      );
      setReservations(Array.isArray(saved) ? saved : []);
    } catch {
      setReservations([]);
    }
  }, []);

  function saveReservations(updated) {
    setReservations(updated);
    localStorage.setItem("arkan-reservations", JSON.stringify(updated));
  }

  function updateStatus(id, status) {
    const updated = reservations.map((item) =>
      item.id === id ? { ...item, status } : item
    );

    saveReservations(updated);

    if (selected?.id === id) {
      setSelected({ ...selected, status });
    }
  }

  function deleteReservation(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذا الحجز؟")) return;

    const updated = reservations.filter((item) => item.id !== id);
    saveReservations(updated);
    setSelected(null);
  }

  const filteredReservations = reservations.filter((item) => {
    const matchesSearch =
      (item.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.phone || "").includes(search);

    const matchesFilter =
      filter === "all" || (item.status || "pending") === filter;

    return matchesSearch && matchesFilter;
  });

  function getStatusLabel(status) {
    return statuses.find((item) => item.value === status)?.label || "طلب جديد";
  }

  function formatDate(date) {
    if (!date) return "—";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleDateString("ar-EG");
  }

  return (
    <main className="admin-layout" dir="rtl">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-logo">
          ARKAN<span>.</span>
        </Link>

        <p className="admin-menu-title">القائمة الرئيسية</p>

        <nav className="admin-nav">
          <Link href="/admin">▦ لوحة التحكم</Link>
          <Link href="/admin/orders">▤ الطلبات</Link>
          <Link href="/admin/reservations" className="active">▣ الحجوزات</Link>
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
            <span className="admin-eyebrow">RESERVATIONS MANAGEMENT</span>
            <h1>إدارة الحجوزات</h1>
            <p>متابعة حجوزات العملاء وتنظيم مواعيد الزيارة</p>
          </div>

          <Link href="/admin" className="orders-back-link">
            العودة للوحة التحكم
          </Link>
        </header>

        <div className="orders-summary">
          <div>
            <span>كل الحجوزات</span>
            <strong>{reservations.length}</strong>
          </div>
          <div>
            <span>طلبات جديدة</span>
            <strong>
              {reservations.filter((r) => (r.status || "pending") === "pending").length}
            </strong>
          </div>
          <div>
            <span>تم التأكيد</span>
            <strong>
              {reservations.filter((r) => r.status === "confirmed").length}
            </strong>
          </div>
          <div>
            <span>مكتمل</span>
            <strong>
              {reservations.filter((r) => r.status === "completed").length}
            </strong>
          </div>
        </div>

        <section className="admin-panel">
          <div className="reservation-toolbar">
            <div>
              <h2>قائمة الحجوزات</h2>
              <p>ابحث عن حجز أو اختر الحالة المطلوبة</p>
            </div>

            <input
              type="search"
              className="reservation-search"
              placeholder="ابحث بالاسم أو رقم الموبايل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="orders-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">كل الحجوزات</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {filteredReservations.length === 0 ? (
            <div className="admin-empty">
              لا توجد حجوزات مطابقة للبحث.
            </div>
          ) : (
            <div className="reservation-admin-list">
              {filteredReservations.map((reservation, index) => (
                <article
                  className="reservation-admin-card"
                  key={reservation.id || index}
                >
                  <div className="reservation-admin-top">
                    <div>
                      <span className="order-number">
                        حجز #{String(reservation.id || index + 1).slice(-6)}
                      </span>
                      <h3>{reservation.name || "عميل"}</h3>
                      <p>{reservation.phone || "لا يوجد رقم"}</p>
                    </div>

                    <span className={`order-status status-${reservation.status || "pending"}`}>
                      {getStatusLabel(reservation.status || "pending")}
                    </span>
                  </div>

                  <div className="reservation-admin-details">
                    <div>
                      <span>تاريخ الحجز</span>
                      <strong>{formatDate(reservation.date)}</strong>
                    </div>
                    <div>
                      <span>الوقت</span>
                      <strong>{reservation.time || "—"}</strong>
                    </div>
                    <div>
                      <span>عدد الأفراد</span>
                      <strong>{reservation.guests || 1}</strong>
                    </div>
                  </div>

                  <div className="reservation-admin-actions">
                    <button
                      type="button"
                      className="order-details-button"
                      onClick={() => setSelected(reservation)}
                    >
                      تفاصيل الحجز
                    </button>

                    <select
                      className="order-status-select"
                      value={reservation.status || "pending"}
                      onChange={(e) =>
                        updateStatus(reservation.id, e.target.value)
                      }
                      aria-label="تغيير حالة الحجز"
                    >
                      {statuses.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="reservation-delete-button"
                      onClick={() => deleteReservation(reservation.id)}
                    >
                      حذف الحجز
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {selected && (
        <div
          className="order-modal-overlay"
          onClick={() => setSelected(null)}
        >
          <section
            className="order-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-modal-heading">
              <h2>تفاصيل الحجز</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <div className="order-modal-info">
              <p><strong>الاسم:</strong> {selected.name || "—"}</p>
              <p><strong>رقم الموبايل:</strong> {selected.phone || "—"}</p>
              <p><strong>التاريخ:</strong> {formatDate(selected.date)}</p>
              <p><strong>الوقت:</strong> {selected.time || "—"}</p>
              <p><strong>عدد الأفراد:</strong> {selected.guests || 1}</p>
              <p><strong>ملاحظات:</strong> {selected.notes || "لا توجد ملاحظات"}</p>
            </div>

            <label className="order-modal-status">
              حالة الحجز
              <select
                value={selected.status || "pending"}
                onChange={(e) => updateStatus(selected.id, e.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
      )}
    </main>
  );
}
