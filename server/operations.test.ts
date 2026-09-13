import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getAccountSettings: vi.fn(),
  getUserByEmail: vi.fn(),
  updateAccountSettings: vi.fn(),
  getStoreForOwner: vi.fn(),
  getStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
  createStoreForOwner: vi.fn(),
  listSupportQueue: vi.fn(),
  listStaffMembers: vi.fn(),
  getStaffMember: vi.fn(),
  promoteStaffMember: vi.fn(),
  setStaffStatus: vi.fn(),
  setStaffAvailability: vi.fn(),
  updateStaffDisplayName: vi.fn(),
  assignSupportConversation: vi.fn(),
  autoAssignSupportConversation: vi.fn(),
  getSupportViewTarget: vi.fn(),
  lookupCustomerForSupport: vi.fn(),
  updateCustomerSupportFields: vi.fn(),
  createStaffInvitation: vi.fn(),
  createStaffPasswordReset: vi.fn(),
  consumeStaffPasswordReset: vi.fn(),
  requestStaffPasswordRecovery: vi.fn(),
  listStaffRecoveryRequests: vi.fn(),
  resolveStaffRecoveryRequest: vi.fn(),
  acceptStaffInvitation: vi.fn(),
  listProductsForOwner: vi.fn(),
  createProductForOwner: vi.fn(),
  updateProductForOwner: vi.fn(),
  withdrawProductForOwner: vi.fn(),
  listOrdersForCustomer: vi.fn(),
  getAdminDirectory: vi.fn(),
  deleteAdminAccount: vi.fn(),
  setAdminCustomerVisibility: vi.fn(),
  setAdminStoreVisibility: vi.fn(),
  updateSupportConversationStatus: vi.fn(),
  archiveAdminAuditLog: vi.fn(),
  deleteAdminAuditLog: vi.fn(),
  getPublicProduct: vi.fn(),
}));
const emailMocks = vi.hoisted(() => ({ sendEmail: vi.fn(), buildVerificationEmail: vi.fn(() => ({ subject: "verify", html: "<p>verify</p>" })) }));

vi.mock("./db", () => dbMocks);
vi.mock("./email", () => emailMocks);

import { appRouter } from "./routers";
dbMocks.getStaffMember.mockResolvedValue({ staff: { staffType: "support", status: "active" } });

const context = (role: string, openId = `${role}-test`) => appRouter.createCaller({ user: { role, openId } as never, req: { protocol: "http", headers: {}, get: vi.fn(() => undefined) } as never, res: { setHeader: vi.fn(), cookie: vi.fn() } as never });

