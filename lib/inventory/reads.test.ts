import { describe, expect, it } from "vitest";
import {
  directionFromAntennas,
  isDuplicateRead,
  processReads,
  summarizeDecisions,
  type Antenna,
  type PassSession,
  type RawRead,
} from "./reads";

const EPC = "3034 1A01 00F2 1A3C";
const OTHER = "3034 1A02 00F2 0001";
const t0 = new Date("2026-11-05T07:31:04.000Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const read = (antenna: Antenna, ms: number, epc = EPC): RawRead => ({ epc, antenna, rssi: -52, readAt: at(ms) });

function keys() {
  let n = 0;
  return () => `m${++n}`;
}

describe("فلترة القراءات المكررة", () => {
  it("القراءة الأولى فقط تتحول إلى حركة والباقي مكرر خلال 5 ثوانٍ", () => {
    const reads = [read("A", 0), read("A", 40), read("A", 90), read("A", 300), read("A", 4_900)];
    const { decisions } = processReads(reads, new Map(), keys());
    expect(summarizeDecisions(decisions)).toEqual({ raw: 5, duplicates: 4, passes: 1, confirmed: 0 });
  });

  it("بعد 5 ثوانٍ نفس البطاقة تفتح مرورًا جديدًا", () => {
    const { decisions } = processReads([read("A", 0), read("A", 5_000)], new Map(), keys());
    expect(decisions.map((d) => d.kind)).toEqual(["primary", "primary"]);
  });

  it("كل بطاقة لها فلترة مستقلة", () => {
    const { decisions } = processReads([read("A", 0), read("A", 10, OTHER), read("A", 20)], new Map(), keys());
    expect(decisions.map((d) => d.kind)).toEqual(["primary", "primary", "duplicate"]);
  });

  it("ترتّب القراءات زمنيًا قبل الفلترة", () => {
    const { decisions } = processReads([read("A", 400), read("A", 0), read("A", 200)], new Map(), keys());
    expect(decisions[0]?.kind).toBe("primary");
    expect(decisions[0]?.read.readAt).toEqual(at(0));
  });

  it("تعتمد على المرور المفتوح من دفعة سابقة", () => {
    const known = new Map<string, PassSession>([
      [EPC, { key: "m-old", epc: EPC, startedAt: at(0), firstAntenna: "A", direction: null }],
    ]);
    expect(isDuplicateRead(read("A", 1_000), known.get(EPC))).toBe(true);
    const { decisions } = processReads([read("A", 1_000)], known, keys());
    expect(decisions[0]).toMatchObject({ kind: "duplicate", session: { key: "m-old" } });
  });
});

describe("تحديد اتجاه الحركة", () => {
  it("A ثم B = خروج، B ثم A = دخول، نفس الهوائي لا يحدد", () => {
    expect(directionFromAntennas("A", "B")).toBe("out");
    expect(directionFromAntennas("B", "A")).toBe("in");
    expect(directionFromAntennas("A", "A")).toBeNull();
  });

  it("A ثم B خلال 3 ثوانٍ يؤكد الخروج مرة واحدة فقط", () => {
    const reads = [read("A", 0), read("A", 120), read("B", 700), read("B", 800), read("A", 900)];
    const { decisions, sessions } = processReads(reads, new Map(), keys());
    const confirms = decisions.filter((d) => d.kind === "duplicate" && d.confirms);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toMatchObject({ confirms: "out" });
    expect(sessions.get(EPC)?.direction).toBe("out");
  });

  it("B ثم A = دخول", () => {
    const { sessions } = processReads([read("B", 0), read("A", 600)], new Map(), keys());
    expect(sessions.get(EPC)?.direction).toBe("in");
  });

  it("قراءة على هوائي واحد فقط تبقى بدون اتجاه مؤكد", () => {
    const { decisions, sessions } = processReads([read("A", 0), read("A", 500), read("A", 1_200)], new Map(), keys());
    expect(decisions.some((d) => d.kind === "duplicate" && d.confirms)).toBe(false);
    expect(sessions.get(EPC)?.direction).toBeNull();
  });

  it("الهوائي الثاني بعد أكثر من 3 ثوانٍ لا يؤكد الاتجاه (لكنه يبقى مكررًا)", () => {
    const { decisions, sessions } = processReads([read("A", 0), read("B", 3_500)], new Map(), keys());
    expect(decisions[1]).toMatchObject({ kind: "duplicate", confirms: null });
    expect(sessions.get(EPC)?.direction).toBeNull();
  });

  it("التأكيد يصل في دفعة لاحقة", () => {
    const first = processReads([read("A", 0), read("A", 80)], new Map(), keys());
    expect(first.sessions.get(EPC)?.direction).toBeNull();
    const second = processReads([read("B", 900)], first.sessions, keys());
    expect(second.decisions[0]).toMatchObject({ kind: "duplicate", confirms: "out", session: { key: "m1" } });
  });

  it("لا تعدّل حالة المرورات الممررة لها", () => {
    const known = new Map<string, PassSession>([
      [EPC, { key: "m-old", epc: EPC, startedAt: at(0), firstAntenna: "B", direction: null }],
    ]);
    processReads([read("A", 500)], known, keys());
    expect(known.get(EPC)?.direction).toBeNull();
  });
});
