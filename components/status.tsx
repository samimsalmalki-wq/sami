import { CircleCheck, Hourglass, Info, OctagonAlert, ShieldAlert, TriangleAlert } from "lucide-react";
import type { MovementItem } from "@/lib/api-types";
import type { Severity } from "@/lib/inventory/alerts";
import type { StockStatus } from "@/lib/inventory/stock";
import { FLAG_LABELS, SEVERITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

/**
 * الحالة تظهر كشارة ملونة مع كلمة وأيقونة مختلفة لكل حالة:
 * الأحمر (حرج) والبرتقالي (منخفض) متقاربان لعمى الألوان، فالكلمة والأيقونة هي اللي تفرّق.
 */

const STATUS_TONE = { critical: "crit", low: "warn", stagnant: "stale", healthy: "ok" } as const;
const STATUS_ICON = { critical: OctagonAlert, low: TriangleAlert, stagnant: Hourglass, healthy: CircleCheck } as const;

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]}>
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const SEVERITY_TONE = { critical: "crit", warning: "warn", info: "info", ok: "ok" } as const;
const SEVERITY_ICON = { critical: OctagonAlert, warning: TriangleAlert, info: Info, ok: CircleCheck } as const;

export function SeverityBadge({ severity }: { severity: Severity }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      <Icon aria-hidden />
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

export const SEVERITY_STRIPE: Record<Severity, string> = {
  critical: "bg-crit",
  warning: "bg-warn",
  info: "bg-brand",
  ok: "bg-ok",
};

export function DirectionLabel({ direction, units }: { direction: MovementItem["direction"]; units?: number }) {
  const label = direction === "in" ? "دخول" : direction === "out" ? "خروج" : "غير مؤكد";
  return (
    <span
      className={cn(
        "font-semibold",
        direction === "in" && "text-ok-ink",
        direction === "out" && "text-warn-ink",
        direction === null && "font-normal text-muted-foreground",
      )}
    >
      {label}
      {units !== undefined ? <span className="num"> {units}</span> : null}
    </span>
  );
}

/** عمود المرجع في سجل القراءات: أمر الشراء/الصرف، أو «غير مصرح»، أو «نقل داخلي» */
export function MovementReference({ movement: m }: { movement: MovementItem }) {
  if (m.flag === "unauthorized") {
    return (
      <Badge tone="crit">
        <ShieldAlert aria-hidden />
        {FLAG_LABELS.unauthorized}
      </Badge>
    );
  }
  if (m.flag === "unconfirmed") return <Badge tone="neutral">{FLAG_LABELS.unconfirmed}</Badge>;
  if (m.flag) return <Badge tone="warn">{FLAG_LABELS[m.flag]}</Badge>;
  if (m.reference_id) return <span className="mono text-[13px]">{m.reference_id}</span>;
  return <span className="text-muted-foreground">{m.gate.type === "transfer" ? "نقل داخلي" : "—"}</span>;
}
