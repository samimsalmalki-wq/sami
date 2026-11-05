"use client";

import { useState } from "react";
import { useGates, useMovements } from "@/lib/client/queries";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DemoBar } from "../demo-bar";
import { GateCard } from "../gate-card";
import { useLive } from "../live-provider";
import { MovementsTable } from "../movements-table";
import { QueryError } from "../query-state";
import { Card, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ViewHeader } from "../view-header";

export function GatesView() {
  const gates = useGates();
  const [gate, setGate] = useState<string | null>(null);
  const movements = useMovements(gate);
  const { pulses } = useLive();
  const stats = movements.data?.stats;

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="بوابات RFID"
        description="كل كرتون عليه بطاقة UHF. البوابة تقرأ البطاقة وتحدد اتجاه الحركة بهوائيين، والنظام يحدّث المخزون فورًا ويطابق الحركة مع أوامر الشراء والصرف."
      />
      <DemoBar title="جرّب" />
      {gates.error ? <QueryError error={gates.error} /> : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {gates.data
          ? gates.data.gates.map((g) => <GateCard key={g.id} gate={g} pulse={pulses[g.id]} />)
          : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[150px] rounded-lg" />)}
      </div>

      <Card>
        <CardHeader
          title="سجل القراءات"
          aside={
            stats ? (
              <>
                قراءات خام <b className="num font-semibold text-ink">{formatNumber(stats.raw)}</b> · مكرر مُرشَّح{" "}
                <b className="num font-semibold text-ink">{formatNumber(stats.duplicates)}</b>
              </>
            ) : null
          }
        />
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="تصفية حسب البوابة">
          {[{ id: null, name_ar: "كل البوابات" }, ...(gates.data?.gates ?? [])].map((g) => (
            <button
              key={g.id ?? "all"}
              type="button"
              aria-pressed={gate === g.id}
              onClick={() => setGate(g.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px]",
                gate === g.id ? "border-ink bg-ink text-background" : "border-line bg-surface hover:border-brand",
              )}
            >
              {g.name_ar}
              {g.id ? (
                <>
                  {" "}
                  <span className="mono text-[11px] opacity-70">{g.id}</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        {movements.error ? <QueryError error={movements.error} /> : null}
        <MovementsTable
          movements={movements.data?.movements}
          loading={movements.isLoading}
          empty="لا توجد قراءات اليوم لهذه البوابة."
          className={cn(movements.isPlaceholderData && "opacity-60")}
        />
      </Card>
    </div>
  );
}
