/**
 * بناء النسخة اللي تشتغل داخل المتصفح (رابط claude.ai):
 *   node demo/build.mjs  →  demo-dist/index.html + demo-dist/assets/*
 * نفس شاشات المنصة وحساباتها وخادم الاستقبال والمحاكي، مع بدائل صغيرة في demo/shims
 * لقاعدة البيانات (PGlite) والبث اللحظي والتنقل.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const DEMO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEMO, "..");

const SHIMMED = new Map([
  [path.join(ROOT, "lib/server/db.ts"), path.join(DEMO, "shims/db.ts")],
  [path.join(ROOT, "lib/client/api.ts"), path.join(DEMO, "shims/api.ts")],
  [path.join(ROOT, "lib/client/supabase.ts"), path.join(DEMO, "shims/realtime.ts")],
]);

function browserShims(): Plugin {
  return {
    name: "makhzoon-browser-shims",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source === "next/link") return path.join(DEMO, "shims/next-link.tsx");
      if (source === "next/navigation") return path.join(DEMO, "shims/next-navigation.ts");
      if (source === "node:crypto") return path.join(DEMO, "shims/node-crypto.ts");
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && SHIMMED.has(resolved.id)) return SHIMMED.get(resolved.id);
      return null;
    },
  };
}

export default defineConfig({
  root: DEMO,
  base: "./",
  publicDir: false,
  plugins: [browserShims()],
  resolve: { alias: [{ find: /^@\//, replacement: `${ROOT}/` }] },
  esbuild: { jsx: "automatic" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env": "{}",
  },
  css: { postcss: ROOT },
  build: {
    outDir: path.join(ROOT, "demo-dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: path.join(DEMO, "main.tsx"),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/app.js",
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith(".css") ? "assets/app.css" : "assets/[name][extname]"),
      },
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return; // "use client"
        warn(warning);
      },
    },
  },
});
