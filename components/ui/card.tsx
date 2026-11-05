import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-w-0 rounded-lg border border-line bg-surface p-4 shadow-panel", className)} {...props} />
));
Card.displayName = "Card";

export function CardHeader({
  title,
  aside,
  className,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <h3 className="font-display text-base font-medium">{title}</h3>
      {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      {children}
    </div>
  );
}
