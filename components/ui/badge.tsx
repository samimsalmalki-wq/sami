import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** شارة الحالة: لون + كلمة دائمًا (ما نعتمد على اللون وحده) */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-px text-xs font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        crit: "bg-crit-soft text-crit-ink",
        warn: "bg-warn-soft text-warn-ink",
        ok: "bg-ok-soft text-ok-ink",
        stale: "bg-stale-soft text-stale-ink",
        info: "bg-brand-soft text-brand",
        signal: "bg-signal-soft text-signal-ink",
        neutral: "bg-sunk text-muted-foreground ring-1 ring-inset ring-line",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
