import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomUUID } from "node:crypto";
import {
  accountSettings,
  activityEvents,
  ActivityEventType,
  ActorRole,
  InsertUser,
  notifications,
  operationArchives,
  orderItems,
  orderMessages,
  orders,
  OrderStatus,
  Product,
  SupportChannel,
  productMedia,
  productReviews,
  products,
  stores,
  storeSettings,
  storeSubscriptions,
  subscriptionPlans,
  staffInvitations,
  staffMembers,
  StaffType,
  courierAssignments,
  courierLocations,
  staffPasswordResets,
  staffShifts,
  staffRecoveryRequests,
  supportAssignments,
  SupportConversationStatus,
  supportConversationReads,
  supportConversations,
  supportParticipants,
  supportEscalations,
  supportMessages,
  supportViewAudit,
  users,
} from "../drizzle/schema";
import { ENV, getAdminEmail } from "./_core/env";
import { appendCoordinatesToAddress, distanceInKm, estimateDeliveryMinutes, extractCoordinatesFromAddress } from "@shared/location";
import { DELIVERY_SUPPORT_PREFIX, encodeDeliverySupportMessage, isDeliverySupportMessage } from "@shared/deliverySupport";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;
let productWithdrawalSchemaPromise: Promise<void> | null = null;
let storeLocationSchemaPromise: Promise<void> | null = null;
let staffTypeSchemaPromise: Promise<void> | null = null;
let courierAssignmentSchemaPromise: Promise<void> | null = null;
let deliverySchemaPromise: Promise<void> | null = null;
let operationArchiveSchemaPromise: Promise<void> | null = null;
let orderWorkflowSchemaPromise: Promise<void> | null = null;
let legacyEmailRepairPromise: Promise<void> | null = null;
const PUBLIC_CATALOG_CACHE_TTL_MS = 10_000;

async function repairLegacyEmailValues(db: ReturnType<typeof drizzle>) {
  if (legacyEmailRepairPromise) return legacyEmailRepairPromise;
  legacyEmailRepairPromise = (async () => {
    // Older demo records contain the Arabic word "إلى" where the ASCII
    // sequence "to" belongs, e.g. demo_cusإلىmer -> demo_customer.
    await db.execute(sql.raw("UPDATE `users` SET `email` = REPLACE(REPLACE(`email`, 'إلى', 'to'), 'الى', 'to') WHERE `email` LIKE '%إلى%' OR `email` LIKE '%الى%'"));
    await db.execute(sql.raw("UPDATE `supportConversations` SET `customerContact` = REPLACE(REPLACE(`customerContact`, 'إلى', 'to'), 'الى', 'to') WHERE `customerContact` LIKE '%إلى%' OR `customerContact` LIKE '%الى%'"));
  })().catch((error) => {
    legacyEmailRepairPromise = null;
    console.warn("[Database] Failed to repair legacy email values:", error);
  });
  return legacyEmailRepairPromise;
}
let publicCatalogCache: { value: { stores: any[]; products: Product[]; categories: string[] }; expiresAt: number } | null = null;

