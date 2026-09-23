import { useSyncExternalStore } from "react";
import { adminPullStore, adminPushStore, pullClientOrders, pushClientOrder } from "@/lib/store.functions";
import { notifyInvoiceDecision } from "@/lib/notify.functions";
// متجر الطلبات والإشعارات — تخزين محلي مع مزامنة آمنة عبر الخادم.

export type PaymentMethod = "network" | "wallet" | "cod";

export type OrderStatus =
  | "created"
  | "admin_review"
  | "confirmed"
  | "awaiting_payment"
  | "payment_verified"
  | "preparing"
  | "shipping"
  | "delivering"
  | "delivered"
  | "cash_collected"
  | "completed"
  | "cancelled";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: "تم إنشاء الطلب",
  admin_review: "بانتظار مراجعة الإدارة",
  confirmed: "تم تأكيد الطلب",
  awaiting_payment: "بانتظار الدفع",
  payment_verified: "تم التحقق من الدفع",
  preparing: "جاري تجهيز المنظومة",
  shipping: "جاري الشحن",
  delivering: "جاري التسليم",
  delivered: "تم التسليم",
  cash_collected: "تم تحصيل المبلغ",
  completed: "تم إتمام الشراء",
  cancelled: "تم إلغاء الفاتورة",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  network: "الشبكات المحلية",
  wallet: "المحافظ الإلكترونية",
  cod: "الدفع عند الاستلام",
};

export const PAYMENT_PENDING_LABEL: Record<PaymentMethod, string> = {
  network: "بانتظار التحقق من الحوالة",
  wallet: "بانتظار التحقق من الدفع",
  cod: "بانتظار التسليم والتحصيل",
};

export const CONFIRM_CLIENT_MESSAGE = "تم تأكيد فاتورتك، وسيتواصل بك مسؤول المبيعات خلال لحظات.";
export const REJECT_CLIENT_MESSAGE =
  "عذراً، رقم الحوالة أو رقم مرجع العملية غير صحيح. يرجى إعادة إدخال رقم الحوالة أو رقم مرجع العملية.";

export function statusFlow(method: PaymentMethod | null): OrderStatus[] {
  if (method === "cod") {
    return ["created", "admin_review", "confirmed", "preparing", "delivering", "delivered", "cash_collected", "completed"];
  }
  return [
    "created",
    "admin_review",
    "confirmed",
    "awaiting_payment",
    "payment_verified",
    "preparing",
    "shipping",
    "delivered",
    "completed",
  ];
}

export type NotifState = "sent" | "seen" | "confirmed" | "cancelled";

export type NotifKind =
  | "quote_request"
  | "purchase_followup"
  | "purchase_confirmed"
  | "review"
  | "edit_request"
  | "payment_proof"
  | "transfer"
  | "cod"
  | "status_update"
  | "invoice_rejected"
  | "payment_resubmitted";

export const NOTIF_LABELS: Record<NotifKind, string> = {
  quote_request: "طلب عرض سعر جديد",
  purchase_followup: "متابعة شراء",
  purchase_confirmed: "شراء مؤكد",
  review: "مراجعة",
  edit_request: "طلب تعديل",
  payment_proof: "إثبات دفع",
  transfer: "حوالة",
  cod: "دفع عند الاستلام",
  status_update: "تحديث حالة",
  invoice_rejected: "إلغاء الفاتورة",
  payment_resubmitted: "إعادة إدخال رقم الحوالة",
};

export const NOTIF_STATE_LABELS: Record<NotifState, string> = {
  sent: "تم الإرسال",
  seen: "تمت المشاهدة",
  confirmed: "تم التأكيد",
  cancelled: "تم الإلغاء",
};

export interface Notif {
  id: string;
  audience: "admin" | "client";
  kind: NotifKind;
  orderId: string;
  title: string;
  body: string;
  state: NotifState;
  createdAt: number;
}

export interface OrderItem {
  name: string;
  qty: string;
  unit: string;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  /** رمز وصول سري يملكه جهاز العميل — يثبت ملكية الطلب عند المزامنة. */
  accessToken?: string;
  /** رقم واتساب العميل — يُستخدم لإرسال إشعار التأكيد/الإلغاء إليه. */
  clientPhone?: string;
  quoteNumber: string;
  customer: string;
  projectType: string;
  city: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  method: PaymentMethod | null;
  transferRef: string;
  proofName: string;
  codConfirmed: boolean;
  editNote: string;
  needsPaymentFix?: boolean;
  createdAt: number;
  history: { status: OrderStatus; at: number }[];
}

