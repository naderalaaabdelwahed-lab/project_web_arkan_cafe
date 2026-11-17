
"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";

const WHATSAPP_NUMBER = "201028808164";

export default function CancelOrderPage() {
  const [orderReference, setOrderReference] = useState("");
  const [cancellationCode, setCancellationCode] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [whatsappOpened, setWhatsappOpened] = useState(false);

  async function handleCancel(event) {
    event.preventDefault();
    setError("");

    if (loading) return;

    const match = orderReference.trim().match(/^ARK-(\d+)$/i);

    if (!match) {
      setError("اكتب الرقم المرجعي بالشكل الصحيح، مثال: ARK-125");
      return;
    }

    const token = cancellationCode.trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ) {
      setError("كود الإلغاء غير صحيح.");
      return;
    }

    const reason = cancellationReason.trim();

    if (!reason) {
      setError("من فضلك اكتب سبب إلغاء الطلب.");
      return;
    }

    if (reason.length > 500) {
      setError("سبب الإلغاء يجب ألا يتجاوز 500 حرف.");
      return;
    }

    setLoading(true);

    try {
      const databaseId = Number(match[1]);

      const { data, error: rpcError } = await supabase.rpc(
        "cancel_customer_order",
        {
          p_order_id: databaseId,
          p_cancellation_token: token,
          p_cancellation_reason: reason,
        }
      );

      if (rpcError) {
        console.error("Cancellation error:", rpcError);
        throw rpcError;
      }

      if (!data) {
        throw new Error(
          "لم يتم إلغاء الطلب. ربما تم إلغاؤه بالفعل أو لم يعد قيد الانتظار."
        );
      }

      const message = `
❌ *طلب إلغاء أوردر - ARKAN*

🔖 الرقم المرجعي: ARK-${databaseId}

📝 سبب الإلغاء:
${reason}

العميل قام بإلغاء الطلب.
يرجى مراجعة الطلب في لوحة الإدارة.
`;

      setWhatsappUrl(
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
      );

      setCancelled(true);
    } catch (err) {
      console.error("Cancel Error:", err);
      setError(err.message || "حدث خطأ أثناء إلغاء الطلب.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl">
      <Navbar />

      <section className="checkout-section">
        <div className="section-heading">
          <span className="eyebrow">CANCEL YOUR ORDER</span>
          <h1>
            إلغاء <span>الطلب</span>
          </h1>
          <p>
            أدخل الرقم المرجعي وكود الإلغاء الموجودين في رسالة واتساب.
          </p>
        </div>

        <div className="success-card">
          {!cancelled ? (
            <form onSubmit={handleCancel} className="checkout-form">
              <label>الرقم المرجعي للطلب</label>

              <input
                type="text"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
                placeholder="مثال: ARK-125"
                required
              />

              <label>كود إلغاء الطلب</label>

              <input
                type="text"
                value={cancellationCode}
                onChange={(e) => setCancellationCode(e.target.value)}
                placeholder="الصق كود الإلغاء هنا"
                required
              />

              <label>سبب إلغاء الطلب</label>

              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="اكتب سبب إلغاء الطلب..."
                maxLength={500}
                rows={4}
                required
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />

              <small>{cancellationReason.length}/500 حرف</small>

              {error && <p className="form-error">{error}</p>}

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading ? "جاري إلغاء الطلب..." : "تأكيد إلغاء الطلب"}
              </button>
            </form>
          ) : (
            <>
              <div className="success-icon">✓</div>

              <h2>تم إلغاء الطلب بنجاح</h2>

              <p>
                تم حفظ سبب الإلغاء في النظام، وسيظهر للإدارة.
              </p>

              <p style={{ marginTop: "10px" }}>
                <strong>سبب الإلغاء:</strong> {cancellationReason}
              </p>

              {!whatsappOpened ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-button"
                  onClick={() => setWhatsappOpened(true)}
                >
                  إرسال إشعار الإلغاء على WhatsApp
                </a>
              ) : (
                <p>
                  ارجع للموقع بعد إرسال الرسالة من واتساب.
                </p>
              )}
            </>
          )}

          <div style={{ marginTop: "20px" }}>
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