async function addColumnIfMissing(db: ReturnType<typeof drizzle>, tableName: string, columnName: string, definition: string) {
  const result: any = await db.execute(sql.raw(`SHOW COLUMNS FROM \`${tableName}\` LIKE '${columnName}'`));
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (Array.isArray(rows) && rows.length > 0) return;
  try {
    await db.execute(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`));
  } catch (error) {
    const message = String(error);
    const cause = String((error as any)?.cause ?? "");
    if (!/duplicate column|column .* already exists|duplicate field|ER_DUP_FIELDNAME|1060/i.test(`${message} ${cause}`)) throw error;
  }
}

async function ensureProductWithdrawalSchema(db: ReturnType<typeof drizzle>) {
  if (productWithdrawalSchemaPromise) return productWithdrawalSchemaPromise;
  productWithdrawalSchemaPromise = (async () => {
    await db.execute(sql.raw("ALTER TABLE `products` MODIFY COLUMN `approvalStatus` enum('draft','pending_review','approved','rejected','withdrawn') NOT NULL DEFAULT 'approved'"));
    await addColumnIfMissing(db, "products", "withdrawnAt", "timestamp NULL");
    await addColumnIfMissing(db, "products", "withdrawnReason", "text NULL");
    await addColumnIfMissing(db, "products", "withdrawnByOpenId", "varchar(128) NULL");
  })().catch((error) => {
    productWithdrawalSchemaPromise = null;
    throw error;
  });
  return productWithdrawalSchemaPromise;
}

async function ensureStoreLocationSchema(db: ReturnType<typeof drizzle>) {
  if (storeLocationSchemaPromise) return storeLocationSchemaPromise;
  storeLocationSchemaPromise = (async () => {
    await addColumnIfMissing(db, "stores", "latitude", "double NULL");
    await addColumnIfMissing(db, "stores", "longitude", "double NULL");
  })().catch((error) => {
    storeLocationSchemaPromise = null;
    throw error;
  });
  return storeLocationSchemaPromise;
}

async function ensureStaffTypeSchema(db: ReturnType<typeof drizzle>) {
  if (staffTypeSchemaPromise) return staffTypeSchemaPromise;
  staffTypeSchemaPromise = (async () => {
    await addColumnIfMissing(db, "staffMembers", "staffType", "enum('support','courier','delivery_support') NOT NULL DEFAULT 'support'");
    await addColumnIfMissing(db, "staffInvitations", "staffType", "enum('support','courier','delivery_support') NOT NULL DEFAULT 'support'");
    await db.execute(sql.raw("ALTER TABLE `staffMembers` MODIFY COLUMN `staffType` enum('support','courier','delivery_support') NOT NULL DEFAULT 'support'"));
    await db.execute(sql.raw("ALTER TABLE `staffInvitations` MODIFY COLUMN `staffType` enum('support','courier','delivery_support') NOT NULL DEFAULT 'support'"));
  })().catch((error) => {
    staffTypeSchemaPromise = null;
    throw error;
  });
  return staffTypeSchemaPromise;
}

async function ensureCourierAssignmentSchema(db: ReturnType<typeof drizzle>) {
  if (courierAssignmentSchemaPromise) return courierAssignmentSchemaPromise;
  courierAssignmentSchemaPromise = (async () => {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`courierAssignments\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`orderId\` int NOT NULL,
      \`courierOpenId\` varchar(128) NOT NULL,
      \`assignedByOpenId\` varchar(128) NOT NULL,
      \`assignedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`courier_assignments_order_unique\` (\`orderId\`),
      KEY \`courier_assignments_courier_idx\` (\`courierOpenId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
  })().catch((error) => {
    courierAssignmentSchemaPromise = null;
    throw error;
  });
  return courierAssignmentSchemaPromise;
}

async function ensureDeliverySchema(db: ReturnType<typeof drizzle>) {
  if (deliverySchemaPromise) return deliverySchemaPromise;
  deliverySchemaPromise = (async () => {
    await db.execute(sql.raw("ALTER TABLE `orders` MODIFY COLUMN `status` enum('new','confirmed','ready','out_for_delivery','in_transit','delivered','cancelled') NOT NULL DEFAULT 'new'"));
    await addColumnIfMissing(db, "orders", "discountCents", "int NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "orders", "deliveredAt", "timestamp NULL");
    await addColumnIfMissing(db, "orders", "deliveryProofUrl", "varchar(1000) NULL");
    await addColumnIfMissing(db, "orders", "deliveryProofKey", "varchar(500) NULL");
    await ensureCourierAssignmentSchema(db);
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`courierLocations\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`courierOpenId\` varchar(128) NOT NULL,
      \`orderId\` int NULL,
      \`latitude\` double NOT NULL,
      \`longitude\` double NOT NULL,
      \`accuracyMeters\` double NULL,
      \`heading\` double NULL,
      \`speedKph\` double NULL,
      \`capturedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`courier_locations_courier_unique\` (\`courierOpenId\`),
      KEY \`courier_locations_order_idx\` (\`orderId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
  })().catch((error) => {
    deliverySchemaPromise = null;
    throw error;
  });
  return deliverySchemaPromise;
}

async function ensureOrderWorkflowSchema(db: ReturnType<typeof drizzle>) {
  if (orderWorkflowSchemaPromise) return orderWorkflowSchemaPromise;
  if (typeof (db as any).execute !== "function") return;
  orderWorkflowSchemaPromise = (async () => {
    await addColumnIfMissing(db, "orders", "statusReason", "text NULL");
    await addColumnIfMissing(db, "storeSettings", "automaticCourierAssignment", "int NOT NULL DEFAULT 0");
  })().catch((error) => {
    orderWorkflowSchemaPromise = null;
    throw error;
  });
  return orderWorkflowSchemaPromise;
}

async function ensureOperationArchiveSchema(db: ReturnType<typeof drizzle>) {
  if (operationArchiveSchemaPromise) return operationArchiveSchemaPromise;
  operationArchiveSchemaPromise = (async () => {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`operationArchives\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`scope\` varchar(20) NOT NULL,
      \`entity\` varchar(20) NOT NULL,
      \`requestedByOpenId\` varchar(128) NOT NULL,
      \`fromDate\` varchar(10) NOT NULL,
      \`toDate\` varchar(10) NOT NULL,
      \`rowCount\` int NOT NULL DEFAULT 0,
      \`fileKey\` varchar(500) NOT NULL,
      \`fileUrl\` varchar(1000) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`operation_archives_scope_idx\` (\`scope\`),
      KEY \`operation_archives_created_idx\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
  })().catch((error) => {
    operationArchiveSchemaPromise = null;
    throw error;
  });
  return operationArchiveSchemaPromise;
}

async function ensureCatalogSchema(db: ReturnType<typeof drizzle>) {
  await ensureProductWithdrawalSchema(db);
}

// Normal reads must not depend on optional map columns. Older Railway databases
// may not grant ALTER TABLE; location columns are added only when explicitly saved.
const storeReadColumns = {
  id: stores.id,
  ownerOpenId: stores.ownerOpenId,
  name: stores.name,
  handle: stores.handle,
  category: stores.category,
  neighborhood: stores.neighborhood,
  description: stores.description,
  latitude: sql<number | null>`NULL`.as("latitude"),
  longitude: sql<number | null>`NULL`.as("longitude"),
  verificationStatus: stores.verificationStatus,
  verifiedAt: stores.verifiedAt,
  verifiedByOpenId: stores.verifiedByOpenId,
  createdAt: stores.createdAt,
};

async function hydrateStoreLocation(db: ReturnType<typeof drizzle>, store: any) {
  if (!store) return store;
  const [settings] = await db.select({ address: storeSettings.address }).from(storeSettings).where(eq(storeSettings.storeId, store.id)).limit(1);
  const coordinates = extractCoordinatesFromAddress(settings?.address);
  return { ...store, latitude: store.latitude ?? coordinates?.latitude ?? null, longitude: store.longitude ?? coordinates?.longitude ?? null };
}

async function readStoreRows(db: ReturnType<typeof drizzle>) {
  // Keep public catalog reads independent from optional map columns. The old
  // try/fallback path paid for a failed SELECT on every request in production.
  const [rows, settingsRows] = await Promise.all([
    db.select(storeReadColumns).from(stores).orderBy(stores.id),
    db.select({ storeId: storeSettings.storeId, address: storeSettings.address }).from(storeSettings),
  ]);
  const addresses = new Map(settingsRows.map((settings) => [settings.storeId, settings.address]));
  return rows.map((store) => {
    const coordinates = extractCoordinatesFromAddress(addresses.get(store.id));
    return { ...store, latitude: store.latitude ?? coordinates?.latitude ?? null, longitude: store.longitude ?? coordinates?.longitude ?? null };
  });
}

async function readStoreForOwner(db: ReturnType<typeof drizzle>, ownerOpenId: string) {
  try {
    const [owned] = await db.select().from(stores).where(eq(stores.ownerOpenId, ownerOpenId)).limit(1);
    return owned ? hydrateStoreLocation(db, owned) : null;
  } catch (error) {
    console.warn("Store location columns are unavailable for owner read; using safe store projection:", error);
    const [owned] = await db.select(storeReadColumns).from(stores).where(eq(stores.ownerOpenId, ownerOpenId)).limit(1);
    return owned ? hydrateStoreLocation(db, owned) : null;
  }
}

const productReadColumns = {
  id: products.id,
  storeId: products.storeId,
  name: products.name,
  description: products.description,
  category: products.category,
  priceCents: products.priceCents,
  imageUrl: products.imageUrl,
  referenceCode: products.referenceCode,
  badge: products.badge,
  stock: products.stock,
  approvalStatus: products.approvalStatus,
  approvalNote: products.approvalNote,
  submittedAt: products.submittedAt,
  approvedAt: products.approvedAt,
  approvedByOpenId: products.approvedByOpenId,
  withdrawnAt: sql<Date | null>`NULL`.as("withdrawnAt"),
  withdrawnReason: sql<string | null>`NULL`.as("withdrawnReason"),
  withdrawnByOpenId: sql<string | null>`NULL`.as("withdrawnByOpenId"),
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      await repairLegacyEmailValues(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId || (user.email && normalizeEmail(user.email) === getAdminEmail())) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase().replace(/[إا]لى/g, "to");
}

export function validateStaffDisplayName(name: string) {
  const value = name.trim();
  return value.length >= 2 && value.length <= 32 && value.split(/\s+/).length <= 2;
}

export function normalizePhone(phone: string) {
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("962")) digits = digits.slice(3);
  if (digits.length > 9 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function normalizeMixedDisplayName(value: string) {
  // Keep the stored record unchanged while returning a readable display value
  // for legacy/test names that contain Arabic "إلى" between Latin fragments.
  return value.replace(/(?<=[A-Za-z])إلى(?=[A-Za-z])/g, "to");
}

export function emailOpenId(email: string) {
  // users.openId is varchar(64); email_ (6) + 58 hash chars keeps the ID within the DB limit.
  return `email_${createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 58)}`;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return result[0];
}

export async function createEmailUser(input: { email: string; name: string; role: "user" | "store" | "admin"; passwordHash: string; verificationTokenHash?: string; verificationExpiresAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const email = normalizeEmail(input.email);
  if (await getUserByEmail(email)) throw new Error("EMAIL_IN_USE");
  await db.insert(users).values({ openId: emailOpenId(email), email, name: input.name.trim(), role: input.role, passwordHash: input.passwordHash, loginMethod: "email", ...(input.verificationTokenHash && input.verificationExpiresAt ? { emailVerificationTokenHash: input.verificationTokenHash, emailVerificationExpiresAt: input.verificationExpiresAt } : {}) });
  return getUserByEmail(email);
}

export async function verifyEmailUser(email: string, tokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await getUserByEmail(email);
  if (!user || user.emailVerifiedAt || user.emailVerificationTokenHash !== tokenHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) return null;
  const verifiedAt = new Date();
  await db.update(users).set({ emailVerifiedAt: verifiedAt, emailVerificationTokenHash: null, emailVerificationExpiresAt: null }).where(eq(users.id, user.id));
  return { ...user, emailVerifiedAt: verifiedAt, emailVerificationTokenHash: null, emailVerificationExpiresAt: null };
}

export async function setEmailVerificationToken(email: string, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const user = await getUserByEmail(email);
  if (!user) return null;
  await db.update(users).set({ emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: expiresAt }).where(eq(users.id, user.id));
  return { ...user, emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: expiresAt };
}

export async function ensureAdminUser(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalized = normalizeEmail(email);
  const existing = await getUserByEmail(normalized);
  if (existing) {
    if (existing.role !== "admin") await db.update(users).set({ role: "admin", emailVerifiedAt: existing.emailVerifiedAt ?? new Date() }).where(eq(users.id, existing.id));
    return getUserByEmail(normalized);
  }
  await db.insert(users).values({ openId: emailOpenId(normalized), email: normalized, name: "مدير النظام", role: "admin", loginMethod: "email", emailVerifiedAt: new Date() });
  return getUserByEmail(normalized);
}


export function buildOrderCreatedEvent(input: { orderId: number; customerName: string; totalCents: number; orderNumber: string }) {
  return {
    orderId: input.orderId,
    actorRole: "customer" as const,
    eventType: "order_created" as const,
    title: "طلب جديد من العميل",
    description: `${input.customerName} أنشأ طلبًا جديدًا بقيمة ${(input.totalCents / 100).toFixed(2)} د.أ.`,
    metadata: JSON.stringify({ status: "new", orderNumber: input.orderNumber }),
  };
}

export function buildOrderCreatedNotifications(input: { orderId: number; orderNumber: string; totalCents: number; storeId?: number }) {
  return [
    { orderId: input.orderId, storeId: input.storeId, audience: "customer" as const, title: "تم استلام طلبك", body: `طلبك ${input.orderNumber} وصل إلى المتجر.` },
    { orderId: input.orderId, storeId: input.storeId, audience: "owner" as const, title: "طلب جديد", body: `وصل طلب جديد ${input.orderNumber}.` },
  ];
}

export function buildStatusChangedEvent(input: { orderId: number; orderNumber: string; from: OrderStatus; to: OrderStatus; actorRole: "store" | "admin"; label: string }) {
  return {
    orderId: input.orderId,
    actorRole: input.actorRole,
    eventType: "status_changed" as const,
    title: `تغيّرت الحالة إلى ${input.label}`,
    description: `${input.actorRole === "store" ? "المتجر" : "الأدمن"} حدّث حالة الطلب ${input.orderNumber}.`,
    metadata: JSON.stringify({ from: input.from, to: input.to }),
  };
}

export function buildStatusNotifications(input: { orderId: number; orderNumber: string; label: string; storeId?: number }) {
  return [
    { orderId: input.orderId, storeId: input.storeId, audience: "customer" as const, title: `تحديث على طلبك ${input.orderNumber}`, body: `حالة الطلب الآن: ${input.label}.` },
    { orderId: input.orderId, storeId: input.storeId, audience: "owner" as const, title: "تحديث على طلب", body: `${input.orderNumber}: ${input.label}.` },
    ...(input.storeId ? [{ orderId: input.orderId, storeId: input.storeId, audience: "store" as const, title: "تحديث حالة الطلب", body: `${input.orderNumber}: ${input.label}.` }] : []),
  ];
}

export function buildMessageEvent(input: { orderId: number; senderRole: "customer" | "store" | "admin"; senderName: string; body: string; isChangeRequest?: boolean }) {
  return {
    orderId: input.orderId,
    actorRole: input.senderRole,
    eventType: input.isChangeRequest ? "change_requested" as const : "message_sent" as const,
    title: input.isChangeRequest ? "طلب تعديل من العميل" : "رسالة جديدة",
    description: `${input.senderName}: ${input.body}`,
  };
}

export async function writeOrderCreatedSideEffects(db: any, input: { orderId: number; customerName: string; totalCents: number; orderNumber: string; storeId?: number }) {
  await db.insert(activityEvents).values(buildOrderCreatedEvent(input));
  try {
    await db.insert(notifications).values(buildOrderCreatedNotifications(input));
  } catch (error) {
    console.warn("Order notification write skipped:", error);
  }
}

export async function writeStatusSideEffects(db: any, input: { orderId: number; orderNumber: string; from: OrderStatus; to: OrderStatus; actorRole: "store" | "admin"; label: string; storeId?: number }) {
  await db.insert(activityEvents).values(buildStatusChangedEvent(input));
  if (["confirmed", "ready", "out_for_delivery", "delivered", "cancelled"].includes(input.to)) {
    await db.insert(notifications).values(buildStatusNotifications({ orderId: input.orderId, orderNumber: input.orderNumber, label: input.label, storeId: input.storeId }));
  }
}

export async function writeMessageSideEffects(db: any, input: { orderId: number; orderNumber: string; senderRole: "customer" | "store" | "admin"; senderName: string; body: string; isChangeRequest?: boolean; storeId?: number }) {
  await db.insert(activityEvents).values(buildMessageEvent(input));
  if (input.senderRole === "customer") {
    await db.insert(notifications).values({ orderId: input.orderId, storeId: input.storeId, audience: "owner", title: input.isChangeRequest ? "طلب تعديل جديد" : "رسالة من العميل", body: `${input.orderNumber}: ${input.body}` });
    if (input.storeId) await db.insert(notifications).values({ orderId: input.orderId, storeId: input.storeId, audience: "store", title: input.isChangeRequest ? "طلب تعديل من العميل" : "رسالة من العميل", body: `${input.orderNumber}: ${input.body}` });
  } else if (input.senderRole === "store") {
    await db.insert(notifications).values({ orderId: input.orderId, storeId: input.storeId, audience: "customer", title: "رسالة من المتجر", body: input.body });
  }
}

async function ensureSupportParticipant(db: ReturnType<typeof drizzle>, input: { conversationId: number; role: "customer" | "store" | "admin"; displayName: string; userOpenId?: string }) {
  const access = input.userOpenId
    ? and(eq(supportParticipants.conversationId, input.conversationId), eq(supportParticipants.role, input.role), eq(supportParticipants.userOpenId, input.userOpenId))
    : and(eq(supportParticipants.conversationId, input.conversationId), eq(supportParticipants.role, input.role), sql`${supportParticipants.userOpenId} IS NULL`);
  const existing = await db.select({ id: supportParticipants.id }).from(supportParticipants).where(access).limit(1);
  if (!existing[0]) await db.insert(supportParticipants).values({ conversationId: input.conversationId, role: input.role, displayName: input.displayName.trim(), userOpenId: input.userOpenId });
}


export function normalizeMediaUrl(url: string) {
  const value = url.trim();
  if (!value) return value;
  if (value.startsWith("/api/storage/") || value.startsWith("http://") || value.startsWith("https://")) return value;
  return `/api/storage/${encodeURIComponent(value.replace(/^\/+/, ""))}`;
}

function normalizeProductImage(product: Product) {
  return { ...product, imageUrl: normalizeMediaUrl(product.imageUrl) };
}

export async function listCatalog() {
  const now = Date.now();
  if (publicCatalogCache && publicCatalogCache.expiresAt > now) return publicCatalogCache.value;
  const db = await getDb();
  if (!db) return { stores: [], products: [], categories: [] };
  const storeRows = await readStoreRows(db);
  const productRows = await db.select(productReadColumns).from(products).where(and(eq(products.isActive, 1), eq(products.approvalStatus, "approved"))).orderBy(desc(products.createdAt));
  const publicProducts = productRows.map(normalizeProductImage);
  const categories = Array.from(new Set(publicProducts.map((product) => product.category)));
  const value = { stores: storeRows, products: publicProducts, categories };
  publicCatalogCache = { value, expiresAt: Date.now() + PUBLIC_CATALOG_CACHE_TTL_MS };
  return value;
}

export async function getPublicProduct(productId: number) {
  const db = await getDb();
  if (!db) return null;
  let row: any;
  try {
    [row] = await db.select({ product: productReadColumns, store: stores })
      .from(products)
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(and(eq(products.id, productId), eq(products.isActive, 1), eq(products.approvalStatus, "approved")))
      .limit(1);
  } catch (error) {
    console.warn("Store location columns are unavailable for product detail; using safe store projection:", error);
    [row] = await db.select({ product: productReadColumns, store: storeReadColumns })
      .from(products)
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(and(eq(products.id, productId), eq(products.isActive, 1), eq(products.approvalStatus, "approved")))
      .limit(1);
  }
  if (!row) return null;
  row.store = await hydrateStoreLocation(db, row.store);
  const [media, reviews, reviewSummary] = await Promise.all([
    db.select().from(productMedia).where(eq(productMedia.productId, productId)).orderBy(productMedia.sortOrder, productMedia.id),
    db.select().from(productReviews).where(and(eq(productReviews.productId, productId), eq(productReviews.status, "published"))).orderBy(desc(productReviews.createdAt)).limit(24),
    db.select({ count: sql<number>`count(*)`, average: sql<number>`coalesce(avg(${productReviews.rating}), 0)` }).from(productReviews).where(and(eq(productReviews.productId, productId), eq(productReviews.status, "published"))),
  ]);
  return { product: normalizeProductImage(row.product), store: row.store, media: media.map((item) => ({ ...item, url: normalizeMediaUrl(item.url) })), reviews, reviewSummary: { count: Number(reviewSummary[0]?.count ?? 0), average: Number(reviewSummary[0]?.average ?? 0) } };
}

export async function listOrders(status?: OrderStatus, ownerOpenId?: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureDeliverySchema(db);
  const filters = [
    ...(status ? [eq(orders.status, status)] : []),
    ...(ownerOpenId ? [eq(stores.ownerOpenId, ownerOpenId)] : []),
  ];
  return db.select({ order: orders, store: stores, assignment: courierAssignments })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .leftJoin(courierAssignments, eq(orders.id, courierAssignments.orderId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt));
}

export async function getStoreAnalytics(ownerOpenId: string, requestedDays = 30) {
  const db = await getDb();
  if (!db) return null;
  await ensureProductWithdrawalSchema(db);
  await ensureStaffTypeSchema(db);
  await ensureDeliverySchema(db);
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) return null;

  const rangeDays = Math.min(Math.max(Math.floor(requestedDays), 7), 90);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (rangeDays - 1));
  const [orderRows, itemRows, productCountRows, courierRows] = await Promise.all([
    db.select({ order: orders }).from(orders).where(and(eq(orders.storeId, owned.id), gte(orders.createdAt, start))).orderBy(desc(orders.createdAt)),
    db.select({ item: orderItems }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(and(eq(orders.storeId, owned.id), gte(orders.createdAt, start))),
    db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.storeId, owned.id), eq(products.approvalStatus, "approved"), eq(products.isActive, 1))),
    db.select({ assignment: courierAssignments, order: orders, staff: staffMembers, user: users })
      .from(courierAssignments)
      .innerJoin(orders, eq(courierAssignments.orderId, orders.id))
      .innerJoin(staffMembers, eq(courierAssignments.courierOpenId, staffMembers.userOpenId))
      .leftJoin(users, eq(staffMembers.userOpenId, users.openId))
      .where(and(eq(orders.storeId, owned.id), eq(staffMembers.staffType, "courier"), gte(orders.createdAt, start))),
  ]);

  const orderRowsOnly = orderRows.map(({ order }) => order);
  const nonCancelled = orderRowsOnly.filter((order) => order.status !== "cancelled");
  const delivered = nonCancelled.filter((order) => order.status === "delivered");
  const salesCents = nonCancelled.reduce((sum, order) => sum + order.totalCents, 0);
  const dailyMap = new Map<string, { date: string; revenueCents: number; orders: number; units: number }>();
  for (let index = 0; index < rangeDays; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, revenueCents: 0, orders: 0, units: 0 });
  }
  for (const order of nonCancelled) {
    const day = dailyMap.get(order.createdAt.toISOString().slice(0, 10));
    if (day) {
      day.revenueCents += order.totalCents;
      day.orders += 1;
    }
  }

  const validOrderIds = new Set(nonCancelled.map((order) => order.id));
  const productMap = new Map<number, { productId: number; name: string; units: number; revenueCents: number }>();
  for (const { item } of itemRows) {
    if (!validOrderIds.has(item.orderId)) continue;
    const current = productMap.get(item.productId) ?? { productId: item.productId, name: item.productName, units: 0, revenueCents: 0 };
    current.units += item.quantity;
    current.revenueCents += item.quantity * item.unitPriceCents;
    productMap.set(item.productId, current);
    const day = orderRowsOnly.find((order) => order.id === item.orderId)?.createdAt.toISOString().slice(0, 10);
    if (day) dailyMap.get(day)!.units += item.quantity;
  }

  const statusOrder: OrderStatus[] = ["new", "confirmed", "ready", "out_for_delivery", "in_transit", "delivered", "cancelled"];
  const statusBreakdown = statusOrder.map((status) => ({ status, count: orderRowsOnly.filter((order) => order.status === status).length }));
  const courierMap = new Map<string, { courierOpenId: string; name: string; assignedOrders: number; completedOrders: number; totalMinutes: number; lastDeliveryAt: Date | null }>();
  for (const { assignment, order, staff, user } of courierRows) {
    const current = courierMap.get(assignment.courierOpenId) ?? { courierOpenId: assignment.courierOpenId, name: staff.displayName || user?.name || "مندوب", assignedOrders: 0, completedOrders: 0, totalMinutes: 0, lastDeliveryAt: null };
    if (order.status !== "cancelled") current.assignedOrders += 1;
    if (order.status === "delivered" && order.deliveredAt) {
      current.completedOrders += 1;
      current.totalMinutes += Math.max(0, Math.round((order.deliveredAt.getTime() - assignment.assignedAt.getTime()) / 60000));
      if (!current.lastDeliveryAt || order.deliveredAt > current.lastDeliveryAt) current.lastDeliveryAt = order.deliveredAt;
    }
    courierMap.set(assignment.courierOpenId, current);
  }

  return {
    store: owned,
    rangeDays,
    generatedAt: new Date(),
    productCount: Number(productCountRows[0]?.count ?? 0),
    summary: {
      totalOrders: orderRowsOnly.length,
      completedOrders: nonCancelled.length,
      deliveredOrders: delivered.length,
      cancelledOrders: orderRowsOnly.filter((order) => order.status === "cancelled").length,
      salesCents,
      unitsSold: Array.from(productMap.values()).reduce((sum, item) => sum + item.units, 0),
      averageOrderValueCents: nonCancelled.length ? Math.round(salesCents / nonCancelled.length) : 0,
      deliveryRate: nonCancelled.length ? Math.round((delivered.length / nonCancelled.length) * 100) : 0,
    },
    daily: Array.from(dailyMap.values()),
    topProducts: Array.from(productMap.values()).sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents),
    statusBreakdown,
    couriers: Array.from(courierMap.values()).map((item) => ({ ...item, averageDeliveryMinutes: item.completedOrders ? Math.round(item.totalMinutes / item.completedOrders) : 0 })),
  };
}

export async function listOrdersForCustomer(customerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureDeliverySchema(db);
  const rows = await db.select({ order: orders, store: stores })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .where(eq(orders.customerOpenId, customerOpenId))
    .orderBy(desc(orders.createdAt));
  return Promise.all(rows.map(async (row) => {
    const items = await db.select({ item: orderItems, productImageUrl: products.imageUrl }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, row.order.id)).orderBy(orderItems.id);
    return { ...row, items: items.map(({ item, productImageUrl }) => ({ ...item, productImageUrl })) };
  }));
}

export async function listCourierOrders(courierOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureDeliverySchema(db);
  const rows = await db.select({ order: orders, store: stores, assignment: courierAssignments })
    .from(courierAssignments)
    .innerJoin(orders, eq(courierAssignments.orderId, orders.id))
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .where(eq(courierAssignments.courierOpenId, courierOpenId))
    .orderBy(desc(orders.updatedAt));
  const [latestLocation] = await db.select().from(courierLocations).where(eq(courierLocations.courierOpenId, courierOpenId)).orderBy(desc(courierLocations.capturedAt)).limit(1);
  const courierPosition = latestLocation ? { latitude: latestLocation.latitude, longitude: latestLocation.longitude } : null;
  return Promise.all(rows.map(async (row) => {
    const itemRows = await db.select({ item: orderItems, productImageUrl: products.imageUrl }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, row.order.id)).orderBy(orderItems.id);
    const destination = extractCoordinatesFromAddress(row.order.customerAddress);
    const distanceKm = courierPosition && destination ? Number(distanceInKm(courierPosition, destination).toFixed(2)) : null;
    return { ...row, items: itemRows.map(({ item, productImageUrl }) => ({ ...item, productImageUrl })), deliveryEstimate: distanceKm == null ? null : { distanceKm, etaMinutes: estimateDeliveryMinutes(distanceKm) } };
  }));
}

export async function listCourierOrderPool() {
  const db = await getDb();
  if (!db) return [];
  await ensureDeliverySchema(db);
  const rows = await db.select({ order: orders, store: stores, assignment: courierAssignments })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .leftJoin(courierAssignments, eq(orders.id, courierAssignments.orderId))
    .orderBy(desc(orders.updatedAt));
  return rows.filter(({ order }) => ["confirmed", "ready", "out_for_delivery", "in_transit"].includes(order.status));
}

export async function listCourierMembers() {
  return (await listStaffMembers()).filter((member) => member.staff.staffType === "courier" && member.staff.status === "active");
}

async function autoAssignCourierIfEnabled(db: any, orderId: number, storeId: number, orderNumber: string) {
  if (typeof db?.select !== "function") return null;
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
  if (!settings?.automaticCourierAssignment) return null;
  const couriers = await db.select().from(staffMembers).where(and(eq(staffMembers.staffType, "courier"), eq(staffMembers.status, "active"), eq(staffMembers.availability, "available")));
  if (!couriers.length) return null;
  const assignments = await db.select({ assignment: courierAssignments, order: orders }).from(courierAssignments).innerJoin(orders, eq(courierAssignments.orderId, orders.id));
  const activeStatuses: OrderStatus[] = ["confirmed", "ready", "out_for_delivery", "in_transit"];
  const [newOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const destination = newOrder ? extractCoordinatesFromAddress(newOrder.customerAddress) : null;
  const load = new Map<string, number>();
  for (const courier of couriers) load.set(courier.userOpenId, assignments.filter(({ assignment, order }: any) => assignment.courierOpenId === courier.userOpenId && activeStatuses.includes(order.status)).length);
  const selected = couriers.sort((a: any, b: any) => (load.get(a.userOpenId) ?? 0) - (load.get(b.userOpenId) ?? 0)).find((courier: any) => {
    const courierLoad = load.get(courier.userOpenId) ?? 0;
    if (courierLoad >= 2) return false;
    if (courierLoad === 0) return true;
    const existing = assignments.find(({ assignment, order }: any) => assignment.courierOpenId === courier.userOpenId && activeStatuses.includes(order.status));
    const existingDestination = existing ? extractCoordinatesFromAddress(existing.order.customerAddress) : null;
    return Boolean(destination && existingDestination && distanceInKm(destination, existingDestination) <= 5);
  });
  if (!selected) return null;
  const now = new Date();
  await db.insert(courierAssignments).values({ orderId, courierOpenId: selected.userOpenId, assignedByOpenId: "system", assignedAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { courierOpenId: selected.userOpenId, assignedByOpenId: "system", assignedAt: now, updatedAt: now } });
  await db.insert(activityEvents).values({ orderId, actorRole: "system", eventType: "system_note", title: "تم التعيين التلقائي للمندوب", description: `تم إسناد الطلب ${orderNumber} تلقائيًا إلى مندوب متاح.`, metadata: JSON.stringify({ courierOpenId: selected.userOpenId, automatic: true }) });
  return selected.userOpenId;
}

export async function assignCourierOrder(orderId: number, courierOpenId: string, assignedByOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("الطلب غير موجود.");
  if (!["confirmed", "ready", "out_for_delivery"].includes(order.status)) throw new Error("لا يمكن إسناد هذا الطلب في حالته الحالية.");
  const [courier] = await db.select().from(staffMembers).where(and(eq(staffMembers.userOpenId, courierOpenId), eq(staffMembers.staffType, "courier"), eq(staffMembers.status, "active"))).limit(1);
  if (!courier) throw new Error("المندوب المختار غير نشط أو لا يملك نوع حساب مندوب.");
  const activeStatuses: OrderStatus[] = ["confirmed", "ready", "out_for_delivery", "in_transit"];
  const currentAssignments = await db.select({ assignment: courierAssignments, order: orders }).from(courierAssignments).innerJoin(orders, eq(courierAssignments.orderId, orders.id)).where(eq(courierAssignments.courierOpenId, courierOpenId));
  const otherActive = currentAssignments.filter(({ assignment, order }: any) => assignment.orderId !== orderId && activeStatuses.includes(order.status));
  if (otherActive.length >= 2) throw new Error("لا يمكن إسناد أكثر من طلبين نشطين إلى المندوب نفسه.");
  if (otherActive.length === 1) {
    const candidatePosition = extractCoordinatesFromAddress(order.customerAddress);
    const existingPosition = extractCoordinatesFromAddress(otherActive[0].order.customerAddress);
    if (!candidatePosition || !existingPosition || distanceInKm(candidatePosition, existingPosition) > 5) throw new Error("لا يمكن أخذ طلب ثانٍ إلا إذا كان على مسار قريب من الطلب الحالي.");
  }
  const now = new Date();
  await db.insert(courierAssignments).values({ orderId, courierOpenId, assignedByOpenId, assignedAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { courierOpenId, assignedByOpenId, assignedAt: now, updatedAt: now } });
  await db.insert(activityEvents).values({ orderId, actorRole: "admin", eventType: "system_note", title: "تم إسناد الطلب لمندوب", description: `أُسند الطلب ${order.orderNumber} إلى مندوب توصيل.`, metadata: JSON.stringify({ courierOpenId }) });
  return { orderId, courierOpenId };
}

export async function unassignCourierOrder(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  await db.delete(courierAssignments).where(eq(courierAssignments.orderId, orderId));
  return { orderId };
}

export async function assignCourierOrderFromStore(orderId: number, courierOpenId: string, assignedByOpenId: string, ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  const [ownedOrder] = await db.select({ id: orders.id }).from(orders).innerJoin(stores, eq(orders.storeId, stores.id)).where(and(eq(orders.id, orderId), eq(stores.ownerOpenId, ownerOpenId))).limit(1);
  if (!ownedOrder) throw new Error("هذا الطلب غير متاح لهذا المتجر.");
  return assignCourierOrder(orderId, courierOpenId, assignedByOpenId);
}

export async function getDeliveryTracking(orderNumber: string, viewer: { role: "customer" | "store" | "admin" | "staff"; openId: string }) {
  const order = await getOrderByNumber(orderNumber, viewer);
  if (!order) return null;
  return { order: order.order, store: order.store, assignment: order.assignment, liveLocation: order.liveLocation, events: order.events };
}

export async function updateCourierLocation(courierOpenId: string, input: { orderNumber: string; latitude: number; longitude: number; accuracyMeters?: number; heading?: number; speedKph?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  const order = await getOrderByNumber(input.orderNumber, { role: "staff", openId: courierOpenId });
  if (!order || !["out_for_delivery", "in_transit"].includes(order.order.status)) throw new Error("لا يمكن مشاركة الموقع قبل بدء التوصيل.");
  const [assignment] = await db.select({ id: courierAssignments.id }).from(courierAssignments).where(and(eq(courierAssignments.orderId, order.order.id), eq(courierAssignments.courierOpenId, courierOpenId))).limit(1);
  if (!assignment) throw new Error("هذا الطلب غير مسند إلى حسابك.");
  const now = new Date();
  await db.insert(courierLocations).values({ courierOpenId, orderId: order.order.id, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters ?? null, heading: input.heading ?? null, speedKph: input.speedKph ?? null, capturedAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { orderId: order.order.id, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters ?? null, heading: input.heading ?? null, speedKph: input.speedKph ?? null, capturedAt: now, updatedAt: now } });
  return { latitude: input.latitude, longitude: input.longitude, capturedAt: now };
}

export async function stopCourierLocation(courierOpenId: string) {
  const db = await getDb();
  if (!db) return;
  await ensureDeliverySchema(db);
  await db.update(courierLocations).set({ orderId: null }).where(eq(courierLocations.courierOpenId, courierOpenId));
}

export async function uploadDeliveryProof(courierOpenId: string, input: { orderNumber: string; fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp"; data: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  const order = await getOrderByNumber(input.orderNumber, { role: "staff", openId: courierOpenId });
  if (!order || !["out_for_delivery", "in_transit"].includes(order.order.status)) throw new Error("ارفع إثبات التسليم بعد بدء التوصيل فقط.");
  const [assignment] = await db.select({ id: courierAssignments.id }).from(courierAssignments).where(and(eq(courierAssignments.orderId, order.order.id), eq(courierAssignments.courierOpenId, courierOpenId))).limit(1);
  if (!assignment) throw new Error("هذا الطلب غير مسند إلى حسابك.");
  const encoded = input.data.replace(/^data:[^;]+;base64,/, "");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("حجم صورة الإثبات يجب أن يكون بين 1 بايت و8 ميغابايت.");
  const extension = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
  const stored = await storagePut(`hassa/delivery-proofs/${courierOpenId}/${order.order.orderNumber}-${randomUUID()}.${extension}`, bytes, input.contentType);
  await db.update(orders).set({ deliveryProofUrl: stored.url, deliveryProofKey: stored.key }).where(eq(orders.id, order.order.id));
  await db.insert(activityEvents).values({ orderId: order.order.id, actorRole: "system", eventType: "system_note", title: "تم رفع إثبات التسليم", description: `رفع المندوب صورة إثبات للطلب ${order.order.orderNumber}.`, metadata: JSON.stringify({ deliveryProofUrl: stored.url }) });
  return { url: stored.url, key: stored.key };
}

export async function updateCourierOrderStatus(orderNumber: string, nextStatus: "in_transit" | "delivered", courierOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureDeliverySchema(db);
  const current = await getOrderByNumber(orderNumber, { role: "staff", openId: courierOpenId });
  if (!current) return null;
  const [assignment] = await db.select({ id: courierAssignments.id }).from(courierAssignments).where(and(eq(courierAssignments.orderId, current.order.id), eq(courierAssignments.courierOpenId, courierOpenId))).limit(1);
  if (!assignment) throw new Error("هذا الطلب غير مسند إلى حسابك.");
  if (!canAdvanceOrderStatus(current.order.status, nextStatus)) throw new Error(`لا يمكن الانتقال من ${orderStatusLabels[current.order.status]} إلى ${orderStatusLabels[nextStatus]}.`);
  if (nextStatus === "delivered" && !current.order.deliveryProofUrl) throw new Error("ارفع صورة إثبات التسليم قبل تأكيد أن الطلب تم توصيله.");
  const deliveredAt = nextStatus === "delivered" ? new Date() : null;
  await db.update(orders).set({ status: nextStatus, ...(deliveredAt ? { deliveredAt } : {}) }).where(eq(orders.id, current.order.id));
  await db.insert(activityEvents).values({ orderId: current.order.id, actorRole: "system", eventType: "status_changed", title: `تغيّرت الحالة إلى ${orderStatusLabels[nextStatus]}`, description: `حدّث المندوب حالة الطلب ${current.order.orderNumber}.`, metadata: JSON.stringify({ from: current.order.status, to: nextStatus, courierOpenId }) });
  await db.insert(notifications).values(buildStatusNotifications({ orderId: current.order.id, orderNumber: current.order.orderNumber, label: orderStatusLabels[nextStatus] }));
  if (nextStatus === "delivered") await stopCourierLocation(courierOpenId);
  return getOrderByNumber(orderNumber, { role: "staff", openId: courierOpenId });
}

type CourierPerformanceRange = {
  filter?: "today" | "yesterday" | "custom";
  fromDate?: string;
  toDate?: string;
};

function startOfLocalDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateFromKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

function resolveCourierPerformanceRange(range: CourierPerformanceRange | number | undefined) {
  const today = startOfLocalDay(new Date());
  if (typeof range === "number") {
    const start = new Date(today);
    start.setDate(start.getDate() - Math.max(1, range - 1));
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (range?.filter === "yesterday") {
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (range?.filter === "custom") {
    const start = dateFromKey(range.fromDate);
    const endDate = dateFromKey(range.toDate);
    if (start && endDate && endDate >= start) {
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
  }
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return { start: today, end };
}

export async function getCourierPerformance(range: CourierPerformanceRange | number | undefined = { filter: "today" }) {
  const db = await getDb();
  if (!db) return [];
  await ensureDeliverySchema(db);
  const { start, end } = resolveCourierPerformanceRange(range);
  const rows = await db.select({ order: orders, assignment: courierAssignments, staff: staffMembers, user: users }).from(orders).innerJoin(courierAssignments, eq(orders.id, courierAssignments.orderId)).innerJoin(staffMembers, eq(courierAssignments.courierOpenId, staffMembers.userOpenId)).leftJoin(users, eq(staffMembers.userOpenId, users.openId)).where(and(eq(orders.status, "delivered"), isNotNull(orders.deliveredAt), gte(orders.deliveredAt, start), lt(orders.deliveredAt, end))).orderBy(desc(orders.deliveredAt));
  const activeCouriers = await db.select({ staff: staffMembers, user: users }).from(staffMembers).leftJoin(users, eq(staffMembers.userOpenId, users.openId)).where(and(eq(staffMembers.staffType, "courier"), eq(staffMembers.status, "active")));
  const grouped = new Map<string, { courierOpenId: string; name: string; completedOrders: number; totalMinutes: number; lastDeliveryAt: Date | null }>();
  activeCouriers.forEach(({ staff, user }) => grouped.set(staff.userOpenId, { courierOpenId: staff.userOpenId, name: staff.displayName || user?.name || "مندوب", completedOrders: 0, totalMinutes: 0, lastDeliveryAt: null }));
  rows.forEach(({ order, assignment, staff, user }) => {
    const item = grouped.get(assignment.courierOpenId) ?? { courierOpenId: assignment.courierOpenId, name: staff.displayName || user?.name || "مندوب", completedOrders: 0, totalMinutes: 0, lastDeliveryAt: null };
    item.completedOrders += 1;
    item.totalMinutes += Math.max(0, Math.round(((order.deliveredAt?.getTime() ?? 0) - assignment.assignedAt.getTime()) / 60000));
    if (!item.lastDeliveryAt || (order.deliveredAt && order.deliveredAt > item.lastDeliveryAt)) item.lastDeliveryAt = order.deliveredAt;
    grouped.set(assignment.courierOpenId, item);
  });
  return Array.from(grouped.values()).map((item) => ({ ...item, averageDeliveryMinutes: item.completedOrders ? Math.round(item.totalMinutes / item.completedOrders) : 0 }));
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  new: "تم إنشاء الطلب",
  confirmed: "تم التأكيد",
  ready: "تم التجهيز",
  out_for_delivery: "مع المندوب",
  in_transit: "جاري التوصيل",
  delivered: "تم التوصيل",
  cancelled: "ملغى",
};

const orderStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canAdvanceOrderStatus(from: OrderStatus, to: OrderStatus) {
  return orderStatusTransitions[from]?.includes(to) ?? false;
}

export async function getOrderByNumber(orderNumber: string, viewer?: { role: "customer" | "store" | "admin" | "staff"; openId: string }) {
  const db = await getDb();
  if (!db) return null;
  await ensureDeliverySchema(db);
  await ensureOrderWorkflowSchema(db);
  const filters = [eq(orders.orderNumber, orderNumber)];
  if (viewer?.role === "customer") filters.push(eq(orders.customerOpenId, viewer.openId));
  if (viewer?.role === "store") filters.push(eq(stores.ownerOpenId, viewer.openId));
  const [row] = await db.select({ order: orders, store: stores })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .where(and(...filters))
    .limit(1);
  if (!row) return null;
  if (viewer?.role === "staff") {
    const [staffAssignment] = await db.select({ id: courierAssignments.id }).from(courierAssignments).where(and(eq(courierAssignments.orderId, row.order.id), eq(courierAssignments.courierOpenId, viewer.openId))).limit(1);
    if (!staffAssignment) return null;
  }
  const [itemRows, messages, events, assignmentRows, locationRows] = await Promise.all([
    db.select({ item: orderItems, productImageUrl: products.imageUrl }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, row.order.id)).orderBy(orderItems.id),
    db.select().from(orderMessages).where(eq(orderMessages.orderId, row.order.id)).orderBy(orderMessages.createdAt),
    db.select().from(activityEvents).where(eq(activityEvents.orderId, row.order.id)).orderBy(activityEvents.createdAt),
    db.select().from(courierAssignments).where(eq(courierAssignments.orderId, row.order.id)).limit(1),
    db.select().from(courierLocations).where(eq(courierLocations.orderId, row.order.id)).limit(1),
  ]);
  let orderNotifications: any[] = [];
  try {
    orderNotifications = await db.select().from(notifications).where(eq(notifications.orderId, row.order.id)).orderBy(desc(notifications.createdAt));
  } catch (error) {
    console.warn("Order notification read skipped:", error);
  }
  const items = itemRows.map(({ item, productImageUrl }) => ({ ...item, productImageUrl }));
  const assignment = assignmentRows[0] ?? null;
  const location = ["out_for_delivery", "in_transit"].includes(row.order.status) ? locationRows[0] ?? null : null;
  const destination = extractCoordinatesFromAddress(row.order.customerAddress);
  const deliveryEstimate = location && destination ? { distanceKm: Number(distanceInKm({ latitude: location.latitude, longitude: location.longitude }, destination).toFixed(2)), etaMinutes: estimateDeliveryMinutes(distanceInKm({ latitude: location.latitude, longitude: location.longitude }, destination)) } : null;
  const publicAssignment = assignment ? { assignedAt: assignment.assignedAt, updatedAt: assignment.updatedAt } : null;
  return { ...row, items, messages, events, notifications: orderNotifications, assignment: viewer?.role === "customer" ? publicAssignment : assignment, liveLocation: location, deliveryEstimate };
}

export type OrderFlowTestOptions = {
  db?: any;
  productRows?: Product[];
  currentOrder?: Awaited<ReturnType<typeof getOrderByNumber>>;
  resolveOrder?: (orderNumber: string) => Promise<Awaited<ReturnType<typeof getOrderByNumber>>>;
};

export async function createOrder(input: {
  storeId: number;
  customerOpenId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote?: string;
  items: { productId: number; quantity: number }[];
}, options: OrderFlowTestOptions = {}) {
  const db = options.db ?? await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureOrderWorkflowSchema(db);
  const productIds = input.items.map((item) => item.productId);
  const productRows = options.productRows ?? await db.select().from(products).where(and(eq(products.storeId, input.storeId), inArray(products.id, productIds), eq(products.isActive, 1), eq(products.approvalStatus, "approved")));
  if (productRows.length !== productIds.length) throw new Error("One or more products are no longer available");
  const itemRows = input.items.map((item) => {
    const product = productRows.find((row: Product) => row.id === item.productId)!;
    const quantity = Math.max(1, Math.min(20, Math.floor(item.quantity)));
    return { product, quantity, lineTotal: product.priceCents * quantity };
  });
  const unavailableItem = itemRows.find(({ product, quantity }) => product.stock < quantity);
  const status: OrderStatus = unavailableItem ? "cancelled" : "confirmed";
  const statusReason = unavailableItem ? `نفاد المخزون: ${unavailableItem.product.name}` : null;
  const totalCents = itemRows.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderNumber = `HS-${Math.floor(1000 + Math.random() * 8999)}`;
  const createdResult = await db.insert(orders).values({
    orderNumber,
    storeId: input.storeId,
    customerOpenId: input.customerOpenId ?? null,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerAddress: input.customerAddress.trim(),
    customerNote: input.customerNote?.trim() || null,
    status,
    statusReason,
    totalCents,
  });
  const createdOrderId = Number(createdResult[0].insertId);
  await db.insert(orderItems).values(itemRows.map(({ product, quantity }) => ({
    orderId: createdOrderId,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPriceCents: product.priceCents,
  })));
  if (!unavailableItem) {
    for (const { product, quantity } of itemRows) {
      await db.update(products).set({ stock: sql`${products.stock} - ${quantity}` }).where(and(eq(products.id, product.id), gte(products.stock, quantity)));
    }
  }
  if (status === "confirmed") await autoAssignCourierIfEnabled(db, createdOrderId, input.storeId, orderNumber);
  await writeOrderCreatedSideEffects(db, { orderId: createdOrderId, storeId: input.storeId, customerName: input.customerName.trim(), totalCents, orderNumber });
  if (status === "cancelled") {
    await db.insert(activityEvents).values({ orderId: createdOrderId, actorRole: "system", eventType: "status_changed", title: "تم رفض الطلب تلقائيًا", description: statusReason || "تعذر تنفيذ الطلب بسبب المخزون.", metadata: JSON.stringify({ reason: statusReason, automatic: true }) });
  }
  return options.resolveOrder ? options.resolveOrder(orderNumber) : getOrderByNumber(orderNumber);
}

export async function updateOrderStatus(orderNumber: string, nextStatus: OrderStatus, actorRole: "store" | "admin", options: OrderFlowTestOptions = {}) {
  const db = options.db ?? await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureOrderWorkflowSchema(db);
  const current = options.currentOrder ?? await getOrderByNumber(orderNumber);
  if (!current) return null;
  if (current.order.status === nextStatus) return current;
  if (!canAdvanceOrderStatus(current.order.status, nextStatus)) throw new Error(`لا يمكن الانتقال من ${orderStatusLabels[current.order.status]} إلى ${orderStatusLabels[nextStatus]}.`);
  if (nextStatus === "out_for_delivery") {
    await ensureDeliverySchema(db);
    const [assignment] = await db.select({ id: courierAssignments.id }).from(courierAssignments).where(eq(courierAssignments.orderId, current.order.id)).limit(1);
    if (!assignment) throw new Error("يجب إسناد الطلب إلى مندوب قبل بدء التوصيل.");
  }
  await db.update(orders).set({ status: nextStatus }).where(eq(orders.orderNumber, orderNumber));
  await writeStatusSideEffects(db, { orderId: current.order.id, storeId: current.order.storeId, orderNumber, from: current.order.status, to: nextStatus, actorRole, label: orderStatusLabels[nextStatus] });
  return options.resolveOrder ? options.resolveOrder(orderNumber) : getOrderByNumber(orderNumber);
}

export async function updateCustomerDetails(orderNumber: string, input: { customerName: string; customerPhone: string; customerAddress: string; customerNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await getOrderByNumber(orderNumber);
  if (!current) return null;
  await db.update(orders).set({
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerAddress: input.customerAddress.trim(),
    customerNote: input.customerNote?.trim() || null,
  }).where(eq(orders.orderNumber, orderNumber));
  await db.insert(activityEvents).values({
    orderId: current.order.id,
    actorRole: "customer",
    eventType: "customer_updated",
    title: "العميل حدّث تفاصيل الطلب",
    description: `${input.customerName.trim()} حدّث بيانات التواصل أو التوصيل.`,
  });
  return getOrderByNumber(orderNumber);
}

export async function addOrderMessage(orderNumber: string, input: { senderRole: "customer" | "store" | "admin"; senderName: string; body: string; isChangeRequest?: boolean }, options: OrderFlowTestOptions = {}) {
  const db = options.db ?? await getDb();
  if (!db) throw new Error("Database is not available");
  const current = options.currentOrder ?? await getOrderByNumber(orderNumber);
  if (!current) return null;
  await db.insert(orderMessages).values({ orderId: current.order.id, senderRole: input.senderRole, senderName: input.senderName.trim(), body: input.body.trim() });
  await writeMessageSideEffects(db, { orderId: current.order.id, storeId: current.order.storeId, orderNumber: current.order.orderNumber, senderRole: input.senderRole, senderName: input.senderName.trim(), body: input.body.trim(), isChangeRequest: input.isChangeRequest });
  return options.resolveOrder ? options.resolveOrder(orderNumber) : getOrderByNumber(orderNumber);
}

type DeliverySupportViewer = { role: "customer" | "staff" | "admin" | "delivery_support"; openId: string };
type DeliverySupportSender = "customer" | "courier" | "admin" | "delivery_support";

function normalizeDeliverySupportMessage(message: any) {
  return { ...message, senderRole: message.senderRole === "system" ? "courier" as const : message.senderRole, body: message.body.replace(new RegExp(`^${DELIVERY_SUPPORT_PREFIX}\\s*`), "").trim() };
}

export async function getDeliverySupportThread(orderNumber: string, viewer: DeliverySupportViewer) {
  const scopedViewer: { role: "store" | "admin" | "staff" | "customer"; openId: string } = viewer.role === "delivery_support" ? { role: "admin", openId: viewer.openId } : { role: viewer.role as "store" | "admin" | "staff" | "customer", openId: viewer.openId };
  const order = await getOrderByNumber(orderNumber, scopedViewer);
  if (!order) return null;
  const messages = order.messages.filter((message) => isDeliverySupportMessage(message.body)).map(normalizeDeliverySupportMessage);
  return { order: order.order, store: order.store, assignment: order.assignment, messages };
}

export async function listDeliverySupportThreads(viewer: DeliverySupportViewer) {
  const db = await getDb();
  if (!db) return [];
  const where = viewer.role === "staff" ? eq(courierAssignments.courierOpenId, viewer.openId) : undefined;
  const rows = await db.select({ order: orders, assignment: courierAssignments, staff: staffMembers, user: users, store: stores })
    .from(courierAssignments)
    .innerJoin(orders, eq(courierAssignments.orderId, orders.id))
    .innerJoin(staffMembers, eq(courierAssignments.courierOpenId, staffMembers.userOpenId))
    .leftJoin(users, eq(staffMembers.userOpenId, users.openId))
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .where(where)
    .orderBy(desc(orders.updatedAt));
  const threads = await Promise.all(rows.map(async (row) => {
    const messages = await db.select().from(orderMessages).where(and(eq(orderMessages.orderId, row.order.id), like(orderMessages.body, `${DELIVERY_SUPPORT_PREFIX}%`))).orderBy(orderMessages.createdAt);
    return { order: row.order, store: row.store, assignment: row.assignment, courier: { openId: row.assignment.courierOpenId, name: row.staff.displayName || row.user?.name || "مندوب التوصيل" }, messages: messages.map(normalizeDeliverySupportMessage) };
  }));
  return threads.filter((thread) => thread.messages.length > 0);
}

async function getDeliveryOrderForViewer(orderNumber: string, viewer: DeliverySupportViewer) {
  const scopedViewer: { role: "store" | "admin" | "staff" | "customer"; openId: string } = viewer.role === "delivery_support" ? { role: "admin", openId: viewer.openId } : { role: viewer.role as "store" | "admin" | "staff" | "customer", openId: viewer.openId };
  const order = await getOrderByNumber(orderNumber, scopedViewer);
  if (!order || !order.assignment) return null;
  return order;
}

export async function startDeliverySupportMessage(input: { orderNumber: string; customerOpenId: string; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const order = await getDeliveryOrderForViewer(input.orderNumber, { role: "customer", openId: input.customerOpenId });
  if (!order) return null;
  const body = input.body.trim();
  await db.insert(orderMessages).values({ orderId: order.order.id, senderRole: "customer", senderName: order.order.customerName, body: encodeDeliverySupportMessage(body) });
  await db.insert(activityEvents).values({ orderId: order.order.id, actorRole: "customer", eventType: "message_sent", title: "رسالة جديدة في دعم التوصيل", description: "أرسل العميل رسالة إلى قناة التوصيل." });
  await db.insert(notifications).values([
    { orderId: order.order.id, storeId: order.order.storeId, audience: "store", title: "رسالة جديدة في دعم التوصيل", body },
    { orderId: order.order.id, audience: "owner", title: "رسالة جديدة في دعم التوصيل", body },
  ]);
  return getDeliverySupportThread(input.orderNumber, { role: "customer", openId: input.customerOpenId });
}

export async function sendDeliverySupportMessage(input: { orderNumber: string; senderRole: DeliverySupportSender; senderName: string; body: string; openId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const viewer: DeliverySupportViewer = input.senderRole === "customer" ? { role: "customer", openId: input.openId } : input.senderRole === "courier" ? { role: "staff", openId: input.openId } : input.senderRole === "delivery_support" ? { role: "delivery_support", openId: input.openId } : { role: "admin", openId: input.openId };
  const order = await getDeliveryOrderForViewer(input.orderNumber, viewer);
  if (!order) return null;
  const body = input.body.trim();
  const actorRole = input.senderRole === "courier" ? "system" as const : input.senderRole === "delivery_support" ? "admin" as const : input.senderRole;
  const senderName = input.senderRole === "courier" ? (input.senderName.trim() || "مندوب التوصيل") : input.senderName.trim();
  await db.insert(orderMessages).values({ orderId: order.order.id, senderRole: actorRole, senderName, body: encodeDeliverySupportMessage(body) });
  await db.insert(activityEvents).values({ orderId: order.order.id, actorRole, eventType: "message_sent", title: "رسالة جديدة في دعم التوصيل", description: `تمت إضافة رسالة إلى قناة التوصيل بواسطة ${input.senderRole === "courier" ? "المندوب" : input.senderRole === "admin" ? "الإدارة" : "العميل"}.` });
  if (input.senderRole === "customer") {
    await db.insert(notifications).values([{ orderId: order.order.id, storeId: order.order.storeId, audience: "store", title: "رسالة جديدة في دعم التوصيل", body }, { orderId: order.order.id, audience: "owner", title: "رسالة جديدة في دعم التوصيل", body }]);
  } else {
    await db.insert(notifications).values({ orderId: order.order.id, storeId: order.order.storeId, audience: "customer", title: input.senderRole === "courier" ? "رسالة من مندوب التوصيل" : input.senderRole === "delivery_support" ? "تحديث من دعم التوصيل" : "تحديث من إدارة التوصيل", body });
  }
  return getDeliverySupportThread(input.orderNumber, viewer);
}

function normalizeSupportDisplayValue(value?: string | null) {
  // Legacy staging data contains the Arabic connector inside Latin identifiers.
  // Normalize the API payload itself so every client (SSR, mobile, and desktop)
  // receives the same clean value before rendering or copying it.
  return value == null ? value ?? null : String(value).replace(/[إا]لى/g, "to");
}

function normalizeLegacyDisplayName(value: string) {
  return normalizeSupportDisplayValue(value) ?? value;
}

function normalizeEmailForDisplay(value?: string | null) {
  return normalizeSupportDisplayValue(value);
}

function countUnreadSupportMessages(senderRole: ActorRole, viewerRole: "customer" | "store" | "admin") {
  if (viewerRole === "customer") return senderRole !== "customer";
  if (viewerRole === "store") return senderRole === "customer" || senderRole === "admin";
  return senderRole === "customer" || senderRole === "store";
}

export function countSupportUnread(messages: Array<{ senderRole: ActorRole; createdAt: Date }>, viewerRole: "customer" | "store" | "admin", lastReadAt?: Date | null) {
  return messages.filter((message) => countUnreadSupportMessages(message.senderRole, viewerRole) && (!lastReadAt || message.createdAt > lastReadAt)).length;
}

export async function getSupportConversation(id: number, viewerRole: "customer" | "store" | "admin", viewerOpenId?: string) {
  const db = await getDb();
  if (!db) return null;
  let access: ReturnType<typeof eq> | ReturnType<typeof and> = eq(supportConversations.id, id);
  if (viewerRole === "customer") {
    if (!viewerOpenId) return null;
    access = and(eq(supportConversations.id, id), eq(supportConversations.customerOpenId, viewerOpenId));
  }
  if (viewerRole === "store") {
    if (!viewerOpenId) return null;
    const ownedStore = await getStoreForOwner(viewerOpenId);
    if (!ownedStore) return null;
    access = and(eq(supportConversations.id, id), eq(supportConversations.storeId, ownedStore.id));
  }
  const rows = await db.select().from(supportConversations).where(access).limit(1);
  const conversation = rows[0];
  if (!conversation) return null;
  const messages = await db.select().from(supportMessages).where(eq(supportMessages.conversationId, id)).orderBy(supportMessages.createdAt);
  const hasPersonalReadState = (viewerRole === "customer" || viewerRole === "store") && Boolean(viewerOpenId);
  const readWhere = hasPersonalReadState
    ? and(eq(supportConversationReads.conversationId, id), eq(supportConversationReads.viewerRole, viewerRole), eq(supportConversationReads.viewerOpenId, viewerOpenId!))
    : and(eq(supportConversationReads.conversationId, id), eq(supportConversationReads.viewerRole, viewerRole), sql`${supportConversationReads.viewerOpenId} IS NULL`);
  const readRows = await db.select({ lastReadAt: supportConversationReads.lastReadAt }).from(supportConversationReads).where(readWhere).limit(1);
  const lastReadAt = readRows[0]?.lastReadAt;
  const unreadCount = countSupportUnread(messages, viewerRole, lastReadAt);
  const customerRows = viewerRole === "admin" && conversation.customerOpenId
    ? await db.select({ user: users, settings: accountSettings }).from(users).leftJoin(accountSettings, eq(users.openId, accountSettings.userOpenId)).where(eq(users.openId, conversation.customerOpenId)).limit(1)
    : [];
  const linkedOrderRows = conversation.orderId
    ? await db.select({ order: orders }).from(orders).where(eq(orders.id, conversation.orderId)).limit(1)
    : [];
  const linkedOrder = linkedOrderRows[0]?.order;
  const orderContext = viewerRole === "admin" && linkedOrder
    ? await getOrderByNumber(linkedOrder.orderNumber)
    : null;
  const customerIdentity = customerRows[0];
  const customerProfile = viewerRole === "admin" ? {
    internalRef: normalizeEmailForDisplay(conversation.customerOpenId),
    email: normalizeEmailForDisplay(customerIdentity?.user.email ?? conversation.customerContact),
    phone: customerIdentity?.settings?.phone ?? null,
  } : null;
  const escalations = await db.select().from(supportEscalations).where(eq(supportEscalations.conversationId, id)).orderBy(desc(supportEscalations.createdAt));
  const participants = await db.select().from(supportParticipants).where(eq(supportParticipants.conversationId, id)).orderBy(supportParticipants.joinedAt);
  const apiConversation = {
    ...conversation,
    customerName: normalizeSupportDisplayValue(conversation.customerName) ?? "",
    customerContact: normalizeSupportDisplayValue(conversation.customerContact),
    customerProfile: customerProfile
      ? {
          internalRef: normalizeSupportDisplayValue(customerProfile.internalRef),
          email: normalizeSupportDisplayValue(customerProfile.email),
          phone: customerProfile.phone,
        }
      : null,
  };
  return {
    conversation: apiConversation,
    orderContext,
    messages: messages.map((message) => ({ ...message, senderName: normalizeLegacyDisplayName(message.senderName) })),
    escalations,
    participants: participants.map((participant) => ({ ...participant, displayName: normalizeLegacyDisplayName(participant.displayName) })),
    unreadCount,
  };
}

export async function deleteSupportConversation(conversationId: number, actorOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [conversation] = await db.select().from(supportConversations).where(eq(supportConversations.id, conversationId)).limit(1);
  if (!conversation) return { deleted: false };
  await db.delete(supportMessages).where(eq(supportMessages.conversationId, conversationId));
  await db.delete(supportParticipants).where(eq(supportParticipants.conversationId, conversationId));
  await db.delete(supportConversationReads).where(eq(supportConversationReads.conversationId, conversationId));
  await db.delete(supportEscalations).where(eq(supportEscalations.conversationId, conversationId));
  await db.delete(supportAssignments).where(eq(supportAssignments.conversationId, conversationId));
  await db.delete(supportConversations).where(eq(supportConversations.id, conversationId));
  await db.insert(activityEvents).values({ orderId: conversation.orderId ?? null, actorRole: "admin", eventType: "system_note", title: "حذف محادثة دعم", description: `حُذفت محادثة الدعم رقم ${conversationId} من السجل`, metadata: JSON.stringify({ conversationId, actorOpenId }) });
  return { deleted: true, conversationId };
}

export async function listSupportConversations(viewerRole: "customer" | "store" | "admin", viewerOpenId?: string) {
  const db = await getDb();
  if (!db) return [];
  let access: ReturnType<typeof eq> | undefined;
  if (viewerRole === "customer") {
    if (!viewerOpenId) return [];
    access = eq(supportConversations.customerOpenId, viewerOpenId);
  }
  if (viewerRole === "store") {
    if (!viewerOpenId) return [];
    const ownedStore = await getStoreForOwner(viewerOpenId);
    if (!ownedStore) return [];
    access = eq(supportConversations.storeId, ownedStore.id);
  }
  const conversations = await db.select().from(supportConversations).where(access).orderBy(desc(supportConversations.updatedAt));
  const details = await Promise.all(conversations.map(async (conversation) => getSupportConversation(conversation.id, viewerRole, viewerOpenId)));
  return details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail));
}

export async function markSupportConversationRead(id: number, viewerRole: "customer" | "store" | "admin", viewerOpenId?: string) {
  const db = await getDb();
  if (!db) return null;
  if (viewerRole !== "admin" && !viewerOpenId) return null;
  if (!await getSupportConversation(id, viewerRole, viewerOpenId)) return null;
  const hasPersonalReadState = (viewerRole === "customer" || viewerRole === "store") && Boolean(viewerOpenId);
  const readWhere = hasPersonalReadState
    ? and(eq(supportConversationReads.conversationId, id), eq(supportConversationReads.viewerRole, viewerRole), eq(supportConversationReads.viewerOpenId, viewerOpenId!))
    : and(eq(supportConversationReads.conversationId, id), eq(supportConversationReads.viewerRole, viewerRole), sql`${supportConversationReads.viewerOpenId} IS NULL`);
  const existing = await db.select({ id: supportConversationReads.id }).from(supportConversationReads).where(readWhere).limit(1);
  if (existing[0]) {
    await db.update(supportConversationReads).set({ lastReadAt: new Date() }).where(eq(supportConversationReads.id, existing[0].id));
  } else {
    await db.insert(supportConversationReads).values({ conversationId: id, viewerRole, viewerOpenId: hasPersonalReadState ? viewerOpenId : undefined, lastReadAt: new Date() });
  }
  return getSupportConversation(id, viewerRole, viewerOpenId);
}

export async function createSupportConversation(input: { orderId?: number; orderNumber?: string; storeId?: number; customerOpenId?: string; customerName: string; customerContact?: string; subject: string; initialMessage: string; channel?: SupportChannel }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  let orderId = input.orderId;
  let storeId = input.storeId;
  if (input.orderNumber) {
    const orderFilters = [eq(orders.orderNumber, input.orderNumber.trim().toUpperCase())];
    if (input.customerOpenId) orderFilters.push(eq(orders.customerOpenId, input.customerOpenId));
    const [linked] = await db.select({ id: orders.id, storeId: orders.storeId }).from(orders).where(and(...orderFilters)).limit(1);
    if (!linked) throw new Error("لم نعثر على هذا الطلب ضمن حسابك.");
    orderId = linked.id;
    storeId = linked.storeId;
  }
  const result = await db.insert(supportConversations).values({ orderId, storeId, channel: input.channel ?? "customer_support", customerOpenId: input.customerOpenId, customerName: input.customerName.trim(), customerContact: normalizeEmailForDisplay(input.customerContact?.trim()), subject: input.subject.trim(), status: "open" });
  const conversationId = Number((result as any)[0]?.insertId);
  const requesterRole = input.channel === "merchant_support" ? "store" as const : "customer" as const;
  await ensureSupportParticipant(db, { conversationId, role: requesterRole, displayName: input.customerName, userOpenId: input.customerOpenId });
  await db.insert(supportMessages).values([
    { conversationId, senderRole: "system", senderName: "هسّا", body: "مرحبًا بك في هسّا. سيواصلك موظف من فريق الدعم قريبًا لمساعدتك." },
    { conversationId, senderRole: requesterRole, senderName: input.customerName.trim(), body: input.initialMessage.trim() },
  ]);
  await db.insert(activityEvents).values({ orderId: input.orderId, actorRole: requesterRole, eventType: "message_sent", title: input.channel === "merchant_support" ? "تذكرة جديدة من متجر" : "محادثة جديدة مع خدمة العملاء", description: `${input.customerName.trim()}: ${input.initialMessage.trim()}` });
  if (input.orderId) {
    await db.insert(notifications).values({ orderId: input.orderId, audience: "owner", title: "محادثة خدمة عملاء جديدة", body: input.subject.trim() });
  }
  await autoAssignSupportConversation(conversationId);
  return { conversationId };
}

export async function escalateSupportConversation(input: { conversationId: number; fromRole: "admin" | "store"; note: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await db.select().from(supportConversations).where(eq(supportConversations.id, input.conversationId)).limit(1);
  const conversation = current[0];
  if (!conversation) return null;
  await ensureSupportParticipant(db, { conversationId: input.conversationId, role: input.fromRole, displayName: input.fromRole === "admin" ? "فريق خدمة العملاء" : "فريق المتجر" });
  const toRole = input.fromRole === "admin" ? "store" as const : "admin" as const;
  await db.insert(supportEscalations).values({ conversationId: input.conversationId, fromRole: input.fromRole, toRole, note: input.note.trim() });
  await db.update(supportConversations).set({ status: toRole === "store" ? "escalated_store" : "waiting_customer" }).where(eq(supportConversations.id, input.conversationId));
  if (conversation.orderId) {
    await db.insert(activityEvents).values({ orderId: conversation.orderId, actorRole: input.fromRole, eventType: "store_update", title: "تم تصعيد المحادثة للمتجر", description: input.note.trim() });
    await db.insert(notifications).values({ orderId: conversation.orderId, audience: "store", title: "محادثة تحتاج متابعة المتجر", body: input.note.trim() });
  }
  return getSupportConversation(input.conversationId, input.fromRole);
}

export async function sendSupportMessage(input: { conversationId: number; senderRole: "customer" | "store" | "admin"; senderName: string; body: string; customerOpenId?: string; actorOpenId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  let access: ReturnType<typeof eq> | ReturnType<typeof and> = eq(supportConversations.id, input.conversationId);
  if (input.senderRole === "customer") {
    if (!input.customerOpenId) return null;
    access = and(eq(supportConversations.id, input.conversationId), eq(supportConversations.customerOpenId, input.customerOpenId));
  }
  if (input.senderRole === "store") {
    if (!input.actorOpenId) return null;
    const ownedStore = await getStoreForOwner(input.actorOpenId);
    if (!ownedStore) return null;
    access = and(eq(supportConversations.id, input.conversationId), eq(supportConversations.storeId, ownedStore.id));
  }
  const current = await db.select().from(supportConversations).where(access).limit(1);
  const conversation = current[0];
  if (!conversation) return null;
  if (conversation.status === "closed") throw new Error("لا يمكن الرد على محادثة منتهية. افتح محادثة جديدة للدعم.");
  const body = input.body.trim();
  await ensureSupportParticipant(db, { conversationId: input.conversationId, role: input.senderRole, displayName: input.senderName, userOpenId: input.senderRole === "customer" ? input.customerOpenId : input.senderRole === "store" ? input.actorOpenId : undefined });
  await db.insert(supportMessages).values({ conversationId: input.conversationId, senderRole: input.senderRole, senderName: input.senderName.trim(), body });
  const nextStatus: SupportConversationStatus = input.senderRole === "customer" ? "waiting_store" : "waiting_customer";
  await db.update(supportConversations).set({ status: nextStatus }).where(eq(supportConversations.id, input.conversationId));
  if (conversation.orderId) {
    await db.insert(activityEvents).values({ orderId: conversation.orderId, actorRole: input.senderRole, eventType: "message_sent", title: "رسالة جديدة في خدمة العملاء", description: `${input.senderName.trim()}: ${body}` });
    await db.insert(notifications).values({ orderId: conversation.orderId, audience: input.senderRole === "customer" ? "owner" : "customer", title: input.senderRole === "customer" ? "رسالة جديدة للدعم" : "رد من خدمة العملاء", body });
  }
  return getSupportConversation(input.conversationId, input.senderRole === "customer" ? "customer" : input.senderRole, input.senderRole === "customer" ? input.customerOpenId : input.senderRole === "store" ? input.actorOpenId : undefined);
}

export function sanitizeAuditDescription(description: string) {
  return description
    .replace(/([\w.+-]+)@([\w.-]+)/g, "•••@$2")
    .replace(/(?:\+?962|0)?7\d[\s-]?\d{3}[\s-]?\d{4}/g, "•••")
    .replace(/\b(?:staff_|user_)[A-Za-z0-9_-]{6,}\b/g, "•••");
}

function auditDescription(event: { eventType: ActivityEventType; title?: string | null; description: string }) {
  if (["message_sent", "change_requested"].includes(event.eventType)) return "تم تسجيل تواصل ضمن الطلب أو محادثة الدعم.";
  if (event.eventType === "customer_updated") return "تم تحديث بيانات التواصل أو التوصيل.";
  if (event.eventType === "system_note" && /محادث|إغلاق|حذف/.test(`${event.title ?? ""} ${event.description}`)) return "تم تسجيل إجراء دعم إداري على المحادثة دون عرض معرّفات داخلية.";
  return sanitizeAuditDescription(event.description).replace(/[A-Za-z0-9_-]{18,}/g, "مرجع داخلي مخفي");
}

export async function listAdminAuditEvents(limit = 80) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((event) => ({
    id: event.id,
    actorRole: event.actorRole,
    eventType: event.eventType,
    title: event.title,
    description: auditDescription(event),
    createdAt: event.createdAt,
  }));
}

function auditRangeWhere(input: { fromDate: string; toDate: string; actorRole?: AuditActorFilter }) {
  const start = new Date(`${input.fromDate}T00:00:00.000Z`);
  const end = new Date(`${input.toDate}T23:59:59.999Z`);
  const dates = and(gte(activityEvents.createdAt, start), lte(activityEvents.createdAt, end));
  return input.actorRole && input.actorRole !== "all" ? and(dates, eq(activityEvents.actorRole, input.actorRole)) : dates;
}

async function selectAuditArchiveRows(db: ReturnType<typeof drizzle>, input: { fromDate: string; toDate: string; actorRole?: AuditActorFilter }) {
  return db.select().from(activityEvents).where(auditRangeWhere(input)).orderBy(activityEvents.createdAt);
}

export async function archiveAdminAuditLog(input: { requestedByOpenId: string; fromDate: string; toDate: string; actorRole?: AuditActorFilter }) {
  validateArchiveDates(input.fromDate, input.toDate);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const selected = await selectAuditArchiveRows(db, input);
  const archive = await archiveRows(db, {
    scope: "admin",
    entity: "audit",
    requestedByOpenId: input.requestedByOpenId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    headers: ["المعرف", "التاريخ", "الدور", "نوع الحدث", "الإجراء", "الوصف"],
    rows: selected.map((event) => [event.id, event.createdAt.toISOString(), event.actorRole, event.eventType, event.title, auditDescription(event)]),
  });
  await db.insert(activityEvents).values({
    actorRole: "admin",
    eventType: "system_note",
    title: "أرشفة سجل التدقيق",
    description: `تم حفظ ${selected.length} إجراء في أرشيف CSV.`,
    metadata: JSON.stringify({ archiveId: archive?.id, fromDate: input.fromDate, toDate: input.toDate, actorRole: input.actorRole ?? "all", requestedByOpenId: input.requestedByOpenId }),
  });
  return { archive, archivedCount: selected.length };
}

export async function deleteAdminAuditLog(input: { requestedByOpenId: string; fromDate: string; toDate: string; actorRole?: AuditActorFilter }) {
  validateArchiveDates(input.fromDate, input.toDate);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const selected = await selectAuditArchiveRows(db, input);
  if (selected.length) await db.delete(activityEvents).where(inArray(activityEvents.id, selected.map((event) => event.id)));
  await db.insert(activityEvents).values({
    actorRole: "admin",
    eventType: "system_note",
    title: "حذف سجل التدقيق",
    description: `تم حذف ${selected.length} إجراء من سجل التدقيق بعد تأكيد الإدارة.`,
    metadata: JSON.stringify({ fromDate: input.fromDate, toDate: input.toDate, actorRole: input.actorRole ?? "all", requestedByOpenId: input.requestedByOpenId }),
  });
  return { deletedCount: selected.length };
}

export async function getAdminSnapshot() {
  const db = await getDb();
  if (!db) return { orders: [], events: [], unreadNotifications: 0, metrics: { total: 0, newOrders: 0, inProgress: 0, delivered: 0, revenueCents: 0 } };
  await ensureDeliverySchema(db);
  const [orderRows, eventRows, unreadRows] = await Promise.all([
    db.select({ order: orders, store: stores }).from(orders).leftJoin(stores, eq(orders.storeId, stores.id)).orderBy(desc(orders.updatedAt)),
    db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(30),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.audience, "owner"), eq(notifications.isRead, 0))),
  ]);
  const total = orderRows.length;
  const newOrders = orderRows.filter((row) => row.order.status === "new").length;
  const inProgress = orderRows.filter((row) => ["confirmed", "ready", "out_for_delivery", "in_transit"].includes(row.order.status)).length;
  const delivered = orderRows.filter((row) => row.order.status === "delivered").length;
  const revenueCents = orderRows.filter((row) => row.order.status !== "cancelled").reduce((sum, row) => sum + row.order.totalCents, 0);
  return { orders: orderRows, events: eventRows, unreadNotifications: Number(unreadRows[0]?.count ?? 0), metrics: { total, newOrders, inProgress, delivered, revenueCents } };
}

export async function getOwnerNotifications() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.audience, "owner")).orderBy(desc(notifications.createdAt)).limit(20);
}

export async function markOwnerNotificationsRead() {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.audience, "owner"));
}


export async function getAccountSettings(userOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  const [existing] = await db.select().from(accountSettings).where(eq(accountSettings.userOpenId, userOpenId)).limit(1);
  if (existing) return existing;
  await db.insert(accountSettings).values({ userOpenId });
  const [created] = await db.select().from(accountSettings).where(eq(accountSettings.userOpenId, userOpenId)).limit(1);
  return created ?? null;
}

export async function updateAccountSettings(userOpenId: string, input: { phone?: string | null; locale?: string; timezone?: string; orderUpdates?: boolean; supportNotifications?: boolean; marketingNotifications?: boolean; profileVisibility?: "private" | "support_only" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await getAccountSettings(userOpenId);
  const patch: Record<string, unknown> = {};
  if ("phone" in input) patch.phone = input.phone?.trim() || null;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.orderUpdates !== undefined) patch.orderUpdates = input.orderUpdates ? 1 : 0;
  if (input.supportNotifications !== undefined) patch.supportNotifications = input.supportNotifications ? 1 : 0;
  if (input.marketingNotifications !== undefined) patch.marketingNotifications = input.marketingNotifications ? 1 : 0;
  if (input.profileVisibility !== undefined) patch.profileVisibility = input.profileVisibility;
  if (Object.keys(patch).length) await db.update(accountSettings).set(patch).where(eq(accountSettings.userOpenId, userOpenId));
  return getAccountSettings(userOpenId);
}

export async function getStoreSettings(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  await ensureOrderWorkflowSchema(db);
  const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
  if (existing) return existing;
  await db.insert(storeSettings).values({ storeId });
  const [created] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
  return created ?? null;
}

export async function updateStoreSettings(storeId: number, input: { contactPhone?: string | null; address?: string | null; openingHours?: string | null; acceptingOrders?: boolean; orderNotifications?: boolean; supportNotifications?: boolean; publicProfile?: boolean; teamAccess?: "owner_only" | "support_team"; automaticCourierAssignment?: boolean; latitude?: number | null; longitude?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingSettings = await getStoreSettings(storeId);
  const patch: Record<string, unknown> = {};
  if ("contactPhone" in input) patch.contactPhone = input.contactPhone?.trim() || null;
  if ("address" in input) patch.address = input.address?.trim() || null;
  if ("openingHours" in input) patch.openingHours = input.openingHours?.trim() || null;
  if (input.acceptingOrders !== undefined) patch.acceptingOrders = input.acceptingOrders ? 1 : 0;
  if (input.orderNotifications !== undefined) patch.orderNotifications = input.orderNotifications ? 1 : 0;
  if (input.supportNotifications !== undefined) patch.supportNotifications = input.supportNotifications ? 1 : 0;
  if (input.publicProfile !== undefined) patch.publicProfile = input.publicProfile ? 1 : 0;
  if (input.teamAccess !== undefined) patch.teamAccess = input.teamAccess;
  if (input.automaticCourierAssignment !== undefined) patch.automaticCourierAssignment = input.automaticCourierAssignment ? 1 : 0;
  if (Object.keys(patch).length) await db.update(storeSettings).set(patch).where(eq(storeSettings.storeId, storeId));
  const hasLocationInput = "latitude" in input || "longitude" in input;
  if (hasLocationInput) {
    const latitude = "latitude" in input ? input.latitude ?? null : null;
    const longitude = "longitude" in input ? input.longitude ?? null : null;
    try {
      await ensureStoreLocationSchema(db);
      await db.update(stores).set({ latitude, longitude }).where(eq(stores.id, storeId));
    } catch (error) {
      console.warn("Store location columns are unavailable; storing coordinates in the address:", error);
      const address = "address" in input ? input.address : existingSettings?.address;
      await db.update(storeSettings).set({ address: appendCoordinatesToAddress(address, latitude, longitude) || null }).where(eq(storeSettings.storeId, storeId));
    }
  }
  return getStoreSettings(storeId);
}

export async function listSupportQueue(channel: SupportChannel = "customer_support") {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ conversation: supportConversations, assignment: supportAssignments })
    .from(supportConversations)
    .leftJoin(supportAssignments, eq(supportConversations.id, supportAssignments.conversationId))
    .where(eq(supportConversations.channel, channel))
    .orderBy(desc(supportConversations.updatedAt));
  return rows;
}

export async function listStaffMembers() {
  const db = await getDb();
  if (!db) return [];
  await ensureStaffTypeSchema(db);
  return db.select({ staff: staffMembers, user: users }).from(staffMembers).leftJoin(users, eq(staffMembers.userOpenId, users.openId)).orderBy(staffMembers.createdAt);
}

export async function listStaffInvitations() {
  const db = await getDb();
  if (!db) return [];
  await ensureStaffTypeSchema(db);
  return db.select().from(staffInvitations).orderBy(desc(staffInvitations.createdAt));
}

export async function getStaffMember(userOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  await ensureStaffTypeSchema(db);
  const [row] = await db.select({ staff: staffMembers, user: users }).from(staffMembers).leftJoin(users, eq(staffMembers.userOpenId, users.openId)).where(eq(staffMembers.userOpenId, userOpenId)).limit(1);
  return row ?? null;
}

export async function promoteStaffMember(email: string, staffType: StaffType = "support") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureStaffTypeSchema(db);
  const user = await getUserByEmail(email);
  if (!user) return null;
  if (user.role !== "staff") await db.update(users).set({ role: "staff" }).where(eq(users.id, user.id));
  await db.insert(staffMembers).values({ userOpenId: user.openId, displayName: user.name || user.email || (staffType === "courier" ? "مندوب" : "موظف دعم"), staffType }).onDuplicateKeyUpdate({ set: { status: "active", displayName: user.name || user.email || (staffType === "courier" ? "مندوب" : "موظف دعم"), staffType } });
  return getUserByOpenId(user.openId);
}

export async function setStaffStatus(userOpenId: string, status: "active" | "suspended") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureStaffTypeSchema(db);
  await db.update(staffMembers).set({ status, ...(status === "suspended" ? { availability: "unavailable" as const } : {}) }).where(eq(staffMembers.userOpenId, userOpenId));
  await db.update(users).set({ role: status === "active" ? "staff" : "user" }).where(eq(users.openId, userOpenId));
  return listStaffMembers();
}

export async function setStaffAvailability(userOpenId: string, availability: "available" | "busy" | "unavailable") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureStaffTypeSchema(db);
  const [member] = await db.select().from(staffMembers).where(eq(staffMembers.userOpenId, userOpenId)).limit(1);
  if (!member || member.status !== "active") return null;
  await db.update(staffMembers).set({ availability }).where(eq(staffMembers.userOpenId, userOpenId));
  if (availability === "available" && member.staffType === "support") {
    const queue = await listSupportQueue("customer_support");
    for (const item of queue) {
      if (!item.assignment?.assigneeOpenId && item.conversation.status !== "closed") await autoAssignSupportConversation(item.conversation.id);
    }
  }
  return listStaffMembers();
}

export async function assignSupportConversation(conversationId: number, assigneeOpenId?: string | null, priority: "low" | "normal" | "high" | "urgent" = "normal") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (assigneeOpenId) {
    const rows = await listSupportQueue();
    const assignedOpenCount = rows.filter((row) => row.assignment?.assigneeOpenId === assigneeOpenId && !["closed", "resolved"].includes(row.conversation.status) && row.conversation.id !== conversationId).length;
    if (assignedOpenCount >= MAX_CONCURRENT_SUPPORT_CONVERSATIONS) throw new Error("وصل الموظف إلى الحد الأقصى: محادثتان نشطتان.");
  }
  const slaHours = priority === "urgent" ? 1 : priority === "high" ? 4 : priority === "normal" ? 12 : 24;
  const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
  await db.insert(supportAssignments).values({ conversationId, assigneeOpenId: assigneeOpenId || null, priority, slaDueAt, assignedAt: assigneeOpenId ? new Date() : null }).onDuplicateKeyUpdate({ set: { assigneeOpenId: assigneeOpenId || null, priority, slaDueAt, assignedAt: assigneeOpenId ? new Date() : null } });
  const [row] = await db.select().from(supportAssignments).where(eq(supportAssignments.conversationId, conversationId)).limit(1);
  return row ?? null;
}

export const MAX_CONCURRENT_SUPPORT_CONVERSATIONS = 2;

export function chooseFairAvailableStaff<T extends { staff: { userOpenId: string; status: string; availability: string } }>(members: T[], openCounts: Map<string, number>, random = Math.random) {
  const available = members.filter((member) => member.staff.status === "active" && member.staff.availability === "available" && (openCounts.get(member.staff.userOpenId) || 0) < MAX_CONCURRENT_SUPPORT_CONVERSATIONS);
  if (!available.length) return null;
  const minCount = Math.min(...available.map((member) => openCounts.get(member.staff.userOpenId) || 0));
  const candidates = available.filter((member) => (openCounts.get(member.staff.userOpenId) || 0) === minCount);
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] ?? null;
}

export async function autoAssignSupportConversation(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [conversation] = await db.select({ channel: supportConversations.channel }).from(supportConversations).where(eq(supportConversations.id, conversationId)).limit(1);
  if (!conversation || conversation.channel !== "customer_support") return assignSupportConversation(conversationId, null, "normal");
  const members = await listStaffMembers();
  const available = members.filter((member) => member.staff.staffType === "support" && member.staff.status === "active" && member.staff.availability === "available");
  if (!available.length) return assignSupportConversation(conversationId, null, "normal");
  const queue = await listSupportQueue("customer_support");
  const counts = new Map(available.map((member) => [member.staff.userOpenId, 0]));
  for (const item of queue) if (item.assignment?.assigneeOpenId && counts.has(item.assignment.assigneeOpenId) && !["closed", "resolved"].includes(item.conversation.status)) counts.set(item.assignment.assigneeOpenId, (counts.get(item.assignment.assigneeOpenId) || 0) + 1);
  const selected = chooseFairAvailableStaff(available, counts);
  return assignSupportConversation(conversationId, selected?.staff.userOpenId ?? null, "normal");
}

export async function listStaffSupportInbox(userOpenId: string) {
  const rows = await listSupportQueue();
  const assigned = rows.filter((row) => row.assignment?.assigneeOpenId === userOpenId);
  const details = await Promise.all(assigned.map((row) => getSupportConversation(row.conversation.id, "admin")));
  return details.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail));
}

export async function getStaffSupportStats() {
  const db = await getDb();
  if (db) await ensureStaffTypeSchema(db);
  const members = await listStaffMembers();
  const rows = await listSupportQueue();
  return Promise.all(members.map(async (member) => {
    const assigned = rows.filter((row) => row.assignment?.assigneeOpenId === member.staff.userOpenId);
    const [activeShift] = db ? await db.select().from(staffShifts).where(and(eq(staffShifts.staffOpenId, member.staff.userOpenId), isNull(staffShifts.endedAt))).orderBy(desc(staffShifts.startedAt)).limit(1) : [];
    return { ...member, openCount: assigned.filter((row) => row.conversation.status !== "closed").length, closedCount: assigned.filter((row) => row.conversation.status === "closed").length, activeShift: activeShift ?? null };
  }));
}

export async function startStaffShift(staffOpenId: string, availability: "available" | "busy" | "unavailable" = "available") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const member = await getStaffMember(staffOpenId);
  if (!member || member.staff.status !== "active") throw new Error("حساب الموظف غير نشط.");
  const [existing] = await db.select().from(staffShifts).where(and(eq(staffShifts.staffOpenId, staffOpenId), isNull(staffShifts.endedAt))).limit(1);
  if (existing) return existing;
  await setStaffAvailability(staffOpenId, availability);
  await db.insert(staffShifts).values({ staffOpenId, startAvailability: availability });
  const [shift] = await db.select().from(staffShifts).where(and(eq(staffShifts.staffOpenId, staffOpenId), isNull(staffShifts.endedAt))).orderBy(desc(staffShifts.startedAt)).limit(1);
  return shift ?? null;
}

export async function endStaffShift(staffOpenId: string, endAvailability: "available" | "busy" | "unavailable" = "unavailable") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await listSupportQueue();
  const activeConversationCount = rows.filter((row) => row.assignment?.assigneeOpenId === staffOpenId && row.conversation.status !== "closed").length;
  await db.update(staffShifts).set({ endedAt: new Date(), endAvailability, activeConversationCount }).where(and(eq(staffShifts.staffOpenId, staffOpenId), isNull(staffShifts.endedAt)));
  await setStaffAvailability(staffOpenId, endAvailability);
  return { activeConversationCount };
}

export async function getCurrentStaffShift(staffOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  const [shift] = await db.select().from(staffShifts).where(and(eq(staffShifts.staffOpenId, staffOpenId), isNull(staffShifts.endedAt))).orderBy(desc(staffShifts.startedAt)).limit(1);
  return shift ?? null;
}

export async function listStaffShiftHistory() {
  const db = await getDb();
  if (!db) return [];
  await ensureStaffTypeSchema(db);
  return db.select({ shift: staffShifts, staff: staffMembers, user: users })
    .from(staffShifts)
    .leftJoin(staffMembers, eq(staffShifts.staffOpenId, staffMembers.userOpenId))
    .leftJoin(users, eq(staffShifts.staffOpenId, users.openId))
    .orderBy(desc(staffShifts.startedAt));
}

export async function transferSupportConversation(conversationId: number, assigneeOpenId: string, actorOpenId: string, actorRole: "admin" | "staff") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [currentAssignment] = await db.select().from(supportAssignments).where(eq(supportAssignments.conversationId, conversationId)).limit(1);
  if (actorRole === "staff" && currentAssignment?.assigneeOpenId !== actorOpenId) throw new Error("لا يمكنك تحويل إلا المحادثات الموجودة في Inbox الخاص بك.");
  const [target] = await db.select().from(staffMembers).where(and(eq(staffMembers.userOpenId, assigneeOpenId), eq(staffMembers.status, "active"), eq(staffMembers.availability, "available"))).limit(1);
  if (!target) throw new Error("الموظف المختار غير متاح حاليًا لاستقبال المحادثات.");
  const assignment = await assignSupportConversation(conversationId, assigneeOpenId, "normal");
  await db.update(supportConversations).set({ status: "open" }).where(eq(supportConversations.id, conversationId));
  await db.insert(activityEvents).values({ actorRole: "admin", eventType: "system_note", title: "تم تحويل محادثة الدعم", description: `تم تحويل المحادثة ${conversationId} إلى موظف دعم آخر بواسطة ${actorOpenId}` });
  return assignment;
}

export async function closeAssignedSupportConversation(conversationId: number, actorOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [assignment] = await db.select().from(supportAssignments).where(eq(supportAssignments.conversationId, conversationId)).limit(1);
  if (!assignment || assignment.assigneeOpenId !== actorOpenId) throw new Error("لا يمكنك إنهاء إلا المحادثات الموجودة في Inbox الخاص بك.");
  const actor = await getUserByOpenId(actorOpenId);
  await db.update(supportConversations).set({ status: "closed", closedAt: new Date(), closedByRole: "staff", closedByOpenId: actorOpenId, closedByName: actor?.name || actor?.email || "موظف الدعم" }).where(eq(supportConversations.id, conversationId));
  const [conversation] = await db.select().from(supportConversations).where(eq(supportConversations.id, conversationId)).limit(1);
  return conversation ?? null;
}

export async function finishSupportConversation(conversationId: number, actorOpenId: string, actorRole: "customer" | "store" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [conversation] = await db.select().from(supportConversations).where(eq(supportConversations.id, conversationId)).limit(1);
  if (!conversation) return null;
  if (actorRole === "customer" && conversation.customerOpenId !== actorOpenId) throw new Error("لا يمكنك إنهاء محادثة لا تخص حسابك.");
  if (actorRole === "store") {
    const ownedStore = await getStoreForOwner(actorOpenId);
    if (!ownedStore || conversation.storeId !== ownedStore.id) throw new Error("لا يمكنك إنهاء محادثة ليست ضمن متجرِك.");
  }
  if (conversation.status === "closed") return conversation;
  const actor = await getUserByOpenId(actorOpenId);
  const closedByName = actor?.name || actor?.email || (actorRole === "admin" ? "الأدمن" : actorRole === "store" ? "المتجر" : "العميل");
  await db.update(supportConversations).set({ status: "closed", closedAt: new Date(), closedByRole: actorRole, closedByOpenId: actorOpenId, closedByName }).where(eq(supportConversations.id, conversationId));
  return getSupportConversation(conversationId, actorRole === "customer" ? "customer" : actorRole, actorRole === "customer" ? actorOpenId : undefined);
}

export async function recordSupportViewAudit(actorOpenId: string, targetOpenId: string, targetRole: "user" | "store", reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(supportViewAudit).values({ adminOpenId: actorOpenId, targetOpenId, targetRole, reason: reason.trim() });
}

export async function getSupportViewTarget(adminOpenId: string, targetOpenId: string, targetRole: "user" | "store", reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const target = await getUserByOpenId(targetOpenId);
  if (!target || target.role !== targetRole) return null;
  await recordSupportViewAudit(adminOpenId, targetOpenId, targetRole, reason);
  const settings = targetRole === "user" ? await getAccountSettings(targetOpenId) : null;
  const ownedStore = targetRole === "store" ? (await db.select().from(stores).where(eq(stores.ownerOpenId, targetOpenId)).limit(1))[0] : null;
  const storeConfig = ownedStore ? await getStoreSettings(ownedStore.id) : null;
  const targetOrders = targetRole === "store" && ownedStore ? await db.select().from(orders).where(eq(orders.storeId, ownedStore.id)).orderBy(desc(orders.createdAt)) : [];
  return { target, settings, store: ownedStore, storeSettings: storeConfig, orders: targetOrders, readOnly: true };
}


export async function lookupCustomerForSupport(actorOpenId: string, query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalized = query.trim();
  let user = await getUserByEmail(normalized);
  let matchedPhone: string | null = null;
  let phoneRows: Array<{ user: typeof users.$inferSelect; settings: typeof accountSettings.$inferSelect | null }> = [];
  const normalizedQueryPhone = normalizePhone(normalized);
  if (!user && normalizedQueryPhone.length >= 6) {
    const rows = await db.select({ user: users, settings: accountSettings }).from(users).leftJoin(accountSettings, eq(users.openId, accountSettings.userOpenId)).where(eq(users.role, "user"));
    phoneRows = rows.filter((row) => row.settings?.phone && normalizePhone(row.settings.phone) === normalizedQueryPhone);
    user = phoneRows[0]?.user;
    matchedPhone = normalizedQueryPhone;
  }
  if (!user) {
    const foundOrder = await getOrderByNumber(normalized);
    const customerOpenId = foundOrder?.order.customerOpenId;
    if (customerOpenId) user = await getUserByOpenId(customerOpenId);
  }
  if (!user || user.role !== "user") return null;
  await recordSupportViewAudit(actorOpenId, user.openId, "user", `بحث دعم: ${normalized}`);
  const [settings] = await db.select().from(accountSettings).where(eq(accountSettings.userOpenId, user.openId)).limit(1);
  if (!matchedPhone && settings?.phone) {
    matchedPhone = normalizePhone(settings.phone);
    if (matchedPhone.length >= 6) {
      const rows = await db.select({ user: users, settings: accountSettings }).from(users).leftJoin(accountSettings, eq(users.openId, accountSettings.userOpenId)).where(eq(users.role, "user"));
      phoneRows = rows.filter((row) => row.settings?.phone && normalizePhone(row.settings.phone) === matchedPhone);
    }
  }
  const customerOrders = await db.select().from(orders).where(eq(orders.customerOpenId, user.openId)).orderBy(desc(orders.createdAt));
  const linkedAccounts = phoneRows.filter((row) => row.user.openId !== user!.openId).map((row) => ({ openId: row.user.openId, name: row.user.name, email: normalizeEmailForDisplay(row.user.email), phone: row.settings?.phone ?? null, createdAt: row.user.createdAt }));
  return { customer: { openId: user.openId, name: user.name, email: normalizeEmailForDisplay(user.email), role: user.role, createdAt: user.createdAt, lastSignedIn: user.lastSignedIn }, settings: settings ?? null, orders: customerOrders, linkedAccounts, linkage: matchedPhone ? "phone" as const : null };
}

export async function updateCustomerSupportFields(actorOpenId: string, userOpenId: string, input: { phone?: string | null; supportNotifications?: boolean; orderUpdates?: boolean }) {
  await recordSupportViewAudit(actorOpenId, userOpenId, "user", "تعديل حقول دعم مسموحة");
  return updateAccountSettings(userOpenId, input);
}

export async function getStoreForOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  return readStoreForOwner(db, ownerOpenId);
}


export async function createStoreForOwner(ownerOpenId: string, input: { name: string; handle: string; category: string; neighborhood: string; description: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getStoreForOwner(ownerOpenId);
  if (existing) return existing;
  await db.insert(stores).values({ ownerOpenId, name: input.name.trim(), handle: input.handle.trim().toLowerCase(), category: input.category.trim(), neighborhood: input.neighborhood.trim(), description: input.description.trim() });
  return getStoreForOwner(ownerOpenId);
}


export async function updateUserPassword(openId: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
  return { success: true } as const;
}

export async function requestStaffPasswordRecovery(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const normalizedEmail = normalizeEmail(email);
  const user = await getUserByEmail(normalizedEmail);
  const staff = user ? await getStaffMember(user.openId) : null;
  if (staff) {
    const [existing] = await db.select().from(staffRecoveryRequests).where(and(eq(staffRecoveryRequests.email, normalizedEmail), eq(staffRecoveryRequests.status, "pending"))).limit(1);
    if (!existing) await db.insert(staffRecoveryRequests).values({ email: normalizedEmail, userOpenId: user?.openId ?? null });
  }
  return { accepted: true } as const;
}

export async function listStaffRecoveryRequests() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(staffRecoveryRequests).where(eq(staffRecoveryRequests.status, "pending")).orderBy(desc(staffRecoveryRequests.createdAt));
}

export async function resolveStaffRecoveryRequest(requestId: number, resolvedByOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffRecoveryRequests).set({ status: "resolved", resolvedAt: new Date(), resolvedByOpenId }).where(and(eq(staffRecoveryRequests.id, requestId), eq(staffRecoveryRequests.status, "pending")));
  return { success: true } as const;
}

export async function createStaffPasswordReset(input: { userOpenId: string; createdByOpenId: string; tokenHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(staffPasswordResets).values(input);
  return { success: true } as const;
}

export async function consumeStaffPasswordReset(tokenHash: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [reset] = await db.select().from(staffPasswordResets).where(eq(staffPasswordResets.tokenHash, tokenHash)).limit(1);
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) return null;
  const user = await getUserByOpenId(reset.userOpenId);
  if (!user || user.role !== "staff") return null;
  const updateResult = await db.update(staffPasswordResets).set({ usedAt: new Date() }).where(and(eq(staffPasswordResets.id, reset.id), isNull(staffPasswordResets.usedAt)));
  if (!Number((updateResult as any)[0]?.affectedRows ?? 0)) return null;
  await db.update(users).set({ passwordHash }).where(eq(users.openId, reset.userOpenId));
  return user;
}


export async function createStaffInvitation(input: { email: string; invitedByOpenId: string; tokenHash: string; expiresAt: Date; staffType?: StaffType }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureStaffTypeSchema(db);
  await db.insert(staffInvitations).values({ email: normalizeEmail(input.email), staffType: input.staffType ?? "support", invitedByOpenId: input.invitedByOpenId, tokenHash: input.tokenHash, expiresAt: input.expiresAt });
  const [row] = await db.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, input.tokenHash)).limit(1);
  return row ?? null;
}

export async function getStaffInvitation(tokenHash: string) {
  const db = await getDb();
  if (!db) return null;
  await ensureStaffTypeSchema(db);
  const [row] = await db.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

export async function acceptStaffInvitation(tokenHash: string, openId: string, name: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureStaffTypeSchema(db);
  const displayName = name.trim();
  if (!validateStaffDisplayName(displayName)) throw new Error("STAFF_DISPLAY_NAME_INVALID");
  const [duplicateName] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.displayName, displayName)).limit(1);
  if (duplicateName) throw new Error("STAFF_DISPLAY_NAME_IN_USE");
  const invitation = await getStaffInvitation(tokenHash);
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now()) return null;
  const user = await getUserByEmail(invitation.email);
  if (user) {
    await db.update(users).set({ name: displayName, passwordHash, role: "staff", emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  } else {
    await db.insert(users).values({ openId, name: displayName, email: invitation.email, loginMethod: "email", passwordHash, role: "staff", emailVerifiedAt: new Date(), lastSignedIn: new Date() });
  }
  const acceptedUser = await getUserByEmail(invitation.email);
  if (acceptedUser) await db.insert(staffMembers).values({ userOpenId: acceptedUser.openId, displayName, staffType: invitation.staffType ?? "support" }).onDuplicateKeyUpdate({ set: { status: "active", staffType: invitation.staffType ?? "support" } });
  await db.update(staffInvitations).set({ acceptedAt: new Date() }).where(eq(staffInvitations.id, invitation.id));
  return getUserByEmail(invitation.email);
}

export async function listProductsForOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) return [];
  const rows = await db.select(productReadColumns).from(products).where(eq(products.storeId, owned.id)).orderBy(desc(products.createdAt));
  return rows.map(normalizeProductImage);
}

export async function createProductForOwner(ownerOpenId: string, input: { name: string; description: string; category: string; priceCents: number; imageUrl: string; imageStorageKey?: string; stock: number; badge?: string | null; media?: Array<{ mediaType: "image" | "video"; url: string; storageKey?: string; altText?: string }> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) throw new Error("لا يوجد متجر مرتبط بهذا الحساب بعد.");
  const submittedAt = new Date();
  const created = await db.insert(products).values({ storeId: owned.id, name: input.name.trim(), description: input.description.trim(), category: input.category.trim(), priceCents: Math.round(input.priceCents), imageUrl: input.imageUrl.trim(), stock: Math.max(0, Math.floor(input.stock)), badge: input.badge?.trim() || null, approvalStatus: "pending_review", submittedAt, isActive: 0 });
  const productId = Number((created as any)[0]?.insertId);
  const referenceCode = `HS-P${String(productId).padStart(6, "0")}`;
  await db.update(products).set({ referenceCode }).where(eq(products.id, productId));
  const requestedMedia = input.media ?? [];
  const videos = requestedMedia.filter((media) => media.mediaType === "video");
  if (videos.length > 3) throw new Error("يمكن إضافة ثلاثة فيديوهات كحد أقصى لكل منتج.");
  const orderedMedia = [{ mediaType: "image" as const, url: input.imageUrl.trim(), storageKey: input.imageStorageKey, altText: input.name.trim() }, ...requestedMedia.filter((media) => media.url.trim() !== input.imageUrl.trim())];
  if (orderedMedia.length) await db.insert(productMedia).values(orderedMedia.map((media, index) => ({ productId, mediaType: media.mediaType, url: media.url.trim(), storageKey: media.storageKey || null, altText: media.altText?.trim() || input.name.trim(), sortOrder: index })));
  await db.insert(activityEvents).values({ actorRole: "store", eventType: "store_update", title: "منتج بانتظار الاعتماد", description: `${owned.name} أرسل منتج ${referenceCode} للمراجعة.`, metadata: JSON.stringify({ productId, referenceCode }) });
  return listProductsForOwner(ownerOpenId);
}

export function buildProductUpdateValues(input: { priceCents?: number; stock?: number; isActive?: boolean }) {
  const set: Record<string, unknown> = {};
  if (input.priceCents !== undefined) set.priceCents = Math.round(input.priceCents);
  if (input.stock !== undefined) set.stock = Math.max(0, Math.floor(input.stock));
  if (input.isActive !== undefined) set.isActive = input.isActive ? 1 : 0;
  return set;
}

export async function updateProductForOwner(ownerOpenId: string, productId: number, input: { priceCents?: number; stock?: number; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) throw new Error("لا يوجد متجر مرتبط بهذا الحساب بعد.");
  const set = buildProductUpdateValues(input);
  // Deliberately whitelist mutable fields: imageUrl and productMedia are immutable here.
  if (Object.keys(set).length) await db.update(products).set(set).where(and(eq(products.id, productId), eq(products.storeId, owned.id)));
  return listProductsForOwner(ownerOpenId);
}

export async function deleteProductForOwner(ownerOpenId: string, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) throw new Error("لا يوجد متجر مرتبط بهذا الحساب بعد.");
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.storeId, owned.id))).limit(1);
  if (!product) throw new Error("المنتج غير موجود ضمن متجرك.");
  await db.delete(productMedia).where(eq(productMedia.productId, productId));
  await db.delete(productReviews).where(eq(productReviews.productId, productId));
  await db.delete(products).where(and(eq(products.id, productId), eq(products.storeId, owned.id)));
  return listProductsForOwner(ownerOpenId);
}

type OperationScope = "store" | "admin";
type OperationEntity = "products" | "orders" | "audit";
type AuditActorFilter = "all" | ActorRole;

function validateArchiveDates(fromDate: string, toDate: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
  if (!valid(fromDate) || !valid(toDate) || fromDate > toDate) throw new Error("اختر نطاقاً زمنياً صحيحاً للأرشفة.");
  const span = (Date.parse(`${toDate}T23:59:59.999Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86400000;
  if (span > 366) throw new Error("لا يمكن أرشفة أكثر من سنة واحدة في عملية واحدة.");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildCsv(headers: string[], rows: unknown[][]) {
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

async function archiveRows(db: ReturnType<typeof drizzle>, input: { scope: OperationScope; entity: OperationEntity; requestedByOpenId: string; fromDate: string; toDate: string; headers: string[]; rows: unknown[][] }) {
  await ensureOperationArchiveSchema(db);
  const csv = buildCsv(input.headers, input.rows);
  const stored = await storagePut(`hassa/operation-archives/${input.scope}/${input.entity}/${input.fromDate}_${input.toDate}.csv`, Buffer.from(csv, "utf8"), "text/csv;charset=utf-8");
  const inserted = await db.insert(operationArchives).values({ scope: input.scope, entity: input.entity, requestedByOpenId: input.requestedByOpenId, fromDate: input.fromDate, toDate: input.toDate, rowCount: input.rows.length, fileKey: stored.key, fileUrl: stored.url });
  const archiveId = Number((inserted as any)[0]?.insertId);
  const [archive] = await db.select().from(operationArchives).where(eq(operationArchives.id, archiveId)).limit(1);
  return archive ?? null;
}

async function deleteOrderRecords(db: ReturnType<typeof drizzle>, orderIds: number[]) {
  if (!orderIds.length) return;
  const conversations = await db.select({ id: supportConversations.id }).from(supportConversations).where(inArray(supportConversations.orderId, orderIds));
  const conversationIds = conversations.map((conversation) => conversation.id);
  if (conversationIds.length) {
    await db.delete(supportMessages).where(inArray(supportMessages.conversationId, conversationIds));
    await db.delete(supportParticipants).where(inArray(supportParticipants.conversationId, conversationIds));
    await db.delete(supportConversationReads).where(inArray(supportConversationReads.conversationId, conversationIds));
    await db.delete(supportEscalations).where(inArray(supportEscalations.conversationId, conversationIds));
    await db.delete(supportAssignments).where(inArray(supportAssignments.conversationId, conversationIds));
    await db.delete(supportConversations).where(inArray(supportConversations.id, conversationIds));
  }
  await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
  await db.delete(orderMessages).where(inArray(orderMessages.orderId, orderIds));
  await db.delete(activityEvents).where(inArray(activityEvents.orderId, orderIds));
  await db.delete(notifications).where(inArray(notifications.orderId, orderIds));
  await db.delete(courierLocations).where(inArray(courierLocations.orderId, orderIds));
  await db.delete(courierAssignments).where(inArray(courierAssignments.orderId, orderIds));
  await db.delete(orders).where(inArray(orders.id, orderIds));
}

async function deleteProductRecords(db: ReturnType<typeof drizzle>, productIds: number[]) {
  if (!productIds.length) return;
  await db.delete(productMedia).where(inArray(productMedia.productId, productIds));
  await db.delete(productReviews).where(inArray(productReviews.productId, productIds));
  await db.delete(products).where(inArray(products.id, productIds));
}

export async function archiveAndDeleteOperations(input: { scope: OperationScope; entity: OperationEntity; requestedByOpenId: string; fromDate: string; toDate: string }) {
  validateArchiveDates(input.fromDate, input.toDate);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureOperationArchiveSchema(db);
  const start = new Date(`${input.fromDate}T00:00:00.000Z`);
  const end = new Date(`${input.toDate}T23:59:59.999Z`);
  const owned = input.scope === "store" ? await getStoreForOwner(input.requestedByOpenId) : null;
  if (input.scope === "store" && !owned) throw new Error("لا يوجد متجر مرتبط بهذا الحساب بعد.");
  if (input.entity === "products") {
    const where = input.scope === "store" ? and(eq(products.storeId, owned!.id), gte(products.createdAt, start), lte(products.createdAt, end)) : and(gte(products.createdAt, start), lte(products.createdAt, end));
    const selected = await db.select({ product: products, store: stores }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).where(where).orderBy(products.createdAt);
    const archive = await archiveRows(db, { ...input, headers: ["المعرف", "المرجع", "المنتج", "المتجر", "القسم", "السعر بالهللة", "المخزون", "حالة الاعتماد", "نشط", "تاريخ الإنشاء"], rows: selected.map(({ product, store }) => [product.id, product.referenceCode, product.name, store?.name, product.category, product.priceCents, product.stock, product.approvalStatus, product.isActive ? "نعم" : "لا", product.createdAt.toISOString()]) });
    await deleteProductRecords(db, selected.map(({ product }) => product.id));
    await db.insert(activityEvents).values({ actorRole: input.scope === "admin" ? "admin" : "store", eventType: "system_note", title: "أرشفة وحذف منتجات", description: `تم حفظ ${selected.length} منتجاً في أرشيف CSV قبل الحذف.`, metadata: JSON.stringify({ archiveId: archive?.id, scope: input.scope, fromDate: input.fromDate, toDate: input.toDate }) });
    return { archive, deletedCount: selected.length };
  }
  await ensureDeliverySchema(db);
  const where = input.scope === "store" ? and(eq(orders.storeId, owned!.id), gte(orders.createdAt, start), lte(orders.createdAt, end)) : and(gte(orders.createdAt, start), lte(orders.createdAt, end));
  const selected = await db.select({ order: orders, store: stores }).from(orders).leftJoin(stores, eq(orders.storeId, stores.id)).where(where).orderBy(orders.createdAt);
  const rows = await Promise.all(selected.map(async ({ order, store }) => { const items = await db.select({ productName: orderItems.productName, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, order.id)); return [order.id, order.orderNumber, store?.name, order.customerName, order.customerPhone, order.customerAddress, order.status, order.totalCents, order.discountCents, items.map((item) => `${item.productName} × ${item.quantity}`).join(" | "), order.createdAt.toISOString(), order.updatedAt.toISOString()]; }));
  const archive = await archiveRows(db, { ...input, headers: ["المعرف", "رقم الطلب", "المتجر", "العميل", "هاتف العميل", "العنوان", "الحالة", "الإجمالي بالهللة", "الخصم بالهللة", "محتويات الطلب", "تاريخ الإنشاء", "آخر تحديث"], rows });
  await deleteOrderRecords(db, selected.map(({ order }) => order.id));
  await db.insert(activityEvents).values({ actorRole: input.scope === "admin" ? "admin" : "store", eventType: "system_note", title: "أرشفة وحذف طلبات", description: `تم حفظ ${selected.length} طلباً في أرشيف CSV قبل الحذف.`, metadata: JSON.stringify({ archiveId: archive?.id, scope: input.scope, fromDate: input.fromDate, toDate: input.toDate }) });
  return { archive, deletedCount: selected.length };
}

export async function clearOperationArchives(scope: OperationScope, requestedByOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureOperationArchiveSchema(db);
  const where = scope === "admin" ? eq(operationArchives.scope, "admin") : and(eq(operationArchives.scope, "store"), eq(operationArchives.requestedByOpenId, requestedByOpenId));
  const rows = await db.select({ id: operationArchives.id }).from(operationArchives).where(where);
  if (rows.length) await db.delete(operationArchives).where(inArray(operationArchives.id, rows.map((row) => row.id)));
  return { deletedCount: rows.length };
}

export async function deleteOperationArchive(id: number, scope: OperationScope, requestedByOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureOperationArchiveSchema(db);
  const where = scope === "admin" ? and(eq(operationArchives.id, id), eq(operationArchives.scope, "admin")) : and(eq(operationArchives.id, id), eq(operationArchives.scope, "store"), eq(operationArchives.requestedByOpenId, requestedByOpenId));
  const [row] = await db.select({ id: operationArchives.id }).from(operationArchives).where(where).limit(1);
  if (!row) throw new Error("الأرشيف غير موجود أو لا تملك صلاحية حذفه.");
  await db.delete(operationArchives).where(eq(operationArchives.id, id));
  return { success: true as const };
}

export async function listOperationArchives(scope: OperationScope, requestedByOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  await ensureOperationArchiveSchema(db);
  const where = scope === "admin" ? eq(operationArchives.scope, "admin") : and(eq(operationArchives.scope, "store"), eq(operationArchives.requestedByOpenId, requestedByOpenId));
  return db.select().from(operationArchives).where(where).orderBy(desc(operationArchives.createdAt)).limit(100);
}

export async function listProductsForApproval() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ product: productReadColumns, store: storeReadColumns })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(inArray(products.approvalStatus, ["pending_review", "withdrawn"]))
    .orderBy(desc(products.updatedAt), desc(products.submittedAt));
  return rows.map((row) => ({ ...row, product: normalizeProductImage(row.product) }));
}

