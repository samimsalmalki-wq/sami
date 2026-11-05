import { describe, expect, it } from "vitest";
import { processReads, type RawRead } from "@/lib/inventory/reads";
import { generatePass, passDuration, toRiyadhIso } from "./passes";
import { createRng } from "./rng";

const EPC = "3034 1A01 00F2 1A3C";
const toRaw = (r: ReturnType<typeof generatePass>[number]): RawRead => ({
  epc: r.epc,
  antenna: r.antenna,
  rssi: r.rssi,
  readAt: new Date(r.read_at),
});

describe("مولّد مرور البطاقة", () => {
  it("وقت القراءة بتوقيت الرياض", () => {
    expect(toRiyadhIso(new Date("2026-11-05T07:31:04.000Z"))).toBe("2026-11-05T10:31:04.000+03:00");
  });

  it("الخروج يمر بالهوائي A ثم B، والخادم يحسبه حركة خروج واحدة", () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const reads = generatePass(EPC, "out", new Date("2026-11-05T07:00:00Z"), rng);
      expect(reads[0]?.antenna).toBe("A");
      expect(reads.at(-1)?.antenna).toBe("B");
      expect(passDuration(reads)).toBeLessThan(3_000);
      let n = 0;
      const { decisions, sessions } = processReads(reads.map(toRaw), new Map(), () => `m${++n}`);
      expect(decisions.filter((d) => d.kind === "primary")).toHaveLength(1);
      expect(sessions.get(EPC)?.direction).toBe("out");
    }
  });

  it("الدخول B ثم A، وغير المؤكد على هوائي واحد", () => {
    const rng = createRng(3);
    const start = new Date("2026-11-05T07:00:00Z");
    const inbound = processReads(generatePass(EPC, "in", start, rng).map(toRaw), new Map(), () => "m");
    expect(inbound.sessions.get(EPC)?.direction).toBe("in");
    const only = generatePass(EPC, "unconfirmed", start, rng);
    expect(new Set(only.map((r) => r.antenna)).size).toBe(1);
    expect(processReads(only.map(toRaw), new Map(), () => "m").sessions.get(EPC)?.direction).toBeNull();
  });
});
