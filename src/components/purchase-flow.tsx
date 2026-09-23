import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Banknote,
  Check,
  CircleDollarSign,
  Clock,
  CreditCard,
  Loader2,
  PencilLine,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import {
  PAYMENT_LABELS,
  PAYMENT_PENDING_LABEL,
  STATUS_LABELS,
  createOrder,
  findOrder,
  requestEdit,
  setPayment,
  statusFlow,
  useOrdersStore,
  type Order,
  type PaymentMethod,
} from "@/lib/orders";
import { money, type View } from "@/lib/present";
import { notifyAdminWhatsapp } from "@/lib/notify.functions";
import { ADMIN_NOTICE_BUTTONS, buildAdminNotice } from "@/lib/admin-notice";

type Quote = NonNullable<View["quote"]>;

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: typeof Wallet }[] = [
  { id: "network", label: "الشبكات المحلية", hint: "تحويل بنكي أو شبكة محلية مع رقم الحوالة", icon: CreditCard },
  { id: "wallet", label: "المحافظ الإلكترونية", hint: "دفع عبر المحفظة مع رقم مرجع العملية", icon: Wallet },
  { id: "cod", label: "الدفع عند الاستلام", hint: "الدفع نقداً عند تسليم المنظومة", icon: Banknote },
];

export function PurchaseFlow({ quote, customer, projectType, city }: { quote: Quote; customer: string; projectType: string; city: string }) {
  const store = useOrdersStore();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [stage, setStage] = useState<"offer" | "method" | "details" | "tracking">("offer");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [transferRef, setTransferRef] = useState("");
  const [proofName, setProofName] = useState("");
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const sendWhatsapp = useServerFn(notifyAdminWhatsapp);

  const order: Order | null = useMemo(
    () => (orderId ? store.orders.find((item) => item.id === orderId) || findOrder(orderId) : null),
    [orderId, store],
  );

  const startPurchase = () => {
    setBusy(true);
    const created = createOrder({
      quoteNumber: quote.number || "",
      customer: quote.customer || customer || "عميل ACTES",
      projectType: projectType || "—",
      city: city || "—",
      items: quote.items.map((item) => ({
        name: item.name,
        qty: String(item.qty),
        unit: String(item.unit),
        price: Number(item.price) || 0,
        total: Number(item.total) || 0,
      })),
      total: Number(quote.total) || 0,
    });
    setOrderId(created.id);
    setStage("method");
    setBusy(false);
  };

  const confirmOrder = async () => {
    if (!orderId || !method) return;
    setBusy(true);
    setSendError("");
    const savedOrder = setPayment(orderId, method, { transferRef, proofName, codConfirmed });
    if (!savedOrder) {
      setSendError("تعذر حفظ الطلب. حاول مرة أخرى.");
      setBusy(false);
      return;
    }

    let clientName = savedOrder.customer;
    let clientPhone = "";
    try {
      const raw = window.localStorage.getItem("actes.client");
      if (raw) {
        const client = JSON.parse(raw) as { name?: string; code?: string };
        clientName = client.name || clientName;
        clientPhone = client.code ? String(client.code) : "";
      }
    } catch {
      // بيانات الطلب المحفوظة تكفي عند تعذر قراءة بيانات الدخول.
    }

    const notice = buildAdminNotice({
      customerName: clientName,
      clientPhone,
      items: quote.items,
      total: Number(savedOrder.total) || 0,
      method: PAYMENT_LABELS[method],
      transferRef: savedOrder.transferRef || "",
    });

    try {
      const result = await sendWhatsapp({
        data: {
          text: notice.text,
          clientName,
          clientPhone,
          orderId: savedOrder.id,
          quoteNumber: savedOrder.quoteNumber || "",
          transferRef: savedOrder.transferRef || "",
          method: PAYMENT_LABELS[method],
          total: savedOrder.total,
          system: notice.system,
          buttons: ADMIN_NOTICE_BUTTONS(savedOrder.id),
        },
      });
      if (!result.ok) {
        setSendError("حُفظ الطلب، لكن تعذر إرسال إشعار واتساب. حاول مرة أخرى.");
        setBusy(false);
        return;
      }
      setStage("tracking");
    } catch {
      setSendError("حُفظ الطلب، لكن تعذر الاتصال بخدمة إشعار واتساب. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const sendEdit = () => {
    if (!orderId || !editNote.trim()) return;
    requestEdit(orderId, editNote.trim());
    setEditNote("");
    setEditOpen(false);
  };

  const ready =
    method === "network"
      ? transferRef.trim().length >= 3
      : method === "wallet"
        ? transferRef.trim().length >= 3 || proofName.length > 0
        : method === "cod"
          ? codConfirmed
          : false;

  return (
    <section className="mt-5 rounded-lg border-2 border-brand/35 bg-card p-4 shadow-sm sm:p-6">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground"><ShoppingCart className="size-6" /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-black sm:text-xl">متابعة الشراء</h3>
          <p className="text-xs text-muted-foreground">أكّد العرض ثم اختر طريقة الدفع المناسبة لإتمام طلبك.</p>
        </div>
        <span className="ms-auto hidden shrink-0 items-center gap-1 rounded-full bg-energy/10 px-3 py-1.5 text-xs font-black text-energy sm:inline-flex">
          <CircleDollarSign className="size-4" /> {money(Number(quote.total) || 0)}
        </span>
      </header>

      {stage === "offer" && (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-7 text-foreground">
            راجع بنود عرض السعر أعلاه. عند التأكيد سيتم إرسال طلبك إلى إدارة ACTES لبدء إجراءات الشراء.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={startPurchase} disabled={busy} className="inline-flex min-w-52 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-black text-brand-foreground shadow-md transition hover:opacity-90 disabled:opacity-60 sm:flex-none">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} تأكيد العرض ومتابعة الشراء
            </button>
            <button type="button" onClick={() => setEditOpen((value) => !value)} className="inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-full border border-skyline/45 bg-card px-6 py-3 text-sm font-black text-skyline transition hover:bg-muted sm:flex-none">
              <PencilLine className="size-4" /> طلب تعديل على العرض
            </button>
          </div>
        </div>
      )}

      {stage !== "offer" && order && (
        <div className="mt-4 grid gap-2 rounded-md bg-muted/50 p-3 text-xs sm:grid-cols-3">
          <Fact label="رقم الطلب" value={order.id} />
          <Fact label="رقم العرض" value={order.quoteNumber || "—"} />
          <Fact label="الحالة" value={STATUS_LABELS[order.status]} />
        </div>
      )}

      {stage === "method" && (
        <div className="mt-5 space-y-4">
          <h4 className="text-sm font-black">اختر طريقة الدفع</h4>
          <div className="grid gap-3 md:grid-cols-3">
            {METHODS.map((item) => {
              const Icon = item.icon;
              const active = method === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setMethod(item.id); setStage("details"); }}
                  className={`flex h-full flex-col gap-2 rounded-xl border p-4 text-right transition hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-md ${active ? "border-brand bg-brand/5" : "border-border bg-card"}`}
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-skyline"><Icon className="size-5" /></span>
                  <span className="text-sm font-black">{item.label}</span>
                  <span className="text-[11px] leading-5 text-muted-foreground">{item.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stage === "details" && method && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-black">{PAYMENT_LABELS[method]}</h4>
            <button type="button" onClick={() => setStage("method")} className="text-xs font-bold text-skyline underline">تغيير طريقة الدفع</button>
          </div>

          {method === "network" && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs leading-6 text-muted-foreground">حوّل المبلغ إلى حساب ACTES في الشبكة المحلية، ثم اكتب رقم الحوالة هنا.</p>
              <input value={transferRef} onChange={(event) => setTransferRef(event.target.value)} placeholder="اكتب رقم الحوالة هنا" className="mt-3 w-full rounded-md border border-input bg-card px-4 py-3 text-sm outline-none focus:border-brand" />
            </div>
          )}

          {method === "wallet" && (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-xs leading-6 text-muted-foreground">ادفع عبر المحفظة الإلكترونية ثم ادخل رقم مرجع العملية هنا، ويمكنك إرفاق صورة إثبات الدفع.</p>
              <input value={transferRef} onChange={(event) => setTransferRef(event.target.value)} placeholder="ادخل رقم مرجع العملية هنا" className="mt-3 w-full rounded-md border border-input bg-card px-4 py-3 text-sm outline-none focus:border-brand" />
              <input type="file" accept="image/*,application/pdf" onChange={(event) => setProofName(event.target.files?.[0]?.name || "")} className="mt-3 w-full rounded-md border border-input bg-card px-4 py-2.5 text-xs" />
              {proofName && <p className="mt-2 text-xs font-bold text-energy">تم إرفاق: {proofName}</p>}
            </div>
          )}

          {method === "cod" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <input type="checkbox" checked={codConfirmed} onChange={(event) => setCodConfirmed(event.target.checked)} className="mt-1 size-4 accent-[hsl(var(--brand))]" />
              <span className="text-xs leading-6 text-muted-foreground">أؤكد رغبتي بالدفع نقداً عند استلام المنظومة، وسيتم تحصيل المبلغ من مندوب ACTES عند التسليم.</span>
            </label>
          )}

          <button type="button" onClick={confirmOrder} disabled={!ready || busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-black text-brand-foreground shadow-md transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:min-w-64">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />} {busy ? "جارٍ إرسال الإشعار..." : "تأكيد الطلب"}
          </button>
          {sendError && <p role="alert" className="rounded-md border border-destructive/35 bg-destructive/10 px-4 py-3 text-xs font-bold text-destructive">{sendError}</p>}
        </div>
      )}

      {stage === "tracking" && order && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-energy/10 px-4 py-3 text-xs font-black text-energy">
            <Truck className="size-4" /> {order.method ? PAYMENT_PENDING_LABEL[order.method] : "بانتظار المراجعة"}
          </div>
          <StatusTimeline order={order} />
        </div>
      )}

      {editOpen && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <label className="text-xs font-black">ما التعديل المطلوب على العرض؟</label>
          <textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-input bg-card px-4 py-3 text-sm outline-none focus:border-brand" placeholder="مثال: زيادة عدد البطاريات إلى 4" />
          <button type="button" onClick={() => { if (!orderId) startPurchase(); window.setTimeout(sendEdit, 0); }} className="mt-3 rounded-full bg-skyline px-6 py-2.5 text-xs font-black text-skyline-foreground">إرسال طلب التعديل</button>
        </div>
      )}
    </section>
  );
}

export function StatusTimeline({ order }: { order: Order }) {
  const flow = statusFlow(order.method);
  const current = flow.indexOf(order.status);
  return (
    <ol className="grid gap-2">
      {flow.map((status, index) => {
        const done = current >= index && current !== -1;
        const active = current === index;
        return (
          <li key={status} className={`grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 rounded-md px-3 py-2.5 text-xs ${active ? "bg-brand/10 font-black" : "bg-muted/45"}`}>
            <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-energy text-energy-foreground" : "bg-secondary text-muted-foreground"}`}>
              {done ? <Check className="size-4" /> : <Clock className="size-3.5" />}
            </span>
            <span>{STATUS_LABELS[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <span className="text-muted-foreground">{label}</span>
      <strong className="block truncate font-black" dir="auto">{value}</strong>
    </div>
  );
}
