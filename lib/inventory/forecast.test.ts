import { describe, expect, it } from "vitest";
import { forecastWeeks, holt, sampleStdDev, weeklyTotals } from "./forecast";
import { seasonFactor } from "./seasons";
import { addDays } from "./time";

describe("تجميع المبيعات أسبوعيًا", () => {
  it("12 أسبوع تنتهي في آخر يوم، والأول هو الأقدم", () => {
    const end = "2026-11-04";
    const daily = Array.from({ length: 84 }, (_, i) => ({ date: addDays(end, -i), units: i < 7 ? 2 : 1 }));
    const weeks = weeklyTotals(daily, end);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe(14);
    expect(weeks[0]).toBe(7);
  });

  it("يتجاهل الأيام خارج النافذة", () => {
    const weeks = weeklyTotals(
      [
        { date: "2026-11-05", units: 99 },
        { date: "2026-08-12", units: 99 },
        { date: "2026-11-04", units: 3 },
      ],
      "2026-11-04",
    );
    expect(weeks.reduce((s, x) => s + x, 0)).toBe(3);
  });
});

describe("Holt (α = 0.5، β = 0.25)", () => {
  it("سلسلة ثابتة: المستوى نفس القيمة والاتجاه صفر", () => {
    expect(holt(new Array(12).fill(40))).toEqual({ level: 40, trend: 0 });
  });

  it("سلسلة خطية: يلتقط الميل بالضبط", () => {
    const series = Array.from({ length: 12 }, (_, i) => 10 + 2 * i);
    const { level, trend } = holt(series);
    expect(level).toBeCloseTo(32, 10);
    expect(trend).toBeCloseTo(2, 10);
  });

  it("ŷ(t+h) = (L + h·T) × S، ولا يقل عن صفر", () => {
    const series = Array.from({ length: 12 }, (_, i) => 10 + 2 * i);
    const weeks = forecastWeeks(series, "food", "2026-11-05", 3);
    expect(weeks.map((w) => w.predicted)).toEqual([34, 36, 38]);
    const falling = forecastWeeks([30, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0], "food", "2026-11-05", 8);
    expect(falling.every((w) => w.predicted >= 0)).toBe(true);
  });

  it("يضرب في معامل الموسم: الإلكترونيات أسبوع الجمعة البيضاء × 2.1", () => {
    const weeks = forecastWeeks(new Array(12).fill(10), "electronics", "2026-11-05", 4);
    const wf = weeks.find((w) => w.note === "الجمعة البيضاء");
    expect(wf?.weekStart).toBe("2026-11-26");
    expect(wf?.predicted).toBeCloseTo(21, 10);
    expect(weeks.filter((w) => w.factor === 1)).toHaveLength(3);
  });

  it("الانحراف المعياري للعينة", () => {
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(sampleStdDev([5])).toBe(0);
  });
});

describe("معاملات المواسم", () => {
  it("الجمعة البيضاء للإلكترونيات فقط", () => {
    expect(seasonFactor("electronics", "2026-11-23")).toEqual({ factor: 2.1, note: "الجمعة البيضاء" });
    expect(seasonFactor("electronics", "2026-11-28").factor).toBe(1);
    expect(seasonFactor("food", "2026-11-23").factor).toBe(1);
  });

  it("التمور والقهوة تزيد تدريجيًا حتى 1.6 في آخر 10 أسابيع قبل رمضان", () => {
    expect(seasonFactor("dates", "2026-11-05").factor).toBe(1); // أكثر من 10 أسابيع
    const mid = seasonFactor("coffee", "2026-12-28"); // 6 أسابيع قبل رمضان
    expect(mid.note).toBe("اقتراب رمضان");
    expect(mid.factor).toBeCloseTo(1.24, 2);
    expect(seasonFactor("dates", "2027-02-01").factor).toBeCloseTo(1.54, 5); // أسبوع واحد قبل رمضان
    expect(seasonFactor("dates", "2027-02-03")).toEqual({ factor: 1.6, note: "رمضان" }); // يتداخل مع رمضان
  });

  it("المواد الغذائية والمشروبات × 1.4 في رمضان، والقرطاسية × 1.5 للعودة للمدارس", () => {
    expect(seasonFactor("beverages", "2027-02-15")).toEqual({ factor: 1.4, note: "رمضان" });
    expect(seasonFactor("dairy", "2027-02-15").factor).toBe(1);
    expect(seasonFactor("stationery", "2027-08-16")).toEqual({ factor: 1.5, note: "العودة للمدارس" });
  });
});
