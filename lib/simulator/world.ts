import { buildEpc } from "@/lib/inventory/epc";
import type { Db } from "@/lib/server/db";

/** قيمة بديلة للقوائم الفاضية في `in (...)`، ما تطابق أي صف */
const NONE = "__none__";

/**
 * «العالم» اللي يحاكيه المحاكي: أين البطاقات الآن، وأي أوامر شراء وصرف مفتوحة.
 * المحاكي يقرأ هذه الحالة فقط ليختار بطاقات واقعية، والقراءات نفسها تمر عبر خادم الاستقبال.
 */

export interface SimProduct {
  id: string;
  sku: string;
  name_ar: string;
  pack_size: number;
  default_zone_id: string | null;
}

export interface SimTag {
  epc: string;
  product_id: string;
  units: number;
  last_zone_id: string | null;
  expiryDate: string | null;
  receivedAt: Date;
}

export async function loadProducts(db: Db): Promise<Map<string, SimProduct>> {
  const rows = await db<SimProduct[]>`select id, sku, name_ar, pack_size, default_zone_id from products`;
  return new Map(rows.map((p) => [p.sku, p]));
}

/**
 * البطاقات النشطة. excludeRecentSeconds يستبعد البطاقات اللي مرت من أي بوابة قبل لحظات
 * (الكرتون ما يرجع يعبر نفس البوابة خلال ثوانٍ).
 */
export async function activeTags(
  db: Db,
  opts: { productId?: string; zones?: string[]; excludeRecentSeconds?: number } = {},
): Promise<SimTag[]> {
  const productId = opts.productId ?? null;
  const zones = opts.zones ?? null;
  const recent = opts.excludeRecentSeconds ?? 0;
  const rows = await db<
    { epc: string; product_id: string; units: number; last_zone_id: string | null; expiry_date: string | null; received_at: Date | null }[]
  >`
    select t.epc, t.product_id, t.units, t.last_zone_id, b.expiry_date, b.received_at
    from rfid_tags t
    left join batches b on b.id = t.batch_id
    where t.status = 'active'
      and (${productId}::uuid is null or t.product_id = ${productId}::uuid)
      and (${zones === null} or t.last_zone_id in ${db(zones?.length ? zones : [NONE])})
      and (${recent}::int = 0 or not exists (
        select 1 from movements m where m.epc = t.epc and m.created_at > now() - make_interval(secs => ${recent}::int)
      ))
    order by t.epc`;
  return rows.map((r) => ({
    epc: r.epc,
    product_id: r.product_id,
    units: r.units,
    last_zone_id: r.last_zone_id,
    expiryDate: r.expiry_date,
    receivedAt: r.received_at ? new Date(r.received_at) : new Date(0),
  }));
}

/** رقم EPC جديد غير مستخدم لصنف (بطاقات الكراتين الواصلة من المورد) */
export async function newEpc(db: Db, sku: string, rng: () => number, reserved: Set<string> = new Set()): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const epc = buildEpc(sku, 0x0100_0000 + Math.floor(rng() * 0xfe00_0000));
    if (reserved.has(epc)) continue;
    const [exists] = await db`select 1 from rfid_tags where epc = ${epc}`;
    if (!exists) {
      reserved.add(epc);
      return epc;
    }
  }
  throw new Error(`could not allocate a new EPC for ${sku}`);
}

export interface OpenSalesLine {
  so_number: string;
  product_id: string;
  remaining: number;
}

export async function openSalesLines(db: Db, exclude: string[] = []): Promise<OpenSalesLine[]> {
  return db<OpenSalesLine[]>`
    select s.so_number, l.product_id, (l.qty_ordered - l.qty_shipped)::int as remaining
    from so_lines l join sales_orders s on s.id = l.so_id
    where s.status = 'open' and l.qty_ordered > l.qty_shipped
      and s.so_number not in ${db(exclude.length ? exclude : [NONE])}
    order by s.so_number`;
}

export interface OpenPurchaseLine {
  po_number: string;
  status: string;
  product_id: string;
  sku: string;
  remaining: number;
  pack_size: number;
}

export async function openPurchaseLines(db: Db, exclude: string[] = []): Promise<OpenPurchaseLine[]> {
  return db<OpenPurchaseLine[]>`
    select p.po_number, p.status, l.product_id, pr.sku, (l.qty_expected - l.qty_received)::int as remaining, pr.pack_size
    from po_lines l
    join purchase_orders p on p.id = l.po_id
    join products pr on pr.id = l.product_id
    where p.status in ('open', 'receiving') and l.qty_expected > l.qty_received
      and p.po_number not in ${db(exclude.length ? exclude : [NONE])}
    order by p.po_number, pr.sku`;
}

/** شاحنة جديدة لنفس أمر الشراء: يرجع الأمر مفتوحًا بدون مستلم (حتى يتكرر العرض) */
export async function resetPurchaseOrder(db: Db, poNumber: string): Promise<"ok" | "busy" | "missing"> {
  const [po] = await db<{ id: string; status: string }[]>`select id, status from purchase_orders where po_number = ${poNumber}`;
  if (!po) return "missing";
  if (po.status === "receiving") return "busy";
  await db`update po_lines set qty_received = 0 where po_id = ${po.id}`;
  await db`update purchase_orders set status = 'open', expected_at = now() where id = ${po.id}`;
  return "ok";
}

/** طلب الفرع من جديد: يرجع أمر الصرف مفتوحًا بدون مشحون */
export async function resetSalesOrder(db: Db, soNumber: string): Promise<"ok" | "missing"> {
  const [so] = await db<{ id: string }[]>`select id from sales_orders where so_number = ${soNumber}`;
  if (!so) return "missing";
  await db`update so_lines set qty_shipped = 0 where so_id = ${so.id}`;
  await db`update sales_orders set status = 'open' where id = ${so.id}`;
  return "ok";
}
