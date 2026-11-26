const API = "http://127.0.0.1:4317/api";
const apiFetch=(url,options={})=>{
 const headers={...(options.headers||{})};
 const token=window.arkanDesktop?.apiToken;
 if(token)headers["X-Egsoft-Api-Token"]=token;
 return globalThis["fetch"](url,{...options,headers});
};
const activeStatuses = new Set(["pending", "preparing", "ready"]);
const labels = {
  pending: "طلب جديد",
  preparing: "قيد التحضير",
  ready: "جاهز",
  delivered: "تم التسليم",
  cancelled: "ملغي"
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));
const money = (minor) => (Number(minor || 0) / 100).toFixed(2) + " ج.م";

async function updateStatus(id, status) {
  try {
    const response = await apiFetch(API + "/orders/" + encodeURIComponent(id) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر تحديث حالة الطلب");
    await loadOrders();
  } catch (error) {
    document.getElementById("status").textContent = error.message;
  }
}

function render(orders) {
  const visible = orders.filter((order) => activeStatuses.has(order.status));
  document.getElementById("orders").innerHTML = visible.length ? visible.map((order) =>
    `<article class="order">
      <h2>${escapeHtml(order.order_number)}</h2>
      <div class="meta">${labels[order.status] || order.status} · ${new Date(order.created_at).toLocaleTimeString("ar-EG")}</div>
      ${order.items.map((item) => `<div class="line"><span>${escapeHtml(item.item_name_snapshot)} × ${item.quantity}</span><strong>${money(item.line_total_minor)}</strong></div>`).join("")}
      ${order.notes ? `<div class="notes">ملاحظات: ${escapeHtml(order.notes)}</div>` : ""}
      <div class="line"><strong>الإجمالي</strong><strong>${money(order.total_minor)}</strong></div>
      <div class="actions">
        ${order.status === "pending" ? `<button data-status="preparing" data-id="${escapeHtml(order.id)}">بدء التحضير</button>` : ""}
        ${order.status === "preparing" ? `<button data-status="ready" data-id="${escapeHtml(order.id)}">جاهز</button>` : ""}
        ${order.status === "ready" ? `<button data-status="delivered" data-id="${escapeHtml(order.id)}">تم التسليم</button>` : ""}
        <button class="secondary" data-status="cancelled" data-id="${escapeHtml(order.id)}">إلغاء</button>
      </div>
    </article>`
  ).join("") : '<div class="empty">مفيش طلبات جديدة في المطبخ</div>';

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateStatus(button.dataset.id, button.dataset.status));
  });
}

async function loadOrders() {
  try {
    const response = await apiFetch(API + "/orders");
    if (!response.ok) throw new Error("تعذر تحميل الطلبات");
    render(await response.json());
    document.getElementById("status").textContent =
      "آخر تحديث: " + new Date().toLocaleTimeString("ar-EG");
  } catch (error) {
    document.getElementById("status").textContent = error.message;
  }
}

loadOrders();
setInterval(loadOrders, 3000);
