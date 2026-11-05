import { RIYADH_OFFSET_MS } from "@/lib/inventory/constants";
import type { Antenna } from "@/lib/inventory/reads";
import { randomInt } from "./rng";

/** القراءة بنفس صيغة الأجهزة الحقيقية (POST /api/rfid/reads) */
export interface WireRead {
  epc: string;
  antenna: Antenna;
  rssi: number;
  read_at: string;
}

export type PassKind = "in" | "out" | "unconfirmed";

/** وقت القراءة بتوقيت الرياض كما ترسله القارئات: 2026-11-05T10:31:04.120+03:00 */
export function toRiyadhIso(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_MS).toISOString().replace("Z", "+03:00");
}

/**
 * يولّد القراءات الخام لمرور بطاقة واحدة من بوابة:
 *   خروج: الهوائي الداخلي A أولًا ثم الخارجي B. دخول: B ثم A.
 *   غير مؤكد: قراءات على هوائي واحد فقط (شخص مرّ جنب البوابة بدون ما يعبرها).
 * القارئ يقرأ نفس البطاقة عدة مرات، فكل مرور ينتج 4 إلى 12 قراءة تقريبًا (المكرر يُفلتر في الخادم).
 */
export function generatePass(epc: string, kind: PassKind, start: Date, rng: () => number): WireRead[] {
  const first: Antenna = kind === "in" ? "B" : "A";
  const second: Antenna = first === "A" ? "B" : "A";
  const reads: WireRead[] = [];
  let t = start.getTime();

  const firstCount = randomInt(rng, 2, 6);
  for (let i = 0; i < firstCount; i++) {
    reads.push({ epc, antenna: first, rssi: -70 + i * 3 + randomInt(rng, 0, 4), read_at: toRiyadhIso(new Date(t)) });
    t += randomInt(rng, 40, 120);
  }
  if (kind === "unconfirmed") return reads;

  t += randomInt(rng, 250, 650);
  const secondCount = randomInt(rng, 2, 6);
  for (let i = 0; i < secondCount; i++) {
    reads.push({ epc, antenna: second, rssi: -50 - i * 3 - randomInt(rng, 0, 4), read_at: toRiyadhIso(new Date(t)) });
    t += randomInt(rng, 40, 120);
  }
  return reads;
}

/** نفس generatePass لكن آخر قراءة عند `end`: القارئ يرسل الدفعة بعد ما تعبر البطاقة */
export function passEndingAt(epc: string, kind: PassKind, end: Date, rng: () => number): WireRead[] {
  const reads = generatePass(epc, kind, end, rng);
  const shift = passDuration(reads);
  return reads.map((r) => ({ ...r, read_at: toRiyadhIso(new Date(Date.parse(r.read_at) - shift)) }));
}

/** مدة المرور بالمللي ثانية (من أول قراءة لآخرها) */
export function passDuration(reads: readonly WireRead[]): number {
  if (reads.length < 2) return 0;
  return Date.parse(reads[reads.length - 1]!.read_at) - Date.parse(reads[0]!.read_at);
}
