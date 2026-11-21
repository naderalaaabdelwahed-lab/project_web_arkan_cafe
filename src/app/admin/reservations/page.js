
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadReservations();
  }, []);

  async function loadReservations() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError("فشل تحميل الحجوزات: " + error.message);
    } else {
      setReservations(data || []);
    }

    setLoading(false);
  }

  async function updateStatus(id, status) {
    setError("");
    setMessage("");

    const { data, error } = await supabase
      .from("reservations")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      setError("فشل تحديث حالة الحجز: " + error.message);
      return;
    }

    setReservations((previous) =>
      previous.map((item) => (item.id === id ? data : item))
    );

    if (selected?.id === id) {
      setSelected(data);
    }

    setMessage("تم تحديث حالة الحجز بنجاح.");
  }

  async function deleteReservation(id) {
    if (!window.confirm("هل أنت متأكد من حذف هذا الحجز؟")) return;

    setError("");
    setMessage("");

    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", id);

    if (error) {
      setError("فشل حذف الحجز: " + error.message);
      return;
    }

    setReservations((previous) =>
      previous.filter((item) => item.id !== id)
    );

    setSelected(null);
    setMessage("تم حذف الحجز بنجاح.");
  }

  const filteredReservations = reservations.filter((item) => {
    const name = (item.customer_name || "").toLowerCase();
    const phone = item.phone || "";

    const matchesSearch =
      name.includes(search.toLowerCase()) || phone.includes(search);

    const matchesFilter = filter === "all" || item.status === filter;

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

  function getSeatingLabel(area) {
    return area === "outdoor" ? "الصالة الخارجية" : "الصالة الداخلية";
  }

  return (
    <div dir="rtl">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">RESERVATIONS MANAGEMENT</span>
          <h1>إدارة الحجوزات</h1>
          <p>متابعة حجوزات العملاء وتنظيم مواعيد الزيارة</p>
        </div>

        <button
          type="button"
          onClick={loadReservations}
          className="order-details-button"
          disabled={loading}
        >
          تحديث الحجوزات
        </button>
      </header>

      {message && (
        <div className="admin-panel" style={{ marginBottom: 20, color: "green" }}>
          {message}
        </div>
      )}

      {error && (
        <div className="admin-panel" style={{ marginBottom: 20, color: "#c0392b" }}>
          {error}
        </div>
      )}

      <div className="orders-summary">
        <div>
          <span>كل الحجوزات</span>
          <strong>{reservations.length}</strong>
        </div>

        <div>
          <span>طلبات جديدة</span>
          <strong>
            {reservations.filter((r) => r.status === "pending").length}
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

        {loading ? (
          <div className="admin-empty">جاري تحميل الحجوزات...</div>
        ) : filteredReservations.length === 0 ? (
          <div className="admin-empty">لا توجد حجوزات مطابقة للبحث.</div>
        ) : (
          <div className="reservation-admin-list">
            {filteredReservations.map((reservation) => (
              <article
                className="reservation-admin-card"
                key={reservation.id}
              >
                <div className="reservation-admin-top">
                  <div>
                    <span className="order-number">
                      حجز #{reservation.id}
                    </span>

                    <h3>{reservation.customer_name || "عميل"}</h3>
                    <p>{reservation.phone || "لا يوجد رقم"}</p>
                  </div>

                  <span
                    className={`order-status status-${reservation.status || "pending"}`}
                  >
                    {getStatusLabel(reservation.status)}
                  </span>
                </div>

                <div className="reservation-admin-details">
                  <div>
                    <span>تاريخ الحجز</span>
                    <strong>{formatDate(reservation.reservation_date)}</strong>
                  </div>

                  <div>
                    <span>الوقت</span>
                    <strong>{reservation.reservation_time || "—"}</strong>
                  </div>

                  <div>
                    <span>عدد الأفراد</span>
                    <strong>{reservation.guests || 1}</strong>
                  </div>

                  <div>
                    <span>مكان الجلوس</span>
                    <strong>{getSeatingLabel(reservation.seating_area)}</strong>
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
              <p><strong>رقم الحجز:</strong> {selected.id}</p>
              <p><strong>الاسم:</strong> {selected.customer_name || "—"}</p>
              <p><strong>رقم الموبايل:</strong> {selected.phone || "—"}</p>
              <p><strong>التاريخ:</strong> {formatDate(selected.reservation_date)}</p>
              <p><strong>الوقت:</strong> {selected.reservation_time || "—"}</p>
              <p><strong>عدد الأفراد:</strong> {selected.guests || 1}</p>
              <p><strong>مكان الجلوس:</strong> {getSeatingLabel(selected.seating_area)}</p>
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
    </div>
  );
}
