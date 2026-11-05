import type {
  AlertItem,
  BatchItem,
  GateItem,
  GatesResponse,
  MovementItem,
  MovementsResponse,
  ProductDetailResponse,
  ProductSummary,
  ProductsResponse,
  ReadStats,
  SummaryResponse,
  TagItem,
  ZoneRef,
} from "@/lib/api-types";
import { compareAlerts, riyadhDayStart, summarizeInventory, type AlertStatus, type StockStatus } from "@/lib/inventory";
import { WAREHOUSE_NAME, gateRole } from "@/lib/labels";
import { matchesQuery } from "@/lib/search";
import type { Db } from "./db";
import { loadInventory, type InventoryItem } from "./inventory";

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const zoneRef = (id: string | null, name: string | null): ZoneRef | null => (id ? { id, name_ar: name ?? id } : null);
const finite = (n: number) => (Number.isFinite(n) ? n : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function toProductSummary({ product: p, metrics: m }: InventoryItem): ProductSummary {
  return {
    id: p.id,
    sku: p.sku,
    name_ar: p.name_ar,
    name_en: p.name_en,
    category: p.category,
    zone: zoneRef(p.default_zone_id, p.zone_name),
    available: m.available,
    unit_cost: p.unit_cost,
    unit_price: p.unit_price,
    pack_size: p.pack_size,
    weekly_sales: m.weeklySales,
    last_week_sales: m.lastWeekSales,
    forecast_next_week: round1(m.nextWeekForecast),
    coverage_days: finite(m.coverageDays) === null ? null : round1(m.coverageDays),
    status: m.status,
    suggested_order: m.suggestedOrder,
    incoming: m.incoming,
    value: m.stockValue,
  };
}

// ── الأصناف ─────────────────────────────────────────────────────────────

export async function listProducts(
  db: Db,
  opts: { status?: StockStatus; q?: string; now?: Date } = {},
): Promise<ProductsResponse> {
  const now = opts.now ?? new Date();
  const inventory = await loadInventory(db, now);
  const all = inventory.items.map(toProductSummary);
  const counts = summarizeInventory(inventory.items.map((i) => i.metrics)).statusCounts;
  const products = all.filter(
    (p) => (!opts.status || p.status === opts.status) && matchesQuery(opts.q ?? "", p.name_ar, p.name_en, p.sku),
  );
  return { products, counts, generated_at: now.toISOString() };
}

export async function getProductDetail(db: Db, id: string, now: Date = new Date()): Promise<ProductDetailResponse | null> {
  const inventory = await loadInventory(db, now, { productId: id });
  const item = inventory.items[0];
  if (!item) return null;

  const zones = new Map(
    (await db<{ id: string; name_ar: string }[]>`select id, name_ar from zones`).map((z) => [z.id, z.name_ar]),
  );
  const waste = new Map(item.metrics.waste.map((w) => [w.batchId, w]));
  const batches: BatchItem[] = [...item.batches]
    .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999") || +new Date(a.received_at) - +new Date(b.received_at))
    .map((b) => {
      const w = waste.get(b.id);
      return {
        id: b.id,
        lot_number: b.lot_number,
        quantity: b.quantity,
        expiry_date: b.expiry_date,
        received_at: new Date(b.received_at).toISOString(),
        zone: zoneRef(b.zone_id, b.zone_id ? (zones.get(b.zone_id) ?? null) : null),
        remaining_days: w?.remainingDays ?? null,
        surplus: w?.surplus ?? null,
        action: w?.action ?? null,
      };
    });

  const tagRows = await db<
    { epc: string; units: number; level: TagItem["level"]; status: TagItem["status"]; last_zone_id: string | null; last_seen_at: Date | null }[]
  >`
    select epc, units, level, status, last_zone_id, last_seen_at
    from rfid_tags where product_id = ${id}
    order by (status = 'active') desc, last_seen_at desc nulls last, epc`;
  const active = tagRows.filter((t) => t.status === "active");
  const byZone = new Map<string | null, { tags: number; units: number }>();
  for (const t of active) {
    const entry = byZone.get(t.last_zone_id) ?? { tags: 0, units: 0 };
    entry.tags++;
    entry.units += t.units;
    byZone.set(t.last_zone_id, entry);
  }

  const movements = await listMovements(db, { productId: id, limit: 50, from: new Date(0) });

  return {
    product: {
      ...toProductSummary(item),
      lead_time_days: item.product.lead_time_days,
      has_expiry: item.product.has_expiry,
      shelf_life_days: item.product.shelf_life_days,
    },
    batches,
    forecast: item.metrics.forecast.map((f) => ({
      week_start: f.weekStart,
      predicted: round1(f.predicted),
      factor: Math.round(f.factor * 100) / 100,
      note: f.note,
    })),
    tags: {
      by_zone: [...byZone]
        .map(([zone, v]) => ({ zone: zoneRef(zone, zone ? (zones.get(zone) ?? null) : null), ...v }))
        .sort((a, b) => b.units - a.units),
      items: active.slice(0, 200).map((t) => ({
        epc: t.epc,
        units: t.units,
        level: t.level,
        status: t.status,
        zone: zoneRef(t.last_zone_id, t.last_zone_id ? (zones.get(t.last_zone_id) ?? null) : null),
        last_seen_at: iso(t.last_seen_at),
      })),
      inactive: {
        sold: tagRows.filter((t) => t.status === "sold").length,
        missing: tagRows.filter((t) => t.status === "missing").length,
        damaged: tagRows.filter((t) => t.status === "damaged").length,
      },
    },
    movements: movements.movements,
    generated_at: now.toISOString(),
  };
}

// ── الحركات وسجل القراءات ───────────────────────────────────────────────

interface MovementRow {
  id: string;
  created_at: Date;
  epc: string;
  direction: "in" | "out" | null;
  units: number;
  reference_type: MovementItem["reference_type"];
  reference_id: string | null;
  flag: MovementItem["flag"];
  product_id: string;
  product_name: string;
  sku: string;
  gate_id: string;
  gate_name: string;
  gate_type: MovementItem["gate"]["type"];
}

function toMovementItem(r: MovementRow): MovementItem {
  return {
    id: r.id,
    created_at: new Date(r.created_at).toISOString(),
    epc: r.epc,
    product: { id: r.product_id, name_ar: r.product_name, sku: r.sku },
    gate: { id: r.gate_id, name_ar: r.gate_name, type: r.gate_type },
    direction: r.direction,
    units: r.units,
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    flag: r.flag,
  };
}

export async function listMovements(
  db: Db,
  opts: { gate?: string; productId?: string; from?: Date; to?: Date; limit?: number; now?: Date } = {},
): Promise<MovementsResponse> {
  const now = opts.now ?? new Date();
  const from = opts.from ?? riyadhDayStart(now);
  const to = opts.to ?? new Date(now.getTime() + 86_400_000);
  const gate = opts.gate ?? null;
  const productId = opts.productId ?? null;
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);

  const rows = await db<MovementRow[]>`
    select m.id, m.created_at, m.epc, m.direction, m.units, m.reference_type, m.reference_id, m.flag,
           p.id as product_id, p.name_ar as product_name, p.sku,
           g.id as gate_id, g.name_ar as gate_name, g.type as gate_type
    from movements m
    join products p on p.id = m.product_id
    join gates g on g.id = m.gate_id
    where m.created_at >= ${from} and m.created_at < ${to}
      and (${gate}::text is null or m.gate_id = ${gate})
      and (${productId}::uuid is null or m.product_id = ${productId}::uuid)
    order by m.created_at desc, m.id
    limit ${limit}`;

  return { movements: rows.map(toMovementItem), stats: await readStats(db, { gate, from, to }) };
}

