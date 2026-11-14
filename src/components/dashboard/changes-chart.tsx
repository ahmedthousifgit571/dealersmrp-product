"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatShortDate } from "@/lib/format";

const config = {
  INVOICE_OCR: { label: "Invoice", color: "var(--viz-invoice)" },
  EXCEL_BULK: { label: "Excel", color: "var(--viz-excel)" },
  MANUAL: { label: "Manual", color: "var(--viz-manual)" },
} satisfies ChartConfig;

type Row = { day: string; source: string; n: number };

/** Price changes per day for the last 30 days, stacked by where they came from. */
export function ChangesChart({ rows }: { rows: Row[] }) {
  const days: { day: string; INVOICE_OCR: number; EXCEL_BULK: number; MANUAL: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d); // YYYY-MM-DD
    days.push({ day: key, INVOICE_OCR: 0, EXCEL_BULK: 0, MANUAL: 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (d && (r.source === "INVOICE_OCR" || r.source === "EXCEL_BULK" || r.source === "MANUAL")) d[r.source] += r.n;
  }
  const total = rows.reduce((s, r) => s + r.n, 0);

  if (total === 0) {
    return (
      <div className="clay-well flex h-56 items-center justify-center rounded-xl text-sm text-muted-foreground">
        No price changes in the last 30 days.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={days} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%" accessibilityLayer>
        <CartesianGrid vertical={false} className="stroke-border/60" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(d: string) => formatShortDate(new Date(`${d}T12:00:00+05:30`))}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={<ChartTooltipContent labelFormatter={(d) => formatShortDate(new Date(`${String(d)}T12:00:00+05:30`))} />}
        />
        <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="left" />
        <Bar dataKey="INVOICE_OCR" stackId="s" fill="var(--color-INVOICE_OCR)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="EXCEL_BULK" stackId="s" fill="var(--color-EXCEL_BULK)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="MANUAL" stackId="s" fill="var(--color-MANUAL)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
