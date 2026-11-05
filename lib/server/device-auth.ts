import { createHash, timingSafeEqual } from "node:crypto";

/** يتحقق من مفتاح القارئ (X-Device-Key) بمقارنة ثابتة الزمن */
export function verifyDeviceKey(provided: string | null): "ok" | "not_configured" | "invalid" {
  const expected = process.env.RFID_DEVICE_KEY;
  if (!expected) return "not_configured";
  if (!provided) return "invalid";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}
