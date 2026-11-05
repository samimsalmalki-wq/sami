import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

export type KpiTone = "crit" | "warn" | "stale" | null;

const TONE_TEXT: Record<Exclude<KpiTone, null>, string> = {
  crit: "text-crit",
  warn: "text-warn",
  stale: "text-stale",
};

/** بطاقة مؤشر: العنوان، القيمة، وسطر توضيحي */
export function Kpi({
  label,
  value,
  sub,
  tone = null,
  live = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tone?: KpiTone;
  /** نقطة كهرمانية = قراءة RFID حية */
  live?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {live ? <span aria-hidden className="size-2 rounded-full bg-signal" /> : null}
        {label}
      </span>
      <span className={cn("num font-display text-2xl font-bold leading-snug", tone && TONE_TEXT[tone])}>{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3.5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>;
}
