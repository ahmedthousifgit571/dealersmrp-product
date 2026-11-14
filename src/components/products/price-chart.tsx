"use client";

import { CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, formatShortDate } from "@/lib/format";
import { formatINR, type Paise } from "@/lib/money";

type Point = { at: string; dealer: Paise; mrp: Paise };

const compactInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Dealer price and MRP over time as step lines (a price holds until the next change).
 * One ₹ axis: both series are the same unit. Legend + direct end labels, crosshair tooltip.
 */
function renderEndLabel(
  text: string,
  lastIndex: number,
  props: { x?: unknown; y?: unknown; index?: number; value?: unknown },
) {
  const { x, y, index, value } = props;
  if (index !== lastIndex || typeof x !== "number" || typeof y !== "number") return null;
  return (
    <text x={x - 4} y={y - 8} textAnchor="end" className="fill-foreground text-[11px] font-medium">
      {text} {formatINR(Math.round(Number(value) * 100))}
    </text>
  );
}

export function PriceChart({ points, showDealer, asOf }: { points: Point[]; showDealer: boolean; asOf: string }) {
  // Oldest first, extended to "now" so the current price reads as a flat run to the right edge.
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const last = sorted[sorted.length - 1];
  const data = [
    ...sorted.map((p) => ({ t: new Date(p.at).getTime(), dealer: p.dealer / 100, mrp: p.mrp / 100 })),
    ...(last ? [{ t: new Date(asOf).getTime(), dealer: last.dealer / 100, mrp: last.mrp / 100 }] : []),
  ];
  const lastIndex = data.length - 1;

  const config = {
    mrp: { label: "MRP", color: "var(--viz-mrp)" },
    ...(showDealer ? { dealer: { label: "Dealer (ex GST)", color: "var(--viz-dealer)" } } : {}),
  } satisfies ChartConfig;

  const values = data.flatMap((d) => (showDealer ? [d.dealer, d.mrp] : [d.mrp]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, max * 0.04);


  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={data} margin={{ top: 22, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="0" className="stroke-border/60" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t: number) => formatShortDate(new Date(t))}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={36}
        />
        <YAxis
          domain={[Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]}
          tickFormatter={(v: number) => compactInr.format(v)}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t as number | undefined;
                return t ? formatDate(new Date(t)) : "";
              }}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                  <span className="font-mono font-medium text-foreground">{formatINR(Math.round(Number(value) * 100))}</span>
                </div>
              )}
            />
          }
        />
        {showDealer ? <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="left" /> : null}
        <Line dataKey="mrp" type="stepAfter" stroke="var(--color-mrp)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false}>
          <LabelList content={(p) => renderEndLabel("MRP", lastIndex, p)} />
        </Line>
        {showDealer ? (
          <Line dataKey="dealer" type="stepAfter" stroke="var(--color-dealer)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false}>
            <LabelList content={(p) => renderEndLabel("Dealer", lastIndex, p)} />
          </Line>
        ) : null}
      </LineChart>
    </ChartContainer>
  );
}
