/**
 * npm run db:seed
 * البيانات التجريبية من النموذج الأولي: 13 صنفًا، المناطق، البوابات الخمس، 12 أسبوع مبيعات،
 * الدفعات وتواريخ الانتهاء، بطاقات RFID، أوامر الشراء والصرف للسيناريوهات، وحركة اليوم.
 * يمسح الجداول ويعبئها من جديد (آمن للتكرار قبل كل عرض).
 */
import { randomUUID } from "node:crypto";
import { requireEnv } from "./env";
import { addDays, buildEpc, riyadhDate, riyadhDayStart, weekdayOf } from "@/lib/inventory";
import { syncDerivedAlerts } from "@/lib/server/alerts-sync";
import { createSql } from "@/lib/server/db";
import { generatePass, type WireRead } from "@/lib/simulator/passes";
import { createRng } from "@/lib/simulator/rng";

const NOW = new Date();
const TODAY = riyadhDate(NOW);
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

// ── المناطق والبوابات ───────────────────────────────────────────────────
const ZONES = [
  { id: "RCV", name_ar: "منطقة الاستلام", type: "receiving" },
  { id: "A", name_ar: "مستودع A", type: "storage" },
  { id: "B", name_ar: "مستودع B", type: "storage" },
  { id: "C", name_ar: "مستودع C", type: "storage" },
  { id: "COLD", name_ar: "غرفة التبريد", type: "cold" },
  { id: "CAGE", name_ar: "قفص القيمة العالية", type: "high_value" },
  { id: "FLOOR", name_ar: "صالة البيع", type: "sales_floor" },
];

// to_zone = جهة الهوائي الداخلي A، from_zone = جهة الهوائي الخارجي B (null = خارج المستودع)
const GATES = [
  { id: "G1", name_ar: "بوابة الاستلام", type: "inbound", from_zone_id: null, to_zone_id: "RCV", reader_ip: "10.0.10.11" },
  { id: "G2", name_ar: "بوابة الشحن", type: "outbound", from_zone_id: null, to_zone_id: "B", reader_ip: "10.0.10.12" },
  { id: "G3", name_ar: "بوابة غرفة التبريد", type: "transfer", from_zone_id: "RCV", to_zone_id: "COLD", reader_ip: "10.0.10.13" },
  { id: "G4", name_ar: "بوابة صالة البيع", type: "transfer", from_zone_id: "FLOOR", to_zone_id: "B", reader_ip: "10.0.10.14" },
  { id: "G5", name_ar: "المخرج الخلفي", type: "restricted", from_zone_id: null, to_zone_id: "C", reader_ip: "10.0.10.15" },
];

const SUPPLIERS = {
  dairy: { id: randomUUID(), name_ar: "مورد الألبان المركزي" },
  water: { id: randomUUID(), name_ar: "شركة المياه الصافية" },
  oil: { id: randomUUID(), name_ar: "مؤسسة الزيوت النباتية" },
  food: { id: randomUUID(), name_ar: "مورد المواد الغذائية" },
  care: { id: randomUUID(), name_ar: "شركة العناية الشخصية" },
};

// ── الأصناف (من النموذج الأولي) ─────────────────────────────────────────
// batches: [رقم الدفعة, الكمية, ينتهي بعد كم يوم (null = بدون انتهاء), استُلم قبل كم يوم]
// base/trend يولّدان مبيعات 12 أسبوع بنفس معادلة النموذج الأولي.
type BatchSeed = [lot: string, qty: number, expiresInDays: number | null, receivedDaysAgo: number];
interface ProductSeed {
  sku: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  pack_size: number;
  lead_time_days: number;
  zone: string;
  shelf_life_days: number | null;
  base: number;
  trend: number;
  tagLevel: "item" | "carton";
  batches: BatchSeed[];
}

