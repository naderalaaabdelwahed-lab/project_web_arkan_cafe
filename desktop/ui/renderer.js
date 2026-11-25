const API = "http://127.0.0.1:4317/api";
const state = { categories: [], products: [], categoryId: "all", cart: new Map(), orderType: "takeaway" };
const el = (id) => document.getElementById(id);
const money = (minor) => (Number(minor || 0) / 100).toLocaleString("ar-EG", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}) + " ج.م";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));
const iconFor = (categoryName = "") => {
  if (categoryName.includes("فطائر")) return "🥧";
  if (categoryName.includes("مكرونات")) return "🍝";
  if (categoryName.includes("مشروبات")) return "🥤";
  if (categoryName.includes("رئيسية")) return "🍽️";
  return "🍴";
};

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
  const buttons = [
    { id: "all", name: "كل الأصناف" },
    ...state.categories.map((category) => ({ id: String(category.id), name: category.name }))
  ];
  el("categories").innerHTML = buttons.map((category) =>
    `<button class="category ${state.categoryId === category.id ? "active" : ""}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`
  ).join("");
  el("categories").querySelectorAll("[data-category]").forEach((button) => {
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
  el("products").innerHTML = products.length ? products.map((product) => {
    const category = state.categories.find((item) => String(item.id) === String(product.category_id));
    return `<button class="product" data-product="${escapeHtml(product.id)}">
      <span class="product-icon">${iconFor(category?.name)}</span>
      <strong>${escapeHtml(product.name)}</strong>
      <span class="price">${money(product.price_minor)}</span>
      <span class="add-mark">+</span>
    </button>`;
  }).join("") : '<div class="empty">مفيش أصناف في القسم ده.</div>';

  el("products").querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.product));
  });
}

function addToCart(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) return;
  const current = state.cart.get(String(id));
  state.cart.set(String(id), { product, quantity: (current?.quantity || 0) + 1 });
  el("message").textContent = "";
  renderCart();
}

function renderCart() {
  const rows = [...state.cart.entries()];
  el("cart-items").innerHTML = rows.length ? rows.map(([id, line]) =>
    `<div class="cart-row">
      <div><div class="item-name">${escapeHtml(line.product.name)}</div><div class="item-price">${money(line.product.price_minor)} للوحدة</div></div>
      <div class="qty">
        <button data-action="plus" data-id="${escapeHtml(id)}" aria-label="زيادة">+</button>
        <span>${line.quantity}</span>
        <button data-action="minus" data-id="${escapeHtml(id)}" aria-label="تقليل">−</button>
      </div>
      <div class="line-total">${money(line.product.price_minor * line.quantity)}</div>
    </div>`
  ).join("") : '<div class="empty">السلة فارغة — اختار أصناف من المنيو</div>';

  const total = rows.reduce((sum, [, line]) => sum + line.product.price_minor * line.quantity, 0);
  const count = rows.reduce((sum, [, line]) => sum + line.quantity, 0);
  el("total").textContent = money(total);
  el("items-count").textContent = count.toLocaleString("ar-EG");
  el("cart-count").textContent = count.toLocaleString("ar-EG") + " صنف";
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

function setOrderType(type) {
  state.orderType = type;
  el("order-types").querySelectorAll("[data-type]").forEach((button) =>
    button.classList.toggle("active", button.dataset.type === type)
  );
  el("address").style.display = type === "delivery" ? "block" : "none";
}

async function loadMenu() {
  el("message").textContent = "";
  try {
    const menu = await request("/menu");
    state.categories = menu.categories || [];
    state.products = menu.items || [];
    renderCategories();
    renderProducts();
    el("connection").textContent = "● الخدمة المحلية تعمل — Offline Ready";
    el("connection").classList.remove("offline");
  } catch (error) {
    el("connection").textContent = "● تعذر الاتصال بالخدمة المحلية";
    el("connection").classList.add("offline");
    el("message").textContent = error.message;
  }
}

async function placeOrder() {
  const button = el("place-order");
  if (!state.cart.size) return;
  if (state.orderType === "delivery" && !el("address").value.trim()) {
    el("message").textContent = "اكتب عنوان التوصيل الأول.";
    return;
  }
  button.disabled = true;
  el("message").textContent = "جاري حفظ الطلب على الجهاز...";
  try {
    const order = await request("/orders", {
      method: "POST",
      body: JSON.stringify({
        order_type: state.orderType,
        customer_name: el("customer").value.trim(),
        phone: el("phone").value.trim(),
        address: el("address").value.trim(),
        payment_method: el("payment").value,
        notes: el("notes").value,
        items: [...state.cart.values()].map(({ product, quantity }) => ({
          menu_item_id: product.id, quantity
        }))
      })
    });
    state.cart.clear();
    ["customer", "phone", "address", "notes"].forEach((id) => { el(id).value = ""; });
    setOrderType("takeaway");
    renderCart();
    el("message").textContent = "✓ تم حفظ الطلب محليًا بنجاح · " + order.order_number;
  } catch (error) {
    el("message").textContent = error.message;
    button.disabled = state.cart.size === 0;
  }
}

el("search").addEventListener("input", renderProducts);
el("reload").addEventListener("click", loadMenu);
el("place-order").addEventListener("click", placeOrder);
el("order-types").querySelectorAll("[data-type]").forEach((button) =>
  button.addEventListener("click", () => setOrderType(button.dataset.type))
);
loadMenu();
renderCart();