export async function withdrawProductForOwner(ownerOpenId: string, productId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) throw new Error("لا يوجد متجر مرتبط بهذا الحساب بعد.");
  const [product] = await db.select({ id: products.id, approvalStatus: products.approvalStatus }).from(products).where(and(eq(products.id, productId), eq(products.storeId, owned.id))).limit(1);
  if (!product) throw new Error("المنتج غير موجود ضمن متجرك.");
  if (product.approvalStatus !== "pending_review") throw new Error("لا يمكن حذف طلب المراجعة بعد تغيّر حالته.");
  await db.delete(productMedia).where(eq(productMedia.productId, productId));
  await db.delete(productReviews).where(eq(productReviews.productId, productId));
  await db.delete(products).where(and(eq(products.id, productId), eq(products.storeId, owned.id), eq(products.approvalStatus, "pending_review")));
  return listProductsForOwner(ownerOpenId);
}

export async function listProductsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ product: products, store: stores }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).orderBy(desc(products.createdAt));
}

export async function deleteProductByAdmin(productId: number, reason: string, adminOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) throw new Error("يجب كتابة سبب حذف المنتج.");
  const [row] = await db.select({ product: products, store: stores }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).where(eq(products.id, productId)).limit(1);
  if (!row) throw new Error("المنتج غير موجود.");
  await db.delete(productMedia).where(eq(productMedia.productId, productId));
  await db.delete(productReviews).where(eq(productReviews.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
  await db.insert(activityEvents).values({ actorRole: "admin", eventType: "system_note", title: "حذف منتج", description: `تم حذف المنتج ${row.product.name}. السبب: ${cleanReason}`, metadata: JSON.stringify({ productId, storeId: row.product.storeId, adminOpenId, reason: cleanReason }) });
  await db.insert(notifications).values([
    { storeId: row.product.storeId, audience: "store", title: "تم حذف منتج من متجرك", body: `تم حذف المنتج «${row.product.name}» من هسّا. السبب: ${cleanReason}` },
    { audience: "owner", title: "حذف منتج من الإدارة", body: `تم حذف المنتج «${row.product.name}» من متجر ${row.store?.name || "غير محدد"}. السبب: ${cleanReason}` },
  ]);
  return { success: true as const, productId };
}

export async function listStoreNotifications(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) return [];
  return db.select().from(notifications).where(and(eq(notifications.audience, "store"), eq(notifications.storeId, owned.id))).orderBy(desc(notifications.createdAt)).limit(30);
}

