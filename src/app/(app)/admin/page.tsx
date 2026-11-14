import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  FileScan,
  History,
  PackagePlus,
  PackageX,
  ScanLine,
  Sheet,
  TrendingUp,
  Package,
} from "lucide-react";
import { ChangesChart } from "@/components/dashboard/changes-chart";
import { PageHeader, StatTile } from "@/components/layout/page-header";
import { SourceBadge } from "@/components/products/source-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatPct, timeAgo } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { changePct } from "@/lib/pricing";
import { biggestMoves, dashboardStats, recentPriceChanges } from "@/lib/products/admin-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Dashboard"
        description="How prices are moving, what needs attention, and what changed recently."
        actions={
          <>
            <Link href="/admin/import" className={buttonVariants({ variant: "outline" })}>
              <Sheet data-icon="inline-start" /> Excel import
            </Link>
            <Link href="/admin/products/new" className={buttonVariants({ variant: "outline" })}>
              <PackagePlus data-icon="inline-start" /> Add product
            </Link>
            <Link href="/invoices/new" className={buttonVariants()}>
              <ScanLine data-icon="inline-start" /> Scan invoice
            </Link>
          </>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </main>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("clay-card min-w-0 rounded-2xl p-5", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function DashboardData() {
  await requireAdmin();
  const [stats, recent, moves, pending] = await Promise.all([
    dashboardStats(),
    recentPriceChanges(8),
    biggestMoves(5),
    db.invoiceScanLog.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, supplierName: true, invoiceNumber: true, lineCount: true, createdAt: true, isMock: true, uploadedBy: { select: { name: true } } },
    }),
  ]);
  const now = new Date();

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Package} label="Products" value={stats.products} hint={`${stats.new30d} added in 30 days`} />
        <StatTile icon={TrendingUp} tone="warning" label="Price changes · 7 days" value={stats.changes7d} hint={`${stats.changes30d} in 30 days`} />
        <StatTile icon={FileScan} tone="info" label="Invoices to review" value={stats.pendingInvoices} hint={`${stats.committedInvoices30d} confirmed in 30 days`} />
        <StatTile icon={PackageX} tone={stats.outOfStock > 0 ? "warning" : "success"} label="Out of stock" value={stats.outOfStock} hint={`${stats.lowStock} running low (1–3)`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Price changes, last 30 days" action={<span className="text-xs text-muted-foreground">by source</span>}>
          <ChangesChart rows={stats.bySource} />
        </Panel>

        <Panel
          title="Waiting for review"
          action={
            <Link href="/invoices" className="text-xs font-medium text-primary hover:underline">
              All invoices
            </Link>
          }
        >
          {pending.length === 0 ? (
            <div className="clay-well flex flex-col items-center gap-2 rounded-xl px-4 py-8 text-center">
              <span className="orb tone-teal mb-1 size-11 rounded-2xl"><FileScan className="size-5" /></span>
              <p className="text-sm font-medium">Nothing to review</p>
              <p className="text-xs text-muted-foreground">Scanned invoices land here before prices change.</p>
              <Link href="/invoices/new" className={buttonVariants({ size: "sm", variant: "outline", className: "mt-1" })}>
                Scan an invoice
              </Link>
            </div>
          ) : (
            <ul className="divide-y">
              {pending.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{inv.supplierName ?? "Unknown supplier"}</span>
                      <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {inv.invoiceNumber ?? "No number"} · {inv.lineCount} lines · {timeAgo(inv.createdAt, now)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {inv.isMock ? <Badge variant="muted">Demo</Badge> : null}
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Recent price changes"
          action={
            <Link href="/admin/history" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <History className="size-3.5" /> Full history
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price changes yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((c) => {
                const pct = changePct(c.oldDealer, c.newDealer);
                return (
                  <li key={c.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Link href={`/products/${c.productId}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                        {c.productName}
                      </Link>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" suppressHydrationWarning>
                        <span className="font-mono">{c.skuCode}</span>· {timeAgo(c.at, now)}
                        {c.changedBy ? ` · ${c.changedBy}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-sm">
                        <span className="text-muted-foreground">{formatINR(c.oldDealer)}</span> → {formatINR(c.newDealer)}
                      </span>
                      {pct !== null && Math.abs(pct) >= 0.05 ? (
                        <span className={cn("inline-flex w-16 items-center justify-end gap-0.5 font-mono text-xs", pct > 0 ? "text-warning-foreground" : "text-success-foreground")}>
                          {pct > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                          {formatPct(pct)}
                        </span>
                      ) : (
                        <span className="w-16 text-right text-xs text-muted-foreground">MRP only</span>
                      )}
                      <SourceBadge source={c.source} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Biggest dealer-price moves · 30 days">
            {moves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes in the last 30 days.</p>
            ) : (
              <ul className="space-y-2.5">
                {moves.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <Link href={`/products/${m.productId}`} className="min-w-0 truncate text-sm hover:text-primary hover:underline">
                      {m.name}
                    </Link>
                    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium", m.pct > 0 ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success-foreground")}>
                      {formatPct(m.pct)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Stock alerts">
            <div className="grid grid-cols-2 gap-3">
              <Link href="/admin/products?stock=out" className="clay-raised rounded-xl p-3 transition-shadow hover:border-destructive/40 hover:shadow-clay">
                <p className="text-xs text-muted-foreground">Out of stock</p>
                <p className="text-price text-2xl text-destructive">{stats.outOfStock}</p>
              </Link>
              <Link href="/admin/products?stock=low" className="clay-raised rounded-xl p-3 transition-shadow hover:border-warning/50 hover:shadow-clay">
                <p className="text-xs text-muted-foreground">Running low</p>
                <p className="text-price text-2xl text-warning-foreground">{stats.lowStock}</p>
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