const PRODUCTS: ProductSeed[] = [
  { sku: "1A01", name_ar: "حليب طازج 1 لتر", name_en: "Fresh milk 1L", category: "dairy", unit_cost: 4.9, unit_price: 6.5, pack_size: 12, lead_time_days: 2, zone: "COLD", shelf_life_days: 9, base: 140, trend: 0.08, tagLevel: "carton", batches: [["L-1103", 18, 2, 5], ["L-1107", 20, 6, 2]] },
  { sku: "1A02", name_ar: "لبن 2 لتر", name_en: "Laban 2L", category: "dairy", unit_cost: 7.4, unit_price: 9.75, pack_size: 8, lead_time_days: 2, zone: "COLD", shelf_life_days: 14, base: 80, trend: 0.05, tagLevel: "carton", batches: [["L-1029", 40, 2, 8], ["L-1104", 56, 11, 1]] },
  { sku: "1A03", name_ar: "عصير برتقال 1 لتر", name_en: "Orange juice 1L", category: "beverages", unit_cost: 5.2, unit_price: 7.25, pack_size: 6, lead_time_days: 3, zone: "COLD", shelf_life_days: 20, base: 40, trend: 0.1, tagLevel: "carton", batches: [["L-1020", 24, 3, 16], ["L-1101", 30, 9, 4]] },
  { sku: "2B01", name_ar: "قهوة عربية 500 غ", name_en: "Arabic coffee 500g", category: "coffee", unit_cost: 27.5, unit_price: 38, pack_size: 12, lead_time_days: 10, zone: "A", shelf_life_days: 365, base: 46, trend: 0.35, tagLevel: "carton", batches: [["L-0820", 210, 200, 77]] },
  { sku: "2B02", name_ar: "تمر سكري 1 كغ", name_en: "Sukkari dates 1kg", category: "dates", unit_cost: 23, unit_price: 32, pack_size: 10, lead_time_days: 10, zone: "A", shelf_life_days: 240, base: 36, trend: 0.25, tagLevel: "carton", batches: [["L-0915", 160, 140, 51]] },
  { sku: "2B03", name_ar: "أرز بسمتي 5 كغ", name_en: "Basmati rice 5kg", category: "food", unit_cost: 41, unit_price: 54, pack_size: 4, lead_time_days: 7, zone: "B", shelf_life_days: null, base: 50, trend: 0.02, tagLevel: "carton", batches: [["L-1012", 55, null, 24]] },
  { sku: "2B04", name_ar: "زيت دوار الشمس 1.8 لتر", name_en: "Sunflower oil 1.8L", category: "food", unit_cost: 15.5, unit_price: 21, pack_size: 6, lead_time_days: 7, zone: "B", shelf_life_days: null, base: 30, trend: 0, tagLevel: "carton", batches: [["L-1021", 104, null, 15]] },
  { sku: "2B05", name_ar: "مياه 330 مل (40 عبوة)", name_en: "Water 330ml x40", category: "beverages", unit_cost: 12.5, unit_price: 18, pack_size: 10, lead_time_days: 3, zone: "B", shelf_life_days: null, base: 120, trend: -0.05, tagLevel: "carton", batches: [["L-1030", 250, null, 6]] },
  { sku: "3C01", name_ar: "مناديل (5 علب)", name_en: "Tissues 5-pack", category: "paper", unit_cost: 10.8, unit_price: 16, pack_size: 6, lead_time_days: 7, zone: "C", shelf_life_days: null, base: 25, trend: 0, tagLevel: "carton", batches: [["L-0905", 520, null, 61]] },
  { sku: "3C02", name_ar: "معجون أسنان 100 مل", name_en: "Toothpaste 100ml", category: "personal_care", unit_cost: 8.2, unit_price: 12.5, pack_size: 12, lead_time_days: 7, zone: "FLOOR", shelf_life_days: null, base: 22, trend: 0.03, tagLevel: "carton", batches: [["L-1015", 66, null, 21]] },
  { sku: "4D01", name_ar: "شاحن USB-C سريع", name_en: "Fast USB-C charger", category: "electronics", unit_cost: 52, unit_price: 79, pack_size: 5, lead_time_days: 14, zone: "CAGE", shelf_life_days: null, base: 9, trend: 0.15, tagLevel: "item", batches: [["L-1008", 18, null, 28]] },
  { sku: "4D02", name_ar: "سماعات لاسلكية", name_en: "Wireless earbuds", category: "electronics", unit_cost: 185, unit_price: 249, pack_size: 4, lead_time_days: 14, zone: "CAGE", shelf_life_days: null, base: 6, trend: 0.1, tagLevel: "item", batches: [["L-1008", 12, null, 28]] },
  { sku: "3C03", name_ar: "مروحة مكتبية", name_en: "Desk fan", category: "home_appliances", unit_cost: 61, unit_price: 89, pack_size: 2, lead_time_days: 14, zone: "C", shelf_life_days: null, base: 2, trend: -3, tagLevel: "carton", batches: [["L-0601", 85, null, 157]] },
];