interface Store {
  orders: Order[];
  notifs: Notif[];
}

const KEY = "actes.orders.v1";
let state: Store = { orders: [], notifs: [] };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as Store;
  } catch {
    /* تجاهل البيانات التالفة */
  }
  void pullRemote();
  watchRemote();
}

function saveLocal() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* تجاهل */
    }
  }
  listeners.forEach((listener) => listener());
}

function persist() {
  saveLocal();
  void pushRemote();
}

/* ===== مزامنة سحابية مشتركة بين جميع الأجهزة ===== */

let watching = false;
let pushing = false;

function mergeById<T extends { id: string }>(local: T[], remote: T[], sortDesc: (item: T) => number) {
  const map = new Map<string, T>();
  local.forEach((item) => map.set(item.id, item));
  remote.forEach((item) => map.set(item.id, item));
  return Array.from(map.values()).sort((a, b) => sortDesc(b) - sortDesc(a));
}

function adminPassword(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("actes.adminpw") || "";
  } catch {
    return "";
  }
}

async function pullRemote() {
  if (typeof window === "undefined") return;
  try {
    const password = adminPassword();
    if (password) {
      const remote = await adminPullStore({ data: { password } });
      state = {
        orders: mergeById(state.orders, remote.orders as unknown as Order[], (item) => item.createdAt),
        notifs: mergeById(state.notifs, remote.notifs as unknown as Notif[], (item) => item.createdAt),
      };
    } else {
      const items = state.orders
        .filter((order) => order.accessToken)
        .map((order) => ({ id: order.id, token: String(order.accessToken) }));
      if (!items.length) return;
      const remote = await pullClientOrders({ data: { items } });
      state = {
        orders: mergeById(state.orders, remote.orders as unknown as Order[], (item) => item.createdAt),
        notifs: mergeById(state.notifs, remote.notifs as unknown as Notif[], (item) => item.createdAt),
      };
    }
    saveLocal();
  } catch {
    /* العمل دون اتصال */
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pushRemote();
  }, 8000);
}

async function pushRemote() {
  if (typeof window === "undefined" || pushing) return;
  pushing = true;
  const snapshot = state;
  let failed = false;
  try {
    const password = adminPassword();
    if (password) {
      await adminPushStore({
        data: {
          password,
          orders: snapshot.orders as unknown as Record<string, unknown>[],
          notifs: snapshot.notifs as unknown as Record<string, unknown>[],
        },
      });
    } else {
      // العميل يرفع طلباته فقط — كل طلب برمز الوصول الخاص به
      const ownOrders = snapshot.orders.filter((order) => order.accessToken);
      for (const order of ownOrders) {
        const res = await pushClientOrder({
          data: {
            order: order as unknown as Record<string, unknown>,
            notifs: snapshot.notifs.filter((item) => item.orderId === order.id) as unknown as Record<string, unknown>[],
          },
        });
        if (!res.ok) failed = true;
      }
    }
  } catch {
    failed = true;
  } finally {
    pushing = false;
  }
  // إعادة المحاولة تلقائياً حتى تصل كل الطلبات إلى السحابة
  if (failed) scheduleRetry();
}

function watchRemote() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  // الجداول مقفلة أمام الوصول العام، لذا نعتمد على الاستطلاع الدوري عبر الخادم
  window.addEventListener("online", () => {
    void pushRemote();
    void pullRemote();
  });
  window.addEventListener("focus", () => void pullRemote());
  setInterval(() => {
    void pullRemote();
    void pushRemote();
  }, 30000);
}

export function subscribeStore(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStore(): Store {
  load();
  return state;
}

const EMPTY: Store = { orders: [], notifs: [] };
export function getServerStore(): Store {
  return EMPTY;
}

/** رقم واتساب العميل المحفوظ عند تسجيل الدخول. */
function savedClientPhone(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("actes.client");
    if (!raw) return "";
    const client = JSON.parse(raw) as { code?: string; phone?: string };
    return String(client.code || client.phone || "");
  } catch {
    return "";
  }
}

