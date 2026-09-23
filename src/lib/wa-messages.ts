import type { BotResult } from "./bot-engine.js";

export type ChatButton = { id: string; title: string; description?: string };

export type ChatMessage =
  | { id: string; from: "user"; kind: "text"; text: string }
  | { id: string; from: "bot"; kind: "text"; text: string }
  | { id: string; from: "bot"; kind: "image"; url: string; caption?: string | undefined }
  | { id: string; from: "bot"; kind: "video"; url: string; caption?: string | undefined }
  | { id: string; from: "bot"; kind: "doc"; name: string; caption?: string | undefined; url?: string | undefined };

export type ChatTurn = {
  messages: ChatMessage[];
  buttons: ChatButton[];
  listTitle?: string | undefined;
  listSections?: { title: string; rows: ChatButton[] }[] | undefined;
};

type AnyPayload = Record<string, any>;

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}_${counter++}`;

function pushPayload(out: ChatMessage[], raw: unknown): { buttons: ChatButton[]; sections?: { title: string; rows: ChatButton[] }[]; listTitle?: string } {
  const p = raw as AnyPayload | null;
  if (!p || typeof p !== "object") return { buttons: [] };

  if (p['type'] === "text" && p['text']?.body) {
    out.push({ id: nextId(), from: "bot", kind: "text", text: String(p['text'].body) });
    return { buttons: [] };
  }
  if (p['type'] === "image" && p['image']?.link) {
    out.push({ id: nextId(), from: "bot", kind: "image", url: String(p['image'].link), caption: p['image'].caption ? String(p['image'].caption) : undefined });
    return { buttons: [] };
  }
  if (p['type'] === "video" && p['video']?.link) {
    out.push({ id: nextId(), from: "bot", kind: "video", url: String(p['video'].link), caption: p['video'].caption ? String(p['video'].caption) : undefined });
    return { buttons: [] };
  }
  if (p['type'] === "document" && p['document']) {
    out.push({
      id: nextId(),
      from: "bot",
      kind: "doc",
      name: String(p['document'].filename || "ملف"),
      caption: p['document'].caption ? String(p['document'].caption) : undefined,
      url: p['document'].link ? String(p['document'].link) : undefined,
    });
    return { buttons: [] };
  }
  if (p['type'] === "interactive" && p['interactive']) {
    const ia = p['interactive'] as AnyPayload;
    const headerImg = ia['header']?.type === "image" ? ia['header'].image?.link : null;
    if (headerImg) out.push({ id: nextId(), from: "bot", kind: "image", url: String(headerImg) });
    const body = [ia['header']?.type === "text" ? ia['header'].text : "", ia['body']?.text || "", ia['footer']?.text || ""]
      .filter(Boolean)
      .join("\n\n");
    if (body) out.push({ id: nextId(), from: "bot", kind: "text", text: body });

    if (ia['type'] === "button") {
      const buttons: ChatButton[] = (ia['action']?.buttons || []).map((b: AnyPayload) => ({
        id: String(b['reply']?.id ?? ""),
        title: String(b['reply']?.title ?? ""),
      }));
      return { buttons };
    }
    if (ia['type'] === "list") {
      const sections = (ia['action']?.sections || []).map((s: AnyPayload) => ({
        title: String(s['title'] || ""),
        rows: (s['rows'] || []).map((r: AnyPayload) => ({
          id: String(r['id'] ?? ""),
          title: String(r['title'] ?? ""),
          description: r['description'] ? String(r['description']) : undefined,
        })),
      }));
      return { buttons: [], sections, listTitle: String(ia['action']?.button || "اختر") };
    }
  }
  return { buttons: [] };
}

/** Turns one State-Machine result into the ordered list of chat bubbles the bot would send. */
export function resultToTurn(r: BotResult): ChatTurn {
  const messages: ChatMessage[] = [];
  let buttons: ChatButton[] = [];
  let listSections: { title: string; rows: ChatButton[] }[] | undefined;
  let listTitle: string | undefined;

  if (r.pre_payload) {
    pushPayload(messages, r.pre_payload);
  } else if (r.has_pre_text && r.pre_text) {
    messages.push({ id: nextId(), from: "bot", kind: "text", text: r.pre_text });
  }

  if (r.has_inv_img && r.inv_img_url) {
    messages.push({ id: nextId(), from: "bot", kind: "image", url: r.inv_img_url, caption: r.inv_img_caption || undefined });
  }

  if (r.has_quote_images && Array.isArray(r.quote_images)) {
    for (const url of r.quote_images) {
      if (url) messages.push({ id: nextId(), from: "bot", kind: "image", url: String(url) });
    }
  }

  if (r.wa_payload) {
    const res = pushPayload(messages, r.wa_payload);
    buttons = res.buttons;
    listSections = res.sections;
    listTitle = res.listTitle;
  } else if (r.text_response) {
    messages.push({ id: nextId(), from: "bot", kind: "text", text: r.text_response });
  }

  if (r.send_quote_file) {
    messages.push({
      id: nextId(),
      from: "bot",
      kind: "doc",
      name: String(r.quote_file_name || `${r.quote_number || "ACTES"}.pdf`),
      caption: r.quote_caption || undefined,
      url: r.quote_file_url || undefined,
    });
  }
  if (r.send_study_file) {
    messages.push({ id: nextId(), from: "bot", kind: "doc", name: "ACTES-PV-Study.pdf", caption: "دراسة الأداء PVsyst" });
  }
  if (r.make_sld) {
    messages.push({ id: nextId(), from: "bot", kind: "doc", name: "ACTES-SLD.pdf", caption: "المخطط أحادي الخط SLD" });
  }

  if (Array.isArray(r.extra_payloads)) {
    const norm = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "").replace(/^967/, "");
    const me = norm((r as unknown as Record<string, unknown>)['phone']);
    for (const p of r.extra_payloads) {
      // الرسائل الموجّهة لأرقام داخلية (الحسابات / المبيعات) لا تُعرض للعميل
      const to = norm((p as Record<string, unknown> | null)?.['to']);
      if (to && me && to !== me) continue;
      const res = pushPayload(messages, p);
      if (res.buttons.length) buttons = res.buttons;
      if (res.sections) {
        listSections = res.sections;
        listTitle = res.listTitle;
      }
    }
  }


  if (r.has_followup && r.followup_payload) {
    const res = pushPayload(messages, r.followup_payload);
    if (res.buttons.length) buttons = res.buttons;
    if (res.sections) {
      listSections = res.sections;
      listTitle = res.listTitle;
    }
  }

  const turn: ChatTurn = { messages, buttons };
  if (listSections) turn.listSections = listSections;
  if (listTitle) turn.listTitle = listTitle;
  return turn;
}

export function userMessage(text: string): ChatMessage {
  return { id: nextId(), from: "user", kind: "text", text };
}
