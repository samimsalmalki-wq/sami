/**
 * npm run db:migrate
 * يطبّق ملفات supabase/migrations/*.sql اللي ما طُبقت بعد (lib/server/migrate.ts).
 * بديل لـ `supabase db push` لمن ما يستخدم Supabase CLI (لا تستخدم الاثنين على نفس القاعدة).
 */
import { requireDatabaseUrl } from "./env";
import { createSql } from "@/lib/server/db";
import { applyMigrations } from "@/lib/server/migrate";

async function main() {
  const sql = createSql(requireDatabaseUrl(), { max: 1 });
  try {
    const done = await applyMigrations(sql);
    for (const file of done) console.log(`✓ طُبّق ${file}`);
    console.log(done.length ? `اكتمل: ${done.length} ملف ترحيل.` : "قاعدة البيانات محدّثة، لا يوجد ترحيل جديد.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ فشل الترحيل:", err);
  process.exit(1);
});
