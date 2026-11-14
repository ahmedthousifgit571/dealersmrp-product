"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, PackagePlus, Search, SkipForward, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { RowStatus } from "@/lib/invoice/review";
import type { ProductSnapshot } from "@/lib/invoice/schema";
import { formatINR, parseMoney, toDecimalString, type Paise } from "@/lib/money";
import type { ProductHit } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<RowStatus, { label: string; variant: "success" | "warning" | "info" | "muted" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
  same: { label: "Same price", variant: "success", icon: CheckCircle2 },
  changed: { label: "Price change", variant: "warning", icon: TrendingUp },
  new: { label: "New product", variant: "info", icon: PackagePlus },
  review: { label: "Check match", variant: "outline", icon: CircleDashed },
  skip: { label: "Skipped", variant: "muted", icon: SkipForward },
};

export function RowStatusBadge({ status }: { status: RowStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={meta.variant} className={cn(status === "review" && "border-warning/50 text-warning-foreground")}>
      <meta.icon data-icon="inline-start" />
      {meta.label}
    </Badge>
  );
}

const asText = (p: Paise | null) => (p === null ? "" : toDecimalString(p).replace(/\.00$/, ""));

/** ₹ input that keeps whatever the user is typing and reports paise on blur / Enter. */
export function MoneyInput({
  value,
  onCommit,
  label,
  invalid,
  disabled,
  className,
}: {
  value: Paise | null;
  onCommit: (v: Paise | null) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(asText(value));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(asText(value));
    }
  }, [value]);
  const commit = () => {
    const parsed = text.trim() === "" ? null : parseMoney(text);
    if (parsed === null && text.trim() !== "") {
      setText(asText(value));
      return;
    }
    if (parsed !== value) {
      lastValue.current = parsed;
      onCommit(parsed);
    }
  };
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
      <input
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "clay-input h-9 w-full rounded-xl pr-2 pl-6 text-right font-mono text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60",
          invalid && "border-destructive ring-3 ring-destructive/15",
        )}
      />
    </div>
  );
}

export type PickedProduct = { id: string; snapshot: ProductSnapshot };

/** Search-and-pick an existing product for an invoice line. */
export function ProductPicker({
  onPick,
  initialQuery,
  trigger,
}: {
  onPick: (p: PickedProduct) => void;
  initialQuery: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults(((await res.json()) as { results: ProductHit[] }).results.slice(0, 8));
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b px-3">
          {loading ? <Spinner className="text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, model, SKU…"
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto p-1">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{q.trim() ? (loading ? "Searching…" : "No products found.") : "Type to search."}</li>
          ) : (
            results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({
                      id: p.id,
                      snapshot: {
                        name: p.name,
                        skuCode: p.skuCode,
                        dealer: p.dealerPrice ?? 0,
                        mrp: p.mrp,
                        gstPct: p.gstPct,
                        stockQty: p.stockQty,
                        archived: false,
                      },
                    });
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {p.skuCode}
                      {p.modelNumber ? ` · ${p.modelNumber}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className="block text-muted-foreground">DP {formatINR(p.dealerPrice)}</span>
                    <span className="block text-success">MRP {formatINR(p.mrp)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function IssueList({ issues, warnings }: { issues: string[]; warnings: string[] }) {
  if (!issues.length && !warnings.length) return null;
  return (
    <ul className="space-y-1 text-xs">
      {issues.map((m) => (
        <li key={m} className="flex items-start gap-1.5 text-destructive">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {m}
        </li>
      ))}
      {warnings.map((m) => (
        <li key={m} className="flex items-start gap-1.5 text-warning-foreground">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {m}
        </li>
      ))}
    </ul>
  );
}

export function MatchLabel({
  by,
  confirmed = false,
}: {
  by: "alias" | "barcode" | "model" | "suggestion" | "manual" | null;
  confirmed?: boolean;
}) {
  if (!by) return null;
  if (by === "suggestion" && confirmed) return <span className="text-xs text-muted-foreground">confirmed by you</span>;
  const text = {
    alias: "matched by supplier wording",
    barcode: "matched by barcode",
    model: "matched by model number",
    suggestion: "suggested",
    manual: "picked by you",
  }[by];
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

export function SmallButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="xs" variant="outline" {...props} />;
}
