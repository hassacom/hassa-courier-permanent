import { describe, expect, it } from "vitest";
import { courierCounts, filterCourierOrders, type CourierFilter } from "../shared/courier";

const orders = [
  { id: 1, status: "in_transit" as const, items: [{ quantity: 2 }] },
  { id: 2, status: "out_for_delivery" as const, items: [{ quantity: 1 }, { quantity: 3 }] },
  { id: 3, status: "delivered" as const, items: [{ quantity: 4 }] },
];

describe("courier order workspace", () => {
  it("filters active work without completed deliveries", () => {
    expect(filterCourierOrders(orders, "active").map((order) => order.id)).toEqual([1, 2]);
    expect(filterCourierOrders(orders, "delivered").map((order) => order.id)).toEqual([3]);
  });

  it("supports every report filter without changing the source list", () => {
    const filters: CourierFilter[] = ["all", "active", "ready", "out_for_delivery", "in_transit", "delivered"];
    expect(filters.map((filter) => filterCourierOrders(orders, filter).length)).toEqual([3, 2, 0, 1, 1, 1]);
    expect(orders).toHaveLength(3);
  });

  it("calculates the dashboard metrics used by the four summary cards", () => {
    expect(courierCounts(orders)).toEqual({ active: 2, delivered: 1, items: 10, total: 3 });
  });
});