export async function markStoreNotificationsRead(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return;
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) return;
  await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.audience, "store"), eq(notifications.storeId, owned.id)));
}

export async function reviewProductByAdmin(productId: number, approved: boolean, note: string | undefined, adminOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [current] = await db.select({ id: products.id, approvalStatus: products.approvalStatus }).from(products).where(eq(products.id, productId)).limit(1);
  if (!current) throw new Error("المنتج غير موجود.");
  if (current.approvalStatus !== "pending_review") throw new Error("لا يمكن اعتماد هذا الطلب بعد حذفه أو مراجعته.");
  const nextStatus = approved ? "approved" as const : "rejected" as const;
  await db.update(products).set({ approvalStatus: nextStatus, approvalNote: note?.trim() || null, approvedAt: approved ? new Date() : null, approvedByOpenId: adminOpenId, isActive: approved ? 1 : 0 }).where(and(eq(products.id, productId), eq(products.approvalStatus, "pending_review")));
  await db.insert(activityEvents).values({ actorRole: "admin", eventType: "system_note", title: approved ? "اعتماد منتج" : "رفض منتج", description: `تم ${approved ? "اعتماد" : "رفض"} منتج رقم ${productId}.`, metadata: JSON.stringify({ productId, approved, adminOpenId }) });
  return listProductsForApproval();
}

