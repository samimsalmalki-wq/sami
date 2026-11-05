import { formatCount, formatNumber } from "@/lib/format";
import { pickTagsFefo, shortShipmentLines } from "@/lib/inventory";
import type { Sql } from "@/lib/server/db";
import { passEndingAt, type PassKind, type WireRead } from "./passes";
import { pick } from "./rng";
import {
  activeTags,
  loadProducts,
  newEpc,
  openPurchaseLines,
  openSalesLines,
  resetPurchaseOrder,
  resetSalesOrder,
  type SimProduct,
  type SimTag,
} from "./world";

/**
 * سيناريوهات العرض (قسم «المحاكي» في المواصفات).
 * كل قراءة تُرسل بنفس صيغة الأجهزة الحقيقية إلى خادم الاستقبال، سواء من سطر الأوامر عبر HTTP
 * أو من أزرار الواجهة (نفس الدالة ingestReads على الخادم).
 *
 *   short_shipment     شحنة ناقصة: PO-2291 مطلوب حليب 48 ولبن 24 وعصير 36، يصل العصير 30 فقط
 *   unauthorized_exit  خروج بدون إذن: سماعات لاسلكية ×2 من G5
 *   dispatch           شحن طلب فرع: SO-5512 مياه 40 وأرز 12 وقهوة 12، مطابق بالكامل
 *   live_step          خطوة واحدة من «الحركة المستمرة» (تُكرر كل 1.5 ثانية)
 */

export const SCENARIOS = ["short_shipment", "unauthorized_exit", "dispatch", "live_step"] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export const SHORT_SHIPMENT_PO = "PO-2291";
/** الحركة المستمرة ما تمرر نفس البطاقة مرتين خلال هذه المدة */
const LIVE_COOLDOWN_S = 10;
export const DISPATCH_SO = "SO-5512";

export interface SimContext {
  sql: Sql;
  send: (gateId: string, reads: WireRead[]) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  rng: () => number;
  now: () => Date;
  receiptIdleMs: number;
  log?: (message: string) => void;
}

export interface ScenarioResult {
  ok: boolean;
  message: string;
}

export function isScenario(name: unknown): name is ScenarioName {
  return typeof name === "string" && (SCENARIOS as readonly string[]).includes(name);
}

export async function runScenario(name: ScenarioName, ctx: SimContext): Promise<ScenarioResult> {
  switch (name) {
    case "short_shipment":
      return shortShipment(ctx);
    case "unauthorized_exit":
      return unauthorizedExit(ctx);
    case "dispatch":
      return dispatch(ctx);
    case "live_step":
      return liveStep(ctx);
  }
}

async function passThrough(ctx: SimContext, gateId: string, epc: string, kind: PassKind, label: string) {
  await ctx.send(gateId, passEndingAt(epc, kind, ctx.now(), ctx.rng));
  ctx.log?.(`${gateId} ${kind === "in" ? "دخول" : kind === "out" ? "خروج" : "قراءة بهوائي واحد"} · ${label} · ${epc}`);
}

function requireProduct(products: Map<string, SimProduct>, sku: string): SimProduct {
  const p = products.get(sku);
  if (!p) throw new Error(`product ${sku} is missing; run npm run db:seed`);
  return p;
}

