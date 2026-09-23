import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BatteryCharging,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileCheck2,
  FileText,
  Grid2X2,
  Headphones,
  Home,
  House,
  Languages,
  LineChart,
  Loader2,
  LogOut,
  Network,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCircle,
  Zap,
} from "lucide-react";
import residentialImage from "@/assets/actes-residential.jpg";
import commercialImage from "@/assets/actes-commercial.jpg";
import industrialImage from "@/assets/actes-industrial.jpg";
import agricultureImage from "@/assets/actes-agriculture.jpg";
import homeHeroImage from "@/assets/actes-home-hero.jpg";
import startScreenImage from "@/assets/actes-start-screen.png";
import solarPanelImage from "@/assets/product-solar-panel.png";
import inverterImage from "@/assets/product-inverter.png";
import batteryImage from "@/assets/product-battery.png";
import { runBot, type BotResult, type BotSession } from "@/lib/bot-engine.js";
import { buildView, money, type View } from "@/lib/present";
import { useServerFn } from "@tanstack/react-start";
import { verifyAdminPassword } from "@/lib/admin.functions";
import { notifyAdminWhatsapp } from "@/lib/notify.functions";
import { ADMIN_NOTICE_BUTTONS, buildAdminNotice } from "@/lib/admin-notice";
import { downloadQuotePdf } from "@/lib/quote-pdf";
import { PurchaseFlow } from "@/components/purchase-flow";
import { NotificationsBell } from "@/components/notifications";
import { OrderCenterButton } from "@/components/order-center";
import { AdminDashboard } from "@/components/admin-dashboard";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ACTES — حلول أنظمة الطاقة الشمسية" },
      { name: "description", content: "منصة أكتس لتصميم منظومات الطاقة الشمسية وإعداد عروض الأسعار ودراسات الأداء والمخططات." },
      { property: "og:title", content: "ACTES — حلول أنظمة الطاقة الشمسية" },
      { property: "og:description", content: "صمّم منظومتك واحصل على عرض سعر ودراسة أداء ومخطط واضح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActesApp,
});

const PHONE = "967700000000";

const STEP_LABELS: Record<string, string> = {
  start: "الرئيسية",
  welcome_services: "الرئيسية",
  menu_sys3: "نوع المشروع",
  energy_menu: "حلول الطاقة",
  quote_menu: "نوع المشروع",
  main_menu: "الخدمات",
  res_bill: "بيانات الاستهلاك",
  res_value: "قيمة الاستهلاك",
  res_tie: "طريقة الربط",
  res_browse: "المنظومات الجاهزة",
  res_browse_inv: "اختيار الإنفرتر",
  res_quote_ask: "عرض المنظومة",
  quote_name: "بيانات العميل",
  quote_city: "بيانات العميل",
  buy_ask: "عرض السعر",
  buy_invoice: "عرض السعر",
  com_method: "طريقة الحساب",
  com_value: "بيانات الاستهلاك",
  ind_name: "بيانات المشروع",
  pv_loads: "بيانات الأحمال",
  pv_study_ask: "دراسة الأداء",
  pv_sld_ask: "المخطط الكهربائي",
  item_menu: "قائمة المعدات",
  item_pick: "اختيار المعدات",
  item_qty: "الكمية المطلوبة",
};

const BACK_OPTION_TITLES = new Set(["العودة خطوة", "العودة للبداية", "العودة إلى البداية"]);

const NAME_STEPS = new Set(["quote_name", "com_quote_name", "pv_quote_name"]);


const NAV_ITEMS = [
  { label: "الرئيسية", icon: Home, action: "home" },
  { label: "طلب عرض سعر", icon: FileText, action: "quote" },
  { label: "حلول أنظمة الطاقة", icon: Grid2X2, action: "energy" },
  { label: "الدعم الفني", icon: Headphones, action: "support" },
] as const;

