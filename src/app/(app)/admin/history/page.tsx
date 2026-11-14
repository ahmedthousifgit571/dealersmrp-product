import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, FileScan, History as HistoryIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SourceBadge } from "@/components/products/source-badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDateTime, formatPct } from "@/lib/format";
import { listHistory, parseHistoryFilters } from "@/lib/history";
import { formatINR, type Paise } from "@/lib/money";
import { changePct } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { HistoryFiltersBar, HistoryPager } from "./history-filters";

export const metadata: Metadata = { title: "Price history" };

export default function HistoryPage({ searchParams }: PageProps<"/admin/history">) {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Price history"
        description="Every dealer price and MRP change, with who made it and where it came from."
      />
      <Suspense fallback={<Skeleton className="h-[560px] rounded-xl" />}>
        <HistoryData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Change({ from, to }: { from: Paise | null; to: Paise }) {
  if (from === null) return <span className="font-mono">{formatINR(to)}</span>;
  if (from === to) return <span className="font-mono text-muted-foreground">{formatINR(to)}</span>;
  const pct = changePct(from, to);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 font-mono whitespace-nowrap">
      <span className="text-muted-foreground">{formatINR(from)}</span>
      <ArrowRight className="size-3 text-muted-foreground" />
      <span>{formatINR(to)}</span>
      <span className={cn("text-xs", to > from ? "text-warning-foreground" : "text-success-foreground")}>{formatPct(pct)}</span>
    </span>
  );
}

async function HistoryData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const filters = parseHistoryFilters(await searchParams);
  const { rows, total, page, pageCount } = await listHistory(filters);
  const exportQs = new URLSearchParams(
    Object.entries({ source: filters.source, q: filters.q, from: filters.from, to: filters.to, kind: filters.kind }).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
    ),
  ).toString();

  return (
    <div className="space-y-3">
      <HistoryFiltersBar filters={filters} exportHref={`/api/export/history${exportQs ? `?${exportQs}` : ""}`} />
      {rows.length === 0 ? (
        <Empty className="clay-well rounded-2xl border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No price changes match</EmptyTitle>
            <EmptyDescription>Try a wider date range or clear the filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="clay-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/60 hover:bg-surface/60">
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Dealer (ex GST)</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="pr-4">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="py-2.5 pl-4 whitespace-nowrap">
                      <span className="block text-sm">{formatDateTime(h.at)}</span>
                      <span className="text-xs text-muted-foreground">{h.changedBy ?? "System"}</span>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <Link href={`/products/${h.productId}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {h.productName}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{h.skuCode}</span>
                    </TableCell>
                    <TableCell>
                      <Change from={h.oldDealer} to={h.newDealer} />
                    </TableCell>
                    <TableCell>
                      <Change from={h.oldMrp} to={h.newMrp} />
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={h.source} />
                    </TableCell>
                    <TableCell className="max-w-72 pr-4 text-sm text-muted-foreground">
                      {h.invoiceScanId ? (
                        <Link href={`/invoices/${h.invoiceScanId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <FileScan className="size-3.5" /> {h.supplierName ?? "Invoice"}
                          {h.invoiceNumber ? ` · ${h.invoiceNumber}` : ""}
                        </Link>
                      ) : h.supplierName ? (
                        <span className="block truncate">
                          {h.supplierName}
                          {h.invoiceNumber ? <span className="font-mono"> · {h.invoiceNumber}</span> : null}
                        </span>
                      ) : null}
                      {h.note ? <span className="block truncate">{h.note}</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <HistoryPager page={page} pageCount={pageCount} total={total} />
    </div>
  );
}
