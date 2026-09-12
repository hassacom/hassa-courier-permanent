import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Compass,
  Heart,
  House,
  KeyRound,
  Landmark,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  PackageCheck,
  Search,
  Settings,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Store,
  Sun,
  Truck,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const money = (cents: number) => `${(cents / 100).toFixed(2)} د.أ`;
type Product = {
  id: number;
  storeId: number;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  images?: string[];
  createdAt?: string;
  stock: number;
  category: string;
  active?: boolean;
  offerEnabled?: boolean;
  offerLabel?: string;
  offerPriceCents?: number | null;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalNote?: string;
  offerApprovalStatus?: "pending" | "approved" | "rejected";
};
type StoreInfo = {
  id: number;
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
type Catalog = {
  stores: StoreInfo[];
  products: Product[];
  categories: string[];
};
type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
};
type Order = {
  userId?: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNote: string;
  status: string;
  totalCents: number;
  createdAt: string;
  storeName: string;
  neighborhood: string;
  items?: Array<{ productId: number; productName: string; unitPriceCents: number; quantity: number }>;
};
type CartLine = { productId: number; quantity: number };
type Review = {
  id?: number;
  rating: number;
  body: string;
  authorName?: string;
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
type StaffConversation = {
  key: string;
  userId: number | null;
  orderNumber: string | null;
  topic: string;
  userName: string;
  userEmail: string;
  lastMessage: SupportMessage;
  unread: number;
  closed?: boolean;
};
type CustomerLookup = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  conversationCount: number;
  orders: Array<{
    orderNumber: string;
    status: string;
    totalCents: number;
    createdAt: string;
    storeName: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPriceCents: number;
    }>;
  }>;
};
type AdminOverview = {
  products: Product[];
  metrics: {
    customers: number;
    merchants: number;
    riders: number;
    staff: number;
    stores: number;
    products: number;
    orders: number;
    openOrders: number;
    revenueCents: number;
    supportOpen: number;
  };
  orders: Array<
    Order & {
      id: number;
      storeName: string;
      customerEmail: string;
      items: Array<{ productName: string; quantity: number }>;
    }
  >;
  stores: Array<StoreInfo & { products: number }>;
  users: User[];
  conversations: Array<{
    userId: number;
    name: string;
    email: string;
    unread: number;
    lastMessage: SupportMessage;
  }>;
  recentActivity: Array<{
    type: string;
    label: string;
    detail: string;
    createdAt: string;
  }>;
};

type ApiOptions = RequestInit & { json?: unknown };
async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "تعذر إكمال العملية الآن.");
  return body as T;
}

const categoryMeta: Record<string, { icon: LucideIcon; tone: string }> = {
  "كل الأقسام": { icon: Compass, tone: "clay" },
  "البقالة والمواد الغذائية": { icon: ShoppingBasket, tone: "sage" },
  الإلكترونيات: { icon: Sparkles, tone: "blue" },
  الأزياء: { icon: Landmark, tone: "rose" },
  المنزل: { icon: House, tone: "gold" },
  الأطفال: { icon: Sparkles, tone: "mint" },
  "الجمال والعناية الشخصية": { icon: Sparkles, tone: "lilac" },
  الرياضة: { icon: Compass, tone: "green" },
  "العروض والخصومات": { icon: PackageCheck, tone: "clay" },
};
const toneStyles: Record<string, string> = {
  clay: "bg-[#3a241b] text-[#e98564] border-[#77412e]",
  sage: "bg-[#22332c] text-[#aac7b0] border-[#496c59]",
  blue: "bg-[#202d38] text-[#a8c9dc] border-[#3b5364]",
  rose: "bg-[#35232a] text-[#e3a5b6] border-[#704857]",
  gold: "bg-[#382f20] text-[#e5c47c] border-[#75623a]",
  mint: "bg-[#22322f] text-[#a8d5c3] border-[#467366]",
  lilac: "bg-[#2d2736] text-[#ccb9e0] border-[#5f4c70]",
  green: "bg-[#253323] text-[#b7d194] border-[#526b42]",
};
const previewCatalog: Catalog = {
  stores: [
    {
      id: 2,
      name: "متجر هسّا التجريبي",
      handle: "hassa-test-store",
      category: "متجر عام",
      neighborhood: "عمّان",
      description: "متجر تجريبي لإضافة المنتجات وإدارة الطلبات من مكان واحد.",
    },
  ],
  categories: [
    "البقالة والمواد الغذائية",
    "الإلكترونيات",
    "الأزياء",
    "المنزل",
    "الأطفال",
    "الجمال والعناية الشخصية",
    "الرياضة",
    "العروض والخصومات",
  ],
  products: [
    {
      id: 3,
      storeId: 2,
      category: "البقالة والمواد الغذائية",
      name: "سلة صباح هسّا",
      description: "اختيارات خفيفة لبداية يوم ألطف.",
      priceCents: 890,
      imageUrl:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=82",
      stock: 20,
    },
    {
      id: 4,
      storeId: 2,
      category: "البقالة والمواد الغذائية",
      name: "قهوة محمصة محليًا",
      description: "نكهة متوازنة محمصة بعناية.",
      priceCents: 650,
      imageUrl:
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=82",
      stock: 24,
    },
    {
      id: 5,
      storeId: 2,
      category: "الإلكترونيات",
      name: "سماعة يومية لاسلكية",
      description: "صوت واضح وتصميم مريح للاستخدام اليومي.",
      priceCents: 2490,
      imageUrl:
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=82",
      stock: 12,
    },
    {
      id: 6,
      storeId: 2,
      category: "الأزياء",
      name: "حقيبة قماش عملية",
      description: "خفيفة، متينة، وترافقك في كل مشوار.",
      priceCents: 1790,
      imageUrl:
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=82",
      stock: 10,
    },
    {
      id: 7,
      storeId: 2,
      category: "المنزل",
      name: "شمعة المساء",
      description: "رائحة دافئة تضيف هدوءًا للمكان.",
      priceCents: 1190,
      imageUrl:
        "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=82",
      stock: 16,
    },
    {
      id: 8,
      storeId: 2,
      category: "الرياضة",
      name: "زجاجة ماء أنيقة",
      description: "رفيق بسيط للتمرين والمشاوير.",
      priceCents: 990,
      imageUrl:
        "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=82",
      stock: 18,
    },
  ],
};

