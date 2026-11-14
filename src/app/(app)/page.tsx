import type { Metadata } from "next";
import { Suspense } from "react";
import { PriceFinder } from "@/components/finder/price-finder";
import { ProductCardSkeleton } from "@/components/finder/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { catalogueStats, recentProducts, redactForViewer } from "@/lib/products/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Price Finder" };

export default function FinderPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <Suspense fallback={<FinderSkeleton />}>
        <FinderData />
      </Suspense>
    </main>
  );
}

async function FinderData() {
  // Session first (keeps the database out of prerendering), then the rest in parallel.
  const user = await requireUser();
  const [settings, recent, stats] = await Promise.all([getSettings(), recentProducts(), catalogueStats()]);
  const canSeeDealer = user.role === "ADMIN" || settings.staffCanSeeDealerPrice;
  return <PriceFinder initialRecent={redactForViewer(recent, canSeeDealer)} stats={stats} />;
}

function FinderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-2xl md:h-16" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
        <ProductCardSkeleton />
      </div>
    </div>
  );
}
