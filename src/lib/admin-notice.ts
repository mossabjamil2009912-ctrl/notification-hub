import { money } from "./present";

type NoticeItem = { name: string; details?: string[] | undefined; qty?: number | string; total?: number | string };

const MAIN_PARTS = /ألواح|الواح|أنفرتر|انفرتر|إنفرتر|بطار/;

/** ملخص المنظومة: الألواح والإنفرتر والبطاريات مع الكمية. */
export function systemSummary(items: NoticeItem[]): string[] {
  const main = items.filter((item) => MAIN_PARTS.test(item.name));
  const list = main.length ? main : items.slice(0, 3);
  return list.map((item) => {
    const detail = Array.isArray(item.details) && item.details[0] ? ` (${item.details[0]})` : "";
    const qty = Number(item.qty) || String(item.qty || "").trim();
    return `• ${qty ? `${qty} × ` : ""}${item.name}${detail}`;
  });
}

export const ADMIN_NOTICE_BUTTONS = (ref: string) => [
  { id: `invoice_confirm:${ref}`, title: "✅ تأكيد الفاتورة" },
  { id: `invoice_cancel:${ref}`, title: "❌ إلغاء الفاتورة" },
];

export function buildAdminNotice(input: {
  customerName: string;
  clientPhone?: string;
  items: NoticeItem[];
  total: number;
  method: string;
  transferRef?: string;
}): { text: string; system: string } {
  const system = systemSummary(input.items);
  const text = [
    "🔔 *عميل جديد عبر تطبيق ACTES*",
    "دخل العميل عبر تطبيق ACTES وأرسل طلب شراء بانتظار تأكيدك.",
    "",
    `👤 اسم العميل: ${input.customerName}`,
    input.clientPhone ? `📞 رقم العميل: ${input.clientPhone}` : "",
    system.length ? "☀️ المنظومة:" : "",
    ...system,
    input.total > 0 ? `💰 السعر الإجمالي: ${money(input.total)}` : "",
    `💳 طريقة الدفع: ${input.method}`,
    input.transferRef ? `🧾 رقم الحوالة: ${input.transferRef}` : "",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== "")).join("\n");
  return { text, system: system.map((line) => line.replace(/^•\s*/, "")).join(" | ") };
}
