"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useProduct } from "@/lib/client/queries";
import { formatCoverage, formatDate, formatDays, formatNumber, formatSAR, formatWhen } from "@/lib/format";
import { TAG_LEVEL_LABELS, categoryLabel } from "@/lib/labels";
import { Kpi, KpiGrid, KpiSkeleton } from "../kpi";
import { MovementsTable } from "../movements-table";
import { EmptyRow, QueryError } from "../query-state";
import { StockStatusBadge } from "../status";
import { Badge } from "../ui/badge";
import { Card, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const ACTION_LABELS = { none: "سيُباع قبل الانتهاء", discount: "خصم 30٪", transfer: "نقل لفرع أعلى طلبًا" } as const;
const ACTION_TONE = { none: "ok", discount: "crit", transfer: "warn" } as const;

export function ProductDetailView({ id }: { id: string }) {
  const { data, error, isLoading } = useProduct(id);
  const p = data?.product;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/inventory" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowRight className="size-4" aria-hidden />
        المخزون
      </Link>

      {error ? <QueryError error={error} /> : null}

      {p ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium">{p.name_ar}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="mono">{p.sku}</span> · {categoryLabel(p.category)} · {p.zone?.name_ar ?? "بدون موقع"} · الكرتون{" "}
              {formatNumber(p.pack_size)} وحدة · التوريد {formatDays(p.lead_time_days)}
            </p>
          </div>
          <StockStatusBadge status={p.status} />
        </div>
      ) : isLoading ? (
        <Skeleton className="h-12 w-72" />
      ) : null}

      <KpiGrid>
        {p ? (
          <>
            <Kpi label="المتوفر" value={formatNumber(p.available)} sub="مجموع الدفعات" />
            <Kpi label="البيع المتوقع الأسبوع القادم" value={formatNumber(p.forecast_next_week)} sub={`آخر أسبوع ${formatNumber(p.last_week_sales)}`} />
            <Kpi label="التغطية" value={formatCoverage(p.coverage_days ?? Infinity)} sub="حسب البيع المتوقع" />
            <Kpi
              label="الطلب المقترح"
              value={p.suggested_order ? formatNumber(p.suggested_order) : "لا حاجة"}
              sub={`مقرّب لحجم الكرتون (${p.pack_size})`}
            />
            <Kpi label="الوارد" value={formatNumber(p.incoming)} sub="في أوامر شراء مفتوحة" />
            <Kpi label="القيمة" value={formatSAR(p.value)} sub="بسعر التكلفة" />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </KpiGrid>

      <Card className="p-0">
        <CardHeader title="الدفعات" aside="مرتبة بقاعدة FEFO (الأقرب انتهاءً أولًا)" className="px-4 pt-4" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الدفعة</TableHead>
              <TableHead>الكمية</TableHead>
              <TableHead>تاريخ الانتهاء</TableHead>
              <TableHead>المتبقي</TableHead>
              <TableHead>المتوقع</TableHead>
              <TableHead>الموقع</TableHead>
              <TableHead>تاريخ الاستلام</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && data.batches.length === 0 ? <EmptyRow colSpan={7}>لا توجد دفعات بكمية متوفرة.</EmptyRow> : null}
            {data?.batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="mono text-[13px]">{b.lot_number ?? "—"}</TableCell>
                <TableCell className="num font-semibold">{formatNumber(b.quantity)}</TableCell>
                <TableCell className="num">{b.expiry_date ? formatDate(b.expiry_date) : <span className="text-muted-foreground">بدون انتهاء</span>}</TableCell>
                <TableCell className="num">{b.remaining_days === null ? "—" : formatDays(b.remaining_days)}</TableCell>
                <TableCell>
                  {b.action ? (
                    <Badge tone={ACTION_TONE[b.action]}>
                      {b.action === "none" ? ACTION_LABELS.none : `فائض ${formatNumber(b.surplus ?? 0)} · ${ACTION_LABELS[b.action]}`}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{b.zone?.name_ar ?? "—"}</TableCell>
                <TableCell className="num">{formatDate(b.received_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="مواقع البطاقات"
          aside={
            data
              ? `${formatNumber(data.tags.items.length)} بطاقة نشطة · مصروفة ${data.tags.inactive.sold} · مفقودة ${data.tags.inactive.missing}`
              : null
          }
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {data?.tags.by_zone.map((z) => (
            <span key={z.zone?.id ?? "none"} className="rounded-md border border-line bg-sunk px-2.5 py-1.5 text-[13px]">
              <b className="font-semibold">{z.zone?.name_ar ?? "بدون موقع"}</b>
              <span className="num ms-1.5 text-muted-foreground">
                {formatNumber(z.tags)} بطاقة · {formatNumber(z.units)} وحدة
              </span>
            </span>
          ))}
        </div>
        <div className="max-h-[320px] overflow-auto rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم البطاقة (EPC)</TableHead>
                <TableHead>المستوى</TableHead>
                <TableHead>الوحدات</TableHead>
                <TableHead>آخر موقع</TableHead>
                <TableHead>آخر قراءة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data && data.tags.items.length === 0 ? <EmptyRow colSpan={5}>لا توجد بطاقات نشطة.</EmptyRow> : null}
              {data?.tags.items.map((t) => (
                <TableRow key={t.epc}>
                  <TableCell className="mono text-[13px]">{t.epc}</TableCell>
                  <TableCell>{TAG_LEVEL_LABELS[t.level]}</TableCell>
                  <TableCell className="num">{t.units}</TableCell>
                  <TableCell>{t.zone?.name_ar ?? "—"}</TableCell>
                  <TableCell className="mono text-[13px]">{t.last_seen_at ? formatWhen(t.last_seen_at) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader title="الحركات" aside="آخر 50 حركة" />
        <MovementsTable movements={data?.movements} loading={isLoading} showProduct={false} empty="لا توجد حركات لهذا الصنف." />
      </Card>
    </div>
  );
}
