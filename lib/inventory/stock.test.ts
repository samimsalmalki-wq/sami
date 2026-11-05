import { describe, expect, it } from "vitest";
import { coverageDays, horizonDemand, stockStatus, suggestedOrderQty } from "./stock";

describe("أيام التغطية", () => {
  it("المتوفر ÷ (البيع المتوقع الأسبوع القادم ÷ 7)", () => {
    expect(coverageDays(70, 70)).toBe(7);
    expect(coverageDays(38, 140)).toBeCloseTo(1.9, 5);
    expect(coverageDays(520, 25)).toBeCloseTo(145.6, 5);
  });

  it("بدون طلب متوقع المخزون يكفي بلا حد، وبدون مخزون التغطية صفر", () => {
    expect(coverageDays(10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(coverageDays(0, 50)).toBe(0);
    expect(coverageDays(0, 0)).toBe(0);
  });
});

describe("حالة الصنف", () => {
  it("أقل من 4 أيام حرج", () => {
    expect(stockStatus(0)).toBe("critical");
    expect(stockStatus(3.99)).toBe("critical");
  });
  it("أقل من 10 منخفض (4 نفسها منخفض)", () => {
    expect(stockStatus(4)).toBe("low");
    expect(stockStatus(9.99)).toBe("low");
  });
  it("من 10 إلى 60 سليم", () => {
    expect(stockStatus(10)).toBe("healthy");
    expect(stockStatus(35)).toBe("healthy");
    expect(stockStatus(60)).toBe("healthy");
  });
  it("أكثر من 60 راكد", () => {
    expect(stockStatus(60.01)).toBe("stagnant");
    expect(stockStatus(Number.POSITIVE_INFINITY)).toBe("stagnant");
  });
  it("مثال: حليب 38 وحدة وبيع متوقع 140 بالأسبوع = حرج", () => {
    expect(stockStatus(coverageDays(38, 140))).toBe("critical");
  });
});

describe("كمية الطلب المقترحة", () => {
  const flat = [100, 100, 100, 100, 100, 100, 100, 100];

  it("تطبّق المعادلة وتقرّب للأعلى لمضاعف الكرتون", () => {
    // L = 1 أسبوع، R = 2 → 300 + 1.65 × 10 × √3 − 50 − 20 = 258.58 → 22 كرتون × 12
    expect(
      suggestedOrderQty({ weeklyForecast: flat, leadTimeDays: 7, sigma: 10, available: 50, incoming: 20, packSize: 12 }),
    ).toBe(264);
  });

  it("الوارد في أوامر الشراء المفتوحة ينقص الكمية", () => {
    const base = { weeklyForecast: flat, leadTimeDays: 7, sigma: 0, available: 0, packSize: 1 };
    expect(suggestedOrderQty({ ...base, incoming: 0 })).toBe(300);
    expect(suggestedOrderQty({ ...base, incoming: 120 })).toBe(180);
  });

  it("إذا Q أقل من أو يساوي صفر لا حاجة للطلب", () => {
    expect(
      suggestedOrderQty({ weeklyForecast: flat, leadTimeDays: 7, sigma: 10, available: 400, incoming: 0, packSize: 6 }),
    ).toBe(0);
    expect(
      suggestedOrderQty({ weeklyForecast: flat, leadTimeDays: 7, sigma: 0, available: 300, incoming: 0, packSize: 6 }),
    ).toBe(0);
  });

  it("مدة توريد بالأيام تُحسب أسابيع كسرية", () => {
    // 3 أيام = 0.43 أسبوع → الأفق 2.43 أسبوع
    expect(horizonDemand(flat, 3 / 7 + 2)).toBeCloseTo(242.857, 2);
    expect(
      suggestedOrderQty({ weeklyForecast: flat, leadTimeDays: 3, sigma: 0, available: 0, incoming: 0, packSize: 1 }),
    ).toBe(243);
  });

  it("الكمية الدقيقة على مضاعف الكرتون لا تُرفع كرتونًا زائدًا", () => {
    expect(
      suggestedOrderQty({ weeklyForecast: flat, leadTimeDays: 7, sigma: 0, available: 0, incoming: 0, packSize: 12 }),
    ).toBe(300);
  });
});
