import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes, CheckCircle2, ChevronRight } from "lucide-react";
import { ProductPhoto } from "@/components/products/product-photo";
import { Badge } from "@/components/ui/badge";
import { formatPct, timeAgo } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { marginPct } from "@/lib/pricing";
import type { ProductHit } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { INVOICE_OCR: "invoice", EXCEL_BULK: "Excel", MANUAL: "manual edit" } as const;

function ChangeBadge({ change }: { change: NonNullable<ProductHit["lastChange"]> }) {
  // Show the dealer-price move when visible (it's what changes most), else the MRP move.
  const pct = change.dealerPct ?? change.mrpPct;
  const label = change.dealerPct !== null ? "DP" : "MRP";
  if (pct === null || Math.abs(pct) < 0.05) return null;
  const up = pct > 0;
  return (
    <Badge variant="warning" className="font-mono">
      {up ? <ArrowUpRight data-icon="inline-start" /> : <ArrowDownRight data-icon="inline-start" />}
      {label} {formatPct(pct)}
    </Badge>
  );
}

function StockPill({ qty }: { qty: number }) {
  const tone =
    qty <= 0
      ? "text-destructive bg-destructive/8 ring-destructive/15"
      : qty <= 3
        ? "text-warning-foreground bg-warning-soft ring-warning/25"
        : "text-success-foreground bg-success-soft ring-success/20";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1", tone)}>
      <Boxes className="size-3" />
      {qty <= 0 ? "Out of stock" : `${qty} in stock`}
    </span>
  );
}

export function ProductCard({ product, now }: { product: ProductHit; now: Date }) {
  const margin = product.landing !== null ? marginPct(product.landing, product.mrp) : null;
  const dealerVisible = product.dealerPrice !== null;

  return (
    <article
      className={cn(
        "clay-card group relative rounded-2xl p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-clay-lg md:flex md:items-center md:gap-5 md:p-5 md:pr-10",
        product.match === "exact" && "ring-2 ring-success/35",
      )}
    >
      <ProductPhoto id={product.id} imageAt={product.imageAt} name={product.name} className="mb-3 size-20 md:mb-0 md:size-24" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {[product.brand, product.modelNumber].filter(Boolean).join(" · ") || "Unbranded"}
          </p>
          {product.match === "exact" ? (
            <Badge variant="success">
              <CheckCircle2 data-icon="inline-start" />
              Exact match
            </Badge>
          ) : null}
          {product.category ? <Badge variant="muted">{product.category}</Badge> : null}
        </div>
        <h3 className="mt-1 text-[15px] leading-snug font-medium text-balance md:text-base">
          <Link
            href={`/products/${product.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-muted-foreground">
          <span>{product.skuCode}</span>
          {product.barcode ? <span>{product.barcode}</span> : null}
          {product.hsnCode ? <span>HSN {product.hsnCode}</span> : null}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StockPill qty={product.stockQty} />
          {product.lastChange ? <ChangeBadge change={product.lastChange} /> : null}
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            {product.lastChange
              ? `Re-priced ${timeAgo(product.lastChange.at, now)} via ${SOURCE_LABEL[product.lastChange.source]}`
              : `Updated ${timeAgo(product.updatedAt, now)}`}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 md:mt-0 md:w-80 md:shrink-0 md:border-t-0 md:border-l md:pt-0 md:pl-6">
        {dealerVisible ? (
          <div className="clay-tint tone-orange col-span-2 rounded-xl px-3 py-2 ring-2 ring-primary/35">
            <dt className="text-xs font-bold tracking-wide text-primary uppercase">
              Dealer Price <span className="font-medium text-muted-foreground normal-case">· before GST</span>
            </dt>
            <dd className="text-price text-3xl leading-tight md:text-4xl">{formatINR(product.dealerPrice)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-bold tracking-wide text-muted-foreground uppercase">MRP</dt>
          <dd className={cn("text-price mt-0.5 text-success", dealerVisible ? "text-xl" : "text-3xl")}>{formatINR(product.mrp)}</dd>
        </div>
        {dealerVisible ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">With GST +{product.gstPct}%</dt>
            <dd className="text-price mt-0.5 text-xl text-muted-foreground">{formatINR(product.landing)}</dd>
            {margin !== null ? <dd className="text-[11px] text-muted-foreground">Margin {margin.toFixed(1)}%</dd> : null}
          </div>
        ) : (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">GST</dt>
            <dd className="text-price mt-0.5 text-xl">{product.gstPct}%</dd>
          </div>
        )}
      </dl>
      <ChevronRight className="absolute top-1/2 right-3 hidden size-4 -translate-y-1/2 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary md:block" aria-hidden />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="clay-card rounded-2xl p-4 md:flex md:items-center md:gap-6 md:p-5">
      <div className="flex-1 space-y-2.5">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 md:mt-0 md:w-[25rem]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
            <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