/** إرسال إشعار قرار الفاتورة إلى واتساب (العميل + الإدارة). */
function pushDecisionWhatsapp(order: Order, action: "confirm" | "cancel") {
  if (typeof window === "undefined") return;
  void notifyInvoiceDecision({
    data: {
      action,
      orderId: order.id,
      quoteNumber: order.quoteNumber || "",
      clientName: order.customer || "",
      clientPhone: order.clientPhone || savedClientPhone(),
      transferRef: order.transferRef || "",
      total: Number(order.total) || 0,
    },
  }).catch(() => {
    /* الإشعار داخل التطبيق محفوظ حتى لو تعذر واتساب */
  });
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function notify(order: Order, audience: Notif["audience"], kind: NotifKind, body: string) {
  state = {
    ...state,
    notifs: [
      {
        id: uid("n"),
        audience,
        kind,
        orderId: order.id,
        title: `${NOTIF_LABELS[kind]} — ${order.quoteNumber || order.id}`,
        body,
        state: "sent",
        createdAt: Date.now(),
      },
      ...state.notifs,
    ],
  };
}

function replaceOrder(next: Order) {
  state = { ...state, orders: state.orders.map((order) => (order.id === next.id ? next : order)) };
}

export function findOrder(id: string) {
  return getStore().orders.find((order) => order.id === id) || null;
}

/** تصنيف الطلب للعميل: ناجح / معلق / ملغي. */
export type OrderBucket = "success" | "pending" | "cancelled";

export function orderBucket(order: Order): OrderBucket {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "completed" || order.status === "delivered" || order.status === "cash_collected") return "success";
  return "pending";
}

export const BUCKET_LABELS: Record<OrderBucket, string> = {
  success: "الناجحة",
  pending: "المعلقة",
  cancelled: "الملغية",
};

export function createOrder(input: Omit<Order, "id" | "status" | "method" | "transferRef" | "proofName" | "codConfirmed" | "editNote" | "needsPaymentFix" | "createdAt" | "history">) {
  load();
  const order: Order = {
    ...input,
    id: uid("ord"),
    accessToken: uid("tok"),
    clientPhone: savedClientPhone(),
    status: "created",
    method: null,
    transferRef: "",
    proofName: "",
    codConfirmed: false,
    editNote: "",
    needsPaymentFix: false,
    createdAt: Date.now(),
    history: [{ status: "created", at: Date.now() }],
  };
  state = { ...state, orders: [order, ...state.orders] };
  notify(order, "admin", "quote_request", `عرض سعر جديد للعميل ${order.customer} بقيمة ${order.total}$`);
  notify(order, "admin", "purchase_followup", `العميل ${order.customer} بدأ متابعة الشراء`);
  persist();
  return order;
}

export function setStatus(id: string, status: OrderStatus, note?: string) {
  load();
  const order = findOrder(id);
  if (!order) return;
  const next: Order = { ...order, status, history: [...order.history, { status, at: Date.now() }] };
  replaceOrder(next);
  notify(next, "client", "status_update", note || `تم تحديث حالة طلبك إلى: ${STATUS_LABELS[status]}`);
  persist();
}

export function setPayment(id: string, method: PaymentMethod, data: { transferRef?: string; proofName?: string; codConfirmed?: boolean }) {
  load();
  const order = findOrder(id);
  if (!order) return null;
  const next: Order = {
    ...order,
    method,
    transferRef: data.transferRef ?? "",
    proofName: data.proofName ?? "",
    codConfirmed: Boolean(data.codConfirmed),
    needsPaymentFix: false,
    status: "admin_review",
    history: [...order.history, { status: "admin_review", at: Date.now() }],
  };
  replaceOrder(next);
  const kind: NotifKind = method === "network" ? "transfer" : method === "wallet" ? "payment_proof" : "cod";
  const detail =
    method === "network"
      ? `رقم الحوالة: ${next.transferRef}`
      : method === "wallet"
        ? `رقم مرجع العملية: ${next.transferRef || "غير مُدخل"}${next.proofName ? ` — إثبات الدفع: ${next.proofName}` : ""}`
        : next.codConfirmed
          ? "أكد العميل الدفع عند الاستلام"
          : "دفع عند الاستلام (بدون تأكيد)";
  notify(next, "admin", "purchase_confirmed", `تأكيد طلب شراء من ${next.customer} — ${PAYMENT_LABELS[method]}`);
  notify(next, "admin", kind, detail);
  persist();
  return next;
}

