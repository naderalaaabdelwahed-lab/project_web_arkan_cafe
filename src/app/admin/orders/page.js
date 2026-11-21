
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
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [permissions, setPermissions] = useState({
    canCancel: false,
    canViewClosing: false,
  });

  const fetchPermissions = useCallback(async () => {
    const { data: cancel } = await supabase.rpc("has_permission", {
      requested_permission: "orders.cancel",
    });

    const { data: closing } = await supabase.rpc("has_permission", {
      requested_permission: "daily_closing.view",
    });

    const { data: admin } = await supabase.rpc("is_admin");

    setPermissions({
      canCancel: Boolean(admin || cancel),
      canViewClosing: Boolean(admin || closing),
    });
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
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
        setOrders([]);
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("business_day_id", businessDay.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrders(data || []);
    } catch (error) {
      console.error("Fetch Orders Error:", error);
      setError("تعذر تحميل الطلبات: " + error.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchPermissions();
  }, [fetchOrders, fetchPermissions]);

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

  async function handleCancelOrder() {
    if (!cancelOrder || !cancelReason.trim()) {
      setError("اكتب سبب إلغاء الطلب.");
      return;
    }

    setCancelLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: cancelError } = await supabase.rpc("cancel_order", {
        p_order_id: cancelOrder.id,
        p_reason: cancelReason.trim(),
      });

      if (cancelError) throw cancelError;

      setMessage(`تم إلغاء الطلب #ARK-${cancelOrder.id} بنجاح.`);
      setCancelOrder(null);
      setCancelReason("");
      setSelectedOrder(null);

      await fetchOrders();
    } catch (err) {
      setError("تعذر إلغاء الطلب: " + err.message);
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div dir="rtl">
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

          {permissions.canViewClosing && (
            <Link href="/admin/daily-closing" className="orders-back-link">
              الإقفال اليومي
            </Link>
          )}
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

      {error && <p className="form-error">{error}</p>}
      {message && <p>{message}</p>}

      <section className="admin-panel orders-panel">
        <div className="orders-toolbar">
          <div>
            <h2>قائمة الطلبات</h2>
            <p>طلبات اليومية المفتوحة الحالية</p>
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

        {loading ? (
          <div className="admin-empty">جاري تحميل الطلبات...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="admin-empty">
            لا توجد طلبات في اليومية الحالية.
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

                  {permissions.canCancel && order.status !== "cancelled" && (
                    <button
                      type="button"
                      className="order-details-button"
                      onClick={() => {
                        setCancelOrder(order);
                        setCancelReason("");
                        setError("");
                      }}
                    >
                      إلغاء الطلب
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
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
              <p><strong>العميل:</strong> {selectedOrder.customer_name || "—"}</p>
              <p><strong>الموبايل:</strong> {selectedOrder.phone || "—"}</p>
              <p><strong>العنوان:</strong> {selectedOrder.address || "—"}</p>
              <p><strong>نوع الطلب:</strong> {selectedOrder.order_type || "—"}</p>
              <p><strong>طريقة الدفع:</strong> {selectedOrder.payment_method || "—"}</p>
              <p><strong>رسوم التوصيل:</strong> {Number(selectedOrder.delivery_fee || 0)} ج.م</p>
              <p><strong>التاريخ:</strong> {formatDate(selectedOrder.created_at)}</p>
              <p><strong>ملاحظات الطلب:</strong> {selectedOrder.notes || "لا توجد"}</p>

              {selectedOrder.status === "cancelled" && (
                <p>
                  <strong>سبب الإلغاء:</strong>{" "}
                  {selectedOrder.cancellation_reason || "غير مسجل"}
                </p>
              )}
            </div>

            <h3 className="order-items-title">الأصناف</h3>

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

            <div className="order-modal-total">
              الإجمالي: {getTotal(selectedOrder).toLocaleString("en-US")} ج.م
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

      {cancelOrder && (
        <div className="order-modal-overlay">
          <section className="order-modal">
            <div className="order-modal-heading">
              <h2>إلغاء الطلب #ARK-{cancelOrder.id}</h2>
              <button
                type="button"
                onClick={() => setCancelOrder(null)}
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <p>هل أنت متأكد من إلغاء طلب {cancelOrder.customer_name}؟</p>

            <label>
              سبب الإلغاء
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="اكتب سبب إلغاء الطلب..."
                rows={4}
                style={{ width: "100%", marginTop: "10px" }}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="order-card-actions">
              <button
                type="button"
                className="order-details-button"
                onClick={() => setCancelOrder(null)}
                disabled={cancelLoading}
              >
                رجوع
              </button>

              <button
                type="button"
                className="order-details-button"
                onClick={handleCancelOrder}
                disabled={cancelLoading || !cancelReason.trim()}
              >
                {cancelLoading ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
