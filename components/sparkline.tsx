"use client";

import { Line, LineChart, Tooltip, YAxis, type DotItemDotProps } from "recharts";
import { formatNumber } from "@/lib/format";

/**
 * رسم مصغر لمبيعات 12 أسبوع: الخط بلون هادئ، والأسبوع الأخير نقطة بلون العلامة.
 * القيم كلها في aria-label (للقارئ الآلي)، والتلميح عند المرور يعرض قيمة الأسبوع.
 */

function weeksAgo(n: number): string {
  if (n === 0) return "آخر أسبوع";
  if (n === 1) return "قبل أسبوع";
  if (n === 2) return "قبل أسبوعين";
  return `قبل ${n} ${n <= 10 ? "أسابيع" : "أسبوعًا"}`;
}

interface Point {
  i: number;
  v: number;
}

function SparkTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div dir="rtl" className="whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-panel">
      <b className="num font-semibold text-ink">{formatNumber(p.v)}</b>
      <span className="ms-1.5 text-muted-foreground">{weeksAgo(11 - p.i)}</span>
    </div>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const data: Point[] = values.map((v, i) => ({ i, v }));
  const last = data.length - 1;
  const endDot = (props: DotItemDotProps) =>
    props.index === last && props.cx !== undefined && props.cy !== undefined ? (
      <circle key="end" cx={props.cx} cy={props.cy} r={4} fill="rgb(var(--brand))" stroke="rgb(var(--surface))" strokeWidth={2} />
    ) : (
      <g key={`p${props.index}`} />
    );

  return (
    <div dir="ltr" role="img" aria-label={`${label}: ${values.join("، ")}`} className="h-7 w-24 flex-none">
      <LineChart width={96} height={28} data={data} margin={{ top: 5, right: 6, bottom: 5, left: 4 }}>
        {/* المحور من الصفر: الصنف الثابت يظهر ثابتًا، والاتجاه الحقيقي (صعود القهوة، هبوط المروحة) يظهر بوضوح */}
        <YAxis hide domain={[0, "dataMax"]} />
        <Tooltip
          content={<SparkTooltip />}
          cursor={{ stroke: "rgb(var(--line))", strokeWidth: 1 }}
          isAnimationActive={false}
          allowEscapeViewBox={{ x: true, y: true }}
          position={{ y: -30 }}
          wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke="rgb(var(--muted))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={endDot}
          activeDot={{ r: 4, fill: "rgb(var(--brand))", stroke: "rgb(var(--surface))", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