export async function readStats(db: Db, opts: { gate?: string | null; from: Date; to?: Date }): Promise<ReadStats> {
  const to = opts.to ?? new Date(Date.now() + 86_400_000);
  const gate = opts.gate ?? null;
  const [row] = await db<ReadStats[]>`
    select count(*)::int as raw, count(*) filter (where is_duplicate)::int as duplicates
    from rfid_reads
    where read_at >= ${opts.from} and read_at < ${to} and (${gate}::text is null or gate_id = ${gate})`;
  return row ?? { raw: 0, duplicates: 0 };
}

// ── البوابات ────────────────────────────────────────────────────────────

export async function listGates(db: Db, now: Date = new Date()): Promise<GatesResponse> {
  const dayStart = riyadhDayStart(now);
  const gates = await db<
    {
      id: string;
      name_ar: string;
      type: GateItem["type"];
      from_zone_id: string | null;
      from_zone_name: string | null;
      to_zone_id: string | null;
      to_zone_name: string | null;
      reader_ip: string | null;
      is_online: boolean;
      last_seen_at: Date | null;
    }[]
  >`
    select g.id, g.name_ar, g.type, g.from_zone_id, fz.name_ar as from_zone_name, g.to_zone_id, tz.name_ar as to_zone_name,
           g.reader_ip, g.is_online, g.last_seen_at
    from gates g
    left join zones fz on fz.id = g.from_zone_id
    left join zones tz on tz.id = g.to_zone_id
    order by g.id`;

  const moves = await db<{ gate_id: string; ins: number; outs: number }[]>`
    select gate_id, count(*) filter (where direction = 'in')::int as ins, count(*) filter (where direction = 'out')::int as outs
    from movements where created_at >= ${dayStart} group by gate_id`;
  const reads = await db<{ gate_id: string; raw: number; duplicates: number }[]>`
    select gate_id, count(*)::int as raw, count(*) filter (where is_duplicate)::int as duplicates
    from rfid_reads where read_at >= ${dayStart} group by gate_id`;
  const last = await db<{ gate_id: string; created_at: Date; name_ar: string; direction: "in" | "out" | null }[]>`
    select distinct on (m.gate_id) m.gate_id, m.created_at, p.name_ar, m.direction
    from movements m join products p on p.id = m.product_id
    order by m.gate_id, m.created_at desc`;
  const alarms = new Set(
    (
      await db<{ entity_ref: string }[]>`
        select distinct entity_ref from alerts where type = 'security' and status = 'open' and entity_ref like 'gate:%'`
    ).map((a) => a.entity_ref.slice("gate:".length)),
  );

  const movesBy = new Map(moves.map((m) => [m.gate_id, m]));
  const readsBy = new Map(reads.map((r) => [r.gate_id, r]));
  const lastBy = new Map(last.map((l) => [l.gate_id, l]));

  const items: GateItem[] = gates.map((g) => {
    const lastRead = lastBy.get(g.id);
    return {
      id: g.id,
      name_ar: g.name_ar,
      type: g.type,
      role_ar: gateRole(g.type, g.from_zone_name, g.to_zone_name),
      from_zone: zoneRef(g.from_zone_id, g.from_zone_name),
      to_zone: zoneRef(g.to_zone_id, g.to_zone_name),
      reader_ip: g.reader_ip,
      is_online: g.is_online,
      last_seen_at: iso(g.last_seen_at),
      last_read: lastRead
        ? { at: new Date(lastRead.created_at).toISOString(), product_name: lastRead.name_ar, direction: lastRead.direction }
        : null,
      today: {
        in: movesBy.get(g.id)?.ins ?? 0,
        out: movesBy.get(g.id)?.outs ?? 0,
        raw: readsBy.get(g.id)?.raw ?? 0,
        duplicates: readsBy.get(g.id)?.duplicates ?? 0,
      },
      alarm: alarms.has(g.id),
    };
  });

  return {
    gates: items,
    totals: items.reduce((t, g) => ({ raw: t.raw + g.today.raw, duplicates: t.duplicates + g.today.duplicates }), {
      raw: 0,
      duplicates: 0,
    }),
  };
}

