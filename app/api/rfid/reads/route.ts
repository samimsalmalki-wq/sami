import { getSql } from "@/lib/server/db";
import { verifyDeviceKey } from "@/lib/server/device-auth";
import { errorJson, json, readJson, serverError, zodIssues } from "@/lib/server/http";
import { IngestError, ingestReads, readsPayloadSchema } from "@/lib/server/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/rfid/reads — استقبال قراءات القارئ (دفعة قراءات)، بمفتاح X-Device-Key
 * {
 *   "gate_id": "G1",
 *   "reads": [{ "epc": "3034 1A01 00F2 1A3C", "antenna": "A", "rssi": -52, "read_at": "2026-11-05T10:31:04+03:00" }]
 * }
 * دفعة فاضية (reads: []) تُعامل كنبضة اتصال من القارئ.
 */
export async function POST(req: Request) {
  const auth = verifyDeviceKey(req.headers.get("x-device-key"));
  if (auth === "not_configured") return errorJson("device_key_not_configured", 503);
  if (auth === "invalid") return errorJson("invalid_device_key", 401);

  const parsed = readsPayloadSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson("invalid_payload", 400, { issues: zodIssues(parsed.error) });

  try {
    return json(await ingestReads(getSql(), parsed.data));
  } catch (err) {
    if (err instanceof IngestError) return errorJson(err.code, err.status, { message: err.message });
    return serverError(err);
  }
}