describe("operations platform access", () => {
  it("does not expose account settings to anonymous visitors", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.settings.account()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows a customer to update only their own account settings", async () => {
    dbMocks.updateAccountSettings.mockResolvedValue({ userOpenId: "customer-test", profileVisibility: "private" });
    await context("user").settings.updateAccount({ profileVisibility: "private", supportNotifications: false });
    expect(dbMocks.updateAccountSettings).toHaveBeenCalledWith("user-test", expect.objectContaining({ supportNotifications: false }));
  });

  it("allows staff to read the support queue but not the staff roster", async () => {
    dbMocks.listSupportQueue.mockResolvedValue([]);
    dbMocks.listStaffMembers.mockResolvedValue([]);
    await context("staff").admin.queue();
    expect(dbMocks.listSupportQueue).toHaveBeenCalledOnce();
    await expect(context("staff").admin.staff()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("archives and deletes filtered audit entries only for admins", async () => {
    dbMocks.archiveAdminAuditLog.mockResolvedValue({ archive: { id: 11 }, archivedCount: 3 });
    dbMocks.deleteAdminAuditLog.mockResolvedValue({ deletedCount: 3 });
    await expect(context("admin", "admin-1").admin.archiveAuditLog({ fromDate: "2026-09-01", toDate: "2026-09-04", actorRole: "customer" })).resolves.toMatchObject({ archivedCount: 3 });
    expect(dbMocks.archiveAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({ requestedByOpenId: "admin-1", actorRole: "customer" }));
    await expect(context("admin", "admin-1").admin.deleteAuditLog({ fromDate: "2026-09-01", toDate: "2026-09-04" })).resolves.toMatchObject({ deletedCount: 3 });
    expect(dbMocks.deleteAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({ requestedByOpenId: "admin-1" }));
    await expect(context("user").admin.archiveAuditLog({ fromDate: "2026-09-01", toDate: "2026-09-04" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps staff management restricted to admins", async () => {
    dbMocks.promoteStaffMember.mockResolvedValue({ openId: "agent-1", role: "staff" });
    await context("admin").admin.addStaff({ email: "agent@example.com" });
    expect(dbMocks.promoteStaffMember).toHaveBeenCalledWith("agent@example.com");
    await expect(context("user").admin.addStaff({ email: "agent@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assigns queue conversations manually and automatically only for support agents", async () => {
    dbMocks.assignSupportConversation.mockResolvedValue({ conversationId: 8, assigneeOpenId: "staff-1", priority: "high" });
    dbMocks.autoAssignSupportConversation.mockResolvedValue({ conversationId: 9, assigneeOpenId: "staff-2", priority: "normal" });
    await context("staff").admin.assignQueue({ conversationId: 8, assigneeOpenId: "staff-1", priority: "high" });
    await context("admin").admin.autoAssignQueue({ conversationId: 9 });
    expect(dbMocks.assignSupportConversation).toHaveBeenCalledWith(8, "staff-1", "high");
    expect(dbMocks.autoAssignSupportConversation).toHaveBeenCalledWith(9);
  });

  it("preserves an empty queue as an explicit empty state contract", async () => {
    dbMocks.listSupportQueue.mockResolvedValue([]);
    await expect(context("admin").admin.queue()).resolves.toEqual([]);
  });

  it("creates an admin-only staff invitation without sending external mail in tests", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Hassa <noreply@example.com>";
    emailMocks.sendEmail.mockResolvedValue({ sent: true, id: "mail-1" });
    dbMocks.createStaffInvitation.mockResolvedValue({ id: 1, email: "agent@example.com" });
    await context("admin", "admin-1").admin.inviteStaff({ email: "agent@example.com" });
    expect(dbMocks.createStaffInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: "agent@example.com", invitedByOpenId: "admin-1" }));
    expect(emailMocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("creates a manual staff invitation when Resend is deferred", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    emailMocks.sendEmail.mockClear();
    dbMocks.createStaffInvitation.mockResolvedValue({ id: 2, email: "manual-agent@example.com" });
    const result = await context("admin", "admin-2").admin.inviteStaff({ email: "manual-agent@example.com" });
    expect(result.delivery).toBe("manual");
    expect(result.sent).toBe(false);
    expect(result.inviteUrl).toContain("/staff/accept?token=");
    expect(dbMocks.createStaffInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: "manual-agent@example.com", invitedByOpenId: "admin-2" }));
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("lets support staff look up a customer but blocks ordinary customers", async () => {
    dbMocks.lookupCustomerForSupport.mockResolvedValue({ customer: { openId: "customer-1" }, settings: null, orders: [] });
    const result = await context("staff", "staff-1").admin.lookupCustomer({ query: "customer@example.com" });
    expect(result?.customer.openId).toBe("customer-1");
    expect(dbMocks.lookupCustomerForSupport).toHaveBeenCalledWith("staff-1", "customer@example.com");
    await expect(context("user").admin.lookupCustomer({ query: "customer@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("limits support staff customer edits to the safe support fields", async () => {
    dbMocks.updateCustomerSupportFields.mockResolvedValue({ success: true });
    await context("staff", "staff-1").admin.updateCustomerSupport({ userOpenId: "customer-1", phone: "0790000000", orderUpdates: false, supportNotifications: true });
    expect(dbMocks.updateCustomerSupportFields).toHaveBeenCalledWith("staff-1", "customer-1", expect.objectContaining({ phone: "0790000000", orderUpdates: false, supportNotifications: true }));
  });

  it("accepts a staff recovery request without exposing whether the email exists", async () => {
    dbMocks.requestStaffPasswordRecovery.mockResolvedValue({ accepted: true });
    await expect(context("user").staffRecovery.request({ email: "agent@example.com" })).resolves.toEqual({ accepted: true });
    expect(dbMocks.requestStaffPasswordRecovery).toHaveBeenCalledWith("agent@example.com");
  });

  it("keeps staff recovery requests visible only to admins", async () => {
    dbMocks.listStaffRecoveryRequests.mockResolvedValue([{ id: 7, email: "agent@example.com", status: "pending" }]);
    await expect(context("admin").admin.recoveryRequests()).resolves.toHaveLength(1);
    await expect(context("staff").admin.recoveryRequests()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("resolves a staff recovery request only when an admin issues its link", async () => {
    dbMocks.getUserByEmail.mockResolvedValue({ openId: "staff-1", email: "agent@example.com", role: "staff" });
    dbMocks.getStaffMember.mockResolvedValue({ staff: { userOpenId: "staff-1", status: "active", availability: "unavailable" }, user: { openId: "staff-1" } });
    dbMocks.createStaffPasswordReset.mockResolvedValue({ success: true });
    dbMocks.resolveStaffRecoveryRequest.mockResolvedValue({ success: true });
    await context("admin", "admin-1").admin.resetStaffPassword({ email: "agent@example.com", requestId: 7 });
    expect(dbMocks.resolveStaffRecoveryRequest).toHaveBeenCalledWith(7, "admin-1");
  });

  it("creates a one-time staff password reset link only for admins", async () => {
    dbMocks.getUserByEmail.mockResolvedValue({ openId: "staff-1", email: "agent@example.com", role: "staff" });
    dbMocks.getStaffMember.mockResolvedValue({ staff: { userOpenId: "staff-1", status: "active", availability: "unavailable" }, user: { openId: "staff-1" } });
    dbMocks.createStaffPasswordReset.mockResolvedValue({ success: true });
    const result = await context("admin", "admin-1").admin.resetStaffPassword({ email: "agent@example.com" });
    expect(result.resetUrl).toContain("/staff/reset-password?token=");
    expect(dbMocks.createStaffPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ userOpenId: "staff-1", createdByOpenId: "admin-1" }));
    await expect(context("user").admin.resetStaffPassword({ email: "agent@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a staff member change only their own availability and exposes the new value to admin reads", async () => {
    let availability = "unavailable";
    dbMocks.setStaffAvailability.mockImplementation(async (openId: string, next: string) => { availability = next; return { staff: { userOpenId: openId, availability: next } }; });
    dbMocks.listStaffMembers.mockImplementation(async () => [{ staff: { userOpenId: "staff-1", status: "active", availability }, user: { openId: "staff-1" } }]);
    await context("staff", "staff-1").admin.setAvailability({ availability: "available" });
    expect(dbMocks.setStaffAvailability).toHaveBeenCalledWith("staff-1", "available");
    await expect(context("admin", "admin-1").admin.staff()).resolves.toEqual([{ staff: { userOpenId: "staff-1", status: "active", availability: "available" }, user: { openId: "staff-1" } }]);
    await expect(context("user").admin.setAvailability({ availability: "available" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("consumes a valid staff password reset and creates a staff session", async () => {
    dbMocks.consumeStaffPasswordReset.mockResolvedValue({ openId: "staff-1", name: "وكيل الدعم", email: "agent@example.com", role: "staff" });
    const result = await context("user").auth.resetStaffPassword({ token: "valid-reset-token-123456", newPassword: "new-strong-pass" });
    expect(dbMocks.consumeStaffPasswordReset).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("scrypt$"));
    expect(result).toEqual({ success: true, role: "staff" });
  });

  it("accepts a valid staff invitation and creates a staff session", async () => {
    dbMocks.acceptStaffInvitation.mockResolvedValue({ openId: "staff-1", name: "وكيل الدعم", email: "agent@example.com", role: "staff" });
    const result = await context("user").auth.acceptStaff({ token: "valid-invitation-token-123456", name: "وكيل الدعم", password: "strong-pass-123" });
    expect(dbMocks.acceptStaffInvitation).toHaveBeenCalledOnce();
    expect(result).toEqual({ accepted: true, staffType: "support" });
  });

  it("keeps catalog management restricted to merchant accounts", async () => {
    dbMocks.listProductsForOwner.mockResolvedValue([]);
    await expect(context("user").settings.products()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await context("store", "store-1").settings.products();
    expect(dbMocks.listProductsForOwner).toHaveBeenCalledWith("store-1");
  });

  it("allows only merchants to withdraw a pending product review with a reason", async () => {
    dbMocks.withdrawProductForOwner.mockResolvedValue([{ id: 7, approvalStatus: "withdrawn", withdrawnReason: "تحديث الصور" }]);
    await expect(context("store", "store-1").settings.withdrawProduct({ productId: 7, reason: "تحديث الصور" })).resolves.toMatchObject([{ approvalStatus: "withdrawn" }]);
    expect(dbMocks.withdrawProductForOwner).toHaveBeenCalledWith("store-1", 7, "تحديث الصور");
    await expect(context("user").settings.withdrawProduct({ productId: 7, reason: "تحديث الصور" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exposes an active public product without requiring a customer session", async () => {
    dbMocks.getPublicProduct.mockResolvedValue({ product: { id: 12, name: "منتج عام", isActive: 1 }, store: { id: 2, name: "متجر محلي" } });
    const anonymous = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(anonymous.catalog.get({ productId: 12 })).resolves.toMatchObject({ product: { id: 12, name: "منتج عام" } });
    expect(dbMocks.getPublicProduct).toHaveBeenCalledWith(12);
  });

  it("passes merchant product creation through the ownership-scoped helper", async () => {
    dbMocks.getStoreForOwner.mockResolvedValue({ id: 1, name: "متجر تجريبي" });
    dbMocks.createProductForOwner.mockResolvedValue([{ id: 3, name: "منتج تجريبي" }]);
    await context("store", "store-1").settings.createProduct({ name: "منتج تجريبي", description: "وصف واضح للمنتج", category: "منزل", priceCents: 1250, imageUrl: "https://example.com/product.jpg", stock: 8, badge: null });
    expect(dbMocks.createProductForOwner).toHaveBeenCalledWith("store-1", expect.objectContaining({ priceCents: 1250, stock: 8 }));
  });

  it("exposes only the authenticated customer order history", async () => {
    dbMocks.listOrdersForCustomer.mockResolvedValue([{ order: { id: 7, orderNumber: "HS-1007" }, store: { name: "متجر" } }]);
    await expect(context("user", "customer-1").orders.mine()).resolves.toHaveLength(1);
    expect(dbMocks.listOrdersForCustomer).toHaveBeenCalledWith("customer-1");
    await expect(context("store", "store-1").orders.mine()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows only admins to update a staff display name", async () => {
    dbMocks.updateStaffDisplayName.mockResolvedValue({ userOpenId: "staff-1", displayName: "سارة الدعم" });
    await expect(context("admin", "admin-1").admin.updateStaffDisplayName({ userOpenId: "staff-1", displayName: "سارة الدعم" })).resolves.toMatchObject({ displayName: "سارة الدعم" });
    expect(dbMocks.updateStaffDisplayName).toHaveBeenCalledWith("staff-1", "سارة الدعم");
    await expect(context("staff", "staff-1").admin.updateStaffDisplayName({ userOpenId: "staff-1", displayName: "اسم غير مصرح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps the admin directory behind the admin role", async () => {
    dbMocks.getAdminDirectory.mockResolvedValue({ users: [], stores: [] });
    await expect(context("admin").admin.directory()).resolves.toEqual({ users: [], stores: [] });
    await expect(context("user").admin.directory()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admins to remove customer, staff, or merchant accounts only through the explicit role contract", async () => {
    dbMocks.deleteAdminAccount.mockResolvedValue({ deleted: true, targetRole: "user" });
    await expect(context("admin", "admin-1").admin.deleteAccount({ targetOpenId: "customer-1", targetRole: "user" })).resolves.toEqual({ deleted: true, targetRole: "user" });
    expect(dbMocks.deleteAdminAccount).toHaveBeenCalledWith("customer-1", "user", "admin-1");
    await expect(context("staff", "staff-1").admin.deleteAccount({ targetOpenId: "customer-1", targetRole: "user" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps the admin directory contract separated by customer, staff, and merchant groups", async () => {
    dbMocks.getAdminDirectory.mockResolvedValue({ users: [{ user: { role: "user" } }], staff: [{ user: { role: "staff" } }], stores: [] });
    await expect(context("admin").admin.directory()).resolves.toEqual(expect.objectContaining({ users: expect.any(Array), staff: expect.any(Array), stores: expect.any(Array) }));
  });

  it("restricts admin customer/store controls and support resolution to admins", async () => {
    dbMocks.setAdminCustomerVisibility.mockResolvedValue({ profileVisibility: "support_only" });
    dbMocks.setAdminStoreVisibility.mockResolvedValue({ publicProfile: 0 });
    dbMocks.updateSupportConversationStatus.mockResolvedValue({ id: 3, status: "closed" });
    await expect(context("admin", "admin-1").admin.setCustomerVisibility({ userOpenId: "customer-1", profileVisibility: "support_only" })).resolves.toMatchObject({ profileVisibility: "support_only" });
    await expect(context("admin", "admin-1").admin.setStoreVisibility({ storeId: 4, publicProfile: false })).resolves.toMatchObject({ publicProfile: 0 });
    await expect(context("admin", "admin-1").admin.resolveSupport({ conversationId: 3, status: "closed" })).resolves.toMatchObject({ status: "closed" });
    await expect(context("user").admin.setStoreVisibility({ storeId: 4, publicProfile: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records and returns read-only support view requests for admins", async () => {
    dbMocks.getSupportViewTarget.mockResolvedValue({ target: { openId: "customer-1" }, orders: [], readOnly: true });
    const result = await context("admin", "admin-1").admin.supportView({ targetOpenId: "customer-1", targetRole: "user", reason: "مراجعة مشكلة في الطلب" });
    expect(dbMocks.getSupportViewTarget).toHaveBeenCalledWith("admin-1", "customer-1", "user", "مراجعة مشكلة في الطلب");
    expect(result?.readOnly).toBe(true);
  });
});
