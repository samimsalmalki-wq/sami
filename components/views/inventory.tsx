"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useProducts } from "@/lib/client/queries";
import { formatCoverage, formatNumber, formatSAR } from "@/lib/format";
import type { StockStatus } from "@/lib/inventory/stock";
import { STATUS_LABELS, categoryLabel } from "@/lib/labels";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { EmptyRow, QueryError } from "../query-state";
import { Sparkline } from "../sparkline";
import { StockStatusBadge } from "../status";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ViewHeader } from "../view-header";

type Filter = "all" | StockStatus;
const FILTERS: Filter[] = ["all", "critical", "low", "stagnant", "healthy"];

export function InventoryView() {
  const products = useProducts();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      (products.data?.products ?? []).filter(
        (p) => (filter === "all" || p.status === filter) && matchesQuery(query, p.name_ar, p.name_en, p.sku),
      ),
    [products.data, filter, query],
  );
  const counts = products.data?.counts;
  const total = products.data?.products.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="المخزون اللحظي"
        description="الكميات تتحدث مع كل قراءة بوابة. التغطية = كم يوم يكفي المخزون حسب البيع المتوقع."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية حسب الحالة">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px]",
                filter === f ? "border-ink bg-ink text-background" : "border-line bg-surface hover:border-brand",
              )}
            >
              {f === "all" ? "الكل" : STATUS_LABELS[f]}
              <span className="num ms-1.5 opacity-70">{f === "all" ? total : (counts?.[f] ?? 0)}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[180px] max-w-[280px] flex-1">
          <span className="sr-only">ابحث عن صنف</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="ابحث عن صنف" value={query} onChange={(e) => setQuery(e.target.value)} className="ps-8" />
        </label>
      </div>

      {products.error ? <QueryError error={products.error} /> : null}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الصنف</TableHead>
              <TableHead>الموقع</TableHead>
              <TableHead>الكمية</TableHead>
              <TableHead>البيع (12 أسبوع)</TableHead>
              <TableHead>التغطية</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الطلب المقترح</TableHead>
              <TableHead>القيمة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.isLoading
              ? Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6" />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {products.data && rows.length === 0 ? <EmptyRow colSpan={8}>لا توجد أصناف مطابقة.</EmptyRow> : null}
            {rows.map((p) => (
              <TableRow key={p.id} className="hover:bg-sunk/60">
                <TableCell>
                  <Link href={`/inventory/${p.id}`} className="font-medium hover:underline">
                    {p.name_ar}
                  </Link>
                  <small className="block text-xs text-muted-foreground">
                    <span className="mono">{p.sku}</span> · {categoryLabel(p.category)}
                  </small>
                </TableCell>
                <TableCell>{p.zone?.name_ar ?? "—"}</TableCell>
                <TableCell className="num font-bold">{formatNumber(p.available)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Sparkline values={p.weekly_sales} label={`مبيعات ${p.name_ar} آخر 12 أسبوع`} />
                    <span className="num text-xs text-muted-foreground">{formatNumber(p.last_week_sales)}/أسبوع</span>
                  </div>
                </TableCell>
                <TableCell className="num">{formatCoverage(p.coverage_days ?? Infinity)}</TableCell>
                <TableCell>
                  <StockStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="num">
                  {p.suggested_order ? formatNumber(p.suggested_order) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="num">{formatSAR(p.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
