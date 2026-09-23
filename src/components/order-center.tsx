import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ClipboardList, Loader2, X } from "lucide-react";
import {
  BUCKET_LABELS,
  CONFIRM_CLIENT_MESSAGE,
  NOTIF_STATE_LABELS,
  PAYMENT_LABELS,
  REJECT_CLIENT_MESSAGE,
  STATUS_LABELS,
  markCancelled,
  markConfirmed,
  markSeen,
  orderBucket,
  resubmitPayment,
  useOrdersStore,
  type Notif,
  type Order,
  type OrderBucket,
} from "@/lib/orders";
import { money } from "@/lib/present";
import { notifyAdminWhatsapp } from "@/lib/notify.functions";
import { ADMIN_NOTICE_BUTTONS } from "@/lib/admin-notice";

function timeLabel(at: number) {
  return new Date(at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

const CLIENT_TABS: OrderBucket[] = ["success", "pending", "cancelled"];
const ADMIN_TABS = [
  { id: "confirmed", label: "المؤكدة" },
  { id: "cancelled", label: "الملغية" },
  { id: "pending", label: "المعلقة" },
] as const;

/** زر يفتح قائمة الطلبات (للعميل) أو قائمة إشعارات العملاء (للإدارة). */
export function OrderCenterButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isAdmin ? "قائمة إشعارات العملاء" : "طلباتي"}
        title={isAdmin ? "قائمة إشعارات العملاء" : "طلباتي"}
        className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <ClipboardList className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-overlay/50 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <p className="text-base font-black">{isAdmin ? "إشعارات العملاء" : "طلباتي السابقة"}</p>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-muted">
                <X className="size-4" />
              </button>
            </header>
            {isAdmin ? <AdminNoticeList /> : <ClientOrderList />}
          </div>
        </div>
      )}
    </>
  );
}

function Tabs({ items, value, onChange }: { items: { id: string; label: string; count: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`rounded-full px-4 py-2 text-[11px] font-black transition ${value === item.id ? "bg-brand text-brand-foreground" : "border border-border bg-card hover:bg-muted"}`}
        >
          {item.label} ({item.count})
        </button>
      ))}
    </div>
  );
}

