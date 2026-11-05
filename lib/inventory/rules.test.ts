import { describe, expect, it } from "vitest";
import { buildEpc, normalizeEpc, productCodeFromEpc } from "./epc";
import {
  gateEffect,
  isOrderComplete,
  pickPurchaseLine,
  pickSalesLine,
  receiptLotNumber,
  shortShipmentLines,
  zoneAfterPass,
} from "./rules";
import { addDays, daysBetween, riyadhDate, riyadhDayStart } from "./time";

describe("أرقام EPC", () => {
  it("توحّد الصيغة وتستخرج رمز الصنف", () => {
    expect(normalizeEpc("30341a0100f21a3c")).toBe("3034 1A01 00F2 1A3C");
    expect(normalizeEpc(" 3034 1A01 00F2 1A3C ")).toBe("3034 1A01 00F2 1A3C");
    expect(productCodeFromEpc("3034 1A01 00F2 1A3C")).toBe("1A01");
  });

  it("ترفض الأرقام غير الصالحة", () => {
    expect(normalizeEpc("3034 1A01")).toBeNull();
    expect(normalizeEpc("3034 1A01 00F2 1A3G")).toBeNull();
  });

  it("تبني EPC من رمز الصنف ورقم تسلسلي", () => {
    expect(buildEpc("4D02", 0x00f2_0003)).toBe("3034 4D02 00F2 0003");
  });
});

describe("أثر البوابة على المخزون", () => {
  it("حسب جدول المواصفات", () => {
    expect(gateEffect("inbound", "in")).toBe("receive");
    expect(gateEffect("outbound", "out")).toBe("ship");
    expect(gateEffect("transfer", "in")).toBe("transfer");
    expect(gateEffect("transfer", "out")).toBe("transfer");
    expect(gateEffect("restricted", "out")).toBe("restricted_exit");
  });

  it("التركيبات غير المذكورة بدون أثر", () => {
    expect(gateEffect("inbound", "out")).toBe("none");
    expect(gateEffect("outbound", "in")).toBe("none");
    expect(gateEffect("restricted", "in")).toBe("none");
  });

  it("الدخول ينقل البطاقة إلى to_zone والخروج إلى from_zone", () => {
    const gate = { from_zone_id: "RCV", to_zone_id: "COLD" };
    expect(zoneAfterPass(gate, "in")).toBe("COLD");
    expect(zoneAfterPass(gate, "out")).toBe("RCV");
  });
});

describe("مطابقة أوامر الشراء والصرف", () => {
  const line = (id: string, target: number, done: number, due?: string) => ({
    id,
    documentNumber: id,
    target,
    done,
    dueAt: due ? new Date(due) : null,
  });

  it("أمر الصرف لازم يكون باقي له كمية وإلا الخروج غير مصرح", () => {
    expect(pickSalesLine([line("SO-1", 40, 40)])).toBeNull();
    expect(pickSalesLine([line("SO-1", 40, 40), line("SO-2", 10, 0)])?.id).toBe("SO-2");
  });

  it("أمر الشراء: الباقي له كمية أولًا ثم الأقدم موعدًا، والزيادة تُسجل عليه", () => {
    expect(
      pickPurchaseLine([line("PO-2", 10, 0, "2026-11-07"), line("PO-1", 10, 0, "2026-11-05")])?.id,
    ).toBe("PO-1");
    expect(pickPurchaseLine([line("PO-1", 10, 10), line("PO-2", 10, 4)])?.id).toBe("PO-2");
    expect(pickPurchaseLine([line("PO-1", 10, 10)])?.id).toBe("PO-1");
  });

  it("الأمر مكتمل لما كل الأسطر تكتمل", () => {
    expect(isOrderComplete([{ target: 40, done: 40 }, { target: 12, done: 12 }])).toBe(true);
    expect(isOrderComplete([{ target: 40, done: 40 }, { target: 12, done: 8 }])).toBe(false);
  });

  it("الشحنة الناقصة: PO-2291 عصير 36 وصل 30", () => {
    const lines = [
      { productName: "حليب طازج 1 لتر", expected: 48, received: 48, unitCost: 4.9 },
      { productName: "لبن 2 لتر", expected: 24, received: 24, unitCost: 7.4 },
      { productName: "عصير برتقال 1 لتر", expected: 36, received: 30, unitCost: 5.2 },
    ];
    expect(shortShipmentLines(lines)).toEqual([
      { productName: "عصير برتقال 1 لتر", expected: 36, received: 30, unitCost: 5.2, shortage: 6, value: 31.2 },
    ]);
  });

  it("رقم دفعة الاستلام", () => {
    expect(receiptLotNumber("2026-11-05", "PO-2291")).toBe("L-1105-2291");
    expect(receiptLotNumber("2026-11-05")).toBe("L-1105");
  });
});

describe("توقيت الرياض", () => {
  it("اليوم يبدأ 00:00 بتوقيت الرياض (21:00 UTC)", () => {
    expect(riyadhDate(new Date("2026-11-04T21:30:00Z"))).toBe("2026-11-05");
    expect(riyadhDate(new Date("2026-11-04T20:59:00Z"))).toBe("2026-11-04");
    expect(riyadhDayStart(new Date("2026-11-05T10:00:00Z")).toISOString()).toBe("2026-11-04T21:00:00.000Z");
  });

  it("حساب الأيام", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(daysBetween("2026-11-05", "2026-11-07")).toBe(2);
  });
});
