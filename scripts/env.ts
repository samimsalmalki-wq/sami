import { loadEnvConfig } from "@next/env";
import { databaseUrl } from "@/lib/server/db";

// Load .env, .env.local … the same way Next.js does, so scripts and the app share config.
loadEnvConfig(process.cwd());

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} غير معرّف. انسخ .env.example إلى .env.local واملأ القيم.`);
    process.exit(1);
  }
  return value;
}

/** DATABASE_URL أو POSTGRES_URL */
export function requireDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    console.error("✗ DATABASE_URL غير معرّف. انسخ .env.example إلى .env.local واملأ القيم.");
    process.exit(1);
  }
  return url;
}
