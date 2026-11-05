import { databaseUrl, getSql } from "@/lib/server/db";
import { verifySecret } from "@/lib/server/device-auth";
import { errorJson, json, readJson, serverError } from "@/lib/server/http";
import { applyMigrations } from "@/lib/server/migrate";
import { seedDemoData } from "@/lib/server/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * تهيئة المنصة بعد النشر بدون سطر أوامر (صفحة /setup).
 * GET  حالة قاعدة البيانات: متصلة؟ المخطط مطبّق؟ فيها بيانات؟
 * POST { "token": SETUP_TOKEN } يطبّق الترحيل ثم يعيد تعبئة البيانات التجريبية (يمسح الحالية).
 * بدون SETUP_TOKEN في متغيرات البيئة تبقى التهيئة مقفلة.
 */
export async function GET() {
  const base = { database_configured: !!databaseUrl(), setup_enabled: !!process.env.SETUP_TOKEN };
  if (!base.database_configured) return json({ ...base, connected: false, migrated: false, products: 0 });
  try {
    const sql = getSql();
    const [row] = await sql<{ migrated: boolean }[]>`select to_regclass('public.products') is not null as migrated`;
    const migrated = !!row?.migrated;
    const [count] = migrated ? await sql<{ n: number }[]>`select count(*)::int as n from products` : [{ n: 0 }];
    return json({ ...base, connected: true, migrated, products: count?.n ?? 0 });
  } catch (err) {
    console.error("setup status failed", err);
    return json({ ...base, connected: false, migrated: false, products: 0 });
  }
}

export async function POST(req: Request) {
  const body = (await readJson(req)) as { token?: unknown } | undefined;
  const auth = verifySecret(body?.token, process.env.SETUP_TOKEN);
  if (auth === "not_configured") return errorJson("setup_disabled", 403);
  if (auth === "invalid") return errorJson("invalid_token", 401);
  if (!databaseUrl()) return errorJson("database_not_configured", 503);
  try {
    const sql = getSql();
    const migrations = await applyMigrations(sql);
    const seed = await seedDemoData(sql);
    return json({ ok: true, migrations, seed });
  } catch (err) {
    return serverError(err);
  }
}
