/** أشكال استجابات REST المشتركة بين الخادم والواجهة */
import type { AlertStatus, AlertType, Severity } from "./inventory/alerts";
import type { WasteAction } from "./inventory/fefo";
import type { GateType } from "./inventory/rules";
import type { StockStatus } from "./inventory/stock";
import type { MovementFlag } from "./labels";

export interface ZoneRef {
  id: string;
  name_ar: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string | null;
  category: string;
  zone: ZoneRef | null;
  available: number;
  unit_cost: number;
  unit_price: number;
  pack_size: number;
  /** آخر 12 أسبوع، الأول هو الأقدم */
  weekly_sales: number[];
  last_week_sales: number;
  forecast_next_week: number;
  /** null = بلا حد (ما فيه طلب متوقع) */
  coverage_days: number | null;
  status: StockStatus;
  suggested_order: number;
  incoming: number;
  /** قيمة المخزون بسعر التكلفة */
  value: number;
}

export interface ProductsResponse {
  products: ProductSummary[];
  counts: Record<StockStatus, number>;
  generated_at: string;
}

export interface MovementItem {
  id: string;
  created_at: string;
  epc: string;
  product: { id: string; name_ar: string; sku: string };
  gate: { id: string; name_ar: string; type: GateType };
  direction: "in" | "out" | null;
  units: number;
  reference_type: "PO" | "SO" | "COUNT" | null;
  reference_id: string | null;
  flag: MovementFlag | null;
}

export interface ReadStats {
  raw: number;
  duplicates: number;
}

export interface MovementsResponse {
  movements: MovementItem[];
  /** القراءات الخام والمكرر المُرشَّح لنفس الفترة والبوابة */
  stats: ReadStats;
}

export interface GateItem {
  id: string;
  name_ar: string;
  type: GateType;
  role_ar: string;
  from_zone: ZoneRef | null;
  to_zone: ZoneRef | null;
  reader_ip: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  last_read: { at: string; product_name: string; direction: "in" | "out" | null } | null;
  today: { in: number; out: number; raw: number; duplicates: number };
  /** تنبيه أمني مفتوح على البوابة */
  alarm: boolean;
}

export interface GatesResponse {
  gates: GateItem[];
  totals: ReadStats;
}

export interface AlertItem {
  id: string;
  severity: Severity;
  type: AlertType;
  title: string;
  body: string | null;
  entity_ref: string | null;
  status: AlertStatus;
  created_at: string;
  updated_at: string;
}

export interface AlertsResponse {
  alerts: AlertItem[];
}

export interface ReorderItem {
  id: string;
  sku: string;
  name_ar: string;
  coverage_days: number | null;
  suggested_order: number;
  status: StockStatus;
}

export interface SummaryResponse {
  warehouse_name: string;
  kpis: {
    stock_value: number;
    product_count: number;
    total_units: number;
    below_threshold: number;
    critical: number;
    stagnant_value: number;
    value_at_risk: number;
    reads_today: number;
    duplicates_today: number;
    security_open: number;
  };
  reorder: ReorderItem[];
  recent_reads: MovementItem[];
  generated_at: string;
}

export interface BatchItem {
  id: string;
  lot_number: string | null;
  quantity: number;
  expiry_date: string | null;
  received_at: string;
  zone: ZoneRef | null;
  remaining_days: number | null;
  surplus: number | null;
  action: WasteAction | null;
}

export interface TagItem {
  epc: string;
  units: number;
  level: "item" | "carton" | "pallet";
  status: "active" | "sold" | "missing" | "damaged";
  zone: ZoneRef | null;
  last_seen_at: string | null;
}

export interface ProductDetailResponse {
  product: ProductSummary & {
    lead_time_days: number;
    has_expiry: boolean;
    shelf_life_days: number | null;
  };
  batches: BatchItem[];
  forecast: { week_start: string; predicted: number; factor: number; note: string | null }[];
  tags: {
    by_zone: { zone: ZoneRef | null; tags: number; units: number }[];
    items: TagItem[];
    inactive: { sold: number; missing: number; damaged: number };
  };
  movements: MovementItem[];
  generated_at: string;
}