/** إعادة إدخال رقم الحوالة بعد إلغاء الفاتورة. */
export function resubmitPayment(id: string, data: { transferRef: string; proofName?: string }) {
  load();
  const order = findOrder(id);
  if (!order) return null;
  const next: Order = {
    ...order,
    transferRef: data.transferRef,
    proofName: data.proofName ?? order.proofName,
    needsPaymentFix: false,
    status: "admin_review",
    history: [...order.history, { status: "admin_review", at: Date.now() }],
  };
  replaceOrder(next);
  notify(next, "admin", "payment_resubmitted", `العميل ${next.customer} أعاد إدخال الرقم: ${data.transferRef}`);
  persist();
  return next;
}

export function requestEdit(id: string, note: string) {
  load();
  const order = findOrder(id);
  if (!order) return;
  const next: Order = { ...order, editNote: note };
  replaceOrder(next);
  notify(next, "admin", "edit_request", note || "طلب تعديل من العميل");
  persist();
}

export function markSeen(notifId: string) {
  load();
  state = {
    ...state,
    notifs: state.notifs.map((item) => (item.id === notifId && item.state === "sent" ? { ...item, state: "seen" } : item)),
  };
  persist();
}

const PAYMENT_KINDS: NotifKind[] = ["transfer", "payment_proof", "cod", "purchase_confirmed", "payment_resubmitted"];

/** تأكيد الفاتورة (من الإدارة أو من واتساب) — يُعلَم العميل بالتأكيد. */
export function confirmInvoice(orderId: string) {
  load();
  const order = state.orders.find((item) => item.id === orderId) || null;
  if (!order) return;
  const status: OrderStatus = order.method === "cod" ? "confirmed" : "payment_verified";
  const next: Order = { ...order, status, needsPaymentFix: false, history: [...order.history, { status, at: Date.now() }] };
  replaceOrder(next);
  state = {
    ...state,
    notifs: state.notifs.map((item) =>
      item.audience === "admin" && item.orderId === orderId && PAYMENT_KINDS.includes(item.kind)
        ? { ...item, state: "confirmed" }
        : item,
    ),
  };
  const already = state.notifs.some(
    (item) => item.audience === "client" && item.orderId === orderId && item.kind === "purchase_confirmed",
  );
  if (!already) notify(next, "client", "purchase_confirmed", CONFIRM_CLIENT_MESSAGE);
  notify(next, "admin", "status_update", `تم تأكيد الفاتورة ${next.quoteNumber || next.id} وإشعار العميل.`);
  persist();
  pushDecisionWhatsapp(next, "confirm");
}

/** إلغاء الفاتورة — يُطلب من العميل إعادة إدخال رقم الحوالة. */
export function cancelInvoice(orderId: string) {
  load();
  const order = state.orders.find((item) => item.id === orderId) || null;
  if (!order) return;
  const next: Order = {
    ...order,
    status: "cancelled",
    needsPaymentFix: true,
    history: [...order.history, { status: "cancelled", at: Date.now() }],
  };
  replaceOrder(next);
  state = {
    ...state,
    notifs: state.notifs.map((item) =>
      item.audience === "admin" && item.orderId === orderId && PAYMENT_KINDS.includes(item.kind)
        ? { ...item, state: "cancelled" }
        : item,
    ),
  };
  notify(next, "client", "invoice_rejected", REJECT_CLIENT_MESSAGE);
  persist();
}

export function markConfirmed(notifId: string) {
  load();
  const target = state.notifs.find((item) => item.id === notifId) || null;
  state = { ...state, notifs: state.notifs.map((item) => (item.id === notifId ? { ...item, state: "confirmed" } : item)) };
  if (target && target.audience === "admin" && PAYMENT_KINDS.includes(target.kind)) {
    confirmInvoice(target.orderId);
    return;
  }
  persist();
}

export function markCancelled(notifId: string) {
  load();
  const target = state.notifs.find((item) => item.id === notifId) || null;
  state = { ...state, notifs: state.notifs.map((item) => (item.id === notifId ? { ...item, state: "cancelled" } : item)) };
  if (target) {
    cancelInvoice(target.orderId);
    return;
  }
  persist();
}

export function useOrdersStore(): Store {
  return useSyncExternalStore(subscribeStore, getStore, getServerStore);
}
