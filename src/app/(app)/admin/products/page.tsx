import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download, PackagePlus, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { listProducts, type ProductListParams } from "@/lib/products/admin-queries";
import { ProductsTable } from "./products-table";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Products"
        description="Every product the shop sells. Price edits here are recorded in the history as manual changes."
        actions={
          <>
            <a href="/api/export/products" className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" /> Export
            </a>
            <Link href="/admin/import" className={buttonVariants({ variant: "outline" })}>
              <Upload data-icon="inline-start" /> Import
            </Link>
            <Link href="/admin/products/new" className={buttonVariants()}>
              <PackagePlus data-icon="inline-start" /> Add product
            </Link>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <ProductsData searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function ProductsData({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const params: ProductListParams = {
    q: one(sp.q) ?? "",
    brand: one(sp.brand) || undefined,
    category: one(sp.category) || undefined,
    status: (["active", "archived", "all"] as const).find((s) => s === one(sp.status)) ?? "active",
    stock: (["all", "low", "out"] as const).find((s) => s === one(sp.stock)) ?? "all",
    sort: (["updated", "name", "mrp", "dealer", "stock"] as const).find((s) => s === one(sp.sort)) ?? "updated",
    dir: one(sp.dir) === "asc" ? "asc" : one(sp.dir) === "desc" ? "desc" : undefined,
    page: Number(one(sp.page) ?? 1) || 1,
  };
  const result = await listProducts(params);
  return <ProductsTable {...result} params={params} />;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  );
}
