"use client";

import Link from "next/link";
import type { MovementItem, ReorderItem } from "@/lib/api-types";
import { useAlerts, useSummary } from "@/lib/client/queries";
import { formatCoverage, formatNumber, formatSAR, formatWhen } from "@/lib/format";
import { AlertsPanel } from "../alerts-panel";
import { DemoBar } from "../demo-bar";
import { useDemo } from "../demo-provider";
import { Kpi, KpiGrid, KpiSkeleton } from "../kpi";
import { QueryError } from "../query-state";
import { DirectionLabel, StockStatusBadge } from "../status";
import { Card, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export function OverviewView() {
  const summary = useSummary();
  const alerts = useAlerts();
  const k = summary.data?.kpis;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="sr-only">نظرة عامة</h2>
      <DemoBar />
      {summary.error ? <QueryError error={summary.error} /> : null}

      <KpiGrid>
        {k ? (
          <>
            <Kpi
              label="قيمة المخزون"
              value={formatSAR(k.stock_value)}
              sub={`${k.product_count} صنف · ${formatNumber(k.total_units)} وحدة · بالتكلفة`}
            />
            <Kpi
              label="أصناف تحت الحد"
              value={formatNumber(k.below_threshold)}
              sub={`منها ${formatNumber(k.critical)} حرج`}
              tone={k.critical ? "crit" : k.below_threshold ? "warn" : null}
            />
            <Kpi
              label="رأس مال راكد"
              value={formatSAR(k.stagnant_value)}
              sub="تغطية أكثر من 60 يوم"
              tone={k.stagnant_value ? "stale" : null}
            />
            <Kpi
              label="معرض للهدر"
              value={formatSAR(k.value_at_risk)}
              sub="قبل انتهاء الصلاحية خلال 30 يوم"
              tone={k.value_at_risk ? "warn" : null}
            />
            <Kpi
              label="قراءات RFID اليوم"
              value={formatNumber(k.reads_today)}
              sub={`مكرر مُرشَّح: ${formatNumber(k.duplicates_today)}`}
              live
            />
            <Kpi
              label="تنبيهات أمنية"
              value={formatNumber(k.security_open)}
              sub={k.security_open ? "تحتاج مراجعة" : "لا يوجد"}
              tone={k.security_open ? "crit" : null}
            />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </KpiGrid>

      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AlertsPanel query={alerts} />
        <div className="flex min-w-0 flex-col gap-4">
          <ReorderPanel items={summary.data?.reorder} />
          <RecentReadsPanel reads={summary.data?.recent_reads} />
        </div>
      </div>
    </div>
  );
}

function ReorderPanel({ items }: { items: ReorderItem[] | undefined }) {
  return (
    <Card>
      <CardHeader title="يحتاج طلب شراء" aside="حسب التنبؤ" />
      {!items ? <Skeleton className="h-24" /> : null}
      {items && items.length === 0 ? <p className="py-2 text-sm text-muted-foreground">لا توجد طلبات مقترحة الآن.</p> : null}
      <ul className="flex flex-col">
        {items?.map((r) => (
          <li key={r.id} className="border-b border-line last:border-0">
            <Link href={`/inventory/${r.id}`} className="flex items-center justify-between gap-2.5 py-2.5 text-sm hover:bg-sunk/60">
              <span className="min-w-0">
                {r.name_ar}
                <small className="block text-xs text-muted-foreground">يكفي {formatCoverage(r.coverage_days ?? Infinity)}</small>
              </span>
              <span className="flex flex-none flex-col items-end gap-1">
                <span>
                  <b className="num">{formatNumber(r.suggested_order)}</b> <span className="text-xs text-muted-foreground">وحدة</span>
                </span>
                <StockStatusBadge status={r.status} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentReadsPanel({ reads }: { reads: MovementItem[] | undefined }) {
  const demo = useDemo();
  return (
    <Card>
      <CardHeader
        title="آخر قراءات البوابات"
        aside={
          demo.live ? (
            <span className="flex items-center gap-1.5 text-signal-ink">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal" />
              الحركة المستمرة تعمل
            </span>
          ) : (
            <Link href="/gates" className="hover:underline">
              سجل القراءات
            </Link>
          )
        }
      />
      {!reads ? <Skeleton className="h-24" /> : null}
      {reads && reads.length === 0 ? <p className="py-2 text-sm text-muted-foreground">لا قراءات بعد.</p> : null}
      <ul className="flex flex-col">
        {reads?.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2.5 border-b border-line py-2.5 text-sm last:border-0">
            <span className="min-w-0">
              {m.product.name_ar}
              <small className="block text-xs text-muted-foreground">
                {m.gate.name_ar} · <span className="mono">{formatWhen(m.created_at)}</span>
              </small>
            </span>
            <DirectionLabel direction={m.direction} units={m.units} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
