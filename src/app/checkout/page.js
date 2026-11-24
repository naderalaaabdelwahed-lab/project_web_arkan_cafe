
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabase";

const WHATSAPP_NUMBER = "201028808164";

const PENDING_TOKENS_KEY = "arkan-pending-checkout-tokens";
const CANCELLATIONS_KEY = "arkan-order-cancellations";

// إنشاء بصمة ثابتة لبيانات الطلب بدون تخزين بيانات العميل كنص في المفتاح
async function getCheckoutSignature(payload) {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// الحصول على Token ثابت لنفس محاولة الطلب
function getOrCreatePendingToken(signature) {
  const pending = JSON.parse(
    localStorage.getItem(PENDING_TOKENS_KEY) || "{}"
  );

  let token = pending[signature];

  if (!token) {
    token = crypto.randomUUID();
    pending[signature] = token;

    localStorage.setItem(
      PENDING_TOKENS_KEY,
      JSON.stringify(pending)
    );
  }

  return token;
}

// حذف Token المحاولة بعد نجاح الطلب
function removePendingToken(signature) {
  const pending = JSON.parse(
    localStorage.getItem(PENDING_TOKENS_KEY) || "{}"
  );

  delete pending[signature];

  localStorage.setItem(
    PENDING_TOKENS_KEY,
    JSON.stringify(pending)
  );
}

export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart } = useCart();

  const submittingRef = useRef(false);

  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    orderType: "delivery",
    address: "",
    notes: "",
    payment: "cash",
  });

  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [whatsappOpened, setWhatsappOpened] = useState(false);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelWhatsappUrl, setCancelWhatsappUrl] = useState("");
  const [cancelWhatsappOpened, setCancelWhatsappOpened] = useState(false);

  const deliveryFee = customer.orderType === "delivery" ? 30 : 0;
  const finalTotal = totalPrice + deliveryFee;

  function handleChange(event) {
    const { name, value } = event.target;

    setCustomer((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function getOrderErrorMessage(message) {
    if (!message) {
      return "حصلت مشكلة أثناء حفظ الطلب. حاول مرة أخرى.";
    }

    if (message.includes("does not have an active inventory recipe")) {
      return "أحد المنتجات في طلبك ليس له وصفة مخزون نشطة. برجاء التواصل مع المطعم.";
    }

    if (message.includes("Insufficient stock")) {
      return "المخزون غير كافٍ لتجهيز أحد المنتجات المطلوبة. برجاء تقليل الكمية أو التواصل مع المطعم.";
    }

    if (
      message.includes("Inventory item") &&
      message.includes("missing or inactive")
    ) {
      return "إحدى الخامات المطلوبة غير متاحة حاليًا في المخزون.";
    }

    if (message.includes("No open business day found")) {
      return "المطعم لا يستقبل طلبات حاليًا.";
    }

    if (message.includes("Product") && message.includes("unavailable")) {
      return "أحد المنتجات لم يعد متاحًا. برجاء تحديث المنيو.";
    }

    return message;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (submittingRef.current || loading) return;

    if (cart.length === 0) {
      setError("السلة فارغة، أضف منتجات أولاً.");
      return;
    }

    if (!customer.name.trim()) {
      setError("من فضلك أدخل اسمك.");
      return;
    }

    if (!/^01[0125][0-9]{8}$/.test(customer.phone.trim())) {
      setError("أدخل رقم موبايل مصري صحيح مكون من 11 رقم.");
      return;
    }

    if (
      customer.orderType === "delivery" &&
      !customer.address.trim()
    ) {
      setError("من فضلك أدخل عنوان التوصيل.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const orderCart = cart.map((item) => ({ ...item }));

      const orderSubtotal = orderCart.reduce(
        (total, item) => total + Number(item.price) * item.quantity,
        0
      );

      const orderDeliveryFee = deliveryFee;
      const orderFinalTotal = orderSubtotal + orderDeliveryFee;

      const orderItems = orderCart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      }));

      // نفس بيانات الطلب = نفس البصمة ونفس Token
      const checkoutPayload = {
        customer_name: customer.name.trim(),
        phone: customer.phone.trim(),
        address: customer.address.trim(),
        notes: customer.notes.trim(),
        order_type: customer.orderType,
        payment_method: customer.payment,
        items: orderItems,
      };

      const signature = await getCheckoutSignature(checkoutPayload);

      // حفظ Token قبل إرسال الطلب إلى Supabase
      const cancellationToken = getOrCreatePendingToken(signature);

      const { data, error: orderError } = await supabase.rpc(
        "create_customer_order_secure",
        {
          p_customer_name: checkoutPayload.customer_name,
          p_phone: checkoutPayload.phone,
          p_address: checkoutPayload.address,
          p_notes: checkoutPayload.notes,
          p_order_type: checkoutPayload.order_type,
          p_payment_method: checkoutPayload.payment_method,
          p_items: checkoutPayload.items,
          p_cancellation_token: cancellationToken,
        }
      );

      if (orderError) {
        console.error("Supabase Order Error:", orderError);
        throw new Error(getOrderErrorMessage(orderError.message));
      }

      if (!data) {
        throw new Error("لم يتم إنشاء الطلب. حاول مرة أخرى.");
      }

      const orderId = `ARK-${data}`;

      // حفظ كود الإلغاء
      const savedCancellations = JSON.parse(
        localStorage.getItem(CANCELLATIONS_KEY) || "{}"
      );

      savedCancellations[String(data)] = cancellationToken;

      localStorage.setItem(
        CANCELLATIONS_KEY,
        JSON.stringify(savedCancellations)
      );

      // حذف Token المحاولة بعد اكتمال الحفظ
      removePendingToken(signature);

      const orderTypes = {
        delivery: "توصيل Delivery",
        takeaway: "استلام Takeaway",
      };

      const paymentTypes = {
        cash: "كاش عند الاستلام",
        online: "دفع إلكتروني",
      };

      const itemsDetails = orderCart
        .map(
          (item, index) =>
            `${index + 1}- ${item.name}
الكمية: ${item.quantity}
سعر الوحدة: ${item.price} جنيه
الإجمالي: ${item.price * item.quantity} جنيه`
        )
        .join("\n\n");

      const message = `
🍽️ *طلب جديد - ARKAN Cafe & Restaurant*

🔖 الرقم المرجعي: ${orderId}
🔐 كود إلغاء الطلب: ${cancellationToken}

⚠️ احتفظ بالرقم المرجعي وكود الإلغاء.
يمكنك استخدامهما لإلغاء الطلب لاحقاً من الموقع.

👤 *بيانات العميل*
الاسم: ${customer.name}
الموبايل: ${customer.phone}

📦 *تفاصيل الطلب*
نوع الطلب: ${orderTypes[customer.orderType]}

${customer.orderType === "delivery" ? `📍 العنوان: ${customer.address}` : ""}

🛒 *المنتجات*
${itemsDetails}

💰 *الحساب*
قيمة المنتجات: ${orderSubtotal} جنيه
رسوم التوصيل: ${orderDeliveryFee} جنيه
الإجمالي النهائي: ${orderFinalTotal} جنيه

💳 طريقة الدفع: ${paymentTypes[customer.payment]}

📝 ملاحظات: ${customer.notes || "لا توجد"}

⏰ وقت الطلب: ${new Date().toLocaleString("ar-EG")}

شكراً لاختياركم ARKAN ❤️
`;

      const order = {
        id: orderId,
        databaseId: data,
        cancellationToken,
        customer: { ...customer },
        items: orderCart,
        subtotal: orderSubtotal,
        deliveryFee: orderDeliveryFee,
        total: orderFinalTotal,
        status: "pending",
        createdAt: new Date().toISOString(),
        whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      };

      setConfirmedOrder(order);
      clearCart();
    } catch (err) {
      console.error("Order Error:", err);

      setError(
        err.message || "حصل خطأ أثناء حفظ الطلب. حاول مرة أخرى."
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleCancelOrder() {
    if (!confirmedOrder || cancelLoading || cancelled) return;

    setCancelError("");

    if (!cancelReason.trim()) {
      setCancelError("من فضلك اكتب سبب إلغاء الطلب.");
      return;
    }

    if (cancelReason.trim().length > 500) {
      setCancelError("سبب الإلغاء يجب ألا يتجاوز 500 حرف.");
      return;
    }

    const confirmed = window.confirm(
      "هل أنت متأكد إنك عايز تلغي الطلب؟"
    );

    if (!confirmed) return;

    setCancelLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "cancel_customer_order",
        {
          p_order_id: confirmedOrder.databaseId,
          p_cancellation_token: confirmedOrder.cancellationToken,
          p_cancellation_reason: cancelReason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      if (!data) {
        throw new Error(
          "لم يتم إلغاء الطلب. ربما تم إلغاؤه بالفعل أو لم يعد قيد الانتظار."
        );
      }

      setCancelled(true);

      const message = `
❌ *طلب إلغاء أوردر - ARKAN*

🔖 الرقم المرجعي: ${confirmedOrder.id}
👤 اسم العميل: ${confirmedOrder.customer.name}
📱 رقم الموبايل: ${confirmedOrder.customer.phone}
💰 قيمة الطلب: ${confirmedOrder.total} جنيه

📝 سبب الإلغاء: ${cancelReason.trim()}

العميل قام بإلغاء الطلب من الموقع.
يرجى مراجعة حالة الطلب في لوحة الإدارة.
`;

      setCancelWhatsappUrl(
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
      );
    } catch (err) {
      console.error("Cancel Order Error:", err);

      setCancelError(
        err.message || "حصل خطأ أثناء إلغاء الطلب."
      );
    } finally {
      setCancelLoading(false);
    }
  }

  if (confirmedOrder) {
    return (
      <main dir="rtl">
        <Navbar />

        <section className="checkout-section">
          <div className="success-card">
            <div className="success-icon">✓</div>

            <span className="eyebrow">
              {cancelled ? "ORDER CANCELLED" : "ORDER SAVED"}
            </span>

            <h1>
              {cancelled
                ? "تم إلغاء طلبك"
                : "تم حفظ طلبك بنجاح!"}
            </h1>

            <p>
              {cancelled
                ? "تم تسجيل إلغاء الطلب في النظام."
                : "طلبك اتحفظ في نظام ARKAN. أرسل تفاصيله عبر واتساب لتأكيده."}
            </p>

            <div className="order-number">
              الرقم المرجعي:
              <strong>{confirmedOrder.id}</strong>
            </div>

            <h3>الإجمالي: {confirmedOrder.total} ج.م</h3>

            {!cancelled && (
              <>
                {!whatsappOpened ? (
                  <a
                    href={confirmedOrder.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-button"
                    onClick={() => setWhatsappOpened(true)}
                  >
                    <span>☏</span>
                    إرسال تأكيد الطلب على WhatsApp
                  </a>
                ) : (
                  <div className="whatsapp-next">
                    <p>
                      بعد إرسال الرسالة من واتساب، اضغط على زر التأكيد.
                    </p>

                    <button
                      className="primary-button"
                      onClick={() => {
                        window.location.href = "/";
                      }}
                    >
                      تم إرسال رسالة التأكيد
                    </button>
                  </div>
                )}

                <div style={{ marginTop: "20px" }}>
                  <label htmlFor="cancelReason">
                    سبب إلغاء الطلب
                  </label>

                  <textarea
                    id="cancelReason"
                    value={cancelReason}
                    onChange={(event) => {
                      setCancelReason(event.target.value);
                      setCancelError("");
                    }}
                    placeholder="اكتب سبب إلغاء الطلب..."
                    maxLength={500}
                    rows={3}
                    disabled={cancelLoading}
                    style={{
                      width: "100%",
                      marginTop: "8px",
                    }}
                  />

                  <small>{cancelReason.length}/500</small>

                  <button
                    className="primary-button"
                    onClick={handleCancelOrder}
                    disabled={cancelLoading}
                    style={{
                      marginTop: "15px",
                      background: "#b42318",
                    }}
                  >
                    {cancelLoading
                      ? "جاري إلغاء الطلب..."
                      : "تأكيد إلغاء الطلب"}
                  </button>
                </div>

                {cancelError && (
                  <p className="form-error">{cancelError}</p>
                )}

                <p style={{ marginTop: "15px" }}>
                  لو خرجت من الصفحة، يمكنك إلغاء الطلب من صفحة إلغاء الطلب باستخدام الرقم المرجعي وكود الإلغاء الموجودين في رسالة واتساب.
                </p>

                <Link href="/cancel-order">
                  صفحة إلغاء الطلب
                </Link>
              </>
            )}

            {cancelled && (
              <div className="whatsapp-next">
                <h3>تم إلغاء الطلب بنجاح</h3>

                <p>
                  تم تحديث حالة الطلب في النظام إلى ملغي.
                  أرسل إشعار الإلغاء للإدارة.
                </p>

                {!cancelWhatsappOpened ? (
                  <a
                    href={cancelWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-button"
                    onClick={() => setCancelWhatsappOpened(true)}
                  >
                    <span>☏</span>
                    إرسال إشعار الإلغاء على WhatsApp
                  </a>
                ) : (
                  <p>
                    ارجع للموقع بعد إرسال رسالة الإلغاء من واتساب.
                  </p>
                )}

                {cancelWhatsappOpened && (
                  <button
                    className="primary-button"
                    style={{ marginTop: "15px" }}
                    onClick={() => {
                      window.location.href = "/";
                    }}
                  >
                    تم إرسال إشعار الإلغاء
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <Footer />
      </main>
    );
  }

  return (
    <main dir="rtl">
      <Navbar />

      <section className="checkout-section">
        <div className="section-heading">
          <span className="eyebrow">COMPLETE YOUR ORDER</span>

          <h1>
            تأكيد <span>الطلب</span>
          </h1>

          <p>املأ بياناتك عشان نقدر نجهز طلبك</p>
        </div>

        {cart.length === 0 ? (
          <div className="success-card">
            <h3>السلة فارغة</h3>
            <p>أضف منتجات من المنيو قبل إتمام الطلب.</p>

            <Link href="/menu" className="primary-button">
              تصفح المنيو
            </Link>
          </div>
        ) : (
          <div className="checkout-layout">
            <form className="checkout-form" onSubmit={handleSubmit}>
              <h2>بيانات العميل</h2>

              <label>الاسم</label>

              <input
                type="text"
                name="name"
                value={customer.name}
                onChange={handleChange}
                placeholder="اكتب اسمك"
                required
              />

              <label>رقم الموبايل</label>

              <input
                type="tel"
                name="phone"
                value={customer.phone}
                onChange={handleChange}
                placeholder="01xxxxxxxxx"
                required
              />

              <label>نوع الطلب</label>

              <select
                name="orderType"
                value={customer.orderType}
                onChange={handleChange}
              >
                <option value="delivery">توصيل Delivery</option>
                <option value="takeaway">استلام Takeaway</option>
              </select>
              <small className="form-hint">طلبات الصالة يتم تسجيلها من الكاشير لتحديد الطاولة ومتابعة الطلب داخل المطعم.</small>

              {customer.orderType === "delivery" && (
                <>
                  <label>عنوان التوصيل</label>

                  <textarea
                    name="address"
                    value={customer.address}
                    onChange={handleChange}
                    placeholder="اكتب عنوانك بالتفصيل"
                    required
                  />
                </>
              )}

              <label>ملاحظات إضافية</label>

              <textarea
                name="notes"
                value={customer.notes}
                onChange={handleChange}
                placeholder="أي ملاحظات على الطلب..."
              />

              <label>طريقة الدفع</label>

              <select
                name="payment"
                value={customer.payment}
                onChange={handleChange}
              >
                <option value="cash">كاش عند الاستلام</option>
                <option value="online" disabled>
                  دفع إلكتروني (قريباً)
                </option>
              </select>

              {error && <p className="form-error">{error}</p>}

              <button
                type="submit"
                className="primary-button"
                disabled={loading}
              >
                {loading ? "جاري حفظ الطلب..." : "تأكيد الطلب"}
              </button>
            </form>

            <div className="checkout-summary">
              <h2>ملخص الطلب</h2>

              <p>عدد المنتجات: {totalItems}</p>

              {cart.map((item) => (
                <div className="summary-row" key={item.id}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>

                  <strong>
                    {item.price * item.quantity} ج.م
                  </strong>
                </div>
              ))}

              <div className="summary-row">
                <span>قيمة المنتجات</span>
                <strong>{totalPrice} ج.م</strong>
              </div>

              <div className="summary-row">
                <span>التوصيل</span>
                <strong>{deliveryFee} ج.م</strong>
              </div>

              <div className="summary-row">
                <span>الإجمالي النهائي</span>
                <strong>{finalTotal} ج.م</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
