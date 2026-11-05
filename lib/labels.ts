import type { AlertStatus, AlertType, Severity } from "./inventory/alerts";
import type { GateType } from "./inventory/rules";
import type { StockStatus } from "./inventory/stock";

/** نصوص الواجهة بالعربي */

export const WAREHOUSE_NAME = "مستودع الرياض الرئيسي";

export const STATUS_LABELS: Record<StockStatus, string> = {
  critical: "حرج",
  low: "منخفض",
  stagnant: "راكد",
  healthy: "سليم",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "حرج",
  warning: "تحذير",
  info: "معلومة",
  ok: "تم",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: "مفتوح",
  acknowledged: "تم الاطلاع",
  resolved: "مغلق",
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  stock: "مخزون",
  expiry: "صلاحية",
  security: "أمني",
  receipt: "استلام",
  stale: "راكد",
  scan: "جرد",
};

export const DIRECTION_LABELS = { in: "دخول", out: "خروج", unconfirmed: "غير مؤكد" } as const;

export type MovementFlag = "unconfirmed" | "unauthorized" | "no_po" | "unknown_tag" | "inactive_tag" | "unexpected";

export const FLAG_LABELS: Record<MovementFlag, string> = {
  unconfirmed: "اتجاه غير مؤكد",
  unauthorized: "غير مصرح",
  no_po: "بدون أمر شراء",
  unknown_tag: "بطاقة غير مسجلة",
  inactive_tag: "بطاقة غير نشطة",
  unexpected: "اتجاه غير متوقع",
};

export const GATE_TYPE_LABELS: Record<GateType, string> = {
  inbound: "استلام",
  outbound: "شحن",
  transfer: "نقل داخلي",
  restricted: "مقيدة",
};

export const ZONE_TYPE_LABELS = {
  receiving: "استلام",
  storage: "تخزين",
  cold: "تبريد",
  high_value: "قيمة عالية",
  sales_floor: "صالة بيع",
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  dairy: "ألبان",
  beverages: "مشروبات",
  coffee: "بن",
  dates: "تمور",
  food: "مواد غذائية",
  paper: "ورقيات",
  personal_care: "عناية شخصية",
  electronics: "إلكترونيات",
  home_appliances: "أجهزة منزلية",
  stationery: "قرطاسية",
  snacks: "وجبات خفيفة",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export const TAG_STATUS_LABELS = {
  active: "نشطة",
  sold: "مصروفة",
  missing: "مفقودة",
  damaged: "تالفة",
} as const;

export const TAG_LEVEL_LABELS = {
  item: "قطعة",
  carton: "كرتون",
  pallet: "طبلية",
} as const;

/** وصف دور البوابة */
export function gateRole(
  type: GateType,
  fromZone: string | null,
  toZone: string | null,
): string {
  switch (type) {
    case "inbound":
      return "دخول البضائع من الموردين";
    case "outbound":
      return "خروج الطلبات بأمر صرف فقط";
    case "restricted":
      return "ممنوع خروج البضائع";
    case "transfer":
      return fromZone && toZone ? `نقل بين ${toZone} و${fromZone}` : "نقل بين المناطق";
  }
}
