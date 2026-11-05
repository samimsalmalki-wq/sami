import { describe, expect, it } from "vitest";
import { allocateFefo, compareFefo, expectedWaste, pickTagsFefo, type FefoBatch } from "./fefo";

const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const batch = (id: string, quantity: number, expiryDate: string | null, receivedDay = 1): FefoBatch => ({
  id,
  quantity,
  expiryDate,
  receivedAt: day(receivedDay),
});

describe("ترتيب FEFO", () => {
  it("الأقرب انتهاءً أولًا، ثم بدون تاريخ، والتعادل بالأقدم استلامًا", () => {
    const batches = [
      batch("none-new", 5, null, 20),
      batch("late", 5, "2026-12-01"),
      batch("none-old", 5, null, 2),
      batch("soon", 5, "2026-11-07"),
      batch("soon-older", 5, "2026-11-07", 0),
    ];
    expect([...batches].sort(compareFefo).map((b) => b.id)).toEqual([
      "soon-older",
      "soon",
      "late",
      "none-old",
      "none-new",
    ]);
  });
});

describe("الخصم بقاعدة FEFO", () => {
  it("يخصم من الدفعة الأقرب انتهاءً ثم التالية", () => {
    const batches = [batch("late", 50, "2026-11-20"), batch("soon", 8, "2026-11-07")];
    expect(allocateFefo(batches, 12)).toEqual({
      allocations: [
        { batchId: "soon", units: 8 },
        { batchId: "late", units: 4 },
      ],
      shortfall: 0,
    });
  });

  it("يتجاهل الدفعات الفاضية ويرجع العجز", () => {
    const batches = [batch("empty", 0, "2026-11-06"), batch("a", 3, "2026-11-09")];
    expect(allocateFefo(batches, 5)).toEqual({ allocations: [{ batchId: "a", units: 3 }], shortfall: 2 });
  });
});

describe("الهدر المتوقع", () => {
  const today = "2026-11-05";

  it("القابل للبيع = البيع اليومي × الأيام المتبقية − الدفعات اللي قبلها", () => {
    const rows = expectedWaste(
      [batch("b3", 100, "2026-11-20"), batch("b1", 50, "2026-11-07"), batch("b2", 40, "2026-11-15")],
      10,
      today,
      7.25,
    );
    expect(rows.map((r) => [r.batchId, r.remainingDays, r.sellable, r.surplus, r.action])).toEqual([
      ["b1", 2, 20, 30, "discount"],
      ["b2", 10, 50, 0, "none"],
      ["b3", 15, 60, 40, "transfer"],
    ]);
    expect(rows[0]?.valueAtRisk).toBe(217.5);
  });

  it("3 أيام أو أقل مع فائض → خصم 30٪، أكثر → نقل لفرع، بدون فائض → لا إجراء", () => {
    const [d3, d4, ok] = [
      ...expectedWaste([batch("d3", 30, "2026-11-08")], 2, today, 1),
      ...expectedWaste([batch("d4", 30, "2026-11-09")], 2, today, 1),
      ...expectedWaste([batch("ok", 6, "2026-11-09")], 2, today, 1),
    ];
    expect(d3?.action).toBe("discount");
    expect(d4?.action).toBe("transfer");
    expect(ok?.action).toBe("none");
  });

  it("مثال البيانات التجريبية: لبن L-1029 (40 وحدة، تنتهي بعد يومين، بيع 12 يوميًا)", () => {
    const [row] = expectedWaste([batch("L-1029", 40, "2026-11-07")], 12, today, 9.75);
    expect(row).toMatchObject({ surplus: 16, action: "discount", valueAtRisk: 156 });
  });

  it("يتجاهل الدفعات بدون تاريخ انتهاء", () => {
    expect(expectedWaste([batch("rice", 55, null)], 7, today, 54)).toEqual([]);
  });
});

describe("اختيار البطاقات للصرف", () => {
  const tag = (epc: string, units: number, expiryDate: string | null) => ({
    epc,
    units,
    expiryDate,
    receivedAt: day(1),
  });

  it("يختار من الدفعة الأقرب انتهاءً والكراتين الكاملة أولًا بدون تجاوز الكمية", () => {
    const tags = [
      tag("late-1", 12, "2027-06-01"),
      tag("soon-part", 6, "2027-01-01"),
      tag("soon-1", 12, "2027-01-01"),
      tag("soon-2", 12, "2027-01-01"),
    ];
    expect(pickTagsFefo(tags, 24).map((t) => t.epc)).toEqual(["soon-1", "soon-2"]);
    expect(pickTagsFefo(tags, 30).map((t) => t.epc)).toEqual(["soon-1", "soon-2", "soon-part"]);
  });
});
