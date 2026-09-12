export type CourierStatus = "ready" | "out_for_delivery" | "in_transit" | "delivered";
export type CourierFilter = "all" | "active" | "ready" | "out_for_delivery" | "in_transit" | "delivered";

export function filterCourierOrders<T extends { status: CourierStatus }>(orders: T[], filter: CourierFilter): T[] {
  return orders.filter((order) => filter === "all" ? true : filter === "active" ? order.status !== "delivered" : order.status === filter);
}

export function courierCounts(orders: Array<{ status: CourierStatus; items: Array<{ quantity: number }> }>) {
  return {
    active: orders.filter((order) => order.status !== "delivered").length,
    delivered: orders.filter((order) => order.status === "delivered").length,
    items: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    total: orders.length,
  };
}
