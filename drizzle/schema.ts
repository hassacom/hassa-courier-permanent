import { double, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the local auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "store", "admin", "staff"]).default("user").notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  emailVerificationTokenHash: varchar("emailVerificationTokenHash", { length: 128 }),
  emailVerificationExpiresAt: timestamp("emailVerificationExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 128 }),
  name: varchar("name", { length: 160 }).notNull(),
  handle: varchar("handle", { length: 80 }).notNull().unique(),
  category: varchar("category", { length: 80 }).notNull(),
  neighborhood: varchar("neighborhood", { length: 120 }).notNull(),
  description: text("description").notNull(),
  latitude: double("latitude"),
  longitude: double("longitude"),
  verificationStatus: mysqlEnum("verificationStatus", ["unverified", "pending", "verified", "rejected"]).default("unverified").notNull(),
  verifiedAt: timestamp("verifiedAt"),
  verifiedByOpenId: varchar("verifiedByOpenId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  priceCents: int("priceCents").notNull(),
  imageUrl: varchar("imageUrl", { length: 500 }).notNull(),
  referenceCode: varchar("referenceCode", { length: 40 }).unique(),
  badge: varchar("badge", { length: 80 }),
  stock: int("stock").default(24).notNull(),
  approvalStatus: mysqlEnum("approvalStatus", ["draft", "pending_review", "approved", "rejected", "withdrawn"]).default("approved").notNull(),
  approvalNote: text("approvalNote"),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  approvedByOpenId: varchar("approvedByOpenId", { length: 128 }),
  withdrawnAt: timestamp("withdrawnAt"),
  withdrawnReason: text("withdrawnReason"),
  withdrawnByOpenId: varchar("withdrawnByOpenId", { length: 128 }),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productMediaTypeEnum = ["image", "video"] as const;
export type ProductMediaType = (typeof productMediaTypeEnum)[number];

export const productMedia = mysqlTable("productMedia", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  mediaType: mysqlEnum("mediaType", productMediaTypeEnum).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  storageKey: varchar("storageKey", { length: 500 }),
  altText: varchar("altText", { length: 200 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const productReviews = mysqlTable("productReviews", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  customerOpenId: varchar("customerOpenId", { length: 128 }).notNull(),
  customerName: varchar("customerName", { length: 120 }).notNull(),
  rating: int("rating").notNull(),
  title: varchar("title", { length: 160 }),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["published", "hidden"]).default("published").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("product_reviews_product_customer_unique").on(table.productId, table.customerOpenId)]);

export const orderStatusEnum = ["new", "confirmed", "ready", "out_for_delivery", "in_transit", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof orderStatusEnum)[number];

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
  storeId: int("storeId").notNull(),
  customerOpenId: varchar("customerOpenId", { length: 128 }),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  customerAddress: varchar("customerAddress", { length: 300 }).notNull(),
  customerNote: text("customerNote"),
  status: mysqlEnum("status", orderStatusEnum).default("new").notNull(),
  statusReason: text("statusReason"),
  totalCents: int("totalCents").notNull(),
  discountCents: int("discountCents").default(0).notNull(),
  deliveredAt: timestamp("deliveredAt"),
  deliveryProofUrl: varchar("deliveryProofUrl", { length: 1000 }),
  deliveryProofKey: varchar("deliveryProofKey", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 160 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPriceCents: int("unitPriceCents").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** One active/history record per order; the current courier is replaced on reassignment. */
export const courierAssignments = mysqlTable("courierAssignments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  courierOpenId: varchar("courierOpenId", { length: 128 }).notNull(),
  assignedByOpenId: varchar("assignedByOpenId", { length: 128 }).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("courier_assignments_order_unique").on(table.orderId)]);

export const actorRoleEnum = ["customer", "store", "admin", "system"] as const;
export type ActorRole = (typeof actorRoleEnum)[number];

export const orderMessages = mysqlTable("orderMessages", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  senderRole: mysqlEnum("senderRole", actorRoleEnum).notNull(),
  senderName: varchar("senderName", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityEventTypeEnum = [
  "order_created",
  "status_changed",
  "message_sent",
  "change_requested",
  "customer_updated",
  "store_update",
  "system_note",
] as const;
export type ActivityEventType = (typeof activityEventTypeEnum)[number];

export const activityEvents = mysqlTable("activityEvents", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId"),
  actorRole: mysqlEnum("actorRole", actorRoleEnum).notNull(),
  eventType: mysqlEnum("eventType", activityEventTypeEnum).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notificationAudienceEnum = ["customer", "store", "owner"] as const;
export type NotificationAudience = (typeof notificationAudienceEnum)[number];

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId"),
  storeId: int("storeId"),
  audience: mysqlEnum("audience", notificationAudienceEnum).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  isRead: int("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductMedia = typeof productMedia.$inferSelect;
export type ProductReview = typeof productReviews.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type StoreSubscription = typeof storeSubscriptions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CourierAssignment = typeof courierAssignments.$inferSelect;

/** Latest GPS point shared by a courier while working. One row per courier. */
export const courierLocations = mysqlTable("courierLocations", {
  id: int("id").autoincrement().primaryKey(),
  courierOpenId: varchar("courierOpenId", { length: 128 }).notNull().unique(),
  orderId: int("orderId"),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  accuracyMeters: double("accuracyMeters"),
  heading: double("heading"),
  speedKph: double("speedKph"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CourierLocation = typeof courierLocations.$inferSelect;
export type OrderMessage = typeof orderMessages.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

export const supportConversationStatusEnum = ["open", "waiting_store", "waiting_customer", "escalated_store", "closed"] as const;
export type SupportConversationStatus = (typeof supportConversationStatusEnum)[number];
export const supportChannelEnum = ["customer_support", "merchant_support"] as const;
export type SupportChannel = (typeof supportChannelEnum)[number];

export const supportConversations = mysqlTable("supportConversations", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId"),
  storeId: int("storeId"),
  channel: mysqlEnum("channel", supportChannelEnum).default("customer_support").notNull(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerOpenId: varchar("customerOpenId", { length: 128 }),
  customerContact: varchar("customerContact", { length: 120 }),
  subject: varchar("subject", { length: 200 }).notNull(),
  status: mysqlEnum("status", supportConversationStatusEnum).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  closedAt: timestamp("closedAt"),
  closedByRole: varchar("closedByRole", { length: 20 }),
  closedByOpenId: varchar("closedByOpenId", { length: 128 }),
  closedByName: varchar("closedByName", { length: 120 }),
});

export const supportMessages = mysqlTable("supportMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderRole: mysqlEnum("senderRole", actorRoleEnum).notNull(),
  senderName: varchar("senderName", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const supportParticipants = mysqlTable("supportParticipants", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["customer", "store", "admin"]).notNull(),
  userOpenId: varchar("userOpenId", { length: 128 }),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export const supportConversationReads = mysqlTable("supportConversationReads", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  viewerRole: mysqlEnum("viewerRole", ["customer", "store", "admin"]).notNull(),
  viewerOpenId: varchar("viewerOpenId", { length: 128 }),
  lastReadAt: timestamp("lastReadAt").defaultNow().notNull(),
});

export const supportEscalations = mysqlTable("supportEscalations", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  fromRole: mysqlEnum("fromRole", ["admin", "store"]).notNull(),
  toRole: mysqlEnum("toRole", ["store", "admin"]).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportConversation = typeof supportConversations.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type SupportParticipant = typeof supportParticipants.$inferSelect;
export type SupportConversationRead = typeof supportConversationReads.$inferSelect;
export type SupportEscalation = typeof supportEscalations.$inferSelect;

export const staffShifts = mysqlTable("staffShifts", {
  id: int("id").autoincrement().primaryKey(),
  staffOpenId: varchar("staffOpenId", { length: 128 }).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  startAvailability: mysqlEnum("startAvailability", ["available", "busy", "unavailable"]).default("available").notNull(),
  endAvailability: mysqlEnum("endAvailability", ["available", "busy", "unavailable"]),
  activeConversationCount: int("activeConversationCount").default(0).notNull(),
});
export type StaffShift = typeof staffShifts.$inferSelect;

export const subscriptionBillingPeriodEnum = ["monthly", "yearly"] as const;
export const subscriptionStatusEnum = ["none", "trial", "active", "past_due", "cancelled"] as const;

export const subscriptionPlans = mysqlTable("subscriptionPlans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  featureSummary: text("featureSummary"),
  priceCents: int("priceCents").default(0).notNull(),
  billingPeriod: mysqlEnum("billingPeriod", subscriptionBillingPeriodEnum).default("monthly").notNull(),
  trialDays: int("trialDays").default(0).notNull(),
  isActive: int("isActive").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const storeSubscriptions = mysqlTable("storeSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique(),
  planId: int("planId"),
  status: mysqlEnum("status", subscriptionStatusEnum).default("none").notNull(),
  startedAt: timestamp("startedAt"),
  trialEndsAt: timestamp("trialEndsAt"),
  endsAt: timestamp("endsAt"),
  updatedByOpenId: varchar("updatedByOpenId", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const accountSettings = mysqlTable("accountSettings", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 128 }).notNull().unique(),
  phone: varchar("phone", { length: 40 }),
  locale: varchar("locale", { length: 12 }).default("ar-JO").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Amman").notNull(),
  orderUpdates: int("orderUpdates").default(1).notNull(),
  supportNotifications: int("supportNotifications").default(1).notNull(),
  marketingNotifications: int("marketingNotifications").default(0).notNull(),
  profileVisibility: mysqlEnum("profileVisibility", ["private", "support_only"]).default("private").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const storeSettings = mysqlTable("storeSettings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique(),
  contactPhone: varchar("contactPhone", { length: 40 }),
  address: varchar("address", { length: 300 }),
  openingHours: text("openingHours"),
  acceptingOrders: int("acceptingOrders").default(1).notNull(),
  orderNotifications: int("orderNotifications").default(1).notNull(),
  supportNotifications: int("supportNotifications").default(1).notNull(),
  publicProfile: int("publicProfile").default(1).notNull(),
  teamAccess: mysqlEnum("teamAccess", ["owner_only", "support_team"]).default("owner_only").notNull(),
  automaticCourierAssignment: int("automaticCourierAssignment").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffStatusEnum = ["invited", "active", "suspended"] as const;
export const staffTypeEnum = ["support", "courier", "delivery_support"] as const;
export type StaffType = (typeof staffTypeEnum)[number];
export const staffAvailabilityEnum = ["available", "busy", "unavailable"] as const;
export const staffInvitations = mysqlTable("staffInvitations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  staffType: mysqlEnum("staffType", staffTypeEnum).default("support").notNull(),
  invitedByOpenId: varchar("invitedByOpenId", { length: 128 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffMembers = mysqlTable("staffMembers", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  staffType: mysqlEnum("staffType", staffTypeEnum).default("support").notNull(),
  status: mysqlEnum("status", staffStatusEnum).default("active").notNull(),
  availability: mysqlEnum("availability", staffAvailabilityEnum).default("unavailable").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffPasswordResets = mysqlTable("staffPasswordResets", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 128 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  createdByOpenId: varchar("createdByOpenId", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffRecoveryRequestStatusEnum = ["pending", "resolved"] as const;
export const staffRecoveryRequests = mysqlTable("staffRecoveryRequests", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  userOpenId: varchar("userOpenId", { length: 128 }),
  status: mysqlEnum("status", staffRecoveryRequestStatusEnum).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedByOpenId: varchar("resolvedByOpenId", { length: 128 }),
});

export const supportPriorityEnum = ["low", "normal", "high", "urgent"] as const;
export const supportAssignments = mysqlTable("supportAssignments", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().unique(),
  assigneeOpenId: varchar("assigneeOpenId", { length: 128 }),
  priority: mysqlEnum("priority", supportPriorityEnum).default("normal").notNull(),
  slaDueAt: timestamp("slaDueAt"),
  assignedAt: timestamp("assignedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const supportViewAudit = mysqlTable("supportViewAudit", {
  id: int("id").autoincrement().primaryKey(),
  adminOpenId: varchar("adminOpenId", { length: 128 }).notNull(),
  targetOpenId: varchar("targetOpenId", { length: 128 }).notNull(),
  targetRole: mysqlEnum("targetRole", ["user", "store"]).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccountSettings = typeof accountSettings.$inferSelect;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type StaffMember = typeof staffMembers.$inferSelect;
export type StaffPasswordReset = typeof staffPasswordResets.$inferSelect;
export type StaffRecoveryRequest = typeof staffRecoveryRequests.$inferSelect;
export type SupportAssignment = typeof supportAssignments.$inferSelect;
export type SupportViewAudit = typeof supportViewAudit.$inferSelect;

/** Daily CSV exports created before destructive product/order cleanup. */
export const operationArchives = mysqlTable("operationArchives", {
  id: int("id").autoincrement().primaryKey(),
  scope: varchar("scope", { length: 20 }).notNull(),
  entity: varchar("entity", { length: 20 }).notNull(),
  requestedByOpenId: varchar("requestedByOpenId", { length: 128 }).notNull(),
  fromDate: varchar("fromDate", { length: 10 }).notNull(),
  toDate: varchar("toDate", { length: 10 }).notNull(),
  rowCount: int("rowCount").default(0).notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OperationArchive = typeof operationArchives.$inferSelect;
