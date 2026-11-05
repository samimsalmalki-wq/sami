import { describe, expect, it } from "vitest";
import { connectionConfig } from "./db";

describe("رابط قاعدة البيانات", () => {
  it("يحذف معاملات الرابط غير المعروفة ويشفّر الاتصال البعيد", () => {
    const c = connectionConfig(
      "postgres://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(c).toEqual({ url: "postgres://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres", ssl: "require" });
    expect(connectionConfig("postgresql://u:p@db.abc.supabase.co:5432/postgres").ssl).toBe("require");
  });

  it("المحلي بدون تشفير، وsslmode=disable يُحترم", () => {
    expect(connectionConfig("postgresql://postgres:postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
    expect(connectionConfig("postgresql://u:p@example.com/db?sslmode=disable").ssl).toBe(false);
  });
});
