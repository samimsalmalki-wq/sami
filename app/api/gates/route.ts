import { getSql } from "@/lib/server/db";
import { json, serverError } from "@/lib/server/http";
import { listGates } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/gates — حالة البوابات وعداداتها اليوم */
export async function GET() {
  try {
    return json(await listGates(getSql()));
  } catch (err) {
    return serverError(err);
  }
}
