/**
 * node demo/build.mjs
 * يبني النسخة اللي تشتغل داخل المتصفح في demo-dist/: صفحة index.html (جزء الصفحة كما يتطلبه claude.ai)
 * وملفات assets/ (السكربت، التنسيقات، وPostgres بصيغة WebAssembly). test.html نسخة كاملة للتجربة محليًا.
 */
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const DEMO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEMO, "..");
const OUT = path.join(ROOT, "demo-dist");

await build({ configFile: path.join(DEMO, "vite.config.ts"), logLevel: "warn" });

// ملفات PGlite: مضغوطة gzip ومحفوظة كنص base64 (.gz.txt)، لأن صفحة claude.ai تخدم أنواع ملفات محددة
// ولا تقبل .data، والضغط يقلل التحميل للنصف تقريبًا. Vite ينسخ النسخ الخام من مراجع المكتبة فنحذفها.
const pgliteDist = path.join(ROOT, "node_modules/@electric-sql/pglite/dist");
for (const file of ["pglite.wasm", "initdb.wasm", "pglite.data"]) {
  const raw = await readFile(path.join(pgliteDist, file));
  await writeFile(path.join(OUT, "assets", `${file}.gz.txt`), gzipSync(raw, { level: 9 }).toString("base64"));
  await rm(path.join(OUT, "assets", file), { force: true });
}

const page = await readFile(path.join(DEMO, "page.html"), "utf8");
await writeFile(path.join(OUT, "index.html"), page);
await writeFile(
  path.join(OUT, "test.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}\n</body></html>`,
);

for (const file of ["index.html", "assets/app.js", "assets/app.css", "assets/pglite.wasm.gz.txt", "assets/initdb.wasm.gz.txt", "assets/pglite.data.gz.txt"]) {
  const { size } = await stat(path.join(OUT, file));
  console.log(`${file.padEnd(28)} ${(size / 1024).toFixed(0).padStart(7)} KB`);
}
