import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildDecisionMessages, normalizeWa, sendToN8n } from "@/lib/notify.functions";

const ADMIN_WA = "967773590979";

// الجداول مقفلة أمام الوصول العام — نستخدم مفتاح الخدمة داخل الخادم فقط.
async function getDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * نقطة استقبال قرار الإدارة من واتساب (n8n).
 * POST/GET  /api/public/wa-invoice
 * body/query: { action: "confirm" | "cancel", ref: "<orderId | quoteNumber | transferRef>" }
 * أو: { buttonId: "invoice_confirm:<ref>" }
 */

const CONFIRM_CLIENT_MESSAGE = "تم تأكيد فاتورتك، وسيتواصل بك مسؤول المبيعات خلال لحظات.";
const REJECT_CLIENT_MESSAGE =
  "عذراً، رقم الحوالة أو رقم مرجع العملية غير صحيح. يرجى إعادة إدخال رقم الحوالة أو رقم مرجع العملية.";

const PAYMENT_KINDS = ["transfer", "payment_proof", "cod", "purchase_confirmed", "payment_resubmitted"];

const schema = z.object({
  action: z.enum(["confirm", "cancel"]).optional(),
  ref: z.string().max(120).optional(),
  orderId: z.string().max(120).optional(),
  buttonId: z.string().max(200).optional(),
  text: z.string().max(400).optional(),
});

type AnyOrder = Record<string, any>;

