import { formatCoverage, formatDays, formatNumber, formatSAR, formatTime, formatUnits } from "../format";
import { EXPIRY_DISCOUNT_DAYS, EXPIRY_DISCOUNT_PERCENT } from "./constants";
import type { ProductMetrics } from "./metrics";
import { round2, type Shortage } from "./rules";

/**
 * التنبيهات المشتركة:
 *   حرج     التغطية أقل من 4 أيام                         نفاد قريب        (stock)
 *   تحذير   التغطية أقل من 10 أيام                        مخزون منخفض      (stock)
 *   معلومة  التغطية أكثر من 60 يوم                        مخزون راكد       (stale)
 *   تحذير   دفعة فيها فائض وتنتهي خلال 3 أيام             صلاحية           (expiry)
 *   تحذير   المستلم أقل من المطلوب في أمر الشراء          شحنة ناقصة       (receipt)
 *   حرج     خروج من بوابة مقيدة أو شحن بدون أمر صرف       خروج غير مصرح    (security)
 *
 * تنبيهات المخزون والصلاحية «مشتقة» من الحالة الحالية: تُفتح لما يتحقق الشرط وتُغلق تلقائيًا لما يزول.
 */

export type Severity = "critical" | "warning" | "info" | "ok";
export type AlertType = "stock" | "expiry" | "security" | "receipt" | "stale" | "scan";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
export const DERIVED_ALERT_TYPES: readonly AlertType[] = ["stock", "stale", "expiry"];

export interface AlertDraft {
  type: AlertType;
  severity: Severity;
  entity_ref: string;
  title: string;
  body: string;
}

export interface ProductRef {
  id: string;
  name_ar: string;
}

export interface BatchRef {
  id: string;
  lot_number: string | null;
}

/** تنبيهات الصنف حسب حالته ودفعاته */
export function productAlerts(product: ProductRef, m: ProductMetrics, batches: readonly BatchRef[] = []): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  const ref = `product:${product.id}`;
  const order = m.suggestedOrder > 0 ? ` الطلب المقترح ${formatUnits(m.suggestedOrder)}.` : "";

  if (m.status === "critical") {
    drafts.push({
      type: "stock",
      severity: "critical",
      entity_ref: ref,
      title: `${product.name_ar} على وشك النفاد`,
      body: `المتوفر ${formatUnits(m.available)} ويكفي ${formatCoverage(m.coverageDays)}.${order}`,
    });
  } else if (m.status === "low") {
    drafts.push({
      type: "stock",
      severity: "warning",
      entity_ref: ref,
      title: `${product.name_ar} مخزون منخفض`,
      body: `المتوفر ${formatUnits(m.available)} ويكفي ${formatCoverage(m.coverageDays)}.${order}`,
    });
  } else if (m.status === "stagnant") {
    drafts.push({
      type: "stale",
      severity: "info",
      entity_ref: ref,
      title: `${product.name_ar} مخزون راكد`,
      body: `${formatUnits(m.available)} تكفي ${formatCoverage(m.coverageDays)}، رأس مال مجمّد ${formatSAR(m.stockValue)}. يُقترح إيقاف الشراء أو عرض ترويجي.`,
    });
  }

  const lots = new Map(batches.map((b) => [b.id, b.lot_number]));
  for (const row of m.waste) {
    if (row.surplus <= 0 || row.remainingDays > EXPIRY_DISCOUNT_DAYS) continue;
    const lot = lots.get(row.batchId);
    const when = row.remainingDays === 0 ? "تنتهي اليوم" : `تنتهي خلال ${formatDays(row.remainingDays)}`;
    drafts.push({
      type: "expiry",
      severity: "warning",
      entity_ref: `batch:${row.batchId}`,
      title: `دفعة ${lot ?? "بدون رقم"} من ${product.name_ar} ${when}`,
      body: `${formatUnits(row.surplus)} لن تُباع قبل الانتهاء (${formatSAR(row.valueAtRisk, { decimals: true })}). الإجراء المقترح: خصم ${EXPIRY_DISCOUNT_PERCENT}٪.`,
    });
  }
  return drafts;
}

export interface ExistingAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  entity_ref: string | null;
  title: string;
  body: string | null;
  status: AlertStatus;
}

export function alertKey(a: { type: AlertType; severity: Severity; entity_ref: string | null }): string {
  return `${a.type}|${a.entity_ref ?? ""}|${a.severity}`;
}

