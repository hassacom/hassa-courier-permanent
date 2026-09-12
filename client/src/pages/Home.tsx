import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { filterCourierOrders } from "@shared/courier";
import {
  ArrowLeft,
  Bell,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  Headphones,
  House,
  Languages,
  ListChecks,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Package,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Truck,
  Upload,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type Status = "ready" | "out_for_delivery" | "in_transit" | "delivered";
type Filter = "all" | "active" | "ready" | "out_for_delivery" | "in_transit" | "delivered";
type Range = "today" | "yesterday" | "all";

type Order = {
  id: number;
  number: string;
  customer: string;
  phone: string;
  address: string;
  note?: string;
  store: string;
  total: number;
  items: { name: string; quantity: number; price: number }[];
  status: Status;
  updated: string;
  date: Range;
  eta: string;
};

const initialOrders: Order[] = [
  {
    id: 1024,
    number: "HS-1024",
    customer: "ليان أحمد",
    phone: "+962 79 555 1024",
    address: "شارع المدينة المنورة، مجمع السلام، الطابق الثاني",
    note: "الرجاء الاتصال قبل الوصول بخمس دقائق.",
    store: "متجر هسّا الرئيسي",
    total: 18.5,
    items: [
      { name: "قهوة عربية محمصة", quantity: 2, price: 5.5 },
      { name: "علبة تمر فاخر", quantity: 1, price: 7.5 },
    ],
    status: "in_transit",
    updated: "منذ 4 دقائق",
    date: "today",
    eta: "12 دقيقة",
  },
  {
    id: 1023,
    number: "HS-1023",
    customer: "عمر الخطيب",
    phone: "+962 79 555 1023",
    address: "دوار الواحة، بناية 18، مدخل B",
    store: "مخبز الحارة",
    total: 9.75,
    items: [{ name: "صندوق معجنات مشكلة", quantity: 1, price: 9.75 }],
    status: "out_for_delivery",
    updated: "منذ 18 دقيقة",
    date: "today",
    eta: "25 دقيقة",
  },
  {
    id: 1018,
    number: "HS-1018",
    customer: "سارة منصور",
    phone: "+962 79 555 1018",
    address: "حي النخيل، شارع 14، منزل 7",
    store: "ورود وهدية",
    total: 24,
    items: [{ name: "باقة ورد موسمية", quantity: 1, price: 24 }],
    status: "delivered",
    updated: "أمس، 7:40 م",
    date: "yesterday",
    eta: "تم التسليم",
  },
];

const filterLabels: Record<Filter, string> = {
  all: "كل الطلبات",
  active: "قيد التنفيذ",
  ready: "جاهزة",
  out_for_delivery: "معي الآن",
  in_transit: "جاري التوصيل",
  delivered: "مكتملة",
};

const statusLabels: Record<Status, string> = {
  ready: "جاهز للاستلام",
  out_for_delivery: "معي الآن",
  in_transit: "جاري التوصيل",
  delivered: "تم التسليم",
};

const statusColors: Record<Status, string> = {
  ready: "status-ready",
  out_for_delivery: "status-out",
  in_transit: "status-transit",
  delivered: "status-done",
};

function money(value: number) {
  return `${value.toFixed(2)} د.أ`;
}

function formatTwo(value: number) {
  return String(value).padStart(2, "0");
}

function Header({
  dark,
  onTheme,
  menuOpen,
  setMenuOpen,
  muted,
  setMuted,
  onNavigate,
}: {
  dark: boolean;
  onTheme: () => void;
  menuOpen: boolean;
  setMenuOpen: (value: boolean) => void;
  muted: boolean;
  setMuted: (value: boolean) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand-cluster">
          <Link href="/rider" className="brand" aria-label="العودة إلى لوحة المندوب">
            <span className="brand-mark">هـ</span>
            <span className="brand-name">هسّا</span>
          </Link>
          <span className="courier-chip"><UserRound size={14} /> Test مندوب</span>
        </div>
        <div className="header-controls">
          <button className="icon-button" aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} title={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"} onClick={onTheme}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-button menu-trigger" aria-label="قائمة المندوب" title="قائمة المندوب" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          {menuOpen && (
            <div className="menu-popover" role="menu">
              <div className="menu-heading"><span>مساحة المندوب</span><Sparkles size={15} /></div>
              <button onClick={() => onNavigate("/rider")}><House size={16} /> لوحة المندوب</button>
              <button onClick={() => onNavigate("/courier/orders")}><ListChecks size={16} /> الطلبات المسندة</button>
              <button onClick={() => onNavigate("/courier/availability")}><SlidersHorizontal size={16} /> حالة التوفر</button>
              <button onClick={() => onNavigate("/courier/support")}><MessageCircle size={16} /> دعم التوصيل</button>
              <button onClick={() => onNavigate("/courier/settings")}><UserRound size={16} /> إعدادات الحساب</button>
              <div className="menu-divider" />
              <button onClick={() => { setMuted(!muted); toast.success(muted ? "تم تشغيل تنبيهات التوصيل" : "تم كتم تنبيهات التوصيل"); }}><span className="menu-icon">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</span>{muted ? "تشغيل التنبيهات" : "كتم التنبيهات"}</button>
              <button className="logout-link" onClick={() => toast.info("سيتم ربط تسجيل الخروج بالمصادقة عند توصيل قاعدة البيانات")}>تسجيل الخروج <ArrowLeft size={15} /></button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PageIntro({ eyebrow, title, description, onBack = true }: { eyebrow: string; title: string; description: string; onBack?: boolean }) {
  return (
    <div className="page-intro">
      {onBack && <Link href="/rider" className="back-link"><ArrowLeft size={15} /> العودة إلى لوحة المندوب</Link>}
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${statusColors[status]}`}><span className="status-dot" />{statusLabels[status]}</span>;
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-number">{formatTwo(value)}</div><div className="metric-note">{note}</div></article>;
}

function EmptyState({ title, description, icon = <Package size={29} /> }: { title: string; description: string; icon?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p></div>;
}

function OrderCard({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  return <button className={`order-card ${selected ? "selected" : ""}`} onClick={onSelect}>
    <div className="order-card-top"><div><strong>{order.number}</strong><span className="order-meta">{order.customer} · {order.store}</span></div><ChevronLeft size={17} /></div>
    <div className="order-card-bottom"><StatusBadge status={order.status} /><span className="order-total">{order.items.reduce((sum, item) => sum + item.quantity, 0)} منتجات · {money(order.total)}</span></div>
    <div className="order-address"><MapPin size={14} />{order.address}</div>
    <div className="order-updated"><Clock3 size={12} /> آخر تحديث: {order.updated}</div>
  </button>;
}

function RecentUpdates({ orders, range, setRange, onSelect }: { orders: Order[]; range: Range; setRange: (range: Range) => void; onSelect: (order: Order) => void }) {
  const filtered = orders.filter((order) => range === "all" || order.date === range);
  return <section className="panel updates-panel">
    <div className="panel-heading"><div><p className="eyebrow terracotta">ملخص التسليم</p><h2>آخر تحديثات طلباتك</h2><p>اختر طلبًا لعرض العنوان والتفاصيل وإجراءات التسليم.</p></div><Truck className="panel-heading-icon terracotta-text" size={21} /></div>
    <div className="range-tabs">{(["today", "yesterday", "all"] as Range[]).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item === "today" ? "اليوم" : item === "yesterday" ? "الأمس" : "كل السجل"}</button>)}</div>
    {filtered.length === 0 ? <EmptyState title="لا توجد تحديثات في هذا النطاق" description="جرّب «كل السجل» لعرض الطلبات المتاحة." icon={<RefreshCw size={28} />} /> : <div className="updates-list">{filtered.map((order) => <button className="update-row" key={order.id} onClick={() => onSelect(order)}><span className={`update-bullet ${order.status}`}><Check size={14} /></span><span className="update-copy"><strong>{order.number}</strong><span>{statusLabels[order.status]} · {order.updated}</span></span><span className="update-price">{money(order.total)}</span><ChevronLeft size={16} /></button>)}</div>}
  </section>;
}

function TaskList({ orders, filter, setFilter, selectedId, onSelect }: { orders: Order[]; filter: Filter; setFilter: (filter: Filter) => void; selectedId: number; onSelect: (order: Order) => void }) {
  const filtered = useMemo(() => filterCourierOrders(orders, filter), [orders, filter]);
  return <section className="panel task-panel">
    <div className="panel-heading"><div><p className="eyebrow terracotta">قائمة المهام</p><h2>الطلبات المسندة</h2></div><button className="refresh-button" aria-label="تحديث الطلبات" title="تحديث الطلبات" onClick={() => toast.success("تم تحديث الطلبات المسندة")}><RefreshCw size={17} /></button></div>
    <div className="filter-tabs" role="tablist">{(Object.keys(filterLabels) as Filter[]).map((key) => <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{filterLabels[key]}</button>)}</div>
    {filtered.length === 0 ? <EmptyState title={filter === "active" ? "لا توجد مهام مفتوحة" : "لا توجد طلبات بهذه الحالة"} description={filter === "active" ? "ستظهر هنا الطلبات التي يرسلها الأدمن أو المتجر إلى حسابك." : "جرّب فلترًا آخر لعرض بقية سجل الطلبات."} /> : <div className="order-list">{filtered.map((order) => <OrderCard key={order.id} order={order} selected={order.id === selectedId} onSelect={() => onSelect(order)} />)}</div>}
  </section>;
}

function OrderDetails({ order, onClose, onStatus }: { order: Order; onClose: () => void; onStatus: (status: Status) => void }) {
  const [sharing, setSharing] = useState(false);
  const [proof, setProof] = useState(false);
  const [message, setMessage] = useState("");
  const isActive = order.status === "out_for_delivery" || order.status === "in_transit";
  const beginDelivery = () => { onStatus("in_transit"); toast.success("بدأت مهمة التوصيل"); };
  return <section className="detail-drawer" aria-label={`تفاصيل الطلب ${order.number}`}>
    <div className="detail-header"><div><p className="eyebrow apricot">تفاصيل المهمة</p><h2>{order.number}</h2><p>من {order.store} · تم التحديث {order.updated}</p></div><button className="close-button" onClick={onClose} aria-label="إغلاق التفاصيل"><X size={18} /></button></div>
    <div className="detail-address"><div className="detail-icon"><MapPin size={19} /></div><div><span>عنوان التسليم</span><strong>{order.address}</strong></div><div className="detail-actions"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`} target="_blank" rel="noreferrer" className="small-button primary"><ExternalLink size={14} /> الاتجاهات</a><a href={`tel:${order.phone}`} className="small-button"><Phone size={14} /> اتصال</a></div></div>
    <div className="detail-grid">
      <div className="detail-block"><div className="block-title"><MapPin size={17} /><div><p>موقع المندوب</p><h3>التتبع الحي</h3></div></div><p className="muted-copy">تُشارك الإحداثيات فقط أثناء هذه المهمة، ويمكنك إيقاف المشاركة في أي لحظة.</p><div className={`map-placeholder ${sharing ? "tracking" : ""}`}><div className="map-grid" /><div className="map-pin"><Bike size={18} /></div><span>{sharing ? "مشاركة الموقع مفعلة" : "جاهز لبدء التتبع"}</span></div>{isActive && <button className={`full-button ${sharing ? "danger" : "sage"}`} onClick={() => { setSharing(!sharing); toast.success(sharing ? "تم إيقاف مشاركة الموقع" : "بدأت مشاركة موقعك مع الأطراف المصرح لها"); }}>{sharing ? <><VolumeX size={15} /> إيقاف المشاركة</> : <><MapPin size={15} /> بدء مشاركة موقعي</>}</button>}</div>
      <div className="detail-block"><div className="block-title"><Truck size={17} /><div><p>الخط الزمني</p><h3>تسلسل التسليم</h3></div></div><div className="timeline"><div className="timeline-item done"><span /><div><strong>تم إسناد الطلب</strong><small>تمت إضافة المهمة إلى قائمتك</small></div></div><div className={`timeline-item ${order.status !== "ready" ? "done" : ""}`}><span /><div><strong>مع المندوب</strong><small>الطلب جاهز للتحرك</small></div></div><div className={`timeline-item ${order.status === "in_transit" || order.status === "delivered" ? "done" : ""}`}><span /><div><strong>جاري التوصيل</strong><small>شارك موقعك أثناء الطريق</small></div></div><div className={`timeline-item ${order.status === "delivered" ? "done" : ""}`}><span /><div><strong>تم التسليم</strong><small>إثبات التسليم يغلق المهمة</small></div></div></div><div className="action-row">{order.status === "out_for_delivery" && <button className="small-button dark" onClick={beginDelivery}><Play size={14} /> بدء التوصيل</button>}{order.status === "in_transit" && <label className="small-button apricot-button"><Upload size={14} />{proof ? "تم حفظ الإثبات" : "رفع إثبات التسليم"}<input type="file" accept="image/*" onChange={() => { setProof(true); toast.success("تم حفظ صورة إثبات التسليم"); }} /></label>}{order.status === "in_transit" && proof && <button className="small-button sage-button" onClick={() => { onStatus("delivered"); toast.success("تم تأكيد إتمام التوصيل"); }}>تأكيد تم التوصيل</button>}{order.status === "delivered" && <span className="delivered-note"><CheckCircle2 size={15} /> المهمة مكتملة</span>}</div></div>
    </div>
    <div className="detail-block customer-block"><div className="block-title"><Phone size={17} /><div><p>العميل</p><h3>بيانات التسليم</h3></div></div><div className="customer-info"><div><span>الاسم</span><strong>{order.customer}</strong></div><div><span>الهاتف</span><a href={`tel:${order.phone}`}>{order.phone}</a></div></div>{order.note && <div className="customer-note"><strong>ملاحظة العميل:</strong> {order.note}</div>}</div>
    <div className="detail-block support-block"><div className="block-title"><MessageCircle size={17} /><div><p>قناة مستقلة</p><h3>دعم التوصيل</h3></div></div><div className="chat-preview"><div className="chat-message received">مرحبًا، أنا بانتظار الطلب عند المدخل الرئيسي.</div><div className="chat-message sent">أهلًا، وصلت للموقع وسأتواصل معك عند الوصول.</div></div><div className="chat-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب للعميل عن الوصول أو العنوان..." /><button onClick={() => { if (message.trim()) { setMessage(""); toast.success("تم إرسال رسالتك للعميل"); } }}><ArrowLeft size={16} /></button></div></div>
    <div className="detail-block items-block"><div className="block-title"><Package size={17} /><div><p>محتويات الطلب</p><h3>{order.items.length} أصناف · {money(order.total)}</h3></div></div><div className="items-list">{order.items.map((item) => <div className="item-row" key={item.name}><div><strong>{item.name}</strong><span>مرجع المنتج · HS-P{order.id}</span></div><div><strong>{item.quantity} ×</strong><span>{money(item.price)}</span></div></div>)}</div></div>
  </section>;
}

function Dashboard({ dark, onTheme, orders, setOrders, muted, setMuted, menuOpen, setMenuOpen, onNavigate }: { dark: boolean; onTheme: () => void; orders: Order[]; setOrders: React.Dispatch<React.SetStateAction<Order[]>>; muted: boolean; setMuted: (value: boolean) => void; menuOpen: boolean; setMenuOpen: (value: boolean) => void; onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [range, setRange] = useState<Range>("today");
  const [selected, setSelected] = useState<Order>(orders[0]);
  const [activity, setActivity] = useState<"available" | "busy" | "unavailable">("unavailable");
  const counts = { active: orders.filter((item) => item.status !== "delivered").length, delivered: orders.filter((item) => item.status === "delivered").length, items: orders.reduce((sum, order) => sum + order.items.reduce((a, item) => a + item.quantity, 0), 0), total: orders.length };
  const changeStatus = (status: Status) => setOrders((current) => current.map((item) => item.id === selected.id ? { ...item, status } : item));
  return <>
    <Header dark={dark} onTheme={onTheme} menuOpen={menuOpen} setMenuOpen={setMenuOpen} muted={muted} setMuted={setMuted} onNavigate={onNavigate} />
    <main className="page-shell">
      <section className="hero-card"><div className="hero-glow" /><div className="hero-content"><div className="hero-topline"><div className="bike-mark"><Bike size={21} /></div><label className="activity-select"><span className="activity-pulse" /> <select value={activity} onChange={(event) => { setActivity(event.target.value as typeof activity); toast.success("تم تحديث حالة نشاطك"); }}><option value="available">متاح لاستقبال مهام</option><option value="busy">مشغول حاليًا</option><option value="unavailable">غير متاح</option></select></label></div><p className="hero-eyebrow">مساحة التوصيل</p><h1>طلباتك في مكان واحد.</h1><p>راجع العنوان والعميل ومحتويات كل طلب، شارك موقعك فقط أثناء التوصيل، وارفع إثبات التسليم قبل إغلاق المهمة.</p></div><div className="privacy-chip"><ShieldCheck size={17} /> بيانات مخصصة لمهامك فقط</div></section>
      <section className="metrics-grid"><Metric icon={<Truck size={18} />} label="قيد التنفيذ" value={counts.active} note="تحتاج متابعتك" tone="terracotta" /><Metric icon={<CheckCircle2 size={18} />} label="مكتملة" value={counts.delivered} note="ضمن سجل مهامك" tone="sage" /><Metric icon={<Package size={18} />} label="المنتجات" value={counts.items} note="في الطلبات المسندة" tone="apricot-tone" /><Metric icon={<RefreshCw size={18} />} label="إجمالي الطلبات" value={counts.total} note="كل السجل المتاح" tone="ink-tone" /></section>
      <section className="workspace-grid"><TaskList orders={orders} filter={filter} setFilter={setFilter} selectedId={selected.id} onSelect={setSelected} /><RecentUpdates orders={orders} range={range} setRange={setRange} onSelect={setSelected} /></section>
      {selected && <OrderDetails order={selected} onClose={() => setSelected(orders[0])} onStatus={changeStatus} />}
    </main>
  </>;
}

function OrdersPage({ orders, onSelect }: { orders: Order[]; onSelect: (order: Order) => void }) {
  return <div className="subpage"><PageIntro eyebrow="مساحة المندوب · الطلبات" title="الطلبات المسندة إليك" description="هذه شاشة القائمة فقط. افتح أي طلب لعرض تفاصيله الكاملة في اللوحة الرئيسية، بدون تكرار التفاصيل هنا." /><section className="panel standalone-panel"><div className="panel-heading"><div><p className="eyebrow terracotta">كل الطلبات المتاحة</p><h2>{orders.length} طلب</h2></div><ListChecks className="panel-heading-icon terracotta-text" size={22} /></div>{orders.length === 0 ? <EmptyState title="لا توجد طلبات مسندة" description="ستظهر الطلبات هنا عند إسنادها إلى حسابك." /> : <div className="order-list">{orders.map((order) => <OrderCard key={order.id} order={order} selected={false} onSelect={() => onSelect(order)} />)}</div>}</section></div>;
}

function AvailabilityPage({ orders, activity, setActivity, onNavigate }: { orders: Order[]; activity: string; setActivity: (value: string) => void; onNavigate: (path: string) => void }) {
  return <div className="subpage"><PageIntro eyebrow="مساحة المندوب · النشاط" title="الحالة والنشاط" description="غيّر جاهزيتك لاستقبال مهام جديدة من شاشة مستقلة، بينما تبقى الطلبات والتفاصيل في لوحة المندوب." /><section className="availability-grid"><div className="panel availability-card"><div className="panel-heading"><div><p className="eyebrow terracotta">حالتك الحالية</p><h2>{activity === "available" ? "متاح لاستقبال مهام" : activity === "busy" ? "مشغول حاليًا" : "غير متاح"}</h2></div><SlidersHorizontal className="panel-heading-icon terracotta-text" size={22} /></div><label className="field-label">حالة استقبال المهام<select value={activity} onChange={(event) => { setActivity(event.target.value); toast.success("تم تحديث حالة نشاطك"); }}><option value="available">متاح لاستقبال مهام</option><option value="busy">مشغول حاليًا</option><option value="unavailable">غير متاح</option></select></label><p className="helper-copy">اجعل الحالة «متاح» عندما تكون جاهزًا لاستلام طلبات جديدة، و«مشغول» أثناء تنفيذ مهمة.</p></div><div className="quick-summary"><p className="eyebrow apricot">ملخص سريع</p><h2>أرقامك اليوم</h2><div className="summary-numbers"><div><strong>{formatTwo(orders.filter((order) => order.status !== "delivered").length)}</strong><span>قيد التنفيذ</span></div><div><strong>{formatTwo(orders.length)}</strong><span>كل الطلبات</span></div></div><button className="small-button primary" onClick={() => onNavigate("/courier/orders")}>عرض الطلبات <ArrowLeft size={14} /></button></div></section></div>;
}

function SupportPage() {
  const [selected, setSelected] = useState("HS-1024");
  const [message, setMessage] = useState("");
  return <div className="subpage"><PageIntro eyebrow="مساحة المندوب · الدعم" title="محادثات دعم التوصيل" description="اختر طلبًا لإرسال رسالة عن الوصول أو العنوان. تفاصيل الطلب الكاملة تبقى في لوحة المندوب ولا تتكرر هنا." /><section className="support-layout"><div className="panel support-orders"><div className="panel-heading"><div><p className="eyebrow terracotta">طلبات تحتاج تواصلًا</p><h2>اختر طلبًا</h2></div><Headphones className="panel-heading-icon sage-text" size={22} /></div>{["HS-1024", "HS-1023"].map((number) => <button key={number} className={`support-order ${selected === number ? "active" : ""}`} onClick={() => setSelected(number)}><MessageCircle size={16} /><span><strong>{number}</strong><small>{number === "HS-1024" ? "ليان أحمد · العنوان" : "عمر الخطيب · الوصول"}</small></span><ChevronLeft size={15} /></button>)}</div><div className="panel chat-panel"><div className="chat-panel-header"><div><p className="eyebrow sage-text">قناة مستقلة</p><h2>دعم الطلب {selected}</h2></div><CircleHelp className="sage-text" size={22} /></div><div className="chat-history"><div className="chat-message received">مرحبًا، أنا بانتظار الطلب عند المدخل الرئيسي.</div><div className="chat-message sent">أهلًا، وصلت للموقع وسأتواصل معك عند الوصول.</div></div><div className="chat-compose"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب للعميل عن الوصول أو العنوان..." /><button onClick={() => { if (message.trim()) { setMessage(""); toast.success("تم إرسال رسالتك للعميل"); } }}><ArrowLeft size={16} /></button></div></div></section></div>;
}

function SettingsPage({ dark, onTheme, muted, setMuted }: { dark: boolean; onTheme: () => void; muted: boolean; setMuted: (value: boolean) => void }) {
  const [duration, setDuration] = useState("1000");
  const [volume, setVolume] = useState(0.35);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  return <><Header dark={dark} onTheme={onTheme} menuOpen={false} setMenuOpen={() => undefined} muted={muted} setMuted={setMuted} onNavigate={() => undefined} /><div className="subpage settings-page"><div className="settings-top"><Link href="/rider" className="back-link"><ArrowLeft size={15} /> العودة إلى قائمة المهام</Link><p className="eyebrow">حساب المندوب</p><h1>إعدادات الحساب</h1><p>اضبط بيانات الدخول والتنبيهات وطريقة عرض مساحة التوصيل من جهازك.</p></div><section className="settings-card"><div className="settings-heading"><div><p className="eyebrow terracotta">الأمان</p><h2>تغيير كلمة المرور</h2></div><ShieldCheck className="terracotta-text" size={23} /></div><div className="password-grid">{(["current", "next", "confirm"] as const).map((key) => <input key={key} type="password" placeholder={key === "current" ? "كلمة المرور الحالية" : key === "next" ? "كلمة المرور الجديدة" : "تأكيد كلمة المرور الجديدة"} value={passwords[key]} onChange={(event) => setPasswords({ ...passwords, [key]: event.target.value })} />)}</div><button className="small-button dark" onClick={() => { setPasswords({ current: "", next: "", confirm: "" }); toast.success("تم حفظ كلمة المرور"); }}>حفظ كلمة المرور</button></section><section className="settings-card compact-settings"><div><p className="eyebrow terracotta">التنبيهات</p><h2>تنبيهات المهام</h2><p>حدد مدة ظهور إشعار توزيع المهمة أو تحديث حالة التوصيل.</p></div><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="1000">ثانية واحدة</option><option value="2000">ثانيتان</option></select></section><section className="settings-card"><div className="settings-heading"><div><p className="eyebrow terracotta">الصوت</p><h2>أصوات الإشعارات</h2><p>تحكم بصوت تنبيهات التوصيل على هذا الجهاز.</p></div><Volume2 className="terracotta-text" size={23} /></div><div className="sound-list"><div className="sound-list-title"><strong>أصوات الحالات</strong><span>ملفات الموقع المثبتة</span></div><p><b>محادثة جديدة عند الموظف:</b> محادثة جديدة عند الموظف</p><p><b>رسالة داخل شات مفتوح:</b> رسالة داخل شات مفتوح</p><p><b>إغلاق الشات من العميل:</b> إغلاق الشات من العميل</p></div><button className="sound-toggle" onClick={() => { setMuted(!muted); toast.success(muted ? "تم تشغيل تنبيهات التوصيل" : "تم كتم تنبيهات التوصيل"); }}><span>{muted ? "تشغيل تنبيهات التوصيل" : "كتم تنبيهات التوصيل"}</span>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><label className="volume-control"><span>مستوى الصوت <small>{Math.round(volume * 100)}% · تغيير المستوى فقط</small></span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} onPointerUp={() => toast.info("تم تشغيل معاينة قصيرة للنغمة")} /></label><div className="sound-test"><strong>اختبار النغمة المختارة</strong><p>يتغير المستوى فورًا، وتعمل معاينة قصيرة عند إفلات المؤشر.</p><div>{["توزيع", "رسالة", "إغلاق"].map((label) => <button key={label} onClick={() => toast.success(`تم تشغيل نغمة ${label}`)}><Play size={13} /> {label}</button>)}</div></div></section><section className="settings-card language-card"><div><p className="eyebrow terracotta">اللغة</p><h2>اختر لغة الواجهة</h2><p>اختر لغة الواجهة المفضلة لهذا الجهاز.</p></div><div className="language-buttons"><button className={language === "ar" ? "active" : ""} onClick={() => { setLanguage("ar"); toast.success("تم اختيار العربية"); }}><Languages size={15} /> العربية</button><button className={language === "en" ? "active" : ""} onClick={() => { setLanguage("en"); toast.success("English selected"); }}><Languages size={15} /> English</button></div></section></div></>;
}

export default function Home() {
  const [location, setLocation] = useLocation();
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [activity, setActivity] = useState("unavailable");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const navigate = (path: string) => { setMenuOpen(false); setLocation(path); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const page = location === "/courier/orders" ? "orders" : location === "/courier/availability" ? "availability" : location === "/courier/support" ? "support" : location === "/courier/settings" ? "settings" : "dashboard";
  const updateOrder = (status: Status) => { if (!selectedOrder) return; const next = { ...selectedOrder, status }; setSelectedOrder(next); setOrders((current) => current.map((order) => order.id === next.id ? next : order)); };
  return <div className={`app-frame ${dark ? "theme-dark" : ""}`} dir="rtl">
    {page === "dashboard" && <Dashboard dark={dark} onTheme={() => setDark(!dark)} orders={orders} setOrders={setOrders} muted={muted} setMuted={setMuted} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onNavigate={navigate} />}
    {page === "orders" && <><Header dark={dark} onTheme={() => setDark(!dark)} menuOpen={menuOpen} setMenuOpen={setMenuOpen} muted={muted} setMuted={setMuted} onNavigate={navigate} /><main className="page-shell"><OrdersPage orders={orders} onSelect={setSelectedOrder} />{selectedOrder && <OrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} onStatus={updateOrder} />}</main></>}
    {page === "availability" && <><Header dark={dark} onTheme={() => setDark(!dark)} menuOpen={menuOpen} setMenuOpen={setMenuOpen} muted={muted} setMuted={setMuted} onNavigate={navigate} /><main className="page-shell"><AvailabilityPage orders={orders} activity={activity} setActivity={setActivity} onNavigate={navigate} /></main></>}
    {page === "support" && <><Header dark={dark} onTheme={() => setDark(!dark)} menuOpen={menuOpen} setMenuOpen={setMenuOpen} muted={muted} setMuted={setMuted} onNavigate={navigate} /><main className="page-shell"><SupportPage /></main></>}
    {page === "settings" && <SettingsPage dark={dark} onTheme={() => setDark(!dark)} muted={muted} setMuted={setMuted} />}
  </div>;
}
