import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise, type Paise } from "@/lib/money";
import { normalizeBarcode, toModelKey } from "@/lib/normalize";
import { changePct, landingPaise } from "@/lib/pricing";

/** What the Price Finder shows for one product. Dealer fields are null when hidden from this viewer. */
export type ProductHit = {
  id: string;
  skuCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  category: string | null;
  hsnCode: string | null;
  gstPct: number;
  mrp: Paise;
  dealerPrice: Paise | null;
  landing: Paise | null;
  stockQty: number;
  updatedAt: string;
  match: "exact" | "text" | "fuzzy" | "recent";
  lastChange: {
    at: string;
    source: "INVOICE_OCR" | "EXCEL_BULK" | "MANUAL";
    mrpPct: number | null;
    dealerPct: number | null;
  } | null;
};

const SEARCH_LIMIT = 20;
const FUZZY_THRESHOLD = 0.42;

type Decimalish = { toString(): string };

/** One row of the finder query: the product plus its latest price change (LATERAL join). */
type FinderRow = {
  id: string;
  skuCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  category: string | null;
  hsnCode: string | null;
  gstPercentage: Decimalish;
  dealerPrice: Decimalish;
  mrp: Decimalish;
  stockQty: number;
  updatedAt: Date;
  tier: number; // 0 exact code, 1 every word matches, 2 fuzzy, 3 recent
  h_changedAt: Date | null;
  h_source: "INVOICE_OCR" | "EXCEL_BULK" | "MANUAL" | null;
  h_oldDealer: Decimalish | null;
  h_newDealer: Decimalish | null;
  h_oldMrp: Decimalish | null;
  h_newMrp: Decimalish | null;
};

const TIER_MATCH: ProductHit["match"][] = ["exact", "text", "fuzzy", "recent"];
const paiseOrNull = (v: Decimalish | null) => (v === null ? null : decimalToPaise(v));

function toHit(r: FinderRow): ProductHit {
  const gstPct = Number(r.gstPercentage);
  const dealer = decimalToPaise(r.dealerPrice);
  return {
    id: r.id,
    skuCode: r.skuCode,
    barcode: r.barcode,
    name: r.name,
    brand: r.brand,
    modelNumber: r.modelNumber,
    category: r.category,
    hsnCode: r.hsnCode,
    gstPct,
    mrp: decimalToPaise(r.mrp),
    dealerPrice: dealer,
    landing: landingPaise(dealer, gstPct),
    stockQty: r.stockQty,
    updatedAt: r.updatedAt.toISOString(),
    match: TIER_MATCH[r.tier] ?? "fuzzy",
    lastChange:
      r.h_changedAt && r.h_source && r.h_newMrp && r.h_newDealer
        ? {
            at: r.h_changedAt.toISOString(),
            source: r.h_source,
            mrpPct: changePct(paiseOrNull(r.h_oldMrp), decimalToPaise(r.h_newMrp)),
            dealerPct: changePct(paiseOrNull(r.h_oldDealer), decimalToPaise(r.h_newDealer)),
          }
        : null,
  };
}

/** Removes cost information for viewers who may not see it. Always applied on the server. */
export function redactForViewer(hits: ProductHit[], canSeeDealer: boolean): ProductHit[] {
  if (canSeeDealer) return hits;
  return hits.map((h) => ({
    ...h,
    dealerPrice: null,
    landing: null,
    lastChange: h.lastChange ? { ...h.lastChange, dealerPct: null } : null,
  }));
}

