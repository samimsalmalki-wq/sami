-- ════════════════════════════════════════════════════════════════════════
-- مخزون حي — مخطط قاعدة البيانات (قسم «نموذج البيانات» في المواصفات)
--
-- المبدأ: المخزون لا يُخزَّن كرقم ثابت، بل يُحسب من الدفعات (batches)،
-- وكل قراءة بوابة تنتج حركة مخزون موثّقة (movements).
--
-- إضافات صغيرة على المواصفات تحتاجها القواعد (موثّقة في README):
--   suppliers                جدول بسيط لأن purchase_orders.supplier_id يشير لمورد
--   products.shelf_life_days لحساب تاريخ انتهاء الدفعة الجديدة عند الاستلام
--   gates.last_seen_at       آخر اتصال للقارئ (أي دفعة قراءات أو نبضة فارغة)
--   movements.read_id        القراءة الأولى اللي فتحت مرور البطاقة (لتأكيد الاتجاه لاحقًا)
--   alerts.updated_at        لتجميع التنبيه الأمني لنفس الحادثة وتحديث نص التنبيهات
-- ════════════════════════════════════════════════════════════════════════

-- ── مناطق المستودع ─────────────────────────────────────────────────────
create table public.zones (
  id      text primary key,
  name_ar text not null,
  type    text not null check (type in ('receiving', 'storage', 'cold', 'high_value', 'sales_floor'))
);

create table public.suppliers (
  id      uuid primary key default gen_random_uuid(),
  name_ar text not null
);

-- ── بيانات الصنف ───────────────────────────────────────────────────────
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,          -- رمز الصنف، وهو نفسه المقطع الثاني في EPC
  name_ar         text not null,
  name_en         text,
  category        text not null,                 -- مفتاح الفئة (dairy, electronics, ...)
  unit_cost       numeric(12, 2) not null check (unit_cost >= 0),
  unit_price      numeric(12, 2) not null check (unit_price >= 0),
  pack_size       integer not null default 1 check (pack_size > 0),   -- عدد الوحدات في الكرتون
  lead_time_days  integer not null default 7 check (lead_time_days >= 0),
  default_zone_id text references public.zones (id),
  has_expiry      boolean not null default false,
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days > 0),
  created_at      timestamptz not null default now()
);

-- ── الدفعات: الكمية الفعلية تُجمع من هنا ───────────────────────────────
create table public.batches (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  lot_number  text,
  quantity    integer not null default 0 check (quantity >= 0),
  expiry_date date,
  received_at timestamptz not null default now(),
  zone_id     text references public.zones (id)
);
create index batches_product_idx on public.batches (product_id);
create unique index batches_product_lot_uidx on public.batches (product_id, lot_number) where lot_number is not null;

-- ── بطاقات RFID: كل بطاقة مربوطة بدفعة ────────────────────────────────
create table public.rfid_tags (
  epc          text primary key,
  product_id   uuid not null references public.products (id) on delete cascade,
  batch_id     uuid references public.batches (id) on delete set null,
  level        text not null default 'carton' check (level in ('item', 'carton', 'pallet')),
  units        integer not null default 1 check (units > 0),
  status       text not null default 'active' check (status in ('active', 'sold', 'missing', 'damaged')),
  last_zone_id text references public.zones (id),   -- آخر موقع معروف داخل المستودع
  last_seen_at timestamptz
);
create index rfid_tags_product_idx on public.rfid_tags (product_id);
create index rfid_tags_active_zone_idx on public.rfid_tags (last_zone_id) where status = 'active';

-- ── البوابات: لكل بوابة هوائيان، A داخلي وB خارجي ──────────────────────
-- to_zone_id   المنطقة على جهة الهوائي الداخلي A
-- from_zone_id المنطقة على جهة الهوائي الخارجي B (null = خارج المستودع)
-- «دخول» (B ثم A) ينقل البطاقة من from_zone إلى to_zone، و«خروج» (A ثم B) العكس.
create table public.gates (
  id           text primary key,
  name_ar      text not null,
  type         text not null check (type in ('inbound', 'outbound', 'transfer', 'restricted')),
  from_zone_id text references public.zones (id),
  to_zone_id   text references public.zones (id),
  reader_ip    text,
  is_online    boolean not null default false,
  last_seen_at timestamptz
);

-- ── القراءات الخام قبل الفلترة ─────────────────────────────────────────
create table public.rfid_reads (
  id           uuid primary key default gen_random_uuid(),
  epc          text not null,
  gate_id      text not null references public.gates (id),
  antenna      text not null check (antenna in ('A', 'B')),
  rssi         smallint,
  read_at      timestamptz not null,
  is_duplicate boolean not null default false
);
-- يبحث خادم الاستقبال عن آخر قراءة أولى لنفس البطاقة على نفس البوابة
create index rfid_reads_session_idx on public.rfid_reads (gate_id, epc, read_at desc) where not is_duplicate;
create index rfid_reads_read_at_idx on public.rfid_reads (read_at);

-- ── الحركات بعد الفلترة وتحديد الاتجاه ────────────────────────────────
create table public.movements (
  id             uuid primary key default gen_random_uuid(),
  read_id        uuid unique references public.rfid_reads (id) on delete set null,
  epc            text not null,
  product_id     uuid not null references public.products (id),
  batch_id       uuid references public.batches (id) on delete set null,
  gate_id        text not null references public.gates (id),
  direction      text check (direction in ('in', 'out')),          -- null = اتجاه غير مؤكد
  units          integer not null check (units > 0),
  reference_type text check (reference_type in ('PO', 'SO', 'COUNT')),
  reference_id   text,                                             -- رقم المستند (PO-2291 / SO-5512)
  flag           text check (flag in ('unconfirmed', 'unauthorized', 'no_po', 'unknown_tag', 'inactive_tag', 'unexpected')),
  created_at     timestamptz not null default now()
);
create index movements_created_idx on public.movements (created_at desc);
create index movements_gate_created_idx on public.movements (gate_id, created_at desc);
create index movements_product_idx on public.movements (product_id, created_at desc);
create index movements_reference_idx on public.movements (reference_type, reference_id, created_at desc);

