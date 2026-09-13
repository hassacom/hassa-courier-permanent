import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  listCatalog: vi.fn(), listOrders: vi.fn(), getOrderByNumber: vi.fn(), createOrder: vi.fn(), updateOrderStatus: vi.fn(), updateCustomerDetails: vi.fn(), addOrderMessage: vi.fn(), getAdminSnapshot: vi.fn(), getOwnerNotifications: vi.fn(), markOwnerNotificationsRead: vi.fn(), createSupportConversation: vi.fn(), getSupportConversation: vi.fn(), listSupportConversations: vi.fn(), listStaffSupportInbox: vi.fn(), closeAssignedSupportConversation: vi.fn(), finishSupportConversation: vi.fn(), updateSupportConversationStatus: vi.fn(), sendSupportMessage: vi.fn(), markSupportConversationRead: vi.fn(), escalateSupportConversation: vi.fn(), getStoreForOwner: vi.fn(), startStaffShift: vi.fn(), endStaffShift: vi.fn(),
}));
vi.mock("./db", () => dbMocks);
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import { appRouter } from "./routers";

const context = { user: null, req: {} as never, res: {} as never };

describe("support conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.listSupportConversations.mockResolvedValue([]);
    dbMocks.getSupportConversation.mockResolvedValue(null);
    dbMocks.createSupportConversation.mockResolvedValue({ conversationId: 8 });
    dbMocks.sendSupportMessage.mockResolvedValue({ conversation: { id: 8 }, messages: [], unreadCount: 0 });
    dbMocks.markSupportConversationRead.mockResolvedValue({ conversation: { id: 8 }, messages: [], unreadCount: 0 });
    dbMocks.escalateSupportConversation.mockResolvedValue({ conversation: { id: 8, status: "escalated_store" }, messages: [], escalations: [], unreadCount: 0 });
    dbMocks.getStoreForOwner.mockResolvedValue({ id: 22, name: "متجر ريم" });
    dbMocks.startStaffShift.mockResolvedValue({ id: 3 });
    dbMocks.endStaffShift.mockResolvedValue({ activeConversationCount: 0 });
  });

  it("requires authentication for support access", async () => {
    const caller = appRouter.createCaller(context);
    await expect(caller.support.list({ viewerRole: "customer" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.support.send({ conversationId: 8, senderRole: "customer", senderName: "ريم", body: "أحتاج مساعدة" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets an authenticated customer open a conversation", async () => {
    const caller = appRouter.createCaller({ user: { role: "user", openId: "customer-456" } as never, req: {} as never, res: {} as never });
    const result = await caller.support.create({ customerName: "ريم", customerContact: "079 111 2222", subject: "تعديل على الطلب", initialMessage: "هل يمكن تغيير وقت التوصيل؟" });
    expect(result).toEqual({ conversationId: 8 });
    expect(dbMocks.createSupportConversation).toHaveBeenCalledWith(expect.objectContaining({ customerName: "ريم", initialMessage: "هل يمكن تغيير وقت التوصيل؟" }));
  });

  it("creates a separate merchant-support ticket for the authenticated store owner", async () => {
    const storeCaller = appRouter.createCaller({ user: { role: "store", openId: "store-123", email: "store@example.com" } as never, req: {} as never, res: {} as never });
    await storeCaller.support.create({ customerName: "متجر ريم", subject: "طلب توثيق", initialMessage: "أرغب بتوثيق حساب متجري" });
    expect(dbMocks.createSupportConversation).toHaveBeenCalledWith(expect.objectContaining({ storeId: 22, channel: "merchant_support", customerOpenId: undefined }));
  });

  it("records staff shift start and end only for a support account", async () => {
    const staffCaller = appRouter.createCaller({ user: { role: "staff", openId: "staff-1" } as never, req: {} as never, res: {} as never });
    await staffCaller.admin.startShift({ availability: "available" });
    await staffCaller.admin.endShift({ availability: "unavailable" });
    expect(dbMocks.startStaffShift).toHaveBeenCalledWith("staff-1", "available");
    expect(dbMocks.endStaffShift).toHaveBeenCalledWith("staff-1", "unavailable");
    const customerCaller = appRouter.createCaller({ user: { role: "user", openId: "customer-1" } as never, req: {} as never, res: {} as never });
    await expect(customerCaller.admin.startShift({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes the authenticated customer identity into support queries and creation", async () => {
    const customerCaller = appRouter.createCaller({ user: { role: "user", openId: "customer-123" } as never, req: {} as never, res: {} as never });
    await customerCaller.support.list({ viewerRole: "customer" });
    expect(dbMocks.listSupportConversations).toHaveBeenCalledWith("customer", "customer-123");
    await customerCaller.support.create({ customerName: "ريم", subject: "استفسار", initialMessage: "أحتاج مساعدة" });
    expect(dbMocks.createSupportConversation).toHaveBeenCalledWith(expect.objectContaining({ customerOpenId: "customer-123" }));
  });

  it("passes the authenticated store identity into store support operations", async () => {
    const storeCaller = appRouter.createCaller({ user: { role: "store", openId: "store-123" } as never, req: {} as never, res: {} as never });
    await storeCaller.support.list({ viewerRole: "store" });
    expect(dbMocks.listSupportConversations).toHaveBeenCalledWith("store", "store-123");
    await storeCaller.support.get({ conversationId: 8, viewerRole: "store" });
    expect(dbMocks.getSupportConversation).toHaveBeenCalledWith(8, "store", "store-123");
    await storeCaller.support.markRead({ conversationId: 8, viewerRole: "store" });
    expect(dbMocks.markSupportConversationRead).toHaveBeenCalledWith(8, "store", "store-123");
  });

  it("surfaces a customer-created conversation to the admin support view", async () => {
    dbMocks.listSupportConversations.mockResolvedValue([{ conversation: { id: 8, subject: "مساعدة في الطلب", status: "open" }, unreadCount: 1 }]);
    const adminCaller = appRouter.createCaller({ user: { role: "admin", openId: "admin-queue" } as never, req: {} as never, res: {} as never });
    const result = await adminCaller.support.list({ viewerRole: "admin" });
    expect(result[0]?.conversation.id).toBe(8);
    expect(result[0]?.unreadCount).toBe(1);
    expect(dbMocks.listSupportConversations).toHaveBeenCalledWith("admin", undefined);
  });

  it("lets store and admin roles reply to the same thread", async () => {
    const storeCaller = appRouter.createCaller({ user: { role: "store", openId: "store-123" } as never, req: {} as never, res: {} as never });
    await storeCaller.support.send({ conversationId: 8, senderRole: "store", senderName: "فريق المتجر", body: "سنتابع طلبك الآن" });
    expect(dbMocks.sendSupportMessage).toHaveBeenCalledWith(expect.objectContaining({ senderRole: "store", actorOpenId: "store-123" }));

    const adminCaller = appRouter.createCaller({ user: { role: "admin" } as never, req: {} as never, res: {} as never });
    await adminCaller.support.list({ viewerRole: "admin" });
    expect(dbMocks.listSupportConversations).toHaveBeenCalledWith("admin", undefined);
  });

  it("tracks read state and lets admin escalate a thread to the store", async () => {
    const adminCaller = appRouter.createCaller({ user: { role: "admin" } as never, req: {} as never, res: {} as never });
    await adminCaller.support.markRead({ conversationId: 8, viewerRole: "admin" });
    expect(dbMocks.markSupportConversationRead).toHaveBeenCalledWith(8, "admin", undefined);
    await adminCaller.support.escalate({ conversationId: 8, note: "يرجى تأكيد وقت التجهيز" });
    expect(dbMocks.escalateSupportConversation).toHaveBeenCalledWith({ conversationId: 8, fromRole: "admin", note: "يرجى تأكيد وقت التجهيز" });
  });

  it("lets both admin and assigned staff close support conversations", async () => {
    dbMocks.finishSupportConversation.mockResolvedValue({ id: 8, status: "closed" });
    dbMocks.closeAssignedSupportConversation.mockResolvedValue({ id: 8, status: "closed" });
    const adminCaller = appRouter.createCaller({ user: { role: "admin", openId: "admin-1" } as never, req: {} as never, res: {} as never });
    const staffCaller = appRouter.createCaller({ user: { role: "staff", openId: "staff-1" } as never, req: {} as never, res: {} as never });
    await adminCaller.support.close({ conversationId: 8 });
    await staffCaller.support.close({ conversationId: 8 });
    expect(dbMocks.finishSupportConversation).toHaveBeenCalledWith(8, "admin-1", "admin");
    expect(dbMocks.closeAssignedSupportConversation).toHaveBeenCalledWith(8, "staff-1");
  });

  it("lets customer and store roles request permanent closure through the same protected procedure", async () => {
    dbMocks.finishSupportConversation.mockResolvedValue({ id: 8, status: "closed" });
    const customerCaller = appRouter.createCaller({ user: { role: "user", openId: "customer-1" } as never, req: {} as never, res: {} as never });
    const storeCaller = appRouter.createCaller({ user: { role: "store", openId: "store-1" } as never, req: {} as never, res: {} as never });
    await customerCaller.support.close({ conversationId: 8 });
    await storeCaller.support.close({ conversationId: 8 });
    expect(dbMocks.finishSupportConversation).toHaveBeenNthCalledWith(1, 8, "customer-1", "customer");
    expect(dbMocks.finishSupportConversation).toHaveBeenNthCalledWith(2, 8, "store-1", "store");
  });

  it("does not expose support tools to a customer account as store or admin", async () => {
    const userCaller = appRouter.createCaller({ user: { role: "user" } as never, req: {} as never, res: {} as never });
    await expect(userCaller.support.list({ viewerRole: "store" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userCaller.support.list({ viewerRole: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
