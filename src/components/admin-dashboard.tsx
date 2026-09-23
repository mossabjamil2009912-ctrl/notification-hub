import { useMemo, useState } from "react";
import { Check, LogOut, ShieldCheck, X } from "lucide-react";
import {
  NOTIF_STATE_LABELS,
  STATUS_LABELS,
  markCancelled,
  markConfirmed,
  useOrdersStore,
  type Notif,
} from "@/lib/orders";
import { money } from "@/lib/present";
import confirmedImage from "@/assets/admin-confirmed.jpg";
import cancelledImage from "@/assets/admin-cancelled.jpg";
import pendingImage from "@/assets/admin-pending.jpg";

type BucketId = "confirmed" | "cancelled" | "pending";

const BUCKETS: { id: BucketId; label: string; image: string }[] = [
  { id: "confirmed", label: "الطلبات المؤكدة", image: confirmedImage },
  { id: "cancelled", label: "الطلبات الملغية", image: cancelledImage },
  { id: "pending", label: "الطلبات المعلقة", image: pendingImage },
];

function timeLabel(at: number) {
  return new Date(at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

/** وضع الإدارة: ثلاث قوائم لإشعارات العملاء فقط مع تأكيد أو إلغاء الفاتورة. */
export function AdminDashboard({ onExit }: { onExit: () => void }) {
  const store = useOrdersStore();
  const [tab, setTab] = useState<BucketId>("pending");

  const grouped = useMemo(() => {
    const base: Record<BucketId, Notif[]> = { confirmed: [], cancelled: [], pending: [] };
    store.notifs
      .filter((item) => item.audience === "admin")
      .forEach((item) => {
        if (item.state === "confirmed") base.confirmed.push(item);
        else if (item.state === "cancelled") base.cancelled.push(item);
        else base.pending.push(item);
      });
    return base;
  }, [store]);

  const items = grouped[tab];
  const active = BUCKETS.find((bucket) => bucket.id === tab)!;

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <header className="flex h-[72px] items-center justify-between border-b border-border bg-card px-4 shadow-sm sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand text-brand-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-sm font-black">إشعارات العملاء</p>
            <p className="text-[11px] text-muted-foreground">وضع الإدارة — ACTES</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted"
        >
          <LogOut className="size-4" /> خروج
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-3">
          {BUCKETS.map((bucket) => {
            const selected = tab === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => setTab(bucket.id)}
                className={`overflow-hidden rounded-xl border bg-card text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-brand ring-2 ring-brand/30" : "border-border"}`}
              >
                <div className="aspect-[3/2] w-full overflow-hidden bg-muted">
                  <img src={bucket.image} alt="" loading="lazy" width={992} height={672} className="size-full object-contain p-2" />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                  <span className="text-sm font-black">{bucket.label}</span>
                  <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-black text-skyline">
                    {grouped[bucket.id].length}
                  </span>
                </div>
              </button>
            );
          })}
        </section>

        <section className="mt-6">
          <h2 className="mb-3 border-b border-border pb-2 text-base font-black">{active.label}</h2>
          {items.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">لا توجد إشعارات في هذه القائمة.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((notif) => {
                const order = store.orders.find((item) => item.id === notif.orderId) || null;
                return (
                  <li key={notif.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-xs font-black">{notif.title}</strong>
                        <small className="text-[10px] text-muted-foreground">{timeLabel(notif.createdAt)}</small>
                      </div>
                      <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[10px] font-black text-skyline">
                        {NOTIF_STATE_LABELS[notif.state]}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-6 text-muted-foreground" dir="auto">{notif.body}</p>
                    {order && (
                      <p className="mt-1 text-[11px] font-bold">
                        {order.customer} — {money(order.total)} — {STATUS_LABELS[order.status]}
                      </p>
                    )}
                    {tab === "pending" && (
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
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
