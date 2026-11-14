import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Boxes, CalendarClock, FileScan, Quote } from "lucide-react";
import { ProductActions } from "@/components/products/product-actions";
import { PriceChart } from "@/components/products/price-chart";
import { SourceBadge } from "@/components/products/source-badge";
import { AliasList } from "@/components/products/alias-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatPct, timeAgo } from "@/lib/format";
import { formatINR, type Paise } from "@/lib/money";
import { changePct } from "@/lib/pricing";
import { getProductDetail, redactDetail } from "@/lib/products/admin-queries";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

export default function ProductPage({ params }: PageProps<"/products/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 md:px-8 md:py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Price Finder
      </Link>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductData params={params} />
      </Suspense>
    </main>
  );
}

function Change({ from, to }: { from: Paise | null; to: Paise }) {
  if (from === null) return <span className="font-mono">{formatINR(to)}</span>;
  if (from === to) return <span className="font-mono text-muted-foreground">{formatINR(to)}</span>;
  const pct = changePct(from, to);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 font-mono">
      <span className="text-muted-foreground line-through decoration-muted-foreground/40">{formatINR(from)}</span>
      <ArrowRight className="size-3 text-muted-foreground" />
      <span>{formatINR(to)}</span>
      <span className={cn("text-xs", to > from ? "text-warning-foreground" : "text-success-foreground")}>{formatPct(pct)}</span>
    </span>
  );
}

async function ProductData({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [settings, detail] = await Promise.all([getSettings(), getProductDetail(id)]);
  if (!detail) notFound();
  const isAdmin = user.role === "ADMIN";
  const canSeeDealer = isAdmin || settings.staffCanSeeDealerPrice;
  const p = redactDetail(detail, canSeeDealer);
  const now = new Date();
  const changes = p.history.filter((h) => h.oldDealer !== null || h.oldMrp !== null).length;
  const chartPoints = [...p.history].reverse().map((h) => ({ at: h.at, dealer: h.newDealer, mrp: h.newMrp }));

  return (
    <>
      {/* Header */}
      <section className="clay-card flex flex-col gap-4 rounded-2xl p-5 md:flex-row md:items-start md:justify-between md:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {[p.brand, p.modelNumber].filter(Boolean).join(" · ") || "Unbranded"}
            </p>
            {p.category ? <Badge variant="muted">{p.category}</Badge> : null}
            {p.archivedAt ? <Badge variant="warning">Archived · hidden from search</Badge> : null}
          </div>
          <h1 className="text-xl leading-snug font-semibold tracking-tight text-balance md:text-2xl">{p.name}</h1>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="font-mono">{p.skuCode}</dd>
            </div>
            {p.barcode ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Barcode</dt>
                <dd className="font-mono">{p.barcode}</dd>
              </div>
            ) : null}
            {p.hsnCode ? (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">HSN</dt>
                <dd className="font-mono">{p.hsnCode}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {isAdmin ? (
          <ProductActions
            archived={!!p.archivedAt}
            product={{ id: p.id, name: p.name, skuCode: p.skuCode, gstPct: p.gstPct, dealerPrice: p.dealerPrice, mrp: p.mrp }}
          />
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Prices */}
        <section className="clay-card rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold">Current price</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">MRP</dt>
              <dd className="text-price text-4xl text-success">{formatINR(p.mrp)}</dd>
            </div>
            {canSeeDealer ? (
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Dealer · ex GST</dt>
                  <dd className="text-price text-xl">{formatINR(p.dealerPrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Landing · +{p.gstPct}%</dt>
                  <dd className="text-price text-xl text-muted-foreground">{formatINR(p.landing)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Margin</dt>
                  <dd className="text-price text-xl">{p.margin !== null ? `${p.margin.toFixed(1)}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Profit / unit</dt>
                  <dd className="text-price text-xl">{formatINR(p.mrp - p.landing)}</dd>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">GST</dt>
                <dd className="text-price text-xl">{p.gstPct}%</dd>
              </div>
            )}
            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Boxes className="size-4" /> Stock
                </dt>
                <dd className={cn("font-mono font-medium", p.stockQty <= 0 ? "text-destructive" : p.stockQty <= 3 ? "text-warning-foreground" : "")}>
                  {p.stockQty <= 0 ? "Out of stock" : `${p.stockQty} units`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-4" /> Last change
                </dt>
                <dd suppressHydrationWarning>{p.history[0] ? timeAgo(p.history[0].at, now) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Added</dt>
                <dd>{formatDate(p.createdAt)}</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Chart */}
        <section className="clay-card min-w-0 rounded-2xl p-5 md:p-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{canSeeDealer ? "Dealer price and MRP over time" : "MRP over time"}</h2>
            <p className="text-xs text-muted-foreground">
              {changes} {changes === 1 ? "change" : "changes"} since {formatDate(p.createdAt)}
            </p>
          </div>
          <PriceChart points={chartPoints} showDealer={canSeeDealer} asOf={now.toISOString()} />
        </section>
      </div>

      {/* History */}
      <section className="clay-card overflow-hidden rounded-2xl">
        <div className="flex items-baseline justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Price history</h2>
          <p className="text-xs text-muted-foreground">Newest first</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface/60 hover:bg-surface/60">
                <TableHead className="pl-5">When</TableHead>
                {canSeeDealer ? <TableHead>Dealer (ex GST)</TableHead> : null}
                <TableHead>MRP</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="pr-5">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="py-3 pl-5 whitespace-nowrap">
                    <span className="block text-sm">{formatDateTime(h.at)}</span>
                    <span className="text-xs text-muted-foreground">{h.changedBy ?? "System"}</span>
                  </TableCell>
                  {canSeeDealer ? (
                    <TableCell>
                      <Change from={h.oldDealer} to={h.newDealer} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Change from={h.oldMrp} to={h.newMrp} />
                  </TableCell>
                  <TableCell>
                    <SourceBadge source={h.source} />
                  </TableCell>
                  <TableCell className="pr-5 text-sm text-muted-foreground">
                    {h.invoiceScanId ? (
                      <Link href={`/invoices/${h.invoiceScanId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <FileScan className="size-3.5" />
                        {h.supplierName ?? "Invoice"} {h.invoiceNumber ? `· ${h.invoiceNumber}` : ""}
                      </Link>
                    ) : h.supplierName ? (
                      <span>
                        {h.supplierName}
                        {h.invoiceNumber ? <span className="font-mono"> · {h.invoiceNumber}</span> : null}
                      </span>
                    ) : null}
                    {h.note ? <span className="block">{h.note}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Supplier aliases */}
      {isAdmin ? (
        <section className="clay-card rounded-2xl p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="orb tone-teal size-10 shrink-0 rounded-xl">
              <Quote className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">How suppliers write it</h2>
              <p className="text-sm text-muted-foreground">
                Invoice descriptions linked to this product. Future invoices with the same wording are matched automatically.
              </p>
            </div>
          </div>
          <AliasList aliases={p.aliases} />
        </section>
      ) : null}
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
