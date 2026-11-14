"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  MoreHorizontal,
  PackageSearch,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { QuickPriceDialog } from "@/components/products/quick-price-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/format";
import { formatINR } from "@/lib/money";
import type { ProductListParams, ProductRow } from "@/lib/products/admin-queries";
import { cn } from "@/lib/utils";

type Props = {
  rows: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
  brands: string[];
  categories: string[];
  params: ProductListParams;
};

const ALL = "__all";

function StockCell({ qty }: { qty: number }) {
  return (
    <span className={cn("font-mono", qty <= 0 ? "text-destructive" : qty <= 3 ? "text-warning-foreground" : "")}>{qty}</span>
  );
}

type SortKey = NonNullable<ProductListParams["sort"]>;

function SortHead({
  k,
  params,
  onSort,
  children,
  className,
}: {
  k: SortKey;
  params: ProductListParams;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = (params.sort ?? "updated") === k;
  const dir = params.dir ?? (k === "name" ? "asc" : "desc");
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}
        {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </TableHead>
  );
}

export function ProductsTable({ rows, total, page, pageCount, brands, categories, params }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const [pricing, setPricing] = useState<ProductRow | null>(null);
  const now = new Date();

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Debounced search box → URL.
  useEffect(() => {
    if ((params.q ?? "") === q) return;
    const id = window.setTimeout(() => update({ q }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sortBy = (key: NonNullable<ProductListParams["sort"]>) => {
    const sameKey = (params.sort ?? "updated") === key;
    const currentDir = params.dir ?? (key === "name" ? "asc" : "desc");
    update({ sort: key, dir: sameKey ? (currentDir === "asc" ? "desc" : "asc") : null });
  };


  const rowMenu = (r: ProductRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${r.name}`} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => setPricing(r)}>
          <IndianRupee /> Update price
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/admin/products/${r.id}/edit`} />}>
          <Pencil /> Edit details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <InputGroup className="h-10 lg:max-w-sm">
          <InputGroupAddon>{navigating ? <Spinner /> : <Search />}</InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, model, SKU, barcode"
            aria-label="Search products"
          />
          {q ? (
            <InputGroupAddon align="inline-end">
              <button type="button" aria-label="Clear" onClick={() => setQ("")} className="rounded p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <div className="flex flex-wrap gap-2">
          <Select
            value={params.brand ?? ALL}
            onValueChange={(v) => update({ brand: String(v) })}
            items={[{ value: ALL, label: "All brands" }, ...brands.map((b) => ({ value: b, label: b }))]}
          >
            <SelectTrigger className="h-10 min-w-36" aria-label="Brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.category ?? ALL}
            onValueChange={(v) => update({ category: String(v) })}
            items={[{ value: ALL, label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]}
          >
            <SelectTrigger className="h-10 min-w-40" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.stock ?? "all"}
            onValueChange={(v) => update({ stock: v === "all" ? null : String(v) })}
            items={[
              { value: "all", label: "Any stock" },
              { value: "low", label: "Low (1–3)" },
              { value: "out", label: "Out of stock" },
            ]}
          >
            <SelectTrigger className="h-10 min-w-36" aria-label="Stock">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any stock</SelectItem>
              <SelectItem value="low">Low (1–3)</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Tabs value={params.status ?? "active"} onValueChange={(v) => update({ status: v === "active" ? null : String(v) })} className="lg:ml-auto">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {rows.length === 0 ? (
        <Empty className="clay-well rounded-2xl border-dashed py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearch />
            </EmptyMedia>
            <EmptyTitle>No products match</EmptyTitle>
            <EmptyDescription>Clear a filter or search for something else.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Desktop table */}
          <div className={cn("clay-card hidden overflow-hidden rounded-2xl transition-opacity md:block", navigating && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-surface/60 hover:bg-surface/60">
                  <SortHead params={params} onSort={sortBy} k="name" className="pl-4">Product</SortHead>
                  <SortHead params={params} onSort={sortBy} k="dealer" className="text-right">Dealer ex GST</SortHead>
                  <TableHead className="text-right">Landing</TableHead>
                  <SortHead params={params} onSort={sortBy} k="mrp" className="text-right">MRP</SortHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <SortHead params={params} onSort={sortBy} k="stock" className="text-right">Stock</SortHead>
                  <SortHead params={params} onSort={sortBy} k="updated">Updated</SortHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={cn(r.archived && "opacity-60")}>
                    <TableCell className="max-w-[26rem] py-2.5 pl-4">
                      <Link href={`/products/${r.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {r.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-mono">{r.skuCode}</span>
                        {r.modelNumber ? <span>· {r.modelNumber}</span> : null}
                        {r.category ? <span>· {r.category}</span> : null}
                        {r.archived ? <Badge variant="warning" className="h-4 px-1.5 text-[10px]">Archived</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatINR(r.dealerPrice)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatINR(r.landing)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-success">{formatINR(r.mrp)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.margin !== null ? `${r.margin.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <StockCell qty={r.stockQty} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground" suppressHydrationWarning>
                      {timeAgo(r.updatedAt, now)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">{rowMenu(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phone cards */}
          <ul className={cn("space-y-2 md:hidden", navigating && "opacity-60")}>
            {rows.map((r) => (
              <li key={r.id} className={cn("clay-card rounded-2xl p-3.5", r.archived && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${r.id}`} className="line-clamp-2 text-sm font-medium">
                      {r.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{r.skuCode}</p>
                  </div>
                  {rowMenu(r)}
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">MRP</dt>
                    <dd className="font-mono text-sm font-semibold text-success">{formatINR(r.mrp)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dealer</dt>
                    <dd className="font-mono text-sm">{formatINR(r.dealerPrice)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Margin</dt>
                    <dd className="font-mono text-sm">{r.margin !== null ? `${r.margin.toFixed(0)}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd className="text-sm">
                      <StockCell qty={r.stockQty} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {total === 0 ? "0 products" : `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total} products`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
            <ChevronLeft data-icon="inline-start" /> Previous
          </Button>
          <span className="font-mono text-xs">
            {page} / {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => update({ page: String(page + 1) }, false)}>
            Next <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      {pricing ? (
        <QuickPriceDialog
          product={pricing}
          open
          onOpenChange={(o) => {
            if (!o) setPricing(null);
          }}
        />
      ) : null}
    </div>
  );
}
