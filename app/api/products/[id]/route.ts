import { getSql } from "@/lib/server/db";
import { errorJson, json, serverError } from "@/lib/server/http";
import { getProductDetail } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/products/:id — تفاصيل الصنف: الدفعات، الحركات، مواقع البطاقات، التنبؤ */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return errorJson("not_found", 404);
  try {
    const detail = await getProductDetail(getSql(), params.id);
    return detail ? json(detail) : errorJson("not_found", 404);
  } catch (err) {
    return serverError(err);
  }
}
