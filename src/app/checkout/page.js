
"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabase";

const WHATSAPP_NUMBER = "201028808164";

export default function CheckoutPage() {
  const { cart, totalPrice, totalItems, clearCart } = useCart();

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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (loading) return;

    if (cart.length === 0) {
      setError("السلة فارغة، أضف منتجات أولاً.");
      return;
    }

    if (!customer.name.trim()) {
      setError("من فضلك أدخل اسمك.");
      return;
    }

    if (!/^01[0125][0-9]{8}$/.test(customer.phone)) {
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

    setLoading(true);

    try {
      // الاحتفاظ بنسخة من السلة قبل تفريغها
      const orderCart = cart.map((item) => ({ ...item }));

      const orderSubtotal = totalPrice;
      const orderDeliveryFee = deliveryFee;
      const orderFinalTotal = finalTotal;

      const orderItems = orderCart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      }));

      // إنشاء كود سري خاص بإلغاء الطلب
      const cancellationToken = crypto.randomUUID();

      // حفظ الطلب في Supabase
      const { data, error: orderError } = await supabase.rpc(
        "create_customer_order_secure",
        {
          p_customer_name: customer.name.trim(),
          p_phone: customer.phone.trim(),
          p_address: customer.address.trim(),
          p_notes: customer.notes.trim(),
          p_order_type: customer.orderType,
          p_payment_method: customer.payment,
          p_items: orderItems,
          p_cancellation_token: cancellationToken,
        }
      );

      if (orderError) {
        console.error("Supabase Order Error:", orderError);

        throw new Error(
          "حصلت مشكلة أثناء حفظ الطلب. راجع البيانات وحاول مرة أخرى."
        );
      }

      if (!data) {
        throw new Error("لم يتم إنشاء الطلب. حاول مرة أخرى.");
      }

      const orderId = `ARK-${data}`;

      // حفظ كود الإلغاء على جهاز العميل
      const savedCancellations = JSON.parse(
        localStorage.getItem("arkan-order-cancellations") || "{}"
      );

      savedCancellations[String(data)] = cancellationToken;

      localStorage.setItem(
        "arkan-order-cancellations",
        JSON.stringify(savedCancellations)
      );

      const orderTypes = {
        delivery: "توصيل Delivery",
        takeaway: "استلام Takeaway",
        "dine-in": "داخل المطعم Dine-in",
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

      // عرض تفاصيل الطلب ثم تفريغ السلة
      setConfirmedOrder(order);
      clearCart();

    } catch (err) {
      console.error("Order Error:", err);

      setError(
        err.message || "حصل خطأ أثناء حفظ الطلب. حاول مرة أخرى."
      );
    } finally {
      setLoading(false);
    }
  }

  // إلغاء الطلب من شاشة التأكيد
  async function handleCancelOrder() {
    if (!confirmedOrder || cancelLoading || cancelled) return;

    const confirmed = window.confirm(
      "هل أنت متأكد إنك عايز تلغي الطلب؟"
    );

    if (!confirmed) return;

    setCancelLoading(true);
    setCancelError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "cancel_customer_order",
        {
          p_order_id: confirmedOrder.databaseId,
          p_cancellation_token: confirmedOrder.cancellationToken,
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

  // شاشة نتيجة الطلب
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
                    : "إلغاء الطلب"}
                </button>

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

  // شاشة إدخال بيانات الطلب
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
                <option value="dine-in">داخل المطعم Dine-in</option>
              </select>

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