/** وصول شحنة ناقصة PO-2291 من بوابة الاستلام G1 */
async function shortShipment(ctx: SimContext): Promise<ScenarioResult> {
  const reset = await resetPurchaseOrder(ctx.sql, SHORT_SHIPMENT_PO);
  if (reset === "missing") return { ok: false, message: `أمر الشراء ${SHORT_SHIPMENT_PO} غير موجود. شغّل npm run db:seed.` };
  if (reset === "busy") return { ok: false, message: `الشحنة ${SHORT_SHIPMENT_PO} قيد الاستلام الآن.` };

  const products = await loadProducts(ctx.sql);
  // الواصل فعليًا: حليب 48 ولبن 24 كاملة، والعصير 30 من 36
  const arrivals: [sku: string, units: number][] = [
    ["1A01", 48],
    ["1A02", 24],
    ["1A03", 30],
  ];
  const reserved = new Set<string>();
  let cartons = 0;
  for (const [sku, units] of arrivals) {
    const product = requireProduct(products, sku);
    for (let i = 0; i < Math.round(units / product.pack_size); i++) {
      await passThrough(ctx, "G1", await newEpc(ctx.sql, sku, ctx.rng, reserved), "in", product.name_ar);
      cartons++;
      await ctx.sleep(260);
    }
  }

  // القارئ يرسل نبضة بعد ما تهدأ البوابة؛ الخادم يغلق الاستلام ويقارن بالمطلوب
  await ctx.sleep(ctx.receiptIdleMs + 300);
  await ctx.send("G1", []);

  const lines = await ctx.sql<{ name_ar: string; qty_expected: number; qty_received: number; unit_cost: number }[]>`
    select pr.name_ar, l.qty_expected, l.qty_received, pr.unit_cost
    from po_lines l join purchase_orders p on p.id = l.po_id join products pr on pr.id = l.product_id
    where p.po_number = ${SHORT_SHIPMENT_PO}`;
  const shortages = shortShipmentLines(
    lines.map((l) => ({ productName: l.name_ar, expected: l.qty_expected, received: l.qty_received, unitCost: l.unit_cost })),
  );
  const detail = shortages.map((s) => `${s.productName} ناقص ${formatNumber(s.shortage)}`).join("، ");
  return {
    ok: true,
    message: shortages.length
      ? `وصل ${formatCount(cartons, "كرتون", "كراتين")} من ${SHORT_SHIPMENT_PO}، وكُشف نقص: ${detail}`
      : `وصل ${formatCount(cartons, "كرتون", "كراتين")} من ${SHORT_SHIPMENT_PO} مطابقة بالكامل`,
  };
}

/** خروج بضاعة بدون إذن: سماعات لاسلكية ×2 من المخرج الخلفي G5 */
async function unauthorizedExit(ctx: SimContext): Promise<ScenarioResult> {
  const products = await loadProducts(ctx.sql);
  const earbuds = requireProduct(products, "4D02");
  const inCage = await activeTags(ctx.sql, { productId: earbuds.id, zones: ["CAGE"] });
  const tags = (inCage.length >= 2 ? inCage : await activeTags(ctx.sql, { productId: earbuds.id })).slice(0, 2);
  if (tags.length < 2) {
    return { ok: false, message: "ما بقى سماعات كافية في المخزون للسيناريو. أعد تعبئة البيانات (npm run db:seed)." };
  }
  for (const tag of tags) {
    await passThrough(ctx, "G5", tag.epc, "out", earbuds.name_ar);
    await ctx.sleep(500);
  }
  return { ok: true, message: `${earbuds.name_ar} ×2 خرجت من المخرج الخلفي (G5) بدون إذن` };
}

/** شحن طلب SO-5512 لفرع حي النرجس من بوابة الشحن G2، بترتيب FEFO */
async function dispatch(ctx: SimContext): Promise<ScenarioResult> {
  if ((await resetSalesOrder(ctx.sql, DISPATCH_SO)) === "missing") {
    return { ok: false, message: `أمر الصرف ${DISPATCH_SO} غير موجود. شغّل npm run db:seed.` };
  }
  const products = await loadProducts(ctx.sql);
  const order: [sku: string, units: number][] = [
    ["2B05", 40],
    ["2B03", 12],
    ["2B01", 12],
  ];
  let shipped = 0;
  let wanted = 0;
  for (const [sku, units] of order) {
    const product = requireProduct(products, sku);
    wanted += units;
    const picked = pickTagsFefo(await activeTags(ctx.sql, { productId: product.id }), units);
    for (const tag of picked) {
      await passThrough(ctx, "G2", tag.epc, "out", product.name_ar);
      shipped += tag.units;
      await ctx.sleep(240);
    }
  }
  const [so] = await ctx.sql<{ status: string; destination: string }[]>`
    select status, destination from sales_orders where so_number = ${DISPATCH_SO}`;
  return so?.status === "shipped"
    ? { ok: true, message: `شُحن ${DISPATCH_SO} إلى ${so.destination}: ${formatNumber(shipped)} وحدة مطابقة لأمر الصرف 100٪` }
    : { ok: false, message: `شُحن ${formatNumber(shipped)} من ${formatNumber(wanted)} وحدة فقط (المخزون غير كافٍ)` };
}

