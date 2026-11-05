/**
 * تشغيل قاعدة البيانات داخل المتصفح: تحميل Postgres (WebAssembly)، تطبيق نفس ملف الترحيل،
 * مشغّلات NOTIFY بدل Supabase Realtime، ثم نفس البيانات التجريبية (lib/server/seed.ts).
 */
import migrationSql from "../supabase/migrations/20261105000000_init.sql?raw";
import { seedDemoData } from "@/lib/server/seed";
import { getSql, openDatabase } from "./shims/db";
import { emitChange, setRealtimeMuted } from "./shims/realtime";

const NOTIFY_SQL = `
create or replace function public.makhzoon_notify() returns trigger language plpgsql as $$
begin
  perform pg_notify('makhzoon_changes', json_build_object('table', tg_table_name, 'eventType', tg_op, 'new', row_to_json(new))::text);
  return new;
end
$$;
create trigger movements_notify after insert or update on public.movements for each row execute function public.makhzoon_notify();
create trigger alerts_notify after insert or update on public.alerts for each row execute function public.makhzoon_notify();
`;

// ملفات Postgres مضغوطة (gzip) ومحفوظة كنص base64: أنواع الملفات اللي تخدمها صفحة claude.ai محددة،
// والضغط ينزّل حجم التحميل من حوالي 17 إلى 7 ميجابايت
const ASSETS = ["assets/pglite.wasm.gz.txt", "assets/initdb.wasm.gz.txt", "assets/pglite.data.gz.txt"] as const;

type Report = (message: string, progress?: number) => void;

/** نص base64 لملف gzip → البايتات الأصلية */
async function unpack(text: ArrayBuffer): Promise<ArrayBuffer> {
  const binary = atob(new TextDecoder().decode(text).trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function download(path: string, onBytes: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`تعذر تحميل ${path} (${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export async function bootDatabase(report: Report) {
  if (typeof WebAssembly === "undefined") throw new Error("هذا المتصفح ما يدعم WebAssembly");
  if (typeof DecompressionStream === "undefined") throw new Error("هذا المتصفح ما يدعم فك الضغط (DecompressionStream)");

  // حجم الملفات تقريبي للعرض فقط؛ النسبة تُحسب من البايتات الفعلية لما يرسلها الخادم
  const expected = [4_604_000, 196_600, 2_852_000];
  const loaded = [0, 0, 0];
  const update = () => {
    const sum = loaded.reduce((s, x) => s + x, 0);
    const all = expected.reduce((s, x) => s + x, 0);
    report("تحميل قاعدة البيانات…", Math.min(0.9, (sum / all) * 0.9));
  };
  const [pgliteBytes, initdbBytes, dataBytes] = await Promise.all(
    ASSETS.map((path, i) =>
      download(path, (n, total) => {
        loaded[i] = n;
        if (total) expected[i] = total;
        update();
      }),
    ),
  );

  report("تشغيل Postgres داخل المتصفح…", 0.92);
  const [pgliteWasm, initdbWasm, fsData] = await Promise.all([unpack(pgliteBytes!), unpack(initdbBytes!), unpack(dataBytes!)]);
  const [pglite, initdb] = await Promise.all([WebAssembly.compile(pgliteWasm), WebAssembly.compile(initdbWasm)]);
  const pg = await openDatabase({ pglite, initdb, fsBundle: new Blob([fsData]) });

  report("إنشاء الجداول…", 0.95);
  await pg.exec(migrationSql);
  await pg.exec(NOTIFY_SQL);
  await pg.listen("makhzoon_changes", (payload) => {
    try {
      emitChange(JSON.parse(payload));
    } catch {
      // إشعار تالف: الاستعلامات الدورية تلحق التغيير
    }
  });

  report("تعبئة البيانات التجريبية…", 0.98);
  await seedDemoData(getSql());
  report("جاهز", 1);
}

/** يرجع البيانات لحالتها الأولى (نفس npm run db:seed) */
export async function resetDemoData() {
  setRealtimeMuted(true);
  try {
    await seedDemoData(getSql());
  } finally {
    // الإشعارات المتأخرة من الإدراجات الكثيرة تُتجاهل، والواجهة تُحدَّث مرة وحدة بعدها
    window.setTimeout(() => setRealtimeMuted(false), 400);
  }
}