function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Single round trip: products + latest PriceHistory row, filtered and ranked by `tier`. */
function finderQuery(tier: Prisma.Sql, where: Prisma.Sql, orderBy: Prisma.Sql, limit: number) {
  return db.$queryRaw<FinderRow[]>`
    SELECT p.id, p."skuCode", p.barcode, p.name, p.brand, p."modelNumber", p.category, p."hsnCode",
           p."gstPercentage", p."dealerPrice", p.mrp, p."stockQty", p."updatedAt",
           ${tier} AS tier,
           h."changedAt" AS "h_changedAt", h.source::text AS "h_source",
           h."oldDealerPrice" AS "h_oldDealer", h."newDealerPrice" AS "h_newDealer",
           h."oldMrp" AS "h_oldMrp", h."newMrp" AS "h_newMrp"
    FROM "Product" p
    LEFT JOIN LATERAL (
      SELECT ph."changedAt", ph.source, ph."oldDealerPrice", ph."newDealerPrice", ph."oldMrp", ph."newMrp"
      FROM "PriceHistory" ph
      WHERE ph."productId" = p.id
      ORDER BY ph."changedAt" DESC
      LIMIT 1
    ) h ON true
    WHERE p."archivedAt" IS NULL AND (${where})
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;
}

/** Products most recently created or re-priced, for the Finder's empty state. */
export async function recentProducts(take = 8): Promise<ProductHit[]> {
  const rows = await finderQuery(Prisma.sql`3`, Prisma.sql`true`, Prisma.sql`p."updatedAt" DESC`, take);
  return rows.map(toHit);
}

/**
 * Ranked in one query:
 *   tier 0: exact barcode / SKU / model number (what a scanner or a typed code gives)
 *   tier 1: every word of the query appears somewhere (name, brand, model, SKU, barcode)
 *   tier 2: trigram fuzzy match for typos ("cromptn hsplus")
 * Only the best tier present is returned, so a precise hit isn't buried under near-misses.
 * Returns full prices; pass the result through `redactForViewer` before sending it out.
 */
export async function searchProducts(rawQuery: string): Promise<ProductHit[]> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length === 0) return recentProducts();

  const barcode = normalizeBarcode(query);
  const modelKey = toModelKey(query);
  const exactParts = [
    Prisma.sql`p."skuCode" = ${query.toUpperCase()}`,
    ...(barcode ? [Prisma.sql`p.barcode = ${barcode}`] : []),
    ...(modelKey && modelKey.length >= 3 ? [Prisma.sql`p."modelKey" = ${modelKey}`] : []),
  ];
  const exact = Prisma.join(exactParts, " OR ");

  const needle = query.toLowerCase().replace(/(\d)\s*(?:"|''|inch(?:es)?)/g, "$1in");
  const tokens = needle.split(/\s+/).filter(Boolean).slice(0, 6);
  const allTokens = Prisma.join(
    tokens.map((t) => Prisma.sql`p."searchText" ILIKE ${`%${escapeLike(t)}%`}`),
    " AND ",
  );
  const similarity = Prisma.sql`word_similarity(${needle}, p."searchText")`;

  const tier = Prisma.sql`(CASE WHEN (${exact}) THEN 0 WHEN (${allTokens}) THEN 1 ELSE 2 END)`;
  const rows = await finderQuery(
    tier,
    Prisma.sql`(${exact}) OR (${allTokens}) OR ${similarity} > ${FUZZY_THRESHOLD}`,
    Prisma.sql`tier ASC, ${similarity} DESC, p."updatedAt" DESC`,
    SEARCH_LIMIT,
  );
  const best = rows.length > 0 ? Math.min(...rows.map((r) => r.tier)) : 0;
  return rows.filter((r) => r.tier === best).map(toHit);
}

export async function catalogueStats() {
  const [row] = await db.$queryRaw<{ products: bigint; brands: bigint; changes7d: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "Product" WHERE "archivedAt" IS NULL) AS products,
      (SELECT count(DISTINCT lower(brand)) FROM "Product" WHERE "archivedAt" IS NULL AND brand IS NOT NULL) AS brands,
      (SELECT count(*) FROM "PriceHistory" WHERE "changedAt" >= now() - interval '7 days' AND "oldDealerPrice" IS NOT NULL) AS "changes7d"
  `;
  return {
    products: Number(row?.products ?? 0),
    brands: Number(row?.brands ?? 0),
    changes7d: Number(row?.changes7d ?? 0),
  };
}
