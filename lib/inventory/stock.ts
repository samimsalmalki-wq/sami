import {
  COVERAGE_CRITICAL_DAYS,
  COVERAGE_LOW_DAYS,
  COVERAGE_STAGNANT_DAYS,
  REVIEW_PERIOD_WEEKS,
  SERVICE_LEVEL_Z,
} from "./constants";

export type StockStatus = "critical" | "low" | "stagnant" | "healthy";

/**
 * أيام التغطية = المتوفر ÷ (البيع المتوقع الأسبوع القادم ÷ 7)
 * بدون طلب متوقع: المخزون يكفي «للأبد» (Infinity)، وبدون مخزون: 0.
 */
export function coverageDays(available: number, nextWeekForecast: number): number {
  if (available <= 0) return 0;
  const daily = nextWeekForecast / 7;
  if (daily <= 0) return Number.POSITIVE_INFINITY;
  return available / daily;
}

/** أقل من 4 أيام: حرج. أقل من 10: منخفض. أكثر من 60: راكد. غير ذلك: سليم */
export function stockStatus(coverage: number): StockStatus {
  if (coverage < COVERAGE_CRITICAL_DAYS) return "critical";
  if (coverage < COVERAGE_LOW_DAYS) return "low";
  if (coverage > COVERAGE_STAGNANT_DAYS) return "stagnant";
  return "healthy";
}

/** مجموع التوقع لعدد أسابيع قد يكون كسريًا (مدة التوريد بالأيام ÷ 7) */
export function horizonDemand(weeklyForecast: readonly number[], horizonWeeks: number): number {
  const last = weeklyForecast[weeklyForecast.length - 1] ?? 0;
  const at = (h: number) => weeklyForecast[h - 1] ?? last;
  const full = Math.floor(horizonWeeks);
  const fraction = horizonWeeks - full;
  let total = 0;
  for (let h = 1; h <= full; h++) total += at(h);
  if (fraction > 0) total += fraction * at(full + 1);
  return total;
}

export interface ReorderInput {
  /** ŷ لكل أسبوع قادم بالترتيب h = 1, 2, … */
  weeklyForecast: readonly number[];
  leadTimeDays: number;
  /** σ: الانحراف المعياري للمبيعات الأسبوعية */
  sigma: number;
  available: number;
  /** الوارد: المتبقي في أوامر الشراء المفتوحة */
  incoming: number;
  packSize: number;
  reviewWeeks?: number;
  z?: number;
}

/**
 * كمية الطلب المقترحة:
 *   Q = Σ(h=1..L+R) ŷh + z·σ·√(L+R) − المتوفر − الوارد
 * L مدة التوريد بالأسابيع، R دورة المراجعة (أسبوعين)، z = 1.65 لمستوى خدمة 95٪.
 * إذا Q ≤ 0 لا حاجة للطلب، غير كذا تُقرّب للأعلى لمضاعف حجم الكرتون.
 */
export function suggestedOrderQty(input: ReorderInput): number {
  const horizon = input.leadTimeDays / 7 + (input.reviewWeeks ?? REVIEW_PERIOD_WEEKS);
  const z = input.z ?? SERVICE_LEVEL_Z;
  const q =
    horizonDemand(input.weeklyForecast, horizon) +
    z * input.sigma * Math.sqrt(horizon) -
    input.available -
    input.incoming;
  if (q <= 0) return 0;
  const pack = Math.max(1, Math.floor(input.packSize));
  return Math.ceil(q / pack - 1e-9) * pack;
}
