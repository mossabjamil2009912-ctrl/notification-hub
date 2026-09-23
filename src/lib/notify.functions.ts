import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// رقم الإدارة الافتراضي (واتساب) — يمرَّر إلى n8n ليتم الإرسال إليه
const ADMIN_WA = "967773590979";

/** تحويل الرقم إلى صيغة دولية بدون + (اليمن 967 افتراضياً). */
export function normalizeWa(raw: string | undefined | null): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("967")) return digits;
  if (digits.length === 9) return `967${digits}`;
  return digits;
}

function webhookUrl(): string | null {
  return (
    process.env["N8N_SEND_URL"] ||
    process.env["N8N_PAYMENT_NOTIFY_URL"] ||
    process.env["N8N_WHATSAPP_WEBHOOK_URL"] ||
    null
  );
}

/** إرسال حمولة واحدة إلى n8n مع إعادة محاولة واحدة عند فشل الشبكة. */
export async function sendToN8n(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = webhookUrl();
  if (!url) return { ok: false, error: "webhook_not_configured" };

  const payload = JSON.stringify({ source: "actes-app", sentAt: new Date().toISOString(), ...body });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const responseText = await response.text();
      if (!response.ok) {
        console.error(`n8n webhook failed [${response.status}]: ${responseText}`);
        if (attempt === 1) return { ok: false, error: `${response.status}: ${responseText.slice(0, 300)}` };
        continue;
      }
      return { ok: true };
    } catch (error) {
      console.error("n8n webhook error", error);
      if (attempt === 1) return { ok: false, error: String(error) };
    }
  }
  return { ok: false, error: "unreachable" };
}

const payloadSchema = z.object({
  text: z.string().min(1).max(3000),
  to: z.string().optional(),
  clientName: z.string().max(120).optional(),
  clientPhone: z.string().max(40).optional(),
  orderId: z.string().max(80).optional(),
  quoteNumber: z.string().max(80).optional(),
  transferRef: z.string().max(120).optional(),
  method: z.string().max(40).optional(),
  total: z.number().optional(),
  system: z.string().max(1500).optional(),
  buttons: z.array(z.object({ id: z.string().max(200), title: z.string().max(20) })).max(3).optional(),
});

/** إشعار الإدارة على واتساب (طلب جديد، إعادة إدخال رقم حوالة…). */
export const notifyAdminWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }) => {
    const result = await sendToN8n({
      ...data,
      kind: "admin_notice",
      to: normalizeWa(data.to) || ADMIN_WA,
      adminPhone: ADMIN_WA,
      clientPhone: normalizeWa(data.clientPhone),
    });
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error ?? "failed" };
  });

const decisionSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  orderId: z.string().max(80),
  quoteNumber: z.string().max(80).optional(),
  clientName: z.string().max(120).optional(),
  clientPhone: z.string().max(40).optional(),
  transferRef: z.string().max(120).optional(),
  total: z.number().optional(),
});

export const CONFIRM_TEXT = "تم تأكيد فاتورتك، وسيتواصل بك مسؤول المبيعات خلال لحظات.";
export const REJECT_TEXT =
  "عذراً، رقم الحوالة أو رقم مرجع العملية غير صحيح. يرجى إعادة إدخال رقم الحوالة أو رقم مرجع العملية.";

export function buildDecisionMessages(input: {
  action: "confirm" | "cancel";
  orderId: string;
  quoteNumber?: string | undefined;
  clientName?: string | undefined;
  clientPhone?: string | undefined;
  transferRef?: string | undefined;
  total?: number | undefined;
}) {
  const ref = input.quoteNumber || input.orderId;
  const confirm = input.action === "confirm";
  const clientText = [
    confirm ? "✅ *تأكيد الفاتورة — ACTES*" : "❌ *إلغاء الفاتورة — ACTES*",
    `🧾 رقم الفاتورة: ${ref}`,
    input.transferRef ? `💳 رقم الحوالة: ${input.transferRef}` : "",
    "",
    confirm ? CONFIRM_TEXT : REJECT_TEXT,
  ]
    .filter(Boolean)
    .join("\n");

  const adminText = [
    confirm ? "✅ *تم تأكيد فاتورة*" : "❌ *تم إلغاء فاتورة*",
    `🧾 رقم الفاتورة: ${ref}`,
    input.clientName ? `👤 العميل: ${input.clientName}` : "",
    input.clientPhone ? `📞 رقم العميل: ${normalizeWa(input.clientPhone)}` : "",
    input.transferRef ? `💳 رقم الحوالة: ${input.transferRef}` : "",
    typeof input.total === "number" && input.total > 0 ? `💰 الإجمالي: ${input.total}$` : "",
    "",
    confirm ? "تم إشعار العميل بالتأكيد." : "تم إشعار العميل بإعادة إدخال رقم الحوالة.",
  ]
    .filter(Boolean)
    .join("\n");

  return { clientText, adminText };
}

/** إشعار قرار الفاتورة (تأكيد/إلغاء) — يصل للعميل وللإدارة على واتساب. */
export const notifyInvoiceDecision = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data }) => {
    const messages = buildDecisionMessages(data);
    const clientWa = normalizeWa(data.clientPhone);

    const results = await Promise.all([
      sendToN8n({
        kind: "invoice_decision_admin",
        action: data.action,
        to: ADMIN_WA,
        adminPhone: ADMIN_WA,
        text: messages.adminText,
        orderId: data.orderId,
        quoteNumber: data.quoteNumber ?? "",
        clientName: data.clientName ?? "",
        clientPhone: clientWa,
        transferRef: data.transferRef ?? "",
        total: data.total ?? 0,
      }),
      clientWa
        ? sendToN8n({
            kind: "invoice_decision_client",
            action: data.action,
            to: clientWa,
            adminPhone: ADMIN_WA,
            text: messages.clientText,
            orderId: data.orderId,
            quoteNumber: data.quoteNumber ?? "",
            clientName: data.clientName ?? "",
            clientPhone: clientWa,
            transferRef: data.transferRef ?? "",
            total: data.total ?? 0,
          })
        : Promise.resolve({ ok: false as const, error: "no_client_phone" }),
    ]);

    return {
      ok: results[0].ok,
      admin: results[0].ok,
      client: results[1].ok,
      error: results[0].error ?? results[1].error ?? null,
    };
  });
