import { getSql } from "@/lib/server/db";
import { errorJson, json, readJson, serverError } from "@/lib/server/http";
import { directContext, simulatorEnabled } from "@/lib/simulator/direct";
import { isScenario, runScenario } from "@/lib/simulator/scenarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/simulator { "scenario": "short_shipment" | "unauthorized_exit" | "dispatch" | "live_step" }
 * أزرار سيناريوهات العرض في الواجهة. تعمل فقط مع SIMULATOR_ENABLED=true
 * (المصادقة وصلاحية المسؤول في المرحلة 3).
 */
export async function POST(req: Request) {
  if (!simulatorEnabled()) return errorJson("simulator_disabled", 403);
  const body = (await readJson(req)) as { scenario?: unknown } | undefined;
  if (!isScenario(body?.scenario)) return errorJson("unknown_scenario", 400);
  try {
    return json(await runScenario(body.scenario, directContext(getSql())));
  } catch (err) {
    return serverError(err);
  }
}
