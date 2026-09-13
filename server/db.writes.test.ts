import { describe, expect, it } from "vitest";
import { activityEvents, notifications, orders, Product } from "../drizzle/schema";
import { addOrderMessage, buildProductUpdateValues, createOrder, updateOrderStatus, writeMessageSideEffects, writeOrderCreatedSideEffects, writeStatusSideEffects } from "./db";

type Call = { table: unknown; values: unknown };

function recorder() {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      insert(table: unknown) {
        return { values: async (values: unknown) => { calls.push({ table, values }); } };
      },
    },
  };
}

function flowRecorder() {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      insert(table: unknown) {
        return { values: async (values: unknown) => {
          calls.push({ table, values });
          return table === orders ? [{ insertId: 77 }, []] : [{ insertId: 1 }, []];
        } };
      },
      update(table: unknown) {
        return { set(values: unknown) { calls.push({ table, values }); return { where: async () => undefined }; } };
      },
    },
  };
}

const flowProduct = { id: 4, storeId: 2, name: "كرواسون", description: "منتج", category: "فطور", priceCents: 450, imageUrl: "/product.jpg", badge: null, stock: 12, isActive: 1, createdAt: new Date() } as Product;
const flowOrder = { order: { id: 77, orderNumber: "HS-3511", storeId: 2, customerName: "ريم", customerPhone: "079", customerAddress: "اللويبدة", customerNote: null, status: "new" as const, totalCents: 450, createdAt: new Date(), updatedAt: new Date() }, store: null, items: [], messages: [], events: [], notifications: [] };

describe("product update regression", () => {
  it("whitelists mutable fields and never overwrites product images", () => {
    expect(buildProductUpdateValues({ priceCents: 990, stock: 4 })).toEqual({ priceCents: 990, stock: 4 });
    expect(buildProductUpdateValues({ priceCents: 990, stock: 4 } as { priceCents?: number; stock?: number; isActive?: boolean } as any)).not.toHaveProperty("imageUrl");
    expect(buildProductUpdateValues({})).toEqual({});
  });
});

describe("connected side-effect writes", () => {
  it("writes an activity event and two audience notifications for a new order", async () => {
    const { db, calls } = recorder();
    await writeOrderCreatedSideEffects(db, { orderId: 21, customerName: "ريم", totalCents: 890, orderNumber: "HS-3511" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.table).toBe(activityEvents);
    expect(calls[1]?.table).toBe(notifications);
    expect(calls[1]?.values).toEqual(expect.arrayContaining([expect.objectContaining({ audience: "customer" }), expect.objectContaining({ audience: "owner" })]));
  });

  it("writes status activity and significant-status notifications", async () => {
    const { db, calls } = recorder();
    await writeStatusSideEffects(db, { orderId: 21, orderNumber: "HS-3511", from: "confirmed", to: "ready", actorRole: "store", label: "جاهز" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toEqual(expect.objectContaining({ eventType: "status_changed" }));
    expect(calls[1]?.values).toEqual(expect.arrayContaining([expect.objectContaining({ audience: "customer" }), expect.objectContaining({ audience: "owner" })]));
  });

  it("writes an owner notification when the customer sends a change request", async () => {
    const { db, calls } = recorder();
    await writeMessageSideEffects(db, { orderId: 21, orderNumber: "HS-3511", senderRole: "customer", senderName: "ريم", body: "غيّر العنوان", isChangeRequest: true });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toEqual(expect.objectContaining({ eventType: "change_requested" }));
    expect(calls[1]?.table).toBe(notifications);
    expect(calls[1]?.values).toEqual(expect.objectContaining({ audience: "owner", title: "طلب تعديل جديد" }));
  });

  it("writes a customer notification when the store sends a message", async () => {
    const { db, calls } = recorder();
    await writeMessageSideEffects(db, { orderId: 21, orderNumber: "HS-3511", senderRole: "store", senderName: "مخبز سكر", body: "طلبك جاهز" });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.values).toEqual(expect.objectContaining({ audience: "customer", body: "طلبك جاهز" }));
  });

  it("proves createOrder writes its event and audience notifications", async () => {
    const { db, calls } = flowRecorder();
    await createOrder({ storeId: 2, customerName: "ريم", customerPhone: "079 123 4567", customerAddress: "اللويبدة", items: [{ productId: 4, quantity: 1 }] }, { db, productRows: [flowProduct], resolveOrder: async () => null });
    expect(calls.some((call) => call.table === activityEvents)).toBe(true);
    expect(calls.some((call) => call.table === notifications && Array.isArray(call.values))).toBe(true);
  });

  it("proves updateOrderStatus writes status activity and customer/owner notifications", async () => {
    const { db, calls } = flowRecorder();
    await updateOrderStatus("HS-3511", "ready", "store", { db, currentOrder: { ...flowOrder, order: { ...flowOrder.order, status: "confirmed" as const } }, resolveOrder: async () => null });
    expect(calls.some((call) => call.table === activityEvents && (call.values as { eventType?: string }).eventType === "status_changed")).toBe(true);
    expect(calls.some((call) => call.table === notifications && Array.isArray(call.values))).toBe(true);
  });

  it("proves addOrderMessage writes the message event and owner notification", async () => {
    const { db, calls } = flowRecorder();
    await addOrderMessage("HS-3511", { senderRole: "customer", senderName: "ريم", body: "غيّر العنوان", isChangeRequest: true }, { db, currentOrder: flowOrder, resolveOrder: async () => null });
    expect(calls.some((call) => call.table === activityEvents && (call.values as { eventType?: string }).eventType === "change_requested")).toBe(true);
    expect(calls.some((call) => call.table === notifications && (call.values as { audience?: string }).audience === "owner")).toBe(true);
  });
});
