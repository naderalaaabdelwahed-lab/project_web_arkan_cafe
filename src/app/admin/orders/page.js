
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const statuses = [
  { value: "pending", label: "طلب جديد" },
  { value: "delivered", label: "تم التسليم" },
  { value: "cancelled", label: "ملغي" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch Orders Error:", error);
      setError("تعذر تحميل الطلبات. تأكد من اتصال Supabase وصلاحيات المسؤول.");
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders =
    filter === "all"
      ? orders
      : orders.filter((order) => order.status === filter);

  function getItems(order) {
    return order.order_items || [];
  }

  function getTotal(order) {
    return Number(order.total_amount || 0);
  }

  function getItemsCount(order) {
    return getItems(order).reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );
  }

  function getStatusLabel(status) {
    return (
      statuses.find((item) => item.value === status)?.label ||
      "حالة غير معروفة"
    );
  }

  function formatDate(date) {
    if (!date) return "—";

    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleString("ar-EG");
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
          <Link href="/admin/orders" className="active">
            ▤ الطلبات
          </Link>
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
            <span className="admin-eyebrow">ORDER MANAGEMENT</span>
            <h1>إدارة الطلبات</h1>
            <p>متابعة طلبات العملاء وعرض تفاصيلها</p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="order-details-button"
              onClick={fetchOrders}
              disabled={loading}
            >
              {loading ? "جاري التحديث..." : "↻ تحديث الطلبات"}
            </button>

            <Link href="/admin" className="orders-back-link">
              العودة للوحة التحكم
            </Link>
          </div>
        </header>

        <div className="orders-summary">
          <div>
            <span>كل الطلبات</span>
            <strong>{orders.length}</strong>
          </div>

          <div>
            <span>طلبات جديدة</span>
            <strong>
              {orders.filter((o) => o.status === "pending").length}
            </strong>
          </div>

          <div>
            <span>تم التسليم</span>
            <strong>
              {orders.filter((o) => o.status === "delivered").length}
            </strong>
          </div>

          <div>
            <span>طلبات ملغية</span>
            <strong>
              {orders.filter((o) => o.status === "cancelled").length}
            </strong>
          </div>
        </div>

        <section className="admin-panel orders-panel">
          <div className="orders-toolbar">
            <div>
              <h2>قائمة الطلبات</h2>
              <p>الطلبات المسجلة في قاعدة البيانات</p>
            </div>

            <select
              className="orders-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">كل الطلبات</option>

              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="admin-empty">جاري تحميل الطلبات...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="admin-empty">
              لا توجد طلبات في هذا القسم حتى الآن.
            </div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-card-top">
                    <div>
                      <span className="order-number">
                        طلب #ARK-{order.id}
                      </span>

                      <h3>{order.customer_name || "غير محدد"}</h3>
                      <p>{order.phone || "—"}</p>
                    </div>

                    <span className={`order-status status-${order.status}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </div>

                  <div className="order-card-info">
                    <div>
                      <span>الإجمالي</span>
                      <strong>
                        {getTotal(order).toLocaleString("en-US")} ج.م
                      </strong>
                    </div>

                    <div>
                      <span>عدد القطع</span>
                      <strong>{getItemsCount(order)}</strong>
                    </div>

                    <div>
                      <span>تاريخ الطلب</span>
                      <strong>{formatDate(order.created_at)}</strong>
                    </div>
                  </div>

                  <div className="order-card-actions">
                    <button
                      type="button"
                      className="order-details-button"
                      onClick={() => setSelectedOrder(order)}
                    >
                      تفاصيل الطلب
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {selectedOrder && (
        <div
          className="order-modal-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <section
            className="order-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-modal-heading">
              <h2>تفاصيل الطلب #ARK-{selectedOrder.id}</h2>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <div className="order-modal-info">
              <p>
                <strong>العميل:</strong>{" "}
                {selectedOrder.customer_name || "—"}
              </p>

              <p>
                <strong>الموبايل:</strong>{" "}
                {selectedOrder.phone || "—"}
              </p>

              <p>
                <strong>العنوان:</strong>{" "}
                {selectedOrder.address || "—"}
              </p>

              <p>
                <strong>نوع الطلب:</strong>{" "}
                {selectedOrder.order_type || "—"}
              </p>

              <p>
                <strong>طريقة الدفع:</strong>{" "}
                {selectedOrder.payment_method || "—"}
              </p>

              <p>
                <strong>رسوم التوصيل:</strong>{" "}
                {Number(selectedOrder.delivery_fee || 0)} ج.م
              </p>

              <p>
                <strong>التاريخ:</strong>{" "}
                {formatDate(selectedOrder.created_at)}
              </p>

              <p>
                <strong>ملاحظات الطلب:</strong>{" "}
                {selectedOrder.notes || "لا توجد"}
              </p>

              {selectedOrder.status === "cancelled" && (
                <p>
                  <strong>سبب إلغاء الطلب:</strong>{" "}
                  {selectedOrder.cancellation_reason ||
                    "لم يتم تسجيل سبب الإلغاء"}
                </p>
              )}
            </div>

            <h3 className="order-items-title">الأصناف</h3>

            {getItems(selectedOrder).length === 0 ? (
              <p className="admin-empty">لا توجد أصناف مسجلة.</p>
            ) : (
              <div className="order-items-list">
                {getItems(selectedOrder).map((item) => (
                  <div className="order-item-row" key={item.id}>
                    <span>{item.product_name}</span>
                    <span>× {item.quantity}</span>

                    <strong>
                      {Number(item.subtotal || 0).toLocaleString("en-US")} ج.م
                    </strong>
                  </div>
                ))}
              </div>
            )}

            <div className="order-modal-total">
              الإجمالي:{" "}
              {getTotal(selectedOrder).toLocaleString("en-US")} ج.م
            </div>

            <div className="order-modal-status">
              <strong>حالة الطلب:</strong>{" "}
              <span className={`order-status status-${selectedOrder.status}`}>
                {getStatusLabel(selectedOrder.status)}
              </span>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
