import { addDays, daysBetween } from "./time";

/**
 * معاملات المواسم السعودية (ثابتة في المرحلة 1 و2، وتُستبدل بنموذج Prophet مع التقويم الهجري في المرحلة 3).
 *   2.1                 إلكترونيات            أسبوع الجمعة البيضاء
 *   يزيد تدريجيًا حتى 1.6 تمور، قهوة           آخر 10 أسابيع قبل رمضان (ويبقى 1.6 خلال رمضان)
 *   1.4                 مواد غذائية، مشروبات  رمضان
 *   1.5                 قرطاسية، وجبات خفيفة  العودة للمدارس
 * التواريخ تقريبية وتُحدَّث سنويًا.
 */

export interface SeasonCalendar {
  /** تواريخ الجمعة البيضاء */
  whiteFriday: string[];
  /** أول وآخر يوم في رمضان */
  ramadan: { start: string; end: string }[];
  /** أول يوم دراسي */
  backToSchool: string[];
}

export const SEASON_CALENDAR: SeasonCalendar = {
  whiteFriday: ["2026-11-27", "2027-11-26", "2028-11-24"],
  ramadan: [
    { start: "2027-02-08", end: "2027-03-09" },
    { start: "2028-01-28", end: "2028-02-26" },
  ],
  backToSchool: ["2027-08-22", "2028-08-20"],
};

export const SEASON_NOTES = {
  whiteFriday: "الجمعة البيضاء",
  preRamadan: "اقتراب رمضان",
  ramadan: "رمضان",
  backToSchool: "العودة للمدارس",
} as const;

const WHITE_FRIDAY_CATEGORIES = new Set(["electronics"]);
const PRE_RAMADAN_CATEGORIES = new Set(["dates", "coffee"]);
const RAMADAN_CATEGORIES = new Set(["food", "beverages"]);
const SCHOOL_CATEGORIES = new Set(["stationery", "snacks"]);

export const WHITE_FRIDAY_FACTOR = 2.1;
export const PRE_RAMADAN_MAX_FACTOR = 1.6;
export const PRE_RAMADAN_RAMP_WEEKS = 10;
export const RAMADAN_FACTOR = 1.4;
export const BACK_TO_SCHOOL_FACTOR = 1.5;

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** معامل الموسم لأسبوع يبدأ في weekStart (7 أيام) */
export function seasonFactor(
  category: string,
  weekStart: string,
  calendar: SeasonCalendar = SEASON_CALENDAR,
): { factor: number; note: string | null } {
  const weekEnd = addDays(weekStart, 6);

  if (WHITE_FRIDAY_CATEGORIES.has(category)) {
    if (calendar.whiteFriday.some((d) => overlaps(weekStart, weekEnd, d, d))) {
      return { factor: WHITE_FRIDAY_FACTOR, note: SEASON_NOTES.whiteFriday };
    }
  }

  if (PRE_RAMADAN_CATEGORIES.has(category)) {
    for (const r of calendar.ramadan) {
      if (overlaps(weekStart, weekEnd, r.start, r.end)) {
        return { factor: PRE_RAMADAN_MAX_FACTOR, note: SEASON_NOTES.ramadan };
      }
      const weeksUntil = daysBetween(weekStart, r.start) / 7;
      if (weeksUntil > 0 && weeksUntil < PRE_RAMADAN_RAMP_WEEKS) {
        const factor =
          1 + (PRE_RAMADAN_MAX_FACTOR - 1) * ((PRE_RAMADAN_RAMP_WEEKS - weeksUntil) / PRE_RAMADAN_RAMP_WEEKS);
        return { factor, note: SEASON_NOTES.preRamadan };
      }
    }
  }

  if (RAMADAN_CATEGORIES.has(category)) {
    if (calendar.ramadan.some((r) => overlaps(weekStart, weekEnd, r.start, r.end))) {
      return { factor: RAMADAN_FACTOR, note: SEASON_NOTES.ramadan };
    }
  }

  if (SCHOOL_CATEGORIES.has(category)) {
    if (calendar.backToSchool.some((d) => overlaps(weekStart, weekEnd, addDays(d, -7), addDays(d, 6)))) {
      return { factor: BACK_TO_SCHOOL_FACTOR, note: SEASON_NOTES.backToSchool };
    }
  }

  return { factor: 1, note: null };
}
