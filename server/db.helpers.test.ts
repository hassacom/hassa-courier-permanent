import { describe, expect, it } from "vitest";
import {
  buildMessageEvent,
  buildOrderCreatedEvent,
  buildOrderCreatedNotifications,
  buildStatusChangedEvent,
  buildStatusNotifications,
  countSupportUnread,
  emailOpenId,
  normalizePhone,
  chooseFairAvailableStaff,
  sanitizeAuditDescription,
  validateStaffDisplayName,
} from "./db";

describe("connected order event builders", () => {
  it("redacts sensitive identifiers from admin audit descriptions", () => {
    const safe = sanitizeAuditDescription("تم فتح user_abc123456 بواسطة agent@example.com");
    expect(safe).not.toContain("agent@example.com");
    expect(safe).not.toContain("user_abc123456");
    expect(safe).toContain("•••@");
  });
  it("keeps email account IDs within the users.openId database limit", () => {
    const openId = emailOpenId("qmralkwn77+1@gmail.com");
    expect(openId).toHaveLength(64);
    expect(openId).toMatch(/^email_[a-f0-9]{58}$/);
  });
  it("normalizes phone formats consistently for linked-account lookup", () => {
    expect(normalizePhone("+962 79-000-0000")).toBe("790000000");
    expect(normalizePhone("0790000000")).toBe("790000000");
  });
  it("accepts only short one- or two-part staff display names", () => {
    expect(validateStaffDisplayName("سارة")).toBe(true);
    expect(validateStaffDisplayName("سارة الدعم")).toBe(true);
    expect(validateStaffDisplayName("سارة فريق الدعم")).toBe(false);
    expect(validateStaffDisplayName("اسم موظف دعم طويل جدًا يتجاوز الحد المسموح به")).toBe(false);
  });
  it("excludes busy and unavailable staff and chooses the least-loaded available staff", () => {
    const members = [
      { staff: { userOpenId: "available-1", status: "active", availability: "available" } },
      { staff: { userOpenId: "busy-1", status: "active", availability: "busy" } },
      { staff: { userOpenId: "offline-1", status: "active", availability: "unavailable" } },
      { staff: { userOpenId: "available-2", status: "active", availability: "available" } },
    ];
    const counts = new Map([["available-1", 2], ["available-2", 0], ["busy-1", 0]]);
    expect(chooseFairAvailableStaff(members, counts, () => 0)?.staff.userOpenId).toBe("available-2");
  });

  it("returns no assignee when every available staff member reached two active conversations", () => {
    const members = [
      { staff: { userOpenId: "available-1", status: "active", availability: "available" } },
      { staff: { userOpenId: "available-2", status: "active", availability: "available" } },
    ];
    const counts = new Map([["available-1", 2], ["available-2", 2]]);
    expect(chooseFairAvailableStaff(members, counts, () => 0)).toBeNull();
  });

  it("returns no assignee when every staff member is busy or unavailable", async () => {
    const members = [
      { staff: { userOpenId: "busy-1", status: "active", availability: "busy" } },
      { staff: { userOpenId: "offline-1", status: "active", availability: "unavailable" } },
    ];
    expect(chooseFairAvailableStaff(members, new Map(), () => 0)).toBeNull();
  });

  it("uses the random tie breaker only among equally loaded available staff", () => {
    const members = [
      { staff: { userOpenId: "available-1", status: "active", availability: "available" } },
      { staff: { userOpenId: "available-2", status: "active", availability: "available" } },
    ];
    const counts = new Map([["available-1", 1], ["available-2", 1]]);
    expect(chooseFairAvailableStaff(members, counts, () => 0)?.staff.userOpenId).toBe("available-1");
    expect(chooseFairAvailableStaff(members, counts, () => 0.99)?.staff.userOpenId).toBe("available-2");
  });

  it("builds a customer order event and customer/owner notifications", () => {
    const event = buildOrderCreatedEvent({ orderId: 12, customerName: "ريم", totalCents: 890, orderNumber: "HS-3511" });
    const notifications = buildOrderCreatedNotifications({ orderId: 12, orderNumber: "HS-3511", totalCents: 890 });
    expect(event).toMatchObject({ orderId: 12, actorRole: "customer", eventType: "order_created", title: "طلب جديد من العميل" });
    expect(event.metadata).toContain("HS-3511");
    expect(notifications.map((item) => item.audience)).toEqual(["customer", "owner"]);
  });

  it("builds status-change activity and significant status notifications", () => {
    const event = buildStatusChangedEvent({ orderId: 12, orderNumber: "HS-3511", from: "new", to: "ready", actorRole: "store", label: "جاهز" });
    const notifications = buildStatusNotifications({ orderId: 12, orderNumber: "HS-3511", label: "جاهز" });
    expect(event).toMatchObject({ actorRole: "store", eventType: "status_changed", title: "تغيّرت الحالة إلى جاهز" });
    expect(event.metadata).toContain('"to":"ready"');
    expect(notifications[0]).toMatchObject({ audience: "customer", orderId: 12 });
    expect(notifications[1]).toMatchObject({ audience: "owner", orderId: 12 });
  });

  it("counts only messages newer than a role's last-read time", () => {
    const messages = [
      { senderRole: "customer" as const, createdAt: new Date("2026-08-24T10:00:00Z") },
      { senderRole: "admin" as const, createdAt: new Date("2026-08-24T10:05:00Z") },
      { senderRole: "customer" as const, createdAt: new Date("2026-08-24T10:10:00Z") },
    ];
    expect(countSupportUnread(messages, "store", new Date("2026-08-24T10:05:00Z"))).toBe(1);
    expect(countSupportUnread(messages, "store", new Date("2026-08-24T10:10:00Z"))).toBe(0);
  });

  it("marks customer change requests distinctly from ordinary messages", () => {
    const event = buildMessageEvent({ orderId: 12, senderRole: "customer", senderName: "ريم", body: "غيّر العنوان", isChangeRequest: true });
    expect(event).toMatchObject({ actorRole: "customer", eventType: "change_requested", title: "طلب تعديل من العميل" });
    expect(event.description).toContain("غيّر العنوان");
  });
});