export async function createOrUpdateProductReview(input: { productId: number; customerOpenId: string; customerName: string; rating: number; title?: string; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.isActive, 1), eq(products.approvalStatus, "approved"))).limit(1);
  if (!product) throw new Error("المنتج غير متاح للتقييم.");
  await db.insert(productReviews).values({ productId: input.productId, customerOpenId: input.customerOpenId, customerName: input.customerName.trim(), rating: input.rating, title: input.title?.trim() || null, body: input.body.trim(), status: "published" }).onDuplicateKeyUpdate({ set: { customerName: input.customerName.trim(), rating: input.rating, title: input.title?.trim() || null, body: input.body.trim(), status: "published" } });
  return getPublicProduct(input.productId);
}

export async function setStoreVerificationByAdmin(storeId: number, status: "unverified" | "pending" | "verified" | "rejected", adminOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(stores).set({ verificationStatus: status, verifiedAt: status === "verified" ? new Date() : null, verifiedByOpenId: status === "verified" ? adminOpenId : null }).where(eq(stores.id, storeId));
  return getAdminDirectory();
}

export async function listActiveSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, 1)).orderBy(subscriptionPlans.sortOrder, subscriptionPlans.priceCents);
}

export async function getStoreSubscriptionForOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  const owned = await getStoreForOwner(ownerOpenId);
  if (!owned) return null;
  const [subscription] = await db.select({ subscription: storeSubscriptions, plan: subscriptionPlans }).from(storeSubscriptions).leftJoin(subscriptionPlans, eq(storeSubscriptions.planId, subscriptionPlans.id)).where(eq(storeSubscriptions.storeId, owned.id)).limit(1);
  return { store: owned, subscription: subscription ?? null };
}

