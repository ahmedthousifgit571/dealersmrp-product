import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle, ArrowLeft, Hourglass, Trash2 } from "lucide-react";
import { InvoiceReview } from "@/components/invoices/invoice-review";
import { InvoiceViewer } from "@/components/invoices/invoice-viewer";
import { ExtractActions, ScanStatusBadge } from "@/components/invoices/scan-status";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ReviewDraftSchema } from "@/lib/invoice/schema";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Invoice review" };

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    <main className="mx-auto w-full max-w-[96rem] space-y-4 px-4 py-5 md:px-6 md:py-6">
      <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <Suspense fallback={<ReviewSkeleton />}>
        <InvoiceData params={params} />
      </Suspense>
    </main>
  );
}

async function InvoiceData({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [scan, settings] = await Promise.all([
    db.invoiceScanLog.findUnique({
      where: { id },
      include: {
        files: { orderBy: { pageOrder: "asc" }, select: { id: true, mimeType: true, fileName: true, purgedAt: true, data: false } },
        uploadedBy: { select: { name: true } },
        committedBy: { select: { name: true } },
      },
    }),
    getSettings(),
  ]);
  if (!scan) notFound();
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin && scan.uploadedById !== user.id) notFound();

  const files = scan.files.map((f) => ({ id: f.id, mimeType: f.mimeType, fileName: f.fileName, purged: f.purgedAt !== null }));
  const canDiscard = (isAdmin || scan.uploadedById === user.id) && ["UPLOADED", "FAILED", "PENDING_REVIEW"].includes(scan.status);

  const title = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{scan.supplierName ?? "Supplier invoice"}</h1>
      <ScanStatusBadge status={scan.status} />
      <p className="w-full text-sm text-muted-foreground">
        {scan.invoiceNumber ? <span className="font-mono">{scan.invoiceNumber} · </span> : null}
        Uploaded by {scan.uploadedBy?.name ?? "someone"} on {formatDateTime(scan.createdAt)}
        {scan.aiModel && scan.aiModel !== "demo" ? <span> · read by {scan.aiModel}</span> : null}
      </p>
    </div>
  );

  if (scan.status === "UPLOADED" || scan.status === "EXTRACTING" || scan.status === "FAILED") {
    return (
      <>
        {title}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <InvoiceViewer scanId={scan.id} files={files} className="h-[70dvh]" />
          <div className="clay-card space-y-4 rounded-2xl p-5 lg:self-start">
            {scan.status === "FAILED" ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> {scan.error ?? "The invoice couldn't be read."}
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Hourglass className="mt-0.5 size-4 shrink-0" />
                {scan.status === "EXTRACTING" ? "The AI is reading this invoice. This page updates when you check again." : "These pages haven't been read yet."}
              </p>
            )}
            <ExtractActions scanId={scan.id} status={scan.status} canDiscard={canDiscard} />
          </div>
        </div>
      </>
    );
  }

  if (scan.status === "DISCARDED") {
    return (
      <>
        {title}
        <div className="clay-card flex items-center gap-3 rounded-2xl p-5 text-sm text-muted-foreground">
          <Trash2 className="size-5" /> This invoice was discarded. No prices were changed and its pages were deleted.
        </div>
      </>
    );
  }

  const parsed = ReviewDraftSchema.safeParse(scan.reviewJson);
  if (!parsed.success) {
    return (
      <>
        {title}
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          The saved review for this invoice couldn&apos;t be loaded.
        </p>
      </>
    );
  }
  const raw = scan.rawJson as { warnings?: unknown } | null;
  const warnings = Array.isArray(raw?.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string") : [];
  const editable = isAdmin && scan.status === "PENDING_REVIEW";

  return (
    <>
      {title}
      {!isAdmin && scan.status === "PENDING_REVIEW" ? (
        <p className="rounded-xl border border-info/25 bg-info-soft p-4 text-sm text-info-foreground">
          Sent for review. An admin will check these lines and confirm the prices.
        </p>
      ) : null}
      <InvoiceReview
        scanId={scan.id}
        editable={editable}
        canDiscard={canDiscard}
        draft={parsed.data}
        files={files}
        isMock={scan.isMock}
        warnings={warnings}
        markupPct={settings.mrpMarkupPct}
        committed={scan.status === "COMMITTED" ? { at: scan.committedAt?.toISOString() ?? "", by: scan.committedBy?.name ?? null } : null}
      />
    </>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[5fr_7fr]">
        <Skeleton className="h-[60dvh] rounded-xl" />
        <Skeleton className="h-[60dvh] rounded-xl" />
      </div>
    </div>
  );
}