/**
 * يقارن التنبيهات المشتقة المفتوحة بالمطلوب حاليًا:
 * جديد → يُضاف، موجود تغيّر نصه → يُحدَّث (ويبقى «تم الاطلاع» إن كان كذلك)، زال شرطه → يُغلق.
 */
export function planAlertSync(existing: readonly ExistingAlert[], desired: readonly AlertDraft[]) {
  const desiredByKey = new Map(desired.map((d) => [alertKey(d), d]));
  const existingByKey = new Map<string, ExistingAlert>();
  const resolve: string[] = [];

  for (const alert of existing) {
    if (alert.status === "resolved") continue;
    const key = alertKey(alert);
    if (existingByKey.has(key)) resolve.push(alert.id);
    else existingByKey.set(key, alert);
  }

  const insert: AlertDraft[] = [];
  const update: { id: string; title: string; body: string }[] = [];
  for (const [key, draft] of desiredByKey) {
    const current = existingByKey.get(key);
    if (!current) insert.push(draft);
    else if (current.title !== draft.title || (current.body ?? "") !== draft.body) {
      update.push({ id: current.id, title: draft.title, body: draft.body });
    }
  }
  for (const [key, alert] of existingByKey) if (!desiredByKey.has(key)) resolve.push(alert.id);

  return { insert, update, resolve };
}

/** تنبيه الشحنة الناقصة: الصنف والنقص وقيمته */
export function shortShipmentAlert(
  po: { po_number: string; supplier: string | null },
  shortages: readonly Shortage[],
  matchedLines: number,
): AlertDraft {
  const parts = shortages.map(
    (s) =>
      `${s.productName}: المطلوب ${formatNumber(s.expected)}، المستلم ${formatNumber(s.received)} (نقص ${formatUnits(s.shortage)} بقيمة ${formatSAR(s.value, { decimals: true })})`,
  );
  const total = round2(shortages.reduce((sum, s) => sum + s.value, 0));
  const totalText = shortages.length > 1 ? ` إجمالي النقص ${formatSAR(total, { decimals: true })}.` : "";
  const rest = matchedLines > 0 ? " باقي الأصناف مطابقة." : "";
  return {
    type: "receipt",
    severity: "warning",
    entity_ref: `po:${po.po_number}`,
    title: `شحنة ${po.po_number} ناقصة`,
    body: `${po.supplier ? `${po.supplier} · ` : ""}${parts.join("؛ ")}.${totalText}${rest}`,
  };
}

export interface ExitItem {
  name_ar: string;
  units: number;
  unit_cost: number;
  zone_name: string | null;
  at: Date;
}

/** تنبيه الخروج غير المصرح. القراءات المتتالية لنفس البوابة تُجمع في تنبيه واحد */
export function unauthorizedExitAlert(
  gate: { id: string; name_ar: string; type: "outbound" | "restricted" | string },
  items: readonly ExitItem[],
): AlertDraft {
  const byProduct = new Map<string, number>();
  let value = 0;
  for (const item of items) {
    byProduct.set(item.name_ar, (byProduct.get(item.name_ar) ?? 0) + item.units);
    value += item.units * item.unit_cost;
  }
  const list = [...byProduct].map(([name, units]) => `${name} ×${formatNumber(units)}`).join("، ");
  const zones = [...new Set(items.map((i) => i.zone_name).filter(Boolean))].join("، ");
  const first = items.reduce<Date | null>((min, i) => (!min || i.at < min ? i.at : min), null);
  const reason = gate.type === "restricted" ? "من بوابة ممنوع خروج البضائع منها" : "بدون أمر صرف مفتوح";
  return {
    type: "security",
    severity: "critical",
    entity_ref: `gate:${gate.id}`,
    title: `خروج غير مصرح من ${gate.name_ar}`,
    body: `${list} (${formatSAR(round2(value), { decimals: true })}) خرجت الساعة ${first ? formatTime(first) : "—"} ${reason}.${zones ? ` آخر موقع مسجل: ${zones}.` : ""}`,
  };
}

/** ترتيب العرض: الأخطر أولًا، المفتوح قبل «تم الاطلاع»، ثم الأحدث */
export function compareAlerts(
  a: { severity: Severity; status: AlertStatus; created_at: string | Date },
  b: { severity: Severity; status: AlertStatus; created_at: string | Date },
): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity) return bySeverity;
  const byStatus = (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1);
  if (byStatus) return byStatus;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}