export async function upsertSubscriptionPlan(input: { code: string; name: string; description: string; featureSummary?: string; priceCents: number; billingPeriod: "monthly" | "yearly"; trialDays: number; isActive: boolean; sortOrder: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const code = input.code.trim().toLowerCase();
  const [existing] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, code)).limit(1);
  const values = { code, name: input.name.trim(), description: input.description.trim(), featureSummary: input.featureSummary?.trim() || null, priceCents: Math.max(0, Math.round(input.priceCents)), billingPeriod: input.billingPeriod, trialDays: Math.max(0, Math.floor(input.trialDays)), isActive: input.isActive ? 1 : 0, sortOrder: Math.max(0, Math.floor(input.sortOrder)) };
  if (existing) await db.update(subscriptionPlans).set(values).where(eq(subscriptionPlans.id, existing.id)); else await db.insert(subscriptionPlans).values(values);
  return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder, subscriptionPlans.priceCents);
}

export async function assignStoreSubscriptionByAdmin(storeId: number, planId: number | null, status: "none" | "trial" | "active" | "past_due" | "cancelled", trialEndsAt: Date | null, endsAt: Date | null, adminOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(storeSubscriptions).values({ storeId, planId, status, startedAt: status === "none" ? null : new Date(), trialEndsAt, endsAt, updatedByOpenId: adminOpenId }).onDuplicateKeyUpdate({ set: { planId, status, startedAt: status === "none" ? null : new Date(), trialEndsAt, endsAt, updatedByOpenId: adminOpenId } });
  return getStoreSubscriptionForOwner((await db.select().from(stores).where(eq(stores.id, storeId)).limit(1))[0]?.ownerOpenId || "");
}

