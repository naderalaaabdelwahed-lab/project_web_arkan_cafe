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
  assert.equal(result.body.subtotal_minor, 17000);
  assert.equal(result.body.discount_minor, 1000);
  assert.equal(result.body.total_minor, 16000);
  assert.equal(result.body.table_number, 7);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].quantity, 2);

  const listed = await request("/api/orders");
  const saved = listed.body.find((order) => order.id === result.body.id);
  assert.ok(saved, "created order must be returned by the orders endpoint");
  assert.equal(saved.total_minor, 16000);
  assert.equal(saved.items[0].line_total_minor, 17000);
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
});
