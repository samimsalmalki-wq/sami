/**
 * محاكي RFID من سطر الأوامر. يرسل قراءات بنفس صيغة الأجهزة الحقيقية إلى POST /api/rfid/reads
 * مع مفتاح X-Device-Key، وفيها قراءات مكررة وهوائيان لتجربة الفلترة وتحديد الاتجاه.
 *
 *   npm run sim -- live        حركة مستمرة: قراءة كل 1.5 ثانية حتى Ctrl+C
 *   npm run sim -- short       وصول شحنة ناقصة (PO-2291)
 *   npm run sim -- theft       خروج سماعات ×2 من المخرج الخلفي (G5)
 *   npm run sim -- dispatch    شحن طلب SO-5512 لفرع
 *   npm run sim -- heartbeat   نبضة اتصال لكل البوابات
 *
 * خيارات: --url http://localhost:3000   --interval 1500
 */
import { requireEnv } from "./env";
import { createSql } from "@/lib/server/db";
import { runScenario, type ScenarioName, type SimContext } from "@/lib/simulator/scenarios";
import type { WireRead } from "@/lib/simulator/passes";

const COMMANDS: Record<string, ScenarioName | "live" | "heartbeat"> = {
  live: "live",
  short: "short_shipment",
  theft: "unauthorized_exit",
  dispatch: "dispatch",
  heartbeat: "heartbeat",
};

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = COMMANDS[process.argv[2] ?? ""];
  if (!command) {
    console.log("الاستخدام: npm run sim -- <live|short|theft|dispatch|heartbeat> [--url http://localhost:3000] [--interval 1500]");
    process.exit(1);
  }
  const baseUrl = (option("url") ?? process.env.SIMULATOR_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const deviceKey = requireEnv("RFID_DEVICE_KEY");
  const interval = Number(option("interval") ?? 1500);
  const sql = createSql(requireEnv("DATABASE_URL"), { max: 2 });

  let raw = 0;
  let duplicates = 0;
  const send = async (gateId: string, reads: WireRead[]) => {
    const res = await fetch(`${baseUrl}/api/rfid/reads`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-key": deviceKey },
      body: JSON.stringify({ gate_id: gateId, reads }),
    });
    const body = (await res.json().catch(() => ({}))) as { duplicates?: number; error?: string };
    if (!res.ok) throw new Error(`${res.status} ${body.error ?? res.statusText}`);
    raw += reads.length;
    duplicates += body.duplicates ?? 0;
    return body;
  };

  const ctx: SimContext = {
    sql,
    send,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    rng: Math.random,
    now: () => new Date(),
    receiptIdleMs: Number(process.env.RECEIPT_IDLE_SECONDS ?? 3) * 1000,
    log: (m) => console.log(`  ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" })}  ${m}`),
  };

  try {
    if (command === "heartbeat") {
      for (const gate of ["G1", "G2", "G3", "G4", "G5"]) await send(gate, []);
      console.log("✓ أُرسلت نبضة لكل البوابات");
    } else if (command === "live") {
      console.log(`▶ الحركة المستمرة إلى ${baseUrl} كل ${interval} مللي ثانية (Ctrl+C للإيقاف)`);
      let running = true;
      process.on("SIGINT", () => {
        running = false;
      });
      while (running) {
        const started = Date.now();
        await runScenario("live_step", ctx);
        await ctx.sleep(Math.max(0, interval - (Date.now() - started)));
      }
    } else {
      const result = await runScenario(command, ctx);
      console.log(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
    }
    console.log(`القراءات الخام المرسلة: ${raw} · المكرر المُرشَّح في الخادم: ${duplicates}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
