/**
 * بديل lib/client/api.ts: بدل طلبات HTTP لمسارات /api، نستدعي نفس دوال الخادم مباشرة
 * على قاعدة البيانات داخل الصفحة، ونمرر النتيجة عبر JSON كما لو وصلت من الشبكة.
 */
import type { AlertStatus } from "@/lib/inventory/alerts";
import type { StockStatus } from "@/lib/inventory/stock";
import {
  dashboardSummary,
  getProductDetail,
  listAlerts,
  listGates,
  listMovements,
  listProducts,
  updateAlertStatus,
} from "@/lib/server/queries";
import { directContext } from "@/lib/simulator/direct";
import { isScenario, runScenario } from "@/lib/simulator/scenarios";
import { getSql } from "./db";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const overTheWire = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export async function getJson<T>(url: string): Promise<T> {
  const u = new URL(url, "https://demo.invalid");
  const q = u.searchParams;
  const sql = getSql();
  const path = u.pathname;

  if (path === "/api/dashboard/summary") return overTheWire(await dashboardSummary(sql));
  if (path === "/api/alerts") {
    const statuses = q.get("status")?.split(",") as AlertStatus[] | undefined;
    return overTheWire({ alerts: await listAlerts(sql, statuses) });
  }
  if (path === "/api/products") {
    const status = q.get("status") as StockStatus | null;
    return overTheWire(await listProducts(sql, { ...(status ? { status } : {}), q: q.get("q") ?? "" }));
  }
  const product = path.match(/^\/api\/products\/([^/]+)$/);
  if (product) {
    const id = product[1] ?? "";
    const detail = UUID.test(id) ? await getProductDetail(sql, id) : null;
    if (!detail) throw new ApiError(404, "not_found");
    return overTheWire(detail);
  }
  if (path === "/api/movements") {
    const gate = q.get("gate");
    return overTheWire(await listMovements(sql, { ...(gate ? { gate } : {}), limit: Number(q.get("limit") ?? 60) }));
  }
  if (path === "/api/gates") return overTheWire(await listGates(sql));
  throw new ApiError(404, "not_found");
}

export async function sendJson<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const data = (body ?? {}) as { scenario?: unknown; status?: AlertStatus };
  if (url === "/api/simulator" && method === "POST") {
    if (!isScenario(data.scenario)) throw new ApiError(400, "unknown_scenario");
    return overTheWire(await runScenario(data.scenario, directContext(getSql())));
  }
  const alert = url.match(/^\/api\/alerts\/([^/]+)$/);
  if (alert && method === "PATCH" && data.status) {
    const updated = await updateAlertStatus(getSql(), alert[1] ?? "", data.status);
    if (!updated) throw new ApiError(404, "not_found");
    return overTheWire(updated);
  }
  throw new ApiError(404, "not_found");
}
