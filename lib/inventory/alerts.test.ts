import { describe, expect, it } from "vitest";
import {
  compareAlerts,
  planAlertSync,
  productAlerts,
  shortShipmentAlert,
  unauthorizedExitAlert,
  type AlertDraft,
  type ExistingAlert,
} from "./alerts";
import { computeProductMetrics, summarizeInventory } from "./metrics";

const product = { category: "dairy", unit_cost: 4.9, unit_price: 6.5, pack_size: 12, lead_time_days: 2 };
const batch = (id: string, quantity: number, expiryDate: string | null) => ({
  id,
  quantity,
  expiryDate,
  receivedAt: new Date("2026-11-01T06:00:00Z"),
});

describe("حسابات الصنف", () => {
  const weekly = new Array(12).fill(140);

  it("حليب 38 وحدة وبيع 140 بالأسبوع: حرج ويحتاج طلب", () => {
    const m = computeProductMetrics(product, [batch("b1", 18, "2026-11-07"), batch("b2", 20, "2026-11-11")], weekly, 0, "2026-11-05");
    expect(m.available).toBe(38);
    expect(m.nextWeekForecast).toBeCloseTo(140, 6);
    expect(m.coverageDays).toBeCloseTo(1.9, 6);
    expect(m.status).toBe("critical");
    expect(m.suggestedOrder % 12).toBe(0);
    expect(m.suggestedOrder).toBeGreaterThan(0);
    expect(m.stockValue).toBe(186.2);
  });

  it("الملخص: تحت الحد، الراكد، المعرض للهدر", () => {
    const critical = computeProductMetrics(product, [batch("b1", 38, null)], weekly, 0, "2026-11-05");
    const stagnant = computeProductMetrics(
      { ...product, unit_cost: 10 },
      [batch("b2", 500, null)],
      new Array(12).fill(14),
      0,
      "2026-11-05",
    );
    const summary = summarizeInventory([critical, stagnant]);
    expect(summary).toMatchObject({ belowThreshold: 1, critical: 1, stagnantValue: 5000, totalUnits: 538 });
  });
});

describe("تنبيهات الصنف", () => {
  it("حرج ومنخفض وراكد وصلاحية", () => {
    const m = computeProductMetrics(product, [batch("b1", 38, "2026-11-20")], new Array(12).fill(140), 0, "2026-11-05");
    const drafts = productAlerts({ id: "p1", name_ar: "حليب" }, m, [{ id: "b1", lot_number: "L-1103" }]);
    expect(drafts.map((d) => [d.type, d.severity])).toEqual([["stock", "critical"]]);
    expect(drafts[0]?.title).toBe("حليب على وشك النفاد");

    // نفس الكمية لكنها تنتهي بكرة: 20 تنباع والباقي فائض → تنبيه صلاحية
    const expiring = computeProductMetrics(product, [batch("b1", 38, "2026-11-06")], new Array(12).fill(140), 0, "2026-11-05");
    const expiringAlerts = productAlerts({ id: "p1", name_ar: "حليب" }, expiring, [{ id: "b1", lot_number: "L-1103" }]);
    expect(expiringAlerts.map((d) => d.type)).toEqual(["stock", "expiry"]);
    expect(expiringAlerts[1]?.title).toBe("دفعة L-1103 من حليب تنتهي خلال 1 يوم");

    const laban = computeProductMetrics(
      { ...product, unit_price: 9.75 },
      [batch("L-1029", 40, "2026-11-07"), batch("L-1104", 56, "2026-11-16")],
      new Array(12).fill(84),
      0,
      "2026-11-05",
    );
    const labanAlerts = productAlerts({ id: "p2", name_ar: "لبن" }, laban, [
      { id: "L-1029", lot_number: "L-1029" },
      { id: "L-1104", lot_number: "L-1104" },
    ]);
    expect(labanAlerts.map((d) => [d.type, d.severity, d.entity_ref])).toEqual([
      ["stock", "warning", "product:p2"],
      ["expiry", "warning", "batch:L-1029"],
    ]);
    expect(labanAlerts[1]?.body).toContain("16 وحدة");
  });
});

