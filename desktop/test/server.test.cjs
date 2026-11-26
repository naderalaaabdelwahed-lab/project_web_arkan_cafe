"use strict";

const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startLocalServer } = require("../server/index.cjs");

let server;
let tempDir;
let baseUrl;
let createdOrderId;
let paidOrderId;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "egsoft-pos-test-"));
  server = await startLocalServer({ userDataPath: tempDir, port: 0 });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  if (server) await server.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

async function request(route, options = {}) {
  const response = await fetch(baseUrl + route, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("health endpoint reports a working local service", async () => {
  const { response, body } = await request("/api/health");
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.database, "connected");
});

test("loopback API rejects browser requests from untrusted origins", async () => {
  const { response, body } = await request("/api/health", {
    headers: { Origin: "https://attacker.example" }
  });
  assert.equal(response.status, 403);
  assert.equal(body.error, "Origin is not allowed.");
});

test("all administration routes require an authenticated admin session", async () => {
  for (const route of [
    "/api/admin/summary",
    "/api/admin/records/reservations",
    "/api/admin/restaurant-settings",
    "/api/admin/orders",
    "/api/admin/menu"
  ]) {
    const { response, body } = await request(route);
    assert.equal(response.status, 401, `${route} must be protected`);
    assert.match(body.error, /سجل الدخول/);
  }
});

test("order creation validates items and persists money in integer piastres", async () => {
  let result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [] })
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ menu_item_id: "missing", quantity: 1 }] })
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ menu_item_id: "test-tea", quantity: 1.5 }] })
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      discount_minor: Number.MAX_SAFE_INTEGER + 100,
      items: [{ menu_item_id: "test-tea", quantity: 1 }]
    })
  });
  assert.equal(result.response.status, 400);

  result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      order_type: "dine_in",
      table_id: "table-test",
      table_number: 7,
      table_area: "indoor",
      discount_minor: 1000,
      payment_method: "cash",
      items: [{ menu_item_id: "test-fatir-cheese", quantity: 2, notes: "بدون إضافات" }]
    })
  });

  assert.equal(result.response.status, 201);
  createdOrderId = result.body.id;
  assert.equal(result.body.subtotal_minor, 17000);
  assert.equal(result.body.discount_minor, 1000);
  assert.equal(result.body.total_minor, 16000);
  assert.equal(result.body.table_number, 7);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].quantity, 2);

  const listed = await request("/api/orders");
  const saved = listed.body.find((order) => order.id === result.body.id);
  assert.ok(saved, "created order must be returned by the orders endpoint");
  assert.equal(saved.total_minor, 11000);
  assert.equal(saved.table_number, 9);
  assert.equal(saved.items[0].line_total_minor, 17000);
});

