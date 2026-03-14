import assert from "node:assert/strict";
import test from "node:test";

import { mockDatabase } from "../data/mockDatabase.js";

test("mockDatabase: should have orders and users", () => {
  assert.ok(mockDatabase.orders);
  assert.ok(mockDatabase.users);
});

test("mockDatabase: orders should have sample data", () => {
  const order = mockDatabase.orders.ORD001;
  assert.equal(order.id, "ORD001");
  assert.equal(order.user, "小明");
  assert.equal(order.product, "iPhone 15");
  assert.equal(order.price, 5999);
  assert.equal(order.status, "已发货");
});

test("mockDatabase: users should have sample data", () => {
  const user = mockDatabase.users["小明"];
  assert.equal(user.name, "小明");
  assert.equal(user.vip, true);
  assert.equal(user.points, 1500);
});
