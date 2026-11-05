import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEDUPE_WINDOW_MS,
  SECURITY_INCIDENT_WINDOW_MS,
  addDays,
  allocateFefo,
  gateEffect,
  isOrderComplete,
  normalizeEpc,
  pickPurchaseLine,
  pickSalesLine,
  processReads,
  productCodeFromEpc,
  receiptLotNumber,
  riyadhDate,
  shortShipmentAlert,
  shortShipmentLines,
  unauthorizedExitAlert,
  zoneAfterPass,
  type Antenna,
  type Direction,
  type GateType,
  type PassSession,
  type RawRead,
} from "@/lib/inventory";
import { syncDerivedAlerts } from "./alerts-sync";
import type { Sql, Tx } from "./db";

/**
 * خادم الاستقبال: POST /api/rfid/reads
 *
 *   القراءات الخام → فلترة المكرر وتحديد الاتجاه (lib/inventory/reads)
 *                  → محرك القواعد: أثر البوابة، مطابقة PO وSO، خصم FEFO، التنبيهات
 *                  → قاعدة البيانات → Realtime للوحة
 *
 * كل دفعة قراءات تُعالج في معاملة واحدة مع قفل على البوابة، فما تتداخل دفعتان لنفس البوابة.
 */

/** قيمة بديلة للقوائم الفاضية في `in (...)`، ما تطابق أي صف */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const readsPayloadSchema = z.object({
  gate_id: z.string().trim().min(1).max(32),
  reads: z
    .array(
      z.object({
        epc: z.string().min(1).max(80),
        antenna: z
          .string()
          .transform((s) => s.trim().toUpperCase())
          .pipe(z.enum(["A", "B"])),
        rssi: z.number().int().min(-128).max(0).nullish(),
        read_at: z.iso.datetime({ offset: true }),
      }),
    )
    .max(2000),
});

export type ReadsPayload = z.infer<typeof readsPayloadSchema>;

export interface IngestResult {
  gate_id: string;
  /** قراءات خام حُفظت */
  accepted: number;
  /** منها مكرر (is_duplicate) */
  duplicates: number;
  /** مرورات جديدة تحولت إلى حركات */
  movements: number;
  /** حركات تأكد اتجاهها في هذه الدفعة */
  confirmed: number;
  /** EPC غير صالح */
  ignored: number;
  /** EPC صالح لكن ما يطابق أي صنف (يُحفظ خامًا فقط) */
  unknown: number;
  receipts_closed: { po_number: string; status: "received" | "short" }[];
  stock_changed: boolean;
}

export class IngestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface IngestOptions {
  now?: Date;
  /** مهلة إغلاق استلام أمر الشراء بدون قراءات جديدة */
  receiptIdleMs?: number;
}

export function receiptIdleMsFromEnv(): number {
  const seconds = Number(process.env.RECEIPT_IDLE_SECONDS ?? 3);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3000;
}

/** نقطة الدخول: معاملة للقراءات، ثم مزامنة التنبيهات المشتقة إذا تغيّر المخزون */
export async function ingestReads(sql: Sql, payload: ReadsPayload, opts: IngestOptions = {}): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const receiptIdleMs = opts.receiptIdleMs ?? receiptIdleMsFromEnv();
  const result = await sql.begin((tx) => ingestReadsTx(tx, payload, { now, receiptIdleMs }));
  if (result.stock_changed || result.receipts_closed.length > 0) {
    try {
      await syncDerivedAlerts(sql, now);
    } catch (err) {
      // القراءات محفوظة؛ التنبيهات تتزامن مع الدفعة التالية
      console.error("alerts sync failed", err);
    }
  }
  return result;
}

interface GateRow {
  id: string;
  name_ar: string;
  type: GateType;
  from_zone_id: string | null;
  to_zone_id: string | null;
}

interface TagRow {
  epc: string;
  product_id: string;
  batch_id: string | null;
  units: number;
  status: "active" | "sold" | "missing" | "damaged";
  last_zone_id: string | null;
}

interface ProductRow {
  id: string;
  sku: string;
  name_ar: string;
  pack_size: number;
  unit_cost: number;
  has_expiry: boolean;
  shelf_life_days: number | null;
  default_zone_id: string | null;
}

interface MovementRow {
  id: string;
  epc: string;
  product_id: string;
  units: number;
  created_at: Date;
}

