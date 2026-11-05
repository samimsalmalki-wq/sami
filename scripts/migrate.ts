/**
 * npm run db:migrate
 * يطبّق ملفات supabase/migrations/*.sql اللي ما طُبقت بعد، كل ملف في معاملة مستقلة.
 * بديل لـ `supabase db push` لمن ما يستخدم Supabase CLI (لا تستخدم الاثنين على نفس القاعدة).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { requireEnv } from "./env";
import { createSql } from "@/lib/server/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const sql = createSql(requireEnv("DATABASE_URL"), { max: 1 });
  try {
    await sql.unsafe(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name),
    );

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into public.schema_migrations (name) values (${file})`;
      });
      console.log(`✓ طُبّق ${file}`);
      count++;
    }
    console.log(count ? `اكتمل: ${count} ملف ترحيل.` : "قاعدة البيانات محدّثة، لا يوجد ترحيل جديد.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ فشل الترحيل:", err);
  process.exit(1);
});
