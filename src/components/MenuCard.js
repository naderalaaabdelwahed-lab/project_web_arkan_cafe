
"use client";

import { useCart } from "@/context/CartContext";

export default function MenuCard({ item }) {
  const { addToCart } = useCart();

  return (
    <article className="menu-card">
      <div className="food-image">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
          />
        ) : (
          <span className="food-placeholder">
            {item.emoji || "🍽️"}
          </span>
        )}

        <span className="food-category">
          {item.category}
        </span>
      </div>

      <div className="food-content">
        <h3>{item.name}</h3>

        <p>{item.description || "طعم مميز من ARKAN"}</p>

        <div className="food-footer">
          <div className="food-price">
            <strong>{item.price}</strong>
            <span>جنيه</span>
          </div>

          <button
            type="button"
            onClick={() => addToCart(item)}
            aria-label={`إضافة ${item.name} للسلة`}
            title="أضف للسلة"
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
