
"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // تحميل السلة المحفوظة
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("arkan-cart");
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch (error) {
      console.error("Could not load cart:", error);
    } finally {
      setLoaded(true);
    }
  }, []);

  // حفظ السلة
  useEffect(() => {
    if (loaded) {
      localStorage.setItem("arkan-cart", JSON.stringify(cart));
    }
  }, [cart, loaded]);

  // إضافة منتج
  function addToCart(item) {
    setCart((currentCart) => {
      const existing = currentCart.find((product) => product.id === item.id);

      if (existing) {
        return currentCart.map((product) =>
          product.id === item.id
            ? { ...product, quantity: product.quantity + 1 }
            : product
        );
      }

      return [...currentCart, { ...item, quantity: 1 }];
    });
  }

  // زيادة الكمية
  function increaseQuantity(id) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.id === id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  // تقليل الكمية
  function decreaseQuantity(id) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  // حذف منتج
  function removeFromCart(id) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== id)
    );
  }

  // تفريغ السلة
  function clearCart() {
    setCart([]);
  }

  const totalItems = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const totalPrice = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        increaseQuantity,
        decreaseQuantity,
        removeFromCart,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
