import { EXPIRY_DISCOUNT_DAYS } from "./constants";
import { round2 } from "./rules";
import { daysBetween } from "./time";

/**
 * FEFO: الأقرب انتهاءً يخرج أولًا.
 * الدفعات بدون تاريخ انتهاء تأتي بعد اللي لها تاريخ، وعند التساوي الأقدم استلامًا أولًا (FIFO).
 */

export interface FefoBatch {
  id: string;
  quantity: number;
  /** YYYY-MM-DD أو null */
  expiryDate: string | null;
  receivedAt: Date;
}

export function compareFefo(
  a: Pick<FefoBatch, "expiryDate" | "receivedAt">,
  b: Pick<FefoBatch, "expiryDate" | "receivedAt">,
): number {
  if (a.expiryDate && b.expiryDate && a.expiryDate !== b.expiryDate) {
    return a.expiryDate < b.expiryDate ? -1 : 1;
  }
  if (a.expiryDate && !b.expiryDate) return -1;
  if (!a.expiryDate && b.expiryDate) return 1;
  return a.receivedAt.getTime() - b.receivedAt.getTime();
}

export interface Allocation {
  batchId: string;
  units: number;
}

/** يوزّع الخصم على الدفعات بقاعدة FEFO. shortfall = اللي ما لقى له رصيد */
export function allocateFefo(
  batches: readonly FefoBatch[],
  units: number,
): { allocations: Allocation[]; shortfall: number } {
  let left = Math.max(0, Math.floor(units));
  const allocations: Allocation[] = [];
  for (const batch of [...batches].filter((b) => b.quantity > 0).sort(compareFefo)) {
    if (left <= 0) break;
    const take = Math.min(batch.quantity, left);
    allocations.push({ batchId: batch.id, units: take });
    left -= take;
  }
  return { allocations, shortfall: left };
}

export interface FefoTag {
  epc: string;
  units: number;
  expiryDate: string | null;
  receivedAt: Date;
}

/**
 * يختار البطاقات اللي تُصرف لتغطية كمية (يستخدمه المحاكي لتجهيز أوامر الصرف):
 * بترتيب FEFO، والكراتين الكاملة قبل المفتوحة، بدون تجاوز الكمية المطلوبة.
 */
export function pickTagsFefo<T extends FefoTag>(tags: readonly T[], units: number): T[] {
  const sorted = [...tags].sort((a, b) => compareFefo(a, b) || b.units - a.units || a.epc.localeCompare(b.epc));
  const picked: T[] = [];
  let total = 0;
  for (const tag of sorted) {
    if (total >= units) break;
    if (total + tag.units > units) continue;
    picked.push(tag);
    total += tag.units;
  }
  return picked;
}

export type WasteAction = "none" | "discount" | "transfer";

export interface WasteRow {
  batchId: string;
  quantity: number;
  expiryDate: string;
  remainingDays: number;
  /** المتوقع بيعه من هذه الدفعة قبل انتهائها */
  sellable: number;
  surplus: number;
  valueAtRisk: number;
  action: WasteAction;
}

/**
 * الهدر المتوقع (FEFO):
 *   رتّب دفعات الصنف من الأقرب انتهاءً.
 *   القابل للبيع = (البيع اليومي × الأيام المتبقية) − مجموع الدفعات اللي قبلها.
 *   الفائض = كمية الدفعة − القابل للبيع (إذا موجب). القيمة المعرضة = الفائض × سعر الوحدة.
 *   الإجراء: لا فائض → لا إجراء. 3 أيام أو أقل → خصم 30٪. أكثر → نقل لفرع.
 */
export function expectedWaste(
  batches: readonly FefoBatch[],
  dailySales: number,
  today: string,
  unitPrice: number,
): WasteRow[] {
  const rows: WasteRow[] = [];
  let before = 0;
  const withExpiry = batches.filter((b) => b.expiryDate && b.quantity > 0).sort(compareFefo);
  for (const batch of withExpiry) {
    const expiryDate = batch.expiryDate as string;
    const remainingDays = Math.max(0, daysBetween(today, expiryDate));
    const sellable = Math.max(0, Math.max(0, dailySales) * remainingDays - before);
    const surplus = Math.max(0, Math.round(batch.quantity - sellable));
    before += batch.quantity;
    const action: WasteAction =
      surplus <= 0 ? "none" : remainingDays <= EXPIRY_DISCOUNT_DAYS ? "discount" : "transfer";
    rows.push({
      batchId: batch.id,
      quantity: batch.quantity,
      expiryDate,
      remainingDays,
      sellable,
      surplus,
      valueAtRisk: round2(surplus * unitPrice),
      action,
    });
  }
  return rows;
}