function ActesApp() {
  const sessionRef = useRef<BotSession>({});
  const [session, setSession] = useState<BotSession>({});
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState("start");
  const [busy, setBusy] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"" | "sent" | "failed">("");
  const [gate, setGate] = useState<"welcome" | "client-login" | "admin-login" | "app">("welcome");
  const [isAdmin, setIsAdmin] = useState(false);
  const started = useRef(false);
  const clientNameRef = useRef("");
  const lastQuoteRef = useRef<View["quote"]>(null);
  const sendWhatsapp = useServerFn(notifyAdminWhatsapp);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("actes.client");
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string };
        if (parsed?.name) clientNameRef.current = parsed.name;
      }
    } catch { /* ignore */ }
    if (window.localStorage.getItem("actes.admin") === "1" && window.localStorage.getItem("actes.adminpw")) {
      setIsAdmin(true);
      setGate("app");
    }
  }, []);

  const enterAdmin = useCallback((password?: string) => {
    setIsAdmin(true);
    setGate("app");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("actes.admin", "1");
      if (password) window.localStorage.setItem("actes.adminpw", password);
    }
  }, []);

  const exitAdmin = useCallback(() => {
    setIsAdmin(false);
    setGate("welcome");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("actes.admin");
      window.localStorage.removeItem("actes.adminpw");
    }
  }, []);

  const apply = useCallback((incoming: BotResult | null) => {
    if (!incoming) return;
    let result: BotResult | null = incoming;
    let guard = 0;
    // اسم العميل مأخوذ من شاشة تسجيل الدخول، فنتخطى أي خطوة تطلبه مجدداً
    while (result && NAME_STEPS.has(result.step || "") && clientNameRef.current && guard++ < 4) {
      sessionRef.current = { ...sessionRef.current, ...(result as unknown as BotSession) };
      result = runBot(sessionRef.current, {
        phone: PHONE,
        text: clientNameRef.current,
        message_id: `web.autoname.${Math.random().toString(36).slice(2)}`,
        phone_number_id: "actes-web",
      });
    }
    if (!result) return;
    sessionRef.current = { ...sessionRef.current, ...(result as unknown as BotSession) };
    setSession(sessionRef.current);
    setStep(result.step || "start");
    const nextView = buildView(result, result.step || "start");
    if (nextView.quote) lastQuoteRef.current = nextView.quote;
    setView(nextView);
    setDraft("");
  }, []);

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    setNotificationStatus("");
    const sourceStep = sessionRef.current["step"] || step;
    const result = runBot(sessionRef.current, {
      phone: PHONE,
      text: clean,
      message_id: `web.${Math.random().toString(36).slice(2)}`,
      phone_number_id: "actes-web",
    });
    const isPaymentNotice = sourceStep === "pay_notice";

    if (isPaymentNotice && result) {
      let clientPhone = "";
      try {
        const saved = window.localStorage.getItem("actes.client");
        if (saved) clientPhone = String((JSON.parse(saved) as { code?: string }).code || "");
      } catch {
        // نرسل بقية بيانات الطلب إذا تعذرت قراءة رقم العميل.
      }

      const customerName = String(clientNameRef.current || result["customer_name"] || sessionRef.current["customer_name"] || "عميل ACTES");
      const paymentMethod = String(result["service_needed"] || sessionRef.current["service_needed"] || "حوالة");
      const quoteNumber = String(result["quote_number"] || sessionRef.current["quote_number"] || "");
      const lastQuote = lastQuoteRef.current;
      const total = Number(lastQuote?.total) || 0;
      const notice = buildAdminNotice({
        customerName,
        clientPhone,
        items: lastQuote?.items || [],
        total,
        method: paymentMethod,
        transferRef: clean,
      });

      try {
        const delivery = await sendWhatsapp({
          data: {
            text: notice.text,
            clientName: customerName,
            clientPhone,
            quoteNumber,
            transferRef: clean,
            method: paymentMethod,
            total,
            system: notice.system,
            buttons: ADMIN_NOTICE_BUTTONS(quoteNumber || clean),
          },
        });
        if (!delivery.ok) {
          setNotificationStatus("failed");
          setBusy(false);
          return;
        }
        setNotificationStatus("sent");
      } catch {
        setNotificationStatus("failed");
        setBusy(false);
        return;
      }
    }

    window.setTimeout(() => {
      apply(result);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 160);
  }, [apply, sendWhatsapp, step]);

  const reset = useCallback(() => {
    sessionRef.current = {};
    const result = runBot({}, { phone: PHONE, text: "مرحبا", message_id: "web.init", phone_number_id: "actes-web" });
    sessionRef.current = { ...((result || {}) as unknown as BotSession) };
    if (clientNameRef.current) {
      (sessionRef.current as Record<string, unknown>)["customer_name"] = clientNameRef.current;
    }
    setSession(sessionRef.current);
    setStep(result?.step || "start");
    setView(result ? buildView(result, result.step || "start") : null);
    setDraft("");
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    reset();
  }, [reset]);

  const isHome = step === "start" || step === "welcome_services";


  const triggerService = useCallback((kind: "quote" | "energy" | "support") => {
    if (!view) return;
    const words = kind === "quote" ? ["عرض", "سعر"] : kind === "energy" ? ["حلول", "طاقة"] : ["دعم"];
    const option = view.options.find((item) => words.every((word) => item.title.includes(word)));
    if (option) send(option.id);
  }, [send, view]);

  const handleNav = (action: (typeof NAV_ITEMS)[number]["action"]) => {
    if (action === "home") return reset();
    if (!isHome) {
      reset();
      window.setTimeout(() => {
        const initial = runBot(sessionRef.current, {
          phone: PHONE,
          text: action === "quote" ? "1" : action === "energy" ? "2" : "3",
          message_id: `web.nav.${Date.now()}`,
          phone_number_id: "actes-web",
        });
        apply(initial);
      }, 20);
      return;
    }
    triggerService(action);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);

  const leaveApp = useCallback(() => {
    setSettingsOpen(false);
    setIsAdmin(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("actes.admin");
      window.localStorage.removeItem("actes.adminpw");
    }
    reset();
    setGate("welcome");
  }, [reset]);

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      {gate === "welcome" ? (
        <WelcomeScreen onClient={() => setGate("client-login")} onAdmin={() => setGate("admin-login")} />
      ) : gate === "client-login" ? (
        <ClientLogin
          onSuccess={(name, code) => {
            clientNameRef.current = name;
            sessionRef.current = { ...sessionRef.current, customer_name: name, name, clientCode: code } as BotSession;
            setSession(sessionRef.current);
            if (typeof window !== "undefined") {
              window.localStorage.setItem("actes.client", JSON.stringify({ name, code }));
            }
            setGate("app");
          }}
          onCancel={() => setGate("welcome")}
        />
      ) : gate === "admin-login" ? (
        <AdminLogin onSuccess={enterAdmin} onCancel={() => setGate("welcome")} />
      ) : isAdmin ? (
        <AdminDashboard onExit={exitAdmin} />
      ) : (

       <div className="h-dvh overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_246px]">
      <AppSidebar active={isHome ? "home" : "quote"} onNavigate={handleNav} onSettings={() => setSettingsOpen(true)} onExit={leaveApp} />
      <div className="flex h-dvh min-w-0 flex-col overflow-hidden lg:col-start-1 lg:row-start-1">
        <TopBar isAdmin={isAdmin} onExitAdmin={exitAdmin} onSettings={() => setSettingsOpen(true)} onExit={leaveApp} />
         <main className="mx-auto flex w-full max-w-[1680px] flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-6 xl:px-7">
          {busy && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-overlay/35 backdrop-blur-[2px]">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-6 py-4 text-sm font-bold shadow-xl">
                <Loader2 className="size-5 animate-spin text-brand" /> جارٍ تجهيز الخطوة التالية
              </div>
            </div>
          )}

          {notificationStatus === "failed" && (
            <div role="alert" className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl rounded-lg border border-destructive/35 bg-card px-4 py-3 text-center text-sm font-bold text-destructive shadow-xl">
              لم يُرسل إشعار واتساب. بقي رقم الحوالة محفوظاً في الخانة؛ اضغط إرسال للمحاولة مرة أخرى.
            </div>
          )}
          {notificationStatus === "sent" && (
            <div role="status" className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl rounded-lg border border-energy/35 bg-card px-4 py-3 text-center text-sm font-bold text-energy shadow-xl">
              تم تسليم إشعار الحوالة إلى خدمة واتساب بنجاح.
            </div>
          )}

          {view && isHome ? (
            <HomeDashboard onService={triggerService} />
          ) : view ? (
            <QuoteWorkspace
              key={step}
              view={view}
              session={session}
              step={step}
              draft={draft}
              setDraft={setDraft}
              onPick={send}
              onBack={() => send("back_step")}
              onRestart={() => send("0")}
            />

          ) : null}
        </main>
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isAdmin={isAdmin}
        onRestart={() => { setSettingsOpen(false); reset(); }}
        onAdminLogin={() => { setSettingsOpen(false); setGate("admin-login"); }}
        onAdminLogout={() => { setSettingsOpen(false); exitAdmin(); }}
      />
      </div>
      )}
    </div>
  );
}

