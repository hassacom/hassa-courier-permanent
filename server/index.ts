import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR || path.join(root, "server", "data");
const dataFile = path.join(dataDir, "store.json");
const uploadDir = process.env.UPLOAD_DIR || path.join(dataDir, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || ".bin";
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
    },
  }),
  limits: { files: 6, fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype));
  },
});

type User = {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  role: "customer" | "staff" | "admin" | "merchant" | "rider" | "rider_support";
};
type Store = {
  id: number;
  ownerId?: number | null;
  name: string;
  handle: string;
  category: string;
  neighborhood: string;
  description: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  acceptsOrders?: boolean;
  notificationsEnabled?: boolean;
  notificationSound?: boolean;
  notificationVolume?: number;
  planName?: string;
  offerName?: string;
  latitude?: number | null;
  longitude?: number | null;
};
type Product = {
  id: number;
  storeId: number;
  category: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  images?: string[];
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalNote?: string;
  stock: number;
  active: boolean;
  offerEnabled?: boolean;
  offerLabel?: string;
  offerPriceCents?: number | null;
  offerApprovalStatus?: "pending" | "approved" | "rejected";
  createdAt: string;
};
type Order = {
  id: number;
  orderNumber: string;
  userId: number;
  storeId: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote: string;
  status: string;
  totalCents: number;
  createdAt: string;
  riderId?: number | null;
  items: Array<{
    productId: number;
    productName: string;
    unitPriceCents: number;
    quantity: number;
  }>;
};
type Review = {
  id: number;
  productId: number;
  rating: number;
  body: string;
  authorName: string;
  createdAt: string;
};
type SupportMessage = {
  id: number;
  userId: number | null;
  orderNumber: string | null;
  topic: string;
  body: string;
  senderRole?: "customer" | "staff" | "admin" | "merchant" | "rider";
  senderName?: string;
  createdAt: string;
};
type Database = {
  nextId: number;
  users: User[];
  stores: Store[];
  categories: string[];
  products: Product[];
  orders: Order[];
  favorites: Array<{ userId: number; productId: number; createdAt: string }>;
  reviews: Review[];
  supportMessages: SupportMessage[];
  supportClosed: string[];
  archiveHistory: Array<{ id: number; ownerId: number; type: string; from: string; to: string; count: number; createdAt: string }>;
};
type RequestWithUser = Request & { user?: User };

