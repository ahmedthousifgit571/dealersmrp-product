import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, FileScan, ScanLine } from "lucide-react";
import { BulkSelectProvider, RowCheckbox, SelectAllCheckbox } from "@/components/invoices/bulk-select";
import { ScanStatusBadge } from "@/components/invoices/scan-status";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatDate, timeAgo } from "@/lib/format";
import { decimalToPaise, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoices" };

const TABS = [
  { key: "open", label: "Open", statuses: ["UPLOADED", "EXTRACTING", "PENDING_REVIEW", "FAILED"] as const },
  { key: "done", label: "Confirmed", statuses: ["COMMITTED"] as const },
  { key: "discarded", label: "Discarded", statuses: ["DISCARDED"] as const },
  { key: "all", label: "All", statuses: null },
];

const DISCARDABLE: string[] = ["UPLOADED", "FAILED", "PENDING_REVIEW"];

export default function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Invoices"
        description="Supplier bills read by AI. Prices change only after an admin reviews and confirms each one."
        actions={
          <Link href="/invoices/new" className={buttonVariants()}>
            <ScanLine data-icon="inline-start" /> Scan invoice
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <InvoicesData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function InvoicesData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0]!;
  const ownOnly: Prisma.InvoiceScanLogWhereInput = user.role === "ADMIN" ? {} : { uploadedById: user.id };
  const where: Prisma.InvoiceScanLogWhereInput = { ...ownOnly, ...(tab.statuses ? { status: { in: [...tab.statuses] } } : {}) };

  const [scans, counts] = await Promise.all([
    db.invoiceScanLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        supplierName: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        lineCount: true,
        isMock: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
        _count: { select: { files: true } },
      },
    }),
    db.invoiceScanLog.groupBy({ by: ["status"], where: ownOnly, _count: { _all: true } }),
  ]);
  const countFor = (statuses: readonly string[] | null) =>
    counts.filter((c) => !statuses || statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const now = new Date();
  const discardable = new Set(scans.filter((s) => DISCARDABLE.includes(s.status)).map((s) => s.id));

  return (
    <BulkSelectProvider ids={[...discardable]}>
    <div className="space-y-3">
      <nav className="clay-well flex w-fit max-w-full flex-wrap gap-1 rounded-xl p-1" aria-label="Invoice status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "open" ? "/invoices" : `/invoices?tab=${t.key}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              t.key === tab.key ? "clay-raised text-foreground" : "hover:text-foreground",
            )}
          >
            {t.label}
            <span className="font-mono text-xs opacity-70">{countFor(t.statuses)}</span>
          </Link>
        ))}
      </nav>

      {scans.length === 0 ? (
        <Empty className="clay-well rounded-2xl border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileScan />
            </EmptyMedia>
            <EmptyTitle>{tab.key === "open" ? "No invoices waiting" : "Nothing here yet"}</EmptyTitle>
            <EmptyDescription>Photograph a supplier bill or upload its PDF. The AI reads the lines and an admin confirms the prices.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/invoices/new" className={buttonVariants()}>
              <ScanLine data-icon="inline-start" /> Scan an invoice
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="clay-card hidden overflow-hidden rounded-2xl md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/60 hover:bg-surface/60">
                  <TableHead className="w-10 pl-4">
                    <SelectAllCheckbox />
                  </TableHead>
                  <TableHead>Supplier · invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.map((s) => (
                  <TableRow key={s.id} className="relative">
                    <TableCell className="relative z-10 w-10 py-3 pl-4">
                      <RowCheckbox id={s.id} label={s.supplierName ?? "invoice"} />
                    </TableCell>
                    <TableCell className="py-3">
                      <Link href={`/invoices/${s.id}`} className="font-medium after:absolute after:inset-0 hover:text-primary">
                        {s.supplierName ?? (s.status === "PENDING_REVIEW" || s.status === "COMMITTED" ? "Unknown supplier" : "Not read yet")}
                      </Link>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {s.invoiceNumber ? <span className="font-mono">{s.invoiceNumber}</span> : null}
                        {s.invoiceDate ? <span>{formatDate(s.invoiceDate)}</span> : null}
                        {s.isMock ? <Badge variant="muted" className="h-4 px-1.5 text-[10px]">Demo</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ScanStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">{s.lineCount || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{s.totalAmount ? formatINR(decimalToPaise(s.totalAmount)) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                      {s.uploadedBy?.name ?? "—"} · {timeAgo(s.createdAt, now)}
                    </TableCell>
                    <TableCell className="pr-4">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {scans.map((s) => (
              <li key={s.id}>
                <div className="clay-card relative flex items-start gap-3 rounded-2xl p-3.5 active:shadow-well">
                  {discardable.has(s.id) ? (
                    <div className="relative z-10 pt-0.5">
                      <RowCheckbox id={s.id} label={s.supplierName ?? "invoice"} />
                    </div>
                  ) : null}
                  <Link href={`/invoices/${s.id}`} className="block min-w-0 flex-1 after:absolute after:inset-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.supplierName ?? "Not read yet"}</p>
                        <p className="font-mono text-xs text-muted-foreground">{s.invoiceNumber ?? `${s._count.files} page(s)`}</p>
                      </div>
                      <ScanStatusBadge status={s.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
                      {s.lineCount ? `${s.lineCount} lines · ` : ""}
                      {s.totalAmount ? `${formatINR(decimalToPaise(s.totalAmount))} · ` : ""}
                      {timeAgo(s.createdAt, now)}
                    </p>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
    </BulkSelectProvider>
  );
}