function SettingsPanel({ open, onClose, isAdmin, onRestart, onAdminLogin, onAdminLogout }: { open: boolean; onClose: () => void; isAdmin: boolean; onRestart: () => void; onAdminLogin: () => void; onAdminLogout: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-overlay/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="الإعدادات" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-secondary text-skyline"><Settings className="size-5" /></span>
          <div>
            <h2 className="text-lg font-black">الإعدادات</h2>
            <p className="text-xs text-muted-foreground">تفضيلات التطبيق وحالة الحساب</p>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm">
            <span className="font-bold">لغة الواجهة</span>
            <span className="font-semibold text-muted-foreground">العربية</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm">
            <span className="font-bold">نوع الحساب</span>
            <span className="font-semibold text-muted-foreground">{isAdmin ? "إدارة ACTES" : "عميل"}</span>
          </div>
          <button type="button" onClick={onRestart} className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-bold transition hover:bg-muted">
            <RotateCcw className="size-4" /> بدء محادثة جديدة من البداية
          </button>
          {isAdmin ? (
            <button type="button" onClick={onAdminLogout} className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-bold transition hover:bg-muted">
              <LogOut className="size-4" /> الخروج من وضع الإدارة
            </button>
          ) : (
            <button type="button" onClick={onAdminLogin} className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-sm font-bold transition hover:bg-muted">
              <ShieldCheck className="size-4" /> الدخول كمسؤول
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-md bg-brand px-4 py-3 text-sm font-black text-brand-foreground transition hover:opacity-90">
          إغلاق
        </button>
      </div>
    </div>
  );
}

function WelcomeScreen({ onClient, onAdmin }: { onClient: () => void; onAdmin: () => void }) {
  return (
    <main className="relative grid h-dvh w-full place-items-center overflow-hidden bg-card" dir="ltr">
      <div className="relative" style={{ width: "min(100vw, calc(100dvh * (1672 / 934)))", aspectRatio: "1672 / 934" }}>
        <img src={startScreenImage} alt="أكتس لأنظمة الطاقة وحلولها" className="absolute inset-0 size-full object-fill" />
        <button
          type="button"
          onClick={onClient}
          aria-label="Start as Client"
          className="absolute cursor-pointer rounded-full transition hover:bg-brand/10 active:bg-brand/20"
          style={{ left: "28%", right: "28%", top: "54.5%", bottom: "31.5%" }}
        />
        <button
          type="button"
          onClick={onAdmin}
          aria-label="Start as Admin"
          className="absolute cursor-pointer rounded-full transition hover:bg-brand/10 active:bg-brand/20"
          style={{ left: "28%", right: "28%", top: "70.5%", bottom: "14.5%" }}
        />
      </div>
    </main>
  );
}

function ClientLogin({ onSuccess, onCancel }: { onSuccess: (name: string, code: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return setError("الرجاء إدخال اسم العميل");
    if (!code.trim()) return setError("الرجاء إدخال رقم العميل");
    setError("");
    onSuccess(name.trim(), code.trim());
  };

  return (
    <main className="relative grid h-dvh w-full place-items-center overflow-hidden bg-card px-6" dir="rtl">
      <img src={homeHeroImage} alt="" className="absolute inset-0 size-full object-cover opacity-15" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand text-brand-foreground"><UserCircle className="size-7" /></div>
          <h1 className="mt-4 text-2xl font-black">تسجيل الدخول</h1>
          <p className="mt-1 text-xs text-muted-foreground">أدخل بياناتك للمتابعة كعميل</p>
        </div>
        <label className="mt-6 block text-sm font-bold">اسم العميل</label>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="الاسم الكامل"
          className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-4 text-base outline-none transition focus:border-brand"
        />
        <label className="mt-4 block text-sm font-bold">رقم العميل</label>
        <input
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="مثال: 7xxxxxxxx"
          className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-4 text-base outline-none transition focus:border-brand"
        />
        {error && <p className="mt-2 text-xs font-bold text-destructive">{error}</p>}
        <button
          type="submit"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-base font-black text-brand-foreground transition hover:opacity-90"
        >
          دخول
        </button>
        <button type="button" onClick={onCancel} className="mt-3 w-full text-center text-xs font-bold text-muted-foreground transition hover:text-foreground">
          رجوع
        </button>
      </form>
    </main>
  );
}

function AdminLogin({ onSuccess, onCancel }: { onSuccess: (password: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const check = useServerFn(verifyAdminPassword);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(false);
    try {
      const result = await check({ data: { password } });
      if (result.ok) onSuccess(password);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid h-dvh w-full place-items-center overflow-hidden bg-card px-6" dir="ltr">
      <img src={industrialImage} alt="" className="absolute inset-0 size-full object-cover opacity-15" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand text-brand-foreground"><ShieldCheck className="size-7" /></div>
          <h1 className="mt-4 text-2xl font-black">Admin Access</h1>
          <p className="mt-1 text-xs text-muted-foreground">Enter Admin Password</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Admin Password"
          className="mt-6 h-12 w-full rounded-lg border border-border bg-background px-4 text-base outline-none transition focus:border-brand"
        />
        {error && <p className="mt-2 text-xs font-bold text-destructive">Incorrect password</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand text-base font-black text-brand-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : null} Login
        </button>
        <button type="button" onClick={onCancel} className="mt-3 w-full text-center text-xs font-bold text-muted-foreground transition hover:text-foreground">
          Back
        </button>
      </form>
    </main>
  );
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="ACTES">
      <div className={`text-3xl font-black leading-none ${inverse ? "text-sidebar-foreground" : "text-brand"}`}>
        <span className="text-brand">A</span>CTES
      </div>
    </div>
  );
}

function TopBar({ isAdmin, onExitAdmin, onSettings, onExit }: { isAdmin: boolean; onExitAdmin: () => void; onSettings: () => void; onExit: () => void }) {
  return (
    <header className="grid h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border bg-card px-4 shadow-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <button type="button" onClick={onSettings} aria-label="الإعدادات" title="الإعدادات" className="grid size-10 place-items-center text-foreground lg:hidden"><Settings className="size-6" /></button>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-skyline">{isAdmin ? <ShieldCheck className="size-5" /> : <UserCircle className="size-6" />}</div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">مرحباً بك</p>
          <p className="truncate text-xs font-bold">{isAdmin ? "إدارة ACTES" : "عميل ACTES"}</p>
        </div>
        {isAdmin && (
          <span className="ms-2 hidden shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-black text-brand-foreground sm:inline-flex" dir="ltr">
            <ShieldCheck className="size-3.5" /> Admin Mode
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {isAdmin && (
          <button type="button" onClick={onExitAdmin} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted" dir="ltr">
            <LogOut className="size-4" /> Logout Admin
          </button>
        )}
        <OrderCenterButton isAdmin={isAdmin} />
        <NotificationsBell isAdmin={isAdmin} />

        <button type="button" onClick={onExit} aria-label="خروج" title="خروج" className="grid size-10 place-items-center rounded-md text-foreground transition hover:bg-muted lg:hidden"><LogOut className="size-5" /></button>
        <span className="h-7 w-px bg-border" />
        <button type="button" className="hidden items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs font-bold sm:flex">
          <Languages className="size-4" /> العربية <ChevronDown className="size-3" />
        </button>
        <div className="hidden lg:block"><BrandMark /></div>
      </div>
    </header>
  );
}

function AppSidebar({ active, onNavigate, onSettings, onExit }: { active: string; onNavigate: (action: (typeof NAV_ITEMS)[number]["action"]) => void; onSettings: () => void; onExit: () => void }) {
  return (
    <aside className="order-2 hidden min-h-dvh flex-col border-l border-border bg-card text-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:col-start-2 lg:row-start-1">
      <div className="px-7 pb-7 pt-7">
        <BrandMark />
        <p className="mt-1 text-[10px] font-semibold text-muted-foreground">أنظمة الطاقة وحلولها</p>
      </div>
      <nav className="space-y-2 px-3" aria-label="التنقل الرئيسي">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const selected = active === item.action;
          return (
            <button
              key={item.action}
              type="button"
              onClick={() => onNavigate(item.action)}
              className={`relative flex w-full items-center gap-3 rounded-md px-4 py-3 text-right text-sm font-bold transition ${selected ? "bg-brand/10 text-brand before:absolute before:inset-y-2 before:right-0 before:w-1 before:rounded-full before:bg-brand" : "text-foreground hover:bg-muted"}`}
            >
              <Icon className="size-5 shrink-0" /> <span className="flex-1">{item.label}</span><ArrowLeft className="size-3.5 text-muted-foreground" />
            </button>
          );
        })}
      </nav>
      <div className="mx-5 my-4 h-px bg-border" />
      <div className="space-y-1 px-3">
        <button type="button" onClick={onSettings} className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"><Settings className="size-5" /> الإعدادات</button>
        <button type="button" onClick={onExit} className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"><LogOut className="size-5" /> خروج</button>
      </div>
      <div className="mt-auto px-7 pb-7 text-xs font-bold text-muted-foreground">
        <span className="mb-1 inline-block h-0.5 w-6 bg-brand" />
        <p>معاً نحو طاقة مستدامة</p>
      </div>
    </aside>
  );
}

function HomeDashboard({ onService }: { onService: (kind: "quote" | "energy" | "support") => void }) {
  return (
    <div className="w-full space-y-5">
      <section className="overflow-hidden rounded-lg border border-border bg-muted">
        <img src={homeHeroImage} width={1600} height={800} alt="منزل ومنشأة تجارية تعملان بالطاقة الشمسية" className="block h-auto w-full object-contain" />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <ServiceCard image={commercialImage} icon={<FileText />} title="طلب عرض سعر" description="احصل على عرض سعر مخصص لمنظومتك الشمسية بكل سهولة وسرعة." action="ابدأ الآن" tone="brand" onClick={() => onService("quote")} />
        <ServiceCard image={agricultureImage} icon={<Sun />} title="حلول أنظمة الطاقة" description="اكتشف حلولنا المتكاملة للطاقة الشمسية للمنازل والمنشآت." action="استعرض الحلول" tone="energy" onClick={() => onService("energy")} />
        <ServiceCard image={industrialImage} icon={<Headphones />} title="الدعم الفني" description="فريقنا المتخصص جاهز لمساعدتك في أي استفسار أو مشكلة فنية." action="تواصل معنا" tone="skyline" onClick={() => onService("support")} />
      </section>

      <footer className="flex items-center justify-between border-t border-border py-4 text-[10px] text-muted-foreground">
        <span>أكتس لأنظمة الطاقة وحلولها</span><span>جميع الحقوق محفوظة © 2026 ACTES</span>
      </footer>
    </div>
  );
}

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-center gap-3 border-r border-sidebar-foreground/25 pr-3 [&_svg]:size-6 [&_svg]:text-brand">{icon}<span>{text}</span></div>;
}

function ServiceCard({ image, icon, title, description, action, tone, onClick }: { image: string; icon: ReactNode; title: string; description: string; action: string; tone: "brand" | "energy" | "skyline"; onClick: () => void }) {
  const toneClasses = tone === "brand" ? "bg-brand text-brand-foreground" : tone === "energy" ? "bg-energy text-energy-foreground" : "bg-skyline text-skyline-foreground";
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="aspect-[4/3] w-full overflow-hidden border-b border-border bg-muted"><img src={image} alt="" loading="lazy" className="size-full object-contain p-2 transition duration-500 group-hover:scale-[1.03]" /></div>
      <div className="relative px-6 pb-6 pt-9 text-center">
        <div className={`absolute -top-7 right-1/2 grid size-14 translate-x-1/2 place-items-center rounded-full border-4 border-card ${toneClasses} [&_svg]:size-6`}>{icon}</div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mx-auto mt-3 min-h-12 max-w-xs text-xs leading-6 text-muted-foreground">{description}</p>
        <button type="button" onClick={onClick} className={`mt-5 inline-flex w-full max-w-52 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-90 ${toneClasses}`}>
          {action}<ArrowLeft className="size-4" />
        </button>
      </div>
    </article>
  );
}

function QuoteWorkspace({ view, session, step, draft, setDraft, onPick, onBack, onRestart }: { view: View; session: BotSession; step: string; draft: string; setDraft: (value: string) => void; onPick: (value: string) => void; onBack: () => void; onRestart: () => void }) {
  const [selected, setSelected] = useState<string>("");
  const hasOutputs = Boolean(view.quote || view.study || view.sld || view.specs.length);
  const title = hasOutputs ? view.heading : STEP_LABELS[step] || view.heading;
  const visibleOptions = useMemo(() => view.options.filter((option) => !BACK_OPTION_TITLES.has(option.title.trim())), [view.options]);
  const isProjectSelection = step === "menu_sys3" || step === "quote_menu";
  const showEntry = step !== "done" && !view.quote && !isProjectSelection && (step in ENTRY_PROMPTS || (view.needsInput && visibleOptions.length === 0));


  const submit = () => {
    if (view.needsInput && draft.trim()) onPick(draft);
    else if (selected) onPick(selected);
  };

  return (
    <div className="w-full space-y-6 pb-8">
      <section className="overflow-hidden rounded-lg border border-border bg-muted">
        <img src={homeHeroImage} alt="أكتس لأنظمة الطاقة وحلولها" className="block h-auto w-full object-contain" />
      </section>
      <section className="min-w-0">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-xl font-black sm:text-2xl">{title}</h1>
            <span className="mt-2 block h-1 w-10 rounded-full bg-brand" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onBack} title="رجوع خطوة" aria-label="رجوع خطوة" className="grid size-10 place-items-center rounded-full border border-border bg-card text-skyline transition hover:border-brand hover:text-brand">
              <ArrowRight className="size-5" />
            </button>
            <button type="button" onClick={onRestart} title="العودة للبداية" aria-label="العودة للبداية" className={`size-10 place-items-center rounded-full border border-border bg-card text-skyline transition hover:border-brand hover:text-brand ${view.specs.length > 0 ? "hidden" : "grid"}`}>
              <RotateCcw className="size-5" />
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">

            {view.images.length > 0 && !view.quote && !isProjectSelection && <MediaGallery images={view.images} />}

            <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              {view.quote || isProjectSelection ? (
                <div className="min-w-0" />
              ) : (
                <div className="min-w-0">
                  {view.sections.flatMap((section) => section.lines).slice(0, 2).map((line, index) => <p key={index} className="text-sm font-medium leading-6 text-foreground sm:text-base">{line}</p>)}
                </div>
              )}
            </div>

            {view.specs.length > 0 && <SystemSpecs specs={view.specs} />}
            {view.quote && <QuoteCard quote={view.quote} />}
            {view.study && <DetailCard icon={<LineChart />} title="دراسة أداء المنظومة (PVsyst)" number={view.study.number} rows={view.study.rows} />}
            {view.sld && <DetailCard icon={<Network />} title="المخطط الكهربائي أحادي الخط (SLD)" number={view.sld.number} rows={view.sld.rows} />}
            {(() => {
              const visibleDocs = view.quote
                ? view.docs.filter((doc) => !(doc.url && view.quote?.fileUrl && doc.url === view.quote.fileUrl) && !/\.pdf$/i.test(doc.name))
                : view.docs;
              return visibleDocs.length > 0 ? <Documents docs={visibleDocs} /> : null;
            })()}

            {(visibleOptions.length > 0 || showEntry) && (
              <div className="mt-6 space-y-5 border-t border-border pt-5">
                {showEntry && <DataEntry value={draft} onChange={setDraft} prompt={entryPrompt(step, session)} onSubmit={submit} />}
                {visibleOptions.length > 0 && <OptionGrid options={visibleOptions} selected={selected} projectCards={isProjectSelection} onSelect={(value) => { setSelected(value); onPick(value); }} />}
              </div>
            )}
          </div>
        </section>
        {!view.quote && <ProjectAside session={session} />}
    </div>
  );
}

