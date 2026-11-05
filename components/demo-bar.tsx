"use client";

import { LoaderCircle, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { useDemo } from "./demo-provider";

const SCENARIOS = [
  { name: "short_shipment", label: "وصول شحنة ناقصة" },
  { name: "unauthorized_exit", label: "خروج بضاعة بدون إذن" },
  { name: "dispatch", label: "شحن طلب لفرع" },
] as const;

/** شريط سيناريوهات العرض (للمسؤول؛ يظهر فقط مع SIMULATOR_ENABLED=true) */
export function DemoBar({ title = "سيناريوهات العرض" }: { title?: string }) {
  const demo = useDemo();
  if (!demo.enabled) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-signal/35 bg-signal-soft px-3.5 py-3">
      <strong className="me-1 text-sm">{title}</strong>
      {SCENARIOS.map((s) => (
        <Button
          key={s.name}
          variant="outline"
          size="sm"
          disabled={demo.running !== null}
          onClick={() => void demo.run(s.name)}
        >
          {demo.running === s.name ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {s.label}
        </Button>
      ))}
      <Button variant={demo.live ? "signal" : "outline"} size="sm" aria-pressed={demo.live} onClick={demo.toggleLive}>
        {demo.live ? <Pause aria-hidden /> : <Play aria-hidden />}
        {demo.live ? "إيقاف الحركة المستمرة" : "تشغيل الحركة المستمرة"}
      </Button>
    </div>
  );
}