export async function ingestReadsTx(
  tx: Tx,
  payload: ReadsPayload,
  opts: { now: Date; receiptIdleMs: number },
): Promise<IngestResult> {
  const { now } = opts;
  await tx`select pg_advisory_xact_lock(hashtext(${`makhzoon:gate:${payload.gate_id}`}))`;

  const [gate] = await tx<GateRow[]>`
    select id, name_ar, type, from_zone_id, to_zone_id from gates where id = ${payload.gate_id}`;
  if (!gate) throw new IngestError("unknown_gate", 404, `Unknown gate: ${payload.gate_id}`);
  await tx`update gates set is_online = true, last_seen_at = ${now} where id = ${gate.id}`;

  const result: IngestResult = {
    gate_id: gate.id,
    accepted: 0,
    duplicates: 0,
    movements: 0,
    confirmed: 0,
    ignored: 0,
    unknown: 0,
    receipts_closed: await closeIdleReceipts(tx, now, opts.receiptIdleMs),
    stock_changed: false,
  };

  const reads: RawRead[] = [];
  for (const r of payload.reads) {
    const epc = normalizeEpc(r.epc);
    if (!epc) {
      result.ignored++;
      continue;
    }
    reads.push({ epc, antenna: r.antenna, rssi: r.rssi ?? null, readAt: new Date(r.read_at) });
  }
  // دفعة فاضية = نبضة اتصال من القارئ
  if (reads.length === 0) return result;

  const epcs = [...new Set(reads.map((r) => r.epc))];
  const earliest = Math.min(...reads.map((r) => r.readAt.getTime()));

  // المرورات المفتوحة على هذه البوابة: آخر قراءة أولى لكل بطاقة خلال نافذة الفلترة
  const sessionRows = await tx<
    { epc: string; read_at: Date; antenna: Antenna; movement_id: string | null; direction: Direction | null }[]
  >`
    select distinct on (r.epc) r.epc, r.read_at, r.antenna, m.id as movement_id, m.direction
    from rfid_reads r
    left join movements m on m.read_id = r.id
    where r.gate_id = ${gate.id}
      and r.epc in ${tx(epcs)}
      and not r.is_duplicate
      and r.read_at > ${new Date(earliest - DEDUPE_WINDOW_MS)}
    order by r.epc, r.read_at desc`;

  const known = new Map<string, PassSession>();
  for (const s of sessionRows) {
    known.set(s.epc, {
      key: s.movement_id ?? `none:${s.epc}`,
      epc: s.epc,
      startedAt: new Date(s.read_at),
      firstAntenna: s.antenna,
      direction: s.direction,
    });
  }

  const tags = await tx<TagRow[]>`
    select epc, product_id, batch_id, units, status, last_zone_id from rfid_tags where epc in ${tx(epcs)}`;
  const tagBy = new Map(tags.map((t) => [t.epc, t]));
  const codes = [...new Set(epcs.filter((e) => !tagBy.has(e)).map(productCodeFromEpc))].filter(
    (c): c is string => !!c,
  );
  const productIds = [...new Set(tags.map((t) => t.product_id))];
  const products = await tx<ProductRow[]>`
    select id, sku, name_ar, pack_size, unit_cost, has_expiry, shelf_life_days, default_zone_id
    from products
    where id in ${tx(productIds.length ? productIds : [NIL_UUID])} or sku in ${tx(codes.length ? codes : [""])}`;
  const productById = new Map(products.map((p) => [p.id, p]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const { decisions } = processReads(reads, known, () => randomUUID());

  const readRows: Record<string, unknown>[] = [];
  const movementRows: Record<string, unknown>[] = [];
  const confirmations: { movementId: string; direction: Direction }[] = [];

  for (const d of decisions) {
    const readId = randomUUID();
    readRows.push({
      id: readId,
      epc: d.read.epc,
      gate_id: gate.id,
      antenna: d.read.antenna,
      rssi: d.read.rssi,
      read_at: d.read.readAt,
      is_duplicate: d.kind === "duplicate",
    });

    if (d.kind === "primary") {
      const tag = tagBy.get(d.read.epc);
      const product = tag ? productById.get(tag.product_id) : productBySku.get(productCodeFromEpc(d.read.epc) ?? "");
      if (!product) {
        result.unknown++;
        continue;
      }
      movementRows.push({
        id: d.session.key,
        read_id: readId,
        epc: d.read.epc,
        product_id: product.id,
        batch_id: tag?.batch_id ?? null,
        gate_id: gate.id,
        direction: null,
        units: tag?.units ?? product.pack_size,
        reference_type: null,
        reference_id: null,
        flag: "unconfirmed",
        created_at: d.read.readAt < now ? d.read.readAt : now,
      });
    } else {
      result.duplicates++;
      if (d.confirms && !d.session.key.startsWith("none:")) {
        confirmations.push({ movementId: d.session.key, direction: d.confirms });
      }
    }
  }

  result.accepted = readRows.length;
  result.movements = movementRows.length;
  await tx`insert into rfid_reads ${tx(readRows)}`;
  if (movementRows.length) await tx`insert into movements ${tx(movementRows)}`;

  for (const c of confirmations) {
    const changed = await confirmMovement(tx, gate, c.movementId, c.direction, now);
    if (changed === null) continue;
    result.confirmed++;
    if (changed) result.stock_changed = true;
  }

  return result;
}

/**
 * يطبّق أثر البوابة على حركة تأكد اتجاهها.
 * يرجع true إذا تغيّرت كميات المخزون، false إذا ما تغيّرت، null إذا الحركة ما تنتظر تأكيد.
 */
async function confirmMovement(
  tx: Tx,
  gate: GateRow,
  movementId: string,
  direction: Direction,
  now: Date,
): Promise<boolean | null> {
  const [mv] = await tx<MovementRow[]>`
    select id, epc, product_id, units, created_at from movements
    where id = ${movementId} and direction is null
    for update`;
  if (!mv) return null;

  const [tag] = await tx<TagRow[]>`
    select epc, product_id, batch_id, units, status, last_zone_id from rfid_tags where epc = ${mv.epc} for update`;
  const [product] = await tx<ProductRow[]>`
    select id, sku, name_ar, pack_size, unit_cost, has_expiry, shelf_life_days, default_zone_id
    from products where id = ${mv.product_id}`;
  if (!product) return null;

  const finish = (fields: {
    flag?: string | null;
    batch_id?: string | null;
    reference_type?: "PO" | "SO" | null;
    reference_id?: string | null;
  }) => tx`
    update movements set
      direction = ${direction},
      flag = ${fields.flag ?? null},
      batch_id = ${fields.batch_id ?? tag?.batch_id ?? null},
      reference_type = ${fields.reference_type ?? null},
      reference_id = ${fields.reference_id ?? null}
    where id = ${mv.id}`;

  switch (gateEffect(gate.type, direction)) {
    case "receive":
      return receive(tx, gate, mv, tag, product, now, finish);

    case "ship": {
      if (!tag) return finish({ flag: "unknown_tag" }).then(() => false);
      if (tag.status !== "active") return finish({ flag: "inactive_tag" }).then(() => false);

      const lines = await tx<
        { id: string; so_id: string; so_number: string; qty_ordered: number; qty_shipped: number; created_at: Date }[]
      >`
        select l.id, l.so_id, s.so_number, l.qty_ordered, l.qty_shipped, s.created_at
        from so_lines l join sales_orders s on s.id = l.so_id
        where l.product_id = ${product.id} and s.status = 'open'
        for update of l`;
      const line = pickSalesLine(
        lines.map((l) => ({ ...l, documentNumber: l.so_number, target: l.qty_ordered, done: l.qty_shipped, dueAt: l.created_at })),
      );

      await deductFefo(tx, product.id, mv.units);
      if (line) {
        await tx`update so_lines set qty_shipped = qty_shipped + ${mv.units} where id = ${line.id}`;
        const soLines = await tx<{ qty_ordered: number; qty_shipped: number }[]>`
          select qty_ordered, qty_shipped from so_lines where so_id = ${line.so_id}`;
        if (isOrderComplete(soLines.map((l) => ({ target: l.qty_ordered, done: l.qty_shipped })))) {
          await tx`update sales_orders set status = 'shipped' where id = ${line.so_id}`;
        }
        await tx`update rfid_tags set status = 'sold', last_seen_at = ${now} where epc = ${tag.epc}`;
        await finish({ reference_type: "SO", reference_id: line.so_number });
      } else {
        // خروج من بوابة الشحن بدون أمر صرف مفتوح
        await tx`update rfid_tags set status = 'missing', last_seen_at = ${now} where epc = ${tag.epc}`;
        await finish({ flag: "unauthorized" });
        await raiseUnauthorizedExit(tx, gate, mv, now);
      }
      return true;
    }

    case "restricted_exit": {
      if (tag && tag.status !== "active") return finish({ flag: "inactive_tag" }).then(() => false);
      if (tag) {
        await deductFefo(tx, product.id, mv.units);
        await tx`update rfid_tags set status = 'missing', last_seen_at = ${now} where epc = ${tag.epc}`;
      }
      await finish({ flag: "unauthorized" });
      await raiseUnauthorizedExit(tx, gate, mv, now);
      return !!tag;
    }

    case "transfer": {
      if (!tag) return finish({ flag: "unknown_tag" }).then(() => false);
      if (tag.status !== "active") return finish({ flag: "inactive_tag" }).then(() => false);
      const zone = zoneAfterPass(gate, direction) ?? tag.last_zone_id;
      await tx`update rfid_tags set last_zone_id = ${zone}, last_seen_at = ${now} where epc = ${tag.epc}`;
      await finish({});
      return false;
    }

    case "none":
      await finish({ flag: "unexpected" });
      return false;
  }
}

/** الاستلام: دفعة جديدة + بطاقة جديدة + مطابقة مع أمر الشراء المفتوح */
async function receive(
  tx: Tx,
  gate: GateRow,
  mv: MovementRow,
  tag: TagRow | undefined,
  product: ProductRow,
  now: Date,
  finish: (f: {
    flag?: string | null;
    batch_id?: string | null;
    reference_type?: "PO" | "SO" | null;
    reference_id?: string | null;
  }) => Promise<unknown>,
): Promise<boolean> {
  const zone = zoneAfterPass(gate, "in");

  if (tag) {
    if (tag.status === "active") {
      // بطاقة موجودة أصلًا في المخزون: تحديث الموقع فقط
      await tx`update rfid_tags set last_zone_id = ${zone ?? tag.last_zone_id}, last_seen_at = ${now} where epc = ${tag.epc}`;
      await finish({});
      return false;
    }
    // بطاقة رجعت (كانت مصروفة أو مفقودة): ترجع لرصيد دفعتها
    await tx`update rfid_tags set status = 'active', last_zone_id = ${zone ?? tag.last_zone_id}, last_seen_at = ${now} where epc = ${tag.epc}`;
    if (tag.batch_id) await tx`update batches set quantity = quantity + ${tag.units} where id = ${tag.batch_id}`;
    await finish({});
    return true;
  }

  const lines = await tx<
    { id: string; po_id: string; po_number: string; qty_expected: number; qty_received: number; expected_at: Date | null }[]
  >`
    select l.id, l.po_id, p.po_number, l.qty_expected, l.qty_received, p.expected_at
    from po_lines l join purchase_orders p on p.id = l.po_id
    where l.product_id = ${product.id} and p.status in ('open', 'receiving')
    for update of l`;
  const line = pickPurchaseLine(
    lines.map((l) => ({ ...l, documentNumber: l.po_number, target: l.qty_expected, done: l.qty_received, dueAt: l.expected_at })),
  );

  const today = riyadhDate(now);
  const lot = receiptLotNumber(today, line?.documentNumber);
  const expiry = product.has_expiry && product.shelf_life_days ? addDays(today, product.shelf_life_days) : null;
  const [batch] = await tx<{ id: string }[]>`
    insert into batches (product_id, lot_number, quantity, expiry_date, received_at, zone_id)
    values (${product.id}, ${lot}, ${mv.units}, ${expiry}, ${now}, ${product.default_zone_id})
    on conflict (product_id, lot_number) where lot_number is not null
    do update set quantity = batches.quantity + excluded.quantity
    returning id`;

  await tx`
    insert into rfid_tags (epc, product_id, batch_id, level, units, status, last_zone_id, last_seen_at)
    values (${mv.epc}, ${product.id}, ${batch!.id}, 'carton', ${mv.units}, 'active', ${zone ?? product.default_zone_id}, ${now})`;

  if (line) {
    await tx`update po_lines set qty_received = qty_received + ${mv.units} where id = ${line.id}`;
    await tx`update purchase_orders set status = 'receiving' where id = ${line.po_id} and status = 'open'`;
  }
  await finish({
    batch_id: batch!.id,
    reference_type: line ? "PO" : null,
    reference_id: line?.documentNumber ?? null,
    flag: line ? null : "no_po",
  });
  return true;
}

/** خصم الكمية من دفعات الصنف بقاعدة FEFO (الأقرب انتهاءً أولًا) */
async function deductFefo(tx: Tx, productId: string, units: number) {
  const batches = await tx<{ id: string; quantity: number; expiry_date: string | null; received_at: Date }[]>`
    select id, quantity, expiry_date, received_at from batches
    where product_id = ${productId} and quantity > 0
    for update`;
  const { allocations } = allocateFefo(
    batches.map((b) => ({ id: b.id, quantity: b.quantity, expiryDate: b.expiry_date, receivedAt: new Date(b.received_at) })),
    units,
  );
  for (const a of allocations) {
    await tx`update batches set quantity = quantity - ${a.units} where id = ${a.batchId}`;
  }
}

/**
 * تنبيه أمني حرج للخروج غير المصرح. القراءات المتتالية لنفس البوابة خلال دقيقة
 * تُجمع في نفس التنبيه (سماعات ×2 بدل تنبيهين).
 */
async function raiseUnauthorizedExit(tx: Tx, gate: GateRow, mv: MovementRow, now: Date) {
  const ref = `gate:${gate.id}`;
  const [open] = await tx<{ id: string; created_at: Date }[]>`
    select id, created_at from alerts
    where type = 'security' and entity_ref = ${ref} and status = 'open'
      and updated_at > ${new Date(now.getTime() - SECURITY_INCIDENT_WINDOW_MS)}
    order by created_at desc
    limit 1
    for update`;
  const since = open ? new Date(open.created_at) : new Date(mv.created_at);

  const items = await tx<{ units: number; created_at: Date; name_ar: string; unit_cost: number; zone_name: string | null }[]>`
    select m.units, m.created_at, p.name_ar, p.unit_cost, z.name_ar as zone_name
    from movements m
    join products p on p.id = m.product_id
    left join rfid_tags t on t.epc = m.epc
    left join zones z on z.id = t.last_zone_id
    where m.gate_id = ${gate.id} and m.flag = 'unauthorized' and m.created_at >= ${since}
    order by m.created_at`;

  const draft = unauthorizedExitAlert(
    gate,
    items.map((i) => ({ ...i, at: new Date(i.created_at) })),
  );
  if (open) {
    await tx`update alerts set title = ${draft.title}, body = ${draft.body}, updated_at = ${now} where id = ${open.id}`;
  } else {
    await tx`
      insert into alerts (severity, type, title, body, entity_ref, status, created_at, updated_at)
      values (${draft.severity}, ${draft.type}, ${draft.title}, ${draft.body}, ${draft.entity_ref}, 'open', ${since}, ${now})`;
  }
}

/**
 * يغلق استلام أوامر الشراء اللي ما وصلتها قراءات خلال المهلة، ويقارن المستلم بالمطلوب:
 * مطابق → received. ناقص → short + تنبيه «شحنة ناقصة» فيه الصنف والنقص وقيمته.
 */
export async function closeIdleReceipts(tx: Tx, now: Date, idleMs: number) {
  const pos = await tx<{ id: string; po_number: string; supplier: string | null }[]>`
    select p.id, p.po_number, s.name_ar as supplier
    from purchase_orders p
    left join suppliers s on s.id = p.supplier_id
    where p.status = 'receiving'
      and not exists (
        select 1 from movements m
        where m.reference_type = 'PO' and m.reference_id = p.po_number
          and m.created_at > ${new Date(now.getTime() - idleMs)}
      )
    for update of p skip locked`;

  const closed: IngestResult["receipts_closed"] = [];
  for (const po of pos) {
    const lines = await tx<{ qty_expected: number; qty_received: number; name_ar: string; unit_cost: number }[]>`
      select l.qty_expected, l.qty_received, pr.name_ar, pr.unit_cost
      from po_lines l join products pr on pr.id = l.product_id
      where l.po_id = ${po.id}
      order by pr.sku`;
    const shortages = shortShipmentLines(
      lines.map((l) => ({ productName: l.name_ar, expected: l.qty_expected, received: l.qty_received, unitCost: l.unit_cost })),
    );

    await tx`
      update alerts set status = 'resolved', updated_at = ${now}
      where type = 'receipt' and entity_ref = ${`po:${po.po_number}`} and status <> 'resolved'`;

    if (shortages.length) {
      await tx`update purchase_orders set status = 'short' where id = ${po.id}`;
      const draft = shortShipmentAlert(po, shortages, lines.length - shortages.length);
      await tx`
        insert into alerts (severity, type, title, body, entity_ref, status, created_at, updated_at)
        values (${draft.severity}, ${draft.type}, ${draft.title}, ${draft.body}, ${draft.entity_ref}, 'open', ${now}, ${now})`;
      closed.push({ po_number: po.po_number, status: "short" });
    } else {
      await tx`update purchase_orders set status = 'received' where id = ${po.id}`;
      closed.push({ po_number: po.po_number, status: "received" });
    }
  }
  return closed;
}