function ClientOrderList() {
  const store = useOrdersStore();
  const [tab, setTab] = useState<OrderBucket>("pending");
  const grouped = useMemo(() => {
    const base: Record<OrderBucket, Order[]> = { success: [], pending: [], cancelled: [] };
    store.orders.forEach((order) => base[orderBucket(order)].push(order));
    return base;
  }, [store]);

  return (
    <>
      <Tabs
        items={CLIENT_TABS.map((id) => ({ id, label: BUCKET_LABELS[id], count: grouped[id].length }))}
        value={tab}
        onChange={(id) => setTab(id as OrderBucket)}
      />
      {grouped[tab].length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">لا توجد طلبات في هذه القائمة.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {grouped[tab].map((order) => (
            <li key={order.id}>
              <ClientOrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ClientOrderCard({ order }: { order: Order }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const sendWhatsapp = useServerFn(notifyAdminWhatsapp);
  const needsFix = order.status === "cancelled" || order.needsPaymentFix === true;
  const confirmed = order.status === "payment_verified" || order.status === "confirmed";

  const resubmit = async () => {
    const ref = value.trim();
    if (ref.length < 3) {
      setError("يرجى إدخال رقم صحيح (3 أحرف على الأقل).");
      return;
    }
    setBusy(true);
    setError("");
    const next = resubmitPayment(order.id, { transferRef: ref });
    try {
      await sendWhatsapp({
        data: {
          text: `🔁 *إعادة إدخال رقم الحوالة*\n👤 العميل: ${order.customer}\n🧾 الرقم الجديد: ${ref}\n💰 الإجمالي: ${money(order.total)}`,
          clientName: order.customer,
          orderId: order.id,
          quoteNumber: order.quoteNumber || "",
          transferRef: ref,
          total: order.total,
          buttons: ADMIN_NOTICE_BUTTONS(order.id),
        },
      });
      if (next) setDone(true);
      setValue("");
    } catch {
      setError("تم حفظ الرقم، لكن تعذر إرسال الإشعار. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-sm font-black">{order.quoteNumber || order.id}</strong>
          <small className="text-[11px] text-muted-foreground">{timeLabel(order.createdAt)} — {order.projectType}</small>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[10px] font-black text-skyline">{STATUS_LABELS[order.status]}</span>
      </header>
      <dl className="mt-3 grid gap-2 rounded-md bg-muted/45 p-3 text-[11px] sm:grid-cols-3">
        <div className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">الإجمالي</dt><dd className="font-black">{money(order.total)}</dd></div>
        <div className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">طريقة الدفع</dt><dd className="font-black">{order.method ? PAYMENT_LABELS[order.method] : "—"}</dd></div>
        <div className="flex justify-between gap-2 sm:block"><dt className="text-muted-foreground">رقم الحوالة</dt><dd className="truncate font-black" dir="auto">{order.transferRef || "—"}</dd></div>
      </dl>

      {confirmed && (
        <p className="mt-3 rounded-md border border-energy/35 bg-energy/10 px-3 py-2 text-[11px] font-black text-energy">{CONFIRM_CLIENT_MESSAGE}</p>
      )}

      {needsFix && (
        <div className="mt-3 rounded-md border border-destructive/35 bg-destructive/10 p-3">
          <p className="text-[11px] font-black leading-6 text-destructive">{REJECT_CLIENT_MESSAGE}</p>
          {done ? (
            <p className="mt-2 text-[11px] font-black text-energy">تم إرسال الرقم الجديد إلى الإدارة، بانتظار التأكيد.</p>
          ) : (
            <>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                maxLength={120}
                placeholder="أعد إدخال رقم الحوالة أو رقم مرجع العملية"
                className="mt-2 w-full rounded-md border border-input bg-card px-4 py-2.5 text-sm outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={resubmit}
                disabled={busy}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-[11px] font-black text-brand-foreground disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} إرسال الرقم من جديد
              </button>
              {error && <p role="alert" className="mt-2 text-[11px] font-bold text-destructive">{error}</p>}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function AdminNoticeList() {
  const store = useOrdersStore();
  const [tab, setTab] = useState<(typeof ADMIN_TABS)[number]["id"]>("pending");

  const grouped = useMemo(() => {
    const base: Record<string, Notif[]> = { confirmed: [], cancelled: [], pending: [] };
    store.notifs
      .filter((item) => item.audience === "admin")
      .forEach((item) => {
        if (item.state === "confirmed") base['confirmed']!.push(item);
        else if (item.state === "cancelled") base['cancelled']!.push(item);
        else base['pending']!.push(item);
      });
    return base;
  }, [store]);

  const items = grouped[tab] ?? [];

  return (
    <>
      <Tabs
        items={ADMIN_TABS.map((item) => ({ id: item.id, label: item.label, count: (grouped[item.id] ?? []).length }))}
        value={tab}
        onChange={(id) => setTab(id as (typeof ADMIN_TABS)[number]["id"])}
      />
      {items.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">لا توجد إشعارات في هذه القائمة.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((notif) => {
            const order = store.orders.find((item) => item.id === notif.orderId) || null;
            return (
              <li key={notif.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-xs font-black">{notif.title}</strong>
                    <small className="text-[10px] text-muted-foreground">{timeLabel(notif.createdAt)}</small>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[10px] font-black text-skyline">{NOTIF_STATE_LABELS[notif.state]}</span>
                </div>
                <p className="mt-2 text-[11px] leading-6 text-muted-foreground" dir="auto">{notif.body}</p>
                {order && (
                  <p className="mt-1 text-[11px] font-bold">
                    {order.customer} — {money(order.total)} — {STATUS_LABELS[order.status]}
                  </p>
                )}
                {notif.state !== "confirmed" && notif.state !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => markConfirmed(notif.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-energy px-4 py-2 text-[10px] font-black text-energy-foreground"
                    >
                      <Check className="size-3" /> تأكيد الفاتورة
                    </button>
                    <button
                      type="button"
                      onClick={() => markCancelled(notif.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-destructive px-4 py-2 text-[10px] font-black text-destructive-foreground"
                    >
                      <X className="size-3" /> إلغاء الفاتورة
                    </button>
                    <button
                      type="button"
                      onClick={() => markSeen(notif.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-[10px] font-black"
                    >
                      تمت المشاهدة
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
