
"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";

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
  const [whatsappOpened, setWhatsappOpened] = useState(false);

  const deliveryFee = customer.orderType === "delivery" ? 30 : 0;
  const finalTotal = totalPrice + deliveryFee;

  function handleChange(event) {
    const { name, value } = event.target;

    setCustomer((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

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

    if (customer.orderType === "delivery" && !customer.address.trim()) {
      setError("من فضلك أدخل عنوان التوصيل.");
      return;
    }

    const order = {
      id: `ARK-${Date.now()}`,
      customer: { ...customer },
      items: cart.map((item) => ({ ...item })),
      subtotal: totalPrice,
      deliveryFee,
      total: finalTotal,
      status: "Pending",
      createdAt: new Date().toISOString(),
    };

    const orderTypes = {
      delivery: "توصيل Delivery",
      takeaway: "استلام Takeaway",
      "dine-in": "داخل المطعم Dine-in",
    };

    const paymentTypes = {
      cash: "كاش عند الاستلام",
      online: "دفع إلكتروني",
    };

    const itemsDetails = order.items
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

🔖 رقم الطلب: ${order.id}

👤 *بيانات العميل*
الاسم: ${customer.name}
الموبايل: ${customer.phone}

📦 *تفاصيل الطلب*
نوع الطلب: ${orderTypes[customer.orderType]}

${customer.orderType === "delivery" ? `📍 العنوان: ${customer.address}` : ""}

🛒 *المنتجات*
${itemsDetails}

💰 *الحساب*
قيمة المنتجات: ${totalPrice} جنيه
رسوم التوصيل: ${deliveryFee} جنيه
الإجمالي النهائي: ${finalTotal} جنيه

💳 طريقة الدفع: ${paymentTypes[customer.payment]}

📝 ملاحظات: ${customer.notes || "لا توجد"}

⏰ وقت الطلب: ${new Date().toLocaleString("ar-EG")}

شكراً لاختياركم ARKAN ❤️
`;

    const whatsappNumber = "201028808164";

    order.whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    try {
      const savedOrders = JSON.parse(
        localStorage.getItem("arkan-orders") || "[]"
      );

      localStorage.setItem(
        "arkan-orders",
        JSON.stringify([order, ...savedOrders])
      );

      setConfirmedOrder(order);
    } catch (err) {
      console.error("Order saving error:", err);
      setError("حصلت مشكلة أثناء حفظ الطلب. حاول مرة أخرى.");
    }
  }

  if (confirmedOrder) {
    return (
      <main dir="rtl">
        <Navbar />

        <section className="checkout-section">
          <div className="success-card">
            <div className="success-icon">✓</div>

            <span className="eyebrow">ORDER READY</span>

            <h1>طلبك جاهز للإرسال!</h1>

            <p>
              اضغط على الزر التالي لفتح واتساب وإرسال تفاصيل
              طلبك إلى مطعم أركان.
            </p>

            <div className="order-number">
              رقم الطلب:
              <strong>{confirmedOrder.id}</strong>
            </div>

            <h3>الإجمالي: {confirmedOrder.total} ج.م</h3>

            <a
              href={confirmedOrder.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-button"
              onClick={() => setWhatsappOpened(true)}
            >
              <span>☏</span>
              إرسال الطلب على WhatsApp
            </a>

            {whatsappOpened && (
              <div className="whatsapp-next">
                <p>
                  بعد ما تضغط إرسال داخل واتساب، ارجع للموقع
                  واضغط الزر التالي.
                </p>

                <button
                  className="primary-button"
                  onClick={() => {
                    clearCart();
                    window.location.href = "/";
                  }}
                >
                  تم إرسال الطلب والعودة للرئيسية
                </button>
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
          <h1>تأكيد <span>الطلب</span></h1>
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

              <button type="submit" className="primary-button">
                تأكيد الطلب
              </button>
            </form>

            <div className="checkout-summary">
              <h2>ملخص الطلب</h2>

              <p>عدد المنتجات: {totalItems}</p>

              {cart.map((item) => (
                <div className="summary-row" key={item.id}>
                  <span>{item.name} × {item.quantity}</span>
                  <strong>{item.price * item.quantity} ج.م</strong>
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
