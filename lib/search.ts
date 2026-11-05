/** توحيد النص العربي للبحث: بدون تشكيل، والألف والتاء المربوطة والياء بصيغة واحدة */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  return fields.some((f) => f && normalizeArabic(f).includes(q));
}
