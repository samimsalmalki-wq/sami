/** ثوابت القواعد الحسابية (قسم «الخوارزميات والقواعد الحسابية» في المواصفات) */

/** القراءة مكررة إذا تكرر نفس EPC على نفس البوابة خلال 5 ثوانٍ */
export const DEDUPE_WINDOW_MS = 5_000;
/** A ثم B خلال 3 ثوانٍ = خروج، B ثم A = دخول */
export const DIRECTION_WINDOW_MS = 3_000;

/** Holt: التنعيم الأسي المزدوج على المبيعات الأسبوعية */
export const HOLT_ALPHA = 0.5;
export const HOLT_BETA = 0.25;
export const HISTORY_WEEKS = 12;
export const FORECAST_WEEKS = 8;

/** كمية الطلب: z لمستوى خدمة 95٪ ودورة مراجعة أسبوعين */
export const SERVICE_LEVEL_Z = 1.65;
export const REVIEW_PERIOD_WEEKS = 2;

/** أيام التغطية والحالة */
export const COVERAGE_CRITICAL_DAYS = 4;
export const COVERAGE_LOW_DAYS = 10;
export const COVERAGE_STAGNANT_DAYS = 60;

/** الصلاحية والهدر */
export const EXPIRY_WINDOW_DAYS = 30;
export const EXPIRY_DISCOUNT_DAYS = 3;
export const EXPIRY_DISCOUNT_PERCENT = 30;

/** قراءات خروج غير مصرح لنفس البوابة خلال دقيقة تُجمع في تنبيه أمني واحد */
export const SECURITY_INCIDENT_WINDOW_MS = 60_000;

/** الرياض UTC+3 بدون توقيت صيفي */
export const TIME_ZONE = "Asia/Riyadh";
export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
