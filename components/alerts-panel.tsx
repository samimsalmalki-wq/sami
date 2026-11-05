"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { AlertsResponse } from "@/lib/api-types";
import { useUpdateAlert } from "@/lib/client/queries";
import { formatWhen } from "@/lib/format";
import { DERIVED_ALERT_TYPES } from "@/lib/inventory/alerts";
import { ALERT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useLive } from "./live-provider";
import { QueryError } from "./query-state";
import { SEVERITY_STRIPE, SeverityBadge } from "./status";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

/**
 * التنبيهات مرتبة حسب الخطورة، والجديد يومض.
 * تنبيهات المخزون والصلاحية تُغلق تلقائيًا لما يزول سببها، فما لها زر إغلاق (فقط «تم الاطلاع»).
 */
export function AlertsPanel({ query }: { query: UseQueryResult<AlertsResponse> }) {
  const { freshAlerts } = useLive();
  const update = useUpdateAlert();
  const alerts = query.data?.alerts ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader title="التنبيهات" aside={query.data ? `${alerts.length} تنبيه` : null} />
      {query.error ? <QueryError error={query.error} /> : null}
      {/* على الشاشات العريضة تملأ القائمة ارتفاع العمود وتتمرر داخله بدل ما تترك فراغ */}
      <div
        className="flex max-h-[470px] flex-col gap-2 overflow-auto min-[900px]:max-h-none min-[900px]:min-h-[320px] min-[900px]:flex-[1_1_0]"
        aria-live="polite"
      >
        {query.isLoading
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)
          : null}
        {query.data && alerts.length === 0 ? <p className="py-3 text-sm text-muted-foreground">لا توجد تنبيهات مفتوحة.</p> : null}
        {alerts.map((a) => {
          const derived = DERIVED_ALERT_TYPES.includes(a.type);
          return (
            <article
              key={a.id}
              className={cn(
                "grid grid-cols-[4px_1fr] gap-3 rounded-md bg-sunk p-2.5",
                freshAlerts.has(a.id) && "flash-bg",
                a.status === "acknowledged" && "opacity-75",
              )}
            >
              <span aria-hidden className={cn("rounded-sm", SEVERITY_STRIPE[a.severity])} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <h4 className="text-sm font-semibold">{a.title}</h4>
                  <span className="text-xs text-muted-foreground">
                    {ALERT_TYPE_LABELS[a.type]} · <span className="mono">{formatWhen(a.created_at)}</span>
                  </span>
                </div>
                {a.body ? <p className="mt-0.5 text-[13px] text-muted-foreground">{a.body}</p> : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={a.severity} />
                  {a.status === "acknowledged" ? <Badge tone="neutral">تم الاطلاع</Badge> : null}
                  <div className="ms-auto flex gap-1.5">
                    {a.status === "open" ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: a.id, status: "acknowledged" })}
                      >
                        تم الاطلاع
                      </Button>
                    ) : null}
                    {derived ? null : (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: a.id, status: "resolved" })}
                      >
                        إغلاق
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
