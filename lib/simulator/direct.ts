import type { Sql } from "@/lib/server/db";
import { ingestReads, readsPayloadSchema, receiptIdleMsFromEnv } from "@/lib/server/ingest";
import type { SimContext } from "./scenarios";

/**
 * سياق المحاكي داخل الخادم (أزرار السيناريوهات في الواجهة):
 * يرسل القراءات لنفس دالة خادم الاستقبال وبنفس التحقق من الصيغة، بدون المرور بالشبكة.
 */
export function directContext(sql: Sql): SimContext {
  return {
    sql,
    send: (gateId, reads) => ingestReads(sql, readsPayloadSchema.parse({ gate_id: gateId, reads })),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    rng: Math.random,
    now: () => new Date(),
    receiptIdleMs: receiptIdleMsFromEnv(),
  };
}

export function simulatorEnabled(): boolean {
  return process.env.SIMULATOR_ENABLED === "true";
}