test("order edits persist items, discounts and table transfers atomically", async () => {
  assert.ok(createdOrderId);
  const edited = await request(`/api/orders/${createdOrderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      items: [
        { menu_item_id: "test-fatir-cheese", quantity: 1 },
        { menu_item_id: "test-tea", quantity: 2, notes: "بدون سكر" }
      ],
      discount_minor: 500,
      table_id: "table-9",
      table_number: 9,
      table_area: "outdoor"
    })
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.subtotal_minor, 11500);
  assert.equal(edited.body.discount_minor, 500);
  assert.equal(edited.body.total_minor, 11000);
  assert.equal(edited.body.table_number, 9);
  assert.equal(edited.body.table_area, "outdoor");
  assert.equal(edited.body.items.length, 2);
  assert.equal(edited.body.items[1].line_total_minor, 3000);

  const invalid = await request(`/api/orders/${createdOrderId}`, {
    method: "PATCH",
    body: JSON.stringify({ items: [{ menu_item_id: "missing-product", quantity: 1 }] })
  });
  assert.equal(invalid.response.status, 400);

  const listed = await request("/api/orders");
  const saved = listed.body.find((order) => order.id === createdOrderId);
  assert.equal(saved.total_minor, 11000);
  assert.equal(saved.table_number, 9);
  assert.equal(saved.items.length, 2);
});

test("order status rejects invalid values and persists valid transitions", async () => {
  const created = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      items: [{ menu_item_id: "test-tea", quantity: 1 }]
    })
  });
  assert.equal(created.response.status, 201);

  let result = await request(`/api/orders/${created.body.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "unknown" })
  });
  assert.equal(result.response.status, 400);

  result = await request(`/api/orders/${created.body.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "preparing" })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, "preparing");

  const listed = await request("/api/orders");
  assert.equal(listed.body.find((order) => order.id === created.body.id).status, "preparing");
});

test("full payments are validated, recorded once and close the order", async () => {
  const created = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ menu_item_id: "test-tea", quantity: 2 }] })
  });
  assert.equal(created.response.status, 201);
  paidOrderId = created.body.id;
  const delivered = await request(`/api/orders/${paidOrderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "delivered" })
  });
  assert.equal(delivered.response.status, 200);

  let result = await request(`/api/orders/${paidOrderId}/pay`, {
    method: "POST",
    body: JSON.stringify({ payment_method: "cash", amount_minor: 1000 })
  });
  assert.equal(result.response.status, 400);

  result = await request(`/api/orders/${paidOrderId}/pay`, {
    method: "POST",
    body: JSON.stringify({ payment_method: "bitcoin" })
  });
  assert.equal(result.response.status, 400);

  result = await request(`/api/orders/${paidOrderId}/pay`, {
    method: "POST",
    body: JSON.stringify({ payment_method: "card" })
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.payment.amount_minor, 3000);
  assert.equal(result.body.payment.payment_method, "card");
  assert.equal(result.body.payment.payment_status, "paid");
  assert.equal(result.body.order.status, "delivered");
  assert.equal(result.body.order.payment_status, "paid");
  assert.ok(result.body.order.closed_at);

  const duplicate = await request(`/api/orders/${paidOrderId}/pay`, {
    method: "POST",
    body: JSON.stringify({ payment_method: "cash" })
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(server.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE order_id=?").get(paidOrderId).count, 1);
});

test("SQLite orders survive a complete local service restart", async () => {
  assert.ok(createdOrderId, "an order must have been created by the earlier integration test");
  await server.close();
  server = await startLocalServer({ userDataPath: tempDir, port: 0 });
  baseUrl = `http://127.0.0.1:${server.port}`;
  const listed = await request("/api/orders");
  const saved = listed.body.find((order) => order.id === createdOrderId);
  assert.ok(saved, "the order must still exist after reopening SQLite");
  assert.equal(saved.total_minor, 16000);
  assert.equal(saved.status, "pending");
  const paid = listed.body.find((order) => order.id === paidOrderId);
  assert.ok(paid, "paid order must survive a database restart");
  assert.equal(paid.status, "delivered");
  assert.equal(paid.payment_status, "paid");
  assert.equal(server.db.prepare("SELECT COUNT(*) AS count FROM payments WHERE order_id=?").get(paidOrderId).count, 1);
});

test("invalid menu imports are rejected without damaging the existing menu", async () => {
  const beforeMenu = await request("/api/menu");
  const result = await request("/api/menu/import", {
    method: "PUT",
    body: JSON.stringify({
      categories: [{ id: "new-category", name: "New category" }],
      items: [{ id: "broken-item", category_id: "missing-category", name: "Broken", price: 10 }]
    })
  });
  assert.equal(result.response.status, 400);

  const afterMenu = await request("/api/menu");
  assert.equal(afterMenu.body.items.length, beforeMenu.body.items.length);
  assert.ok(afterMenu.body.items.some((item) => item.id === "test-fatir-cheese"));

  const unsafePrice = await request("/api/menu/import", {
    method: "PUT",
    body: JSON.stringify({
      categories: [{ id: "safe-category", name: "Safe category" }],
      items: [{ id: "unsafe-price", category_id: "safe-category", name: "Unsafe", price: 1e100 }]
    })
  });
  assert.equal(unsafePrice.response.status, 400);
  const finalMenu = await request("/api/menu");
  assert.ok(finalMenu.body.items.some((item) => item.id === "test-fatir-cheese"));
});
