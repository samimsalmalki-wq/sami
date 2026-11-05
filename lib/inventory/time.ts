import { RIYADH_OFFSET_MS } from "./constants";

const DAY_MS = 86_400_000;

/** تاريخ اليوم في الرياض بصيغة YYYY-MM-DD */
export function riyadhDate(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** لحظة منتصف الليل (00:00 بتوقيت الرياض) لليوم اللي فيه `at` */
export function riyadhDayStart(at: Date): Date {
  const shifted = at.getTime() + RIYADH_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - RIYADH_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** عدد الأيام الكاملة من a إلى b (b − a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** 0 = الأحد … 6 = السبت */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
