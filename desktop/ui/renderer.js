const API = "http://127.0.0.1:4317/api";
const state = { categories: [], products: [], categoryId: "all", cart: new Map() };
const money = (minor) => (Number(minor || 0) / 100).toLocaleString("ar-EG", {
  style: "currency", currency: "EGP"
});

const el = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));

async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "حدث خطأ في الخدمة المحلية");
  return data;
}

function renderCategories() {
  el("categories").innerHTML = [
    `<button data-category="all" class="${state.categoryId === "all" ? "active" : ""}">الكل</button>`,
    ...state.categories.map((category) =>
      `<button data-category="${escapeHtml(category.id)}" class="${state.categoryId === String(category.id) ? "active" : ""}">${escapeHtml(category.name)}</button>`
    )
  ].join("");
  el("categories").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.categoryId = button.dataset.category;
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const search = el("search").value.trim().toLowerCase();
  const products = state.products.filter((product) =>
    (state.categoryId === "all" || String(product.category_id) === state.categoryId) &&
    product.name.toLowerCase().includes(search)
  );
  el("products").innerHTML = products.length ? products.map((product) =>
    `<button class="product" data-product="${escapeHtml(product.id)}">
      <strong>${escapeHtml(product.name)}</strong>
      <span>${money(product.price_minor)}</span>
    </button>`
  ).join("") : '<div class="empty">مفيش أصناف في القسم ده. استورد المنيو الأول.</div>';

  el("products").querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.product));
  });
}

function addToCart(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) return;
  const current = state.cart.get(id);
  state.cart.set(id, { product, quantity: (current?.quantity || 0) + 1 });
  renderCart();
}

function renderCart() {
  const rows = [...state.cart.entries()];
  el("cart-items").innerHTML = rows.length ? rows.map(([id, line]) =>
    `<div class="cart-row">
      <div><strong>${escapeHtml(line.product.name)}</strong><small>${money(line.product.price_minor)} × ${line.quantity}</small></div>
      <div class="qty">
        <button data-action="plus" data-id="${escapeHtml(id)}">+</button>
        <span>${line.quantity}</span>
        <button data-action="minus" data-id="${escapeHtml(id)}">−</button>
      </div>
    </div>`
  ).join("") : '<div class="empty">اختار أصناف من المنيو</div>';

  const total = rows.reduce((sum, [, line]) =>
    sum + line.product.price_minor * line.quantity, 0);
  el("total").textContent = money(total);
  el("place-order").disabled = rows.length === 0;

  el("cart-items").querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const line = state.cart.get(button.dataset.id);
      if (!line) return;
      line.quantity += button.dataset.action === "plus" ? 1 : -1;
      if (line.quantity <= 0) state.cart.delete(button.dataset.id);
      renderCart();
    });
  });
}

async function loadMenu() {
  try {
    const menu = await request("/menu");
    state.categories = menu.categories;
    state.products = menu.items;
    renderCategories();
    renderProducts();
    el("connection").textContent = "● الخدمة المحلية تعمل";
  } catch (error) {
    el("connection").textContent = "● تعذر الاتصال بالخدمة المحلية";
    el("message").textContent = error.message;
  }
}

async function placeOrder() {
  const button = el("place-order");
  button.disabled = true;
  el("message").textContent = "جاري حفظ الطلب على الجهاز...";
  try {
    const order = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        order_type: el("order-type").value,
        notes: el("notes").value,
        items: [...state.cart.values()].map(({ product, quantity }) => ({
          menu_item_id: product.id, quantity
        }))
      })
    });
    state.cart.clear();
    el("notes").value = "";
    renderCart();
    el("message").textContent = "تم حفظ الطلب محليًا بنجاح · " + order.order_number;
  } catch (error) {
    el("message").textContent = error.message;
    button.disabled = state.cart.size === 0;
  }
}

el("search").addEventListener("input", renderProducts);
el("reload").addEventListener("click", loadMenu);
el("place-order").addEventListener("click", placeOrder);
loadMenu();
renderCart();
