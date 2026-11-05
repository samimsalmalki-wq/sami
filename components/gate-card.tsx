"use client";

import { ShieldAlert } from "lucide-react";
import type { GateItem } from "@/lib/api-types";
import { formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function AntennaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M12 13v8" />
      <circle cx="12" cy="11" r="2" />
      <path d="M8 7a6 6 0 0 0 0 8M16 7a6 6 0 0 1 0 8" />
    </svg>
  );
}

/**
 * بطاقة البوابة: الاسم، الدور، عداد الدخول والخروج اليوم، آخر قراءة، حالة الاتصال، ونبضة مع كل قراءة.
 * البوابة تتحول للأحمر ما دام عليها تنبيه أمني مفتوح (خروج غير مصرح).
 */
export function GateCard({ gate, pulse }: { gate: GateItem; pulse: number | undefined }) {
  return (
    <section
      aria-label={gate.name_ar}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-lg border bg-surface p-3.5 transition-colors",
        gate.type === "restricted" && "border-dashed",
        gate.alarm ? "border-crit bg-crit-soft" : "border-line",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span key={pulse ?? 0} className={cn("gate-ant relative grid size-[34px] flex-none place-items-center", pulse && "gate-hit")}>
          <i />
          <i />
          <AntennaIcon className={cn("relative size-[22px]", gate.alarm ? "text-crit" : "text-signal")} />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">
            {gate.name_ar} <span className="mono text-[11px] font-normal text-muted-foreground">{gate.id}</span>
          </h4>
          <p className="text-xs text-muted-foreground">{gate.role_ar}</p>
        </div>
      </div>

      <div className="mt-2.5 flex gap-5 text-[13px] text-muted-foreground">
        <div>
          <b className="num block font-display text-lg font-medium text-ink">{formatNumber(gate.today.in)}</b>
          دخول
        </div>
        <div>
          <b className="num block font-display text-lg font-medium text-ink">{formatNumber(gate.today.out)}</b>
          خروج
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {gate.last_read ? (
            <>
              <span className="mono">{formatTime(gate.last_read.at)}</span> · {gate.last_read.product_name}
            </>
          ) : (
            "بانتظار قراءة"
          )}
        </span>
        <span className="flex flex-none items-center gap-1">
          <span aria-hidden className={cn("size-2 rounded-full", gate.is_online ? "bg-ok" : "bg-muted-foreground")} />
          {gate.is_online ? "متصل" : "غير متصل"}
        </span>
      </div>

      {gate.alarm ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-crit-ink" role="alert">
          <ShieldAlert className="size-3.5" aria-hidden />
          إنذار: خروج غير مصرح
        </p>
      ) : null}
    </section>
  );
}