// توزيع المبيعات على أيام الأسبوع (الأحد … السبت): الخميس والجمعة أعلى
const WEEKDAY_WEIGHTS = [0.92, 0.9, 0.92, 0.98, 1.18, 1.2, 0.9];

/** يوزع إجمالي الأسبوع على 7 أيام بحيث يبقى المجموع نفسه */
function splitWeek(total: number, dates: string[]): number[] {
  const weights = dates.map((d) => WEEKDAY_WEIGHTS[weekdayOf(d)] ?? 1);
  const sum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left--;
  }
  return floors;
}

async function main() {
  const sql = createSql(requireEnv("DATABASE_URL"), { max: 1 });
  const rng = createRng(11); // نفس بذرة النموذج الأولي → نفس المبيعات التاريخية
  const passRng = createRng(2026);

  try {
    await sql.begin(async (tx) => {
      await tx`truncate table count_lines, cycle_counts, alerts, forecasts, sales_daily, so_lines, sales_orders,
        po_lines, purchase_orders, movements, rfid_reads, rfid_tags, batches, gates, products, suppliers, zones, users
        restart identity cascade`;

      await tx`insert into zones ${tx(ZONES)}`;
      await tx`insert into suppliers ${tx(Object.values(SUPPLIERS))}`;
      await tx`insert into gates ${tx(GATES.map((g) => ({ ...g, is_online: true, last_seen_at: NOW })))}`;
      await tx`insert into users ${tx([
        { name: "عبدالله الحربي", role: "admin" },
        { name: "نورة العتيبي", role: "manager" },
        { name: "فهد الشمري", role: "storekeeper" },
        { name: "ماجد الدوسري", role: "security" },
        { name: "ريم الزهراني", role: "viewer" },
      ])}`;

      // ── الأصناف، المبيعات، الدفعات، البطاقات ────────────────────────────
      const products: Record<string, { id: string; seed: ProductSeed; nextSerial: () => number }> = {};
      const productRows: Record<string, unknown>[] = [];
      const salesRows: { product_id: string; date: string; units_sold: number }[] = [];
      const batchRows: {
        id: string;
        product_id: string;
        lot_number: string;
        quantity: number;
        expiry_date: string | null;
        received_at: Date;
        zone_id: string;
      }[] = [];
      const tagRows: {
        epc: string;
        product_id: string;
        batch_id: string;
        level: string;
        units: number;
        status: string;
        last_zone_id: string;
        last_seen_at: Date;
      }[] = [];
      const lastSalesDay = addDays(TODAY, -1);

      for (const p of PRODUCTS) {
        const id = randomUUID();
        productRows.push({
          id,
          sku: p.sku,
          name_ar: p.name_ar,
          name_en: p.name_en,
          category: p.category,
          unit_cost: p.unit_cost,
          unit_price: p.unit_price,
          pack_size: p.pack_size,
          lead_time_days: p.lead_time_days,
          default_zone_id: p.zone,
          has_expiry: p.shelf_life_days !== null,
          shelf_life_days: p.shelf_life_days,
        });

        // نفس معادلة النموذج الأولي لمبيعات 12 أسبوع (i = 0 الأقدم)
        const weekly: number[] = [];
        for (let i = 0; i < 12; i++) {
          weekly.push(Math.max(0, Math.round(p.base * (1 + p.trend * ((i - 11) / 11)) * (0.88 + rng() * 0.24))));
        }
        let serial = 0x00f2_0000 + 4096 + Math.floor(rng() * 30000);
        products[p.sku] = { id, seed: p, nextSerial: () => serial++ };

        weekly.forEach((total, i) => {
          const weekEnd = addDays(lastSalesDay, -7 * (11 - i));
          const dates = Array.from({ length: 7 }, (_, d) => addDays(weekEnd, d - 6));
          splitWeek(total, dates).forEach((units, d) => {
            salesRows.push({ product_id: id, date: dates[d]!, units_sold: units });
          });
        });

        for (const [lot, qty, expiresIn, receivedAgo] of p.batches) {
          const batchId = randomUUID();
          const receivedAt = daysAgo(receivedAgo);
          batchRows.push({
            id: batchId,
            product_id: id,
            lot_number: lot,
            quantity: qty,
            expiry_date: expiresIn === null ? null : addDays(TODAY, expiresIn),
            received_at: receivedAt,
            zone_id: p.zone,
          });
          for (const units of tagUnits(qty, p)) {
            tagRows.push({
              epc: buildEpc(p.sku, products[p.sku]!.nextSerial()),
              product_id: id,
              batch_id: batchId,
              level: p.tagLevel,
              units,
              status: "active",
              last_zone_id: p.zone,
              last_seen_at: receivedAt,
            });
          }
        }
      }

      await tx`insert into products ${tx(productRows)}`;
      await tx`insert into sales_daily ${tx(salesRows)}`;

      // ── حركة اليوم (سجل فقط: الكميات الحالية تعكسها مسبقًا) ──────────────
      const dayStart = riyadhDayStart(NOW).getTime();
      const windowStart = Math.max(dayStart + 10 * MIN_MS, NOW.getTime() - 150 * MIN_MS);
      const windowEnd = NOW.getTime() - 2 * MIN_MS;
      const span = Math.max(windowEnd - windowStart, 10 * MIN_MS);
      const at = (fraction: number) => new Date(windowStart + span * fraction);

      const moveRows: Record<string, unknown>[] = [];
      const readRows: Record<string, unknown>[] = [];
      const recordPass = (opts: {
        epc: string;
        sku: string;
        batchId: string | null;
        gate: string;
        direction: "in" | "out";
        units: number;
        time: Date;
        ref?: { type: "PO" | "SO"; id: string };
      }) => {
        const reads = generatePass(opts.epc, opts.direction, opts.time, passRng);
        const ids = reads.map(() => randomUUID());
        reads.forEach((r: WireRead, i) =>
          readRows.push({
            id: ids[i],
            epc: r.epc,
            gate_id: opts.gate,
            antenna: r.antenna,
            rssi: r.rssi,
            read_at: new Date(r.read_at),
            is_duplicate: i > 0,
          }),
        );
        moveRows.push({
          id: randomUUID(),
          read_id: ids[0],
          epc: opts.epc,
          product_id: products[opts.sku]!.id,
          batch_id: opts.batchId,
          gate_id: opts.gate,
          direction: opts.direction,
          units: opts.units,
          reference_type: opts.ref?.type ?? null,
          reference_id: opts.ref?.id ?? null,
          flag: null,
          created_at: opts.time,
        });
      };

      // استلام اليوم: PO-2287 مياه 60 وPO-2289 زيت 36 (دفعات جديدة، مطابقة بالكامل)
      const todayReceipts: [sku: string, po: string, cartons: number, fraction: number][] = [
        ["2B05", "PO-2287", 6, 0.12],
        ["2B04", "PO-2289", 6, 0.35],
      ];
      for (const [sku, po, cartons, fraction] of todayReceipts) {
        const p = products[sku]!;
        const batchId = randomUUID();
        const receivedAt = at(fraction);
        batchRows.push({
          id: batchId,
          product_id: p.id,
          lot_number: `L-${TODAY.slice(5, 7)}${TODAY.slice(8, 10)}-${po.slice(3)}`,
          quantity: cartons * p.seed.pack_size,
          expiry_date: null,
          received_at: receivedAt,
          zone_id: p.seed.zone,
        });
        for (let c = 0; c < cartons; c++) {
          const epc = buildEpc(sku, p.nextSerial());
          const time = new Date(receivedAt.getTime() + c * 4_000);
          tagRows.push({
            epc,
            product_id: p.id,
            batch_id: batchId,
            level: "carton",
            units: p.seed.pack_size,
            status: "active",
            last_zone_id: p.seed.zone,
            last_seen_at: time,
          });
          recordPass({ epc, sku, batchId, gate: "G1", direction: "in", units: p.seed.pack_size, time, ref: { type: "PO", id: po } });
        }
      }

      await tx`insert into batches ${tx(batchRows)}`;

      // شحنات اليوم المكتملة: SO-5509 وSO-5510 (بطاقات مصروفة)
      const shipped: [sku: string, so: string, cartons: number, fraction: number][] = [
        ["2B05", "SO-5509", 3, 0.22],
        ["2B01", "SO-5509", 1, 0.24],
        ["2B04", "SO-5510", 3, 0.55],
      ];
      for (const [sku, so, cartons, fraction] of shipped) {
        const p = products[sku]!;
        const batch = batchRows.find((b) => b.product_id === p.id)!;
        for (let c = 0; c < cartons; c++) {
          const epc = buildEpc(sku, p.nextSerial());
          const time = new Date(at(fraction).getTime() + c * 5_000);
          tagRows.push({
            epc,
            product_id: p.id,
            batch_id: batch.id,
            level: "carton",
            units: p.seed.pack_size,
            status: "sold",
            last_zone_id: p.seed.zone,
            last_seen_at: time,
          });
          recordPass({ epc, sku, batchId: batch.id, gate: "G2", direction: "out", units: p.seed.pack_size, time, ref: { type: "SO", id: so } });
        }
      }

      // نقل داخلي: دخول غرفة التبريد، وتعبئة أرفف صالة البيع
      const pickTags = (sku: string, count: number) =>
        tagRows.filter((t) => t.product_id === products[sku]!.id && t.status === "active").slice(0, count);
      const transfers: [sku: string, gate: string, direction: "in" | "out", count: number, from: number, to: number][] = [
        ["1A01", "G3", "in", 2, 0.05, 0.3],
        ["1A02", "G3", "in", 3, 0.3, 0.6],
        ["1A03", "G3", "in", 3, 0.6, 0.95],
        ["3C02", "G4", "out", 5, 0.4, 0.98],
      ];
      for (const [sku, gate, direction, count, from, to] of transfers) {
        pickTags(sku, count).forEach((tag, i) => {
          const fraction = from + ((to - from) * (i + 0.5)) / count;
          recordPass({ epc: tag.epc, sku, batchId: tag.batch_id, gate, direction, units: tag.units, time: at(fraction) });
        });
      }

      await tx`insert into rfid_tags ${tx(tagRows)}`;
      await tx`insert into rfid_reads ${tx(readRows)}`;
      await tx`insert into movements ${tx(moveRows)}`;

      // ── أوامر الشراء ───────────────────────────────────────────────────
      const id = (sku: string) => products[sku]!.id;
      const purchaseOrders: [po: string, supplier: string, status: string, lines: [sku: string, expected: number, received: number][]][] = [
        ["PO-2287", SUPPLIERS.water.id, "received", [["2B05", 60, 60]]],
        ["PO-2289", SUPPLIERS.oil.id, "received", [["2B04", 36, 36]]],
        // سيناريو «وصول شحنة ناقصة»: مطلوب حليب 48 ولبن 24 وعصير 36
        ["PO-2291", SUPPLIERS.dairy.id, "open", [["1A01", 48, 0], ["1A02", 24, 0], ["1A03", 36, 0]]],
        // شحنات صغيرة تصل أثناء «الحركة المستمرة»
        ["PO-2292", SUPPLIERS.oil.id, "open", [["2B04", 12, 0]]],
        ["PO-2293", SUPPLIERS.water.id, "open", [["2B05", 30, 0]]],
        ["PO-2294", SUPPLIERS.food.id, "open", [["2B03", 8, 0]]],
        ["PO-2295", SUPPLIERS.care.id, "open", [["3C02", 24, 0]]],
      ];
      for (const [po_number, supplier_id, status, lines] of purchaseOrders) {
        const [order] = await tx<{ id: string }[]>`
          insert into purchase_orders (po_number, supplier_id, status, expected_at, created_at)
          values (${po_number}, ${supplier_id}, ${status}, ${NOW}, ${daysAgo(3)})
          returning id`;
        await tx`insert into po_lines ${tx(
          lines.map(([sku, qty_expected, qty_received]) => ({ po_id: order!.id, product_id: id(sku), qty_expected, qty_received })),
        )}`;
      }

      // ── أوامر الصرف ────────────────────────────────────────────────────
      const salesOrders: [so: string, destination: string, status: string, lines: [sku: string, ordered: number, shipped: number][]][] = [
        ["SO-5509", "فرع حي الملقا", "shipped", [["2B05", 30, 30], ["2B01", 12, 12]]],
        ["SO-5510", "فرع حي الياسمين", "shipped", [["2B04", 18, 18]]],
        // سيناريو «شحن طلب لفرع»: مياه 40 وأرز 12 وقهوة 12
        ["SO-5512", "فرع حي النرجس", "open", [["2B05", 40, 0], ["2B03", 12, 0], ["2B01", 12, 0]]],
        // طلبات الفروع اللي تُشحن أثناء «الحركة المستمرة»
        ["SO-5513", "فرع حي الروضة", "open", [["2B05", 60, 0], ["2B04", 24, 0], ["3C02", 24, 0]]],
        ["SO-5514", "فرع حي العليا", "open", [["2B01", 24, 0], ["2B02", 20, 0], ["3C01", 60, 0]]],
        ["SO-5515", "فرع حي النخيل", "open", [["3C01", 60, 0], ["2B04", 12, 0], ["2B05", 40, 0]]],
      ];
      for (const [so_number, destination, status, lines] of salesOrders) {
        const [order] = await tx<{ id: string }[]>`
          insert into sales_orders (so_number, destination, status, created_at)
          values (${so_number}, ${destination}, ${status}, ${daysAgo(1)})
          returning id`;
        await tx`insert into so_lines ${tx(
          lines.map(([sku, qty_ordered, qty_shipped]) => ({ so_id: order!.id, product_id: id(sku), qty_ordered, qty_shipped })),
        )}`;
      }

      console.log(
        `✓ ${ZONES.length} مناطق · ${GATES.length} بوابات · ${PRODUCTS.length} صنف · ${batchRows.length} دفعة · ` +
          `${tagRows.length} بطاقة · ${salesRows.length} يوم مبيعات · ${moveRows.length} حركة و${readRows.length} قراءة خام اليوم`,
      );
    });

    const alerts = await syncDerivedAlerts(sql, NOW);
    console.log(`✓ التنبيهات: ${alerts.inserted} تنبيه مفتوح`);
  } finally {
    await sql.end();
  }
}

/** الكراتين الكاملة ثم كرتون مفتوح بالباقي، والإلكترونيات بطاقة لكل قطعة */
function tagUnits(qty: number, p: ProductSeed): number[] {
  if (p.tagLevel === "item") return new Array(qty).fill(1);
  const units = new Array(Math.floor(qty / p.pack_size)).fill(p.pack_size);
  if (qty % p.pack_size) units.push(qty % p.pack_size);
  return units;
}

main().catch((err) => {
  console.error("✗ فشلت تعبئة البيانات:", err);
  process.exit(1);
});
