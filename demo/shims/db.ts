/**
 * بديل lib/server/db.ts في النسخة اللي تشتغل داخل المتصفح:
 * نفس واجهة postgres.js اللي يستخدمها الخادم (sql`...`، sql(rows)، sql.begin، sql.unsafe)
 * فوق PGlite (Postgres كامل مترجم إلى WebAssembly). كود الخادم يشتغل بدون أي تعديل.
 */
import { PGlite, types, type Transaction } from "@electric-sql/pglite";
import type { Sql } from "@/lib/server/db";

export type { Db, Sql, Tx } from "@/lib/server/db";

type Row = Record<string, unknown>;
interface Executor {
  query(text: string, params: unknown[]): Promise<{ rows: Row[] }>;
  exec(text: string): Promise<unknown>;
  transaction?<T>(cb: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** قيمة مساعدة: sql(rows) للإدراج، sql(list) لـ in (...)، sql(columns) لأسماء الأعمدة */
class Helper {
  constructor(
    readonly value: unknown,
    readonly columns: string[] | undefined,
  ) {}
}

const quoteIdent = (name: string) => `"${String(name).replace(/"/g, '""')}"`;
const isPlainObject = (v: unknown): v is Row => typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v);

function serialize(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return v;
}

function expandHelper(h: Helper, before: string, param: (v: unknown) => string): string {
  const v = h.value;
  const prev = before.trimEnd().toLowerCase();
  if (Array.isArray(v) && v.length > 0 && isPlainObject(v[0])) {
    const cols = h.columns ?? Object.keys(v[0]);
    const rows = (v as Row[]).map((row) => `(${cols.map((c) => param(row[c])).join(", ")})`);
    return `(${cols.map(quoteIdent).join(", ")}) values ${rows.join(", ")}`;
  }
  if (isPlainObject(v)) {
    const cols = h.columns ?? Object.keys(v);
    return `(${cols.map(quoteIdent).join(", ")}) values (${cols.map((c) => param(v[c])).join(", ")})`;
  }
  if (Array.isArray(v)) {
    // بعد select أو returning: أسماء أعمدة، وغير كذا قائمة قيم لـ in (...)
    if (/(^|\s)(select|returning)$/.test(prev) || prev.endsWith(",")) return v.map((c) => quoteIdent(String(c))).join(", ");
    return `(${v.map((x) => param(x)).join(", ")})`;
  }
  if (typeof v === "string") return quoteIdent(v);
  throw new Error("unsupported sql helper value");
}

function build(strings: TemplateStringsArray, values: unknown[]) {
  const params: unknown[] = [];
  const param = (v: unknown) => {
    params.push(serialize(v));
    return `$${params.length}`;
  };
  let text = strings[0] ?? "";
  values.forEach((value, i) => {
    text += value instanceof Helper ? expandHelper(value, text, param) : param(value);
    text += strings[i + 1] ?? "";
  });
  return { text, params };
}

function makeSql(exec: Executor, root: PGlite | null): Sql {
  const fn = (first: unknown, ...rest: unknown[]) => {
    if (Array.isArray(first) && "raw" in (first as object)) {
      const { text, params } = build(first as unknown as TemplateStringsArray, rest);
      return exec.query(text, params).then((r) => r.rows);
    }
    return new Helper(first, rest.length ? (rest as string[]) : undefined);
  };
  Object.assign(fn, {
    unsafe: (text: string) => exec.exec(text).then(() => []),
    array: (v: unknown) => v,
    end: async () => {},
    begin: <T,>(cb: (tx: Sql) => Promise<T>) => {
      if (!root) throw new Error("nested transactions are not supported");
      return root.transaction((tx) => cb(makeSql(tx as unknown as Executor, null)));
    },
  });
  return fn as unknown as Sql;
}

let pg: PGlite | null = null;
let sqlInstance: Sql | null = null;

export async function openDatabase(assets: { pglite: WebAssembly.Module; initdb: WebAssembly.Module; fsBundle: Blob }) {
  pg = await PGlite.create({
    pgliteWasmModule: assets.pglite,
    initdbWasmModule: assets.initdb,
    fsBundle: assets.fsBundle,
    // نفس تحويلات الخادم: numeric وbigint أرقام، والتاريخ نص YYYY-MM-DD
    parsers: {
      [types.NUMERIC]: (x: string) => Number(x),
      [types.INT8]: (x: string) => Number(x),
      [types.DATE]: (x: string) => x,
    },
  });
  sqlInstance = makeSql(pg as unknown as Executor, pg);
  return pg;
}

export function getSql(): Sql {
  if (!sqlInstance) throw new Error("database is not ready");
  return sqlInstance;
}

export function createSql(): Sql {
  return getSql();
}

export function databaseUrl(): string | undefined {
  return "pglite://browser";
}