-- ── أوامر الشراء: للمطابقة عند الاستلام ───────────────────────────────
create table public.purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  po_number   text not null unique,
  supplier_id uuid references public.suppliers (id),
  -- open: بانتظار الوصول · receiving: يُستلم الآن · received: مطابق · short: أُغلق بنقص
  status      text not null default 'open' check (status in ('draft', 'open', 'receiving', 'received', 'short', 'cancelled')),
  expected_at timestamptz,
  created_at  timestamptz not null default now()
);
create table public.po_lines (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders (id) on delete cascade,
  product_id   uuid not null references public.products (id),
  qty_expected integer not null check (qty_expected >= 0),
  qty_received integer not null default 0 check (qty_received >= 0),
  unique (po_id, product_id)
);

-- ── أوامر الصرف المصرح بها ─────────────────────────────────────────────
create table public.sales_orders (
  id          uuid primary key default gen_random_uuid(),
  so_number   text not null unique,
  destination text not null,
  status      text not null default 'open' check (status in ('open', 'shipped', 'cancelled')),
  created_at  timestamptz not null default now()
);
create table public.so_lines (
  id          uuid primary key default gen_random_uuid(),
  so_id       uuid not null references public.sales_orders (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  qty_ordered integer not null check (qty_ordered > 0),
  qty_shipped integer not null default 0 check (qty_shipped >= 0),
  unique (so_id, product_id)
);

-- ── مدخل التنبؤ (من نقاط البيع أو ملف Excel) ───────────────────────────
create table public.sales_daily (
  product_id uuid not null references public.products (id) on delete cascade,
  date       date not null,
  units_sold integer not null check (units_sold >= 0),
  primary key (product_id, date)
);

-- ── نتائج التنبؤ (تُعبأ في المرحلة 2) ──────────────────────────────────
create table public.forecasts (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  week_start      date not null,
  predicted_units numeric(12, 2) not null,
  lower           numeric(12, 2),
  upper           numeric(12, 2),
  season_note     text,
  generated_at    timestamptz not null default now(),
  unique (product_id, week_start)
);

-- ── التنبيهات ──────────────────────────────────────────────────────────
create table public.alerts (
  id         uuid primary key default gen_random_uuid(),
  severity   text not null check (severity in ('critical', 'warning', 'info', 'ok')),
  type       text not null check (type in ('stock', 'expiry', 'security', 'receipt', 'stale', 'scan')),
  title      text not null,
  body       text,
  entity_ref text,                                -- product:<id> · batch:<id> · gate:G5 · po:PO-2291
  status     text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alerts_status_idx on public.alerts (status, created_at desc);
create index alerts_entity_idx on public.alerts (type, entity_ref) where status <> 'resolved';

-- ── الجرد بالقارئ اليدوي (يُستخدم في المرحلة 2) ────────────────────────
create table public.cycle_counts (
  id           uuid primary key default gen_random_uuid(),
  zone_id      text not null references public.zones (id),
  started_at   timestamptz not null default now(),
  duration_sec numeric(10, 1),
  tags_read    integer not null default 0,
  status       text not null default 'in_progress' check (status in ('in_progress', 'completed', 'approved', 'cancelled'))
);
create table public.count_lines (
  id          uuid primary key default gen_random_uuid(),
  count_id    uuid not null references public.cycle_counts (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  system_qty  integer not null default 0,
  counted_qty integer not null default 0,
  diff        integer generated always as (counted_qty - system_qty) stored,
  reason      text
);

-- ── المستخدمون والصلاحيات (المصادقة في المرحلة 3) ─────────────────────
create table public.users (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin', 'manager', 'storekeeper', 'security', 'viewer'))
);

-- ════════════════════════════════════════════════════════════════════════
-- الأمان والبث اللحظي
-- الخادم يتصل مباشرة بقاعدة البيانات (DATABASE_URL) ولا يمر عبر RLS.
-- المتصفح يستخدم المفتاح العام فقط للاشتراك في Realtime، لذلك:
--   RLS مفعّل على كل الجداول بدون سياسات (لا وصول عام)،
--   ما عدا قراءة movements وalerts اللي يحتاجها البث اللحظي.
-- في المرحلة 3 (المصادقة) تُقصر هذه السياسات على المستخدمين المسجلين.
-- ════════════════════════════════════════════════════════════════════════
alter table public.zones enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.batches enable row level security;
alter table public.rfid_tags enable row level security;
alter table public.gates enable row level security;
alter table public.rfid_reads enable row level security;
alter table public.movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;
alter table public.sales_orders enable row level security;
alter table public.so_lines enable row level security;
alter table public.sales_daily enable row level security;
alter table public.forecasts enable row level security;
alter table public.alerts enable row level security;
alter table public.cycle_counts enable row level security;
alter table public.count_lines enable row level security;
alter table public.users enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create policy movements_realtime_read on public.movements for select to anon, authenticated using (true)';
    execute 'create policy alerts_realtime_read on public.alerts for select to anon, authenticated using (true)';
    execute 'grant select on public.movements, public.alerts to anon, authenticated';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.movements, public.alerts';
  end if;
end
$$;
