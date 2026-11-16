
"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const {
    cart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    totalPrice,
    totalItems,
  } = useCart();

  return (
    <main dir="rtl">
      <Navbar />

      <section className="cart-section">
        <div className="section-heading">
          <span className="eyebrow">YOUR CART</span>
          <h2>سلة <span>المشتريات</span></h2>
          <p>راجع طلبك قبل إتمام الشراء</p>
        </div>

        {cart.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-cart-icon">🛒</div>
            <h3>السلة فارغة</h3>
            <p>لسه ما ضفتش أي منتجات للسلة</p>
            <Link href="/menu" className="primary-button">
              تصفح المنيو
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => (
                <article className="cart-item" key={item.id}>
                  <div className="cart-item-icon">{item.emoji}</div>

                  <div className="cart-item-info">
                    <h3>{item.name}</h3>
                    <p>{item.price} ج.م</p>
                  </div>

                  <div className="quantity-controls">
                    <button onClick={() => decreaseQuantity(item.id)}>
                      -
                    </button>

                    <strong>{item.quantity}</strong>

                    <button onClick={() => increaseQuantity(item.id)}>
                      +
                    </button>
                  </div>

                  <strong className="cart-item-total">
                    {item.price * item.quantity} ج.م
                  </strong>

                  <button
                    className="remove-item"
                    onClick={() => removeFromCart(item.id)}
                  >
                    حذف
                  </button>
                </article>
              ))}
            </div>

            <div className="cart-summary">
              <h3>ملخص الطلب</h3>

              <div className="summary-row">
                <span>عدد المنتجات</span>
                <strong>{totalItems}</strong>
              </div>

              <div className="summary-row">
                <span>الإجمالي</span>
                <strong>{totalPrice} ج.م</strong>
              </div>

              <Link href="/checkout" className="primary-button checkout-button">
                إتمام الطلب
              </Link>

              <Link href="/menu" className="continue-shopping">
                متابعة التسوق
              </Link>
            </div>
          </>
        )}
      </section>

      <Footer />
    </main>
  );
}
