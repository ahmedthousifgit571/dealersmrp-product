import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { UploadInvoice } from "@/components/invoices/upload-invoice";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { aiConfigured } from "@/lib/invoice/extract";

export const metadata: Metadata = { title: "Scan invoice" };

export default function NewInvoicePage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <PageHeader
        title="Scan a supplier invoice"
        description="The AI copies the item table. You check each line before any price changes."
      />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <Upload />
      </Suspense>
    </main>
  );
}

async function Upload() {
  await requireUser();
  return <UploadInvoice aiReady={aiConfigured()} />;
}
