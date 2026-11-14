import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { productOptions } from "@/lib/products/options";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Add product" };

export default function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader title="Add product" description="It gets the next SKU automatically and appears in the Price Finder straight away." />
      <Suspense fallback={<Skeleton className="h-[640px] rounded-xl" />}>
        <NewProductData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewProductData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [settings, options] = await Promise.all([getSettings(), productOptions()]);
  const barcode = typeof sp.barcode === "string" ? sp.barcode : "";
  return (
    <ProductForm
      brands={options.brands}
      categories={options.categories}
      defaults={{
        name: "",
        brand: "",
        modelNumber: "",
        barcode,
        category: "",
        hsnCode: "",
        gstPct: String(settings.defaultGst),
        dealerPrice: "",
        mrp: "",
        stockQty: "0",
        allowDuplicateModel: false,
        note: "",
      }}
    />
  );
}
