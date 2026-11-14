import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise, type Paise } from "@/lib/money";
import { landingPaise, marginPct } from "@/lib/pricing";

// ── Product detail ────────────────────────────────────────────────

export type PricePoint = {
  id: string;
  at: string;
  oldDealer: Paise | null;
  newDealer: Paise;
  oldMrp: Paise | null;
  newMrp: Paise;
  source: "INVOICE_OCR" | "EXCEL_BULK" | "MANUAL";
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceScanId: string | null;
  note: string | null;
  changedBy: string | null;
};

export type ProductDetail = {
  id: string;
  skuCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  category: string | null;
  hsnCode: string | null;
  gstPct: number;
  dealerPrice: Paise;
  mrp: Paise;
  landing: Paise;
  margin: number | null;
  stockQty: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  history: PricePoint[];
  aliases: { id: string; aliasName: string; supplierName: string | null; createdAt: string }[];
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const p = await db.product.findUnique({
    where: { id },
    include: {
      priceHistory: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      aliases: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) return null;
  const gstPct = Number(p.gstPercentage);
  const dealer = decimalToPaise(p.dealerPrice);
  const mrp = decimalToPaise(p.mrp);
  const landing = landingPaise(dealer, gstPct);
  return {
    id: p.id,
    skuCode: p.skuCode,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    modelNumber: p.modelNumber,
    category: p.category,
    hsnCode: p.hsnCode,
    gstPct,
    dealerPrice: dealer,
    mrp,
    landing,
    margin: marginPct(landing, mrp),
    stockQty: p.stockQty,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    history: p.priceHistory.map((h) => ({
      id: h.id,
      at: h.changedAt.toISOString(),
      oldDealer: h.oldDealerPrice ? decimalToPaise(h.oldDealerPrice) : null,
      newDealer: decimalToPaise(h.newDealerPrice),
      oldMrp: h.oldMrp ? decimalToPaise(h.oldMrp) : null,
      newMrp: decimalToPaise(h.newMrp),
      source: h.source,
      supplierName: h.supplierName,
      invoiceNumber: h.invoiceNumber,
      invoiceScanId: h.invoiceScanId,
      note: h.note,
      changedBy: h.changedBy?.name ?? null,
    })),
    aliases: p.aliases.map((a) => ({
      id: a.id,
      aliasName: a.aliasName,
      supplierName: a.supplierName,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/** Removes cost data from a product detail for viewers who may not see it. */
export function redactDetail(d: ProductDetail, canSeeDealer: boolean): ProductDetail {
  if (canSeeDealer) return d;
  return {
    ...d,
    dealerPrice: 0,
    landing: 0,
    margin: null,
    history: d.history
      .filter((h) => h.oldMrp === null || h.oldMrp !== h.newMrp)
      .map((h) => ({ ...h, oldDealer: null, newDealer: 0 })),
  };
}

// ── Admin product table ───────────────────────────────────────────

export type ProductListParams = {
  q?: string;
  brand?: string;
  category?: string;
  status?: "active" | "archived" | "all";
  stock?: "all" | "low" | "out";
  sort?: "updated" | "name" | "mrp" | "dealer" | "stock" | "margin";
  dir?: "asc" | "desc";
  page?: number;
};

export type ProductRow = {
  id: string;
  skuCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  category: string | null;
  gstPct: number;
  dealerPrice: Paise;
  mrp: Paise;
  landing: Paise;
  margin: number | null;
  stockQty: number;
  archived: boolean;
  updatedAt: string;
};

export const PAGE_SIZE = 25;

export async function listProducts(params: ProductListParams) {
  const page = Math.max(1, params.page ?? 1);
  const where: Prisma.ProductWhereInput = {};
  if (params.status !== "all") where.archivedAt = params.status === "archived" ? { not: null } : null;
  if (params.brand) where.brand = { equals: params.brand, mode: "insensitive" };
  if (params.category) where.category = { equals: params.category, mode: "insensitive" };
  if (params.stock === "out") where.stockQty = { lte: 0 };
  if (params.stock === "low") where.stockQty = { gt: 0, lte: 3 };
  const tokens = (params.q ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (tokens.length > 0) where.AND = tokens.map((t) => ({ searchText: { contains: t } }));

  const dir = params.dir ?? (params.sort === "name" ? "asc" : "desc");
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "name"
      ? { name: dir }
      : params.sort === "mrp"
        ? { mrp: dir }
        : params.sort === "dealer"
          ? { dealerPrice: dir }
          : params.sort === "stock"
            ? { stockQty: dir }
            : { updatedAt: dir };

  const [rows, total, brands, categories] = await Promise.all([
    db.product.findMany({ where, orderBy: [orderBy, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.product.count({ where }),
    db.product.findMany({ where: { brand: { not: null } }, distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
    db.product.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);

  return {
    rows: rows.map<ProductRow>((p) => {
      const gstPct = Number(p.gstPercentage);
      const dealer = decimalToPaise(p.dealerPrice);
      const mrp = decimalToPaise(p.mrp);
      const landing = landingPaise(dealer, gstPct);
      return {
        id: p.id,
        skuCode: p.skuCode,
        barcode: p.barcode,
        name: p.name,
        brand: p.brand,
        modelNumber: p.modelNumber,
        category: p.category,
        gstPct,
        dealerPrice: dealer,
        mrp,
        landing,
        margin: marginPct(landing, mrp),
        stockQty: p.stockQty,
        archived: p.archivedAt !== null,
        updatedAt: p.updatedAt.toISOString(),
      };
    }),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    brands: brands.map((b) => b.brand!).filter(Boolean),
    categories: categories.map((c) => c.category!).filter(Boolean),
  };
}

// ── Dashboard ─────────────────────────────────────────────────────

export type RecentChange = {
  id: string;
  at: string;
  productId: string;
  productName: string;
  skuCode: string;
  oldDealer: Paise | null;
  newDealer: Paise;
  oldMrp: Paise | null;
  newMrp: Paise;
  source: PricePoint["source"];
  supplierName: string | null;
  changedBy: string | null;
};

export async function recentPriceChanges(take = 8): Promise<RecentChange[]> {
  const rows = await db.priceHistory.findMany({
    where: { oldDealerPrice: { not: null } },
    orderBy: { changedAt: "desc" },
    take,
    include: { product: { select: { name: true, skuCode: true } }, changedBy: { select: { name: true } } },
  });
  return rows.map((h) => ({
    id: h.id,
    at: h.changedAt.toISOString(),
    productId: h.productId,
    productName: h.product.name,
    skuCode: h.product.skuCode,
    oldDealer: h.oldDealerPrice ? decimalToPaise(h.oldDealerPrice) : null,
    newDealer: decimalToPaise(h.newDealerPrice),
    oldMrp: h.oldMrp ? decimalToPaise(h.oldMrp) : null,
    newMrp: decimalToPaise(h.newMrp),
    source: h.source,
    supplierName: h.supplierName,
    changedBy: h.changedBy?.name ?? null,
  }));
}

export async function dashboardStats() {
  const [counts] = await db.$queryRaw<
    {
      products: bigint;
      out_of_stock: bigint;
      low_stock: bigint;
      changes_7d: bigint;
      changes_30d: bigint;
      new_30d: bigint;
      pending_invoices: bigint;
      committed_invoices_30d: bigint;
    }[]
  >`
    SELECT
      (SELECT count(*) FROM "Product" WHERE "archivedAt" IS NULL) AS products,
      (SELECT count(*) FROM "Product" WHERE "archivedAt" IS NULL AND "stockQty" <= 0) AS out_of_stock,
      (SELECT count(*) FROM "Product" WHERE "archivedAt" IS NULL AND "stockQty" BETWEEN 1 AND 3) AS low_stock,
      (SELECT count(*) FROM "PriceHistory" WHERE "oldDealerPrice" IS NOT NULL AND "changedAt" >= now() - interval '7 days') AS changes_7d,
      (SELECT count(*) FROM "PriceHistory" WHERE "oldDealerPrice" IS NOT NULL AND "changedAt" >= now() - interval '30 days') AS changes_30d,
      (SELECT count(*) FROM "Product" WHERE "createdAt" >= now() - interval '30 days') AS new_30d,
      (SELECT count(*) FROM "InvoiceScanLog" WHERE status = 'PENDING_REVIEW') AS pending_invoices,
      (SELECT count(*) FROM "InvoiceScanLog" WHERE status = 'COMMITTED' AND "committedAt" >= now() - interval '30 days') AS committed_invoices_30d
  `;
  const bySource = await db.$queryRaw<{ day: Date; source: string; n: bigint }[]>`
    SELECT date_trunc('day', "changedAt" AT TIME ZONE 'Asia/Kolkata') AS day, source::text AS source, count(*) AS n
    FROM "PriceHistory"
    WHERE "oldDealerPrice" IS NOT NULL AND "changedAt" >= now() - interval '30 days'
    GROUP BY 1, 2
    ORDER BY 1
  `;
  const n = (v: bigint | undefined) => Number(v ?? 0);
  return {
    products: n(counts?.products),
    outOfStock: n(counts?.out_of_stock),
    lowStock: n(counts?.low_stock),
    changes7d: n(counts?.changes_7d),
    changes30d: n(counts?.changes_30d),
    new30d: n(counts?.new_30d),
    pendingInvoices: n(counts?.pending_invoices),
    committedInvoices30d: n(counts?.committed_invoices_30d),
    bySource: bySource.map((r) => ({ day: r.day.toISOString().slice(0, 10), source: r.source, n: Number(r.n) })),
  };
}

export async function biggestMoves(take = 5) {
  const rows = await db.$queryRaw<
    { id: string; productId: string; name: string; skuCode: string; old: Prisma.Decimal; new: Prisma.Decimal; at: Date }[]
  >`
    SELECT h.id, h."productId", p.name, p."skuCode", h."oldDealerPrice" AS old, h."newDealerPrice" AS new, h."changedAt" AS at
    FROM "PriceHistory" h JOIN "Product" p ON p.id = h."productId"
    WHERE h."oldDealerPrice" IS NOT NULL AND h."oldDealerPrice" > 0 AND h."changedAt" >= now() - interval '30 days'
    ORDER BY abs(h."newDealerPrice" - h."oldDealerPrice") / h."oldDealerPrice" DESC
    LIMIT ${take}
  `;
  return rows.map((r) => {
    const oldP = decimalToPaise(r.old);
    const newP = decimalToPaise(r.new);
    return {
      id: r.id,
      productId: r.productId,
      name: r.name,
      skuCode: r.skuCode,
      oldDealer: oldP,
      newDealer: newP,
      pct: ((newP - oldP) / oldP) * 100,
      at: r.at.toISOString(),
    };
  });
}