function Logo({
  compact = false,
  href = "/shop",
  language = "ar",
}: {
  compact?: boolean;
  href?: string;
  language?: "ar" | "en";
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-3"
      aria-label="العودة إلى متجر هسّا"
    >
      <span className="logo-mark">{language === "en" ? "H" : "هـ"}</span>
      {!compact && (
        <span className="font-display text-[1.25rem] font-bold tracking-[-.05em] text-cream">
          {language === "en" ? "Hassa" : "هسّا"}
        </span>
      )}
    </Link>
  );
}
function IconButton({
  label,
  children,
  onClick,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`icon-button ${className}`}
    >
      {children}
    </button>
  );
}
function Header({
  isLight,
  onToggleTheme,
  cartCount,
  user,
  onCart,
}: {
  isLight: boolean;
  onToggleTheme: () => void;
  cartCount: number;
  user: User | null;
  onCart: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const inAccount = location.startsWith("/customer");
  return (
    <>
      <header className="site-header">
        <div className="container flex items-center justify-between gap-4">
          <Logo />
          <nav
            className="hidden items-center gap-2 md:flex"
            aria-label="التنقل الرئيسي"
          >
            <Link
              href="/shop"
              className={`nav-link ${location === "/shop" ? "nav-link-active" : ""}`}
            >
              <House className="h-4 w-4" /> المتجر
            </Link>
            <Link
              href="/shop/discover"
              className={`nav-link ${location.includes("discover") ? "nav-link-active" : ""}`}
            >
              <Compass className="h-4 w-4" /> اكتشف
            </Link>
            <Link
              href="/customer/favorites"
              className={`nav-link ${location.includes("favorites") ? "nav-link-active" : ""}`}
            >
              <Heart className="h-4 w-4" /> المفضلة
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <button
                type="button"
                onClick={onToggleTheme}
                className="theme-toggle"
              >
                <Sun className="h-4 w-4" />
                <span>{isLight ? "الوضع الداكن" : "الوضع الفاتح"}</span>
              </button>
            </div>
            <Link
              href={
                inAccount ? "/shop" : user ? "/customer" : "/login/customer"
              }
              className="avatar-button"
              aria-label={inAccount ? "العودة إلى المتجر" : "حسابي"}
              title={inAccount ? "العودة إلى المتجر" : "حسابي"}
            >
              {inAccount ? (
                <House className="h-[18px] w-[18px]" />
              ) : (
                <UserRound className="h-[18px] w-[18px]" />
              )}
            </Link>
            <IconButton label="السلة" className="relative" onClick={onCart}>
              <ShoppingBag className="h-[18px] w-[18px]" />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </IconButton>
            <IconButton
              label="فتح القائمة"
              className="md:hidden"
              onClick={() => setMenuOpen(value => !value)}
            >
              {menuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </IconButton>
          </div>
        </div>
      </header>
      {menuOpen && (
        <div className="mobile-menu md:hidden">
          <div className="container flex flex-col gap-2 py-4">
            <Link
              href="/shop"
              onClick={() => setMenuOpen(false)}
              className="mobile-menu-link"
            >
              <House className="h-4 w-4" /> المتجر
            </Link>
            <Link
              href="/shop/discover"
              onClick={() => setMenuOpen(false)}
              className="mobile-menu-link"
            >
              <Compass className="h-4 w-4" /> اكتشف
            </Link>
            <Link
              href="/customer/favorites"
              onClick={() => setMenuOpen(false)}
              className="mobile-menu-link"
            >
              <Heart className="h-4 w-4" /> المفضلة
            </Link>
            <button
              type="button"
              onClick={onToggleTheme}
              className="theme-toggle sm:hidden"
            >
              <Sun className="h-4 w-4" /> تبديل المظهر
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function Footer() {
  return (
    <footer className="border-t border-line/60 bg-ink/80 py-8">
      <div className="container flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-right">
        <div className="flex items-center gap-3">
          <Logo compact />
          <span className="text-xs text-muted">اختيارات محلية، أقرب لك.</span>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted">
          <Link href="/customer/privacy">الخصوصية</Link>
          <Link href="/customer/support">مركز الدعم</Link>
          <span>© هسّا 2026</span>
        </div>
      </div>
    </footer>
  );
}
function Shell({
  children,
  isLight,
  onToggleTheme,
  cartCount,
  user,
  onCart,
}: {
  children: ReactNode;
  isLight: boolean;
  onToggleTheme: () => void;
  cartCount: number;
  user: User | null;
  onCart: () => void;
}) {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header
        isLight={isLight}
        onToggleTheme={onToggleTheme}
        cartCount={cartCount}
        user={user}
        onCart={onCart}
      />
      {children}
      <Footer />
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
function PrimaryLink({
  href,
  children,
  icon = <ArrowLeft className="h-4 w-4" />,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className="primary-button">
      {children}
      {icon}
    </Link>
  );
}

function ProductCard({
  product,
  favorite,
  onFavorite,
  onAdd,
}: {
  product: Product;
  favorite: boolean;
  onFavorite: () => void;
  onAdd: () => void;
}) {
  return (
    <article className="product-card group">
      <div className="relative overflow-hidden rounded-[22px] bg-sand">
        <Link href={`/product/${product.id}`} className="block">
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="eager"
            decoding="async"
            className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </Link>
        <button
          type="button"
          onClick={onFavorite}
          aria-label={favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#1b120ccc] shadow-sm transition ${favorite ? "text-terracotta" : "text-cream/70 hover:text-terracotta"}`}
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`إضافة ${product.name} للسلة`}
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-terracotta text-white opacity-0 shadow-lg transition group-hover:opacity-100 focus:opacity-100"
        >
          <ShoppingBag className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/product/${product.id}`}
            className="block truncate text-sm font-semibold text-cream hover:text-terracotta"
          >
            {product.name}
          </Link>
          <p className="mt-1 truncate text-xs text-muted">{product.category}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-terracotta">
          {money(product.priceCents)}
        </p>
      </div>
    </article>
  );
}

function HomeSearch({ catalog }: { catalog: Catalog }) {
  const [value, setValue] = useState("");
  const matches =
    value.trim().length < 1
      ? []
      : catalog.products
          .filter(product =>
            `${product.name} ${product.description} ${product.category}`
              .toLocaleLowerCase("ar")
              .includes(value.toLocaleLowerCase("ar"))
          )
          .slice(0, 6);
  return (
    <div className="home-search-wrap">
      <form className="home-search" onSubmit={event => event.preventDefault()}>
        <Search className="h-4 w-4" />
        <input
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="ابحث عن منتج أو متجر"
          aria-label="البحث عن منتج أو متجر"
        />
        <span className="home-search-count">
          {value.trim() ? `${matches.length} نتائج` : ""}
        </span>
        <button type="submit">بحث</button>
      </form>
      {matches.length > 0 && (
        <div className="home-search-results">
          {matches.map(product => (
            <Link
              href={`/product/${product.id}`}
              key={product.id}
              className="home-search-result"
              onClick={() => setValue("")}
            >
              <img src={product.imageUrl} alt="" />
              <span>
                <strong>{product.name}</strong>
                <small>
                  {product.category} · {money(product.priceCents)}
                </small>
              </span>
              <ArrowLeft className="h-4 w-4 text-terracotta" />
            </Link>
          ))}
        </div>
      )}
      {value.trim() && matches.length === 0 && (
        <div className="home-search-empty">لا توجد اختيارات مطابقة حاليًا.</div>
      )}
    </div>
  );
}

function HomePage({
  catalog,
  favorites,
  onFavorite,
  onAdd,
}: {
  catalog: Catalog;
  favorites: number[];
  onFavorite: (id: number) => void;
  onAdd: (id: number) => void;
}) {
  const featured = catalog.products.slice(0, 5);
  const promoted = catalog.products.filter(product => product.active && product.offerEnabled && product.offerApprovalStatus === "approved");
  const [promoIndex, setPromoIndex] = useState(0);
  useEffect(() => {
    if (promoted.length < 2) return;
    const timer = window.setInterval(() => setPromoIndex(index => (index + 1) % promoted.length), 5000);
    return () => window.clearInterval(timer);
  }, [promoted.length]);
  const activePromo = promoted[promoIndex % Math.max(promoted.length, 1)];
  const categoryCounts = useMemo(
    () =>
      catalog.products.reduce<Record<string, number>>((map, p) => {
        map[p.category] = (map[p.category] || 0) + 1;
        return map;
      }, {}),
    [catalog.products]
  );
  return (
    <main>
      <section className="hero-section">
        <div className="container relative z-10 grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="max-w-2xl">
            <div className="status-chip">
              <span className="status-dot" /> قريب منك، على الطريق
            </div>
            <h1 className="hero-title">
              اختيارات محلية، <span>على مزاجك.</span>
            </h1>
            <p className="hero-copy">
              الأشياء الحلوة أقرب.
              <br />
              هسّا يجمع لك اختيارات محلية من حولك. اطلب ببساطة، وتابع كل خطوة من
              أول نقرة إلى بابك.
            </p>
            <HomeSearch catalog={catalog} />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryLink href="/shop/discover">استكشف الاختيارات</PrimaryLink>
              <Link href="/customer/support" className="ghost-button">
                تحتاج مساعدة؟ <CircleHelp className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-7 text-sm">
              <div>
                <p className="font-display text-2xl font-semibold text-cream">
                  قريب
                </p>
                <p className="mt-1 text-xs text-muted">اختيارات من حولك</p>
              </div>
              <div className="stat-separator" />
              <div>
                <p className="font-display text-2xl font-semibold text-cream">
                  واضح
                </p>
                <p className="mt-1 text-xs text-muted">تتبع كل خطوة</p>
              </div>
              <div className="stat-separator" />
              <div>
                <p className="font-display text-2xl font-semibold text-cream">
                  بسيط
                </p>
                <p className="mt-1 text-xs text-muted">اطلب بدون تعقيد</p>
              </div>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="hero-card hero-card-back">
              <span>هسّا</span>
              <small>من حولك</small>
            </div>
            <div className="hero-card hero-card-front">
              <span className="hero-card-icon">
                <ShoppingBasket className="h-7 w-7" />
              </span>
              <div>
                <p>اختيارات اليوم</p>
                <strong>أقرب مما تتخيل</strong>
              </div>
              <ArrowLeft className="h-5 w-5 text-terracotta" />
            </div>
            <div className="floating-note note-top">
              <MapPin className="h-4 w-4 text-terracotta" />
              <span>عمّان، الأردن</span>
            </div>
            <div className="floating-note note-bottom">
              <span className="tiny-check">
                <Check className="h-3 w-3" />
              </span>
              <span>توصيل يتابعك</span>
            </div>
          </div>
        </div>
      </section>
      <section className="container pb-10 pt-6 lg:pb-16 lg:pt-10">
        <SectionHeading
          eyebrow="تسوّق حسب القسم"
          title="اكتشف ما يناسبك."
          description="أقسام مختارة لتصل أسرع لما تبحث عنه"
          action={
            <Link href="/shop/discover" className="text-link">
              كل الأقسام <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
        <div className="category-grid mt-7">
          {["كل الأقسام", ...catalog.categories].map(name => {
            const meta = categoryMeta[name] || categoryMeta["كل الأقسام"];
            const Icon = meta.icon;
            return (
              <Link
                key={name}
                href={`/shop/section/${encodeURIComponent(name)}`}
                className="category-card group"
              >
                <span className={`category-icon ${toneStyles[meta.tone]}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>{name}</strong>
                  <small>
                    {name === "كل الأقسام"
                      ? catalog.products.length
                      : categoryCounts[name] || 0}{" "}
                    منتجات
                  </small>
                </span>
                <ChevronLeft className="h-4 w-4 text-muted transition group-hover:-translate-x-1 group-hover:text-cream" />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="nearby-section">
        <div className="container py-14 lg:py-20">
          <SectionHeading
            eyebrow="وصل حديثًا"
            title="ماذا يلفت نظرك؟"
            description={`${catalog.products.length} اختيارات متاحة الآن`}
          />
          <div className="product-grid mt-8">
            {featured.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                favorite={favorites.includes(product.id)}
                onFavorite={() => onFavorite(product.id)}
                onAdd={() => onAdd(product.id)}
              />
            ))}
          </div>
          {featured.length === 0 && (
            <div className="empty-state mt-8">
              <ShoppingBasket className="mx-auto h-8 w-8 text-terracotta" />
              <p className="mt-4 text-sm text-muted">
                المتاجر تضيف اختياراتها الآن. ارجع قريبًا.
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="container py-14 lg:py-20">
        <SectionHeading
          eyebrow="عرض اليوم"
          title="اختيارات حلوة، أقرب لبابك."
          description="اكتشف منتجات محلية جديدة من متاجر حولك، وتابعها بخطوات واضحة."
          action={
            <Link href="/shop/discover" className="text-link">
              اكتشف الآن <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
        <div className="offer-banner mt-8 customer-offer-carousel">
          <div className="offer-copy">
            <span className="offer-kicker">{activePromo ? (activePromo.offerLabel || "عرض خاص") : "اختيارات تتغير باستمرار"}</span>
            <h3>
              {activePromo ? activePromo.name : <>كل شيء تحبه، <span>في مكان واحد.</span></>}
            </h3>
            <p>{activePromo ? activePromo.description || "عرض معتمد من متجر محلي." : "نقرّب لك التفاصيل الصغيرة التي تجعل يومك ألطف."}</p>
            <PrimaryLink href={activePromo ? `/product/${activePromo.id}` : "/shop/discover"}>{activePromo ? "شاهد العرض" : "ابدأ الاكتشاف"}</PrimaryLink>
            {promoted.length > 1 && <div className="customer-offer-dots">{promoted.map((promo, index) => <Link key={promo.id} href={`/product/${promo.id}`} className={index === promoIndex % promoted.length ? "active" : ""} aria-label={`العرض ${index + 1}`} />)}</div>}
          </div>
          <div className="offer-visual">
            <div className="offer-sun" />
            <div className="offer-arch arch-one" />
            <div className="offer-arch arch-two" />
            <div className="offer-sticker">
              قريب
              <br />
              <span>منك</span>
            </div>
            <div className="offer-leaf leaf-one" />
            <div className="offer-leaf leaf-two" />
          </div>
        </div>
      </section>
    </main>
  );
}

function BrowsePage({
  catalog,
  favorites,
  onFavorite,
  onAdd,
  section,
}: {
  catalog: Catalog;
  favorites: number[];
  onFavorite: (id: number) => void;
  onAdd: (id: number) => void;
  section?: string;
}) {
  const [location] = useLocation();
  const initialQuery =
    new URLSearchParams(location.split("?")[1] || "").get("q") || "";
  const [search, setSearch] = useState(initialQuery);
  const [selected, setSelected] = useState(section || "كل الأقسام");
  const [sort, setSort] = useState<"latest" | "price-low" | "price-high">(
    "latest"
  );
  const products = catalog.products
    .filter(
      p =>
        (selected === "كل الأقسام" || p.category === selected) &&
        `${p.name} ${p.description} ${p.category}`
          .toLocaleLowerCase("ar")
          .includes(search.toLocaleLowerCase("ar"))
    )
    .sort((a, b) =>
      sort === "price-low"
        ? a.priceCents - b.priceCents
        : sort === "price-high"
          ? b.priceCents - a.priceCents
          : b.id - a.id
    );
  return (
    <main className="container py-12 lg:py-16">
      <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Link href="/shop" className="back-link">
            <ArrowRight className="h-4 w-4" /> العودة للمتجر
          </Link>
          <p className="eyebrow mt-7">استكشف الاختيارات</p>
          <h1 className="page-title">
            كل شيء أقرب <span>من حولك.</span>
          </h1>
        </div>
        <label className="search-box search-box-large">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="ابحث عن منتج أو متجر"
            aria-label="البحث"
          />
        </label>
      </div>
      <div className="browse-layout">
        <aside className="filter-panel">
          <p className="eyebrow">الأقسام</p>
          <div className="mt-4 space-y-1">
            {["كل الأقسام", ...catalog.categories].map(category => (
              <button
                type="button"
                key={category}
                onClick={() => setSelected(category)}
                className={`filter-row ${selected === category ? "filter-row-active" : ""}`}
              >
                <span>{category}</span>
                <small>
                  {category === "كل الأقسام"
                    ? catalog.products.length
                    : catalog.products.filter(p => p.category === category)
                        .length}
                </small>
              </button>
            ))}
          </div>
          <div className="mt-8 border-t border-line/60 pt-6">
            <p className="eyebrow">الموقع</p>
            <div className="filter-row filter-row-active mt-3">
              <span>عمّان</span>
              <MapPin className="h-4 w-4" />
            </div>
          </div>
        </aside>
        <section className="min-w-0">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-muted">
              {selected} <span className="mx-1 text-line">/</span>{" "}
              {products.length} منتجات
            </p>
            <label className="sort-button">
              <select
                value={sort}
                onChange={event =>
                  setSort(
                    event.target.value as "latest" | "price-low" | "price-high"
                  )
                }
                aria-label="ترتيب المنتجات"
              >
                <option value="latest">الأحدث</option>
                <option value="price-low">السعر: الأقل أولًا</option>
                <option value="price-high">السعر: الأعلى أولًا</option>
              </select>
              <ChevronDown className="h-4 w-4" />
            </label>
          </div>
          {products.length > 0 ? (
            <div className="product-grid">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  favorite={favorites.includes(product.id)}
                  onFavorite={() => onFavorite(product.id)}
                  onAdd={() => onAdd(product.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search className="mx-auto h-7 w-7 text-terracotta" />
              <h3 className="mt-4 font-display text-lg text-cream">
                لا توجد نتائج مطابقة
              </h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                جرّب البحث باسم مختلف أو اختر قسمًا آخر.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
function StorePage({
  catalog,
  handle,
  favorites,
  onFavorite,
  onAdd,
}: {
  catalog: Catalog;
  handle?: string;
  favorites: number[];
  onFavorite: (id: number) => void;
  onAdd: (id: number) => void;
}) {
  const store =
    catalog.stores.find(item => item.handle === handle) || catalog.stores[0];
  const products = catalog.products.filter(p => p.storeId === store?.id);
  if (!store)
    return (
      <main className="container py-16">
        <div className="empty-state">لا يوجد هذا المتجر.</div>
      </main>
    );
  return (
    <main className="container py-12 lg:py-16">
      <Link href="/shop" className="back-link">
        <ArrowRight className="h-4 w-4" /> العودة للمتجر
      </Link>
      <section className="store-hero mt-8">
        <div className="store-hero-orb" />
        <div className="store-large-avatar">
          <Store className="h-8 w-8" />
        </div>
        <div className="relative z-10">
          <span className="eyebrow">متجر محلي</span>
          <h1 className="page-title mt-2 store-title-with-badge">
            {store.name}
            {(store.planName === "خطة موثقة" || store.planName === "خطة مميزة") && (
              <span className="store-verified-badge" title="متجر موثق من إدارة هسّا">
                ✓ موثق
              </span>
            )}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>{store.category}</span>
            <span className="text-line">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {store.neighborhood}
            </span>
          </div>
        </div>
        <PrimaryLink
          href="/customer/support"
          icon={<MessageCircle className="h-4 w-4" />}
        >
          تواصل مع المتجر
        </PrimaryLink>
      </section>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <SectionHeading
            eyebrow="المنتجات"
            title="اختيارات المتجر"
            description="منتجات مختارة من هذا المتجر."
          />
          <div className="product-grid mt-7">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                favorite={favorites.includes(product.id)}
                onFavorite={() => onFavorite(product.id)}
                onAdd={() => onAdd(product.id)}
              />
            ))}
          </div>
        </div>
        <aside className="info-card h-fit">
          <p className="eyebrow">عن المتجر</p>
          <p className="mt-3 text-sm leading-7 text-muted">
            {store.description}
          </p>
          <div className="mt-6 space-y-3 border-t border-line/60 pt-5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <ClockIcon /> ساعات العمل قيد التحديد
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-terracotta" />{" "}
              {store.neighborhood}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
function ClockIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-terracotta text-[9px] text-terracotta">
      •
    </span>
  );
}

function CartDrawer({
  open,
  lines,
  products,
  onClose,
  onChange,
  onOrder,
  user,
}: {
  open: boolean;
  lines: CartLine[];
  products: Product[];
  onClose: () => void;
  onChange: (id: number, amount: number) => void;
  onOrder: (details: {
    name: string;
    phone: string;
    address: string;
    note: string;
  }) => Promise<void>;
  user: User | null;
}) {
  const [details, setDetails] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    address: "",
    note: "",
  });
  useEffect(
    () =>
      setDetails(current => ({
        ...current,
        name: user?.name || current.name,
        phone: user?.phone || current.phone,
      })),
    [user]
  );
  useEffect(() => {
    if (!open) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [open, onClose]);
  if (!open) return null;
  const selected = lines
    .map(line => ({
      line,
      product: products.find(product => product.id === line.productId),
    }))
    .filter((item): item is { line: CartLine; product: Product } =>
      Boolean(item.product)
    );
  const total = selected.reduce(
    (sum, item) => sum + item.product.priceCents * item.line.quantity,
    0
  );
  const stores = new Set(selected.map(item => item.product.storeId));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onOrder(details);
  };
  return (
    <div className="fixed inset-0 z-[999]">
      <button
        className="absolute inset-0 bg-black/65"
        aria-label="إغلاق السلة"
        onClick={onClose}
      />
      <aside className="absolute bottom-0 left-0 top-0 w-full overflow-y-auto bg-ink p-5 shadow-2xl sm:max-w-lg sm:p-7">
        <div className="flex items-center justify-between border-b border-line pb-5">
          <div>
            <p className="eyebrow">مساحتك</p>
            <h2 className="mt-1 font-display text-3xl tracking-[-.06em] text-cream">
              السلة
            </h2>
          </div>
          <button
            type="button"
            className="cart-close-button"
            onClick={onClose}
            aria-label="إغلاق السلة"
          >
            <X className="h-5 w-5" /> <span>إغلاق</span>
          </button>
        </div>
        {selected.length === 0 ? (
          <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
            <ShoppingBag className="h-8 w-8 text-terracotta" />
            <h3 className="mt-5 font-display text-2xl text-cream">
              السلة تنتظر اختياراتك
            </h3>
            <p className="mt-2 text-sm text-muted">
              أضف شيئًا يعجبك، وستظهر الخطوة التالية هنا.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-6">
              {selected.map(({ line, product }) => (
                <div key={product.id} className="flex gap-3">
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="h-16 w-16 rounded-2xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-cream">
                        {product.name}
                      </p>
                      <p className="text-sm font-semibold text-terracotta">
                        {money(product.priceCents * line.quantity)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onChange(product.id, -1)}
                        className="small-outline-button"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChange(product.id, 1)}
                        className="small-outline-button"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mb-5 flex justify-between border-t border-line pt-5 text-sm">
              <span className="text-muted">الإجمالي</span>
              <strong className="text-lg text-cream">{money(total)}</strong>
            </div>
            {stores.size > 1 && (
              <p className="mb-4 rounded-2xl bg-[#49321f] p-3 text-xs leading-5 text-[#f0c086]">
                الطلب الواحد يجب أن يكون من متجر واحد.
              </p>
            )}{" "}
            {!user ? (
              <Link href="/login/customer" className="primary-button w-full">
                سجّل الدخول لإكمال الطلب <LockKeyhole className="h-4 w-4" />
              </Link>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <input
                  required
                  value={details.name}
                  onChange={e =>
                    setDetails({ ...details, name: e.target.value })
                  }
                  placeholder="الاسم الكامل"
                  className="field"
                />
                <input
                  required
                  value={details.phone}
                  onChange={e =>
                    setDetails({ ...details, phone: e.target.value })
                  }
                  placeholder="رقم الهاتف"
                  className="field"
                />
                <input
                  required
                  value={details.address}
                  onChange={e =>
                    setDetails({ ...details, address: e.target.value })
                  }
                  placeholder="العنوان / المنطقة"
                  className="field"
                />
                <textarea
                  value={details.note}
                  onChange={e =>
                    setDetails({ ...details, note: e.target.value })
                  }
                  placeholder="ملاحظات للمتجر (اختياري)"
                  className="field min-h-20 resize-none"
                />
                <button
                  disabled={stores.size > 1}
                  className="primary-button w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  تأكيد الطلب <Check className="h-4 w-4" />
                </button>
              </form>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function LoginPage({ onAuth }: { onAuth: (user: User) => void }) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("tcust@hassa.com");
  const [password, setPassword] = useState("Pppqqqooo");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: User }>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", json: { email, password, name } }
      );
      onAuth(result.user);
      navigate("/customer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-topbar">
        <Logo />
        <Link
          href="/shop"
          className="text-xs font-semibold text-muted transition hover:text-cream"
        >
          العودة إلى المتجر <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="login-wrap">
        <div className="login-card">
          <div className="flex items-center justify-between">
            <span className="eyebrow flex items-center gap-2">
              دخول محمي <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <span className="login-icon">
              <LockKeyhole className="h-5 w-5" />
            </span>
          </div>
          <h1 className="mt-7 font-display text-4xl font-semibold tracking-[-.06em] text-cream">
            أهلاً بك في هسّا
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            اكتشف المتاجر المحلية، تابع طلباتك، واحصل على دعمك من مكان واحد.
          </p>
          <div className="auth-tabs mt-7">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
              className={mode === "login" ? "active" : ""}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setMessage("");
              }}
              className={mode === "register" ? "active" : ""}
            >
              إنشاء حساب
            </button>
          </div>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <label className="field-label">
                الاسم الكامل
                <div className="field-wrap">
                  <UserRound className="h-4 w-4 text-muted" />
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="الاسم الكامل"
                  />
                </div>
              </label>
            )}
            <label className="field-label">
              البريد الإلكتروني
              <div className="field-wrap">
                <Mail className="h-4 w-4 text-muted" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                />
              </div>
            </label>
            <label className="field-label">
              كلمة المرور
              <div className="field-wrap">
                <KeyRound className="h-4 w-4 text-muted" />
                <input
                  required
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="كلمة المرور"
                />
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShowPassword(value => !value)}
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
            </label>
            {message && (
              <div className="error-message">
                <X className="h-4 w-4" /> {message}
              </div>
            )}
            <button
              disabled={busy}
              type="submit"
              className="primary-button w-full justify-center"
            >
              {busy
                ? "جارٍ التنفيذ..."
                : mode === "login"
                  ? "تسجيل الدخول للمتابعة"
                  : "إنشاء الحساب"}
              <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CustomerPage({
  user,
  orders,
  favorites,
  catalog,
  onLogout,
  language,
  onLanguage,
}: {
  user: User;
  orders: Order[];
  favorites: number[];
  catalog: Catalog;
  onLogout: () => void;
  language: "ar" | "en";
  onLanguage: (value: "ar" | "en") => void;
}) {
  const [location] = useLocation();
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [topic, setTopic] = useState("general");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("hassa-support-sound") !== "off"
  );
  const [messages, setMessages] = useState<
    Array<{ from: "user" | "support"; body: string }>
  >([]);
  const isSupport = location.includes("support");
  const isFavorites = location.includes("favorites");
  const isOrders = location.includes("orders");
  const isNotifications = location.includes("notifications");
  const isProfile =
    location.includes("profile") ||
    location.includes("privacy") ||
    location.includes("settings");
  useEffect(() => {
    const queryOrder = new URLSearchParams(location.split("?")[1] || "").get(
      "order"
    );
    if (queryOrder) setSelectedOrder(queryOrder);
    if (isSupport)
      api<{ messages: SupportMessage[] }>(
        `/api/support/messages${queryOrder ? `?orderNumber=${encodeURIComponent(queryOrder)}` : ""}`
      )
        .then(result =>
          setMessages(
            result.messages.map(message => ({
              from: message.senderRole === "staff" ? "support" : "user",
              body: message.body,
            }))
          )
        )
        .catch(() => undefined);
  }, [location, isSupport]);
  const playReplySound = () => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.22
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch {
      // Audio is optional and must never block support messaging.
    }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody) return;
    try {
      await api("/api/support", {
        method: "POST",
        json: { body: cleanBody, topic, orderNumber: selectedOrder || null },
      });
      setMessages(current => [
        ...current,
        { from: "user", body: cleanBody },
        {
          from: "support",
          body: selectedOrder
            ? `وصلتنا رسالتك بخصوص الطلب ${selectedOrder}. سنراجع التفاصيل ونعود لك قريبًا.`
            : "وصلتنا رسالتك. سنراجعها ونعود لك قريبًا.",
        },
      ]);
      setBody("");
      setSent(true);
      playReplySound();
    } catch {
      setSent(false);
    }
  };
  const accountNav = [
    ["/customer", "نظرة عامة", Package],
    ["/customer/orders", "طلباتي", ShoppingBag],
    ["/customer/favorites", "المفضلة", Heart],
    ["/customer/profile", "بياناتي", UserRound],
    ["/customer/notifications", "التنبيهات", Bell],
    ["/customer/support", "مركز الدعم", MessageCircle],
  ] as const;
  return (
    <main className="container py-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link href="/shop" className="back-link">
            <ArrowRight className="h-4 w-4" /> العودة للمتجر
          </Link>
          <p className="eyebrow mt-7">مساحتك</p>
          <h1 className="page-title">
            أهلاً، <span>{user.name}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
            كل ما يخصك في مكان واحد: طلباتك، مفضلاتك، وإعداداتك.
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="small-outline-button"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> تسجيل الخروج
        </button>
      </div>
      <div className="account-layout mt-10">
        <aside className="account-sidebar">
          {accountNav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={`account-nav ${location === href ? "account-nav-active" : ""}`}
            >
              <Icon className="h-4 w-4" /> {label}
              {href === "/customer/orders" && <span>{orders.length}</span>}
              {href === "/customer/favorites" && (
                <span>{favorites.length}</span>
              )}
            </Link>
          ))}
        </aside>
        <section className="min-w-0">
          {isSupport ? (
            <div className="support-chat-card">
              <p className="eyebrow">دعم هسّا</p>
              <h2 className="section-title">
                تواصل معنا بالطريقة التي تناسبك.
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                اختر موضوع التواصل، واكتب رسالتك. إذا اخترت طلبًا سيظهر رقمه
                داخل المحادثة.
              </p>
              <div className="support-options mt-6">
                {[
                  ["general", "استفسار عام", CircleHelp],
                  ["order", "متابعة طلب", PackageCheck],
                  ["technical", "مشكلة تقنية", ShieldCheck],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value as string}
                    type="button"
                    onClick={() => setTopic(value as string)}
                    className={`support-option ${topic === value ? "active" : ""}`}
                  >
                    <Icon className="h-4 w-4" /> {label as string}
                  </button>
                ))}
              </div>
              {topic === "order" &&
                (orders.length ? (
                  <select
                    value={selectedOrder}
                    onChange={e => setSelectedOrder(e.target.value)}
                    className="field mt-4"
                  >
                    <option value="">اختر رقم الطلب</option>
                    {orders.map(order => (
                      <option key={order.orderNumber} value={order.orderNumber}>
                        {order.orderNumber} · {money(order.totalCents)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="notice-card mt-4">
                    لا توجد طلبات بعد. بعد تنفيذ أول طلب سيظهر خيار التواصل
                    بشأنه هنا.
                  </p>
                ))}
              <div className="support-thread mt-6">
                {messages.length === 0 ? (
                  <div className="support-empty">
                    <MessageCircle className="h-6 w-6 text-terracotta" />
                    <p>ابدأ المحادثة برسالة قصيرة، وسيظهر الرد هنا.</p>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={`chat-bubble ${message.from === "user" ? "chat-bubble-user" : "chat-bubble-support"}`}
                    >
                      <span>
                        {message.from === "user" ? "أنت" : "دعم هسّا"}
                      </span>
                      <p>{message.body}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={send} className="mt-5">
                <textarea
                  required
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="message-textarea"
                  placeholder="اكتب رسالتك هنا..."
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted">
                    الردود تظهر داخل هذه المحادثة.
                  </span>
                  <button className="primary-button">
                    إرسال الرسالة <Send className="h-4 w-4" />
                  </button>
                </div>
                {sent && (
                  <p className="success-message mt-3">
                    <Check className="h-4 w-4" /> وصلت رسالتك بنجاح.
                  </p>
                )}
              </form>
            </div>
          ) : isNotifications ? (
            <div className="info-card">
              <p className="eyebrow">مركز التنبيهات</p>
              <h2 className="section-title">تنبيهاتك في مكانها الصحيح.</h2>
              <div className="notification-row mt-7">
                <span className="category-icon clay">
                  <Bell className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <h2>ردود الدعم</h2>
                  <p>نعرض تنبيهًا عند وصول رد جديد من فريق الدعم.</p>
                </div>
                <span className="status-badge">مفعّل</span>
              </div>
              <div className="notification-row">
                <span className="category-icon sage">
                  {soundEnabled ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </span>
                <div className="flex-1">
                  <h2>صوت ردود الدعم</h2>
                  <p>تشغيل نغمة قصيرة عند ظهور رد داخل المحادثة.</p>
                </div>
                <button
                  type="button"
                  className={`switch ${soundEnabled ? "on" : ""}`}
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    localStorage.setItem(
                      "hassa-support-sound",
                      next ? "on" : "off"
                    );
                    if (next) playReplySound();
                  }}
                  aria-label="تبديل صوت ردود الدعم"
                >
                  <span />
                </button>
              </div>
            </div>
          ) : isProfile ? (
            <div className="info-card">
              <p className="eyebrow">إعدادات الحساب</p>
              <h2 className="section-title">بياناتك وإعداداتك.</h2>
              <div className="mt-7 space-y-3">
                <div className="setting-row">
                  <span>البريد الإلكتروني</span>
                  <strong>{user.email}</strong>
                </div>
                <div className="setting-row">
                  <span>الاسم</span>
                  <strong>{user.name}</strong>
                </div>
                <div className="setting-row">
                  <span>الهاتف</span>
                  <strong>{user.phone || "لم يُضف بعد"}</strong>
                </div>
              </div>
              <div className="language-setting mt-7">
                <div>
                  <strong>لغة الواجهة</strong>
                  <p>
                    بدّل بين العربية والإنجليزية مع ضبط اتجاه الصفحة تلقائيًا.
                  </p>
                </div>
                <div className="language-toggle">
                  <button
                    type="button"
                    className={language === "ar" ? "active" : ""}
                    onClick={() => onLanguage("ar")}
                  >
                    العربية
                  </button>
                  <button
                    type="button"
                    className={language === "en" ? "active" : ""}
                    onClick={() => onLanguage("en")}
                  >
                    English
                  </button>
                </div>
              </div>
            </div>
          ) : isFavorites ? (
            <div>
              <SectionHeading
                eyebrow="اختياراتك"
                title="المفضلة"
                description="كل ما حفظته لتعود إليه لاحقًا."
              />
              <div className="product-grid mt-7">
                {catalog.products
                  .filter(product => favorites.includes(product.id))
                  .map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      favorite
                      onFavorite={() => undefined}
                      onAdd={() => undefined}
                    />
                  ))}
              </div>
              {favorites.length === 0 && (
                <div className="empty-state mt-7">
                  <Heart className="mx-auto h-7 w-7 text-terracotta" />
                  <p className="mt-4 text-sm text-muted">لم تحفظ منتجات بعد.</p>
                </div>
              )}
            </div>
          ) : isOrders ? (
            <div>
              <SectionHeading
                eyebrow="سجل الشراء"
                title="طلباتي"
                description={`${orders.length} طلبات محفوظة على حسابك.`}
              />
              <div className="mt-6 space-y-3">
                {orders.map(order => (
                  <div key={order.orderNumber} className="order-row">
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <p>
                        {order.storeName} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString("ar-JO")}
                      </p>
                    </div>
                    <div className="text-left">
                      <span className="status-badge">
                        {order.status === "pending"
                          ? "قيد المراجعة"
                          : order.status}
                      </span>
                      <strong className="mt-1 block text-terracotta">
                        {money(order.totalCents)}
                      </strong>
                      <Link
                        href={`/customer/support?order=${encodeURIComponent(order.orderNumber)}`}
                        className="text-link mt-2"
                      >
                        تواصل بشأن الطلب{" "}
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="empty-state">
                    <Package className="mx-auto h-7 w-7 text-terracotta" />
                    <p className="mt-4 text-sm text-muted">
                      لا توجد طلبات بعد. أول اختيار ينتظرك.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="account-hero">
                <div>
                  <p className="eyebrow text-[#e98564]">نظرة سريعة</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-.06em] text-cream">
                    كل ما يخصك في مكان واحد.
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
                    تابع الطلبات واحفظ اختياراتك وتواصل مع الدعم من واجهة واحدة
                    بسيطة.
                  </p>
                </div>
                <PrimaryLink href="/shop">
                  ابدأ التسوق <ShoppingBag className="h-4 w-4" />
                </PrimaryLink>
              </div>
              <SectionHeading
                eyebrow="آخر نشاط"
                title="طلباتي"
                description={`${orders.length} طلبات محفوظة على حسابك.`}
                action={
                  <Link href="/customer/orders" className="text-link">
                    عرض الكل <ArrowLeft className="h-4 w-4" />
                  </Link>
                }
              />
              <div className="mt-6 space-y-3">
                {orders.slice(0, 4).map(order => (
                  <div key={order.orderNumber} className="order-row">
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <p>{order.storeName}</p>
                    </div>
                    <strong className="text-terracotta">
                      {money(order.totalCents)}
                    </strong>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="empty-state">
                    <Package className="mx-auto h-7 w-7 text-terracotta" />
                    <p className="mt-4 text-sm text-muted">
                      لا توجد طلبات بعد.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ProductPage({
  catalog,
  productId,
  onAdd,
}: {
  catalog: Catalog;
  productId?: string;
  onAdd: (id: number) => void;
}) {
  const [, navigate] = useLocation();
  const product = catalog.products.find(item => item.id === Number(productId));
  const [activeImage, setActiveImage] = useState(0);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const gallery = product ? [product.imageUrl, ...(product.images || [])] : [];
  useEffect(() => {
    if (!product) return;
    setActiveImage(0);
    api<{ reviews: Review[] }>(`/api/products/${product.id}/reviews`)
      .then(result => setReviews(result.reviews))
      .catch(() => setReviews([]));
  }, [product?.id]);
  if (!product)
    return (
      <main className="container py-16">
        <div className="empty-state">المنتج غير موجود.</div>
      </main>
    );
  const store = catalog.stores.find(item => item.id === product.storeId);
  const submitReview = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating || !review.trim()) return;
    api<{ review: Review }>(`/api/products/${product.id}/reviews`, {
      method: "POST",
      json: { rating, body: review.trim() },
    })
      .then(result => {
        setReviews(current => [result.review, ...current]);
        setRating(0);
        setReview("");
      })
      .catch(() => undefined);
  };
  return (
    <main className="container py-8 lg:py-12">
      <button
        type="button"
        className="back-link"
        onClick={() =>
          window.history.length > 1
            ? window.history.back()
            : navigate("/shop/discover")
        }
      >
        <ArrowRight className="h-4 w-4" /> العودة للاختيارات
      </button>
      <div className="product-detail mt-6">
        <div className="product-gallery">
          <div
            className="product-gallery-main"
            onTouchStart={event =>
              setTouchStartX(event.changedTouches[0].clientX)
            }
            onTouchEnd={event => {
              if (touchStartX === null || gallery.length < 2) return;
              const delta = event.changedTouches[0].clientX - touchStartX;
              if (Math.abs(delta) > 35)
                setActiveImage(
                  current =>
                    (current + (delta < 0 ? 1 : -1) + gallery.length) %
                    gallery.length
                );
              setTouchStartX(null);
            }}
          >
            <img
              src={gallery[activeImage]}
              alt={product.name}
              loading="eager"
              className="product-detail-image"
            />
          </div>
          {gallery.length > 1 && (
            <div className="product-thumbnails">
              {gallery.map((image, index) => (
                <button
                  type="button"
                  key={image + index}
                  onClick={() => setActiveImage(index)}
                  className={activeImage === index ? "active" : ""}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
          {gallery.length > 1 && (
            <div className="product-swipe-hint">
              اسحب أو اختر صورة لرؤية باقي الصور
            </div>
          )}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1 className="page-title mt-2">{product.name}</h1>
          <p className="mt-3 text-sm leading-8 text-muted">
            {product.description}
          </p>
          <p className="mt-5 font-display text-3xl text-terracotta">
            {money(product.priceCents)}
          </p>
          <p className="mt-2 text-xs text-muted">
            من {store?.name} · {store?.neighborhood}
          </p>
          <button
            type="button"
            onClick={() => onAdd(product.id)}
            className="primary-button mt-6"
          >
            أضف إلى السلة <ShoppingBag className="h-4 w-4" />
          </button>
        </div>
      </div>
      <section className="reviews-section mt-12">
        <div className="reviews-head">
          <div>
            <p className="eyebrow">تجارب العملاء</p>
            <h2 className="section-title">آراء من جرّبوا المنتج</h2>
          </div>
          <span className="review-count">{reviews.length} آراء</span>
        </div>
        <form onSubmit={submitReview} className="review-form mt-6">
          <div className="star-picker" aria-label="اختر التقييم">
            {[1, 2, 3, 4, 5].map(value => (
              <button
                type="button"
                key={value}
                onClick={() => setRating(value)}
                className={value <= rating ? "selected" : ""}
                aria-label={`${value} نجوم`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={review}
            onChange={event => setReview(event.target.value)}
            placeholder="اكتب رأيك عن المنتج..."
            className="message-textarea"
          />
          <button className="primary-button">
            نشر الرأي <Send className="h-4 w-4" />
          </button>
        </form>
        <div className="reviews-list mt-6">
          {reviews.length ? (
            reviews.map((item, index) => (
              <article className="review-card" key={index}>
                <div className="review-card-top">
                  <span className="review-stars">
                    {"★".repeat(item.rating)}
                    {"☆".repeat(5 - item.rating)}
                  </span>
                  <time>
                    {new Date(item.createdAt).toLocaleDateString("ar-JO")}
                  </time>
                </div>
                <p>{item.body}</p>
                <small className="review-author">
                  {item.authorName || "عميل هسّا"}
                </small>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <MessageCircle className="mx-auto h-7 w-7 text-terracotta" />
              <p className="mt-3 text-sm text-muted">
                كن أول من يشارك رأيه عن هذا المنتج.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
function StaffLoginPage({ onAuth }: { onAuth: (user: User) => void }) {
  const [, navigate] = useLocation();
  const [loginLanguage, setLoginLanguage] = useState<"ar" | "en">(
    () => (localStorage.getItem("hassa-staff-language") as "ar" | "en") || "ar"
  );
  const [email, setEmail] = useState("tcs@hassa.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.dir = loginLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = loginLanguage;
    localStorage.setItem("hassa-staff-language", loginLanguage);
  }, [loginLanguage]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        json: { email, password },
      });
      if (result.user.role !== "staff")
        throw new Error("هذا الدخول مخصص لموظفي خدمة العملاء.");
      onAuth(result.user);
      navigate("/staff");
    } catch (error) {
      setMessage(
        loginLanguage === "ar"
          ? error instanceof Error
            ? error.message
            : "تعذر تسجيل الدخول."
          : "Unable to sign in. Check your staff email and password."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="staff-login-page">
      <div className="staff-login-brand">
        <Logo href="/staff" language={loginLanguage} />
        <div className="staff-login-actions">
          <select
            className="staff-language-prelogin"
            value={loginLanguage}
            onChange={event =>
              setLoginLanguage(event.target.value as "ar" | "en")
            }
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
          <Link href="/shop">
            {loginLanguage === "ar" ? "العودة للمتجر" : "Back to shop"}{" "}
            <ArrowLeft className="inline h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="staff-login-card">
        <span className="eyebrow">
          <ShieldCheck className="inline h-4 w-4" />{" "}
          {loginLanguage === "ar" ? "دخول فريق الدعم" : "Support team login"}
        </span>
        <h1 className="page-title mt-5">
          {loginLanguage === "ar"
            ? "أهلاً بفريق هسّا"
            : "Welcome to Hassa support"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          {loginLanguage === "ar"
            ? "تابع محادثات العملاء وردّ عليهم من مساحة واحدة واضحة وسريعة."
            : "Manage customer conversations and reply from one clear, fast workspace."}
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="field-label">
            {loginLanguage === "ar" ? "البريد الإلكتروني" : "Email address"}
            <div className="field-wrap staff-field-wrap">
              <Mail className="h-4 w-4 text-muted" />
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder={
                  loginLanguage === "ar"
                    ? "أدخل بريد الموظف"
                    : "Enter staff email"
                }
                required
              />
            </div>
          </label>
          <label className="field-label">
            {loginLanguage === "ar" ? "كلمة المرور" : "Password"}
            <div className="field-wrap staff-field-wrap">
              <KeyRound className="h-4 w-4 text-muted" />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={
                  loginLanguage === "ar" ? "أدخل كلمة المرور" : "Enter password"
                }
                required
              />
            </div>
          </label>
          {message && (
            <div className="error-message">
              <X className="h-4 w-4" /> {message}
            </div>
          )}
          <button
            disabled={busy}
            className="primary-button w-full justify-center"
          >
            {busy
              ? loginLanguage === "ar"
                ? "جارٍ الدخول..."
                : "Signing in..."
              : loginLanguage === "ar"
                ? "دخول لوحة الدعم"
                : "Open support workspace"}
            <ArrowLeft className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function StaffDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [selected, setSelected] = useState<StaffConversation | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<
    "conversations" | "queue" | "activity" | "search" | "customer" | "settings"
  >(
    () =>
      (localStorage.getItem("hassa-staff-view") as
        | "conversations"
        | "queue"
        | "activity"
        | "search"
        | "customer"
        | "settings") || "conversations"
  );
  const [staffLanguage, setStaffLanguage] = useState<"ar" | "en">(
    () => (localStorage.getItem("hassa-staff-language") as "ar" | "en") || "ar"
  );
  const [activeTab, setActiveTab] = useState<"open" | "closed">(
    () =>
      (localStorage.getItem("hassa-staff-tab") as "open" | "closed") || "open"
  );
  const [closedKeys, setClosedKeys] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hassa-staff-closed") || "[]");
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerLookup[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerLookup | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [lightMode, setLightMode] = useState(
    () => localStorage.getItem("hassa-staff-theme") === "light"
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("hassa-staff-sound") !== "off"
  );
  const [desktopAlerts, setDesktopAlerts] = useState(
    () => localStorage.getItem("hassa-staff-alerts") !== "off"
  );
  const [soundVolume, setSoundVolume] = useState(() => {
    const stored = localStorage.getItem("hassa-staff-volume");
    const value = stored === null ? 0.92 : Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.92;
  });
  const soundAudio = useRef<
    Partial<
      Record<
        "assigned" | "customerMessage" | "closed",
        { audio: HTMLAudioElement; gain?: GainNode }
      >
    >
  >({});
  const soundContext = useRef<AudioContext | null>(null);
  const soundSnapshot = useRef<
    Map<string, { messageId: number; closed: boolean }>
  >(new Map());
  const load = () =>
    api<{ conversations: StaffConversation[]; closedKeys?: string[] }>(
      "/api/staff/conversations"
    )
      .then(result => {
        let legacy: string[] = [];
        try {
          legacy = JSON.parse(
            localStorage.getItem("hassa-staff-closed") || "[]"
          );
        } catch {
          legacy = [];
        }
        const closedSet = new Set([
          ...(result.closedKeys || []),
          ...legacy,
          ...result.conversations
            .filter(item => item.closed)
            .map(item => item.key),
        ]);
        const synced = result.conversations.map(item => ({
          ...item,
          closed: closedSet.has(item.key),
        }));
        setConversations(synced);
        setClosedKeys(Array.from(closedSet));
        setSelected(current =>
          current
            ? synced.find(item => item.key === current.key) || current
            : synced.find(
                item =>
                  item.key === localStorage.getItem("hassa-staff-selected")
              ) ||
              synced[0] ||
              null
        );
      })
      .catch(() => undefined);
  const getSoundPlayer = (kind: "assigned" | "customerMessage" | "closed") => {
    const existing = soundAudio.current[kind];
    if (existing) return existing;
    const sources = {
      assigned: "/audio/support-new-chat.mp3",
      customerMessage: "/audio/support-open-chat-message.mp3",
      closed: "/audio/support-chat-closed.mp3",
    };
    const audio = new Audio(sources[kind]);
    audio.preload = "auto";
    audio.volume = 1;
    let gain: GainNode | undefined;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        soundContext.current ||= new AudioContextClass();
        const source = soundContext.current.createMediaElementSource(audio);
        gain = soundContext.current.createGain();
        source.connect(gain).connect(soundContext.current.destination);
      }
    } catch {
      // The native audio element remains as a safe fallback.
    }
    const player = { audio, gain };
    soundAudio.current[kind] = player;
    audio.load();
    return player;
  };
  const playSupportSound = (
    kind: "assigned" | "customerMessage" | "closed",
    volumeOverride?: number
  ) => {
    const volume = volumeOverride ?? soundVolume;
    if (!soundEnabled || volume <= 0) return;
    const player = getSoundPlayer(kind);
    player.gain
      ? (player.gain.gain.value = volume)
      : (player.audio.volume = volume);
    const audio = player.audio;
    audio.currentTime = 0;
    void soundContext.current?.resume().catch(() => undefined);
    void audio.play().catch(() => undefined);
  };
  const updateSoundVolume = (value: number, preview = false) => {
    const next = Math.min(1, Math.max(0, value));
    setSoundVolume(next);
    localStorage.setItem("hassa-staff-volume", String(next));
    Object.values(soundAudio.current).forEach(player => {
      if (player) {
        player.gain
          ? (player.gain.gain.value = next)
          : (player.audio.volume = next);
      }
    });
    if (preview) playSupportSound("customerMessage", next);
  };
  useEffect(() => {
    const sources = {
      assigned: "/audio/support-new-chat.mp3",
      customerMessage: "/audio/support-open-chat-message.mp3",
      closed: "/audio/support-chat-closed.mp3",
    } as const;
    (Object.keys(sources) as Array<keyof typeof sources>).forEach(kind => {
      getSoundPlayer(kind);
    });
    return () => {
      Object.values(soundAudio.current).forEach(player =>
        player?.audio.pause()
      );
      soundContext.current?.close().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!conversations.length) return;
    const previous = soundSnapshot.current;
    const next = new Map<string, { messageId: number; closed: boolean }>();
    conversations.forEach(item => {
      const closed = closedKeys.includes(item.key);
      const prior = previous.get(item.key);
      if (prior) {
        if (
          item.lastMessage.id !== prior.messageId &&
          item.lastMessage.senderRole !== "staff"
        )
          playSupportSound("customerMessage");
        if (closed && !prior.closed) playSupportSound("closed");
      }
      next.set(item.key, { messageId: item.lastMessage.id, closed });
    });
    soundSnapshot.current = next;
  }, [conversations, closedKeys, soundEnabled, soundVolume]);
  useEffect(() => {
    localStorage.setItem("hassa-staff-view", view);
    localStorage.setItem("hassa-staff-tab", activeTab);
  }, [view, activeTab]);
  useEffect(() => {
    if (!selected?.userId) {
      setMessages([]);
      return;
    }
    api<{ messages: SupportMessage[] }>(
      `/api/staff/messages?userId=${selected.userId}${selected.orderNumber ? `&orderNumber=${encodeURIComponent(selected.orderNumber)}` : ""}`
    )
      .then(result => setMessages(result.messages))
      .catch(() => undefined);
  }, [selected?.key]);
  useEffect(() => {
    document.documentElement.classList.toggle("light", lightMode);
    localStorage.setItem("hassa-staff-theme", lightMode ? "light" : "dark");
  }, [lightMode]);
  useEffect(() => {
    if (view !== "search" || query.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    setCustomerLoading(true);
    const timer = window.setTimeout(
      () =>
        api<{ customers: CustomerLookup[] }>(
          `/api/staff/customers/search?q=${encodeURIComponent(query.trim())}`
        )
          .then(result => setCustomerResults(result.customers))
          .catch(() => setCustomerResults([]))
          .finally(() => setCustomerLoading(false)),
      250
    );
    return () => window.clearTimeout(timer);
  }, [query, view]);
  useEffect(() => {
    document.documentElement.dir = staffLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = staffLanguage;
    localStorage.setItem("hassa-staff-language", staffLanguage);
    const map: Record<string, string> = {
      هـ: "H",
      هسّا: "Hassa",
      "صندوق المحادثات": "Conversation inbox",
      المحادثات: "Conversations",
      "فلترة باسم العميل أو البريد": "Filter by customer name or email",
      "Inbox المفتوح": "Open inbox",
      المغلقة: "Closed",
      "لا توجد محادثات بعد": "No conversations yet",
      "ستظهر هنا المحادثات التي تحتاج متابعة.":
        "Conversations that need attention will appear here.",
      "محادثة مباشرة": "Live conversation",
      "إغلاق الشات": "Close chat",
      "إعادة فتح": "Reopen",
      "اكتب ردًا واضحًا للعميل...": "Write a clear reply to the customer...",
      "إرسال الرد": "Send reply",
      "اختر محادثة": "Choose a conversation",
      "ابدأ محادثة جديدة أو اخترها من القائمة.":
        "Start a new conversation or choose one from the list.",
      الإعدادات: "Settings",
      خروج: "Log out",
      "طابور التوزيع": "Assignment queue",
      "الحالة والنشاط": "Status & activity",
      "بحث عن عميل": "Search customer",
      "إعدادات الحساب": "Account settings",
      توزيع: "Assignment",
      "الحد النشط المسموح: محادثتان": "Active limit: 2 conversations",
      "كل المفتوحة · تحتاج متابعة من الفريق": "All open · Team follow-up",
      "غير المعيّنة · جاهزة للاستلام": "Unassigned · Ready to claim",
      "queue هادئ حاليًا — ستظهر المحادثات الجديدة هنا عند الحاجة إلى توزيعها.":
        "Queue is quiet — new conversations will appear here when needed.",
      المتابعة: "Monitoring",
      "هل أنت جاهز الآن؟": "Are you ready now?",
      "متاح لاستقبال محادثات": "Available for new conversations",
      "بدء الوردية": "Start shift",
      "إنهاء الوردية": "End shift",
      "سجل النشاط · آخر محادثاتك": "Activity log · Your recent conversations",
      الحساب: "Account",
      "غيّر كلمة المرور وتفضيلات تنبيهات الدعم واللغة من هذا الجهاز.":
        "Change your password, support alerts, and language preferences on this device.",
      "تغيير كلمة المرور": "Change password",
      "حفظ كلمة المرور": "Save password",
      "تنبيهات الدعم": "Support alerts",
      "أصوات الإشعارات": "Notification sounds",
      "تنبيهات التوزيع والرسائل والإغلاق":
        "Assignment, message, and closure alerts",
      "الوضع الداكن": "Dark mode",
      "مستوى الصوت": "Volume level",
      "مدة ظهور الإشعار": "Notification duration",
      "أصوات الحالات": "Event sounds",
      "اختبار النغمة المختارة": "Test selected tone",
      اللغة: "Language",
      العربية: "Arabic",
      English: "English",
      "ابحث بالبريد أو رقم الهاتف أو رقم الطلب.":
        "Search by email, phone number, or order number.",
      "الوصول السريع": "Quick access",
      "ابحث عن عميل": "Search for a customer",
      "ابحث بالاسم أو البريد أو رقم الطلب":
        "Search by name, email, or order number",
      "لا توجد نتائج.": "No results.",
      "موظفو خدمة العملاء": "Customer service staff",
      "ابحث عن حساب العميل": "Search customer account",
      "البريد، الهاتف، أو رقم الطلب": "Email, phone, or order number",
      "جارٍ البحث...": "Searching...",
      "لا توجد حسابات مطابقة.": "No matching accounts.",
      "الطلبات السابقة": "Previous orders",
      "الاسم الكامل": "Full name",
      "رقم الهاتف": "Phone number",
      الطلبات: "Orders",
      "تفاصيل الحساب": "Account details",
      "العودة إلى نتائج البحث": "Back to search results",
      "لا توجد طلبات سابقة.": "No previous orders.",
      "إخفاء التفاصيل": "Hide details",
      "اضغط لعرض تفاصيل الحساب": "Click to view account details",
      "غير مضاف": "Not added",
      "نتائج العملاء": "Customer results",
      " · تغيير المستوى فقط": " · Change level only",
      "Event sounds": "Event sounds",
      "محادثة جديدة عند الموظف: محادثة جديدة عند الموظف":
        "New staff conversation: New staff conversation",
      "رسالة داخل شات مفتوح: رسالة داخل شات مفتوح":
        "Message in open chat: Message in open chat",
      "إغلاق الشات من العميل: إغلاق الشات من العميل":
        "Customer closed chat: Customer closed chat",
      ثوانٍ: "seconds",
      "0% · تغيير المستوى فقط": "0% · Change level only",
      "10ثوانٍ": "10 seconds",
      "10 ثوانٍ": "10 seconds",
      التوزيع: "Assignment",
      "queue الدعم في شاشة مستقلة. راجع المحادثات التي تنتظر التوزيع واستلم ما يناسبك دون خلطها مع حالتك ونشاطك.":
        "The support queue is independent. Review waiting conversations, claim what fits, and keep assignment separate from your status and activity.",
      "queue مستقل عن شاشة المحادثة وعن صفحة حالتك.":
        "The queue is separate from the conversation screen and your status page.",
      "مفتوحة عندك": "Open with you",
      أغلقتها: "Closed by you",
      "تحكم بتوافرك ووردية العمل، وشاهد ملخص محادثاتك من دون خلط الحالة مع شاشة المحادثات أو queue التوزيع.":
        "Control your availability and shift, and review your activity without mixing it with conversations or the assignment queue.",
      "عندما تكون متاحًا يمكن للنظام توزيع محادثات جديدة عليك.":
        "When available, the system can assign new conversations to you.",
      "ابحث بالبريد أو رقم الهاتف أو رقم الطلب. تظهر البيانات اللازمة للدعم فقط.":
        "Search by email, phone number, or order number. Only the information needed for support is shown.",
      "كلمة المرور الحالية": "Current password",
      "كلمة المرور الجديدة": "New password",
      "محادثة جديدة عند الموظف:": "New staff conversation:",
      "رسالة داخل شات مفتوح:": "Message in open chat:",
      "إغلاق الشات من العميل:": "Customer closed chat:",
    };
    const inverse: Record<string, string> = Object.fromEntries(
      Object.entries(map).map(([ar, en]) => [en, ar])
    );
    const active = staffLanguage === "en" ? map : inverse;
    const root = document.querySelector(".staff-shell");
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const replacements = Object.entries(active).sort(
      ([a], [b]) => b.length - a.length
    );
    const replaceText = (raw: string) => {
      let next = raw;
      for (const [from, to] of replacements) {
        if (from && next.includes(from)) next = next.split(from).join(to);
      }
      return next;
    };
    nodes.forEach(node => {
      const raw = node.nodeValue || "";
      if (raw.trim()) node.nodeValue = replaceText(raw);
    });
    root
      .querySelectorAll<HTMLInputElement>(
        "input, textarea, button, a, [title], [aria-label]"
      )
      .forEach(input => {
        for (const attr of ["placeholder", "title", "aria-label"]) {
          const value = input.getAttribute(attr);
          if (value) input.setAttribute(attr, replaceText(value));
        }
      });
  }, [
    staffLanguage,
    view,
    activeTab,
    selected?.key,
    messages.length,
    conversations.length,
  ]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected?.userId || !body.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ message: SupportMessage }>(
        "/api/staff/messages",
        {
          method: "POST",
          json: {
            userId: selected.userId,
            orderNumber: selected.orderNumber,
            topic: selected.topic,
            body: body.trim(),
          },
        }
      );
      setMessages(current => [...current, result.message]);
      setBody("");
      load();
    } finally {
      setBusy(false);
    }
  };
  const navigateView = (next: typeof view) => {
    setView(next);
    localStorage.setItem("hassa-staff-view", next);
    setMenuOpen(false);
    setSettingsOpen(false);
  };
  const filtered = conversations.filter(
    item =>
      (activeTab === "closed"
        ? closedKeys.includes(item.key)
        : !closedKeys.includes(item.key)) &&
      `${item.userName} ${item.userEmail} ${item.orderNumber || ""}`
        .toLocaleLowerCase("ar")
        .includes(query.toLocaleLowerCase("ar"))
  );
  const selectConversation = (conversation: StaffConversation) => {
    setSelected(conversation);
    localStorage.setItem("hassa-staff-selected", conversation.key);
  };
  const toggleClosed = (key: string) => {
    const nextClosed = !closedKeys.includes(key);
    setClosedKeys(current =>
      nextClosed ? [...current, key] : current.filter(item => item !== key)
    );
    setConversations(current =>
      current.map(item =>
        item.key === key ? { ...item, closed: nextClosed } : item
      )
    );
    void api("/api/staff/conversations/close", {
      method: "POST",
      json: { key, closed: nextClosed },
    })
      .then(() => load())
      .catch(() => load());
  };
  const menuItems =
    staffLanguage === "en"
      ? ([
          ["conversations", "Conversations", MessageCircle],
          ["queue", "Assignment queue", PackageCheck],
          ["activity", "Status & activity", Activity],
          ["search", "Search customer", Search],
          ["settings", "Account settings", UserRound],
        ] as const)
      : ([
          ["conversations", "المحادثات", MessageCircle],
          ["queue", "طابور التوزيع", PackageCheck],
          ["activity", "الحالة والنشاط", Activity],
          ["search", "بحث عن عميل", Search],
          ["settings", "إعدادات الحساب", UserRound],
        ] as const);
  const utility =
    view === "queue" ? (
      <div className="staff-utility-card">
        <PackageCheck className="staff-utility-icon" />
        <p className="eyebrow">التوزيع</p>
        <h2>طابور التوزيع</h2>
        <p>
          queue الدعم في شاشة مستقلة. راجع المحادثات التي تنتظر التوزيع واستلم
          ما يناسبك دون خلطها مع حالتك ونشاطك.
        </p>
        <div className="staff-stat-grid">
          <div>
            <strong>{conversations.length.toString().padStart(2, "0")}</strong>
            <span>كل المفتوحة · تحتاج متابعة من الفريق</span>
          </div>
          <div>
            <strong>
              {conversations
                .filter(item => item.unread > 0)
                .length.toString()
                .padStart(2, "0")}
            </strong>
            <span>غير المعيّنة · جاهزة للاستلام</span>
          </div>
        </div>
        <div className="staff-queue-note">
          <strong>الحد النشط المسموح: محادثتان</strong>
          <p>queue مستقل عن شاشة المحادثة وعن صفحة حالتك.</p>
          <span>
            queue هادئ حاليًا — ستظهر المحادثات الجديدة هنا عند الحاجة إلى
            توزيعها.
          </span>
        </div>
      </div>
    ) : view === "activity" ? (
      <div className="staff-utility-card">
        <Activity className="staff-utility-icon" />
        <p className="eyebrow">المتابعة</p>
        <h2>الحالة والنشاط</h2>
        <p>
          تحكم بتوافرك ووردية العمل، وشاهد ملخص محادثاتك من دون خلط الحالة مع
          شاشة المحادثات أو queue التوزيع.
        </p>
        <div className="staff-availability">
          <strong>هل أنت جاهز الآن؟</strong>
          <small>عندما تكون متاحًا يمكن للنظام توزيع محادثات جديدة عليك.</small>
          <label>
            <input type="checkbox" defaultChecked /> متاح لاستقبال محادثات
          </label>
          <div>
            <button type="button">بدء الوردية</button>
            <button type="button">إنهاء الوردية</button>
          </div>
        </div>
        <div className="staff-stat-grid">
          <div>
            <strong>{conversations.length}</strong>
            <span>مفتوحة عندك</span>
          </div>
          <div>
            <strong>0</strong>
            <span>أغلقتها</span>
          </div>
        </div>
        <h3 className="staff-subheading">سجل النشاط · آخر محادثاتك</h3>
        <div className="staff-activity-list">
          {conversations.slice(0, 6).map(item => (
            <div key={item.key}>
              <span className="staff-avatar">{item.userName.slice(0, 1)}</span>
              <p>
                <strong>{item.userName}</strong>
                <small>{item.lastMessage.body}</small>
              </p>
              <time>
                {new Date(item.lastMessage.createdAt).toLocaleTimeString(
                  "ar-JO",
                  { hour: "2-digit", minute: "2-digit" }
                )}
              </time>
            </div>
          ))}
        </div>
      </div>
    ) : view === "search" ? (
      <div className="staff-utility-card staff-search-card">
        <Search className="staff-utility-icon" />
        <p className="eyebrow">موظفو خدمة العملاء</p>
        <h2>ابحث عن حساب العميل</h2>
        <p>
          ابحث بالبريد أو رقم الهاتف أو رقم الطلب. تظهر البيانات اللازمة للدعم
          فقط.
        </p>
        <input
          className="staff-customer-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="البريد، الهاتف، أو رقم الطلب"
        />
        {customerLoading && (
          <p className="staff-search-status">جارٍ البحث...</p>
        )}
        <div className="staff-customer-results">
          <p className="staff-results-label">نتائج العملاء</p>
          {customerResults.map(customer => (
            <button
              type="button"
              className="staff-customer-result-row"
              key={customer.id}
              onClick={() => {
                setSelectedCustomer(customer);
                setView("customer");
              }}
            >
              <span className="staff-avatar">{customer.name.slice(0, 1)}</span>
              <span>
                <strong>{customer.name}</strong>
                <small>
                  {customer.email}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </small>
              </span>
              <ChevronLeft className="h-4 w-4" />
            </button>
          ))}
          {query.trim().length >= 2 &&
            !customerLoading &&
            !customerResults.length && (
              <p className="staff-search-status">لا توجد حسابات مطابقة.</p>
            )}
        </div>
      </div>
    ) : view === "customer" && selectedCustomer ? (
      <div className="staff-utility-card staff-customer-profile">
        <button
          type="button"
          className="staff-back-search"
          onClick={() => setView("search")}
        >
          <ArrowRight className="h-4 w-4" /> العودة إلى نتائج البحث
        </button>
        <div className="staff-profile-heading">
          <span className="staff-profile-avatar">
            {selectedCustomer.name.slice(0, 1)}
          </span>
          <div>
            <p className="eyebrow">تفاصيل الحساب</p>
            <h2>{selectedCustomer.name}</h2>
            <p>{selectedCustomer.email}</p>
          </div>
        </div>
        <div className="staff-detail-grid staff-detail-grid-large">
          <span>
            <small>الاسم الكامل</small>
            <b>{selectedCustomer.name}</b>
          </span>
          <span>
            <small>البريد الإلكتروني</small>
            <b>{selectedCustomer.email}</b>
          </span>
          <span>
            <small>رقم الهاتف</small>
            <b>{selectedCustomer.phone || "غير مضاف"}</b>
          </span>
          <span>
            <small>المحادثات</small>
            <b>{selectedCustomer.conversationCount}</b>
          </span>
        </div>
        <h3 className="staff-subheading">
          الطلبات السابقة ({selectedCustomer.orders.length})
        </h3>
        {selectedCustomer.orders.length ? (
          <div className="staff-order-history">
            {selectedCustomer.orders.map(order => (
              <div className="staff-order-detail" key={order.orderNumber}>
                <div>
                  <strong>{order.orderNumber}</strong>
                  <small>
                    {order.storeName} ·{" "}
                    {order.items
                      .map(item => `${item.productName} ×${item.quantity}`)
                      .join("، ")}
                  </small>
                </div>
                <em>
                  {(order.totalCents / 100).toFixed(2)} د.أ · {order.status}
                </em>
              </div>
            ))}
          </div>
        ) : (
          <div className="staff-no-orders">
            <Package className="h-5 w-5" />
            <p>لا توجد طلبات سابقة.</p>
          </div>
        )}
        <div className="staff-profile-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              const match = conversations.find(
                item => item.userId === selectedCustomer.id
              );
              if (match) {
                setSelected(match);
                setView("conversations");
              }
            }}
          >
            فتح محادثة العميل
          </button>
        </div>
      </div>
    ) : (
      <div className="staff-utility-card">
        <UserRound className="staff-utility-icon" />
        <p className="eyebrow">الحساب</p>
        <h2>إعدادات الحساب</h2>
        <p>غيّر كلمة المرور وتفضيلات تنبيهات الدعم واللغة من هذا الجهاز.</p>
        <h3 className="staff-subheading">تغيير كلمة المرور</h3>
        <div className="staff-settings-form">
          <input
            className="staff-customer-search"
            type="password"
            placeholder="كلمة المرور الحالية"
          />
          <input
            className="staff-customer-search"
            type="password"
            placeholder="كلمة المرور الجديدة"
          />
          <button type="button" className="primary-button">
            حفظ كلمة المرور
          </button>
        </div>
        <h3 className="staff-subheading">تنبيهات الدعم</h3>
        <div className="staff-settings-list">
          <label>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={event => {
                setSoundEnabled(event.target.checked);
                localStorage.setItem(
                  "hassa-staff-sound",
                  event.target.checked ? "on" : "off"
                );
              }}
            />{" "}
            أصوات الإشعارات
          </label>
          <label>
            <input
              type="checkbox"
              checked={desktopAlerts}
              onChange={event => {
                setDesktopAlerts(event.target.checked);
                localStorage.setItem(
                  "hassa-staff-alerts",
                  event.target.checked ? "on" : "off"
                );
              }}
            />{" "}
            تنبيهات التوزيع والرسائل والإغلاق
          </label>
          <label>
            <input
              type="checkbox"
              checked={!lightMode}
              onChange={event => setLightMode(!event.target.checked)}
            />{" "}
            الوضع الداكن
          </label>
          <label className="staff-range-label">
            {staffLanguage === "ar" ? "مستوى الصوت" : "Volume level"}{" "}
            <input
              aria-label={
                staffLanguage === "ar"
                  ? "مستوى صوت الإشعارات"
                  : "Notification volume"
              }
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={event => updateSoundVolume(Number(event.target.value))}
              onPointerUp={event =>
                updateSoundVolume(Number(event.currentTarget.value), true)
              }
              onKeyUp={event =>
                updateSoundVolume(Number(event.currentTarget.value), true)
              }
            />{" "}
            <small>
              {Math.round(soundVolume * 100)}% ·{" "}
              {staffLanguage === "ar"
                ? "تعمل معاينة عند تثبيت المستوى"
                : "Preview plays when the level is set"}
            </small>
          </label>
          <label>
            {staffLanguage === "ar"
              ? "مدة ظهور الإشعار"
              : "Notification duration"}{" "}
            <select defaultValue="10">
              <option value="5">
                {staffLanguage === "ar" ? "5 ثوانٍ" : "5 seconds"}
              </option>
              <option value="10">
                {staffLanguage === "ar" ? "10 ثوانٍ" : "10 seconds"}
              </option>
              <option value="30">
                {staffLanguage === "ar" ? "30 ثانية" : "30 seconds"}
              </option>
            </select>
          </label>
        </div>
        <h3 className="staff-subheading">
          {staffLanguage === "ar" ? "أصوات الحالات" : "Event sounds"}
        </h3>
        <div className="staff-sound-files">
          <span>
            {staffLanguage === "ar"
              ? "محادثة جديدة عند الموظف: محادثة جديدة عند الموظف"
              : "New staff conversation: New staff conversation"}
          </span>
          <span>
            {staffLanguage === "ar"
              ? "رسالة داخل شات مفتوح: رسالة داخل شات مفتوح"
              : "Message in open chat: Message in open chat"}
          </span>
          <span>
            {staffLanguage === "ar"
              ? "إغلاق الشات من العميل: إغلاق الشات من العميل"
              : "Customer closed chat: Close chat from customer"}
          </span>
          <div className="staff-sound-test-grid">
            <button
              type="button"
              className="small-outline-button"
              onClick={() => playSupportSound("assigned")}
            >
              {staffLanguage === "ar"
                ? "محادثة جديدة عند الموظف"
                : "New staff conversation"}
            </button>
            <button
              type="button"
              className="small-outline-button"
              onClick={() => playSupportSound("customerMessage")}
            >
              {staffLanguage === "ar"
                ? "رسالة داخل شات مفتوح"
                : "Message in open chat"}
            </button>
            <button
              type="button"
              className="small-outline-button"
              onClick={() => playSupportSound("closed")}
            >
              {staffLanguage === "ar"
                ? "إغلاق الشات من العميل"
                : "Customer closed chat"}
            </button>
          </div>
        </div>
        <h3 className="staff-subheading">اللغة</h3>
        <select
          className="staff-customer-search"
          value={staffLanguage}
          onChange={event =>
            setStaffLanguage(event.target.value as "ar" | "en")
          }
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>
    );
  return (
    <div className="staff-shell">
      <header className="staff-header">
        <Logo href="/staff" language={staffLanguage} />
        <div className="staff-header-actions">
          <button
            type="button"
            className="staff-icon-action"
            onClick={() => navigateView("conversations")}
            title="المحادثات"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="staff-icon-action"
            onClick={() => setLightMode(value => !value)}
            title="تبديل المظهر"
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="staff-icon-action"
            onClick={() => setMenuOpen(value => !value)}
            title="القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>
          {menuOpen && (
            <nav className="staff-menu">
              {menuItems.map(([key, label, Icon]) => (
                <button
                  type="button"
                  key={key}
                  className={view === key ? "active" : ""}
                  onClick={() => navigateView(key)}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
              <button
                type="button"
                className="staff-menu-logout"
                onClick={onLogout}
              >
                <X className="h-4 w-4" />{" "}
                {staffLanguage === "ar" ? "تسجيل الخروج" : "Log out"}
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="staff-main-area">
        {view === "conversations" ? (
          <div className="staff-workspace">
            <aside className="staff-inbox">
              <div className="staff-inbox-head">
                <div>
                  <p className="eyebrow">صندوق المحادثات</p>
                  <h1 className="section-title">المحادثات</h1>
                </div>
                <span className="status-badge">{conversations.length}</span>
              </div>
              <input
                className="staff-inbox-filter"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="فلترة باسم العميل أو البريد"
              />
              <div className="staff-inbox-tabs">
                <button
                  type="button"
                  className={activeTab === "open" ? "active" : ""}
                  onClick={() => {
                    setActiveTab("open");
                    setView("conversations");
                    setMenuOpen(false);
                  }}
                >
                  Inbox المفتوح{" "}
                  <b>
                    {conversations.length -
                      closedKeys.filter(key =>
                        conversations.some(item => item.key === key)
                      ).length}
                  </b>
                </button>
                <button
                  type="button"
                  className={activeTab === "closed" ? "active" : ""}
                  onClick={() => {
                    setActiveTab("closed");
                    setView("conversations");
                    setMenuOpen(false);
                  }}
                >
                  المغلقة <b>{closedKeys.length}</b>
                </button>
              </div>
              <div className="staff-conversation-list">
                {filtered.length ? (
                  filtered.map(item => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => selectConversation(item)}
                      className={`staff-conversation ${selected?.key === item.key ? "active" : ""}`}
                    >
                      <span className="staff-avatar">
                        {item.userName.slice(0, 1)}
                      </span>
                      <span className="staff-conversation-copy">
                        <strong>{item.userName}</strong>
                        <small>{item.orderNumber || item.topic}</small>
                        <em>{item.lastMessage.body}</em>
                      </span>
                      {item.unread > 0 && <b>{item.unread}</b>}
                    </button>
                  ))
                ) : (
                  <div className="staff-empty">
                    <MessageCircle className="mx-auto h-8 w-8 text-terracotta" />
                    <h3>لا توجد محادثات بعد</h3>
                    <p>ستظهر هنا المحادثات التي تحتاج متابعة.</p>
                  </div>
                )}
              </div>
            </aside>
            <section className="staff-chat">
              {selected ? (
                <>
                  <div className="staff-chat-head">
                    <div>
                      <p className="eyebrow">محادثة مباشرة</p>
                      <h2>{selected.userName}</h2>
                      <p>
                        {selected.userEmail}
                        {selected.orderNumber
                          ? ` · الطلب ${selected.orderNumber}`
                          : ""}
                      </p>
                    </div>
                    <div className="staff-chat-head-actions">
                      <span className="topic-pill">{selected.topic}</span>
                      <button
                        type="button"
                        className="staff-close-chat"
                        onClick={() => toggleClosed(selected.key)}
                      >
                        {closedKeys.includes(selected.key)
                          ? "إعادة فتح"
                          : "إغلاق الشات"}
                      </button>
                    </div>
                  </div>
                  <div className="staff-messages">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`staff-message ${message.senderRole === "staff" ? "staff-message-out" : "staff-message-in"}`}
                      >
                        <span>
                          {message.senderName ||
                            (message.senderRole === "staff"
                              ? "الدعم"
                              : selected.userName)}
                        </span>
                        <p>{message.body}</p>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString(
                            "ar-JO",
                            { hour: "2-digit", minute: "2-digit" }
                          )}
                        </time>
                      </div>
                    ))}
                  </div>
                  <form className="staff-compose" onSubmit={send}>
                    <textarea
                      value={body}
                      onChange={event => setBody(event.target.value)}
                      placeholder="اكتب ردًا واضحًا للعميل..."
                    />
                    <button disabled={busy} className="primary-button">
                      إرسال الرد <Send className="h-4 w-4" />
                    </button>
                  </form>
                </>
              ) : (
                <div className="staff-empty staff-empty-large">
                  <MessageCircle className="mx-auto h-10 w-10 text-terracotta" />
                  <h2>اختر محادثة</h2>
                  <p>ابدأ محادثة جديدة أو اخترها من القائمة.</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="staff-utility-wrap">{utility}</div>
        )}
      </main>
    </div>
  );
}

function PartnerLogin({
  role,
  onAuth,
}: {
  role: "merchant" | "rider";
  onAuth: (user: User) => void;
}) {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const merchant = role === "merchant";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        json: { email, password },
      });
      if (result.user.role !== role)
        throw new Error(
          merchant ? "هذا الدخول مخصص للتاجر." : "هذا الدخول مخصص للمندوب."
        );
      onAuth(result.user);
      navigate(merchant ? "/merchant" : "/rider");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    }
  };
  const [language, setLanguage] = useState<"ar" | "en">(
    () =>
      (localStorage.getItem("hassa-merchant-language") as "ar" | "en") || "ar"
  );
  const en = language === "en";
  useEffect(() => {
    document.documentElement.dir = en ? "ltr" : "rtl";
    document.documentElement.lang = en ? "en" : "ar";
    localStorage.setItem("hassa-merchant-language", language);
  }, [en, language]);
  return (
    <main className="merchant-final-login">
      <div className="merchant-final-card">
        <header className="merchant-final-header">
          <Logo href="/shop" language={en ? "en" : "ar"} />
          <div className="merchant-final-actions">
            <button
              type="button"
              className="merchant-language-toggle"
              onClick={() => setLanguage(en ? "ar" : "en")}
              aria-label={en ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
            >
              {en ? "العربية" : "English"}
            </button>
            <Link href="/shop">{en ? "Back to shop" : "العودة للمتجر"}</Link>
          </div>
        </header>
        <div className="merchant-final-heading">
          <div className="merchant-final-mark">
            <Store className="h-5 w-5" />
          </div>
          <p className="eyebrow">
            Hassa ·{" "}
            {merchant
              ? en
                ? "Merchant space"
                : "مساحة التاجر"
              : en
                ? "Rider space"
                : "مساحة المندوب"}
          </p>
          <h1>
            {merchant
              ? en
                ? "Welcome to your store"
                : "مرحبًا بك في متجرك"
              : en
                ? "Welcome back"
                : "مرحبًا بك مجددًا"}
          </h1>
          <p>
            {merchant
              ? en
                ? "Sign in to access your store management dashboard."
                : "سجّل دخولك للوصول إلى لوحة إدارة متجرك."
              : en
                ? "Sign in to access your delivery dashboard."
                : "سجّل دخولك للوصول إلى لوحة التوصيل."}
          </p>
        </div>
        <form onSubmit={submit} className="merchant-final-form">
          <label>
            {en ? "Email address" : "البريد الإلكتروني"}
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder={en ? "Enter your email" : "أدخل بريدك الإلكتروني"}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {en ? "Password" : "كلمة المرور"}
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={en ? "Enter your password" : "أدخل كلمة المرور"}
              autoComplete="current-password"
              required
            />
          </label>
          {message && <p className="admin-error">{message}</p>}
          <button className="primary-button">
            {merchant
              ? en
                ? "Sign in"
                : "تسجيل الدخول"
              : en
                ? "Open rider space"
                : "دخول مساحة المندوب"}{" "}
            <ArrowLeft className="h-4 w-4" />
          </button>
        </form>
        <footer className="merchant-final-footer">
          {en ? "Secure access for Hassa partners" : "دخول آمن لشركاء هسّا"}
        </footer>
      </div>
    </main>
  );
}
function MerchantDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  type MerchantData = {
    stores: StoreInfo[];
    products: Product[];
    orders: Array<Order & { id: number; storeName: string }>;
  };
  const [data, setData] = useState<MerchantData | null>(null);
  const [tab, setTab] = useState<
    | "home"
    | "orders"
    | "analytics"
    | "products"
    | "messages"
    | "archive"
    | "settings"
  >(
    () => "home"
  );
  const [lightMode, setLightMode] = useState(
    () => localStorage.getItem("hassa-merchant-theme") === "light"
  );
  const [headerMenu, setHeaderMenu] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    priceCents: "",
    stock: "",
    description: "",
    imageUrl: "",
    offerLabel: "",
    offerEnabled: false,
  });
  const [orderQuery, setOrderQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [messageOrderNumber, setMessageOrderNumber] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState<"7" | "30" | "90">("30");
  const [archiveType, setArchiveType] = useState("products");
  const [archiveFrom, setArchiveFrom] = useState("");
  const [archiveTo, setArchiveTo] = useState("");
  const [archiveCount, setArchiveCount] = useState(0);
  const [archiveHistory, setArchiveHistory] = useState<Array<{ id: number; type: string; from: string; to: string; count: number; createdAt: string }>>([]);
  const [selectedOrder, setSelectedOrder] = useState<(Order & { id: number; storeName: string }) | null>(null);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [notificationVolume, setNotificationVolume] = useState(60);
  const volumePointerDown = useRef(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const notificationAudioContext = useRef<AudioContext | null>(null);
  const notificationPreviewAudio = useRef<HTMLAudioElement | null>(null);
  const playNotificationTone = (volume: number) => {
    const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100;
    if (normalizedVolume <= 0) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioContextClass) {
      const context = notificationAudioContext.current || new AudioContextClass();
      notificationAudioContext.current = context;
      // Resume and create the oscillator synchronously in the range-input event;
      // delaying creation into a promise can be rejected by autoplay policies.
      void context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 680;
      // Use a perceptual curve so low and high values are clearly different.
      const audibleGain = 0.012 + Math.pow(normalizedVolume, 1.65) * 0.72;
      const start = context.currentTime;
      gain.gain.setValueAtTime(audibleGain, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
      setNotice("تم تشغيل معاينة الصوت.");
      return;
    }
    const audio = notificationPreviewAudio.current || new Audio("/audio/support-open-chat-message.mp3");
    notificationPreviewAudio.current = audio;
    audio.preload = "auto";
    audio.volume = normalizedVolume;
    audio.currentTime = 0;
    void audio.play().then(() => setNotice("تم تشغيل معاينة الصوت.")).catch(() => undefined);
  };
  const testNotificationSound = () => void playNotificationTone(notificationVolume);
  const commitNotificationVolume = async (nextVolume: number) => {
    playNotificationTone(nextVolume);
    await api("/api/merchant/store", {
      method: "PATCH",
      json: { notificationVolume: nextVolume },
    });
    setNotice("تم حفظ مستوى الصوت.");
  };
  const captureLocation = () => {
    if (!navigator.geolocation)
      return setNotice("المتصفح لا يدعم تحديد الموقع.");
    navigator.geolocation.getCurrentPosition(
      async position => {
        await api("/api/merchant/store", {
          method: "PATCH",
          json: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
        setNotice("تم حفظ موقع المتجر.");
        load();
      },
      () => setNotice("تعذر الوصول إلى موقعك.")
    );
  };
  const load = () =>
    api<MerchantData>("/api/merchant/overview")
      .then(setData)
      .catch(() => undefined);
  const loadMessages = () =>
    api<{ messages: SupportMessage[] }>("/api/merchant/messages")
      .then(result => setMessages(result.messages))
      .catch(() => undefined);
  const loadArchive = () =>
    api<{ count: number; history: Array<{ id: number; type: string; from: string; to: string; count: number; createdAt: string }> }>(`/api/merchant/archive?type=${archiveType}`)
      .then(result => { setArchiveCount(result.count); setArchiveHistory(result.history); })
      .catch(() => undefined);
  const archiveData = async () => {
    if (!window.confirm("سيتم حذف البيانات المحددة نهائيًا. هل تريد المتابعة؟"))
      return;
    await api("/api/merchant/archive", {
      method: "POST",
      json: { type: archiveType, from: archiveFrom, to: archiveTo },
    });
    setNotice("تمت أرشفة وحذف البيانات المحددة.");
    loadArchive();
    load();
  };
  useEffect(() => {
    localStorage.setItem("hassa-merchant-tab", tab);
  }, [tab]);
  useEffect(() => {
    if (tab === "archive") loadArchive();
  }, [tab, archiveType]);
  useEffect(() => {
    load();
    loadMessages();
    const timer = window.setInterval(() => {
      load();
      loadMessages();
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);
  const store = data?.stores[0];
  useEffect(() => {
    setNotificationVolume(Number(store?.notificationVolume ?? 60));
  }, [store?.notificationVolume]);
  const updateProduct = async (product: Product, patch: object) => {
    await api(`/api/merchant/products/${product.id}`, {
      method: "PATCH",
      json: patch,
    });
    load();
  };
  const addProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    await api("/api/merchant/products", {
      method: "POST",
      json: {
        name: newProduct.name,
        category: newProduct.category || store?.category,
        priceCents: Math.round(Number(newProduct.priceCents || 0) * 100),
        stock: Number(newProduct.stock || 0),
        description: newProduct.description,
        imageUrl: newProduct.imageUrl,
        images: newProduct.imageUrl.split(/\s*,\s*/).filter(Boolean),
        offerLabel: newProduct.offerLabel,
        offerEnabled: newProduct.offerEnabled,
      },
    });
    setNewProduct({
      name: "",
      category: "",
      priceCents: "",
      stock: "",
      description: "",
      imageUrl: "",
      offerLabel: "",
      offerEnabled: false,
    });
    setNotice("تمت إضافة المنتج.");
    load();
  };
  const uploadProductImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 6);
    if (!files.length) return;
    setUploadBusy(true);
    try {
      const form = new FormData();
      files.forEach(file => form.append("images", file));
      const result = await api<{ images: string[] }>("/api/merchant/uploads", { method: "POST", body: form });
      setNewProduct(current => ({ ...current, imageUrl: [...current.imageUrl.split(/\s*,\s*/).filter(Boolean), ...result.images].slice(0, 6).join(", ") }));
      setNotice(`تم رفع ${result.images.length} صورة بنجاح.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر رفع الصور.");
    } finally {
      setUploadBusy(false);
      event.target.value = "";
    }
  };
  const removeUploadedImage = (image: string) => {
    setNewProduct(current => ({
      ...current,
      imageUrl: current.imageUrl
        .split(/\s*,\s*/)
        .filter(item => item && item !== image)
        .join(", "),
    }));
    setNotice("تم حذف الصورة من المنتج.");
  };
  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`حذف ${product.name}؟`)) return;
    await api(`/api/merchant/products/${product.id}`, { method: "DELETE" });
    setNotice("تم حذف المنتج.");
    load();
  };
  const updateOrder = async (order: Order, status: string) => {
    await api(
      `/api/merchant/orders/${encodeURIComponent(order.orderNumber)}/status`,
      { method: "PATCH", json: { status } }
    );
    load();
  };
  const saveStore = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/merchant/store", {
      method: "PATCH",
      json: Object.fromEntries(form.entries()),
    });
    setNotice("تم حفظ إعدادات المتجر.");
    load();
  };
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    await api("/api/merchant/messages", {
      method: "POST",
      json: { body: message, orderNumber: messageOrderNumber || null },
    });
    setMessage("");
    setMessageOrderNumber("");
    setNotice("تم إرسال الرسالة للدعم.");
    loadMessages();
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    await api("/api/merchant/password", { method: "PATCH", json: passwords });
    setPasswords({ currentPassword: "", newPassword: "" });
    setNotice("تم تغيير كلمة المرور.");
  };
  const tabs = [
    ["home", "نظرة عامة", Activity],
    ["products", "الكتالوج", ShoppingBag],
    ["orders", "الطلبات", Package],
    ["messages", "المحادثات", MessageCircle],
    ["settings", "إعدادات المتجر", Settings],
  ] as const;
  return (
    <div
      className={`partner-shell merchant-shell ${lightMode ? "merchant-light" : ""}`}
    >
      <header className="partner-header merchant-full-header">
        <div className="merchant-header-brand">
          <Logo href="/merchant" language="ar" />
          <span className="merchant-header-context">هسّا</span>
        </div>
        <div
          className="merchant-header-actions merchant-left-actions"
          dir="ltr"
        >
          <button
            className="merchant-header-icon merchant-menu-trigger"
            title="القائمة"
            onClick={() => setHeaderMenu(!headerMenu)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            className="merchant-header-icon"
            title={lightMode ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح"}
            onClick={() => {
              const next = !lightMode;
              setLightMode(next);
              localStorage.setItem(
                "hassa-merchant-theme",
                next ? "light" : "dark"
              );
            }}
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            className="merchant-header-icon"
            title="محادثات المتجر"
            onClick={() => setTab("messages")}
          >
            <MessageCircle className="h-4 w-4" />
            {messages.length > 0 && (
              <span className="merchant-header-badge">{messages.length}</span>
            )}
          </button>
          <button
            className="merchant-header-icon"
            title="ذكاء المتجر"
            onClick={() => setTab("analytics")}
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            className="merchant-header-icon"
            title="الشاشة الرئيسية"
            onClick={() => setTab("home")}
          >
            <House className="h-4 w-4" />
          </button>
          {headerMenu && (
            <div
              className="merchant-header-menu merchant-hamburger-menu"
              dir="rtl"
            >
              <button
                onClick={() => {
                  setTab("home");
                  setHeaderMenu(false);
                }}
              >
                الرئيسية
              </button>
              <button
                onClick={() => {
                  setTab("orders");
                  setHeaderMenu(false);
                }}
              >
                الطلبات
              </button>
              <button
                onClick={() => {
                  setTab("analytics");
                  setHeaderMenu(false);
                }}
              >
                تحليلات المبيعات
              </button>
              <button
                onClick={() => {
                  setTab("products");
                  setHeaderMenu(false);
                }}
              >
                كتالوج المنتجات
              </button>
              <button
                onClick={() => {
                  setTab("messages");
                  setHeaderMenu(false);
                }}
              >
                دعم المتجر
              </button>
              <button
                onClick={() => {
                  setTab("archive");
                  setHeaderMenu(false);
                }}
              >
                إدارة البيانات والأرشيف
              </button>
              <button
                onClick={() => {
                  setTab("settings");
                  setHeaderMenu(false);
                }}
              >
                إعدادات المتجر
              </button>
              <button onClick={onLogout}>تسجيل الخروج</button>
            </div>
          )}
        </div>
      </header>
      <main className="partner-main">
        <div className="partner-welcome">
          <div>
            <p className="eyebrow">لوحة التاجر · {user.name}</p>
            <h1>كل ما يحتاجه متجرك في مكان واحد.</h1>
            <p>
              الطلبات، المنتجات، الدعم، وإعدادات المتجر في مساحة واضحة ومريحة.
            </p>
          </div>
          <div className="partner-welcome-badge">
            <Store className="h-7 w-7" />
            <span>
              {store?.acceptsOrders === false ? "متوقف" : "متصل الآن"}
              <br />
              <b>{store?.category || "متجر محلي"}</b>
            </span>
          </div>
        </div>
        {notice && <div className="merchant-notice">{notice}</div>}
        {!data ? (
          <div className="admin-loading">جارٍ تحميل بيانات متجرك…</div>
        ) : tab === "home" ? (
          <div className="partner-grid">
            <div className="partner-stat">
              <span className="partner-stat-icon">
                <Package className="h-5 w-5" />
              </span>
              <span>إجمالي الطلبات</span>
              <strong>{data.orders.length}</strong>
              <small>كل الطلبات الواردة</small>
            </div>
            <div className="partner-stat">
              <span className="partner-stat-icon mint">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <span>منتجات الكتالوج</span>
              <strong>{data.products.length}</strong>
              <small>
                الظاهر منها{" "}
                {data.products.filter(product => product.active).length}
              </small>
            </div>
            <div className="partner-stat">
              <span className="partner-stat-icon">
                <Bell className="h-5 w-5" />
              </span>
              <span>الدعم</span>
              <strong>{messages.length}</strong>
              <small>رسائل المحادثة</small>
            </div>
            <section className="partner-panel wide">
              <div className="partner-panel-heading">
                <div>
                  <p className="eyebrow">نبض المبيعات</p>
                  <h2>آخر الطلبات</h2>
                </div>
                <button
                  className="partner-panel-link"
                  onClick={() => setTab("orders")}
                >
                  عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </div>
              {data.orders.slice(0, 8).map(order => (
                <div className="partner-row" key={order.orderNumber}>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <small>
                      {order.customerName} · {money(order.totalCents)}
                    </small>
                  </div>
                  <span>{order.status}</span>
                </div>
              ))}
              {!data.orders.length && (
                <div className="admin-empty">لا توجد طلبات بعد.</div>
              )}
            </section>
          </div>
        ) : tab === "products" ? (
          <section className="partner-panel">
            <div className="partner-panel-heading">
              <div>
                <p className="eyebrow">كتالوج المتجر</p>
                <h2>المنتجات والمخزون</h2>
              </div>
              <span className="partner-count-badge">
                {data.products.length} منتجات
              </span>
            </div>
            {selectedProduct && (
              <section className="partner-panel product-detail-panel">
                <div className="partner-panel-heading">
                  <div>
                    <p className="eyebrow">تفاصيل المنتج</p>
                    <h2>{selectedProduct.name}</h2>
                    <p>{selectedProduct.description || "لا يوجد وصف مضاف."}</p>
                  </div>
                  <button className="partner-panel-link" onClick={() => setSelectedProduct(null)}>إغلاق التفاصيل</button>
                </div>
                <div className="partner-detail-grid">
                  <div><span>السعر</span><strong>{money(selectedProduct.priceCents)}</strong></div>
                  <div><span>المخزون</span><strong>{selectedProduct.stock}</strong></div>
                  <div><span>الحالة</span><strong>{selectedProduct.active ? "ظاهر للعملاء" : "متوقف"}</strong></div>
                  <div><span>الموافقة</span><strong>{selectedProduct.approvalStatus === "approved" ? "معتمد" : selectedProduct.approvalStatus === "rejected" ? "مرفوض" : "بانتظار المراجعة"}</strong></div>
                </div>
                <div className="partner-detail-actions">
                  <button onClick={() => updateProduct(selectedProduct, { active: !selectedProduct.active })}>{selectedProduct.active ? "إيقاف المنتج" : "تفعيل المنتج"}</button>
                  {selectedProduct.approvalStatus !== "approved" && <button onClick={() => updateProduct(selectedProduct, { approvalStatus: "pending" })}>إرسال للموافقة</button>}
                  {selectedProduct.approvalStatus === "approved" && <button onClick={() => updateProduct(selectedProduct, { approvalStatus: "pending" })}>سحب الاعتماد</button>}
                  <button className="partner-panel-link danger" onClick={() => { void deleteProduct(selectedProduct); setSelectedProduct(null); }}>حذف المنتج</button>
                </div>
              </section>
            )}
            <form className="merchant-add-product" onSubmit={addProduct}>
              <input
                placeholder="اسم المنتج"
                value={newProduct.name}
                onChange={event =>
                  setNewProduct({ ...newProduct, name: event.target.value })
                }
                required
              />
              <input
                placeholder="التصنيف"
                value={newProduct.category}
                onChange={event =>
                  setNewProduct({ ...newProduct, category: event.target.value })
                }
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="السعر بالدينار"
                value={newProduct.priceCents}
                onChange={event =>
                  setNewProduct({
                    ...newProduct,
                    priceCents: event.target.value,
                  })
                }
              />
              <input
                type="number"
                min="0"
                placeholder="المخزون"
                value={newProduct.stock}
                onChange={event =>
                  setNewProduct({ ...newProduct, stock: event.target.value })
                }
              />
              <label className="partner-upload-field">
                صور المنتج (حتى 6 صور، 8MB للصورة)
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={uploadProductImages} disabled={uploadBusy} />
                <small>{uploadBusy ? "جارٍ رفع الصور…" : newProduct.imageUrl ? "تم اختيار الصور ورفعها." : "اختر صورًا من جهازك."}</small>
                {newProduct.imageUrl && (
                  <div className="merchant-upload-previews">
                    {newProduct.imageUrl.split(/\s*,\s*/).filter(Boolean).map(image => (
                      <div className="merchant-upload-preview" key={image}>
                        <img src={image} alt="صورة المنتج" />
                        <button type="button" onClick={() => removeUploadedImage(image)} aria-label="حذف الصورة">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <input
                placeholder="اسم العرض/الشارة"
                value={newProduct.offerLabel}
                onChange={event =>
                  setNewProduct({
                    ...newProduct,
                    offerLabel: event.target.value,
                  })
                }
              />
              <label className="merchant-toggle">
                <input
                  type="checkbox"
                  checked={newProduct.offerEnabled}
                  onChange={event =>
                    setNewProduct({
                      ...newProduct,
                      offerEnabled: event.target.checked,
                    })
                  }
                />{" "}
                إرسال كعرض متحرك بعد اعتماد المنتج
              </label>
              <textarea
                placeholder="وصف المنتج"
                value={newProduct.description}
                onChange={event =>
                  setNewProduct({
                    ...newProduct,
                    description: event.target.value,
                  })
                }
              />
              <button className="primary-button">إرسال المنتج للموافقة</button>
            </form>
            {data.products.map(product => (
              <div className="partner-row" key={product.id}>
                <div>
                  <button className="product-row-title" onClick={() => setSelectedProduct(product)}>{product.name}</button>
                  <small>
                    {money(product.priceCents)} ·{" "}
                    {product.active ? "ظاهر للعملاء" : "متوقف"}{" "}
                    {product.offerEnabled
                      ? `· ${product.offerLabel || "عرض"}`
                      : ""} · حالة الموافقة: {product.approvalStatus === "approved" ? "معتمد" : product.approvalStatus === "rejected" ? "مرفوض" : "بانتظار المراجعة"}
                  </small>
                </div>
                <label className="partner-stock">
                  السعر
                  <input
                    type="number"
                    min="0"
                    value={product.priceCents / 100}
                    onChange={event =>
                      updateProduct(product, {
                        priceCents: Math.round(
                          Number(event.target.value) * 100
                        ),
                      })
                    }
                  />
                </label>
                <label className="partner-stock">
                  المخزون
                  <input
                    type="number"
                    min="0"
                    value={product.stock}
                    onChange={event =>
                      updateProduct(product, {
                        stock: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <button
                  onClick={() =>
                    updateProduct(product, { active: !product.active })
                  }
                >
                  {product.active ? "إيقاف" : "تفعيل"}
                </button>
                <button
                  className="partner-panel-link"
                  onClick={() =>
                    updateProduct(product, {
                      offerEnabled: !product.offerEnabled,
                      offerLabel: product.offerLabel || "عرض",
                      offerPriceCents:
                        product.offerPriceCents ?? product.priceCents,
                      offerApprovalStatus: product.offerEnabled ? product.offerApprovalStatus : "pending",
                    })
                  }
                >
                  {product.offerEnabled ? "إزالة العرض" : "إضافة عرض"}
                </button>
                {product.approvalStatus !== "approved" && <button className="partner-panel-link" onClick={() => updateProduct(product, { approvalStatus: "pending" })}>إرسال للموافقة</button>}
                <button
                  className="partner-panel-link danger"
                  onClick={() => deleteProduct(product)}
                >
                  حذف
                </button>
              </div>
            ))}
          </section>
        ) : tab === "analytics" ? (
          <section className="partner-panel merchant-analytics-panel">
            <div className="partner-panel-heading">
              <div>
                <p className="eyebrow">نبض المبيعات</p>
                <h2>أرقامك تتحرك مع كل طلب.</h2>
                <p>
                  لوحة واضحة للمبيعات والمنتجات الأكثر طلبًا وسرعة فريق التوصيل.
                </p>
              </div>
              <Activity className="h-6 w-6" />
            </div>
            <div className="merchant-range-switch">
              <span>الفترة</span>
              <button
                className={analyticsRange === "7" ? "active" : ""}
                onClick={() => setAnalyticsRange("7")}
              >
                آخر 7 أيام
              </button>
              <button
                className={analyticsRange === "30" ? "active" : ""}
                onClick={() => setAnalyticsRange("30")}
              >
                آخر 30 يومًا
              </button>
              <button
                className={analyticsRange === "90" ? "active" : ""}
                onClick={() => setAnalyticsRange("90")}
              >
                آخر 90 يومًا
              </button>
            </div>
            <div className="merchant-analytics-grid">
              <div>
                <span>إجمالي الطلبات</span>
                <strong>{data.orders.length}</strong>
              </div>
              <div>
                <span>إجمالي المبيعات</span>
                <strong>
                  {money(
                    data.orders
                      .filter(order => order.status !== "cancelled")
                      .reduce((sum, order) => sum + order.totalCents, 0)
                  )}
                </strong>
              </div>
              <div>
                <span>طلبات مفتوحة</span>
                <strong>
                  {
                    data.orders.filter(
                      order =>
                        !["delivered", "cancelled"].includes(order.status)
                    ).length
                  }
                </strong>
              </div>
              <div>
                <span>متوسط الطلب</span>
                <strong>
                  {money(
                    data.orders.length
                      ? Math.round(
                          data.orders.reduce(
                            (sum, order) => sum + order.totalCents,
                            0
                          ) / data.orders.length
                        )
                      : 0
                  )}
                </strong>
              </div>
            </div>
            <div className="merchant-analytics-list">
              {data.orders.slice(0, 10).map(order => (
                <div className="partner-row" key={order.orderNumber}>
                  <span>{order.orderNumber}</span>
                  <strong>{money(order.totalCents)}</strong>
                  <small>{order.status}</small>
                </div>
              ))}
            </div>
          </section>
        ) : tab === "orders" ? (
          <section className="partner-panel">
            <div className="partner-panel-heading">
              <div>
                <p className="eyebrow">دورة الطلب</p>
                <h2>الطلبات الواردة والفواتير</h2>
              </div>
              <span className="partner-count-badge">
                {data.orders.length} طلبات
              </span>
            </div>
            <input
              className="merchant-filter-input"
              placeholder="ابحث برقم الطلب أو اسم العميل"
              value={orderQuery}
              onChange={event => setOrderQuery(event.target.value)}
            />
            {data.orders
              .filter(order =>
                `${order.orderNumber} ${order.customerName} ${order.customerPhone}`
                  .toLowerCase()
                  .includes(orderQuery.toLowerCase())
              )
              .map(order => (
                <div className="partner-row merchant-order-clickable" key={order.orderNumber} onClick={() => setSelectedOrder(order)} role="button" tabIndex={0}>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <small>
                      {order.customerName} · {order.customerPhone}
                    </small>
                    <small>
                      {order.customerAddress} · {money(order.totalCents)}
                    </small>
                  </div>
                  <select
                    value={order.status}
                    onChange={event => updateOrder(order, event.target.value)}
                  >
                    <option value="pending">بانتظار المراجعة</option>
                    <option value="confirmed">تأكيد الطلب</option>
                    <option value="preparing">قيد التجهيز</option>
                    <option value="ready">جاهز للاستلام</option>
                    <option value="cancelled">إلغاء</option>
                  </select>
                </div>
              ))}
            {!data.orders.length && (
              <div className="admin-empty">لا توجد طلبات بعد.</div>
            )}
            {selectedOrder && (
              <div className="merchant-order-detail">
                <button type="button" className="merchant-detail-close" onClick={() => setSelectedOrder(null)}>إغلاق</button>
                <p className="eyebrow">فاتورة الطلب</p><h3>{selectedOrder.orderNumber}</h3>
                <p>{selectedOrder.customerName} · {selectedOrder.customerPhone}</p><p>{selectedOrder.customerAddress}</p>
                {(selectedOrder.items || []).map((item, index) => <div className="partner-row" key={`${item.productId}-${index}`}><span>{item.productName} × {item.quantity}</span><strong>{money(item.unitPriceCents * item.quantity)}</strong></div>)}
                <strong className="merchant-order-total">الإجمالي: {money(selectedOrder.totalCents)}</strong>
              </div>
            )}
          </section>
        ) : tab === "archive" ? (
          <section className="partner-panel merchant-archive-panel">
            <div className="partner-panel-heading">
              <div>
                <p className="eyebrow">حفظ تاريخي</p>
                <h2>إدارة البيانات والأرشيف</h2>
                <p>حدد الأيام ونوع العمليات. لا يتم الحذف إلا بعد تأكيدك.</p>
              </div>
              <Landmark className="h-6 w-6" />
            </div>
            <div className="merchant-archive-card">
              <h3>أرشفة ثم حذف</h3>
              <label>
                نوع البيانات
                <select
                  value={archiveType}
                  onChange={event => setArchiveType(event.target.value)}
                >
                  <option value="products">المنتجات</option>
                  <option value="orders">الطلبات</option>
                </select>
              </label>
              <label>
                من تاريخ
                <input
                  type="date"
                  value={archiveFrom}
                  onChange={event => setArchiveFrom(event.target.value)}
                />
              </label>
              <label>
                إلى تاريخ
                <input
                  type="date"
                  value={archiveTo}
                  onChange={event => setArchiveTo(event.target.value)}
                />
              </label>
              <button className="merchant-danger-button" onClick={archiveData}>
                أرشفة ثم حذف ({archiveCount})
              </button>
            </div>
            <div className="merchant-archive-empty">
              <Landmark className="h-7 w-7" />
              <h3>سجل الأرشيف</h3>
              {archiveHistory.length ? archiveHistory.map(item => (
                <div className="merchant-archive-history" key={item.id}><strong>{item.type === "products" ? "المنتجات" : "الطلبات"}</strong><span>{item.count} سجل · {item.from || "البداية"} — {item.to || "اليوم"}</span><small>{new Date(item.createdAt).toLocaleString("ar-JO")}</small></div>
              )) : <p>سيظهر هنا سجل الملفات بعد أول عملية أرشفة وحذف.</p>}
            </div>
          </section>
        ) : tab === "messages" ? (
          <section className="partner-panel merchant-message-panel">
            <div className="partner-panel-heading">
              <div>
                <p className="eyebrow">خيط التواصل</p>
                <h2>محادثات الدعم</h2>
              </div>
              <MessageCircle className="h-6 w-6" />
            </div>
            <input
              className="merchant-filter-input"
              placeholder="فلترة باسم العميل أو البريد"
              value={messageQuery}
              onChange={event => setMessageQuery(event.target.value)}
            />
            <div className="merchant-messages">
              {messages
                .filter(item =>
                  `${item.senderName || ""} ${item.body}`
                    .toLowerCase()
                    .includes(messageQuery.toLowerCase())
                )
                .map(item => (
                  <div
                    className={`merchant-message ${item.senderRole === "merchant" ? "mine" : ""}`}
                    key={item.id}
                  >
                    <strong>{item.senderName || "فريق هسّا"}</strong>
                    {item.orderNumber && <small className="block">الطلب: {item.orderNumber}</small>}
                    <p>{item.body}</p>
                    <small>
                      {new Date(item.createdAt).toLocaleString("ar-JO")}
                    </small>
                  </div>
                ))}
              {!messages.length && (
                <div className="admin-empty">لا توجد محادثات حاليًا.</div>
              )}
            </div>
            <form className="merchant-message-form" onSubmit={sendMessage}>
              <select value={messageOrderNumber} onChange={event => setMessageOrderNumber(event.target.value)} aria-label="الطلب المرتبط">
                <option value="">بدون طلب محدد</option>
                {data.orders.map(order => <option key={order.orderNumber} value={order.orderNumber}>بخصوص الطلب {order.orderNumber}</option>)}
              </select>
              <input
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder="اكتب رسالتك لفريق هسّا…"
              />
              <button className="primary-button">
                <Send className="h-4 w-4" /> إرسال
              </button>
            </form>
          </section>
        ) : (
          <div className="merchant-settings-grid">
            <form
              className="partner-panel merchant-settings-form"
              onSubmit={saveStore}
            >
              <div className="partner-panel-heading">
                <div>
                  <p className="eyebrow">ملف المتجر</p>
                  <h2>إعدادات المتجر</h2>
                </div>
                <Settings className="h-6 w-6" />
              </div>
              <label>
                اسم المتجر
                <input name="name" defaultValue={store?.name || ""} />
              </label>
              <label>
                التصنيف
                <input name="category" defaultValue={store?.category || ""} />
              </label>
              <label>
                المنطقة
                <input
                  name="neighborhood"
                  defaultValue={store?.neighborhood || ""}
                />
              </label>
              <label>
                العنوان
                <input name="address" defaultValue={store?.address || ""} />
              </label>
              <label>
                رقم التواصل
                <input name="phone" defaultValue={store?.phone || ""} />
              </label>
              <label>
                ساعات العمل
                <input
                  name="openingHours"
                  defaultValue={store?.openingHours || ""}
                  placeholder="مثال: 9 صباحًا - 11 مساءً"
                />
              </label>
              <label>
                وصف المتجر
                <textarea
                  name="description"
                  defaultValue={store?.description || ""}
                />
              </label>
              <div className="merchant-managed-field">
                <span>خطة المتجر</span>
                <strong>{store?.planName || "الخطة الأساسية"}</strong>
                <small>تُدار من الأدمن وتظهر كشـارة توثيق للمتجر.</small>
              </div>
              <div className="merchant-managed-field">
                <span>الظهور في العروض</span>
                <strong>{store?.offerName || "لا يوجد اعتماد عرض حاليًا"}</strong>
                <small>طلب الظهور ومسمى العرض يعتمدهما الأدمن فقط.</small>
              </div>
              <label className="merchant-toggle">
                <input
                  type="checkbox"
                  name="acceptsOrders"
                  defaultChecked={store?.acceptsOrders !== false}
                />{" "}
                استقبال الطلبات
              </label>
              <label className="merchant-toggle">
                <input
                  type="checkbox"
                  name="notificationsEnabled"
                  defaultChecked={store?.notificationsEnabled !== false}
                />{" "}
                تنبيهات فريق المتجر
              </label>
              <label className="merchant-toggle">
                <input
                  type="checkbox"
                  name="notificationSound"
                  defaultChecked={store?.notificationSound !== false}
                />{" "}
                صوت التنبيهات
              </label>
              <label>
                مستوى الصوت
                <input
                  name="notificationVolume"
                  type="range"
                  min="0"
                  max="100"
                  value={notificationVolume}
                  onInput={event => {
                    const nextVolume = Number(event.currentTarget.value);
                    setNotificationVolume(nextVolume);
                  }}
                  onPointerDown={() => { volumePointerDown.current = true; }}
                  onPointerUp={event => {
                    if (!volumePointerDown.current) return;
                    volumePointerDown.current = false;
                    void commitNotificationVolume(Number(event.currentTarget.value));
                  }}
                />
                <small>{notificationVolume}%</small>
              </label>
              <button
                type="button"
                className="partner-panel-link"
                onClick={testNotificationSound}
              >
                <Volume2 className="h-4 w-4" /> اختبار النغمة
              </button>
              <button className="primary-button">حفظ الإعدادات</button>
            </form>
            <form
              className="partner-panel merchant-settings-form"
              onSubmit={changePassword}
            >
              <div className="partner-panel-heading">
                <div>
                  <p className="eyebrow">الوصول الآمن</p>
                  <h2>تغيير كلمة المرور</h2>
                </div>
                <LockKeyhole className="h-6 w-6" />
              </div>
              <label>
                كلمة المرور الحالية
                <input
                  type="password"
                  value={passwords.currentPassword}
                  onChange={event =>
                    setPasswords({
                      ...passwords,
                      currentPassword: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                كلمة المرور الجديدة
                <input
                  type="password"
                  value={passwords.newPassword}
                  onChange={event =>
                    setPasswords({
                      ...passwords,
                      newPassword: event.target.value,
                    })
                  }
                  minLength={8}
                  required
                />
              </label>
              <button className="primary-button">حفظ كلمة المرور</button>
            </form>
            <section className="partner-panel merchant-settings-info">
              <p className="eyebrow">الخطط والعروض والموقع</p>
              <h2>إدارة ظهور متجرك</h2>
              <strong>{store?.planName || "الخطة الأساسية"}</strong>
              <p>{store?.offerName || "لا يوجد عرض عام بعد."}</p>
              <button
                type="button"
                className="partner-panel-link"
                onClick={captureLocation}
              >
                <MapPin className="h-4 w-4" /> حفظ موقع المتجر الحالي
              </button>
              <small className="merchant-coordinates">
                {store?.latitude
                  ? `${store.latitude.toFixed(5)}, ${store.longitude?.toFixed(5)}`
                  : "لم يتم تحديد موقع المتجر بعد"}
              </small>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function RiderSubPage({ user, onLogout, view }: { user: User; onLogout: () => void; view: "orders" | "availability" | "support" | "settings" }) {
  const [, navigate] = useLocation();
  const [lightMode, setLightMode] = useState(() => localStorage.getItem("hassa-rider-theme") === "light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [availability, setAvailability] = useState(() => localStorage.getItem("hassa-rider-availability") || "offline");
  const [data, setData] = useState<{ orders: Array<Order & { storeName: string }> } | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState("");
  const [selectedOrder, setSelectedOrder] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(() => localStorage.getItem("hassa-rider-muted") === "true");
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("hassa-rider-volume") || 70));
  const [noticeDuration, setNoticeDuration] = useState(() => localStorage.getItem("hassa-rider-notice-duration") || "2");
  const [soundPack, setSoundPack] = useState(() => localStorage.getItem("hassa-rider-sound-pack") || "status");
  const [language, setLanguage] = useState(() => localStorage.getItem("hassa-rider-language") || "ar");
  useEffect(() => { localStorage.setItem("hassa-rider-theme", lightMode ? "light" : "dark"); }, [lightMode]);
  useEffect(() => { localStorage.setItem("hassa-rider-availability", availability); }, [availability]);
  useEffect(() => { localStorage.setItem("hassa-rider-muted", String(muted)); }, [muted]);
  useEffect(() => { localStorage.setItem("hassa-rider-volume", String(volume)); }, [volume]);
  useEffect(() => { localStorage.setItem("hassa-rider-notice-duration", noticeDuration); }, [noticeDuration]);
  useEffect(() => { localStorage.setItem("hassa-rider-sound-pack", soundPack); }, [soundPack]);
  useEffect(() => { localStorage.setItem("hassa-rider-language", language); }, [language]);
  const load = async () => { const result = await api<{ orders: Array<Order & { storeName: string }> }>("/api/rider/overview").catch(() => null); if (result) setData(result); if (view === "support") { const resultMessages = await api<{ messages: SupportMessage[] }>("/api/rider/messages").catch(() => ({ messages: [] })); setMessages(resultMessages.messages); } };
  useEffect(() => { load(); }, [view]);
  const titles = { orders: ["الطلبات", "الطلبات المسندة إليك"], availability: ["النشاط", "الحالة والنشاط"], support: ["الدعم", "محادثات دعم التوصيل"], settings: ["الإعدادات", "إعدادات الحساب"] } as const;
  const [eyebrow, title] = titles[view];
  const nav = (path: string) => { setMenuOpen(false); navigate(path); };
  const sendMessage = async () => { if (message.trim().length < 2) return; try { await api("/api/rider/messages", { method: "POST", json: { body: message, orderNumber: selectedOrder || undefined, topic: "rider_support" } }); setMessage(""); setNotice("تم إرسال رسالتك إلى فريق الدعم."); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "تعذر إرسال الرسالة."); } };
  const changePassword = async () => { setPasswordMessage(""); try { await api("/api/rider/password", { method: "PATCH", json: { currentPassword, newPassword } }); setCurrentPassword(""); setNewPassword(""); setPasswordMessage("تم تغيير كلمة المرور بنجاح."); } catch (error) { setPasswordMessage(error instanceof Error ? error.message : "تعذر تغيير كلمة المرور."); } };
  return <div className={`partner-shell rider-shell rider-subpage ${lightMode ? "partner-light" : ""}`}><header className="partner-header rider-header"><Logo href="/rider" language="ar" /><div className="rider-header-tools"><span className="rider-user-pill">{user.name}</span><a className="rider-header-icon" href="/shop" title="الصفحة الرئيسية"><House className="h-4 w-4" /></a><button type="button" className="rider-header-icon" onClick={() => setLightMode(value => !value)} title="تبديل المظهر"><Sun className="h-4 w-4" /></button><div className="rider-menu-wrap"><button type="button" className={`rider-header-icon ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(value => !value)} title="قائمة المندوب"><Menu className="h-4 w-4" /></button>{menuOpen && <nav className="rider-menu"><button type="button" onClick={() => nav("/rider")}><Activity /> لوحة المندوب</button><button type="button" onClick={() => nav("/rider/orders")}><Package /> الطلبات المسندة</button><button type="button" onClick={() => nav("/rider/availability")}><Truck /> حالة التوفر</button><button type="button" onClick={() => nav("/rider/support")}><MessageCircle /> دعم التوصيل</button><button type="button" onClick={() => nav("/rider/settings")}><Settings /> إعدادات الحساب</button><button type="button" onClick={() => setMuted(value => !value)}>{muted ? <VolumeX /> : <Volume2 />} {muted ? "تشغيل التنبيهات" : "كتم التنبيهات"}</button><button type="button" className="rider-menu-logout" onClick={onLogout}><ArrowLeft /> تسجيل الخروج</button></nav>}</div></div></header><main className="partner-main rider-main rider-submain"><div className="rider-breadcrumb"><a href="/rider">العودة إلى لوحة المندوب</a><span>مساحة المندوب · {eyebrow}</span></div><section className="rider-sub-hero"><p className="eyebrow">مساحة المندوب · {eyebrow}</p><h1>{title}</h1><p>{view === "orders" ? "هذه شاشة القائمة فقط. افتح أي طلب لعرض تفاصيله الكاملة في اللوحة الرئيسية، بدون تكرار التفاصيل هنا." : view === "availability" ? "غيّر جاهزيتك لاستقبال مهام جديدة من شاشة مستقلة، بينما تبقى الطلبات والتفاصيل في لوحة المندوب." : view === "support" ? "اختر طلبًا لإرسال رسالة عن الوصول أو العنوان. تفاصيل الطلب الكاملة تبقى في لوحة المندوب ولا تتكرر هنا." : "اضبط بيانات الدخول والتنبيهات وطريقة عرض مساحة التوصيل من جهازك."}</p></section>{view === "orders" && <section className="rider-sub-card"><div className="rider-sub-card-head"><h2>كل الطلبات المتاحة</h2><span>{data?.orders.length || 0} طلب</span></div>{data?.orders.length ? <div className="rider-sub-order-list">{data.orders.map(order => <button type="button" key={order.orderNumber} onClick={() => navigate("/rider#rider-orders")}><Package /><span><strong>{order.orderNumber}</strong><small>{order.storeName} · {order.customerName}</small></span><span className="rider-status">{order.status}</span></button>)}</div> : <div className="rider-sub-empty"><Package /><h3>لا توجد طلبات مسندة</h3><p>ستظهر الطلبات هنا عند إسنادها إلى حسابك.</p></div>}</section>}{view === "availability" && <div className="rider-two-column"><section className="rider-sub-card"><p className="eyebrow">حالتك الحالية</p><h2>{availability === "available" ? "متاح" : availability === "busy" ? "مشغول" : "غير متاح"}</h2><label className="rider-form-label">حالة استقبال المهام<select value={availability} onChange={event => setAvailability(event.target.value)}><option value="available">متاح لاستقبال مهام</option><option value="busy">مشغول حاليًا</option><option value="offline">غير متاح</option></select></label><p className="rider-form-help">اجعل الحالة «متاح» عندما تكون جاهزًا لاستلام طلبات جديدة، و«مشغول» أثناء تنفيذ مهمة.</p></section><section className="rider-sub-card rider-mini-summary"><p className="eyebrow">ملخص سريع</p><div><span>قيد التنفيذ</span><strong>{data?.orders.filter(order => ["assigned", "out_for_delivery"].includes(order.status)).length || 0}</strong></div><div><span>كل الطلبات</span><strong>{data?.orders.length || 0}</strong></div><a href="/rider/orders">عرض الطلبات</a></section></div>}{view === "support" && <section className="rider-sub-card"><h2>محادثات دعم التوصيل</h2>{data?.orders.length ? <><label className="rider-form-label">الطلب المرتبط<select value={selectedOrder} onChange={event => setSelectedOrder(event.target.value)}><option value="">استفسار عام</option>{data.orders.map(order => <option key={order.orderNumber} value={order.orderNumber}>{order.orderNumber} · {order.customerName}</option>)}</select></label><textarea className="rider-support-textarea" value={message} onChange={event => setMessage(event.target.value)} placeholder="اكتب رسالتك لفريق الدعم..." /><button type="button" className="primary-button" onClick={sendMessage}><Send className="h-4 w-4" /> إرسال الرسالة</button></> : <div className="rider-sub-empty"><MessageCircle /><h3>لا يوجد طلب للتواصل حوله</h3><p>ستظهر محادثة الدعم بعد إسناد طلب إليك.</p></div>}{notice && <p className="rider-inline-notice">{notice}</p>}{messages.length > 0 && <div className="rider-message-history">{messages.map(item => <div key={item.id}><small>{item.senderName} · {new Date(item.createdAt).toLocaleString("ar-JO")}</small><p>{item.body}</p></div>)}</div>}</section>}{view === "settings" && <div className="rider-settings-grid"><section className="rider-sub-card"><p className="eyebrow">حساب المندوب</p><h2>تغيير كلمة المرور</h2><label className="rider-form-label">كلمة المرور الحالية<input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label className="rider-form-label">كلمة المرور الجديدة<input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><button type="button" className="primary-button" onClick={changePassword}>حفظ كلمة المرور</button>{passwordMessage && <p className="rider-inline-notice">{passwordMessage}</p>}</section><section className="rider-sub-card"><p className="eyebrow">تنبيهات المهام</p><h2>التنبيهات والأصوات</h2><p className="rider-form-help">تحكم بصوت تنبيهات التوصيل على هذا الجهاز.</p><label className="rider-form-label">مدة ظهور إشعار المهمة<select value={noticeDuration} onChange={event => setNoticeDuration(event.target.value)}><option value="1">ثانية واحدة</option><option value="2">ثانيتان</option></select></label><label className="rider-form-label">أصوات الإشعارات<select value={soundPack} onChange={event => setSoundPack(event.target.value)}><option value="status">أصوات الحالات</option><option value="site">ملفات الموقع المثبتة</option></select></label><label className="rider-setting-row"><span>محادثة جديدة عند الموظف</span><input type="checkbox" defaultChecked /></label><label className="rider-setting-row"><span>رسالة داخل شات مفتوح</span><input type="checkbox" defaultChecked /></label><label className="rider-setting-row"><span>إغلاق الشات من العميل</span><input type="checkbox" defaultChecked /></label><label className="rider-setting-row"><span>كتم تنبيهات التوصيل</span><input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} /></label><label className="rider-form-label">مستوى الصوت<input type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} /><small>{muted ? "مكتوم" : `${volume}%`}</small></label><button type="button" className="rider-outline-button" onClick={() => setNotice("تم تشغيل معاينة النغمة المختارة.")}>اختبار النغمة المختارة</button><p className="rider-inline-notice">{notice}</p></section><section className="rider-sub-card"><p className="eyebrow">اللغة والمظهر</p><h2>تخصيص الواجهة</h2><div className="rider-setting-actions"><button type="button" className="rider-outline-button" onClick={() => setLightMode(value => !value)}>تفعيل الوضع {lightMode ? "الداكن" : "الفاتح"}</button><button type="button" className={`rider-outline-button ${language === "ar" ? "active" : ""}`} onClick={() => setLanguage("ar")}>العربية</button><button type="button" className={`rider-outline-button ${language === "en" ? "active" : ""}`} onClick={() => { setLanguage("en"); setNotice("تم حفظ اللغة الإنجليزية لهذا الجهاز."); }}>English</button><span className="rider-setting-note">اللغة محفوظة على هذا الجهاز</span></div></section></div>}</main></div>;
}

function RiderDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [data, setData] = useState<{ orders: Array<Order & { storeName: string }>; metrics: { assigned: number; active: number; delivered: number } } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order & { storeName: string } | null>(null);
  const [tab, setTab] = useState("all");
  const [historyRange, setHistoryRange] = useState("all");
  const [availability, setAvailability] = useState("available");
  const [lightMode, setLightMode] = useState(() => localStorage.getItem("hassa-rider-theme") === "light");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const load = () => api<NonNullable<typeof data>>("/api/rider/overview").then(result => { setData(result); setSelectedOrder(current => current ? result.orders.find(order => order.orderNumber === current.orderNumber) || null : result.orders[0] || null); }).catch(() => undefined);
  useEffect(() => { load(); }, []);
  useEffect(() => { localStorage.setItem("hassa-rider-theme", lightMode ? "light" : "dark"); }, [lightMode]);
  const update = async (order: Order & { storeName: string }, status: string) => { setBusy(true); try { await api(`/api/rider/orders/${encodeURIComponent(order.orderNumber)}/status`, { method: "PATCH", json: { status } }); await load(); } finally { setBusy(false); } };
  const label = (status: string) => ({ assigned: "جاهز للاستلام", out_for_delivery: "جاري التوصيل", delivered: "مكتمل", confirmed: "مؤكد", preparing: "قيد التجهيز", ready: "جاهز" } as Record<string, string>)[status] || status;
  const tabs = [["all", "كل الطلبات"], ["active", "قيد التنفيذ"], ["ready", "جاهزة"], ["assigned", "معي الآن"], ["out_for_delivery", "جاري التوصيل"], ["delivered", "مكتملة"]];
  const visibleOrders = data?.orders.filter(order => tab === "all" || (tab === "active" ? ["assigned", "out_for_delivery"].includes(order.status) : order.status === tab)) || [];
  const recentOrders = data?.orders.filter(order => historyRange === "all" || new Date(order.createdAt).toDateString() === new Date().toDateString()) || [];
  return <div className={`partner-shell rider-shell ${lightMode ? "partner-light" : ""}`}><header className="partner-header rider-header"><Logo href="/rider" language="ar" /><div className="rider-header-tools"><span className="rider-user-pill">{user.name}</span><a className="rider-header-icon" href="/shop" title="الصفحة الرئيسية" aria-label="الصفحة الرئيسية"><House className="h-4 w-4" /></a><button type="button" className="rider-header-icon" onClick={() => setLightMode(value => !value)} title={lightMode ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح"} aria-label="تبديل المظهر"><Sun className="h-4 w-4" /></button><div className="rider-menu-wrap"><button type="button" className={`rider-header-icon ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(value => !value)} title="قائمة المندوب" aria-label="قائمة المندوب"><Menu className="h-4 w-4" /></button>{menuOpen && <nav className="rider-menu" aria-label="قائمة المندوب"><a href="#rider-dashboard" onClick={() => setMenuOpen(false)}><Activity /> لوحة المندوب</a><a href="#rider-orders" onClick={() => setMenuOpen(false)}><Package /> الطلبات المسندة</a><a href="#rider-availability" onClick={() => setMenuOpen(false)}><Truck /> حالة التوفر</a><a href="#rider-support" onClick={() => setMenuOpen(false)}><MessageCircle /> دعم التوصيل</a><a href="#rider-settings" onClick={() => setMenuOpen(false)}><Settings /> إعدادات الحساب</a><button type="button" onClick={() => setNotificationsMuted(value => !value)}>{notificationsMuted ? <VolumeX /> : <Volume2 />} {notificationsMuted ? "تشغيل التنبيهات" : "كتم التنبيهات"}</button><button type="button" className="rider-menu-logout" onClick={onLogout}><ArrowLeft /> تسجيل الخروج</button></nav>}</div></div></header><main id="rider-dashboard" className="partner-main rider-main"><section className="rider-hero"><div><p className="eyebrow">مساحة التوصيل</p><h1>طلباتك في مكان واحد.</h1><p>راجع العنوان والعميل ومحتويات كل طلب، وحدث حالة التوصيل مباشرة وبوضوح.</p></div><div id="rider-availability" className="rider-hero-side"><Truck className="h-12 w-12" /><label><span className="rider-availability-label">حالة نشاط المندوب <b>اختر حالتك</b></span><select value={availability} onChange={event => setAvailability(event.target.value)}><option value="available">متاح لاستقبال مهام</option><option value="busy">مشغول حاليًا</option><option value="offline">غير متاح</option></select></label></div></section>{!data ? <div className="admin-loading">جارٍ تحميل طلباتك…</div> : <><div className="rider-stat-grid"><div className="rider-stat"><PackageCheck /><span>قيد التنفيذ</span><strong>{data.metrics.active.toString().padStart(2, "0")}</strong><small>تحتاج متابعتك</small></div><div className="rider-stat"><Check /><span>مكتملة</span><strong>{data.metrics.delivered.toString().padStart(2, "0")}</strong><small>ضمن سجل مهامك</small></div><div className="rider-stat"><Package /><span>المنتجات</span><strong>{data.orders.reduce((sum, order) => sum + 1, 0).toString().padStart(2, "0")}</strong><small>في الطلبات المسندة</small></div><div className="rider-stat"><Activity /><span>إجمالي الطلبات</span><strong>{data.orders.length.toString().padStart(2, "0")}</strong><small>كل السجل المتاح</small></div></div><div className="rider-workspace"><section id="rider-orders" className="partner-panel rider-orders-panel"><div className="rider-section-head"><div><p className="eyebrow">قائمة المهام</p><h2>الطلبات المسندة</h2></div><button type="button" className="rider-refresh" onClick={load}><Activity className="h-4 w-4" /> تحديث</button></div><div className="rider-tabs">{tabs.map(([key, text]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{text}<b>{key === "all" ? data.orders.length : visibleOrders.filter(order => key === "active" ? ["assigned", "out_for_delivery"].includes(order.status) : order.status === key).length}</b></button>)}</div><div className="rider-order-list">{visibleOrders.length ? visibleOrders.map(order => <button type="button" className={`rider-order-card ${selectedOrder?.orderNumber === order.orderNumber ? "active" : ""}`} key={order.orderNumber} onClick={() => setSelectedOrder(order)}><span className="rider-order-icon"><Package /></span><span className="rider-order-copy"><strong>{order.orderNumber}</strong><small>{order.storeName} · {order.customerName}</small><small>{order.customerAddress}</small></span><span className={`rider-status rider-status-${order.status}`}>{label(order.status)}</span></button>) : <div className="rider-empty"><Package className="h-8 w-8" /><h3>لا توجد مهام مفتوحة</h3><p>ستظهر هنا الطلبات التي يرسلها الأدمن أو المتجر إلى حسابك.</p></div>}</div></section><section id="rider-support" className="partner-panel rider-detail-panel"><p className="eyebrow">ملخص التسليم</p><h2>تفاصيل الطلب</h2>{selectedOrder ? <div className="rider-detail-content"><div className="rider-detail-top"><strong>{selectedOrder.orderNumber}</strong><span className={`rider-status rider-status-${selectedOrder.status}`}>{label(selectedOrder.status)}</span></div><div className="rider-detail-grid"><div><small>المتجر</small><strong>{selectedOrder.storeName}</strong></div><div><small>العميل</small><strong>{selectedOrder.customerName}</strong></div><div><small>الهاتف</small><strong>{selectedOrder.customerPhone || "غير متوفر"}</strong></div><div><small>العنوان</small><strong>{selectedOrder.customerAddress}</strong></div><div><small>قيمة الطلب</small><strong>{(selectedOrder.totalCents / 100).toFixed(2)} د.أ</strong></div><div><small>ملاحظة</small><strong>{selectedOrder.customerNote || "لا توجد ملاحظات"}</strong></div></div><div className="rider-detail-actions">{selectedOrder.status === "assigned" && <button type="button" className="primary-button" disabled={busy} onClick={() => update(selectedOrder, "out_for_delivery")}><Truck className="h-4 w-4" /> بدء التوصيل</button>}{selectedOrder.status === "out_for_delivery" && <button type="button" className="primary-button" disabled={busy} onClick={() => update(selectedOrder, "delivered")}><Check className="h-4 w-4" /> تأكيد التسليم</button>}<a className="rider-phone-button" href={`tel:${selectedOrder.customerPhone}`}>اتصال بالعميل</a></div></div> : <div className="rider-empty"><Package className="h-8 w-8" /><h3>اختر طلبًا لعرض التفاصيل</h3><p>ستظهر هنا معلومات العنوان وإجراءات التسليم.</p></div>}</section></div><section id="rider-settings" className="partner-panel rider-history-panel"><div className="rider-section-head"><div><p className="eyebrow">ملخص التسليم</p><h2>آخر تحديثات طلباتك</h2></div><div className="rider-history-tabs">{[["today", "اليوم"], ["yesterday", "الأمس"], ["all", "كل السجل"]].map(([key, text]) => <button type="button" className={historyRange === key ? "active" : ""} key={key} onClick={() => setHistoryRange(key)}>{text}</button>)}</div></div>{recentOrders.length ? <div className="rider-history-list">{recentOrders.slice(0, 8).map(order => <div key={order.orderNumber}><span><strong>{order.orderNumber}</strong><small>{order.storeName} · {order.customerName}</small></span><span className={`rider-status rider-status-${order.status}`}>{label(order.status)}</span></div>)}</div> : <div className="rider-empty rider-empty-compact"><Activity className="h-7 w-7" /><p>لا توجد تحديثات في هذا النطاق.</p></div>}</section></>}</main></div>;

}

function AdminLoginPage({ onAuth }: { onAuth: (user: User) => void }) {
  const [, navigate] = useLocation();
  const [language, setLanguage] = useState<"ar" | "en">(
    () => (localStorage.getItem("hassa-admin-language") as "ar" | "en") || "ar"
  );
  const [email, setEmail] = useState("moalj44@gmail.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const en = language === "en";
  useEffect(() => {
    document.documentElement.dir = en ? "ltr" : "rtl";
    document.documentElement.lang = en ? "en" : "ar";
    localStorage.setItem("hassa-admin-language", language);
  }, [language, en]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        json: { email, password },
      });
      if (result.user.role !== "admin")
        throw new Error(
          en
            ? "This login is reserved for administrators."
            : "هذا الدخول مخصص للإدارة."
        );
      onAuth(result.user);
      navigate("/admin");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : en
            ? "Unable to sign in."
            : "تعذر تسجيل الدخول."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-login-page">
      <div className="admin-login-brand">
        <Logo href="/admin" language={language === "ar" ? "ar" : "en"} />
        <div className="admin-login-actions">
          <select
            value={language}
            onChange={event => setLanguage(event.target.value as "ar" | "en")}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
          <Link href="/admin">
            {en ? "Back to admin" : "العودة إلى لوحة الإدارة"}
          </Link>
        </div>
      </div>
      <div className="admin-login-card">
        <div className="admin-login-kicker">
          <ShieldCheck className="h-4 w-4" />{" "}
          {en ? "Protected control center" : "مركز تحكم محمي"}
        </div>
        <p className="eyebrow">
          {en ? "Hassa · Administration" : "هسّا · الإدارة"}
        </p>
        <h1>
          {en
            ? "Run Hassa from one clear place."
            : "أدر هسّا من مكان واحد واضح."}
        </h1>
        <p className="admin-login-lead">
          {en
            ? "Monitor customers, stores, orders, delivery, and support without losing the thread."
            : "راقب العملاء والمتاجر والطلبات والتوصيل والدعم دون ما تضيع أي حركة."}
        </p>
        <form onSubmit={submit} className="admin-login-form">
          <label>
            {en ? "Admin email" : "البريد الإلكتروني"}
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            {en ? "Password" : "كلمة المرور"}
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {message && <p className="admin-error">{message}</p>}
          <button className="primary-button" disabled={busy}>
            {busy
              ? en
                ? "Signing in…"
                : "جارٍ الدخول…"
              : en
                ? "Open admin center"
                : "دخول لوحة الإدارة"}{" "}
            <ArrowLeft className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [language, setLanguage] = useState<"ar" | "en">(
    () => (localStorage.getItem("hassa-admin-language") as "ar" | "en") || "ar"
  );
  const [section, setSection] = useState(
    () => localStorage.getItem("hassa-admin-section") || "overview"
  );
  const [conversationFilter, setConversationFilter] = useState<
    "open" | "closed"
  >(
    () =>
      (localStorage.getItem("hassa-admin-conversation-filter") as
        "open" | "closed") || "open"
  );
  const [data, setData] = useState<AdminOverview | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{
    type: "user" | "store";
    id: number;
  } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("hassa-admin-detail") || "null");
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountRole, setAccountRole] = useState<
    "merchant" | "rider" | "staff" | "rider_support"
  >("rider");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [lightMode, setLightMode] = useState(
    () => localStorage.getItem("hassa-admin-theme") === "light"
  );
  const en = language === "en";
  const copy = (ar: string, english: string) => (en ? english : ar);
  const load = () =>
    api<AdminOverview>("/api/admin/overview")
      .then(setData)
      .catch(() => undefined);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dir = en ? "ltr" : "rtl";
    document.documentElement.lang = en ? "en" : "ar";
    localStorage.setItem("hassa-admin-language", language);
  }, [language, en]);
  useEffect(() => {
    localStorage.setItem("hassa-admin-theme", lightMode ? "light" : "dark");
  }, [lightMode]);
  useEffect(() => {
    localStorage.setItem("hassa-admin-section", section);
    localStorage.setItem("hassa-admin-conversation-filter", conversationFilter);
    if (selectedDetail)
      localStorage.setItem(
        "hassa-admin-detail",
        JSON.stringify(selectedDetail)
      );
    else localStorage.removeItem("hassa-admin-detail");
  }, [section, conversationFilter, selectedDetail]);
  useEffect(() => {
    if (selectedUser)
      api<{ messages: SupportMessage[] }>(`/api/admin/support/${selectedUser}`)
        .then(result => setMessages(result.messages))
        .catch(() => setMessages([]));
  }, [selectedUser]);
  useEffect(() => {
    const closeMenus = () => {
      setQuickMenuOpen(false);
      setHamburgerOpen(false);
    };
    window.addEventListener("scroll", closeMenus, { passive: true });
    return () => window.removeEventListener("scroll", closeMenus);
  }, []);
  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".admin-header-actions")) {
        setQuickMenuOpen(false);
        setHamburgerOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);
  const metrics = data?.metrics;
  const nav = [
    ["overview", copy("نظرة عامة", "Overview"), Activity],
    ["orders", copy("الطلبات", "Orders"), Package],
    ["support", copy("الدعم الموحد", "Unified support"), MessageCircle],
    ["delivery", copy("التوصيل والمناديب", "Delivery & riders"), Truck],
    ["marketplace", copy("السوق والمتاجر", "Marketplace"), Store],
    ["team", copy("الفريق والحسابات", "Team & accounts"), UserRound],
    ["activity", copy("سجل الحركة", "Activity log"), Bell],
  ] as const;
  const statuses = [
    ["pending", copy("قيد المراجعة", "Pending")],
    ["confirmed", copy("مؤكد", "Confirmed")],
    ["preparing", copy("قيد التجهيز", "Preparing")],
    ["ready", copy("جاهز", "Ready")],
    ["assigned", copy("تم التعيين", "Assigned")],
    ["out_for_delivery", copy("في التوصيل", "Out for delivery")],
    ["delivered", copy("تم التسليم", "Delivered")],
    ["cancelled", copy("ملغى", "Cancelled")],
  ];
  const updateProductApproval = async (productId: number, approvalStatus: "approved" | "rejected") => {
    await api(`/api/admin/products/${productId}`, {
      method: "PATCH",
      json: { approvalStatus },
    });
    load();
  };
  const deleteAdminProduct = async (productId: number) => {
    if (!window.confirm(copy("حذف هذا المنتج نهائيًا؟", "Delete this product permanently?"))) return;
    await api(`/api/admin/products/${productId}`, { method: "DELETE" });
    load();
  };
  const updateStorePlan = async (storeId: number, planName: string) => {
    await api(`/api/admin/stores/${storeId}/plan`, { method: "PATCH", json: { planName } });
    load();
  };
  const updateProductOffer = async (productId: number, offerApprovalStatus: "approved" | "rejected", offerEnabled = true) => {
    await api(`/api/admin/products/${productId}`, { method: "PATCH", json: { offerApprovalStatus, offerEnabled } });
    load();
  };
  const updateOrder = async (orderNumber: string, status: string) => {
    await api(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
      method: "PATCH",
      json: { status },
    });
    load();
  };
  const riders = data?.users.filter(item => item.role === "rider") || [];
  const assignOrder = async (orderNumber: string, riderId: string) => {
    await api(`/api/admin/orders/${encodeURIComponent(orderNumber)}/assign`, {
      method: "PATCH",
      json: { riderId: Number(riderId) || 0 },
    });
    load();
  };
  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/accounts", {
        method: "POST",
        json: {
          role: accountRole,
          name: accountName,
          email: accountEmail,
          password: accountPassword,
        },
      });
      setAccountName("");
      setAccountEmail("");
      setAccountPassword("");
      load();
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !reply.trim()) return;
    setBusy(true);
    try {
      await api("/api/admin/support/reply", {
        method: "POST",
        json: { userId: selectedUser, body: reply.trim() },
      });
      setReply("");
      const result = await api<{ messages: SupportMessage[] }>(
        `/api/admin/support/${selectedUser}`
      );
      setMessages(result.messages);
      load();
    } finally {
      setBusy(false);
    }
  };
  const title =
    section === "chat-page"
      ? copy("خيارات الدعم", "Support options")
      : section === "hamburger-page"
        ? copy("خيارات الإدارة", "Admin options")
        : section === "shift-log"
          ? copy("سجل الورديات", "Shift log")
          : section === "customer-support"
            ? copy("دعم العملاء", "Customer support")
            : section === "customers"
              ? copy("العملاء", "Customers")
              : section === "marketplace-subscriptions"
                ? copy("إدارة السوق والاشتراكات", "Marketplace & subscriptions")
                : section === "settings"
                  ? copy("الإعدادات", "Settings")
                  : section === "detail-user"
                    ? copy("تفاصيل الحساب", "Account details")
                    : section === "detail-store"
                      ? copy("تفاصيل المتجر", "Store details")
                      : nav.find(item => item[0] === section)?.[1] ||
                        copy("نظرة عامة", "Overview");
  const go = (next: string) => {
    setSelectedDetail(null);
    localStorage.removeItem("hassa-admin-detail");
    setSection(next);
    localStorage.setItem("hassa-admin-section", next);
    setQuickMenuOpen(false);
    setHamburgerOpen(false);
  };
  return (
    <div
      className={`admin-shell ${lightMode ? "admin-light" : ""} ${section === "overview" ? "admin-home-shell" : ""}`}
    >
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <Logo href="/admin" language={language} />
          <span>{copy("مركز التحكم", "Control center")}</span>
        </div>
        <div className="admin-profile">
          <div className="admin-avatar">{user.name.slice(0, 1)}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </div>
        <nav className="admin-nav">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={section === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <select
            value={language}
            onChange={event => setLanguage(event.target.value as "ar" | "en")}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
          <button onClick={onLogout}>
            <X className="h-4 w-4" /> {copy("تسجيل الخروج", "Log out")}
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <Logo href="/admin" language={language} />
          <div className="admin-topbar-title">
            <p className="eyebrow">
              {copy("هسّا · إدارة المنصة", "Hassa · Platform administration")}
            </p>
            <h1>{title}</h1>
          </div>
          <div className="admin-top-actions admin-header-actions">
            <button
              type="button"
              className="admin-header-icon"
              onClick={() => go("overview")}
              title={copy("الصفحة الرئيسية", "Home")}
            >
              <House className="h-4 w-4" />
            </button>
            <div className="admin-header-dropdown">
              <button
                type="button"
                className="admin-header-icon"
                onClick={() => go("chat-page")}
                title={copy("الدعم والمحادثات", "Support and conversations")}
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              {quickMenuOpen && (
                <div className="admin-quick-menu">
                  <button onClick={() => go("support")}>
                    <MessageCircle className="h-4 w-4" />
                    <span>
                      <strong>
                        {copy("خدمة العملاء", "Customer support")}
                      </strong>
                      <small>
                        {copy(
                          "إدارة محادثات الدعم.",
                          "Manage support conversations."
                        )}
                      </small>
                    </span>
                  </button>
                  <button onClick={() => go("delivery")}>
                    <Truck className="h-4 w-4" />
                    <span>
                      <strong>{copy("دعم التوصيل", "Delivery support")}</strong>
                      <small>
                        {copy(
                          "تابع التوصيل والمناديب.",
                          "Review delivery and riders."
                        )}
                      </small>
                    </span>
                  </button>
                  <button onClick={() => go("marketplace")}>
                    <Store className="h-4 w-4" />
                    <span>
                      <strong>
                        {copy(
                          "مراجعة المنتجات والتجار",
                          "Products and merchants"
                        )}
                      </strong>
                      <small>
                        {copy(
                          "راقب السوق والمتاجر.",
                          "Review the marketplace."
                        )}
                      </small>
                    </span>
                  </button>
                  <button onClick={() => go("team")}>
                    <UserRound className="h-4 w-4" />
                    <span>
                      <strong>
                        {copy("موظفو الدعم والعملاء", "Staff and customers")}
                      </strong>
                      <small>
                        {copy(
                          "إدارة الحسابات والأدوار.",
                          "Manage accounts and roles."
                        )}
                      </small>
                    </span>
                  </button>
                  <button onClick={() => go("activity")}>
                    <Bell className="h-4 w-4" />
                    <span>
                      <strong>{copy("سجل التدقيق", "Audit log")}</strong>
                      <small>
                        {copy("راجع آخر الحركات.", "Review recent activity.")}
                      </small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="admin-header-icon"
              onClick={() => setLightMode(value => !value)}
              title={copy("الوضع الداكن والفاتح", "Dark and light mode")}
            >
              <Sun className="h-4 w-4" />
            </button>
            <div className="admin-header-dropdown">
              <button
                type="button"
                className="admin-header-icon"
                onClick={() => go("hamburger-page")}
                title={copy("المزيد من الخيارات", "More options")}
              >
                <Menu className="h-5 w-5" />
              </button>
              {hamburgerOpen && (
                <div className="admin-hamburger-menu">
                  {nav.map(([key, label, Icon]) => (
                    <button
                      key={key}
                      onClick={() => go(key)}
                      className={section === key ? "active" : ""}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                  <button onClick={onLogout}>
                    <X className="h-4 w-4" /> {copy("تسجيل الخروج", "Log out")}
                  </button>
                </div>
              )}
            </div>
            <span className="admin-live">
              <i /> {copy("مباشر", "Live")}
            </span>
            <button onClick={load} className="admin-refresh">
              <Activity className="h-4 w-4" /> {copy("تحديث", "Refresh")}
            </button>
          </div>
        </header>
        {!data ? (
          <div className="admin-loading">
            {copy("جارٍ تحميل مركز التحكم…", "Loading control center…")}
          </div>
        ) : (
          <div
            className={`admin-content ${selectedDetail ? "admin-detail-mode" : ""}`}
          >
            {selectedDetail && (
              <section className="admin-detail-panel admin-panel">
                {selectedDetail.type === "user"
                  ? (() => {
                      const item = data.users.find(
                        entry => entry.id === selectedDetail.id
                      );
                      const orders = data.orders.filter(
                        order => order.userId === selectedDetail.id
                      );
                      return item ? (
                        <>
                          <div className="admin-detail-head">
                            <div>
                              <p className="eyebrow">
                                {copy("تفاصيل الحساب", "Account details")}
                              </p>
                              <h3>{item.name}</h3>
                            </div>
                            <button type="button" onClick={() => go("team")}>
                              {copy("العودة", "Back")}
                            </button>
                          </div>
                          <div className="admin-detail-grid">
                            <p>
                              <small>{copy("الدور", "Role")}</small>
                              <strong>{item.role}</strong>
                            </p>
                            <p>
                              <small>{copy("البريد", "Email")}</small>
                              <strong>{item.email}</strong>
                            </p>
                            <p>
                              <small>{copy("الهاتف", "Phone")}</small>
                              <strong>
                                {item.phone || copy("غير مضاف", "Not added")}
                              </strong>
                            </p>
                            <p>
                              <small>{copy("الطلبات", "Orders")}</small>
                              <strong>{orders.length}</strong>
                            </p>
                          </div>
                          <div className="admin-detail-list">
                            {orders.map(order => (
                              <div key={order.orderNumber}>
                                <strong>{order.orderNumber}</strong>
                                <span>
                                  {order.status} · {money(order.totalCents)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null;
                    })()
                  : (() => {
                      const store = data.stores.find(
                        entry => entry.id === selectedDetail.id
                      );
                      const products = data.products
                        .filter(
                          product => product.storeId === selectedDetail.id
                        )
                        .sort((a, b) =>
                          (a.createdAt || "").localeCompare(b.createdAt || "")
                        );
                      return store ? (
                        <>
                          <div className="admin-detail-head">
                            <div>
                              <p className="eyebrow">
                                {copy("تفاصيل المتجر", "Store details")}
                              </p>
                              <h3>{store.name}</h3>
                              <label className="admin-plan-control admin-plan-control-highlight">
                                <span><ShieldCheck /> {copy("خطة التوثيق — يحددها الأدمن", "Verification plan — admin only")}</span>
                                <select value={store.planName || "الخطة الأساسية"} onChange={event => updateStorePlan(store.id, event.target.value)}>
                                  <option>الخطة الأساسية</option>
                                  <option>خطة موثقة</option>
                                  <option>خطة مميزة</option>
                                </select>
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => go("marketplace")}
                            >
                              {copy("العودة", "Back")}
                            </button>
                          </div>
                          <div className="admin-detail-grid">
                            <p>
                              <small>{copy("التصنيف", "Category")}</small>
                              <strong>{store.category}</strong>
                            </p>
                            <p>
                              <small>{copy("المنطقة", "Neighborhood")}</small>
                              <strong>{store.neighborhood}</strong>
                            </p>
                            <p>
                              <small>{copy("المعرّف", "Handle")}</small>
                              <strong>{store.handle}</strong>
                            </p>
                            <p>
                              <small>{copy("عدد المنتجات", "Products")}</small>
                              <strong>{products.length}</strong>
                            </p>
                          </div>
                          <p className="admin-panel-copy">
                            {store.description}
                          </p>
                          <div className="admin-detail-list admin-product-detail-list">
                            {products.map(product => (
                              <div
                                key={product.id}
                                className="admin-product-detail"
                              >
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                />
                                <span>
                                  <strong>{product.name}</strong>
                                  <small>
                                    {money(product.priceCents)} ·{" "}
                                    {product.stock} {copy("متوفر", "in stock")} · {product.approvalStatus === "approved" ? copy("معتمد", "Approved") : product.approvalStatus === "rejected" ? copy("مرفوض", "Rejected") : copy("بانتظار الموافقة", "Pending approval")}
                                    {product.offerEnabled ? ` · ${product.offerApprovalStatus === "approved" ? copy("عرض معتمد", "Offer approved") : copy("العرض بانتظار الموافقة", "Offer pending")}` : ""}
                                  </small>
                                </span>
                                {product.approvalStatus !== "approved" && (
                                  <button type="button" className="admin-product-approve" onClick={() => updateProductApproval(product.id, "approved")}>
                                    {copy("اعتماد", "Approve")}
                                  </button>
                                )}
                                {product.offerEnabled && product.offerApprovalStatus !== "approved" && (
                                  <>
                                    <button type="button" className="admin-product-approve" onClick={() => updateProductOffer(product.id, "approved")}>
                                      {copy("اعتماد العرض", "Approve offer")}
                                    </button>
                                    <button type="button" className="admin-product-reject" onClick={() => updateProductOffer(product.id, "rejected")}>
                                      {copy("رفض العرض", "Reject offer")}
                                    </button>
                                  </>
                                )}
                                {product.offerEnabled && product.offerApprovalStatus === "approved" && (
                                  <button type="button" className="admin-product-reject" onClick={() => updateProductOffer(product.id, "rejected", false)}>
                                    {copy("سحب العرض", "Withdraw offer")}
                                  </button>
                                )}
                                <button type="button" className="admin-product-reject" onClick={() => void deleteAdminProduct(product.id)}>
                                  {copy("حذف المنتج", "Delete product")}
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="admin-readonly-note">
                            {copy(
                              "هذه التفاصيل للعرض فقط. أي تغيير يحتاج موافقة الأدمن.",
                              "Read-only details. Any change requires admin approval."
                            )}
                          </p>
                        </>
                      ) : null;
                    })()}
              </section>
            )}
            {}
            {section === "chat-page" && (
              <section className="admin-options-hub admin-chat-page">
                <div className="admin-options-hub-intro">
                  <p className="eyebrow">
                    {copy("الدعم والمحادثات", "Support & conversations")}
                  </p>
                  <h2>
                    {copy(
                      "كل أدوات الدعم الخاصة في مكان واحد.",
                      "All dedicated support tools in one place."
                    )}
                  </h2>
                  <p>
                    {copy(
                      "كل خيار يفتح صفحته الخاصة بدون تكرار خيارات الصفحة الرئيسية.",
                      "Each option opens its own page without duplicating home options."
                    )}
                  </p>
                </div>
                <div className="admin-options-grid">
                  <button
                    type="button"
                    className="admin-option-card admin-option-primary"
                    onClick={() => go("support")}
                  >
                    <MessageCircle />
                    <span>
                      <strong>
                        {copy("محادثات الدعم", "Support conversations")}
                      </strong>
                      <small>
                        {copy(
                          "عرض المحادثات والردود.",
                          "View conversations and replies."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("team")}
                  >
                    <UserRound />
                    <span>
                      <strong>{copy("فريق الدعم", "Support team")}</strong>
                      <small>
                        {copy(
                          "حسابات فريق خدمة العملاء.",
                          "Customer support team accounts."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("shift-log")}
                  >
                    <Activity />
                    <span>
                      <strong>{copy("سجل الورديات", "Shift log")}</strong>
                      <small>
                        {copy(
                          "متابعة حالة الورديات والنشاط.",
                          "Track shifts and activity."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("orders")}
                  >
                    <PackageCheck />
                    <span>
                      <strong>
                        {copy("إسناد الطلبات", "Order assignment")}
                      </strong>
                      <small>
                        {copy(
                          "الطلبات وحالات الإسناد.",
                          "Orders and assignment status."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("delivery")}
                  >
                    <Truck />
                    <span>
                      <strong>{copy("دعم المندوبين", "Rider support")}</strong>
                      <small>
                        {copy(
                          "متابعة المندوبين والتوصيل.",
                          "Rider and delivery support."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                </div>
                <button
                  type="button"
                  className="admin-hub-home"
                  onClick={() => go("overview")}
                >
                  <House /> {copy("العودة للصفحة الرئيسية", "Back to home")}
                </button>
              </section>
            )}
            {section === "hamburger-page" && (
              <section className="admin-options-hub admin-hamburger-page">
                <div className="admin-options-hub-intro">
                  <p className="eyebrow">
                    {copy("مركز الإدارة", "Administration")}
                  </p>
                  <h2>
                    {copy(
                      "إدارة المنصة من مكان واحد.",
                      "Manage the platform from one place."
                    )}
                  </h2>
                  <p>
                    {copy(
                      "خيارات الإدارة العامة بدون تكرار أدوات الدعم.",
                      "General administration options without duplicating support tools."
                    )}
                  </p>
                </div>
                <div className="admin-options-grid">
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("customers")}
                  >
                    <UserRound />
                    <span>
                      <strong>{copy("العملاء", "Customers")}</strong>
                      <small>
                        {copy(
                          "عرض حسابات العملاء وبياناتهم.",
                          "View customer accounts and details."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("marketplace")}
                  >
                    <Store />
                    <span>
                      <strong>
                        {copy("المتاجر والاعتمادات", "Stores & approvals")}
                      </strong>
                      <small>
                        {copy(
                          "مراجعة المتاجر واعتماداتها.",
                          "Review stores and approvals."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("marketplace-subscriptions")}
                  >
                    <ShoppingBag />
                    <span>
                      <strong>
                        {copy(
                          "إدارة السوق والاشتراكات",
                          "Marketplace & subscriptions"
                        )}
                      </strong>
                      <small>
                        {copy(
                          "إدارة السوق وخطط الاشتراك.",
                          "Manage marketplace and plans."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("activity")}
                  >
                    <Bell />
                    <span>
                      <strong>{copy("سجل التدقيق", "Audit log")}</strong>
                      <small>
                        {copy("مراجعة آخر الحركات.", "Review recent activity.")}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={() => go("settings")}
                  >
                    <Settings />
                    <span>
                      <strong>{copy("الإعدادات", "Settings")}</strong>
                      <small>
                        {copy(
                          "إعدادات لوحة الإدارة واللغة.",
                          "Admin center and language settings."
                        )}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="admin-option-card"
                    onClick={onLogout}
                  >
                    <X />
                    <span>
                      <strong>{copy("تسجيل الخروج", "Log out")}</strong>
                      <small>
                        {copy("الخروج من مركز التحكم.", "Sign out.")}
                      </small>
                    </span>
                    <ArrowLeft />
                  </button>
                </div>
                <button
                  type="button"
                  className="admin-hub-home"
                  onClick={() => go("overview")}
                >
                  <House /> {copy("العودة للصفحة الرئيسية", "Back to home")}
                </button>
              </section>
            )}
            {section === "shift-log" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy("سجل الورديات", "Shift log")}
                    </p>
                    <h3>
                      {copy(
                        "حالة فريق الدعم والنشاط",
                        "Support team shifts and activity"
                      )}
                    </h3>
                  </div>
                  <Activity />
                </div>
                <div className="admin-detail-grid">
                  <p>
                    <small>{copy("الوردية الحالية", "Current shift")}</small>
                    <strong>{copy("متابعة مباشرة", "Live monitoring")}</strong>
                  </p>
                  <p>
                    <small>{copy("الفريق", "Team")}</small>
                    <strong>{metrics?.staff || 0}</strong>
                  </p>
                  <p>
                    <small>
                      {copy("المحادثات المفتوحة", "Open conversations")}
                    </small>
                    <strong>{metrics?.supportOpen || 0}</strong>
                  </p>
                  <p>
                    <small>{copy("آخر تحديث", "Last update")}</small>
                    <strong>
                      {new Date().toLocaleTimeString(en ? "en-US" : "ar-JO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </p>
                </div>
                <p className="admin-panel-copy">
                  {copy(
                    "هذه الصفحة مخصصة لمتابعة الورديات والنشاط التشغيلي لفريق الدعم.",
                    "This page tracks support shifts and operational activity."
                  )}
                </p>
              </section>
            )}
            {section === "customer-support" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy("دعم العملاء", "Customer assistance")}
                    </p>
                    <h3>
                      {copy(
                        "مساعدة العملاء ومتابعتهم",
                        "Customer assistance and follow-up"
                      )}
                    </h3>
                  </div>
                  <CircleHelp />
                </div>
                <div className="admin-detail-grid">
                  <p>
                    <small>{copy("العملاء", "Customers")}</small>
                    <strong>{metrics?.customers || 0}</strong>
                  </p>
                  <p>
                    <small>
                      {copy("المحادثات المفتوحة", "Open conversations")}
                    </small>
                    <strong>{metrics?.supportOpen || 0}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button mt-6"
                  onClick={() => go("support")}
                >
                  {copy("فتح محادثات الدعم", "Open support conversations")}{" "}
                  <ArrowLeft />
                </button>
              </section>
            )}
            {section === "customers" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">{copy("العملاء", "Customers")}</p>
                    <h3>{copy("حسابات العملاء", "Customer accounts")}</h3>
                  </div>
                  <UserRound />
                </div>
                <div className="admin-user-list">
                  {data.users
                    .filter(item => item.role === "customer")
                    .map(item => (
                      <div className="admin-list-row" key={item.id}>
                        <div className="admin-avatar small">
                          {item.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.email}</small>
                        </div>
                        <span className="admin-status">{item.role}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}
            {section === "marketplace-subscriptions" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy(
                        "إدارة السوق والاشتراكات",
                        "Marketplace & subscriptions"
                      )}
                    </p>
                    <h3>
                      {copy(
                        "خطط السوق والاعتمادات",
                        "Marketplace plans and approvals"
                      )}
                    </h3>
                  </div>
                  <ShoppingBag />
                </div>
                <div className="admin-detail-grid">
                  <p>
                    <small>{copy("المتاجر", "Stores")}</small>
                    <strong>{data.stores.length}</strong>
                  </p>
                  <p>
                    <small>{copy("التجار", "Merchants")}</small>
                    <strong>{metrics?.merchants || 0}</strong>
                  </p>
                  <p>
                    <small>{copy("الحالة", "Status")}</small>
                    <strong>{copy("تحت الإدارة", "Managed")}</strong>
                  </p>
                </div>
                <p className="admin-panel-copy">
                  {copy(
                    "إدارة الاعتمادات والاشتراكات جاهزة للتوسع من هذه الصفحة بدون خلطها مع تفاصيل المتاجر.",
                    "Approvals and subscriptions are managed here separately from store details."
                  )}
                </p>
              </section>
            )}
            {section === "settings" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">{copy("الإعدادات", "Settings")}</p>
                    <h3>
                      {copy("إعدادات مركز الإدارة", "Admin center settings")}
                    </h3>
                  </div>
                  <Settings />
                </div>
                <div className="admin-detail-grid">
                  <p>
                    <small>{copy("اللغة", "Language")}</small>
                    <strong>{language === "ar" ? "العربية" : "English"}</strong>
                  </p>
                  <p>
                    <small>{copy("المظهر", "Theme")}</small>
                    <strong>
                      {lightMode ? copy("فاتح", "Light") : copy("داكن", "Dark")}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="primary-button mt-6"
                  onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
                >
                  {copy("تبديل اللغة", "Switch language")} <ArrowLeft />
                </button>
              </section>
            )}
            {section === "overview" && (
              <section className="admin-home-content">
                <div className="admin-home-intro">
                  <p className="eyebrow">{copy("الدعم", "Support")}</p>
                  <h2>
                    {copy(
                      "تابع محادثات الدعم بسهولة.",
                      "Follow support conversations with ease."
                    )}
                  </h2>
                  <p>
                    {copy(
                      "تظهر هنا محادثات العملاء والتجار بوضوح، وتجد إدارة الطلبات والحسابات والمتاجر والفريق في القائمة.",
                      "Customer and merchant conversations stay clear here, while orders, accounts, stores, and the team remain one click away."
                    )}
                  </p>
                </div>
                <div className="admin-home-actions">
                  <button
                    className="admin-home-action active"
                    onClick={() => {
                      setConversationFilter("open");
                      go("support");
                    }}
                  >
                    <span>{copy("خدمة العملاء", "Customer support")}</span>
                    <MessageCircle className="h-8 w-8" />
                  </button>
                  <button
                    className="admin-home-action"
                    onClick={() => {
                      setConversationFilter("closed");
                      go("support");
                    }}
                  >
                    <span>
                      {copy("المحادثات المغلقة", "Closed conversations")}
                    </span>
                    <MessageCircle className="h-8 w-8" />
                  </button>
                  <button
                    className="admin-home-action"
                    onClick={() => go("delivery")}
                  >
                    <span>{copy("دعم التوصيل", "Delivery support")}</span>
                    <Truck className="h-8 w-8" />
                  </button>
                </div>
                <div className="admin-home-note">
                  <span>{copy("المتابعة الحالية", "Current follow-up")}</span>
                  <strong>
                    {metrics?.supportOpen || 0}{" "}
                    {copy(
                      "محادثات تحتاج متابعة",
                      "conversations need attention"
                    )}
                  </strong>
                  <button onClick={load}>
                    {copy("تحديث", "Refresh")} <Activity className="h-4 w-4" />
                  </button>
                </div>
                <section className="admin-home-conversations">
                  <div className="admin-home-conversations-head">
                    <div>
                      <p className="eyebrow">
                        {copy("المتابعة الحالية", "Current follow-up")}
                      </p>
                      <h3>{copy("محادثات الدعم", "Support conversations")}</h3>
                    </div>
                    <span>
                      {metrics?.supportOpen || 0} {copy("مفتوحة", "open")} ·{" "}
                      {Math.max(
                        0,
                        data.conversations.length - (metrics?.supportOpen || 0)
                      )}{" "}
                      {copy("مغلقة", "closed")}
                    </span>
                    <button type="button" onClick={load}>
                      {copy("تحديث", "Refresh")}{" "}
                      <Activity className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="admin-home-conversation-list">
                    {data.conversations.length ? (
                      data.conversations.slice(0, 8).map(conversation => (
                        <button
                          type="button"
                          className="admin-home-conversation"
                          key={conversation.userId}
                          onClick={() => go("support")}
                        >
                          <div>
                            <strong>
                              {conversation.lastMessage?.body ||
                                copy("محادثة دعم", "Support conversation")}
                            </strong>
                            <small>
                              {conversation.name} · {conversation.email}
                            </small>
                          </div>
                          <span>
                            {conversation.unread > 0
                              ? `${conversation.unread} ${copy("جديدة", "new")}`
                              : copy("موزعة على موظف", "Assigned to staff")}
                            <b>
                              {copy("فتح التفاصيل", "Open details")}{" "}
                              <ArrowLeft className="h-3 w-3" />
                            </b>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="admin-home-empty">
                        {copy(
                          "لا توجد محادثات تحتاج متابعة الآن.",
                          "No conversations need attention right now."
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </section>
            )}
            {section === "orders" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy("تشغيل الطلبات", "Order operations")}
                    </p>
                    <h3>
                      {copy(
                        "تابع الطلب من لحظة دخوله حتى التسليم",
                        "Follow every order from intake to delivery"
                      )}
                    </h3>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{copy("الطلب", "Order")}</th>
                        <th>{copy("العميل", "Customer")}</th>
                        <th>{copy("المتجر", "Store")}</th>
                        <th>{copy("القيمة", "Value")}</th>
                        <th>{copy("الحالة", "Status")}</th>
                        <th>{copy("المندوب", "Rider")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map(order => (
                        <tr key={order.orderNumber}>
                          <td>
                            <strong>{order.orderNumber}</strong>
                            <small>
                              {new Date(order.createdAt).toLocaleDateString()}
                            </small>
                          </td>
                          <td>
                            {order.customerName}
                            <small>{order.customerEmail}</small>
                          </td>
                          <td>{order.storeName}</td>
                          <td>{money(order.totalCents)}</td>
                          <td>
                            <select
                              value={order.status}
                              onChange={event =>
                                updateOrder(
                                  order.orderNumber,
                                  event.target.value
                                )
                              }
                            >
                              {statuses.map(([value, label]) => (
                                <option value={value} key={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value=""
                              onChange={event =>
                                assignOrder(
                                  order.orderNumber,
                                  event.target.value
                                )
                              }
                            >
                              <option value="">
                                {copy("تعيين…", "Assign…")}
                              </option>
                              {riders.map(rider => (
                                <option value={rider.id} key={rider.id}>
                                  {rider.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {section === "support" && (
              <div className="admin-support-layout">
                <section className="admin-panel admin-support-list">
                  <div className="admin-panel-heading">
                    <div>
                      <p className="eyebrow">
                        {copy("دعم موحد", "Unified support")}
                      </p>
                      <h3>
                        {copy("لا تضيع أي محادثة", "Never lose a conversation")}
                      </h3>
                    </div>
                  </div>
                  {data.conversations
                    .filter(item =>
                      conversationFilter === "open"
                        ? item.unread > 0
                        : item.unread === 0
                    )
                    .map(item => (
                      <button
                        className={
                          selectedUser === item.userId
                            ? "admin-support-row active"
                            : "admin-support-row"
                        }
                        onClick={() => setSelectedUser(item.userId)}
                        key={item.userId}
                      >
                        <div className="admin-avatar small">
                          {item.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.email}</small>
                          <em>{item.lastMessage.body}</em>
                        </div>
                        {item.unread > 0 && <b>{item.unread}</b>}
                      </button>
                    ))}
                  {!data.conversations.length && (
                    <div className="admin-empty">
                      {copy(
                        "لا توجد محادثات دعم بعد.",
                        "No support conversations yet."
                      )}
                    </div>
                  )}
                </section>
                <section className="admin-panel admin-support-thread">
                  {selectedUser ? (
                    <>
                      <div className="admin-thread-head">
                        <div className="admin-avatar">
                          {data.conversations
                            .find(item => item.userId === selectedUser)
                            ?.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong>
                            {
                              data.conversations.find(
                                item => item.userId === selectedUser
                              )?.name
                            }
                          </strong>
                          <small>
                            {
                              data.conversations.find(
                                item => item.userId === selectedUser
                              )?.email
                            }
                          </small>
                        </div>
                      </div>
                      <div className="admin-thread-messages">
                        {messages.map(message => (
                          <div
                            className={
                              message.senderRole === "admin"
                                ? "admin-bubble mine"
                                : "admin-bubble"
                            }
                            key={message.id}
                          >
                            <small>
                              {message.senderName}
                              {message.topic !== "general"
                                ? ` · ${message.topic}`
                                : ""}
                              {message.orderNumber
                                ? ` · ${message.orderNumber}`
                                : ""}
                            </small>
                            <p>{message.body}</p>
                          </div>
                        ))}
                      </div>
                      <form className="admin-reply" onSubmit={sendReply}>
                        <textarea
                          value={reply}
                          onChange={event => setReply(event.target.value)}
                          placeholder={copy(
                            "اكتب رد الإدارة…",
                            "Write an admin reply…"
                          )}
                        />
                        <button className="primary-button" disabled={busy}>
                          <Send className="h-4 w-4" /> {copy("إرسال", "Send")}
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="admin-empty">
                      {copy(
                        "اختر محادثة من القائمة لبدء المتابعة.",
                        "Choose a conversation to start following up."
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
            {section === "delivery" && (
              <div className="admin-two-column">
                <section className="admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <p className="eyebrow">
                        {copy("تشغيل التوصيل", "Delivery operations")}
                      </p>
                      <h3>{copy("التوصيل والمناديب", "Delivery & riders")}</h3>
                    </div>
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="admin-big-stat">
                    <strong>{metrics?.riders || 0}</strong>
                    <span>{copy("مندوب مسجل", "registered riders")}</span>
                  </div>
                  <p className="admin-panel-copy">
                    {copy(
                      "هذه المساحة جاهزة لربط استقبال الطلبات، تعيين المندوب، حالات التوصيل، والدعم المباشر للمناديب دون خلطه بدعم العملاء.",
                      "This space is ready for intake, rider assignment, delivery states, and direct rider support without mixing it with customer support."
                    )}
                  </p>
                </section>
                <section className="admin-panel">
                  <p className="eyebrow">
                    {copy("حالات التوصيل", "Delivery states")}
                  </p>
                  <h3>
                    {copy(
                      "الطلبات التي تحتاج قرارًا",
                      "Orders needing a decision"
                    )}
                  </h3>
                  {data.orders
                    .filter(order =>
                      ["ready", "assigned", "out_for_delivery"].includes(
                        order.status
                      )
                    )
                    .slice(0, 8)
                    .map(order => (
                      <div
                        className="admin-list-row compact"
                        key={order.orderNumber}
                      >
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <small>
                            {order.customerName} · {order.status}
                          </small>
                        </div>
                        <button onClick={() => setSection("orders")}>
                          {copy("فتح", "Open")}
                        </button>
                      </div>
                    ))}
                  {!data.orders.some(order =>
                    ["ready", "assigned", "out_for_delivery"].includes(
                      order.status
                    )
                  ) && (
                    <div className="admin-empty">
                      {copy(
                        "لا توجد طلبات توصيل معلقة الآن.",
                        "No delivery orders need attention right now."
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
            {section === "marketplace" && (
              <div className="admin-two-column">
                <section className="admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <p className="eyebrow">
                        {copy("إدارة السوق", "Marketplace management")}
                      </p>
                      <h3>{copy("المتاجر", "Stores")}</h3>
                    </div>
                    <Store className="h-5 w-5" />
                  </div>
                  {data.stores.map(store => (
                    <button
                      type="button"
                      className="admin-list-row admin-clickable-row"
                      key={store.id}
                      onClick={() => {
                        setSelectedDetail({ type: "store", id: store.id });
                        setSection("detail-store");
                      }}
                    >
                      <div className="admin-row-icon">
                        <Store className="h-4 w-4" />
                      </div>
                      <div>
                        <strong>{store.name}</strong>
                        <small>
                          {store.neighborhood} · {store.category}
                        </small>
                      </div>
                      <b>
                        {store.products} {copy("منتجات", "products")}
                      </b>
                    </button>
                  ))}
                </section>
                <section className="admin-panel">
                  <p className="eyebrow">
                    {copy("الحسابات المرتبطة", "Connected accounts")}
                  </p>
                  <h3>
                    {copy(
                      "المتجر والعملاء في الصورة نفسها",
                      "Stores and customers in one view"
                    )}
                  </h3>
                  <div className="admin-big-stat">
                    <strong>{metrics?.merchants || 0}</strong>
                    <span>{copy("تاجر", "merchants")}</span>
                  </div>
                  <p className="admin-panel-copy">
                    {copy(
                      "راقب ظهور المتجر، المنتجات والمخزون، واستقبال الطلبات من لوحة واحدة.",
                      "Monitor store visibility, products, inventory, and order intake from one place."
                    )}
                  </p>
                </section>
              </div>
            )}
            {section === "team" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy("الفريق والحسابات", "Team & accounts")}
                    </p>
                    <h3>
                      {copy(
                        "كل الأدوار تحت عين واحدة",
                        "Every role in one view"
                      )}
                    </h3>
                  </div>
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="admin-role-grid">
                  {(
                    [
                      [
                        copy("عملاء", "Customers"),
                        "customer",
                        metrics?.customers || 0,
                        UserRound,
                      ],
                      [
                        copy("تجّار", "Merchants"),
                        "merchant",
                        metrics?.merchants || 0,
                        Store,
                      ],
                      [
                        copy("مناديب", "Riders"),
                        "rider",
                        metrics?.riders || 0,
                        Truck,
                      ],
                      [
                        copy("دعم", "Support team"),
                        "staff",
                        metrics?.staff || 0,
                        MessageCircle,
                      ],
                    ] as const
                  ).map(([label, role, value, Icon]) => (
                    <button
                      type="button"
                      className="admin-role-card admin-clickable-card"
                      key={String(label)}
                      onClick={() => {
                        const first = data.users.find(
                          item => item.role === role
                        );
                        if (first) {
                          setSelectedDetail({ type: "user", id: first.id });
                          setSection("detail-user");
                        }
                      }}
                    >
                      <Icon className="h-5 w-5" />
                      <strong>{value}</strong>
                      <span>{label}</span>
                      <small>{copy("فتح التفاصيل", "Open details")}</small>
                    </button>
                  ))}
                </div>
                <form className="admin-account-form" onSubmit={createAccount}>
                  <p className="eyebrow">
                    {copy("إضافة وصول جديد", "Create access")}
                  </p>
                  <div>
                    <input
                      placeholder={copy("الاسم", "Name")}
                      value={accountName}
                      onChange={event => setAccountName(event.target.value)}
                      required
                    />
                    <input
                      placeholder={copy("البريد الإلكتروني", "Email")}
                      type="email"
                      value={accountEmail}
                      onChange={event => setAccountEmail(event.target.value)}
                      required
                    />
                    <input
                      placeholder={copy("كلمة المرور", "Password")}
                      type="password"
                      minLength={8}
                      value={accountPassword}
                      onChange={event => setAccountPassword(event.target.value)}
                      required
                    />
                    <select
                      value={accountRole}
                      onChange={event =>
                        setAccountRole(
                          event.target.value as
                            | "merchant"
                            | "rider"
                            | "staff"
                            | "rider_support"
                            | "rider_support"
                        )
                      }
                    >
                      <option value="rider">{copy("مندوب", "Rider")}</option>
                      <option value="merchant">
                        {copy("تاجر", "Merchant")}
                      </option>
                      <option value="staff">
                        {copy("خدمة عملاء", "Customer service")}
                      </option>
                      <option value="rider_support">
                        {copy("دعم المناديب", "Rider support")}
                      </option>
                    </select>
                    <button className="primary-button" disabled={busy}>
                      {copy("إنشاء الحساب", "Create account")}
                    </button>
                  </div>
                </form>
                <div className="admin-user-list">
                  {data.users.map(item => (
                    <button
                      type="button"
                      className="admin-list-row admin-clickable-row"
                      key={item.id}
                      onClick={() => {
                        setSelectedDetail({ type: "user", id: item.id });
                        setSection("detail-user");
                      }}
                    >
                      <div className="admin-avatar small">
                        {item.name.slice(0, 1)}
                      </div>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.email}</small>
                      </div>
                      <span className="admin-status">{item.role}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {section === "activity" && (
              <section className="admin-panel admin-wide-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">
                      {copy("سجل الحركة", "Activity log")}
                    </p>
                    <h3>
                      {copy(
                        "ما يحدث في المنصة",
                        "What is happening across the platform"
                      )}
                    </h3>
                  </div>
                  <Bell className="h-5 w-5" />
                </div>
                {data.recentActivity.map(item => (
                  <div
                    className="admin-activity-row large"
                    key={`${item.createdAt}-${item.label}`}
                  >
                    <i
                      className={item.type === "order" ? "order" : "support"}
                    />
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                    <time>
                      {new Date(item.createdAt).toLocaleString(
                        en ? "en-US" : "ar-JO"
                      )}
                    </time>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  const [location, navigate] = useLocation();
  const [openedOnAccountRoute] = useState(() =>
    location.startsWith("/customer")
  );
  const [isLight, setIsLight] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">(
    () => (localStorage.getItem("hassa-language") as "ar" | "en") || "ar"
  );
  const [catalog, setCatalog] = useState<Catalog>({
    stores: [],
    products: [],
    categories: [],
  });
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hassa-clean-cart") || "[]");
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useLayoutEffect(() => {
    if (openedOnAccountRoute && location.startsWith("/customer")) {
      window.location.replace("/shop");
    }
  }, [location, navigate, openedOnAccountRoute]);
  if (openedOnAccountRoute && location.startsWith("/customer")) return null;
  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.classList.toggle("light", isLight);
    document.documentElement.classList.toggle("dark", !isLight);
  }, [isLight, language]);
  useEffect(() => {
    const arToEn: Record<string, string> = {
      هـ: "H",
      هسّا: "Hassa",
      المتجر: "Shop",
      اكتشف: "Discover",
      المفضلة: "Favorites",
      حسابي: "Account",
      "العودة إلى المتجر": "Back to shop",
      السلة: "Cart",
      "الوضع الداكن": "Dark mode",
      "الوضع الفاتح": "Light mode",
      "قريب منك، على الطريق": "Near you, on the way",
      "اختيارات محلية،": "Local picks,",
      "على مزاجك.": "just your way.",
      "الأشياء الحلوة أقرب.": "The good things are closer.",
      "هسّا يجمع لك اختيارات محلية من حولك. اطلب ببساطة، وتابع كل خطوة من أول نقرة إلى بابك.":
        "Hassa brings local picks closer. Order simply and follow every step from the first click to your door.",
      "استكشف الاختيارات": "Explore picks",
      "تحتاج مساعدة؟": "Need help?",
      قريب: "Close",
      واضح: "Clear",
      بسيط: "Simple",
      "اختيارات من حولك": "Picks around you",
      "تتبع كل خطوة": "Track every step",
      "اطلب بدون تعقيد": "Order with ease",
      "اختيارات اليوم": "Today's picks",
      "أقرب مما تتخيل": "Closer than you think",
      "عمّان، الأردن": "Amman, Jordan",
      "توصيل يتابعك": "Delivery you can follow",
      "عرض اليوم": "Today's offer",
      "اختيارات حلوة، أقرب لبابك.": "Good picks, closer to your door.",
      "اكتشف منتجات محلية جديدة من متاجر حولك، وتابعها بخطوات واضحة.":
        "Discover local products from nearby stores and follow every step clearly.",
      "اكتشف الآن": "Discover now",
      "اختيارات تتغير باستمرار": "Fresh picks every day",
      "كل شيء تحبه،": "Everything you love, ",
      "في مكان واحد.": "in one place.",
      "نقرّب لك التفاصيل الصغيرة التي تجعل يومك ألطف.":
        "We bring you the little things that make your day better.",
      "ابدأ الاكتشاف": "Start discovering",
      منك: "you",
      "تسوّق حسب القسم": "Shop by category",
      "اكتشف ما يناسبك.": "Find what fits you.",
      "أقسام مختارة لتصل أسرع لما تبحث عنه":
        "Curated categories to help you find things faster",
      "كل الأقسام": "All categories",
      منتجات: "products",
      "وصل حديثًا": "Recently added",
      "ماذا يلفت نظرك؟": "What catches your eye?",
      "اختيارات متاحة الآن": "picks available now",
      مساحتك: "Your space",
      "العودة للاختيارات": "Back to picks",
      "أهلاً،": "Hello,",
      "كل ما يخصك في مكان واحد: طلباتك، مفضلاتك، وإعداداتك.":
        "Everything about your account in one place: orders, favorites, and settings.",
      "تسجيل الخروج": "Log out",
      "نظرة عامة": "Overview",
      طلباتي: "My orders",
      بياناتي: "My details",
      التنبيهات: "Notifications",
      "مركز الدعم": "Support center",
      "دعم هسّا": "Hassa support",
      "تواصل معنا بالطريقة التي تناسبك.": "Contact us your way.",
      "اختر موضوع التواصل، واكتب رسالتك. إذا اخترت طلبًا سيظهر رقمه داخل المحادثة.":
        "Choose a topic and write your message. If you choose an order, its number will appear in the chat.",
      "استفسار عام": "General question",
      "متابعة طلب": "Track an order",
      "مشكلة تقنية": "Technical issue",
      "اختر رقم الطلب": "Choose an order number",
      "لا توجد طلبات بعد. بعد تنفيذ أول طلب سيظهر خيار التواصل بشأنه هنا.":
        "No orders yet. After your first order, you can contact us about it here.",
      "ابدأ المحادثة برسالة قصيرة، وسيظهر الرد هنا.":
        "Start with a short message and the reply will appear here.",
      أنت: "You",
      "تنبيهاتك في مكانها الصحيح.": "Your alerts, in the right place.",
      "ردود الدعم": "Support replies",
      "نعرض تنبيهًا عند وصول رد جديد من فريق الدعم.":
        "You will be notified when support replies.",
      مفعّل: "Enabled",
      "صوت ردود الدعم": "Support reply sound",
      "تشغيل نغمة قصيرة عند ظهور رد داخل المحادثة.":
        "Play a short tone when a reply appears in the chat.",
      "إعدادات الحساب": "Account settings",
      "بياناتك وإعداداتك.": "Your details and settings.",
      "البريد الإلكتروني": "Email",
      الاسم: "Name",
      الهاتف: "Phone",
      "لم يُضف بعد": "Not added yet",
      "لغة الواجهة": "Interface language",
      "بدّل بين العربية والإنجليزية مع ضبط اتجاه الصفحة تلقائيًا.":
        "Switch between Arabic and English; page direction updates automatically.",
      العربية: "Arabic",
      "سجل الشراء": "Purchase history",
      "طلبات محفوظة على حسابك.": "orders saved to your account.",
      "تواصل بشأن الطلب": "Contact about order",
      "آخر نشاط": "Recent activity",
      "عرض الكل": "View all",
      "ابدأ التسوق": "Start shopping",
      "تابع الطلبات واحفظ اختياراتك وتواصل مع الدعم من واجهة واحدة بسيطة.":
        "Track orders, save picks, and contact support from one simple place.",
      "لا توجد طلبات بعد.": "No orders yet.",
      "المنتج غير موجود.": "Product not found.",
      "أضف إلى السلة": "Add to cart",
      من: "From",
      "متجر محلي": "Local store",
      المنتجات: "Products",
      "اختيارات المتجر": "Store picks",
      "تواصل مع المتجر": "Contact store",
      "عن المتجر": "About the store",
      "ساعات العمل قيد التحديد": "Opening hours coming soon",
      "إرسال الرسالة": "Send message",
      "وصلت رسالتك بنجاح.": "Your message was sent successfully.",
      "السلة تنتظر اختياراتك": "Your cart is waiting",
      "سجّل الدخول لإكمال الطلب": "Log in to complete your order",
      "تأكيد الطلب": "Confirm order",
      الإجمالي: "Total",
      "العنوان / المنطقة": "Address / area",
      "رقم الهاتف": "Phone number",
      "الاسم الكامل": "Full name",
      "ملاحظات للمتجر (اختياري)": "Notes for the store (optional)",
      الخصوصية: "Privacy",
      "اختيارات محلية، أقرب لك.": "Local picks, closer to you.",
      "هسّا من حولك": "Hassa around you",
    };
    const dynamic = (value: string) => {
      if (arToEn[value]) return arToEn[value];
      let next = value
        .replace(/(\d+) منتجات/g, "$1 products")
        .replace(/(\d+) اختيارات متاحة الآن/g, "$1 picks available now")
        .replace(
          /(\d+) طلبات محفوظة على حسابك\./g,
          "$1 orders saved to your account."
        );
      for (const [ar, en] of Object.entries(arToEn))
        if (next.includes(ar)) next = next.split(ar).join(en);
      return next;
    };
    const translate = (root: Document | Element) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      nodes.forEach(node => {
        const raw = node.nodeValue || "";
        const trimmed = raw.trim();
        if (!trimmed) return;
        const translated = dynamic(trimmed);
        if (translated !== trimmed)
          node.nodeValue = raw.replace(trimmed, translated);
      });
      root
        .querySelectorAll<HTMLElement>(
          "input, textarea, button, a, [aria-label], [title]"
        )
        .forEach(element => {
          for (const attr of ["placeholder", "aria-label", "title"]) {
            const value = element.getAttribute(attr);
            if (value && arToEn[value])
              element.setAttribute(attr, arToEn[value]);
          }
        });
    };
    if (language === "en") translate(document.body);
  }, [language, location, catalog, user, orders, favorites, cart, cartOpen]);
  useEffect(() => {
    api<Catalog>("/api/catalog")
      .then(setCatalog)
      .catch(error => {
        setCatalog(previewCatalog);
        setNotice("وضع المعاينة: تعذر الاتصال بالـ API الآن.");
      });
    api<{ user: User | null }>("/api/auth/me")
      .then(result => setUser(result.user))
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, []);
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setFavorites([]);
      return;
    }
    api<{ orders: Order[] }>("/api/orders")
      .then(result => setOrders(result.orders))
      .catch(() => undefined);
    api<{ productIds: Array<{ productId: number }> }>("/api/favorites")
      .then(result =>
        setFavorites(result.productIds.map(item => item.productId))
      )
      .catch(() => undefined);
  }, [user]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  useEffect(() => {
    localStorage.setItem("hassa-clean-cart", JSON.stringify(cart));
  }, [cart]);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const addToCart = (id: number) => {
    setCart(current => {
      const found = current.find(line => line.productId === id);
      return found
        ? current.map(line =>
            line.productId === id
              ? { ...line, quantity: Math.min(20, line.quantity + 1) }
              : line
          )
        : [...current, { productId: id, quantity: 1 }];
    });
    const product = catalog.products.find(item => item.id === id);
    setNotice(`${product?.name || "المنتج"} تمت إضافته إلى السلة`);
    window.setTimeout(() => setNotice(""), 3200);
  };
  const changeCart = (id: number, amount: number) =>
    setCart(current =>
      current
        .map(line =>
          line.productId === id
            ? { ...line, quantity: line.quantity + amount }
            : line
        )
        .filter(line => line.quantity > 0)
    );
  const toggleFavorite = async (id: number) => {
    if (!user) {
      navigate("/login/customer");
      return;
    }
    const active = favorites.includes(id);
    setFavorites(current =>
      active ? current.filter(item => item !== id) : [...current, id]
    );
    try {
      await api(`/api/favorites/${id}`, { method: active ? "DELETE" : "POST" });
    } catch {
      setFavorites(current =>
        active ? [...current, id] : current.filter(item => item !== id)
      );
    }
  };
  const placeOrder = async (details: {
    name: string;
    phone: string;
    address: string;
    note: string;
  }) => {
    const selected = cart
      .map(line => ({
        line,
        product: catalog.products.find(
          product => product.id === line.productId
        ),
      }))
      .filter((item): item is { line: CartLine; product: Product } =>
        Boolean(item.product)
      );
    const storeId = selected[0]?.product.storeId;
    if (!storeId) return;
    const result = await api<{ orderNumber: string }>("/api/orders", {
      method: "POST",
      json: {
        storeId,
        customerName: details.name,
        customerPhone: details.phone,
        customerAddress: details.address,
        customerNote: details.note,
        items: cart,
      },
    });
    setCart([]);
    setCartOpen(false);
    setNotice(`تم تأكيد طلبك ${result.orderNumber}`);
    const refreshed = await api<{ orders: Order[] }>("/api/orders");
    setOrders(refreshed.orders);
    navigate("/customer/orders");
  };
  const main = (
    <Switch>
      <Route path="/shop">
        <HomePage
          catalog={catalog}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onAdd={addToCart}
        />
      </Route>
      <Route path="/shop/discover">
        <BrowsePage
          catalog={catalog}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onAdd={addToCart}
        />
      </Route>
      <Route path="/shop/section/:section">
        <BrowsePage
          catalog={catalog}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onAdd={addToCart}
          section={decodeURIComponent(
            (location.split("/").pop() || "كل الأقسام").split("?")[0]
          )}
        />
      </Route>
      <Route path="/shop/store/:handle">
        <StorePage
          catalog={catalog}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onAdd={addToCart}
          handle={location.split("/").pop()}
        />
      </Route>
      <Route path="/product/:productId">
        <ProductPage
          catalog={catalog}
          productId={location.split("/").pop()}
          onAdd={addToCart}
        />
      </Route>
      <Route path="/login/admin">
        <AdminLoginPage onAuth={setUser} />
      </Route>
      <Route path="/login/merchant">
        <PartnerLogin role="merchant" onAuth={setUser} />
      </Route>
      <Route path="/login/store">
        <PartnerLogin role="merchant" onAuth={setUser} />
      </Route>
      <Route path="/login/rider">
        <PartnerLogin role="rider" onAuth={setUser} />
      </Route>
      <Route path="/login/courier">
        <PartnerLogin role="rider" onAuth={setUser} />
      </Route>
      <Route path="/login/staff">
        <StaffLoginPage onAuth={setUser} />
      </Route>
      <Route path="/login/customer">
        <LoginPage onAuth={setUser} />
      </Route>
      <Route path="/staff">
        {!authChecked ? (
          <div className="staff-auth-loading">
            <span>جارٍ التحقق من الجلسة...</span>
          </div>
        ) : user?.role === "staff" ? (
          <StaffDashboard
            user={user}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/login/staff");
            }}
          />
        ) : (
          <StaffLoginPage onAuth={setUser} />
        )}
      </Route>
      <Route path="/admin">
        {!authChecked ? (
          <div className="staff-auth-loading">
            <span>جارٍ التحقق من الجلسة...</span>
          </div>
        ) : user?.role === "admin" ? (
          <AdminDashboard
            user={user}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/login/admin");
            }}
          />
        ) : (
          <AdminLoginPage onAuth={setUser} />
        )}
      </Route>
      <Route path="/merchant">
        {!authChecked ? (
          <div className="staff-auth-loading">
            <span>جارٍ التحقق من الجلسة...</span>
          </div>
        ) : user?.role === "merchant" ? (
          <MerchantDashboard
            user={user}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/login/merchant");
            }}
          />
        ) : (
          <PartnerLogin role="merchant" onAuth={setUser} />
        )}
      </Route>
      <Route path="/rider">
        {!authChecked ? (
          <div className="staff-auth-loading">
            <span>جارٍ التحقق من الجلسة...</span>
          </div>
        ) : user?.role === "rider" ? (
          <RiderDashboard
            user={user}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/login/rider");
            }}
          />
        ) : (
          <PartnerLogin role="rider" onAuth={setUser} />
        )}
      </Route>
      <Route path="/rider/orders">
        {!authChecked ? <div className="staff-auth-loading"><span>جارٍ التحقق من الجلسة...</span></div> : user?.role === "rider" ? <RiderSubPage user={user} view="orders" onLogout={async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); navigate("/login/rider"); }} /> : <PartnerLogin role="rider" onAuth={setUser} />}
      </Route>
      <Route path="/rider/availability">
        {!authChecked ? <div className="staff-auth-loading"><span>جارٍ التحقق من الجلسة...</span></div> : user?.role === "rider" ? <RiderSubPage user={user} view="availability" onLogout={async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); navigate("/login/rider"); }} /> : <PartnerLogin role="rider" onAuth={setUser} />}
      </Route>
      <Route path="/rider/support">
        {!authChecked ? <div className="staff-auth-loading"><span>جارٍ التحقق من الجلسة...</span></div> : user?.role === "rider" ? <RiderSubPage user={user} view="support" onLogout={async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); navigate("/login/rider"); }} /> : <PartnerLogin role="rider" onAuth={setUser} />}
      </Route>
      <Route path="/rider/settings">
        {!authChecked ? <div className="staff-auth-loading"><span>جارٍ التحقق من الجلسة...</span></div> : user?.role === "rider" ? <RiderSubPage user={user} view="settings" onLogout={async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); navigate("/login/rider"); }} /> : <PartnerLogin role="rider" onAuth={setUser} />}
      </Route>
      <Route path="/customer/:rest*">
        {user ? (
          <CustomerPage
            user={user}
            orders={orders}
            favorites={favorites}
            catalog={catalog}
            language={language}
            onLanguage={value => {
              setLanguage(value);
              localStorage.setItem("hassa-language", value);
            }}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/shop");
            }}
          />
        ) : (
          <LoginPage onAuth={setUser} />
        )}
      </Route>
      <Route path="/customer">
        {user ? (
          <CustomerPage
            user={user}
            orders={orders}
            favorites={favorites}
            catalog={catalog}
            language={language}
            onLanguage={value => {
              setLanguage(value);
              localStorage.setItem("hassa-language", value);
            }}
            onLogout={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/shop");
            }}
          />
        ) : (
          <LoginPage onAuth={setUser} />
        )}
      </Route>
      <Route>
        <HomePage
          catalog={catalog}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onAdd={addToCart}
        />
      </Route>
    </Switch>
  );
  return (
    <>
      {location.startsWith("/login") ||
      location.startsWith("/staff") ||
      location.startsWith("/admin") ||
      location.startsWith("/merchant") ||
      location.startsWith("/rider") ? (
        main
      ) : (
        <Shell
          key={language}
          isLight={isLight}
          onToggleTheme={() => setIsLight(value => !value)}
          cartCount={cartCount}
          user={user}
          onCart={() => setCartOpen(true)}
        >
          {main}
        </Shell>
      )}
      <CartDrawer
        open={cartOpen}
        lines={cart}
        products={catalog.products}
        onClose={() => setCartOpen(false)}
        onChange={changeCart}
        onOrder={placeOrder}
        user={user}
      />
      {notice && (
        <button
          type="button"
          className="toast-notice"
          onClick={() => setNotice("")}
        >
          {notice} <X className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}
export default App;
