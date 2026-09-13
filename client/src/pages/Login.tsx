import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Bike, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const loginMutation = trpc.auth.login.useMutation();
  const utils = trpc.useUtils();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("أدخل البريد الإلكتروني وكلمة المرور للمتابعة");
      return;
    }
    setLoading(true);
    loginMutation.mutate({ email: email.trim(), password, role: "courier" }, {
      onSuccess: async () => {
        await utils.auth.me.invalidate();
        setLoading(false);
        toast.success("تم تسجيل الدخول");
        setLocation("/rider");
      },
      onError: (error) => {
        setLoading(false);
        toast.error(error.message || "تعذر تسجيل الدخول");
      },
    });
  };

  return <main className="login-page" dir="rtl">
    <div className="login-decoration decoration-one" /><div className="login-decoration decoration-two" />
    <div className="login-shell">
      <div className="login-brand"><Link href="/rider" className="brand"><span className="brand-mark">هـ</span><span className="brand-name">هسّا</span></Link><span>مساحة التوصيل</span></div>
      <section className="login-card">
        <div className="login-visual"><div className="login-bike"><Bike size={42} /></div><p className="eyebrow apricot">لوحة المندوب</p><h1>أنجز توصيلاتك<br /><em>بوضوح وهدوء.</em></h1><p>تابع الطلبات، شارك موقعك فقط أثناء المهمة، وأغلق التسليم بإثبات واضح.</p><div className="login-trust"><ShieldCheck size={16} /> بيانات مهماتك محمية ومخصصة لك</div></div>
        <div className="login-form-wrap"><Link href="/rider" className="back-link"><ArrowLeft size={15} /> العودة إلى الصفحة الرئيسية</Link><div className="login-heading"><p className="eyebrow">أهلًا بك من جديد</p><h2>تسجيل دخول المندوب</h2><p>استخدم بيانات حسابك للوصول إلى قائمة المهام.</p></div><form onSubmit={submit} className="login-form"><label>البريد الإلكتروني<div className="input-with-icon"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="courier@hassa.com" autoComplete="email" /></div></label><label>كلمة المرور<div className="input-with-icon"><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="أدخل كلمة المرور" autoComplete="current-password" /><button type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><div className="login-options"><label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> تذكرني على هذا الجهاز</label><button type="button" onClick={() => toast.info("تواصل مع إدارة التوصيل لإعادة تعيين كلمة المرور")}>نسيت كلمة المرور؟</button></div><button className="login-submit" type="submit" disabled={loading}>{loading ? "جار تسجيل الدخول..." : "دخول إلى مساحة المندوب"}<ArrowLeft size={17} /></button></form><p className="login-footnote">يتم تسجيل الخروج تلقائيًا من الأجهزة غير المعروفة لحماية مهماتك.</p></div>
      </section>
    </div>
  </main>;
}
