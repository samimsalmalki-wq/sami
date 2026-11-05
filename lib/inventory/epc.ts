/**
 * أرقام EPC بالشكل المستخدم في المواصفات: "3034 1A01 00F2 1A3C"
 *   المقطع 1: الترويسة · المقطع 2: رمز الصنف (products.sku) · المقطعان 3 و4: الرقم التسلسلي
 * القارئ قد يرسل الرقم بدون مسافات أو بحروف صغيرة، فنوحّده قبل أي مقارنة.
 */

const HEX = /^[0-9A-F]+$/;
export const EPC_HEADER = "3034";

/** يرجع EPC بصيغة موحدة (مجموعات من 4 بحروف كبيرة) أو null إذا كان غير صالح */
export function normalizeEpc(raw: string): string | null {
  const hex = raw.replace(/[\s:-]/g, "").toUpperCase();
  if (hex.length < 16 || hex.length > 64 || hex.length % 4 !== 0 || !HEX.test(hex)) return null;
  return (hex.match(/.{4}/g) ?? []).join(" ");
}

/** رمز الصنف المضمّن في EPC (المقطع الثاني) */
export function productCodeFromEpc(epc: string): string | null {
  const normalized = normalizeEpc(epc);
  if (!normalized) return null;
  return normalized.split(" ")[1] ?? null;
}

/** يبني EPC من رمز الصنف ورقم تسلسلي (حتى 32 بت) */
export function buildEpc(productCode: string, serial: number): string {
  const code = productCode.toUpperCase();
  if (code.length !== 4 || !HEX.test(code)) throw new Error(`invalid product code: ${productCode}`);
  const s = (serial >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `${EPC_HEADER} ${code} ${s.slice(0, 4)} ${s.slice(4)}`;
}
