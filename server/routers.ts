import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { notifyOwner } from "./_core/notification";
import { publicProcedure, router } from "./_core/trpc";
import {
  addOrderMessage,
  createOrder,
  getAdminDirectory,
  getStoreAnalytics,
  deleteAdminAccount,
  setAdminCustomerVisibility,
  setAdminStoreVisibility,
  updateSupportConversationStatus,
  getAdminSnapshot,
  getOrderByNumber,
  getPublicProduct,
  getOwnerNotifications,
  listCatalog,
  listOrders,
  listOrdersForCustomer,
  listCourierOrders,
  listCourierOrderPool,
  listCourierMembers,
  assignCourierOrder,
  assignCourierOrderFromStore,
  unassignCourierOrder,
  getDeliveryTracking,
  updateCourierLocation,
  stopCourierLocation,
  uploadDeliveryProof,
  updateCourierOrderStatus,
  getCourierPerformance,
  markOwnerNotificationsRead,
  updateCustomerDetails,
  updateOrderStatus,
  createSupportConversation,
  getSupportConversation,
  listSupportConversations,
  markSupportConversationRead,
  escalateSupportConversation,
  sendSupportMessage,
  getDeliverySupportThread,
  listDeliverySupportThreads,
  startDeliverySupportMessage,
  sendDeliverySupportMessage,
  createEmailUser,
  getUserByEmail,
  getUserByOpenId,
  setEmailVerificationToken,
  verifyEmailUser,
  getAccountSettings,
  updateAccountSettings,
  getStoreSettings,
  updateStoreSettings,
  listSupportQueue,
  listStaffMembers,
  listStaffInvitations,
  getStaffMember,
  promoteStaffMember,
  getCurrentStaffShift,
  listStaffShiftHistory,
  startStaffShift,
  endStaffShift,
  setStaffAvailability,
  setStaffStatus,
  updateStaffDisplayName,
  assignSupportConversation,
  autoAssignSupportConversation,
  listStaffSupportInbox,
  getStaffSupportStats,
  transferSupportConversation,
  closeAssignedSupportConversation,
  finishSupportConversation,
  deleteSupportConversation,
  getSupportViewTarget,
  lookupCustomerForSupport,
  updateCustomerSupportFields,
  getStoreForOwner,
  createStoreForOwner,
  updateUserPassword,
  createStaffPasswordReset,
  consumeStaffPasswordReset,
  requestStaffPasswordRecovery,
  listStaffRecoveryRequests,
  resolveStaffRecoveryRequest,
  createStaffInvitation,
  listProductsForOwner,
  archiveAndDeleteOperations,
  listOperationArchives,
  clearOperationArchives,
  deleteOperationArchive,
  archiveAdminAuditLog,
  deleteAdminAuditLog,
  listProductsForAdmin,
  deleteProductByAdmin,
  listStoreNotifications,
  markStoreNotificationsRead,
  createProductForOwner,
  updateProductForOwner,
  deleteProductForOwner,
  withdrawProductForOwner,
  listProductsForApproval,
  reviewProductByAdmin,
  createOrUpdateProductReview,
  setStoreVerificationByAdmin,
  listActiveSubscriptionPlans,
  getStoreSubscriptionForOwner,
  upsertSubscriptionPlan,
  assignStoreSubscriptionByAdmin,
  acceptStaffInvitation,
  listAdminAuditEvents,
} from "./db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { PRODUCT_CATEGORIES } from "@shared/catalog";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { createVerificationToken, hashToken, hashPassword, verifyPassword } from "./auth";
import { buildVerificationEmail, sendEmail } from "./email";
import { systemRouter } from "./_core/systemRouter";
import { getAdminEmail } from "./_core/env";
import { storagePut } from "./storage";