function parseIntent(input: z.infer<typeof schema>) {
  let action = input.action ?? null;
  let ref = input.ref || input.orderId || "";
  const button = input.buttonId || "";
  if (button.startsWith("invoice_confirm:")) {
    action = "confirm";
    ref = ref || button.slice("invoice_confirm:".length);
  } else if (button.startsWith("invoice_cancel:")) {
    action = "cancel";
    ref = ref || button.slice("invoice_cancel:".length);
  }
  if (!action && input.text) {
    const t = input.text;
    if (/تأكيد|تاكيد|confirm|✅/i.test(t)) action = "confirm";
    else if (/إلغاء|الغاء|cancel|رفض|❌/i.test(t)) action = "cancel";
    if (!ref) ref = (t.match(/(ord-[a-z0-9]+)/i)?.[1] ?? t.match(/\b(\d{4,})\b/)?.[1] ?? "").trim();
  }
  return { action, ref: ref.trim() };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function handle(input: z.infer<typeof schema>) {
  const { action, ref } = parseIntent(input);
  if (!action) return Response.json({ ok: false, error: "missing_action" }, { status: 400 });
  if (!ref) return Response.json({ ok: false, error: "missing_ref" }, { status: 400 });

  const supabaseAdmin = await getDb();

  // البحث عن الطلب بالمعرّف أو برقم العرض أو رقم الحوالة
  let order: AnyOrder | null = null;
  const byId = await supabaseAdmin.from("orders").select("id, payload").eq("id", ref).maybeSingle();
  if (byId.data) order = byId.data.payload as AnyOrder;
  if (!order) {
    const all = await supabaseAdmin.from("orders").select("id, payload").order("created_at", { ascending: false }).limit(300);
    const rows = (all.data ?? []) as { id: string; payload: AnyOrder }[];
    const match = rows.find(
      (row) =>
        row.payload?.['quoteNumber'] === ref ||
        row.payload?.['transferRef'] === ref ||
        String(row.payload?.['transferRef'] || "").replace(/\D/g, "") === ref.replace(/\D/g, ""),
    );
    if (match) order = match.payload;
  }
  if (!order) return Response.json({ ok: false, error: "order_not_found", ref }, { status: 404 });

  const now = Date.now();
  const status =
    action === "cancel" ? "cancelled" : order['method'] === "cod" ? "confirmed" : "payment_verified";
  const next: AnyOrder = {
    ...order,
    status,
    needsPaymentFix: action === "cancel",
    history: [...(order['history'] ?? []), { status, at: now }],
  };

  await supabaseAdmin
    .from("orders")
    .upsert({ id: String(next['id']), payload: next as never, updated_at: new Date().toISOString() });

  // تحديث حالة إشعارات الإدارة الخاصة بهذا الطلب
  const notifsRes = await supabaseAdmin.from("notifications").select("id, payload").limit(1000);
  const notifRows = (notifsRes.data ?? []) as { id: string; payload: AnyOrder }[];
  const related = notifRows.filter(
    (row) =>
      row.payload?.['orderId'] === next['id'] &&
      row.payload?.['audience'] === "admin" &&
      PAYMENT_KINDS.includes(String(row.payload?.['kind'])),
  );
  if (related.length) {
    await supabaseAdmin.from("notifications").upsert(
      related.map((row) => ({
        id: row.id,
        payload: { ...row.payload, state: action === "confirm" ? "confirmed" : "cancelled" } as never,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  // إشعار العميل
  const kind = action === "confirm" ? "purchase_confirmed" : "invoice_rejected";
  const label = action === "confirm" ? "شراء مؤكد" : "إلغاء الفاتورة";
  const alreadyConfirmed =
    action === "confirm" &&
    notifRows.some(
      (row) =>
        row.payload?.['orderId'] === next['id'] &&
        row.payload?.['audience'] === "client" &&
        row.payload?.['kind'] === "purchase_confirmed",
    );
  if (!alreadyConfirmed) {
    const clientNotif = {
      id: uid("n"),
      audience: "client",
      kind,
      orderId: next['id'],
      title: `${label} — ${next['quoteNumber'] || next['id']}`,
      body: action === "confirm" ? CONFIRM_CLIENT_MESSAGE : REJECT_CLIENT_MESSAGE,
      state: "sent",
      createdAt: now,
    };
    await supabaseAdmin
      .from("notifications")
      .upsert({ id: clientNotif.id, payload: clientNotif as never, updated_at: new Date().toISOString() });
  }

  // إشعار داخل التطبيق للإدارة بالقرار (يظهر في لوحة الإدارة من أي جهاز)
  const adminNotif = {
    id: uid("n"),
    audience: "admin",
    kind: action === "confirm" ? "purchase_confirmed" : "invoice_rejected",
    orderId: next['id'],
    title: `${action === "confirm" ? "تم تأكيد فاتورة" : "تم إلغاء فاتورة"} — ${next['quoteNumber'] || next['id']}`,
    body:
      action === "confirm"
        ? "تم تأكيد الفاتورة عبر واتساب وإشعار العميل."
        : "تم إلغاء الفاتورة عبر واتساب وطُلب من العميل إعادة إدخال رقم الحوالة.",
    state: action === "confirm" ? "confirmed" : "cancelled",
    createdAt: now,
  };
  await supabaseAdmin
    .from("notifications")
    .upsert({ id: adminNotif.id, payload: adminNotif as never, updated_at: new Date().toISOString() });

  // إرسال رسائل واتساب: للعميل وللإدارة
  const clientWa = normalizeWa(String(next['clientPhone'] ?? ""));
  const messages = buildDecisionMessages({
    action,
    orderId: String(next['id']),
    quoteNumber: String(next['quoteNumber'] ?? ""),
    clientName: String(next['customer'] ?? ""),
    clientPhone: clientWa,
    transferRef: String(next['transferRef'] ?? ""),
    total: Number(next['total']) || 0,
  });

  const [adminSend, clientSend] = await Promise.all([
    sendToN8n({
      kind: "invoice_decision_admin",
      action,
      to: ADMIN_WA,
      adminPhone: ADMIN_WA,
      text: messages.adminText,
      orderId: String(next['id']),
      quoteNumber: String(next['quoteNumber'] ?? ""),
      clientName: String(next['customer'] ?? ""),
      clientPhone: clientWa,
      transferRef: String(next['transferRef'] ?? ""),
      total: Number(next['total']) || 0,
    }),
    clientWa
      ? sendToN8n({
          kind: "invoice_decision_client",
          action,
          to: clientWa,
          adminPhone: ADMIN_WA,
          text: messages.clientText,
          orderId: String(next['id']),
          quoteNumber: String(next['quoteNumber'] ?? ""),
          clientName: String(next['customer'] ?? ""),
          clientPhone: clientWa,
          transferRef: String(next['transferRef'] ?? ""),
          total: Number(next['total']) || 0,
        })
      : Promise.resolve({ ok: false as const, error: "no_client_phone" }),
  ]);

  return Response.json({
    ok: true,
    action,
    orderId: next['id'],
    status,
    whatsapp: { admin: adminSend.ok, client: clientSend.ok, error: adminSend.error ?? clientSend.error ?? null },
  });
}

export const Route = createFileRoute("/api/public/wa-invoice")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        return handle(schema.parse(Object.fromEntries(url.searchParams.entries())));
      },
      POST: async ({ request }) => {
        let raw: unknown = {};
        try {
          raw = await request.json();
        } catch {
          raw = {};
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return Response.json({ ok: false, error: "bad_input" }, { status: 400 });
        return handle(parsed.data);
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