describe("مزامنة التنبيهات المشتقة", () => {
  const existing = (over: Partial<ExistingAlert>): ExistingAlert => ({
    id: "x",
    type: "stock",
    severity: "critical",
    entity_ref: "product:p1",
    title: "t",
    body: "b",
    status: "open",
    ...over,
  });
  const draft = (over: Partial<AlertDraft>): AlertDraft => ({
    type: "stock",
    severity: "critical",
    entity_ref: "product:p1",
    title: "t",
    body: "b",
    ...over,
  });

  it("يضيف الجديد، يحدّث النص، ويغلق اللي زال شرطه", () => {
    const plan = planAlertSync(
      [
        existing({ id: "1" }),
        existing({ id: "2", type: "stale", severity: "info", entity_ref: "product:p2", status: "acknowledged" }),
        existing({ id: "3", type: "expiry", severity: "warning", entity_ref: "batch:b9" }),
      ],
      [
        draft({ severity: "warning" }),
        draft({ type: "stale", severity: "info", entity_ref: "product:p2", body: "رقم جديد" }),
      ],
    );
    expect(plan.insert.map((d) => d.severity)).toEqual(["warning"]);
    expect(plan.update).toEqual([{ id: "2", title: "t", body: "رقم جديد" }]);
    expect(plan.resolve.sort()).toEqual(["1", "3"]);
  });

  it("لا يغيّر شيئًا إذا كان كل شي مطابق", () => {
    expect(planAlertSync([existing({})], [draft({})])).toEqual({ insert: [], update: [], resolve: [] });
  });
});

describe("نصوص التنبيهات", () => {
  it("الشحنة الناقصة فيها الصنف والنقص وقيمته", () => {
    const a = shortShipmentAlert(
      { po_number: "PO-2291", supplier: "مورد الألبان المركزي" },
      [{ productName: "عصير برتقال 1 لتر", expected: 36, received: 30, unitCost: 5.2, shortage: 6, value: 31.2 }],
      2,
    );
    expect(a).toMatchObject({ type: "receipt", severity: "warning", entity_ref: "po:PO-2291", title: "شحنة PO-2291 ناقصة" });
    expect(a.body).toContain("عصير برتقال 1 لتر: المطلوب 36، المستلم 30 (نقص 6 وحدات بقيمة 31.20 ر.س)");
  });

  it("الخروج غير المصرح يجمع القطع لنفس البوابة", () => {
    const at = new Date("2026-11-05T07:31:04Z");
    const a = unauthorizedExitAlert({ id: "G5", name_ar: "المخرج الخلفي", type: "restricted" }, [
      { name_ar: "سماعات لاسلكية", units: 1, unit_cost: 185, zone_name: "قفص القيمة العالية", at },
      { name_ar: "سماعات لاسلكية", units: 1, unit_cost: 185, zone_name: "قفص القيمة العالية", at },
    ]);
    expect(a).toMatchObject({ type: "security", severity: "critical", entity_ref: "gate:G5" });
    expect(a.body).toContain("سماعات لاسلكية ×2 (370 ر.س) خرجت الساعة 10:31:04");
    expect(a.body).toContain("آخر موقع مسجل: قفص القيمة العالية");
  });

  it("الترتيب: الأخطر ثم المفتوح ثم الأحدث", () => {
    const list = [
      { id: "w", severity: "warning" as const, status: "open" as const, created_at: "2026-11-05T08:00:00Z" },
      { id: "c-ack", severity: "critical" as const, status: "acknowledged" as const, created_at: "2026-11-05T09:00:00Z" },
      { id: "c-old", severity: "critical" as const, status: "open" as const, created_at: "2026-11-05T07:00:00Z" },
      { id: "c-new", severity: "critical" as const, status: "open" as const, created_at: "2026-11-05T07:30:00Z" },
    ];
    expect([...list].sort(compareAlerts).map((a) => a.id)).toEqual(["c-new", "c-old", "c-ack", "w"]);
  });
});