const orderStatus = z.enum(["new", "confirmed", "ready", "out_for_delivery", "in_transit", "delivered", "cancelled"]);
const accountRole = z.enum(["customer", "store", "admin", "staff", "courier", "delivery-support"]);
const mediaUrlInput = z.string().trim().max(1000).refine((value) => value.startsWith("/api/storage/") || /^https?:\/\//i.test(value), "رابط الوسائط غير صالح.");
const productMediaInput = z.array(z.object({ mediaType: z.enum(["image", "video"]), url: mediaUrlInput, storageKey: z.string().trim().max(500).optional(), altText: z.string().trim().max(200).optional() })).refine((items) => items.filter((item) => item.mediaType === "video").length <= 3, "يمكن إضافة ثلاثة فيديوهات كحد أقصى لكل منتج.");
const productCategory = z.string().trim().transform((value) => value === "منزل" ? "المنزل" : value).pipe(z.enum(PRODUCT_CATEGORIES));

type AuthContext = { req: any; res: any };

async function setEmailSession(ctx: AuthContext, user: { openId: string; name: string | null }) {
  const token = await sdk.createSessionToken(user.openId, { name: user.name || "هسّا", expiresInMs: ONE_YEAR_MS });
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
}

function publicOrigin(req: any) {
  const forwardedProto = Array.isArray(req.headers["x-forwarded-proto"]) ? req.headers["x-forwarded-proto"][0] : req.headers["x-forwarded-proto"];
  const proto = forwardedProto || req.protocol || "https";
  const forwardedHost = Array.isArray(req.headers["x-forwarded-host"]) ? req.headers["x-forwarded-host"][0] : req.headers["x-forwarded-host"];
  return `${proto}://${forwardedHost || req.get("host")}`;
}

function enforceRole(ctx: { user?: { role: string } | null }, requested: "customer" | "store" | "admin") {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول للوصول إلى هذا القسم." });
  const allowed = requested === "admin" ? ctx.user.role === "admin" : requested === "store" ? ctx.user.role === "store" : ctx.user.role === "user";
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب لا يملك صلاحية هذا القسم." });
}

function enforceSupportAgent(ctx: { user?: { role: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول للوصول للدعم." });
  if (ctx.user.role !== "admin" && ctx.user.role !== "staff") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية مخصصة لفريق الدعم." });
}
async function enforceCustomerSupportAgent(ctx: { user?: { role: string; openId: string } | null }) {
  enforceSupportAgent(ctx);
  if (ctx.user!.role === "admin") return;
  const member = await getStaffMember(ctx.user!.openId);
  if (!member || member.staff.staffType !== "support" || member.staff.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "هذه المساحة مخصصة لموظفي خدمة العملاء." });
}

async function enforceCourier(ctx: { user?: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول للوصول إلى مساحة المندوب." });
  if (ctx.user.role !== "staff") throw new TRPCError({ code: "FORBIDDEN", message: "هذه المساحة مخصصة للمندوبين فقط." });
  const member = await getStaffMember(ctx.user.openId);
  if (!member || member.staff.staffType !== "courier" || member.staff.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "حسابك ليس حساب مندوب نشطًا." });
}

async function enforceDeliverySupport(ctx: { user?: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول للوصول إلى دعم التوصيل." });
  if (ctx.user.role !== "staff") throw new TRPCError({ code: "FORBIDDEN", message: "هذه المساحة مخصصة لموظفي دعم التوصيل." });
  const member = await getStaffMember(ctx.user.openId);
  if (!member || member.staff.staffType !== "delivery_support" || member.staff.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "حسابك ليس حساب دعم توصيل نشطًا." });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => { if (!ctx.user) return null; const staff = ctx.user.role === "staff" ? await getStaffMember(ctx.user.openId) : null; const displayEmail = ctx.user.email ? ctx.user.email.replace(/إلى|الى/g, "to") : ctx.user.email; return { openId: ctx.user.openId, name: ctx.user.name, email: displayEmail, role: ctx.user.role, ...(staff ? { staffType: staff.staff.staffType } : {}), isEmailVerified: Boolean(ctx.user.emailVerifiedAt) }; }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({ name: z.string().trim().min(2).max(160), email: z.string().email().max(320), password: z.string().min(8).max(128), role: accountRole }))
      .mutation(async ({ input, ctx }) => {
        const email = input.email.trim().toLowerCase();
        if (input.role === "staff" || input.role === "courier" || input.role === "delivery-support") throw new TRPCError({ code: "FORBIDDEN", message: "حسابات الفريق تُضاف من لوحة الأدمن عبر دعوة آمنة." });
        if (input.role === "admin" && email !== getAdminEmail()) throw new TRPCError({ code: "FORBIDDEN", message: "هذا البريد غير مصرح له بإدارة النظام." });
        if (input.role !== "admin" && email === getAdminEmail()) throw new TRPCError({ code: "FORBIDDEN", message: "هذا البريد محجوز لمدير النظام." });
        const verificationRequired = input.role === "admin" || process.env.REQUIRE_EMAIL_VERIFICATION === "true";
        if (verificationRequired && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "إرسال التحقق غير مفعّل بعد. أضف دومينًا ومرسلًا موثقًا أو عطّل التحقق المؤقتًا للعملاء والتجار." });
        const verification = verificationRequired ? createVerificationToken() : null;
        let user;
        try {
          user = await createEmailUser({ email, name: input.name, role: input.role === "customer" ? "user" : input.role === "store" ? "store" : "admin", passwordHash: await hashPassword(input.password), ...(verification ? { verificationTokenHash: verification.tokenHash, verificationExpiresAt: verification.expiresAt } : {}) });
        } catch (error) {
          if (error instanceof Error && error.message === "EMAIL_IN_USE") throw new TRPCError({ code: "CONFLICT", message: "هذا البريد مستخدم مسبقًا." });
          throw error;
        }
        if (!user?.email) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء الحساب." });
        if (verification) {
          const verificationEmail = buildVerificationEmail({ name: user.name || input.name, verificationUrl: `${publicOrigin(ctx.req)}/api/auth/verify?email=${encodeURIComponent(user.email)}&token=${verification.token}` });
          await sendEmail({ to: user.email, ...verificationEmail });
          return { requiresVerification: true, verificationDeferred: false, email: user.email } as const;
        }
        await setEmailSession(ctx, user);
        return { requiresVerification: false, verificationDeferred: true, email: user.email } as const;
      }),
    verify: publicProcedure
      .input(z.object({ email: z.string().email(), token: z.string().min(20).max(100) }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyEmailUser(input.email, hashToken(input.token));
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "رابط التأكيد غير صالح أو منتهي." });
        await setEmailSession(ctx, user);
        return { success: true, role: user.role, email: user.email } as const;
      }),
    resendVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "إرسال البريد غير مفعّل بعد. أضف عنوان مرسل موثق أولًا." });
        const user = await getUserByEmail(input.email);
        if (!user || user.emailVerifiedAt) return { accepted: true } as const;
        const verification = createVerificationToken();
        await setEmailVerificationToken(input.email, verification.tokenHash, verification.expiresAt);
        const verificationEmail = buildVerificationEmail({ name: user.name || "صديق هسّا", verificationUrl: `${publicOrigin(ctx.req)}/api/auth/verify?email=${encodeURIComponent(input.email)}&token=${verification.token}` });
        await sendEmail({ to: input.email.trim().toLowerCase(), ...verificationEmail });
        return { accepted: true } as const;
      }),
    changePassword: publicProcedure.input(z.object({ currentPassword: z.string().min(8).max(128), newPassword: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لتغيير كلمة المرور." });
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة المرور الحالية غير صحيحة." });
      if (input.currentPassword === input.newPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر كلمة مرور جديدة مختلفة." });
      await updateUserPassword(ctx.user.openId, await hashPassword(input.newPassword));
      return { success: true } as const;
    }),
    acceptStaff: publicProcedure.input(z.object({ token: z.string().min(20).max(200), name: z.string().trim().min(2).max(32).refine((value) => value.split(/\s+/).length <= 2, "اكتب اسم عرض من مقطع أو مقطعين فقط."), password: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const openId = `staff_${createVerificationToken().token.slice(0, 24)}`;
      try {
        const user = await acceptStaffInvitation(hashToken(input.token), openId, input.name, await hashPassword(input.password));
        if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "الدعوة غير صالحة أو منتهية." });
        const teamMember = await getStaffMember(user.openId);
        await setEmailSession(ctx, user);
        return { accepted: true, staffType: teamMember?.staff.staffType ?? "support" } as const;
      } catch (error) {
        if (error instanceof Error && error.message === "STAFF_DISPLAY_NAME_IN_USE") throw new TRPCError({ code: "CONFLICT", message: "اسم العرض مستخدم من موظف آخر. اختر اسمًا قصيرًا مختلفًا." });
        if (error instanceof Error && error.message === "STAFF_DISPLAY_NAME_INVALID") throw new TRPCError({ code: "BAD_REQUEST", message: "اسم العرض يجب أن يكون من مقطع أو مقطعين وبحد أقصى 32 حرفًا." });
        throw error;
      }
    }),
    resetStaffPassword: publicProcedure.input(z.object({ token: z.string().min(20).max(200), newPassword: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const user = await consumeStaffPasswordReset(hashToken(input.token), await hashPassword(input.newPassword));
      if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "رابط الاستعادة غير صالح أو منتهي أو استُخدم سابقًا." });
      await setEmailSession(ctx, user);
      return { success: true, role: user.role } as const;
    }),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(8).max(128), role: accountRole }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);
        const expectedRole = input.role === "customer" ? "user" : ["courier", "delivery-support"].includes(input.role) ? "staff" : input.role;
        const teamMember = user?.role === "staff" ? await getStaffMember(user.openId) : null;
        const teamRoleMatches = input.role === "courier"
          ? teamMember?.staff.staffType === "courier" && teamMember.staff.status === "active"
          : input.role === "delivery-support"
            ? teamMember?.staff.staffType === "delivery_support" && teamMember.staff.status === "active"
            : input.role === "staff"
              ? teamMember?.staff.staffType === "support" && teamMember.staff.status === "active"
              : true;
        if (!user || user.role !== expectedRole || !teamRoleMatches || (input.role === "admin" && (!user.email || user.email.trim().toLowerCase() !== getAdminEmail()))) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد أو كلمة المرور غير صحيحة." });
        if (!user.emailVerifiedAt && (user.role === "admin" || process.env.REQUIRE_EMAIL_VERIFICATION === "true")) throw new TRPCError({ code: "FORBIDDEN", message: "أكد بريدك الإلكتروني أولًا قبل الدخول." });
        if (!user.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد أو كلمة المرور غير صحيحة." });
        await setEmailSession(ctx, user);
        return { success: true, role: user.role, email: user.email, staffType: teamMember?.staff.staffType ?? null } as const;
      }),
  }),

  catalog: router({
    list: publicProcedure.query(() => listCatalog()),
    get: publicProcedure.input(z.object({ productId: z.number().int().positive() })).query(({ input }) => getPublicProduct(input.productId)),
  }),

  reviews: router({
    submit: publicProcedure.input(z.object({ productId: z.number().int().positive(), rating: z.number().int().min(1).max(5), title: z.string().trim().max(160).optional(), body: z.string().trim().min(3).max(2000) })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "customer");
      return createOrUpdateProductReview({ ...input, customerOpenId: ctx.user!.openId, customerName: ctx.user!.name?.trim() || "عميل هسّا" });
    }),
  }),

  subscriptions: router({
    activePlans: publicProcedure.query(() => listActiveSubscriptionPlans()),
  }),

  orders: router({
    list: publicProcedure
      .input(z.object({ status: orderStatus.optional() }).optional())
      .query(({ input, ctx }) => {
        enforceRole(ctx, "store");
        return listOrders(input?.status, ctx.user!.openId);
      }),
    mine: publicProcedure.query(({ ctx }) => {
      enforceRole(ctx, "customer");
      return listOrdersForCustomer(ctx.user!.openId);
    }),
    get: publicProcedure
      .input(z.object({ orderNumber: z.string().min(3).max(40) }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لعرض تفاصيل الطلب." });
        if (ctx.user.role === "user") return getOrderByNumber(input.orderNumber, { role: "customer", openId: ctx.user.openId });
        if (ctx.user.role === "store") return getOrderByNumber(input.orderNumber, { role: "store", openId: ctx.user.openId });
        if (ctx.user.role === "admin") return getOrderByNumber(input.orderNumber, { role: "admin", openId: ctx.user.openId });
        if (ctx.user.role === "staff") {
          const member = await getStaffMember(ctx.user.openId);
          if (member?.staff.staffType === "courier") return getOrderByNumber(input.orderNumber, { role: "staff", openId: ctx.user.openId });
          return getOrderByNumber(input.orderNumber, { role: "admin", openId: ctx.user.openId });
        }
        throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب لا يملك صلاحية عرض الطلب." });
      }),
    create: publicProcedure
      .input(z.object({
        storeId: z.number().int().positive(),
        customerName: z.string().trim().min(2).max(160),
        customerPhone: z.string().trim().min(7).max(40),
        customerAddress: z.string().trim().min(5).max(300),
        customerNote: z.string().trim().max(1000).optional(),
        items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const order = await createOrder({ ...input, customerOpenId: ctx.user?.role === "user" ? ctx.user.openId : undefined });
        if (order) {
          try {
            await notifyOwner({
              title: `طلب جديد ${order.order.orderNumber}`,
              content: `${order.order.customerName} أنشأ طلبًا بقيمة ${(order.order.totalCents / 100).toFixed(2)} د.أ من ${order.store?.name ?? "المتجر"}.`,
            });
          } catch (error) {
            console.warn("[Order] Owner notification failed:", error);
          }
        }
        return order;
      }),
    updateCustomer: publicProcedure
      .input(z.object({
        orderNumber: z.string().min(3).max(40),
        customerName: z.string().trim().min(2).max(160),
        customerPhone: z.string().trim().min(7).max(40),
        customerAddress: z.string().trim().min(5).max(300),
        customerNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        enforceRole(ctx, "customer");
        const ownedOrder = await getOrderByNumber(input.orderNumber, { role: "customer", openId: ctx.user!.openId });
        if (!ownedOrder) throw new TRPCError({ code: "NOT_FOUND", message: "لم نجد هذا الطلب ضمن حسابك." });
        return updateCustomerDetails(input.orderNumber, input);
      }),
    couriers: publicProcedure.query(({ ctx }) => { if (!ctx.user || (ctx.user.role !== "store" && ctx.user.role !== "admin")) throw new TRPCError({ code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED", message: "هذه البيانات مخصصة للمتجر والإدارة." }); return listCourierMembers(); }),
    assignCourierFromStore: publicProcedure.input(z.object({ orderId: z.number().int().positive(), courierOpenId: z.string().min(3).max(128) })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return assignCourierOrderFromStore(input.orderId, input.courierOpenId, ctx.user!.openId, ctx.user!.openId); }),
    updateStatus: publicProcedure
      .input(z.object({ orderNumber: z.string().min(3).max(40), status: orderStatus, actorRole: z.enum(["store", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        enforceRole(ctx, input.actorRole);
        const visibleOrder = await getOrderByNumber(input.orderNumber, { role: input.actorRole, openId: ctx.user!.openId });
        if (!visibleOrder) throw new TRPCError({ code: "NOT_FOUND", message: "هذا الطلب غير متاح لهذا الحساب." });
        const order = await updateOrderStatus(input.orderNumber, input.status, input.actorRole);
        if (order && ["confirmed", "ready", "out_for_delivery", "in_transit", "delivered", "cancelled"].includes(input.status)) {
          try {
            await notifyOwner({
              title: `تحديث ${order.order.orderNumber}`,
              content: `تم تغيير حالة الطلب إلى ${input.status} بواسطة ${input.actorRole === "store" ? "المتجر" : "الأدمن"}.`,
            });
          } catch (error) {
            console.warn("[Order] Owner status notification failed:", error);
          }
        }
        return order;
      }),
    sendMessage: publicProcedure
      .input(z.object({
        orderNumber: z.string().min(3).max(40),
        senderRole: z.enum(["customer", "store", "admin"]),
        senderName: z.string().trim().min(2).max(120),
        body: z.string().trim().min(2).max(2000),
        isChangeRequest: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        enforceRole(ctx, input.senderRole);
        const visibleOrder = await getOrderByNumber(input.orderNumber, { role: input.senderRole === "customer" ? "customer" : input.senderRole, openId: ctx.user!.openId });
        if (!visibleOrder) throw new TRPCError({ code: "NOT_FOUND", message: "هذا الطلب غير متاح لهذا الحساب." });
        return addOrderMessage(input.orderNumber, input);
      }),
    deliverySupportThread: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40) })).query(async ({ input, ctx }) => {
      enforceRole(ctx, "customer");
      return getDeliverySupportThread(input.orderNumber, { role: "customer", openId: ctx.user!.openId });
    }),
    deliverySupportSend: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), body: z.string().trim().min(2).max(2000) })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "customer");
      return startDeliverySupportMessage({ ...input, customerOpenId: ctx.user!.openId });
    }),
  }),

  courier: router({
    overview: publicProcedure.query(async ({ ctx }) => {
      await enforceCourier(ctx);
      const rows = await listCourierOrders(ctx.user!.openId);
      const active = rows.filter(({ order }) => ["confirmed", "ready", "out_for_delivery", "in_transit"].includes(order.status)).length;
      const delivered = rows.filter(({ order }) => order.status === "delivered").length;
      const items = rows.reduce((total, row) => total + row.items.reduce((sum, item) => sum + item.quantity, 0), 0);
      return { orders: rows, metrics: { active, delivered, items, total: rows.length } };
    }),
    activity: publicProcedure.query(async ({ ctx }) => { await enforceCourier(ctx); const member = await getStaffMember(ctx.user!.openId); return { availability: member?.staff.availability ?? "unavailable" } as const; }),
    setActivity: publicProcedure.input(z.object({ availability: z.enum(["available", "busy", "unavailable"]) })).mutation(async ({ input, ctx }) => { await enforceCourier(ctx); return setStaffAvailability(ctx.user!.openId, input.availability); }),
    tracking: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40) })).query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لمتابعة موقع المندوب." });
      const viewer = ctx.user.role === "user" ? { role: "customer" as const, openId: ctx.user.openId } : ctx.user.role === "store" ? { role: "store" as const, openId: ctx.user.openId } : ctx.user.role === "admin" ? { role: "admin" as const, openId: ctx.user.openId } : ctx.user.role === "staff" ? { role: "staff" as const, openId: ctx.user.openId } : null;
      if (!viewer) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب لا يملك صلاحية التتبع." });
      if (ctx.user.role === "staff") {
        const member = await getStaffMember(ctx.user.openId);
        if (member?.staff.staffType === "courier") return getDeliveryTracking(input.orderNumber, viewer);
        return getDeliveryTracking(input.orderNumber, { role: "admin", openId: ctx.user.openId });
      }
      return getDeliveryTracking(input.orderNumber, viewer);
    }),
    updateLocation: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().min(0).max(10000).optional(), heading: z.number().min(0).max(360).optional(), speedKph: z.number().min(0).max(300).optional() })).mutation(async ({ input, ctx }) => { await enforceCourier(ctx); return updateCourierLocation(ctx.user!.openId, input); }),
    stopLocation: publicProcedure.mutation(async ({ ctx }) => { await enforceCourier(ctx); await stopCourierLocation(ctx.user!.openId); return { success: true } as const; }),
    updateStatus: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), status: z.enum(["in_transit", "delivered"]) })).mutation(async ({ input, ctx }) => { await enforceCourier(ctx); return updateCourierOrderStatus(input.orderNumber, input.status, ctx.user!.openId); }),
    uploadProof: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), fileName: z.string().trim().min(1).max(200), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(100).max(12000000) })).mutation(async ({ input, ctx }) => { await enforceCourier(ctx); return uploadDeliveryProof(ctx.user!.openId, input); }),
    deliveryStaffThread: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40) })).query(async ({ input, ctx }) => { await enforceDeliverySupport(ctx); return getDeliverySupportThread(input.orderNumber, { role: "delivery_support", openId: ctx.user!.openId }); }),
    deliveryStaffList: publicProcedure.query(async ({ ctx }) => { await enforceDeliverySupport(ctx); return listDeliverySupportThreads({ role: "delivery_support", openId: ctx.user!.openId }); }),
    deliveryStaffSend: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), senderName: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000) })).mutation(async ({ input, ctx }) => { await enforceDeliverySupport(ctx); return sendDeliverySupportMessage({ ...input, senderRole: "delivery_support", openId: ctx.user!.openId }); }),
    supportThread: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40) })).query(async ({ input, ctx }) => { await enforceCourier(ctx); return getDeliverySupportThread(input.orderNumber, { role: "staff", openId: ctx.user!.openId }); }),
    supportList: publicProcedure.query(async ({ ctx }) => { await enforceCourier(ctx); return listDeliverySupportThreads({ role: "staff", openId: ctx.user!.openId }); }),
    supportSend: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), senderName: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000) })).mutation(async ({ input, ctx }) => { await enforceCourier(ctx); return sendDeliverySupportMessage({ ...input, senderRole: "courier", openId: ctx.user!.openId }); }),
  }),

  support: router({
    list: publicProcedure
      .input(z.object({ viewerRole: z.enum(["customer", "store", "admin"]), staffInbox: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        if (input.viewerRole === "admin") await enforceCustomerSupportAgent(ctx); else enforceRole(ctx, input.viewerRole);
        if (input.staffInbox && ctx.user?.role === "staff") return listStaffSupportInbox(ctx.user.openId);
        const viewerOpenId = ctx.user?.role === "user" || ctx.user?.role === "store" ? ctx.user.openId : undefined;
        return listSupportConversations(input.viewerRole, viewerOpenId);
      }),
    staffDirectory: publicProcedure.query(({ ctx }) => { enforceSupportAgent(ctx); return listStaffMembers(); }),
    availability: publicProcedure.query(async () => {
      const supportMembers = (await listStaffMembers()).filter(({ staff }) => staff.staffType === "support" && staff.status === "active");
      const availability = supportMembers.some(({ staff }) => staff.availability === "available") ? "available" : supportMembers.some(({ staff }) => staff.availability === "busy") ? "busy" : "unavailable";
      return { availability } as const;
    }),
    transfer: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive(), assigneeOpenId: z.string().min(3).max(128) }))
      .mutation(async ({ input, ctx }) => { await enforceCustomerSupportAgent(ctx); const actorRole = ctx.user!.role === "staff" ? "staff" : "admin"; return transferSupportConversation(input.conversationId, input.assigneeOpenId, ctx.user!.openId, actorRole); }),
    close: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لإنهاء المحادثة." });
        if (ctx.user.role === "staff") return closeAssignedSupportConversation(input.conversationId, ctx.user.openId);
        if (ctx.user.role === "user") return finishSupportConversation(input.conversationId, ctx.user.openId, "customer");
        if (ctx.user.role === "store") return finishSupportConversation(input.conversationId, ctx.user.openId, "store");
        enforceSupportAgent(ctx);
        return finishSupportConversation(input.conversationId, ctx.user.openId, "admin");
      }),
    get: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive(), viewerRole: z.enum(["customer", "store", "admin"]) }))
      .query(async ({ input, ctx }) => {
        if (input.viewerRole === "admin") await enforceCustomerSupportAgent(ctx); else enforceRole(ctx, input.viewerRole);
        const viewerOpenId = ctx.user?.role === "user" || ctx.user?.role === "store" ? ctx.user.openId : undefined;
        return getSupportConversation(input.conversationId, input.viewerRole, viewerOpenId);
      }),
    create: publicProcedure
      .input(z.object({ orderId: z.number().int().positive().optional(), orderNumber: z.string().trim().max(40).refine((value) => !(/[A-Za-z]/.test(value) && /[\u0600-\u06FF]/.test(value)), "رقم الطلب يجب أن يستخدم أحرفًا عربية أو إنجليزية فقط، ولا يخلط بينهما.").optional(), storeId: z.number().int().positive().optional(), customerName: z.string().trim().min(2).max(160), customerContact: z.string().trim().max(120).optional(), subject: z.string().trim().min(3).max(200), initialMessage: z.string().trim().min(2).max(2000) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role === "user") return createSupportConversation({ ...input, customerOpenId: ctx.user.openId, channel: "customer_support" });
        if (ctx.user?.role === "store") {
          const ownedStore = await getStoreForOwner(ctx.user.openId);
          if (!ownedStore) throw new TRPCError({ code: "NOT_FOUND", message: "أنشئ ملف المتجر أولاً لفتح تذكرة دعم." });
          return createSupportConversation({ ...input, storeId: ownedStore.id, customerOpenId: undefined, customerName: ownedStore.name, customerContact: ctx.user.email || undefined, channel: "merchant_support" });
        }
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه المساحة غير متاحة لهذا الحساب." });
      }),
    upload: publicProcedure
      .input(z.object({ fileName: z.string().trim().min(1).max(180), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4"]), data: z.string().min(100).max(16000000) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || !["user", "store", "admin", "staff"].includes(ctx.user.role)) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لإرسال مرفق." });
        const raw = input.data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) throw new TRPCError({ code: "BAD_REQUEST", message: "الملف غير صالح." });
        const buffer = Buffer.from(raw, "base64");
        if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم المرفق يجب ألا يتجاوز 12 ميغابايت." });
        const extension = input.contentType.split("/")[1]?.replace("mpeg", "mp3") || "bin";
        try { return await storagePut(`hassa/support/${ctx.user.openId}/${crypto.randomUUID()}.${extension}`, buffer, input.contentType); }
        catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ المرفق الآن. حاول مرة أخرى." }); }
      }),
    send: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive(), senderRole: z.enum(["customer", "store", "admin"]), senderName: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000) }))
      .mutation(async ({ input, ctx }) => {
        if (input.senderRole === "admin") await enforceCustomerSupportAgent(ctx); else enforceRole(ctx, input.senderRole);
        return sendSupportMessage({ ...input, customerOpenId: ctx.user?.role === "user" ? ctx.user.openId : undefined, actorOpenId: ctx.user?.role === "store" ? ctx.user.openId : undefined });
      }),
    markRead: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive(), viewerRole: z.enum(["customer", "store", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        if (input.viewerRole === "admin") await enforceCustomerSupportAgent(ctx); else enforceRole(ctx, input.viewerRole);
        const viewerOpenId = ctx.user?.role === "user" || ctx.user?.role === "store" ? ctx.user.openId : undefined;
        return markSupportConversationRead(input.conversationId, input.viewerRole, viewerOpenId);
      }),
    escalate: publicProcedure
      .input(z.object({ conversationId: z.number().int().positive(), note: z.string().trim().min(2).max(1000) }))
      .mutation(({ input, ctx }) => {
        enforceRole(ctx, "admin");
        return escalateSupportConversation({ conversationId: input.conversationId, fromRole: "admin", note: input.note });
      }),
  }),

  settings: router({
    account: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لإدارة إعدادات الحساب." });
      return getAccountSettings(ctx.user.openId);
    }),
    updateAccount: publicProcedure.input(z.object({ phone: z.string().trim().max(40).nullable().optional(), locale: z.string().max(12).optional(), timezone: z.string().max(64).optional(), orderUpdates: z.boolean().optional(), supportNotifications: z.boolean().optional(), marketingNotifications: z.boolean().optional(), profileVisibility: z.enum(["private", "support_only"]).optional() })).mutation(({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول لتعديل إعدادات الحساب." });
      return updateAccountSettings(ctx.user.openId, input);
    }),
    store: publicProcedure.query(async ({ ctx }) => {
      enforceRole(ctx, "store");
      const owned = await getStoreForOwner(ctx.user!.openId);
      return owned ? { store: owned, settings: await getStoreSettings(owned.id) } : null;
    }),
    analytics: publicProcedure.input(z.object({ days: z.number().int().min(7).max(90).optional() }).optional()).query(({ input, ctx }) => {
      enforceRole(ctx, "store");
      return getStoreAnalytics(ctx.user!.openId, input?.days ?? 30);
    }),
    createStore: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(160), handle: z.string().trim().regex(/^[a-z0-9-]+$/).max(80), category: z.string().trim().min(2).max(80), neighborhood: z.string().trim().min(2).max(120), description: z.string().trim().min(10).max(1000) })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return createStoreForOwner(ctx.user!.openId, input); }),
    updateStore: publicProcedure.input(z.object({ contactPhone: z.string().trim().max(40).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), openingHours: z.string().trim().max(2000).nullable().optional(), acceptingOrders: z.boolean().optional(), orderNotifications: z.boolean().optional(), supportNotifications: z.boolean().optional(), publicProfile: z.boolean().optional(), teamAccess: z.enum(["owner_only", "support_team"]).optional(), automaticCourierAssignment: z.boolean().optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "store");
      const owned = await getStoreForOwner(ctx.user!.openId);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد متجر مرتبط بهذا الحساب بعد." });
      return updateStoreSettings(owned.id, input);
    }),
    products: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "store"); return listProductsForOwner(ctx.user!.openId); }),
    uploadImage: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(180), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]), data: z.string().min(100).max(12000000) })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "store");
      const raw = input.data.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) throw new TRPCError({ code: "BAD_REQUEST", message: "ملف الصورة غير صالح. اختر الصورة من جهازك وحاول مرة أخرى." });
      const buffer = Buffer.from(raw, "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم الصورة يجب ألا يتجاوز 8 ميغابايت." });
      const extension = input.contentType.split("/")[1] === "jpeg" ? "jpg" : input.contentType.split("/")[1];
      try {
        return await storagePut(`hassa/stores/${ctx.user!.openId}/products/${crypto.randomUUID()}.${extension}`, buffer, input.contentType);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ الصورة الآن. حاول مرة أخرى بعد لحظات." });
      }
    }),
    createProduct: publicProcedure.input(z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(2000), category: productCategory, priceCents: z.number().int().nonnegative().max(100000000), imageUrl: mediaUrlInput, imageStorageKey: z.string().trim().max(500).optional(), stock: z.number().int().nonnegative().max(1000000), badge: z.string().trim().max(80).nullable().optional(), media: productMediaInput.optional() })).mutation(async ({ input, ctx }) => { enforceRole(ctx, "store"); const owned = await getStoreForOwner(ctx.user!.openId); if (!owned) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "أنشئ ملف متجرك أولًا من إعدادات المتجر قبل إرسال المنتجات للموافقة." }); return createProductForOwner(ctx.user!.openId, input); }),
    updateProduct: publicProcedure.input(z.object({ productId: z.number().int().positive(), priceCents: z.number().int().nonnegative().max(100000000).optional(), stock: z.number().int().nonnegative().max(1000000).optional(), isActive: z.boolean().optional() })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return updateProductForOwner(ctx.user!.openId, input.productId, input); }),
    deleteProduct: publicProcedure.input(z.object({ productId: z.number().int().positive() })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return deleteProductForOwner(ctx.user!.openId, input.productId); }),
    operationArchives: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "store"); return listOperationArchives("store", ctx.user!.openId); }),
    clearOperationArchives: publicProcedure.mutation(({ ctx }) => { enforceRole(ctx, "store"); return clearOperationArchives("store", ctx.user!.openId); }),
    deleteOperationArchive: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return deleteOperationArchive(input.id, "store", ctx.user!.openId); }),
    archiveAndDelete: publicProcedure.input(z.object({ entity: z.enum(["products", "orders"]), fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return archiveAndDeleteOperations({ ...input, scope: "store", requestedByOpenId: ctx.user!.openId }); }),
    withdrawProduct: publicProcedure.input(z.object({ productId: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) })).mutation(({ input, ctx }) => { enforceRole(ctx, "store"); return withdrawProductForOwner(ctx.user!.openId, input.productId, input.reason); }),
    subscription: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "store"); return getStoreSubscriptionForOwner(ctx.user!.openId); }),
    notifications: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "store"); return listStoreNotifications(ctx.user!.openId); }),
    markNotificationsRead: publicProcedure.mutation(async ({ ctx }) => { enforceRole(ctx, "store"); await markStoreNotificationsRead(ctx.user!.openId); return { success: true as const }; }),
  }),

  admin: router({
    inviteStaff: publicProcedure.input(z.object({ email: z.string().email(), staffType: z.enum(["support", "courier", "delivery_support"]).default("support") })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "admin");
      const token = createVerificationToken();
      const tokenHash = hashToken(token.token);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await createStaffInvitation({ email: input.email, staffType: input.staffType, invitedByOpenId: ctx.user!.openId, tokenHash, expiresAt });
      const inviteUrl = `${publicOrigin(ctx.req)}/staff/accept?token=${encodeURIComponent(token.token)}`;
      const canSendEmail = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
      if (canSendEmail) {
        const teamLabel = input.staffType === "courier" ? "فريق التوصيل" : input.staffType === "delivery_support" ? "دعم المناديب" : "فريق الدعم";
        await sendEmail({ to: input.email.toLowerCase(), subject: `دعوة للانضمام إلى ${teamLabel} هسّا`, html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#241d17"><h2>دعوة ${teamLabel} هسّا</h2><p>تمت دعوتك للانضمام إلى ${teamLabel}.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#241d17;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">قبول الدعوة</a></p><p style="color:#746960;font-size:12px">ينتهي الرابط خلال 48 ساعة.</p></div>` });
      }
      return { sent: canSendEmail, delivery: canSendEmail ? "email" as const : "manual" as const, inviteUrl, expiresAt } as const;
    }),
    auditLog: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional()).query(({ input, ctx }) => { enforceRole(ctx, "admin"); return listAdminAuditEvents(input?.limit ?? 80); }),
    archiveAuditLog: publicProcedure.input(z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actorRole: z.enum(["customer", "store", "admin", "system"]).optional() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return archiveAdminAuditLog({ ...input, requestedByOpenId: ctx.user!.openId }); }),
    deleteAuditLog: publicProcedure.input(z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actorRole: z.enum(["customer", "store", "admin", "system"]).optional() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return deleteAdminAuditLog({ ...input, requestedByOpenId: ctx.user!.openId }); }),
    snapshot: publicProcedure.query(({ ctx }) => {
      enforceRole(ctx, "admin");
      return getAdminSnapshot();
    }),
    directory: publicProcedure.query(({ ctx }) => {
      enforceRole(ctx, "admin");
      return getAdminDirectory();
    }),
    setStoreVisibility: publicProcedure.input(z.object({ storeId: z.number().int().positive(), publicProfile: z.boolean() })).mutation(({ input, ctx }) => {
      enforceRole(ctx, "admin");
      return setAdminStoreVisibility(input.storeId, input.publicProfile);
    }),
    setStoreVerification: publicProcedure.input(z.object({ storeId: z.number().int().positive(), status: z.enum(["unverified", "pending", "verified", "rejected"]) })).mutation(({ input, ctx }) => {
      enforceRole(ctx, "admin");
      return setStoreVerificationByAdmin(input.storeId, input.status, ctx.user!.openId);
    }),
    pendingProducts: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listProductsForApproval(); }),
    allProducts: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listProductsForAdmin(); }),
    reviewProduct: publicProcedure.input(z.object({ productId: z.number().int().positive(), approved: z.boolean(), note: z.string().trim().max(1000).optional() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return reviewProductByAdmin(input.productId, input.approved, input.note, ctx.user!.openId); }),
    deleteProduct: publicProcedure.input(z.object({ productId: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return deleteProductByAdmin(input.productId, input.reason, ctx.user!.openId); }),
    operationArchives: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listOperationArchives("admin", ctx.user!.openId); }),
    clearOperationArchives: publicProcedure.mutation(({ ctx }) => { enforceRole(ctx, "admin"); return clearOperationArchives("admin", ctx.user!.openId); }),
    deleteOperationArchive: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return deleteOperationArchive(input.id, "admin", ctx.user!.openId); }),
    archiveAndDelete: publicProcedure.input(z.object({ entity: z.enum(["products", "orders"]), fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return archiveAndDeleteOperations({ ...input, scope: "admin", requestedByOpenId: ctx.user!.openId }); }),
    subscriptionPlans: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listActiveSubscriptionPlans(); }),
    saveSubscriptionPlan: publicProcedure.input(z.object({ code: z.string().trim().regex(/^[a-z0-9-]+$/).max(60), name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(2000), featureSummary: z.string().trim().max(5000).optional(), priceCents: z.number().int().nonnegative().max(100000000), billingPeriod: z.enum(["monthly", "yearly"]), trialDays: z.number().int().nonnegative().max(365), isActive: z.boolean(), sortOrder: z.number().int().nonnegative().max(10000) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return upsertSubscriptionPlan(input); }),
    assignStoreSubscription: publicProcedure.input(z.object({ storeId: z.number().int().positive(), planId: z.number().int().positive().nullable(), status: z.enum(["none", "trial", "active", "past_due", "cancelled"]), trialEndsAt: z.date().nullable(), endsAt: z.date().nullable() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return assignStoreSubscriptionByAdmin(input.storeId, input.planId, input.status, input.trialEndsAt, input.endsAt, ctx.user!.openId); }),
    setCustomerVisibility: publicProcedure.input(z.object({ userOpenId: z.string().min(3), profileVisibility: z.enum(["private", "support_only"]) })).mutation(({ input, ctx }) => {
      enforceRole(ctx, "admin");
      return setAdminCustomerVisibility(input.userOpenId, input.profileVisibility);
    }),
    notifications: publicProcedure.query(({ ctx }) => {
      enforceRole(ctx, "admin");
      return getOwnerNotifications();
    }),
    markNotificationsRead: publicProcedure.mutation(async ({ ctx }) => {
      enforceRole(ctx, "admin");
      await markOwnerNotificationsRead();
      return { success: true } as const;
    }),
    queue: publicProcedure.query(async ({ ctx }) => { await enforceCustomerSupportAgent(ctx); return listSupportQueue("customer_support"); }),
    assignQueue: publicProcedure.input(z.object({ conversationId: z.number().int().positive(), assigneeOpenId: z.string().max(128).nullable().optional(), priority: z.enum(["low", "normal", "high", "urgent"]).optional() })).mutation(async ({ input, ctx }) => { await enforceCustomerSupportAgent(ctx); return assignSupportConversation(input.conversationId, input.assigneeOpenId, input.priority ?? "normal"); }),
    resolveSupport: publicProcedure.input(z.object({ conversationId: z.number().int().positive(), status: z.enum(["open", "waiting_store", "waiting_customer", "escalated_store", "closed"]) })).mutation(({ input, ctx }) => {
      enforceRole(ctx, "admin");
      return updateSupportConversationStatus(input.conversationId, input.status, ctx.user!.openId);
    }),
    deleteConversation: publicProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return deleteSupportConversation(input.conversationId, ctx.user!.openId); }),
    autoAssignQueue: publicProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { await enforceCustomerSupportAgent(ctx); return autoAssignSupportConversation(input.conversationId); }),
    staff: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listStaffMembers(); }),
    staffInvitations: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listStaffInvitations(); }),
    staffSupportStats: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return getStaffSupportStats(); }),
    shiftHistory: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listStaffShiftHistory(); }),
    myAvailability: publicProcedure.query(async ({ ctx }) => { enforceSupportAgent(ctx); return { staff: await getStaffMember(ctx.user!.openId), shift: await getCurrentStaffShift(ctx.user!.openId) }; }),
    setAvailability: publicProcedure.input(z.object({ availability: z.enum(["available", "busy", "unavailable"]) })).mutation(({ input, ctx }) => { enforceSupportAgent(ctx); return setStaffAvailability(ctx.user!.openId, input.availability); }),
    startShift: publicProcedure.input(z.object({ availability: z.enum(["available", "busy", "unavailable"]).optional() }).optional()).mutation(({ input, ctx }) => { enforceSupportAgent(ctx); return startStaffShift(ctx.user!.openId, input?.availability ?? "available"); }),
    endShift: publicProcedure.input(z.object({ availability: z.enum(["available", "busy", "unavailable"]).optional() }).optional()).mutation(({ input, ctx }) => { enforceSupportAgent(ctx); return endStaffShift(ctx.user!.openId, input?.availability ?? "unavailable"); }),
    addStaff: publicProcedure.input(z.object({ email: z.string().email() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return promoteStaffMember(input.email); }),
    setStaffStatus: publicProcedure.input(z.object({ userOpenId: z.string().min(3).max(128), status: z.enum(["active", "suspended"]) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return setStaffStatus(input.userOpenId, input.status); }),
    updateStaffDisplayName: publicProcedure.input(z.object({ userOpenId: z.string().min(3).max(128), displayName: z.string().trim().min(2).max(120) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return updateStaffDisplayName(input.userOpenId, input.displayName); }),
    deleteAccount: publicProcedure.input(z.object({ targetOpenId: z.string().trim().min(3).max(128), targetRole: z.enum(["user", "staff", "store"]) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return deleteAdminAccount(input.targetOpenId, input.targetRole, ctx.user!.openId); }),
    recoveryRequests: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listStaffRecoveryRequests(); }),
    resetStaffPassword: publicProcedure.input(z.object({ email: z.string().email(), requestId: z.number().int().positive().optional() })).mutation(async ({ input, ctx }) => {
      enforceRole(ctx, "admin");
      const user = await getUserByEmail(input.email.trim().toLowerCase());
      const staffRecord = user ? await getStaffMember(user.openId) : null;
      if (!user || !staffRecord) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على سجل موظف بهذا البريد. يجب قبول دعوة الموظف أولًا أو إضافته من قائمة الفريق." });
      const token = createVerificationToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await createStaffPasswordReset({ userOpenId: user.openId, createdByOpenId: ctx.user!.openId, tokenHash: hashToken(token.token), expiresAt });
      if (input.requestId) await resolveStaffRecoveryRequest(input.requestId, ctx.user!.openId);
      return { resetUrl: `${publicOrigin(ctx.req)}/staff/reset-password?token=${encodeURIComponent(token.token)}`, expiresAt } as const;
    }),
    supportView: publicProcedure.input(z.object({ targetOpenId: z.string().min(3).max(128), targetRole: z.enum(["user", "store"]), reason: z.string().trim().min(5).max(500) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return getSupportViewTarget(ctx.user!.openId, input.targetOpenId, input.targetRole, input.reason); }),
    lookupCustomer: publicProcedure.input(z.object({ query: z.string().trim().min(3).max(320) })).query(({ input, ctx }) => { enforceSupportAgent(ctx); return lookupCustomerForSupport(ctx.user!.openId, input.query); }),
    updateCustomerSupport: publicProcedure.input(z.object({ userOpenId: z.string().min(3).max(128), phone: z.string().trim().max(40).nullable().optional(), orderUpdates: z.boolean().optional(), supportNotifications: z.boolean().optional() })).mutation(({ input, ctx }) => { enforceSupportAgent(ctx); return updateCustomerSupportFields(ctx.user!.openId, input.userOpenId, input); }),
    courierOrders: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listCourierOrderPool(); }),
    couriers: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listCourierMembers(); }),
    assignCourier: publicProcedure.input(z.object({ orderId: z.number().int().positive(), courierOpenId: z.string().min(3).max(128) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return assignCourierOrder(input.orderId, input.courierOpenId, ctx.user!.openId); }),
    unassignCourier: publicProcedure.input(z.object({ orderId: z.number().int().positive() })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return unassignCourierOrder(input.orderId); }),
    performance: publicProcedure.input(z.object({ filter: z.enum(["today", "yesterday", "custom"]).default("today"), fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional()).query(({ input, ctx }) => { enforceRole(ctx, "admin"); return getCourierPerformance(input); }),
    deliverySupport: publicProcedure.query(({ ctx }) => { enforceRole(ctx, "admin"); return listDeliverySupportThreads({ role: "admin", openId: ctx.user!.openId }); }),
    sendDeliverySupport: publicProcedure.input(z.object({ orderNumber: z.string().min(3).max(40), body: z.string().trim().min(2).max(2000) })).mutation(({ input, ctx }) => { enforceRole(ctx, "admin"); return sendDeliverySupportMessage({ ...input, senderRole: "admin", senderName: "إدارة التوصيل", openId: ctx.user!.openId }); }),
  }),

  staffRecovery: router({
    request: publicProcedure.input(z.object({ email: z.string().email() })).mutation(({ input }) => requestStaffPasswordRecovery(input.email)),
  }),
});

export type AppRouter = typeof appRouter;
