import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { toDecimalString } from "@/lib/money";
import { getProductDetail } from "@/lib/products/admin-queries";
import { productOptions } from "@/lib/products/options";

export const metadata: Metadata = { title: "Edit product" };

const rupees = (p: number) => toDecimalString(p).replace(/\.00$/, "");

export default function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton className="h-[640px] rounded-xl" />}>
        <EditProductData params={params} />
      </Suspense>
    </main>
  );
}

async function EditProductData({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [p, options] = await Promise.all([getProductDetail(id), productOptions()]);
  if (!p) notFound();
  return (
    <>
      <Link href={`/products/${p.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {p.name}
      </Link>
      <PageHeader title="Edit product" description="Changing dealer price or MRP adds an entry to the price history." />
      <ProductForm
        brands={options.brands}
        categories={options.categories}
        existing={{ id: p.id, skuCode: p.skuCode, dealerPrice: p.dealerPrice, mrp: p.mrp }}
        defaults={{
          name: p.name,
          brand: p.brand ?? "",
          modelNumber: p.modelNumber ?? "",
          barcode: p.barcode ?? "",
          category: p.category ?? "",
          hsnCode: p.hsnCode ?? "",
          gstPct: String(p.gstPct),
          dealerPrice: rupees(p.dealerPrice),
          mrp: rupees(p.mrp),
          stockQty: String(p.stockQty),
          allowDuplicateModel: false,
          note: "",
        }}
      />
    </>
  );
}