// ── التنبيهات ───────────────────────────────────────────────────────────

const ALERT_FIELDS = ["id", "severity", "type", "title", "body", "entity_ref", "status", "created_at", "updated_at"] as const;

function toAlertItem(a: Record<(typeof ALERT_FIELDS)[number], unknown>): AlertItem {
  return {
    ...(a as unknown as AlertItem),
    created_at: new Date(a.created_at as Date).toISOString(),
    updated_at: new Date(a.updated_at as Date).toISOString(),
  };
}

/** statuses الافتراضي: المفتوح و«تم الاطلاع» */
export async function listAlerts(db: Db, statuses: AlertStatus[] = ["open", "acknowledged"], limit = 100): Promise<AlertItem[]> {
  const rows = await db<Record<(typeof ALERT_FIELDS)[number], unknown>[]>`
    select ${db(ALERT_FIELDS)} from alerts
    where status in ${db(statuses)}
    order by created_at desc
    limit ${limit}`;
  return rows.map(toAlertItem).sort(compareAlerts);
}

export async function updateAlertStatus(db: Db, id: string, status: AlertStatus): Promise<AlertItem | null> {
  const [row] = await db<Record<(typeof ALERT_FIELDS)[number], unknown>[]>`
    update alerts set status = ${status}, updated_at = now() where id = ${id}
    returning ${db(ALERT_FIELDS)}`;
  return row ? toAlertItem(row) : null;
}

// ── نظرة عامة ───────────────────────────────────────────────────────────

export async function dashboardSummary(db: Db, now: Date = new Date()): Promise<SummaryResponse> {
  const inventory = await loadInventory(db, now);
  const summary = summarizeInventory(inventory.items.map((i) => i.metrics));
  const reads = await readStats(db, { from: riyadhDayStart(now) });
  const [security] = await db<{ n: number }[]>`
    select count(*)::int as n from alerts where type = 'security' and status = 'open'`;
  const recent = await listMovements(db, { from: new Date(0), limit: 5, now });

  const reorder = inventory.items
    .filter((i) => i.metrics.suggestedOrder > 0)
    .sort((a, b) => a.metrics.coverageDays - b.metrics.coverageDays)
    .map((i) => {
      const p = toProductSummary(i);
      return { id: p.id, sku: p.sku, name_ar: p.name_ar, coverage_days: p.coverage_days, suggested_order: p.suggested_order, status: p.status };
    });

  return {
    warehouse_name: WAREHOUSE_NAME,
    kpis: {
      stock_value: summary.stockValue,
      product_count: summary.productCount,
      total_units: summary.totalUnits,
      below_threshold: summary.belowThreshold,
      critical: summary.critical,
      stagnant_value: summary.stagnantValue,
      value_at_risk: summary.valueAtRisk,
      reads_today: reads.raw,
      duplicates_today: reads.duplicates,
      security_open: security?.n ?? 0,
    },
    reorder,
    recent_reads: recent.movements,
    generated_at: now.toISOString(),
  };
}
