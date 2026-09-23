import type { BotResult } from "./bot-engine.js";
import { resultToTurn, type ChatButton } from "./wa-messages";

export type QuoteItem = {
  name: string;
  details: string[];
  unit: string;
  qty: number;
  price: number;
  total: number;
};

export type Section = { title?: string; lines: string[] };

export type SpecGroup = { title: string; lines: string[] };

export type View = {
  heading: string;
  sections: Section[];
  specs: SpecGroup[];
  quote: {
    number: string;
    customer: string;
    city: string;
    items: QuoteItem[];
    total: number;
    fileName: string;
    fileUrl?: string | undefined;
  } | null;
  study: { number: string; rows: { label: string; value: string }[] } | null;
  sld: { number: string; rows: { label: string; value: string }[] } | null;
  images: { url: string; caption?: string | undefined }[];
  videos: { url: string; caption?: string | undefined }[];
  docs: { name: string; caption?: string | undefined; url?: string | undefined }[];
  options: ChatButton[];
  needsInput: boolean;
  inputHint: string;
};

const BRAND_LINES = [
  "أكتس لأنظمة الطاقة وحلولها",
  "أكتس لإستيراد أنظمة الطاقة",
  "أكتس لاستيراد أنظمة الطاقة",
];

const DROP_PATTERNS = [
  /^أرسل\s*0+\s/,
  /للعودة خطوة/,
  /للعودة إلى البداية/,
  /للعودة للبداية/,
  /من الأزرار التالية/,
  /من القائمة بالأسفل/,
  /من الزر بالأسفل/,
  /الأزرار التالية/,
  /اضغط .* للبدء/,
];

const SEP_RE = /^[━─—\-=_*\s]{6,}$/;

function clean(line: string): string {
  return line
    .replace(/\u200f/g, "")
    .replace(/_+\s*$/, "")
    .replace(/\s+$/, "")
    .trim();
}

function isSep(line: string) {
  return SEP_RE.test(line);
}

function keep(line: string, optionTitles: string[]): boolean {
  if (!line) return false;
  if (BRAND_LINES.includes(line)) return false;
  if (DROP_PATTERNS.some((re) => re.test(line))) return false;
  // numbered lines that merely repeat the available options
  const m = line.match(/^\d+\s*[-.)]\s*(.+)$/);
  if (m && m[1] && optionTitles.some((t) => t && (t === m[1]!.trim() || m[1]!.trim().startsWith(t)))) return false;
  return true;
}

function parseText(text: string, optionTitles: string[]): { heading: string; sections: Section[] } {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split("\n")) {
    const line = clean(raw);
    if (isSep(line)) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    if (!keep(line, optionTitles)) continue;
    current.push(line);
  }
  if (current.length) groups.push(current);

  let heading = "";
  const sections: Section[] = [];
  for (const g of groups) {
    if (!heading && g.length === 1 && g[0]!.length <= 70) {
      heading = g[0]!;
      continue;
    }
    if (!heading && g.length > 1 && g[0]!.length <= 45) {
      heading = g[0]!;
      sections.push({ lines: g.slice(1) });
      continue;
    }
    if (g.length > 1 && g[0]!.length <= 45 && !/[.؟:]$/.test(g[0]!)) {
      sections.push({ title: g[0]!, lines: g.slice(1) });
    } else {
      sections.push({ lines: g });
    }
  }
  return { heading, sections };
}

/** "المنظومة المناسبة لك" screens -> equipment spec cards. */
function parseSpecs(text: string): SpecGroup[] {
  const blocks = text.split(/\n\s*\n/);
  const out: SpecGroup[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map(clean)
      .filter((l) => l && !isSep(l) && !BRAND_LINES.includes(l));
    if (lines.length < 2) continue;
    if (!lines.some((l) => l.startsWith("الكمية"))) continue;
    out.push({ title: lines[0]!.replace(/\s*\|\s*الضمان.*$/, ""), lines: lines.slice(1) });
  }
  return out;
}