function OptionGrid({ options, selected, projectCards = false, onSelect }: { options: View["options"]; selected: string; projectCards?: boolean; onSelect: (value: string) => void }) {

  const asActions = options.length <= 2 && options.every((option) => !option.description);

  if (asActions) {
    return (
      <div className="flex flex-wrap gap-3">
        {options.map((option, index) => {
          const active = selected === option.id;
          const primary = index === 0;
          return (
            <button
              key={`${option.id}-${index}`}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black transition sm:flex-none ${
                primary || active
                  ? "bg-brand text-brand-foreground shadow-md hover:opacity-90"
                  : "border border-skyline/45 bg-card text-skyline hover:bg-muted"
              }`}
            >
              {option.title}
              <ArrowLeft className="size-4" />
            </button>
          );
        })}
      </div>
    );
  }

  if (projectCards) {
    const projectVisual = (title: string) => {
      if (/سكن/.test(title)) return { image: residentialImage, icon: House, subtitle: "للمنازل والفلل" };
      if (/تجار/.test(title)) return { image: commercialImage, icon: Building2, subtitle: "للمشاريع التجارية والمنشآت" };
      return { image: industrialImage, icon: Zap, subtitle: "للمشاريع الصناعية والمنشآت الكبرى" };
    };
    return (
      <div className="grid gap-5 md:grid-cols-3">
        {options.map((option, index) => {
          const visual = projectVisual(option.title);
          const Icon = visual.icon;
          const inactive = /قريباً/.test(option.title);
          return (
            <button key={`${option.id}-${index}`} type="button" onClick={() => onSelect(option.id)} className={`group overflow-hidden rounded-lg border bg-card text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${index === 1 ? "border-brand ring-1 ring-brand" : "border-border"}`}>
              <span className="relative block aspect-[4/3] w-full overflow-hidden border-b border-border bg-muted">
                <img src={visual.image} alt="" loading="lazy" className={`size-full object-contain p-2 transition duration-500 group-hover:scale-[1.03] ${inactive ? "opacity-65" : ""}`} />
                {inactive && <span className="absolute right-3 top-3 rounded-full bg-overlay/55 px-3 py-1 text-[11px] font-bold text-brand-foreground">قريباً</span>}
                <span className={`absolute -bottom-6 right-5 grid size-14 place-items-center rounded-full border-4 border-card ${index === 1 ? "bg-brand text-brand-foreground" : "bg-secondary text-skyline"}`}><Icon className="size-6" /></span>
              </span>
              <span className="flex min-h-36 flex-col px-5 pb-4 pt-9">
                <strong className="text-xl font-black">{option.title.replace(/—.*$/, "").trim()}</strong>
                <small className="mt-1 text-sm font-semibold text-muted-foreground">{visual.subtitle}</small>
                <span className={`mt-auto grid size-10 place-items-center self-end rounded-full ${index === 1 ? "bg-brand text-brand-foreground" : "bg-brand/10 text-brand"}`}><ArrowLeft className="size-5" /></span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option, index) => {
        const active = selected === option.id;
        const Icon = index % 4 === 0 ? House : index % 4 === 1 ? Building2 : index % 4 === 2 ? Zap : BatteryCharging;
        const priceMatch = option.description?.match(/السعر:\s*([\d.,]+\s*\$?)/);
        const details = option.description ? option.description.replace(/—?\s*السعر:.*$/, "").trim() : "";
        return (
          <button
            key={`${option.id}-${index}`}
            type="button"
            onClick={() => onSelect(option.id)}
            className={`group flex h-full flex-col gap-3 rounded-xl border p-4 text-right transition hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-lg ${active ? "border-brand bg-brand/5 shadow-md" : "border-border bg-card shadow-sm"}`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg transition ${active ? "bg-brand text-brand-foreground" : "bg-secondary text-skyline group-hover:bg-brand/10 group-hover:text-brand"}`}>
                <Icon className="size-5" />
              </span>
              {active ? (
                <span className="grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"><Check className="size-3.5" /></span>
              ) : (
                <ArrowLeft className="size-4 text-muted-foreground transition group-hover:text-brand" />
              )}
            </span>
            <span className="block text-sm font-black leading-6">{option.title}</span>
            {details && <span className="block text-[11px] leading-5 text-muted-foreground">{details}</span>}
            {priceMatch && (
              <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-energy/10 px-3 py-1 text-[11px] font-black text-energy">
                <CircleDollarSign className="size-3.5" />
                {(priceMatch[1] ?? "").trim()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type EntryPrompt = { label: string; hint: string; placeholder: string; cta: string; numeric?: boolean };

const ENTRY_PROMPTS: Record<string, EntryPrompt> = {
  res_bill: { label: "فاتورة الاستهلاك الشهري", hint: "ادخل متوسط الفاتورة الشهرية التي تدفعها بالريال اليمني", placeholder: "مثال: 43000 ريال يمني", cta: "متابعة", numeric: true },
  res_value: { label: "قيمة الاستهلاك", hint: "ادخل قيمة استهلاكك الشهري كما هي في فاتورتك", placeholder: "اكتب الرقم هنا", cta: "متابعة", numeric: true },
  com_value: { label: "قيمة الاستهلاك", hint: "ادخل قيمة استهلاك المنشأة حسب الطريقة التي اخترتها", placeholder: "اكتب الرقم هنا", cta: "متابعة", numeric: true },
  pv_loads: { label: "الأحمال الكهربائية", hint: "ادخل إجمالي الأحمال أو الاستهلاك اليومي للمشروع", placeholder: "اكتب الرقم هنا", cta: "متابعة", numeric: true },
  ind_name: { label: "اسم المشروع", hint: "اكتب اسم المشروع الصناعي", placeholder: "اسم المشروع", cta: "متابعة" },
  quote_name: { label: "اسم العميل", hint: "اكتب اسمك كما تريده أن يظهر في عرض السعر", placeholder: "الاسم الكامل", cta: "متابعة" },
  quote_city: { label: "المدينة", hint: "اكتب اسم مدينتك", placeholder: "مثال: صنعاء", cta: "متابعة" },
  buy_invoice: { label: "رقم الحوالة", hint: "اكتب رقم الحوالة هنا", placeholder: "اكتب رقم الحوالة هنا", cta: "إرسال" },
  pay_notice: { label: "رقم الحوالة", hint: "اكتب رقم الحوالة هنا بعد تحويل المبلغ", placeholder: "اكتب رقم الحوالة هنا", cta: "إرسال" },
  pay_network: { label: "اسم الشبكة", hint: "اكتب اسم الشبكة التي حوّلت من خلالها", placeholder: "مثال: النجم العمقي", cta: "متابعة" },
  pay_network_name: { label: "اسم المرسل", hint: "اكتب اسم الشخص الذي حوّل المبلغ", placeholder: "اسم المرسل", cta: "متابعة" },
  pay_wallet: { label: "رقم مرجع العملية", hint: "ادخل رقم مرجع العملية هنا بعد الدفع عبر المحفظة", placeholder: "ادخل رقم مرجع العملية هنا", cta: "إرسال" },
  pay_wallet_name: { label: "اسم المرسل", hint: "اكتب اسم الشخص الذي دفع المبلغ", placeholder: "اسم المرسل", cta: "متابعة" },
  buy_location: { label: "الموقع", hint: "اكتب موقعك بالتفصيل لتسليم المنظومة", placeholder: "المدينة والحي", cta: "متابعة" },
  item_qty: { label: "الكمية المطلوبة", hint: "ادخل الكمية التي ترغب بشرائها", placeholder: "مثال: 4", cta: "متابعة", numeric: true },
};

function entryPrompt(step: string, session: BotSession = {}): EntryPrompt {
  const payWay = String(session["service_needed"] || "");
  if (step === "pay_notice" && /محفظة|wallet/i.test(payWay)) {
    return { label: "رقم مرجع العملية", hint: "ادخل رقم مرجع العملية هنا بعد الدفع عبر المحفظة", placeholder: "ادخل رقم مرجع العملية هنا", cta: "إرسال" };
  }
  return ENTRY_PROMPTS[step] ?? { label: "البيانات المطلوبة", hint: "اكتب البيانات المطلوبة في الخانة ثم تابع", placeholder: "اكتب هنا", cta: "متابعة" };
}

function DataEntry({ value, onChange, onSubmit, prompt }: { value: string; onChange: (value: string) => void; onSubmit: () => void; prompt: EntryPrompt }) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="rounded-lg border border-border bg-muted/35 p-5">
      <label htmlFor="step-value" className="text-sm font-black">{prompt.label}</label>
      <p className="mt-1 text-xs text-muted-foreground">{prompt.hint}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id="step-value"
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={prompt.placeholder}
          inputMode={prompt.numeric ? "numeric" : "text"}
          className="min-w-0 rounded-md border border-input bg-card px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
        <button type="submit" className="rounded-md bg-skyline px-6 py-3 text-sm font-bold text-skyline-foreground">{prompt.cta}</button>
      </div>
    </form>
  );
}

function MediaGallery({ images }: { images: View["images"] }) {
  return <div className={`mb-5 grid gap-4 ${images.length > 1 ? "md:grid-cols-2" : ""}`}>{images.map((image, index) => <figure key={index} className="overflow-hidden rounded-lg border border-border bg-muted/35"><div className="flex min-h-48 items-center justify-center p-3"><img src={image.url} alt={image.caption || "صورة من منتجات ACTES"} className="max-h-[420px] w-auto max-w-full object-contain" /></div>{image.caption && <figcaption className="border-t border-border bg-card px-4 py-3 text-xs leading-6 text-muted-foreground">{image.caption}</figcaption>}</figure>)}</div>;
}

const SPEC_ICONS = [Sun, Zap, BatteryCharging, Network, Settings];

function getSpecPresentation(title: string, index: number) {
  if (/لوح|ألواح|شمسي/.test(title)) return { image: solarPanelImage, label: "الألواح الشمسية", icon: Sun };
  if (/انفرتر|إنفرتر|عاكس/.test(title)) return { image: inverterImage, label: "الإنفرتر", icon: Zap };
  if (/بطارية|تخزين/.test(title)) return { image: batteryImage, label: "البطارية", icon: BatteryCharging };
  return { image: null, label: title, icon: SPEC_ICONS[index % SPEC_ICONS.length] ?? Settings };
}

function parseSpecFields(lines: string[]): { label: string; value: string }[] {
  let type = "";
  const extras: string[] = [];
  let qty = "";
  for (const line of lines) {
    const qtyMatch = line.match(/^الكمية\s*[:：]\s*(.+)$/);
    if (qtyMatch) { qty = qtyMatch[1]!.trim(); continue; }
    if (!type) type = line;
    else if (line) extras.push(line);
  }
  let power = "";
  let typeClean = type;
  if (type) {
    const pm = type.match(/\s*(?:بقدرة|بسعة)\s*[\d.,]+\s*(?:kWh|kW|W)\b/i) || type.match(/\s*\b[\d.,]+\s*(?:kWh|kW|W)\s*$/i);
    if (pm && pm[0]) {
      const raw = pm[0].match(/[\d.,]+\s*(kWh|kW|W)/i);
      if (raw && raw[1] && raw[0]) {
        const num = raw[0].replace(/kWh|kW|W/i, "").replace(",", ".").trim();
        const unit = /kWh/i.test(raw[1]) ? "كيلووات ساعة" : /kW/i.test(raw[1]) ? "كيلووات" : "وات";
        power = `${num} ${unit}`;
        typeClean = type.replace(pm[0], "").trim();
      }
    }
  }
  const rows: { label: string; value: string }[] = [];
  if (typeClean) rows.push({ label: "النوع", value: typeClean.replace(/\s*[|/]\s*$/, "") });
  if (power) rows.push({ label: "القدرة", value: power });
  else if (extras.length) rows.push({ label: "المواصفات", value: extras.join(" — ") });
  if (qty) rows.push({ label: "الكمية", value: qty });
  if (rows.length === 0) rows.push(...lines.map((line) => ({ label: "المواصفات", value: line })));
  return rows;
}

function SystemSpecs({ specs }: { specs: View["specs"] }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-xl font-black sm:text-2xl">
          <Sparkles className="size-6 text-brand" /> مكونات المنظومة المقترحة
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground sm:text-sm">تم اختيار المكونات المناسبة حسب بياناتك لتحقيق أفضل أداء وكفاءة</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {specs.map((group, index) => {
          const presentation = getSpecPresentation(group.title, index);
          const Icon = presentation.icon;
          return (
            <article key={index} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3 p-4 pb-2">
                <div>
                  <h3 className="text-lg font-black">{presentation.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{group.title}</p>
                </div>
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground"><Icon className="size-5" /></span>
              </div>
              {presentation.image && (
                <div className="flex h-40 items-center justify-center px-5 py-2">
                  <img src={presentation.image} loading="lazy" width={912} height={912} alt={group.title} className="size-full object-contain" />
                </div>
              )}
              <ul className="mx-3 mb-3 grid gap-1.5">
                {parseSpecFields(group.lines).map((row) => (
                  <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_22px] items-center gap-2 rounded-md bg-muted/55 px-3 py-2 text-xs leading-5">
                    <span className="min-w-0"><span className="text-muted-foreground">{row.label}</span><strong className="block text-foreground">{row.value}</strong></span>
                    <span className="grid size-[22px] place-items-center rounded-full bg-energy text-energy-foreground"><Check className="size-3.5" /></span>
                  </li>
                ))}
              </ul>
              <div className="mx-3 mb-3 mt-auto flex items-center gap-2 rounded-md bg-brand/10 px-3 py-2.5 text-xs font-bold text-foreground">
                <BadgeCheck className="size-5 shrink-0 text-brand" /> مكوّن موثوق ومناسب للمنظومة
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProjectAside({ session }: { session: BotSession }) {

  const facts = [
    ["نوع المنظومة", session["system_type"]],
    ["الاستهلاك الشهري", session["monthly_consumption"] ? `${session["monthly_consumption"]} kWh` : null],
    ["نوع الطور", session["phase_type"]],
    ["اسم العميل", session["customer_name"]],
    ["المدينة", session["city"]],
  ].filter((row) => row[1]);
  if (facts.length === 0) return null;
  return <aside className="mt-4 rounded-lg border border-border bg-card p-4 shadow-sm"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{facts.map(([label, value]) => <div key={String(label)} className="rounded-md bg-muted/45 px-3 py-2 text-[11px]"><dt className="text-muted-foreground">{String(label)}</dt><dd className="mt-1 truncate font-bold">{String(value)}</dd></div>)}</dl></aside>;
}

function AsideBenefit({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-center gap-3 px-3 py-3 text-xs font-bold text-skyline [&_svg]:size-5">{icon}<span>{text}</span></div>;
}

function QuoteCard({ quote }: { quote: NonNullable<View["quote"]> }) {
  return (
    <section className="mt-1">
      <div className="overflow-hidden rounded-md border-2 border-black bg-white font-[Arial,Helvetica,sans-serif] text-black">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b-2 border-black bg-white px-4 py-3">
          <div className="min-w-0"><p className="text-sm font-black">أكتس لأنظمة الطاقة وحلولها</p><p className="text-[11px] font-bold">عرض سعر</p></div>
          <div className="text-left text-[11px] font-bold leading-5"><p>رقم العرض: {quote.number || "—"}</p><p>العميل: {quote.customer || "—"}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-right text-xs">
            <thead>
              <tr className="bg-[#e8202a] text-black">
                <th className="border border-black p-2 text-center text-[13px] font-bold">م</th>
                <th className="border border-black p-2 text-center text-[13px] font-bold">البند والمواصفات</th>
                <th className="border border-black p-2 text-center text-[13px] font-bold">الوحدة</th>
                <th className="border border-black p-2 text-center text-[13px] font-bold">الكمية</th>
                <th className="border border-black p-2 text-center text-[13px] font-bold">سعر الوحدة</th>
                <th className="border border-black p-2 text-center text-[13px] font-bold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, index) => (
                <tr key={index} className="align-top">
                  <td className="border border-black p-1.5 text-center font-bold">{index + 1}</td>
                  <td className="border border-black p-1.5 text-right"><p className="text-[12px] font-bold leading-5">{item.name}</p>{item.details.map((detail, detailIndex) => <p key={detailIndex} className="text-[10px] leading-4">{detail}</p>)}</td>
                  <td className="border border-black p-1.5 text-center font-bold">{item.unit}</td>
                  <td className="border border-black p-1.5 text-center font-bold">{item.qty}</td>
                  <td className="border border-black p-1.5 text-center font-bold">{money(Number(item.price) || 0)}</td>
                  <td className="border border-black p-1.5 text-center font-bold">{money(Number(item.total) || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#bfbfbf]">
                <td colSpan={5} className="border border-black p-2 text-center text-[13px] font-black">الإجمالي الكلي</td>
                <td className="border border-black p-2 text-center text-[13px] font-black text-[#c00000]">{money(quote.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <button
        type="button"
        onClick={() => downloadQuotePdf(quote)}
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground transition hover:border-brand"
      >
        <Download className="size-3.5" /> تحميل عرض السعر PDF
      </button>
      {quote.fileUrl && (
        <a href={quote.fileUrl} target="_blank" rel="noreferrer" download={quote.fileName} className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#e8202a] px-5 py-2.5 text-xs font-bold text-white">
          <Download className="size-4" /> تحميل ملف عرض السعر
        </a>
      )}
    </section>
  );
}


function DetailCard({ icon, title, number, rows }: { icon: ReactNode; title: string; number: string; rows: { label: string; value: string }[] }) {
  return <section className="mt-4 rounded-lg border border-border bg-card p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-md bg-secondary text-skyline [&_svg]:size-5">{icon}</span><div><h3 className="font-black">{title}</h3>{number && <p className="text-[10px] text-muted-foreground">المرجع: {number}</p>}</div></div><dl className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map((row) => <div key={row.label} className="rounded-md bg-muted/55 px-4 py-3"><dt className="text-[10px] text-muted-foreground">{row.label}</dt><dd className="mt-1 text-sm font-bold">{row.value}</dd></div>)}</dl></section>;
}

function Documents({ docs }: { docs: View["docs"] }) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{docs.map((doc, index) => <a key={index} href={doc.url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md border border-border bg-card p-4 transition hover:border-brand"><span className="grid size-10 place-items-center rounded-md bg-brand/10 text-brand"><FileCheck2 className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{doc.name}</strong>{doc.caption && <small className="block truncate text-[10px] text-muted-foreground">{doc.caption}</small>}</span><Download className="size-4 text-muted-foreground" /></a>)}</div>;
}