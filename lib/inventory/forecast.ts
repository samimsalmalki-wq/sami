import { FORECAST_WEEKS, HISTORY_WEEKS, HOLT_ALPHA, HOLT_BETA } from "./constants";
import { SEASON_CALENDAR, seasonFactor, type SeasonCalendar } from "./seasons";
import { addDays, daysBetween } from "./time";

/**
 * التنبؤ بالطلب: Holt (تنعيم أسي مزدوج) على المبيعات الأسبوعية (α = 0.5، β = 0.25)
 * ثم يُضرب في معامل الموسم:  ŷ(t+h) = (L(t) + h·T(t)) × S(t+h)
 */

/** يجمع المبيعات اليومية في أسابيع تنتهي في endDate. العنصر الأول هو الأقدم */
export function weeklyTotals(
  daily: readonly { date: string; units: number }[],
  endDate: string,
  weeks: number = HISTORY_WEEKS,
): number[] {
  const totals = new Array<number>(weeks).fill(0);
  for (const day of daily) {
    const age = daysBetween(day.date, endDate);
    if (age < 0 || age >= weeks * 7) continue;
    const index = weeks - 1 - Math.floor(age / 7);
    totals[index] = (totals[index] ?? 0) + day.units;
  }
  return totals;
}

/** المستوى L والاتجاه T بعد آخر أسبوع */
export function holt(
  series: readonly number[],
  alpha: number = HOLT_ALPHA,
  beta: number = HOLT_BETA,
): { level: number; trend: number } {
  const first = series[0];
  if (first === undefined) return { level: 0, trend: 0 };
  if (series.length === 1) return { level: first, trend: 0 };
  // الاتجاه الابتدائي من أول أربعة أسابيع (أو أقل) ليكون أثبت من فرق أسبوعين
  const k = Math.min(3, series.length - 1);
  let level = first;
  let trend = ((series[k] ?? first) - first) / k;
  for (let i = 1; i < series.length; i++) {
    const previous = level;
    level = alpha * (series[i] ?? 0) + (1 - alpha) * (level + trend);
    trend = beta * (level - previous) + (1 - beta) * trend;
  }
  return { level, trend };
}

export interface ForecastWeek {
  h: number;
  weekStart: string;
  /** L + h·T قبل الموسم */
  base: number;
  factor: number;
  note: string | null;
  predicted: number;
}

/** توقع الأسابيع القادمة. الأسبوع الأول يبدأ في firstWeekStart (اليوم) */
export function forecastWeeks(
  series: readonly number[],
  category: string,
  firstWeekStart: string,
  weeks: number = FORECAST_WEEKS,
  calendar: SeasonCalendar = SEASON_CALENDAR,
): ForecastWeek[] {
  const { level, trend } = holt(series);
  return Array.from({ length: weeks }, (_, i) => {
    const h = i + 1;
    const weekStart = addDays(firstWeekStart, 7 * i);
    const base = Math.max(0, level + h * trend);
    const { factor, note } = seasonFactor(category, weekStart, calendar);
    return { h, weekStart, base, factor, note, predicted: base * factor };
  });
}

/** الانحراف المعياري للعينة */
export function sampleStdDev(series: readonly number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((s, x) => s + x, 0) / series.length;
  const variance = series.reduce((s, x) => s + (x - mean) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}