/** خطوة من «الحركة المستمرة»: حركة واقعية واحدة بدون أي خروج غير مصرح */
async function liveStep(ctx: SimContext): Promise<ScenarioResult> {
  const r = ctx.rng();
  if (r < 0.12 && (await liveDelivery(ctx))) return { ok: true, message: "استلام شحنة" };
  if (r < 0.38 && (await liveShipment(ctx))) return { ok: true, message: "شحن لفرع" };
  if (r < 0.58 && (await liveColdRoom(ctx))) return { ok: true, message: "غرفة التبريد" };
  if (r < 0.95 && (await liveSalesFloor(ctx))) return { ok: true, message: "صالة البيع" };
  // شخص مرّ جنب البوابة بكرتون: قراءة بهوائي واحد = اتجاه غير مؤكد
  const tag = pick(ctx.rng, await activeTags(ctx.sql, { zones: ["B"], excludeRecentSeconds: LIVE_COOLDOWN_S }));
  if (tag) await passThrough(ctx, "G4", tag.epc, "unconfirmed", "قراءة بهوائي واحد");
  return { ok: true, message: "اتجاه غير مؤكد" };
}

/** شحنة صغيرة كاملة لأمر شراء مفتوح (غير شحنة السيناريو) */
async function liveDelivery(ctx: SimContext): Promise<boolean> {
  const lines = await openPurchaseLines(ctx.sql, [SHORT_SHIPMENT_PO]);
  const po = pick(ctx.rng, [...new Set(lines.map((l) => l.po_number))]);
  if (!po) return false;
  const products = await loadProducts(ctx.sql);
  const reserved = new Set<string>();
  for (const line of lines.filter((l) => l.po_number === po)) {
    const product = requireProduct(products, line.sku);
    for (let i = 0; i < Math.ceil(line.remaining / line.pack_size); i++) {
      await passThrough(ctx, "G1", await newEpc(ctx.sql, line.sku, ctx.rng, reserved), "in", `${product.name_ar} · ${po}`);
      await ctx.sleep(250);
    }
  }
  return true;
}

/** كرتون لطلب فرع مفتوح، بترتيب FEFO وبدون تجاوز الباقي في أمر الصرف */
async function liveShipment(ctx: SimContext): Promise<boolean> {
  const lines = await openSalesLines(ctx.sql, [DISPATCH_SO]);
  for (const line of shuffle(ctx.rng, lines)) {
    const tags = await activeTags(ctx.sql, { productId: line.product_id, excludeRecentSeconds: LIVE_COOLDOWN_S });
    const [tag] = pickTagsFefo(tags, line.remaining);
    if (!tag) continue;
    await passThrough(ctx, "G2", tag.epc, "out", line.so_number);
    return true;
  }
  return false;
}

/** إدخال الكراتين المستلمة لغرفة التبريد، وإخراج بعضها للتجهيز */
async function liveColdRoom(ctx: SimContext): Promise<boolean> {
  const received = await coldTags(ctx, ["RCV"]);
  if (received.length && ctx.rng() < 0.7) {
    const tag = pick(ctx.rng, received)!;
    await passThrough(ctx, "G3", tag.epc, "in", "إلى غرفة التبريد");
    return true;
  }
  const inside = await coldTags(ctx, ["COLD"]);
  const tag = pick(ctx.rng, inside);
  if (!tag) return false;
  await passThrough(ctx, "G3", tag.epc, "out", "من غرفة التبريد");
  return true;
}

async function coldTags(ctx: SimContext, zones: string[]): Promise<SimTag[]> {
  const products = await loadProducts(ctx.sql);
  const cold = new Set([...products.values()].filter((p) => p.default_zone_id === "COLD").map((p) => p.id));
  return (await activeTags(ctx.sql, { zones, excludeRecentSeconds: LIVE_COOLDOWN_S })).filter((t) =>
    cold.has(t.product_id),
  );
}

/** تعبئة أرفف صالة البيع من مستودع B (خروج من جهة المستودع)، وأحيانًا مرتجع للمستودع */
async function liveSalesFloor(ctx: SimContext): Promise<boolean> {
  if (ctx.rng() < 0.2) {
    const back = pick(ctx.rng, await activeTags(ctx.sql, { zones: ["FLOOR"], excludeRecentSeconds: LIVE_COOLDOWN_S }));
    if (back) {
      await passThrough(ctx, "G4", back.epc, "in", "مرتجع من صالة البيع");
      return true;
    }
  }
  const tag = pick(ctx.rng, await activeTags(ctx.sql, { zones: ["B"], excludeRecentSeconds: LIVE_COOLDOWN_S }));
  if (!tag) return false;
  await passThrough(ctx, "G4", tag.epc, "out", "تعبئة الأرفف");
  return true;
}

function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
