import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "./db";

/** ملفات الترحيل. على Vercel تُضمّن مع دالة /api/setup عبر outputFileTracingIncludes في next.config.mjs */
export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/**
 * يطبّق ملفات supabase/migrations/*.sql اللي ما طُبقت بعد، كل ملف في معاملة مستقلة،
 * ويسجلها في public.schema_migrations. يرجع أسماء الملفات اللي طُبقت الآن.
 */
export async function applyMigrations(sql: Sql, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await sql.unsafe(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
  `);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));

  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into public.schema_migrations (name) values (${file})`;
    });
    done.push(file);
  }
  return done;
}
