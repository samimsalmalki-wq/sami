import { EXPIRY_WINDOW_DAYS, FORECAST_WEEKS, REVIEW_PERIOD_WEEKS } from "./constants";
import { expectedWaste, type FefoBatch, type WasteRow } from "./fefo";
import { forecastWeeks, sampleStdDev, type ForecastWeek } from "./forecast";
import { round2 } from "./rules";
import { coverageDays, stockStatus, suggestedOrderQty, type StockStatus } from "./stock";

/** حقول الصنف اللي تحتاجها الحسابات */
export interface ProductFacts {
  category: string;
  unit_cost: number;
  unit_price: number;
  pack_size: number;
  lead_time_days: number;
}

export interface ProductMetrics {
  /** المتوفر = مجموع كميات الدفعات */
  available: number;
  /** مبيعات آخر 12 أسبوع (الأول هو الأقدم) */
  weeklySales: number[];
  lastWeekSales: number;
  /** توقع 8 أسابيع */
  forecast: ForecastWeek[];
  nextWeekForecast: number;
  dailyForecast: number;
  coverageDays: number;
  status: StockStatus;
  sigma: number;
  incoming: number;
  suggestedOrder: number;
  /** قيمة المخزون بسعر التكلفة */
  stockValue: number;
  waste: WasteRow[];
  /** القيمة المعرضة للهدر للدفعات اللي تنتهي خلال 30 يوم */
  valueAtRisk: number;
}

/** يجمع كل حسابات الصنف في مكان واحد (المتوفر، التنبؤ، التغطية، الحالة، الطلب المقترح، الهدر) */
export function computeProductMetrics(
  product: ProductFacts,
  batches: readonly FefoBatch[],
  weeklySales: readonly number[],
  incoming: number,
  today: string,
): ProductMetrics {
  const available = batches.reduce((sum, b) => sum + b.quantity, 0);
  const weeksNeeded = Math.max(FORECAST_WEEKS, Math.ceil(product.lead_time_days / 7 + REVIEW_PERIOD_WEEKS));
  const forecast = forecastWeeks(weeklySales, product.category, today, weeksNeeded);
  const nextWeekForecast = forecast[0]?.predicted ?? 0;
  const dailyForecast = nextWeekForecast / 7;
  const coverage = coverageDays(available, nextWeekForecast);
  const sigma = sampleStdDev(weeklySales);
  const suggestedOrder = suggestedOrderQty({
    weeklyForecast: forecast.map((w) => w.predicted),
    leadTimeDays: product.lead_time_days,
    sigma,
    available,
    incoming,
    packSize: product.pack_size,
  });
  const waste = expectedWaste(batches, dailyForecast, today, product.unit_price);
  const valueAtRisk = round2(
    waste.filter((w) => w.remainingDays <= EXPIRY_WINDOW_DAYS).reduce((sum, w) => sum + w.valueAtRisk, 0),
  );

  return {
    available,
    weeklySales: [...weeklySales],
    lastWeekSales: weeklySales[weeklySales.length - 1] ?? 0,
    forecast: forecast.slice(0, FORECAST_WEEKS),
    nextWeekForecast,
    dailyForecast,
    coverageDays: coverage,
    status: stockStatus(coverage),
    sigma,
    incoming,
    suggestedOrder,
    stockValue: round2(available * product.unit_cost),
    waste,
    valueAtRisk,
  };
}

export interface InventorySummary {
  productCount: number;
  totalUnits: number;
  stockValue: number;
  /** أصناف تحت الحد = حرج + منخفض */
  belowThreshold: number;
  critical: number;
  /** رأس مال راكد = قيمة الأصناف الراكدة (تغطية أكثر من 60 يوم) */
  stagnantValue: number;
  valueAtRisk: number;
  statusCounts: Record<StockStatus, number>;
}

export function summarizeInventory(items: readonly ProductMetrics[]): InventorySummary {
  const statusCounts: Record<StockStatus, number> = { critical: 0, low: 0, stagnant: 0, healthy: 0 };
  let totalUnits = 0;
  let stockValue = 0;
  let stagnantValue = 0;
  let valueAtRisk = 0;
  for (const m of items) {
    statusCounts[m.status]++;
    totalUnits += m.available;
    stockValue += m.stockValue;
    valueAtRisk += m.valueAtRisk;
    if (m.status === "stagnant") stagnantValue += m.stockValue;
  }
  return {
    productCount: items.length,
    totalUnits,
    stockValue: round2(stockValue),
    belowThreshold: statusCounts.critical + statusCounts.low,
    critical: statusCounts.critical,
    stagnantValue: round2(stagnantValue),
    valueAtRisk: round2(valueAtRisk),
    statusCounts,
  };
}
