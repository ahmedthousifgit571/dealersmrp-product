import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Excel import" };

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Excel import"
        description="Upload a supplier price list or your own sheet. You'll see every change before anything is saved."
        actions={
          <a href="/api/export/products" className={buttonVariants({ variant: "outline" })}>
            <Download data-icon="inline-start" /> Export current products
          </a>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await requireAdmin();
  return <ImportWizard />;
}
