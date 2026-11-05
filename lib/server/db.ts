import postgres from "postgres";

/**
 * اتصال مباشر بقاعدة البيانات (Supabase Postgres) من الخادم فقط.
 * نستخدمه بدل supabase-js في الخادم لأن استقبال القراءات يحتاج معاملة واحدة
 * (transaction) بعدة استعلامات، وهذا أسرع وأضمن من طلبات HTTP منفصلة.
 */
export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** يقبل الاتصال الرئيسي أو معاملة مفتوحة */
export type Db = postgres.ISql;

declare global {
  // eslint-disable-next-line no-var
  var __makhzoonSql: Sql | undefined;
}

/** رابط قاعدة البيانات: DATABASE_URL، أو POSTGRES_URL اللي يضيفه تكامل Supabase في Vercel تلقائيًا */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

/**
 * postgres.js يرسل أي معامل غير معروف في الرابط كإعداد للاتصال (مثل supa=base-pooler.x في روابط Vercel)
 * والخادم قد يرفضه، فنحذف المعاملات ونبقي sslmode فقط. الاتصال البعيد مشفّر افتراضيًا.
 */
export function connectionConfig(raw: string): { url: string; ssl: false | "require" | "verify-full" } {
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  const local = LOCAL_HOSTS.has(url.hostname);
  const ssl = sslmode === "disable" ? false : sslmode === "verify-full" ? "verify-full" : local && !sslmode ? false : "require";
  return { url: url.toString(), ssl };
}

export function createSql(rawUrl: string, options: { max?: number } = {}): Sql {
  const { url, ssl } = connectionConfig(rawUrl);
  return postgres(url, {
    ssl,
    // Supabase transaction pooler (6543) does not support prepared statements.
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: {
      // numeric → number (prices), date → 'YYYY-MM-DD' string, bigint → number (counts)
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  }) as unknown as Sql;
}

export function getSql(): Sql {
  if (!globalThis.__makhzoonSql) {
    const url = databaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    }
    globalThis.__makhzoonSql = createSql(url);
  }
  return globalThis.__makhzoonSql;
}