export async function getAdminDirectory() {
  const db = await getDb();
  if (!db) return { users: [], stores: [] };
  const [directoryUsers, directoryStores, staffRecords] = await Promise.all([
    db.select({ user: users, settings: accountSettings }).from(users).leftJoin(accountSettings, eq(users.openId, accountSettings.userOpenId)).orderBy(desc(users.createdAt)),
    db.select({ store: stores, settings: storeSettings, owner: users }).from(stores).leftJoin(storeSettings, eq(stores.id, storeSettings.storeId)).leftJoin(users, eq(stores.ownerOpenId, users.openId)).orderBy(desc(stores.createdAt)),
    db.select({ userOpenId: staffMembers.userOpenId }).from(staffMembers),
  ]);
  const staffIds = new Set(staffRecords.map((entry) => entry.userOpenId));
  const customerEntries = directoryUsers.filter((entry) => entry.user.role === "user" && !staffIds.has(entry.user.openId));
  const phoneCounts = new Map<string, number>();
  customerEntries.forEach((entry) => { const phone = entry.settings?.phone ? normalizePhone(entry.settings.phone) : ""; if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1); });
  return {
    users: customerEntries.map((entry) => ({
      ...entry,
      user: { ...entry.user, name: entry.user.name ? normalizeMixedDisplayName(entry.user.name) : entry.user.name },
      linkedAccountCount: entry.settings?.phone ? Math.max(0, (phoneCounts.get(normalizePhone(entry.settings.phone)) ?? 1) - 1) : 0,
    })),
    staff: directoryUsers.filter((entry) => entry.user.role === "staff" || staffIds.has(entry.user.openId)).map((entry) => ({
      ...entry,
      user: { ...entry.user, name: entry.user.name ? normalizeMixedDisplayName(entry.user.name) : entry.user.name },
    })),
    stores: directoryStores.map((entry) => ({
      ...entry,
      owner: entry.owner ? { ...entry.owner, name: entry.owner.name ? normalizeMixedDisplayName(entry.owner.name) : entry.owner.name } : entry.owner,
    })),
  };
}

