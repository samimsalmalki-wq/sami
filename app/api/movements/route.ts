import { getSql } from "@/lib/server/db";
import { errorJson, json, serverError } from "@/lib/server/http";
import { listMovements } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: string | null): Date | undefined | null {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/movements?gate=G1&from=2026-11-05T00:00:00+03:00&to=…&limit=60
 * سجل الحركات (الافتراضي: اليوم بتوقيت الرياض)، مع عدد القراءات الخام والمكرر المُرشَّح لنفس الفترة.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));
  if (from === null || to === null) return errorJson("invalid_date", 400);
  const gate = params.get("gate") || undefined;
  const limit = Number(params.get("limit") ?? 60);
  try {
    return json(
      await listMovements(getSql(), {
        ...(gate ? { gate } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit: Number.isFinite(limit) ? limit : 60,
      }),
    );
  } catch (err) {
    return serverError(err);
  }
}
