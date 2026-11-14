import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Settings"
        description="Shop-wide defaults. Changes apply to everyone as soon as you save."
      />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsData />
      </Suspense>
    </main>
  );
}

async function SettingsData() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <SettingsForm
      initial={{
        businessName: s.businessName,
        staffCanSeeDealerPrice: s.staffCanSeeDealerPrice,
        skuPrefix: s.skuPrefix,
        defaultGst: s.defaultGst,
        mrpMarkupPct: s.mrpMarkupPct,
        addInvoiceQtyToStock: s.addInvoiceQtyToStock,
        purgeInvoiceFilesAfterDays: s.purgeInvoiceFilesAfterDays,
      }}
      nextSkuNumber={s.nextSkuNumber}
    />
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}