function freshDatabase(): Database {
  const now = new Date().toISOString();
  const categories = [
    "البقالة والمواد الغذائية",
    "الإلكترونيات",
    "الأزياء",
    "المنزل",
    "الأطفال",
    "الجمال والعناية الشخصية",
    "الرياضة",
    "العروض والخصومات",
  ];
  return {
    nextId: 20,
    users: [
      {
        id: 1,
        email: "tcust@hassa.com",
        passwordHash: bcrypt.hashSync("Pppqqqooo", 12),
        name: "عميل هسّا",
        phone: null,
        role: "customer",
      },
      {
        id: 10,
        email: "moalj44@gmail.com",
        passwordHash: bcrypt.hashSync("Pppqqqooo111", 12),
        name: "مدير هسّا",
        phone: null,
        role: "admin",
      },
      {
        id: 11,
        email: "tda@hassa.com",
        passwordHash: bcrypt.hashSync("Pppqqqooo", 12),
        name: "مندوب هسّا",
        phone: null,
        role: "rider",
      },
    ],
    stores: [
      {
        id: 2,
        ownerId: null,
        name: "متجر هسّا التجريبي",
        handle: "hassa-test-store",
        category: "متجر عام",
        neighborhood: "عمّان",
        description: "متجر تجريبي لإضافة المنتجات وإدارة الطلبات من مكان واحد.",
      },
    ],
    categories,
    products: [
      {
        id: 3,
        storeId: 2,
        category: categories[0],
        name: "سلة صباح هسّا",
        description: "اختيارات خفيفة لبداية يوم ألطف.",
        priceCents: 890,
        imageUrl:
          "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=82",
        stock: 20,
        active: true,
        createdAt: now,
      },
      {
        id: 4,
        storeId: 2,
        category: categories[0],
        name: "قهوة محمصة محليًا",
        description: "نكهة متوازنة محمصة بعناية.",
        priceCents: 650,
        imageUrl:
          "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=82",
        stock: 24,
        active: true,
        createdAt: now,
      },
      {
        id: 5,
        storeId: 2,
        category: categories[1],
        name: "سماعة يومية لاسلكية",
        description: "صوت واضح وتصميم مريح للاستخدام اليومي.",
        priceCents: 2490,
        imageUrl:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=82",
        stock: 12,
        active: true,
        createdAt: now,
      },
      {
        id: 6,
        storeId: 2,
        category: categories[2],
        name: "حقيبة قماش عملية",
        description: "خفيفة، متينة، وترافقك في كل مشوار.",
        priceCents: 1790,
        imageUrl:
          "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=82",
        stock: 10,
        active: true,
        createdAt: now,
      },
      {
        id: 7,
        storeId: 2,
        category: categories[3],
        name: "شمعة المساء",
        description: "رائحة دافئة تضيف هدوءًا للمكان.",
        priceCents: 1190,
        imageUrl:
          "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=82",
        stock: 16,
        active: true,
        createdAt: now,
      },
      {
        id: 8,
        storeId: 2,
        category: categories[6],
        name: "زجاجة ماء أنيقة",
        description: "رفيق بسيط للتمرين والمشاوير.",
        priceCents: 990,
        imageUrl:
          "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=82",
        stock: 18,
        active: true,
        createdAt: now,
      },
    ],
    orders: [],
    favorites: [],
    reviews: [],
    supportMessages: [],
    supportClosed: [],
    archiveHistory: [],
  };
}
function loadDatabase(): Database {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8")) as Database;
    return parsed.users && parsed.products ? { ...parsed, reviews: parsed.reviews || [], supportClosed: parsed.supportClosed || [], archiveHistory: parsed.archiveHistory || [] } : freshDatabase();
  } catch {
    const created = freshDatabase();
    saveDatabase(created);
    return created;
  }
}
let database = loadDatabase();
if (!database.users.some(user => user.role === "staff")) {
  database.users.push({ id: nextId(), email: "tcs@hassa.com", passwordHash: bcrypt.hashSync("Pppqqqooo", 12), name: "فريق خدمة العملاء", phone: null, role: "staff" });
  saveDatabase();
}
if (!database.users.some(user => user.email === "moalj44@gmail.com" && user.role === "admin")) {
  database.users.push({ id: nextId(), email: "moalj44@gmail.com", passwordHash: bcrypt.hashSync("Pppqqqooo111", 12), name: "مدير هسّا", phone: null, role: "admin" });
  saveDatabase();
}
if (!database.users.some(user => user.email === "tmarchent@hassa.com" && user.role === "merchant")) {
  const merchantId = nextId();
  database.users.push({ id: merchantId, email: "tmarchent@hassa.com", passwordHash: bcrypt.hashSync("Pppqqqooo", 12), name: "تاجر هسّا", phone: null, role: "merchant" });
  database.stores.push({ id: nextId(), ownerId: merchantId, name: "متجر هسّا", handle: `hassa-merchant-${merchantId}`, category: "متجر عام", neighborhood: "عمّان", description: "متجر هسّا المحلي" });
  saveDatabase();
}
if (!database.users.some(user => user.email === "tda@hassa.com" && user.role === "rider")) {
  database.users.push({ id: nextId(), email: "tda@hassa.com", passwordHash: bcrypt.hashSync("Pppqqqooo", 12), name: "مندوب هسّا", phone: null, role: "rider" });
  saveDatabase();
}
function saveDatabase(next = database) {
  const temporary = `${dataFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2));
  fs.renameSync(temporary, dataFile);
}
function nextId() {
  const id = database.nextId++;
  saveDatabase();
  return id;
}

const SESSION_COOKIE = "hassa_session";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "hassa-clean-rebuild-local-secret";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;
function encodeSession(userId: number) {
  const payload = `${userId}.${Date.now()}`;
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}
function decodeSession(value: string | undefined) {
  if (!value) return null;
  try {
    const [id, timestamp, signature] = Buffer.from(value, "base64url")
      .toString("utf8")
      .split(".");
    const payload = `${id}.${timestamp}`;
    const expected = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("hex");
    if (
      !id ||
      !timestamp ||
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      Date.now() - Number(timestamp) > SESSION_TTL
    )
      return null;
    return Number(id);
  } catch {
    return null;
  }
}
function getCookie(req: Request, name: string) {
  const pair = (req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}
function setSession(res: Response, userId: number) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeSession(userId)}; Max-Age=${SESSION_TTL / 1000}; Expires=${new Date(Date.now() + SESSION_TTL).toUTCString()}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}
function clearSession(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}
function currentUser(req: RequestWithUser) {
  if (req.user) return req.user;
  const id = decodeSession(getCookie(req, SESSION_COOKIE));
  const user = database.users.find(item => item.id === id);
  req.user = user;
  return user || null;
}
function requireUser(req: RequestWithUser, res: Response, next: NextFunction) {
  if (!currentUser(req))
    return res.status(401).json({ error: "يجب تسجيل الدخول أولًا." });
  next();
}
function requireStaff(req: RequestWithUser, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user || user.role !== "staff") return res.status(403).json({ error: "هذه الصفحة مخصصة لموظفي خدمة العملاء." });
  next();
}
function requireAdmin(req: RequestWithUser, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "هذه الصفحة مخصصة للإدارة." });
  next();
}
function requireMerchant(req: RequestWithUser, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user || user.role !== "merchant") return res.status(403).json({ error: "هذه الصفحة مخصصة للتجار." });
  next();
}
function requireRider(req: RequestWithUser, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user || user.role !== "rider") return res.status(403).json({ error: "هذه الصفحة مخصصة للمناديب." });
  next();
}
function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}
function now() {
  return new Date().toISOString();
}
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    req.path.startsWith("/api/") ? "no-store" : "public, max-age=300"
  );
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "hassa-shop-clean-api", time: now() })
);
app.get("/api/auth/me", (req: RequestWithUser, res) =>
  res.json({ user: currentUser(req) ? publicUser(currentUser(req)!) : null })
);
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const user = database.users.find(item => item.email === email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return fail(res, 401, "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});
app.post("/api/auth/register", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !name || password.length < 8)
    return fail(res, 400, "أدخل الاسم والبريد وكلمة مرور من 8 أحرف على الأقل.");
  if (database.users.some(item => item.email === email))
    return fail(res, 409, "يوجد حساب بهذا البريد مسبقًا.");
  const user: User = {
    id: nextId(),
    email,
    passwordHash: bcrypt.hashSync(password, 12),
    name,
    phone: null,
    role: "customer",
  };
  database.users.push(user);
  saveDatabase();
  setSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});
app.post("/api/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});
app.get("/api/catalog", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({
    stores: database.stores,
    products: database.products.filter(item => item.active && item.approvalStatus !== "pending"),
    categories: database.categories,
  });
});
app.get("/api/products/:productId/reviews", (req, res) => {
  const productId = Number(req.params.productId);
  const reviews = (database.reviews || [])
    .filter(item => item.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ reviews });
});
app.post("/api/products/:productId/reviews", requireUser, (req: RequestWithUser, res) => {
  const productId = Number(req.params.productId);
  const rating = Math.max(1, Math.min(5, Number(req.body?.rating) || 0));
  const body = String(req.body?.body || "").trim();
  if (!database.products.some(item => item.id === productId && item.active)) return fail(res, 404, "المنتج غير موجود.");
  if (!rating || body.length < 2) return fail(res, 400, "اختر تقييمًا واكتب رأيك.");
  const review: Review = { id: nextId(), productId, rating, body, authorName: req.user!.name, createdAt: now() };
  database.reviews.push(review);
  saveDatabase();
  res.status(201).json({ review });
});
app.get("/api/favorites", requireUser, (req: RequestWithUser, res) =>
  res.json({
    productIds: database.favorites
      .filter(item => item.userId === req.user!.id)
      .map(item => ({ productId: item.productId })),
  })
);
app.post(
  "/api/favorites/:productId",
  requireUser,
  (req: RequestWithUser, res) => {
    const productId = Number(req.params.productId);
    if (
      !database.favorites.some(
        item => item.userId === req.user!.id && item.productId === productId
      )
    )
      database.favorites.push({
        userId: req.user!.id,
        productId,
        createdAt: now(),
      });
    saveDatabase();
    res.json({ ok: true });
  }
);
app.delete(
  "/api/favorites/:productId",
  requireUser,
  (req: RequestWithUser, res) => {
    database.favorites = database.favorites.filter(
      item =>
        !(
          item.userId === req.user!.id &&
          item.productId === Number(req.params.productId)
        )
    );
    saveDatabase();
    res.json({ ok: true });
  }
);
app.get("/api/orders", requireUser, (req: RequestWithUser, res) => {
  const orders = database.orders
    .filter(item => item.userId === req.user!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(order => ({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      customerNote: order.customerNote,
      status: order.status,
      totalCents: order.totalCents,
      createdAt: order.createdAt,
      storeName:
        database.stores.find(store => store.id === order.storeId)?.name ||
        "متجر هسّا",
      neighborhood:
        database.stores.find(store => store.id === order.storeId)
          ?.neighborhood || "",
    }));
  res.json({ orders });
});
app.post("/api/orders", requireUser, (req: RequestWithUser, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const storeId = Number(req.body?.storeId);
  const name = String(req.body?.customerName || req.user!.name).trim();
  const phone = String(req.body?.customerPhone || "").trim();
  const address = String(req.body?.customerAddress || "").trim();
  if (!items.length || !storeId || !name || !phone || !address)
    return fail(res, 400, "أكمل بيانات الطلب واختر منتجًا واحدًا على الأقل.");
  const details = items.map((item: { productId: number; quantity: number }) => {
    const product = database.products.find(
      candidate => candidate.id === Number(item.productId) && candidate.active
    );
    return product
      ? {
          product,
          quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1)),
        }
      : null;
  });
  if (
    details.some((item: { product: Product; quantity: number } | null) => !item)
  )
    return fail(res, 400, "أحد المنتجات لم يعد متوفرًا.");
  const valid = details as Array<{ product: Product; quantity: number }>;
  if (valid.some(({ product }) => product.storeId !== storeId))
    return fail(res, 400, "يجب أن تكون المنتجات من متجر واحد.");
  if (valid.some(({ product, quantity }) => quantity > product.stock))
    return fail(res, 400, "الكمية المطلوبة غير متاحة حاليًا.");
  const totalCents = valid.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0
  );
  const order: Order = {
    id: nextId(),
    orderNumber: `HS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
    userId: req.user!.id,
    storeId,
    customerName: name,
    customerPhone: phone,
    customerAddress: address,
    customerNote: String(req.body?.customerNote || ""),
    status: "pending",
    riderId: null,
    totalCents,
    createdAt: now(),
    items: valid.map(({ product, quantity }) => ({
      productId: product.id,
      productName: product.name,
      unitPriceCents: product.priceCents,
      quantity,
    })),
  };
  valid.forEach(({ product, quantity }) => {
    product.stock -= quantity;
  });
  database.orders.push(order);
  saveDatabase();
  res
    .status(201)
    .json({ orderNumber: order.orderNumber, status: order.status, totalCents });
});
app.get("/api/support/messages", requireUser, (req: RequestWithUser, res) => {
  const orderNumber = String(req.query.orderNumber || "").trim();
  const messages = database.supportMessages.filter(item => item.userId === req.user!.id && (!orderNumber || item.orderNumber === orderNumber)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages });
});
app.get("/api/staff/customers/search", requireStaff, (req: RequestWithUser, res) => {
  const query = String(req.query.q || "").trim().toLocaleLowerCase();
  if (query.length < 2) return res.json({ customers: [] });
  const matches = database.users.filter(user => user.role === "customer" && [user.name, user.email, user.phone || ""].some(value => value.toLocaleLowerCase().includes(query)) || database.orders.some(order => order.orderNumber.toLocaleLowerCase().includes(query) && order.userId === user.id));
  const customers = matches.slice(0, 20).map(user => ({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    orders: database.orders.filter(order => order.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => ({ orderNumber: order.orderNumber, status: order.status, totalCents: order.totalCents, createdAt: order.createdAt, storeName: database.stores.find(store => store.id === order.storeId)?.name || "متجر محلي", items: order.items })),
    conversationCount: database.supportMessages.filter(message => message.userId === user.id).length,
  }));
  res.json({ customers });
});
app.get("/api/staff/conversations", requireStaff, (_req, res) => {
  const groups = new Map<string, { key: string; userId: number | null; orderNumber: string | null; topic: string; userName: string; userEmail: string; lastMessage: SupportMessage; unread: number; closed: boolean }>();
  for (const message of database.supportMessages) {
    const key = `${message.userId || "guest"}:${message.orderNumber || "general"}`;
    const user = database.users.find(item => item.id === message.userId);
    const existing = groups.get(key);
    if (!existing) groups.set(key, { key, userId: message.userId, orderNumber: message.orderNumber, topic: message.topic, userName: user?.name || message.senderName || "زائر", userEmail: user?.email || "", lastMessage: message, unread: message.senderRole === "customer" ? 1 : 0, closed: database.supportClosed.includes(key) });
    else { existing.lastMessage = message; if (message.senderRole === "customer") existing.unread += 1; }
  }
  res.json({ conversations: Array.from(groups.values()).sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt)), closedKeys: database.supportClosed });
});
app.post("/api/staff/conversations/close", requireStaff, (req, res) => {
  const key = String(req.body?.key || "").trim();
  const closed = Boolean(req.body?.closed);
  if (!key) return fail(res, 400, "المحادثة غير محددة.");
  database.supportClosed = database.supportClosed.filter(item => item !== key);
  if (closed) database.supportClosed.push(key);
  saveDatabase();
  res.json({ key, closed });
});
app.get("/api/staff/messages", requireStaff, (req: RequestWithUser, res) => {
  const userId = Number(req.query.userId || 0);
  const orderNumber = String(req.query.orderNumber || "").trim();
  const messages = database.supportMessages.filter(item => item.userId === userId && (!orderNumber || item.orderNumber === orderNumber)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages });
});
app.post("/api/staff/messages", requireStaff, (req: RequestWithUser, res) => {
  const body = String(req.body?.body || "").trim();
  const userId = Number(req.body?.userId || 0);
  if (body.length < 2 || !userId) return fail(res, 400, "اختر محادثة واكتب الرد.");
  const message: SupportMessage = { id: nextId(), userId, orderNumber: String(req.body?.orderNumber || "").trim() || null, topic: String(req.body?.topic || "general"), body, senderRole: "staff", senderName: req.user!.name, createdAt: now() };
  database.supportMessages.push(message); saveDatabase(); res.status(201).json({ message });
});
app.post("/api/admin/accounts", requireAdmin, (req, res) => {
  const role = String(req.body?.role || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!["merchant", "rider", "staff"].includes(role) || !email || !name || password.length < 8) return fail(res, 400, "أدخل الدور والاسم والبريد وكلمة مرور من 8 أحرف على الأقل.");
  if (database.users.some(user => user.email === email)) return fail(res, 409, "يوجد حساب بهذا البريد مسبقًا.");
  const user: User = { id: nextId(), email, passwordHash: bcrypt.hashSync(password, 12), name, phone: String(req.body?.phone || "").trim() || null, role: role as User["role"] };
  database.users.push(user);
  if (role === "merchant") database.stores.push({ id: nextId(), ownerId: user.id, name: String(req.body?.storeName || name).trim(), handle: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "store"}-${user.id}`, category: String(req.body?.category || "متجر عام"), neighborhood: String(req.body?.neighborhood || "عمّان"), description: String(req.body?.description || "متجر هسّا") });
  saveDatabase(); res.status(201).json({ user: publicUser(user) });
});
app.patch("/api/admin/orders/:orderNumber/assign", requireAdmin, (req, res) => {
  const order = database.orders.find(item => item.orderNumber === req.params.orderNumber);
  const riderId = Number(req.body?.riderId || 0);
  const rider = database.users.find(user => user.id === riderId && user.role === "rider");
  if (!order) return fail(res, 404, "الطلب غير موجود.");
  if (riderId && !rider) return fail(res, 400, "المندوب غير موجود.");
  order.riderId = riderId || null; if (riderId && order.status === "ready") order.status = "assigned"; saveDatabase(); res.json({ order });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const openOrders = database.orders.filter(order => !["delivered", "cancelled"].includes(order.status));
  const supportByUser = new Map<number, { userId: number; name: string; email: string; lastMessage: SupportMessage; unread: number }>();
  for (const message of database.supportMessages) {
    if (!message.userId) continue;
    const user = database.users.find(item => item.id === message.userId);
    if (!user) continue;
    const current = supportByUser.get(user.id);
    if (!current) supportByUser.set(user.id, { userId: user.id, name: user.name, email: user.email, lastMessage: message, unread: message.senderRole === "customer" ? 1 : 0 });
    else { current.lastMessage = message; if (message.senderRole === "customer") current.unread += 1; }
  }
  res.json({
    metrics: { customers: database.users.filter(user => user.role === "customer").length, merchants: database.users.filter(user => user.role === "merchant").length, riders: database.users.filter(user => user.role === "rider").length, staff: database.users.filter(user => user.role === "staff").length, stores: database.stores.length, products: database.products.length, orders: database.orders.length, openOrders: openOrders.length, revenueCents: database.orders.filter(order => order.status !== "cancelled").reduce((sum, order) => sum + order.totalCents, 0), supportOpen: Array.from(supportByUser.values()).filter(item => item.unread > 0).length },
    orders: database.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(order => ({ ...order, storeName: database.stores.find(store => store.id === order.storeId)?.name || "متجر محلي", customerEmail: database.users.find(user => user.id === order.userId)?.email || "" })),
    stores: database.stores.map(store => ({ ...store, products: database.products.filter(product => product.storeId === store.id).length })),
    products: database.products,
    users: database.users.filter(user => user.role !== "admin").map(publicUser),
    conversations: Array.from(supportByUser.values()).sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt)).slice(0, 30),
    recentActivity: [...database.orders.map(order => ({ type: "order", label: `طلب ${order.orderNumber}`, detail: order.status, createdAt: order.createdAt })), ...database.supportMessages.map(message => ({ type: "support", label: message.senderName || "رسالة دعم", detail: message.body, createdAt: message.createdAt }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
  });
});
app.patch("/api/admin/stores/:storeId/plan", requireAdmin, (req, res) => {
  const store = database.stores.find(item => item.id === Number(req.params.storeId));
  if (!store) return fail(res, 404, "المتجر غير موجود.");
  const planName = String(req.body?.planName || "الخطة الأساسية").trim();
  if (!["الخطة الأساسية", "خطة موثقة", "خطة مميزة"].includes(planName))
    return fail(res, 400, "خطة المتجر غير صالحة.");
  store.planName = planName || "الخطة الأساسية";
  saveDatabase();
  res.json({ store });
});
app.patch("/api/admin/products/:productId", requireAdmin, (req, res) => {
  const product = database.products.find(item => item.id === Number(req.params.productId));
  if (!product) return fail(res, 404, "المنتج غير موجود.");
  if (req.body?.approvalStatus !== undefined && ["pending", "approved", "rejected"].includes(String(req.body.approvalStatus))) {
    product.approvalStatus = String(req.body.approvalStatus) as Product["approvalStatus"];
    if (product.approvalStatus === "approved") product.active = true;
    if (product.approvalStatus === "rejected") product.active = false;
  }
  if (req.body?.offerApprovalStatus !== undefined && ["pending", "approved", "rejected"].includes(String(req.body.offerApprovalStatus))) product.offerApprovalStatus = String(req.body.offerApprovalStatus) as Product["offerApprovalStatus"];
  if (req.body?.active !== undefined) product.active = Boolean(req.body.active);
  saveDatabase();
  res.json({ product });
});
app.delete("/api/admin/products/:productId", requireAdmin, (req, res) => {
  const index = database.products.findIndex(item => item.id === Number(req.params.productId));
  if (index < 0) return fail(res, 404, "المنتج غير موجود.");
  database.products.splice(index, 1);
  saveDatabase();
  res.json({ ok: true });
});
app.patch("/api/admin/orders/:orderNumber", requireAdmin, (req, res) => {
  const order = database.orders.find(item => item.orderNumber === req.params.orderNumber);
  const status = String(req.body?.status || "").trim();
  if (!order) return fail(res, 404, "الطلب غير موجود.");
  if (!["pending", "confirmed", "preparing", "ready", "assigned", "out_for_delivery", "delivered", "cancelled"].includes(status)) return fail(res, 400, "حالة الطلب غير صالحة.");
  order.status = status; saveDatabase(); res.json({ order });
});
app.post("/api/admin/support/reply", requireAdmin, (req: RequestWithUser, res) => {
  const body = String(req.body?.body || "").trim();
  const userId = Number(req.body?.userId || 0);
  if (!body || !userId) return fail(res, 400, "اختر محادثة واكتب الرد.");
  const message: SupportMessage = { id: nextId(), userId, orderNumber: String(req.body?.orderNumber || "").trim() || null, topic: String(req.body?.topic || "general"), body, senderRole: "admin", senderName: req.user!.name, createdAt: now() };
  database.supportMessages.push(message); saveDatabase(); res.status(201).json({ message });
});
app.get("/api/admin/support/:userId", requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  res.json({ messages: database.supportMessages.filter(message => message.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
});

app.get("/api/merchant/overview", requireMerchant, (req: RequestWithUser, res) => {
  const stores = database.stores.filter(store => store.ownerId === req.user!.id);
  const storeIds = new Set(stores.map(store => store.id));
  res.json({ stores, products: database.products.filter(product => storeIds.has(product.storeId)), orders: database.orders.filter(order => storeIds.has(order.storeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
app.post("/api/merchant/uploads", requireMerchant, (req: RequestWithUser, res) => {
  upload.array("images", 6)(req, res, error => {
    if (error) return fail(res, 400, error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "حجم الصورة يجب ألا يتجاوز 8 ميجابايت." : "تعذر رفع الصور. استخدم JPG أو PNG أو WEBP.");
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    res.status(201).json({ images: files.map(file => `/uploads/${encodeURIComponent(file.filename)}`) });
  });
});
app.patch("/api/merchant/products/:productId", requireMerchant, (req: RequestWithUser, res) => {
  const product = database.products.find(item => item.id === Number(req.params.productId));
  const owns = product && database.stores.some(store => store.id === product.storeId && store.ownerId === req.user!.id);
  if (!product || !owns) return fail(res, 404, "المنتج غير موجود.");
  if (req.body?.priceCents !== undefined) product.priceCents = Math.max(0, Number(req.body.priceCents) || 0);
  if (req.body?.stock !== undefined) product.stock = Math.max(0, Number(req.body.stock) || 0);
  if (req.body?.active !== undefined) product.active = Boolean(req.body.active);
  if (req.body?.offerEnabled !== undefined) {
    product.offerEnabled = Boolean(req.body.offerEnabled);
    if (product.offerEnabled) product.offerApprovalStatus = "pending";
  }
  if (req.body?.offerApprovalStatus !== undefined && ["pending", "approved", "rejected"].includes(String(req.body.offerApprovalStatus))) product.offerApprovalStatus = String(req.body.offerApprovalStatus) as Product["offerApprovalStatus"];
  if (req.body?.offerLabel !== undefined) product.offerLabel = String(req.body.offerLabel).trim();
  if (req.body?.offerPriceCents !== undefined) product.offerPriceCents = req.body.offerPriceCents === null ? null : Math.max(0, Number(req.body.offerPriceCents) || 0);
  if (req.body?.images !== undefined && Array.isArray(req.body.images)) product.images = req.body.images.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 6);
  if (req.body?.approvalStatus !== undefined && ["pending", "approved", "rejected"].includes(String(req.body.approvalStatus))) product.approvalStatus = String(req.body.approvalStatus) as Product["approvalStatus"];
  saveDatabase(); res.json({ product });
});
app.post("/api/merchant/products", requireMerchant, (req: RequestWithUser, res) => {
  const store = database.stores.find(item => item.ownerId === req.user!.id);
  const name = String(req.body?.name || "").trim();
  if (!store || !name) return fail(res, 400, "أدخل اسم المنتج أولًا.");
  const images = Array.isArray(req.body?.images) ? req.body.images.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 6) : [];
  const offerEnabled = Boolean(req.body?.offerEnabled);
  const product: Product = { id: nextId(), storeId: store.id, category: String(req.body?.category || store.category || "عام"), name, description: String(req.body?.description || ""), priceCents: Math.max(0, Number(req.body?.priceCents) || 0), imageUrl: String(req.body?.imageUrl || images[0] || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82"), images, approvalStatus: "pending", stock: Math.max(0, Number(req.body?.stock) || 0), active: req.body?.active !== false, offerEnabled, offerLabel: String(req.body?.offerLabel || "").trim(), offerPriceCents: offerEnabled ? Math.max(0, Number(req.body?.offerPriceCents ?? req.body?.priceCents) || 0) : null, offerApprovalStatus: offerEnabled ? "pending" : undefined, createdAt: now() };
  database.products.push(product); saveDatabase(); res.status(201).json({ product });
});
app.delete("/api/merchant/products/:productId", requireMerchant, (req: RequestWithUser, res) => {
  const productId = Number(req.params.productId);
  const index = database.products.findIndex(item => item.id === productId);
  const product = database.products[index];
  const owns = product && database.stores.some(store => store.id === product.storeId && store.ownerId === req.user!.id);
  if (index < 0 || !owns) return fail(res, 404, "المنتج غير موجود.");
  database.products.splice(index, 1); saveDatabase(); res.json({ ok: true });
});
app.patch("/api/merchant/orders/:orderNumber/status", requireMerchant, (req: RequestWithUser, res) => {
  const order = database.orders.find(item => item.orderNumber === req.params.orderNumber);
  const owns = order && database.stores.some(store => store.id === order.storeId && store.ownerId === req.user!.id);
  const status = String(req.body?.status || "").trim();
  if (!order || !owns) return fail(res, 404, "الطلب غير موجود ضمن متجرك.");
  if (!["confirmed", "preparing", "ready", "cancelled"].includes(status)) return fail(res, 400, "حالة الطلب غير صالحة للمتجر.");
  order.status = status; saveDatabase(); res.json({ order });
});
app.patch("/api/merchant/store", requireMerchant, (req: RequestWithUser, res) => {
  const store = database.stores.find(item => item.ownerId === req.user!.id);
  if (!store) return fail(res, 404, "لا يوجد متجر مرتبط بهذا الحساب.");
  for (const key of ["name", "category", "neighborhood", "description", "phone", "address", "openingHours"] as const) {
    if (req.body?.[key] !== undefined) store[key] = String(req.body[key]).trim();
  }
  if (req.body?.acceptsOrders !== undefined) store.acceptsOrders = Boolean(req.body.acceptsOrders);
  if (req.body?.notificationsEnabled !== undefined) store.notificationsEnabled = Boolean(req.body.notificationsEnabled);
  if (req.body?.notificationSound !== undefined) store.notificationSound = Boolean(req.body.notificationSound);
  if (req.body?.notificationVolume !== undefined) store.notificationVolume = Math.max(0, Math.min(100, Number(req.body.notificationVolume) || 0));
  if (req.body?.latitude !== undefined) store.latitude = Number.isFinite(Number(req.body.latitude)) ? Number(req.body.latitude) : null;
  if (req.body?.longitude !== undefined) store.longitude = Number.isFinite(Number(req.body.longitude)) ? Number(req.body.longitude) : null;
  saveDatabase(); res.json({ store });
});
app.get("/api/merchant/messages", requireMerchant, (req: RequestWithUser, res) => {
  const messages = database.supportMessages.filter(item => item.userId === req.user!.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages });
});
app.post("/api/merchant/messages", requireMerchant, (req: RequestWithUser, res) => {
  const body = String(req.body?.body || "").trim();
  if (body.length < 2) return fail(res, 400, "اكتب رسالتك أولًا.");
  const orderNumber = String(req.body?.orderNumber || "").trim() || null;
  const order = orderNumber ? database.orders.find(item => item.orderNumber === orderNumber && database.stores.some(store => store.id === item.storeId && store.ownerId === req.user!.id)) : undefined;
  if (orderNumber && !order) return fail(res, 404, "الطلب غير موجود ضمن متجرك.");
  const message: SupportMessage = { id: nextId(), userId: req.user!.id, orderNumber, topic: String(req.body?.topic || "merchant"), body, senderRole: "merchant", senderName: req.user!.name, createdAt: now() };
  database.supportMessages.push(message); saveDatabase(); res.status(201).json({ message });
});
app.patch("/api/merchant/password", requireMerchant, (req: RequestWithUser, res) => {
  const current = String(req.body?.currentPassword || ""); const next = String(req.body?.newPassword || "");
  if (!bcrypt.compareSync(current, req.user!.passwordHash)) return fail(res, 400, "كلمة المرور الحالية غير صحيحة.");
  if (next.length < 8) return fail(res, 400, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
  req.user!.passwordHash = bcrypt.hashSync(next, 12); saveDatabase(); res.json({ ok: true });
});
app.get("/api/merchant/archive", requireMerchant, (req: RequestWithUser, res) => {
  const stores = database.stores.filter(store => store.ownerId === req.user!.id);
  const ids = new Set(stores.map(store => store.id));
  const type = String(req.query.type || "orders");
  const records = type === "products" ? database.products.filter(item => ids.has(item.storeId)) : database.orders.filter(item => ids.has(item.storeId));
  res.json({ type, records, count: records.length, history: database.archiveHistory.filter(item => item.ownerId === req.user!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
app.post("/api/merchant/archive", requireMerchant, (req: RequestWithUser, res) => {
  const stores = database.stores.filter(store => store.ownerId === req.user!.id);
  const ids = new Set(stores.map(store => store.id));
  const type = String(req.body?.type || "orders");
  const from = String(req.body?.from || ""); const to = String(req.body?.to || "");
  const inRange = (value: string) => (!from || value >= from) && (!to || value <= `${to}T23:59:59.999Z`);
  const count = type === "products" ? database.products.filter(item => ids.has(item.storeId) && inRange(item.createdAt || "")).length : database.orders.filter(item => ids.has(item.storeId) && inRange(item.createdAt)).length;
  if (type === "products") {
    database.products = database.products.filter(item => !(ids.has(item.storeId) && inRange(item.createdAt || "")));
  } else {
    database.orders = database.orders.filter(item => !(ids.has(item.storeId) && inRange(item.createdAt)));
  }
  database.archiveHistory.push({ id: nextId(), ownerId: req.user!.id, type, from, to, count, createdAt: now() });
  saveDatabase(); res.json({ ok: true });
});
app.get("/api/rider/overview", requireRider, (req: RequestWithUser, res) => {
  const orders = database.orders.filter(order => order.riderId === req.user!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => ({ ...order, storeName: database.stores.find(store => store.id === order.storeId)?.name || "متجر محلي" }));
  res.json({ orders, metrics: { assigned: orders.filter(order => order.status === "assigned").length, active: orders.filter(order => ["assigned", "out_for_delivery"].includes(order.status)).length, delivered: orders.filter(order => order.status === "delivered").length } });
});
app.patch("/api/rider/orders/:orderNumber/status", requireRider, (req: RequestWithUser, res) => {
  const order = database.orders.find(item => item.orderNumber === req.params.orderNumber && item.riderId === req.user!.id);
  const status = String(req.body?.status || "").trim();
  if (!order) return fail(res, 404, "الطلب غير موجود ضمن تعييناتك.");
  if (!["out_for_delivery", "delivered"].includes(status)) return fail(res, 400, "حالة التوصيل غير صالحة.");
  order.status = status; saveDatabase(); res.json({ order });
});
app.get("/api/rider/messages", requireRider, (req: RequestWithUser, res) => {
  const messages = database.supportMessages.filter(item => item.userId === req.user!.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages });
});
app.post("/api/rider/messages", requireRider, (req: RequestWithUser, res) => {
  const body = String(req.body?.body || "").trim();
  if (body.length < 2) return fail(res, 400, "اكتب رسالتك أولًا.");
  const orderNumber = String(req.body?.orderNumber || "").trim() || null;
  const order = orderNumber ? database.orders.find(item => item.orderNumber === orderNumber && item.riderId === req.user!.id) : undefined;
  if (orderNumber && !order) return fail(res, 404, "الطلب غير موجود ضمن تعييناتك.");
  const message: SupportMessage = { id: nextId(), userId: req.user!.id, orderNumber, topic: String(req.body?.topic || "rider_support"), body, senderRole: "rider", senderName: req.user!.name, createdAt: now() };
  database.supportMessages.push(message); saveDatabase(); res.status(201).json({ message });
});
app.patch("/api/rider/password", requireRider, (req: RequestWithUser, res) => {
  const current = String(req.body?.currentPassword || ""); const next = String(req.body?.newPassword || "");
  if (!bcrypt.compareSync(current, req.user!.passwordHash)) return fail(res, 400, "كلمة المرور الحالية غير صحيحة.");
  if (next.length < 8) return fail(res, 400, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.");
  req.user!.passwordHash = bcrypt.hashSync(next, 12); saveDatabase(); res.json({ ok: true });
});

app.post("/api/support", (req: RequestWithUser, res) => {
  const user = currentUser(req);
  const body = String(req.body?.body || "").trim();
  if (body.length < 2) return fail(res, 400, "اكتب رسالتك أولًا.");
  database.supportMessages.push({
    id: nextId(),
    userId: user?.id ?? null,
    orderNumber: String(req.body?.orderNumber || "").trim() || null,
    topic: String(req.body?.topic || "general"),
    body,
    senderRole: user?.role === "staff" ? "staff" : "customer",
    senderName: user?.name || "زائر",
    createdAt: now(),
  });
  saveDatabase();
  res.status(201).json({ ok: true });
});

const publicPath = path.join(root, "dist", "public");
if (fs.existsSync(publicPath)) {
  app.use("/uploads", express.static(uploadDir, { maxAge: "7d", etag: true, fallthrough: false }));
  app.use(express.static(publicPath, { index: false, maxAge: "1h", etag: true }));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(publicPath, "index.html"))
  );
}
const port = Number(process.env.PORT || 3000);
if (!process.env.VERCEL)
  createServer(app).listen(port, () =>
    console.log(`Hassa clean API listening on :${port}`)
  );
export default app;
