import { getSql } from "@/lib/server/db";
import { json, serverError } from "@/lib/server/http";
import { dashboardSummary } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard/summary — مؤشرات نظرة عامة، يحتاج طلب شراء، آخر القراءات */
export async function GET() {
  try {
    return json(await dashboardSummary(getSql()));
  } catch (err) {
    return serverError(err);
  }
}