export async function deleteAdminAccount(targetOpenId: string, targetRole: "user" | "staff" | "store", actorOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (targetRole === "staff") await ensureStaffTypeSchema(db);
  const target = await getUserByOpenId(targetOpenId);
  if (!target) return { deleted: false as const, reason: "NOT_FOUND" as const };
  if (target.openId === actorOpenId || target.role === "admin") throw new Error("لا يمكن حذف حساب مدير النظام أو الحساب الحالي.");
  const [staffRecord] = await db.select().from(staffMembers).where(eq(staffMembers.userOpenId, targetOpenId)).limit(1);
  const expectedRole = targetRole === "user" ? "user" : targetRole === "staff" ? "staff" : "store";
  if (targetRole === "staff" ? !staffRecord : target.role !== expectedRole || (targetRole === "user" && staffRecord)) throw new Error("نوع الحساب لا يطابق القسم المختار.");

  if (targetRole === "user") {
    await db.update(orders).set({ customerOpenId: null }).where(eq(orders.customerOpenId, targetOpenId));
    await db.update(supportConversations).set({ customerOpenId: null, customerName: "عميل محذوف", customerContact: null }).where(eq(supportConversations.customerOpenId, targetOpenId));
    await db.delete(accountSettings).where(eq(accountSettings.userOpenId, targetOpenId));
  }
  if (targetRole === "staff") {
    await db.update(supportAssignments).set({ assigneeOpenId: null, assignedAt: null }).where(eq(supportAssignments.assigneeOpenId, targetOpenId));
    await db.update(staffRecoveryRequests).set({ userOpenId: null }).where(eq(staffRecoveryRequests.userOpenId, targetOpenId));
    await db.delete(staffPasswordResets).where(eq(staffPasswordResets.userOpenId, targetOpenId));
    await db.delete(staffMembers).where(eq(staffMembers.userOpenId, targetOpenId));
  }
  if (targetRole === "store") {
    const ownedStores = await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerOpenId, targetOpenId));
    for (const ownedStore of ownedStores) {
      await db.update(products).set({ isActive: 0 }).where(eq(products.storeId, ownedStore.id));
      await db.update(storeSettings).set({ publicProfile: 0, acceptingOrders: 0 }).where(eq(storeSettings.storeId, ownedStore.id));
      await db.update(stores).set({ ownerOpenId: null, name: "متجر محذوف" }).where(eq(stores.id, ownedStore.id));
    }
  }
  await db.delete(users).where(eq(users.openId, targetOpenId));
  await db.insert(activityEvents).values({ actorRole: "admin", eventType: "system_note", title: "تم حذف حساب إداريًا", description: `تم حذف حساب من قسم ${targetRole} بواسطة ${actorOpenId}` });
  return { deleted: true as const, targetRole };
}

export async function setAdminStoreVisibility(storeId: number, publicProfile: boolean) {
  return updateStoreSettings(storeId, { publicProfile });
}

export async function setAdminCustomerVisibility(userOpenId: string, profileVisibility: "private" | "support_only") {
  return updateAccountSettings(userOpenId, { profileVisibility });
}

export async function updateSupportConversationStatus(conversationId: number, status: SupportConversationStatus, actorOpenId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(supportConversations).set({ status }).where(eq(supportConversations.id, conversationId));
  if (status === "closed" && actorOpenId) {
    await db.insert(activityEvents).values({ actorRole: "admin", eventType: "system_note", title: "تم إغلاق محادثة الدعم", description: "أُغلقت محادثة دعم من قبل فريق الدعم." });
  }
  const [conversation] = await db.select().from(supportConversations).where(eq(supportConversations.id, conversationId)).limit(1);
  return conversation ?? null;
}

export async function updateStaffDisplayName(userOpenId: string, _displayName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getStaffMember(userOpenId);
  if (!existing) return null;
  throw new Error("STAFF_DISPLAY_NAME_IMMUTABLE");
}
