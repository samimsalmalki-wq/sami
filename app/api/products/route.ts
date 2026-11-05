import type { StockStatus } from "@/lib/inventory";
import { getSql } from "@/lib/server/db";
import { errorJson, json, serverError } from "@/lib/server/http";
import { listProducts } from "@/lib/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: StockStatus[] = ["critical", "low", "stagnant", "healthy"];

/** GET /api/products?status=critical&q=حليب — الأصناف مع الكمية والتغطية والحالة والطلب المقترح */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  if (status && !STATUSES.includes(status as StockStatus)) return errorJson("invalid_status", 400);
  try {
    return json(
      await listProducts(getSql(), {
        ...(status ? { status: status as StockStatus } : {}),
        q: params.get("q") ?? "",
      }),
    );
  } catch (err) {
    return serverError(err);
  }
}
