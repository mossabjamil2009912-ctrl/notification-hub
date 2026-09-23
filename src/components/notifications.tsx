import { useMemo, useState } from "react";
import { Bell, Check, Eye, ShieldCheck, X } from "lucide-react";
import {
  NOTIF_STATE_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
  markCancelled,
  markConfirmed,
  markSeen,
  setStatus,
  statusFlow,
  useOrdersStore,
  type Notif,
  type Order,
} from "@/lib/orders";
import { money } from "@/lib/present";
import { StatusTimeline } from "@/components/purchase-flow";

function timeLabel(at: number) {
  return new Date(at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function NotificationsBell({ isAdmin }: { isAdmin: boolean }) {
  const store = useOrdersStore();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const audience = isAdmin ? "admin" : "client";
  const items = useMemo(() => store.notifs.filter((item) => item.audience === audience), [store, audience]);
  const unread = items.filter((item) => item.state === "sent").length;
  const order: Order | null = orderId ? store.orders.find((item) => item.id === orderId) || null : null;

  const openNotif = (notif: Notif) => {
    markSeen(notif.id);
    if (isAdmin) {
      setOrderId(notif.orderId);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="الإشعارات"
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-black text-brand-foreground">{unread}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)}>
          <div
            className="absolute left-3 top-[72px] max-h-[70vh] w-[min(420px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-sm font-black">{isAdmin ? "إشعارات الإدارة" : "إشعارات طلباتي"}</p>
              <button type="button" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
            </div>
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">لا توجد إشعارات حتى الآن.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((notif) => (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => openNotif(notif)}
                      className={`w-full rounded-lg border p-3 text-right transition hover:border-brand/60 ${notif.state === "sent" ? "border-brand/40 bg-brand/5" : "border-border bg-card"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-xs font-black">{notif.title}</strong>
                        <small className="shrink-0 text-[10px] text-muted-foreground">{timeLabel(notif.createdAt)}</small>
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{notif.body}</span>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-black text-skyline">
                        <Eye className="size-3" /> {NOTIF_STATE_LABELS[notif.state]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {order && <AdminOrderPanel order={order} onClose={() => setOrderId(null)} notifs={items.filter((item) => item.orderId === order.id)} />}
    </>
  );
}

function AdminOrderPanel({ order, notifs, onClose }: { order: Order; notifs: Notif[]; onClose: () => void }) {
  const flow = statusFlow(order.method);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-overlay/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="size-5 text-brand" /> تفاصيل الطلب</p>
            <p className="mt-1 text-xs text-muted-foreground">رقم الطلب: {order.id} — رقم العرض: {order.quoteNumber || "—"}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button>
        </header>

        <dl className="mt-4 grid gap-2 rounded-md bg-muted/45 p-3 text-xs sm:grid-cols-3">
          <Row label="العميل" value={order.customer} />
          <Row label="نوع المشروع" value={order.projectType} />
          <Row label="المدينة" value={order.city} />
          <Row label="طريقة الدفع" value={order.method ? PAYMENT_LABELS[order.method] : "—"} />
          <Row label="رقم الحوالة" value={order.transferRef || "—"} />
          <Row label="إثبات الدفع" value={order.proofName || (order.codConfirmed ? "دفع عند الاستلام" : "—")} />
        </dl>

        {order.editNote && (
          <p className="mt-3 rounded-md border border-brand/40 bg-brand/5 p-3 text-xs font-bold">طلب تعديل من العميل: {order.editNote}</p>
        )}

        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[520px] text-right text-xs">
            <thead className="bg-muted/60">
              <tr><th className="p-2">البند</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-center">سعر الوحدة</th><th className="p-2 text-center">الإجمالي</th></tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-center">{item.qty} {item.unit}</td>
                  <td className="p-2 text-center">{money(item.price)}</td>
                  <td className="p-2 text-center font-bold">{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-border bg-muted/60"><td colSpan={3} className="p-2 font-black">الإجمالي الكلي</td><td className="p-2 text-center font-black text-brand">{money(order.total)}</td></tr></tfoot>
          </table>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-black">تحديث حالة الطلب</p>
            <div className="flex flex-wrap gap-2">
              {flow.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatus(order.id, status)}
                  className={`rounded-full px-4 py-2 text-[11px] font-black transition ${order.status === status ? "bg-brand text-brand-foreground" : "border border-border bg-card hover:bg-muted"}`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-black">مسار الطلب</p>
            <StatusTimeline order={order} />
          </div>
        </div>

        {notifs.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-black">إشعارات هذا الطلب</p>
            <ul className="space-y-2">
              {notifs.map((notif) => (
                <li key={notif.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <span className="min-w-0"><strong className="block truncate">{notif.title}</strong><small className="text-muted-foreground">{NOTIF_STATE_LABELS[notif.state]}</small></span>
                  {notif.state !== "confirmed" && notif.state !== "cancelled" && (
                    <span className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => markConfirmed(notif.id)} className="inline-flex items-center gap-1 rounded-full bg-energy px-3 py-1.5 text-[10px] font-black text-energy-foreground">
                        <Check className="size-3" /> تأكيد
                      </button>
                      <button type="button" onClick={() => markCancelled(notif.id)} className="inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1.5 text-[10px] font-black text-destructive-foreground">
                        <X className="size-3" /> إلغاء
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-black" dir="auto">{value}</dd>
    </div>
  );
}
