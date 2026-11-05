import { TIME_ZONE } from "./inventory/constants";
import { riyadhDate } from "./inventory/time";

/** أرقام لاتينية (0-9) دائمًا، والمبالغ بالريال السعودي «ر.س» */

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatNumber(n: number): string {
  return integer.format(Math.round(n));
}

/** المبالغ الكبيرة بدون كسور، ومع decimals تظهر الهللات إذا وُجدت */
export function formatSAR(n: number, opts: { decimals?: boolean } = {}): string {
  const rounded = Math.round(n * 100) / 100;
  const text = opts.decimals && !Number.isInteger(rounded) ? twoDecimals.format(rounded) : integer.format(Math.round(n));
  return `${text} ر.س`;
}

/** 3 إلى 10 بصيغة الجمع، وغيرها بالمفرد كما هو شائع في الواجهات */
function pluralWord(n: number, singular: string, plural: string): string {
  return n >= 3 && n <= 10 ? plural : singular;
}

/** عدد مع اسم المعدود: «3 كراتين»، «12 كرتون» */
export function formatCount(n: number, singular: string, plural: string): string {
  const v = Math.round(n);
  return `${formatNumber(v)} ${pluralWord(v, singular, plural)}`;
}

export function formatUnits(n: number): string {
  const v = Math.round(n);
  return `${formatNumber(v)} ${pluralWord(v, "وحدة", "وحدات")}`;
}

export function formatDays(n: number): string {
  const v = Math.floor(n);
  return `${formatNumber(v)} ${pluralWord(v, "يوم", "أيام")}`;
}

/** أيام التغطية تُعرض مقرّبة للأسفل حتى تتسق مع الحدود (أقل من 4 = حرج) */
export function formatCoverage(days: number): string {
  if (!Number.isFinite(days) || days > 365) return "+365 يوم";
  if (days < 1) return "أقل من يوم";
  return formatDays(days);
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const shortTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

/** HH:MM:SS بتوقيت الرياض */
export function formatTime(d: Date | string): string {
  return timeFormat.format(toDate(d));
}

export function formatShortTime(d: Date | string): string {
  return shortTimeFormat.format(toDate(d));
}

/** DD/MM/YYYY. التاريخ المجرد (YYYY-MM-DD) يُعرض كما هو بدون تحويل منطقة زمنية */
export function formatDate(d: Date | string): string {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return dateFormat.format(toDate(d));
}

/** D/M للمحاور والجداول المختصرة */
export function formatShortDate(date: string): string {
  const [, m, day] = date.split("-");
  return `${Number(day)}/${Number(m)}`;
}

/** وقت الحركة: اليوم → HH:MM:SS، وغيره → DD/MM HH:MM */
export function formatWhen(d: Date | string, now: Date = new Date()): string {
  const date = toDate(d);
  if (riyadhDate(date) === riyadhDate(now)) return formatTime(date);
  const [, m, day] = riyadhDate(date).split("-");
  return `${day}/${m} ${formatShortTime(date)}`;
}
