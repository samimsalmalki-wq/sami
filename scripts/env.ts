import { loadEnvConfig } from "@next/env";

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
