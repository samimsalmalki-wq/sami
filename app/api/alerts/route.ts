import type { AlertStatus } from "@/lib/inventory";
import { getSql } from "@/lib/server/db";
import { errorJson, json, serverError } from "@/lib/server/http";
import { listAlerts } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: AlertStatus[] = ["open", "acknowledged", "resolved"];

/** GET /api/alerts?status=open — بدون status: المفتوح و«تم الاطلاع». يقبل أكثر من حالة: ?status=open,resolved */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("status");
  const statuses = raw ? raw.split(",").map((s) => s.trim()) : ["open", "acknowledged"];
  if (!statuses.every((s) => STATUSES.includes(s as AlertStatus))) return errorJson("invalid_status", 400);
  try {
    return json({ alerts: await listAlerts(getSql(), statuses as AlertStatus[]) });
  } catch (err) {
    return serverError(err);
  }
}
