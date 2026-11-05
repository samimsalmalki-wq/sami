import {
  HISTORY_WEEKS,
  computeProductMetrics,
  riyadhDate,
  weeklyTotals,
  type FefoBatch,
  type ProductMetrics,
} from "@/lib/inventory";
import type { Db } from "./db";

export interface ProductRow {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string | null;
  category: string;
  unit_cost: number;
  unit_price: number;
  pack_size: number;
  lead_time_days: number;
  default_zone_id: string | null;
  zone_name: string | null;
  has_expiry: boolean;
  shelf_life_days: number | null;
}

export interface BatchRow {
  id: string;
  product_id: string;
  lot_number: string | null;
  quantity: number;
  expiry_date: string | null;
  received_at: Date;
  zone_id: string | null;
}

export interface InventoryItem {
  product: ProductRow;
  batches: BatchRow[];
  metrics: ProductMetrics;
}

export interface InventorySnapshot {
  today: string;
  /** آخر يوم فيه مبيعات مسجلة (نهاية نافذة الـ 12 أسبوع) */
  salesEndDate: string | null;
  items: InventoryItem[];
}

export function toFefoBatch(b: BatchRow): FefoBatch {
  return { id: b.id, quantity: b.quantity, expiryDate: b.expiry_date, receivedAt: new Date(b.received_at) };
}

/**
 * يحمّل كل ما تحتاجه حسابات المخزون ثم يحسب لكل صنف: المتوفر من الدفعات، التنبؤ،
 * التغطية، الحالة، الطلب المقترح، والهدر. الحسابات نفسها في lib/inventory.
 */
export async function loadInventory(
  db: Db,
  now: Date = new Date(),
  opts: { productId?: string } = {},
): Promise<InventorySnapshot> {
  const today = riyadhDate(now);
  const productId = opts.productId ?? null;

  const products = await db<ProductRow[]>`
    select p.id, p.sku, p.name_ar, p.name_en, p.category, p.unit_cost, p.unit_price, p.pack_size,
           p.lead_time_days, p.default_zone_id, z.name_ar as zone_name, p.has_expiry, p.shelf_life_days
    from products p
    left join zones z on z.id = p.default_zone_id
    where ${productId}::uuid is null or p.id = ${productId}::uuid
    order by p.sku`;

  const batches = await db<BatchRow[]>`
    select id, product_id, lot_number, quantity, expiry_date, received_at, zone_id
    from batches
    where quantity > 0 and (${productId}::uuid is null or product_id = ${productId}::uuid)`;

  const [end] = await db<{ d: string | null }[]>`select max(date) as d from sales_daily`;
  const salesEndDate = end?.d ?? null;

  const sales = salesEndDate
    ? await db<{ product_id: string; date: string; units: number }[]>`
        select product_id, date, units_sold as units
        from sales_daily
        where date > ${salesEndDate}::date - ${HISTORY_WEEKS * 7}::int
          and date <= ${salesEndDate}::date
          and (${productId}::uuid is null or product_id = ${productId}::uuid)`
    : [];

  const incomingRows = await db<{ product_id: string; incoming: number }[]>`
    select l.product_id, sum(greatest(l.qty_expected - l.qty_received, 0))::int as incoming
    from po_lines l
    join purchase_orders p on p.id = l.po_id
    where p.status in ('open', 'receiving')
    group by l.product_id`;

  const batchesBy = groupBy(batches, (b) => b.product_id);
  const salesBy = groupBy(sales, (s) => s.product_id);
  const incomingBy = new Map(incomingRows.map((r) => [r.product_id, r.incoming]));

  const items = products.map((product) => {
    const productBatches = batchesBy.get(product.id) ?? [];
    const weekly = salesEndDate ? weeklyTotals(salesBy.get(product.id) ?? [], salesEndDate) : new Array(HISTORY_WEEKS).fill(0);
    const metrics = computeProductMetrics(
      product,
      productBatches.map(toFefoBatch),
      weekly,
      incomingBy.get(product.id) ?? 0,
      today,
    );
    return { product, batches: productBatches, metrics };
  });

  return { today, salesEndDate, items };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
