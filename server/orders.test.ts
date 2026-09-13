import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listOrders: vi.fn(),
  getOrderByNumber: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  updateCustomerDetails: vi.fn(),
  addOrderMessage: vi.fn(),
  getAdminSnapshot: vi.fn(),
  getOwnerNotifications: vi.fn(),
  markOwnerNotificationsRead: vi.fn(),
}));
const notificationMocks = vi.hoisted(() => ({ notifyOwner: vi.fn() }));

vi.mock("./db", () => dbMocks);
vi.mock("./_core/notification", () => notificationMocks);

import { appRouter } from "./routers";

describe("connected order workflows", () => {
  const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
  const customerCaller = appRouter.createCaller({ user: { role: "user", openId: "customer-test" } as never, req: {} as never, res: {} as never });
  const storeCaller = appRouter.createCaller({ user: { role: "store", openId: "store-test" } as never, req: {} as never, res: {} as never });
  const adminCaller = appRouter.createCaller({ user: { role: "admin", openId: "admin-test" } as never, req: {} as never, res: {} as never });
  const demoOrder = { order: { id: 7, orderNumber: "HS-3511", customerName: "ريم", totalCents: 890 }, store: { name: "مخبز سكر" } };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.createOrder.mockResolvedValue(demoOrder);
    dbMocks.getOrderByNumber.mockResolvedValue(demoOrder);
    dbMocks.updateOrderStatus.mockResolvedValue(demoOrder);
    dbMocks.addOrderMessage.mockResolvedValue(demoOrder);
    dbMocks.updateCustomerDetails.mockResolvedValue(demoOrder);
    dbMocks.getAdminSnapshot.mockResolvedValue({ orders: [], events: [], unreadNotifications: 0, metrics: { total: 0, newOrders: 0, inProgress: 0, delivered: 0, revenueCents: 0 } });
    notificationMocks.notifyOwner.mockResolvedValue(true);
  });

  it("creates an order and notifies the project owner", async () => {
    const result = await caller.orders.create({
      storeId: 2,
      customerName: "ريم",
      customerPhone: "079 111 2222",
      customerAddress: "اللويبدة",
      customerNote: "اتصل قبل الوصول",
      items: [{ productId: 4, quantity: 1 }],
    });

    expect(result).toEqual(demoOrder);
    expect(dbMocks.createOrder).toHaveBeenCalledOnce();
    expect(notificationMocks.notifyOwner).toHaveBeenCalledWith(expect.objectContaining({ title: "طلب جديد HS-3511" }));
  });

  it("keeps the actor role when a store changes status", async () => {
    await storeCaller.orders.updateStatus({ orderNumber: "HS-3511", status: "ready", actorRole: "store" });
    expect(dbMocks.updateOrderStatus).toHaveBeenCalledWith("HS-3511", "ready", "store");
    expect(notificationMocks.notifyOwner).toHaveBeenCalledOnce();
  });

  it("rejects an invalid privileged actor role at the contract boundary", async () => {
    await expect(caller.orders.updateStatus({ orderNumber: "HS-3511", status: "ready", actorRole: "customer" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("forwards customer messages as change requests into the shared workflow", async () => {
    await customerCaller.orders.sendMessage({ orderNumber: "HS-3511", senderRole: "customer", senderName: "ريم", body: "طلب تعديل: أضف جرسًا عند الوصول", isChangeRequest: true });
    expect(dbMocks.addOrderMessage).toHaveBeenCalledWith("HS-3511", expect.objectContaining({ isChangeRequest: true }));
  });

  it("forwards customer detail updates to the shared order record", async () => {
    await customerCaller.orders.updateCustomer({ orderNumber: "HS-3511", customerName: "ريم", customerPhone: "079 123 4567", customerAddress: "الشميساني" });
    expect(dbMocks.updateCustomerDetails).toHaveBeenCalledWith("HS-3511", expect.objectContaining({ customerAddress: "الشميساني" }));
  });

  it("rejects cross-account order access before mutation", async () => {
    dbMocks.getOrderByNumber.mockResolvedValueOnce(null);
    await expect(customerCaller.orders.updateCustomer({ orderNumber: "HS-9999", customerName: "ريم", customerPhone: "079 123 4567", customerAddress: "الشميساني" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.updateCustomerDetails).not.toHaveBeenCalled();
  });

  it("rejects a merchant from updating an order owned by another merchant", async () => {
    dbMocks.getOrderByNumber.mockResolvedValueOnce(null);
    await expect(storeCaller.orders.updateStatus({ orderNumber: "HS-9999", status: "ready", actorRole: "store" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dbMocks.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("requires authentication for protected order and admin operations", async () => {
    await expect(caller.orders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.admin.snapshot()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.orders.updateCustomer({ orderNumber: "HS-3511", customerName: "ريم", customerPhone: "079 123 4567", customerAddress: "الشميساني" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.orders.sendMessage({ orderNumber: "HS-3511", senderRole: "customer", senderName: "ريم", body: "رسالة بلا وضع تجريبي" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("enforces authenticated role boundaries", async () => {
    const userCaller = appRouter.createCaller({ user: { role: "user" } as never, req: {} as never, res: {} as never });
    const adminCaller = appRouter.createCaller({ user: { role: "admin" } as never, req: {} as never, res: {} as never });
    await expect(userCaller.orders.updateStatus({ orderNumber: "HS-3511", status: "ready", actorRole: "store" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userCaller.admin.snapshot()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await adminCaller.admin.snapshot();
    expect(dbMocks.getAdminSnapshot).toHaveBeenCalledOnce();
  });

  it("exposes the unified admin snapshot contract", async () => {
    const result = await adminCaller.admin.snapshot();
    expect(result.metrics).toEqual(expect.objectContaining({ total: 0, newOrders: 0 }));
    expect(dbMocks.getAdminSnapshot).toHaveBeenCalledOnce();
  });
});