function money(n: number | null | undefined) {
  const value = Number(n);
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

export { money };

export function buildView(r: BotResult, step: string): View {
  const turn = resultToTurn(r);
  const options = [...turn.buttons, ...(turn.listSections ?? []).flatMap((s) => s.rows)];
  const optionTitles = options.map((o) => o.title);

  const images: View["images"] = [];
  const videos: View["videos"] = [];
  const docs: View["docs"] = [];
  const texts: string[] = [];

  for (const m of turn.messages) {
    if (m.from !== "bot") continue;
    if (m.kind === "text") texts.push(m.text);
    else if (m.kind === "image") images.push({ url: m.url, caption: m.caption });
    else if (m.kind === "video") videos.push({ url: m.url, caption: m.caption });
    else if (m.kind === "doc") docs.push({ name: m.name, caption: m.caption, url: m.url });
  }

  const rawItems = (Array.isArray(r['quote_items']) ? r['quote_items'] : []) as QuoteItem[];
  const items = rawItems.filter((i) => i && i.name);
  const hasQuote = items.length > 0;

  let quote: View["quote"] = null;
  if (hasQuote) {
    const total = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
    quote = {
      number: String(r.quote_number || ""),
      customer: String(r['customer_name'] || ""),
      city: String(r['city'] || ""),
      items,
      total,
      fileName: String(r.quote_file_name || `عرض سعر ${r.quote_number || "ACTES"}.pdf`),
      fileUrl: r.quote_file_url || undefined,
    };
  }

  const sp = (r['study_params'] || null) as Record<string, any> | null;
  let study: View["study"] = null;
  if (r.send_study_file || sp) {
    const rows: { label: string; value: string }[] = [];
    const add = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      rows.push({ label, value: String(value) });
    };
    add("المدينة", sp?.['city'] || r['city']);
    add("كود المنظومة", sp?.['sys_code']);
    add("قدرة الألواح", sp?.['pv_kwp'] ? `${sp['pv_kwp']} kWp` : "");
    add("الانفرتر", sp?.['inv_name'] || sp?.['inv_model']);
    add("استهلاك يومي", sp?.['load_daily_kwh'] ? `${sp['load_daily_kwh']} kWh` : "");
    add("استهلاك شهري", r['monthly_consumption'] ? `${r['monthly_consumption']} kWh` : "");
    study = { number: String(sp?.['quote_number'] || r.quote_number || ""), rows };
  }

  const sldp = (r['sld_params'] || null) as Record<string, any> | null;
  let sld: View["sld"] = null;
  if (r.make_sld || sldp) {
    const rows: { label: string; value: string }[] = [];
    const add = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      rows.push({ label, value: String(value) });
    };
    add("المدينة", sldp?.['city'] || r['city']);
    add("الانفرتر", sldp?.['inv_name'] || sldp?.['inv_model']);
    add("نوع الطور", r['phase_type']);
    add("عدد الألواح", sldp?.['panel_qty']);
    sld = { number: String(sldp?.['quote_number'] || r.quote_number || ""), rows };
  }

  let heading = "";
  const sections: Section[] = [];
  let specs: SpecGroup[] = [];

  for (const t of texts) {
    if (hasQuote && /عرض السعر/.test(t) && /الإجمالي/.test(t)) continue; // rendered as a table instead
    if (/المنظومة المناسبة لك/.test(t)) {
      heading = heading || "المنظومة المناسبة لمشروعك";
      specs = specs.concat(parseSpecs(t));
      const tail = t.split(/\n\s*\n/).pop() || "";
      const tailClean = clean(tail);
      if (tailClean && !/الكمية/.test(tailClean) && keep(tailClean, optionTitles)) {
        sections.push({ lines: [tailClean] });
      }
      continue;
    }
    const parsed = parseText(t, optionTitles);
    if (!heading) heading = parsed.heading;
    else if (parsed.heading) sections.push({ title: parsed.heading, lines: [] });
    sections.push(...parsed.sections);
  }

  if (hasQuote && !heading) heading = "عرض السعر الرسمي";
  if (!heading) heading = "أكتس لأنظمة الطاقة وحلولها";

  const interactiveOptions = options.filter((o) => !/العودة/.test(o.title));
  const needsInput = interactiveOptions.length === 0 || /أدخل|ادخل|اكتب|يرجى إدخال|كم /.test(texts.join("\n"));
  const inputHint = /اسم/.test(texts.join("\n")) ? "اكتب الاسم هنا" : "اكتب القيمة المطلوبة هنا";

  return {
    heading,
    sections: sections.filter((s) => s.title || s.lines.length),
    specs,
    quote,
    study,
    sld,
    images,
    videos,
    docs,
    options,
    needsInput,
    inputHint,
    ...(step ? {} : {}),
  };
}
