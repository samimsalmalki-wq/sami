import type { Direction } from "./reads";

/**
 * أثر الحركة على المخزون حسب نوع البوابة والاتجاه:
 *   الاستلام  + دخول  → دفعة جديدة + مطابقة مع أمر الشراء المفتوح
 *   الشحن     + خروج  → خصم بقاعدة FEFO، ويشترط أمر صرف مفتوح وإلا يُطلق تنبيه
 *   النقل الداخلي     → تحديث موقع البطاقة فقط
 *   المقيدة   + خروج  → خصم + تنبيه أمني حرج + حالة البطاقة «مفقودة»
 * أي تركيبة ثانية (مثل دخول من بوابة الشحن) تُسجل بعلامة «اتجاه غير متوقع» بدون أثر.
 */

export type GateType = "inbound" | "outbound" | "transfer" | "restricted";
export type GateEffect = "receive" | "ship" | "transfer" | "restricted_exit" | "none";

export function gateEffect(type: GateType, direction: Direction): GateEffect {
  switch (type) {
    case "inbound":
      return direction === "in" ? "receive" : "none";
    case "outbound":
      return direction === "out" ? "ship" : "none";
    case "transfer":
      return "transfer";
    case "restricted":
      return direction === "out" ? "restricted_exit" : "none";
  }
}

/** موقع البطاقة بعد المرور: الدخول ينقلها إلى to_zone والخروج إلى from_zone */
export function zoneAfterPass(
  gate: { from_zone_id: string | null; to_zone_id: string | null },
  direction: Direction,
): string | null {
  return direction === "in" ? gate.to_zone_id : gate.from_zone_id;
}

export interface OrderLineState {
  id: string;
  documentNumber: string;
  /** المطلوب (qty_expected أو qty_ordered) */
  target: number;
  /** المنجز (qty_received أو qty_shipped) */
  done: number;
  dueAt?: Date | null;
}

function byPriority<T extends OrderLineState>(a: T, b: T): number {
  const remainingA = a.target - a.done > 0 ? 0 : 1;
  const remainingB = b.target - b.done > 0 ? 0 : 1;
  if (remainingA !== remainingB) return remainingA - remainingB;
  const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA - dueB;
  return a.documentNumber.localeCompare(b.documentNumber);
}

/**
 * سطر أمر الشراء المفتوح اللي تُطابق عليه بطاقة مستلمة.
 * يفضّل السطر اللي باقي له كمية، ثم الأقدم موعدًا. الزيادة تُسجل على نفس الأمر.
 */
export function pickPurchaseLine<T extends OrderLineState>(lines: readonly T[]): T | null {
  return [...lines].sort(byPriority)[0] ?? null;
}

/** سطر أمر الصرف اللي يصرّح بالخروج: لازم يكون باقي له كمية، وإلا الخروج غير مصرح */
export function pickSalesLine<T extends OrderLineState>(lines: readonly T[]): T | null {
  return [...lines].filter((l) => l.target - l.done > 0).sort(byPriority)[0] ?? null;
}

export function isOrderComplete(lines: readonly { target: number; done: number }[]): boolean {
  return lines.length > 0 && lines.every((l) => l.done >= l.target);
}

export interface ReceiptLine {
  productName: string;
  expected: number;
  received: number;
  unitCost: number;
}

export interface Shortage extends ReceiptLine {
  shortage: number;
  value: number;
}

/** الأسطر اللي وصل منها أقل من المطلوب في أمر الشراء، مع قيمة النقص بسعر التكلفة */
export function shortShipmentLines(lines: readonly ReceiptLine[]): Shortage[] {
  return lines
    .filter((l) => l.received < l.expected)
    .map((l) => {
      const shortage = l.expected - l.received;
      return { ...l, shortage, value: round2(shortage * l.unitCost) };
    });
}

/** رقم دفعة الاستلام: L-MMDD، ومعه رقم أمر الشراء إن وُجد (L-1105-2291) */
export function receiptLotNumber(today: string, poNumber?: string | null): string {
  const mmdd = today.slice(5, 7) + today.slice(8, 10);
  const digits = poNumber?.replace(/\D/g, "");
  return digits ? `L-${mmdd}-${digits}` : `L-${mmdd}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
