"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { HistoryFilters } from "@/lib/history";

const ALL = "__all";
const SOURCES = [
  { value: ALL, label: "All sources" },
  { value: "INVOICE_OCR", label: "Invoices" },
  { value: "EXCEL_BULK", label: "Excel imports" },
  { value: "MANUAL", label: "Manual edits" },
];

function useUrlUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { update, pending };
}

export function HistoryFiltersBar({ filters, exportHref }: { filters: HistoryFilters; exportHref: string }) {
  const { update, pending } = useUrlUpdater();
  const [q, setQ] = useState(filters.q ?? "");

  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const id = window.setTimeout(() => update({ q }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <InputGroup className="h-10 lg:max-w-xs">
        <InputGroupAddon>{pending ? <Spinner /> : <Search />}</InputGroupAddon>
        <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, supplier or invoice no." aria-label="Search history" />
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.source ?? ALL} onValueChange={(v) => update({ source: String(v) })} items={SOURCES}>
          <SelectTrigger className="h-10 min-w-40" aria-label="Source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input type="date" className="h-10 w-40" value={filters.from ?? ""} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input type="date" className="h-10 w-40" value={filters.to ?? ""} onChange={(e) => update({ to: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={filters.kind === "all"}
            onChange={(e) => update({ kind: e.target.checked ? "all" : null })}
          />
          Include opening prices
        </label>
      </div>
      <a href={exportHref} className={buttonVariants({ variant: "outline", className: "lg:ml-auto" })}>
        <Download data-icon="inline-start" /> Export
      </a>
    </div>
  );
}

export function HistoryPager({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const { update } = useUrlUpdater();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{total} changes</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
          <ChevronLeft data-icon="inline-start" /> Newer
        </Button>
        <span className="font-mono text-xs">
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => update({ page: String(page + 1) }, false)}>
          Older <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
