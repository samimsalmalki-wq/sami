import { z } from "zod";
import { getSql } from "@/lib/server/db";
import { errorJson, json, readJson, serverError } from "@/lib/server/http";
import { updateAlertStatus } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ status: z.enum(["open", "acknowledged", "resolved"]) });

/** PATCH /api/alerts/:id { "status": "acknowledged" | "resolved" } — تأكيد أو إغلاق تنبيه */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return errorJson("not_found", 404);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson("invalid_payload", 400);
  try {
    const alert = await updateAlertStatus(getSql(), params.id, parsed.data.status);
    return alert ? json(alert) : errorJson("not_found", 404);
  } catch (err) {
    return serverError(err);
  }
}
