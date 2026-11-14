import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise } from "@/lib/money";

export type HistoryFilters = {
  source?: "INVOICE_OCR" | "EXCEL_BULK" | "MANUAL";
  q?: string;
  from?: string; // YYYY-MM-DD (shop time)
  to?: string; // YYYY-MM-DD inclusive
  kind?: "changes" | "all"; // "changes" hides opening prices
  page?: number;
};

export const HISTORY_PAGE_SIZE = 40;

export function parseHistoryFilters(sp: Record<string, string | string[] | undefined>): HistoryFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const source = one(sp.source);
  return {
    source: source === "INVOICE_OCR" || source === "EXCEL_BULK" || source === "MANUAL" ? source : undefined,
    q: one(sp.q)?.slice(0, 80) || undefined,
    from: date(one(sp.from)),
    to: date(one(sp.to)),
    kind: one(sp.kind) === "all" ? "all" : "changes",
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
  };
}

function whereFor(f: HistoryFilters): Prisma.PriceHistoryWhereInput {
  const where: Prisma.PriceHistoryWhereInput = {};
  if (f.source) where.source = f.source;
  if (f.kind !== "all") where.oldDealerPrice = { not: null };
  const changedAt: Prisma.DateTimeFilter = {};
  if (f.from) changedAt.gte = new Date(`${f.from}T00:00:00+05:30`);
  if (f.to) changedAt.lt = new Date(new Date(`${f.to}T00:00:00+05:30`).getTime() + 86_400_000);
  if (f.from || f.to) where.changedAt = changedAt;
  const tokens = (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length) {
    where.OR = [
      { product: { AND: tokens.map((t) => ({ searchText: { contains: t } })) } },
      { supplierName: { contains: f.q, mode: "insensitive" } },
      { invoiceNumber: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listHistory(f: HistoryFilters, opts: { all?: boolean } = {}) {
  const where = whereFor(f);
  const page = f.page ?? 1;
  const [rows, total] = await Promise.all([
    db.priceHistory.findMany({
      where,
      orderBy: { changedAt: "desc" },
      skip: opts.all ? 0 : (page - 1) * HISTORY_PAGE_SIZE,
      take: opts.all ? 20_000 : HISTORY_PAGE_SIZE,
      include: {
        product: { select: { id: true, name: true, skuCode: true, brand: true, modelNumber: true } },
        changedBy: { select: { name: true } },
      },
    }),
    db.priceHistory.count({ where }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
    rows: rows.map((h) => ({
      id: h.id,
      at: h.changedAt.toISOString(),
      productId: h.product.id,
      productName: h.product.name,
      skuCode: h.product.skuCode,
      brand: h.product.brand,
      modelNumber: h.product.modelNumber,
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
  };
}
