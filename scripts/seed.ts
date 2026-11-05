/**
 * npm run db:seed
 * يمسح الجداول ويعبئ البيانات التجريبية من جديد (lib/server/seed.ts). آمن للتكرار قبل كل عرض.
 */
import { requireDatabaseUrl } from "./env";
import { createSql } from "@/lib/server/db";
import { seedDemoData } from "@/lib/server/seed";

async function main() {
  const sql = createSql(requireDatabaseUrl(), { max: 1 });
  try {
    const s = await seedDemoData(sql);
    console.log(
      `✓ ${s.zones} مناطق · ${s.gates} بوابات · ${s.products} صنف · ${s.batches} دفعة · ${s.tags} بطاقة · ` +
        `${s.salesDays} يوم مبيعات · ${s.movements} حركة و${s.reads} قراءة خام اليوم`,
    );
    console.log(`✓ التنبيهات: ${s.alerts} تنبيه مفتوح`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ فشلت تعبئة البيانات:", err);
  process.exit(1);
});
