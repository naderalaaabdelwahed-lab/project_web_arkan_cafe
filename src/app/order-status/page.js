
"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";

const WHATSAPP_NUMBER = "201028808164";

const STATUS_LABELS = {
  pending: "قيد الانتظار",
  delivered: "مكتمل وتم التسليم",
  cancelled: "ملغي",
};

export default function OrderStatusPage() {
  const [orderReference, setOrderReference] = useState("");
  const [cancellationCode, setCancellationCode] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [error, setError] = useState("");
  const [cancelError, setCancelError] = useState("");

  const [cancelled, setCancelled] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");

  async function handleSearch(event) {
    event.preventDefault();

    setError("");
    setCancelError("");
    setOrder(null);
    setCancelled(false);
    setWhatsappUrl("");

    const match = orderReference.trim().match(/^ARK-(\d+)$/i);

    if (!match) {
      setError("اكتب رقم الطلب بالشكل الصحيح، مثال ARK-125.");
      return;
    }

    const token = cancellationCode.trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ) {
      setError("كود الإلغاء غير صحيح.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_customer_order_status",
        {
          p_order_id: Number(match[1]),
          p_cancellation_token: token,
        }
      );

      if (rpcError) throw rpcError;

      if (!data || data.length === 0) {
        setError("لم يتم العثور على الطلب. تأكد من الرقم المرجعي وكود الإلغاء.");
        return;
      }

      setOrder({
        id: `ARK-${match[1]}`,
        databaseId: Number(match[1]),
        token,
        status: data[0].order_status,
        total: data[0].order_total,
        date: data[0].order_date,
      });
    } catch (err) {
      console.error("Order Search Error:", err);
      setError("حصل خطأ أثناء الاستعلام. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!order || cancelLoading || order.status !== "pending") return;

    const reason = cancellationReason.trim();

    if (!reason) {
      setCancelError("من فضلك اكتب سبب إلغاء الطلب.");
      return;
    }

    if (reason.length > 500) {
      setCancelError("سبب الإلغاء يجب ألا يتجاوز 500 حرف.");
      return;
    }

    const confirmed = window.confirm(
      "هل أنت متأكد من إلغاء هذا الطلب؟"
    );

    if (!confirmed) return;

    setCancelLoading(true);
    setCancelError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "cancel_customer_order",
        {
          p_order_id: order.databaseId,
          p_cancellation_token: order.token,
          p_cancellation_reason: reason,
        }
      );

      if (rpcError) throw rpcError;

      if (!data) {
        throw new Error(
          "لم يتم الإلغاء. ربما تم تغيير حالة الطلب بالفعل."
        );
      }

      setOrder((current) => ({
        ...current,
        status: "cancelled",
      }));

      setCancelled(true);

      const message = `
❌ *إلغاء طلب - ARKAN Cafe*

🔖 رقم الطلب: ${order.id}

📝 سبب الإلغاء:
${reason}

تم إلغاء الطلب بواسطة العميل.
يرجى مراجعة الطلب في لوحة الإدارة.
`;

      setWhatsappUrl(
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
      );
    } catch (err) {
      console.error("Cancel Error:", err);
      setCancelError(err.message || "حصل خطأ أثناء إلغاء الطلب.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <main dir="rtl">
      <Navbar />

      <section className="checkout-section">
        <div className="section-heading">
          <span className="eyebrow">TRACK YOUR ORDER</span>

          <h1>
            استعلام عن <span>الطلب</span>
          </h1>

          <p>
            أدخل الرقم المرجعي وكود الإلغاء لمعرفة حالة طلبك.
          </p>
        </div>

        <div className="success-card">
          <form className="checkout-form" onSubmit={handleSearch}>
            <label>الرقم المرجعي</label>

            <input
              type="text"
              placeholder="مثال: ARK-125"
              value={orderReference}
              onChange={(e) => setOrderReference(e.target.value)}
              required
            />

            <label>كود الإلغاء</label>

            <input
              type="text"
              placeholder="أدخل كود الإلغاء الموجود في واتساب"
              value={cancellationCode}
              onChange={(e) => setCancellationCode(e.target.value)}
              required
            />

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "جاري البحث..." : "استعلام عن الطلب"}
            </button>
          </form>

          {order && (
            <div style={{ marginTop: "30px", textAlign: "right" }}>
              <hr />

              <h2>نتيجة الاستعلام</h2>

              <p>
                رقم الطلب: <strong>{order.id}</strong>
              </p>

              <p>
                حالة الطلب:{" "}
                <strong>
                  {STATUS_LABELS[order.status] || order.status}
                </strong>
              </p>

              <p>
                إجمالي الطلب:{" "}
                <strong>
                  {Number(order.total).toFixed(2)} جنيه
                </strong>
              </p>

              <p>
                تاريخ الطلب:{" "}
                <strong>
                  {new Date(order.date).toLocaleString("ar-EG")}
                </strong>
              </p>

              {order.status === "pending" && !cancelled && (
                <div style={{ marginTop: "20px" }}>
                  <label
                    htmlFor="cancellation-reason"
                    style={{ display: "block", marginBottom: "10px" }}
                  >
                    سبب إلغاء الطلب
                  </label>

                  <textarea
                    id="cancellation-reason"
                    value={cancellationReason}
                    onChange={(e) =>
                      setCancellationReason(e.target.value)
                    }
                    placeholder="اكتب سبب إلغاء الطلب..."
                    maxLength={500}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />

                  <small>
                    {cancellationReason.length}/500 حرف
                  </small>

                  <button
                    className="primary-button"
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    style={{
                      background: "#b42318",
                      marginTop: "15px",
                    }}
                  >
                    {cancelLoading
                      ? "جاري إلغاء الطلب..."
                      : "تأكيد إلغاء الطلب"}
                  </button>
                </div>
              )}

              {order.status === "delivered" && (
                <p style={{ marginTop: "15px" }}>
                  تم تسليم الطلب، ولا يمكن إلغاؤه.
                </p>
              )}

              {order.status === "cancelled" && (
                <p style={{ marginTop: "15px" }}>
                  هذا الطلب تم إلغاؤه بالفعل.
                </p>
              )}

              {cancelError && (
                <p className="form-error">{cancelError}</p>
              )}

              {cancelled && whatsappUrl && (
                <div className="whatsapp-next">
                  <p>
                    تم تسجيل الإلغاء وسبب الإلغاء في النظام.
                    أرسل إشعار الإلغاء للإدارة.
                  </p>

                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-button"
                  >
                    إرسال إشعار الإلغاء على WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "25px" }}>
            <Link href="/" className="primary-button">
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
