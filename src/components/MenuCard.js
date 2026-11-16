
"use client";

import { useCart } from "@/context/CartContext";

export default function MenuCard({ item }) {
  const { addToCart } = useCart();

  return (
    <article className="menu-card">
      <div className="food-icon">{item.emoji}</div>

      <span className="food-category">{item.category}</span>

      <h3>{item.name}</h3>

      <p>{item.description}</p>

      <div className="food-footer">
        <strong>{item.price} ج.م</strong>

        <button
          type="button"
          onClick={() => addToCart(item)}
          aria-label={`إضافة ${item.name} للسلة`}
        >
          +
        </button>
      </div>
    </article>
  );
}
