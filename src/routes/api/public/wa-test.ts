import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { normalizeWa, sendToN8n } from "@/lib/notify.functions";

/**
 * فحص مسار الإشعارات: يرسل رسالة تجريبية عبر n8n إلى واتساب.
 * GET/POST /api/public/wa-test?password=<كلمة مرور الإدارة>&to=<رقم>&text=<نص>
 * بدون كلمة المرور الصحيحة لا يتم الإرسال (منعاً لإساءة الاستخدام).
 */
const schema = z.object({
  password: z.string().max(200).optional(),
  to: z.string().max(40).optional(),
  text: z.string().max(1000).optional(),
  buttons: z.coerce.boolean().optional(),
});

const ADMIN_WA = "967773590979";

async function handle(input: z.infer<typeof schema>) {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected) return Response.json({ ok: false, error: "admin_password_not_configured" }, { status: 503 });
  if (!input.password || input.password !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const configured = Boolean(
    process.env["N8N_SEND_URL"] || process.env["N8N_PAYMENT_NOTIFY_URL"] || process.env["N8N_WHATSAPP_WEBHOOK_URL"],
  );
  if (!configured) return Response.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });

  const to = normalizeWa(input.to) || ADMIN_WA;
  const result = await sendToN8n({
    kind: "test_message",
    to,
    adminPhone: ADMIN_WA,
    text: input.text || "🔔 رسالة اختبار من تطبيق ACTES — مسار الإشعارات يعمل.",
    ...(input.buttons
      ? {
          buttons: [
            { id: "invoice_confirm:TEST", title: "✅ تأكيد الفاتورة" },
            { id: "invoice_cancel:TEST", title: "❌ إلغاء الفاتورة" },
          ],
        }
      : {}),
  });
  return Response.json({ ok: result.ok, to, error: result.error ?? null }, { status: result.ok ? 200 : 502 });
}

export const Route = createFileRoute("/api/public/wa-test")({
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
    },
  },
});
