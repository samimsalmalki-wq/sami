import { createHash, timingSafeEqual } from "node:crypto";

/** مقارنة ثابتة الزمن لسر مُعرّف في متغير بيئة */
export function verifySecret(provided: unknown, expected: string | undefined): "ok" | "not_configured" | "invalid" {
  if (!expected) return "not_configured";
  if (typeof provided !== "string" || !provided) return "invalid";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}

/** يتحقق من مفتاح القارئ (X-Device-Key) */
export function verifyDeviceKey(provided: string | null) {
  return verifySecret(provided, process.env.RFID_DEVICE_KEY);
}
