import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise } from "@/lib/money";
import { normalizeBarcode, toAliasKey, toModelKey } from "@/lib/normalize";
import type { LineMatch } from "./review";
import type { InvoiceLine, ProductSnapshot, Suggestion } from "./schema";

type ProductRow = {
  id: string;
  name: string;
  skuCode: string;
  brand: string | null;
  barcode: string | null;
  modelKey: string | null;
  dealerPrice: Prisma.Decimal;
  mrp: Prisma.Decimal;
  gstPercentage: Prisma.Decimal;
  stockQty: number;
  archivedAt: Date | null;
};

const select = {
  id: true, name: true, skuCode: true, brand: true, barcode: true, modelKey: true,
  dealerPrice: true, mrp: true, gstPercentage: true, stockQty: true, archivedAt: true,
} as const;

function snapshot(p: ProductRow): ProductSnapshot {
  return {
    name: p.name,
    skuCode: p.skuCode,
    dealer: decimalToPaise(p.dealerPrice),
    mrp: decimalToPaise(p.mrp),
    gstPct: Number(p.gstPercentage),
    stockQty: p.stockQty,
    archived: p.archivedAt !== null,
  };
}

const SUGGEST_SIMILARITY = 0.33;
const SUGGEST_WORD_SIMILARITY = 0.65;

/**
 * Finds the product for each invoice line:
 *   1. supplier wording seen before (ProductAlias)  2. barcode  3. brand + model number
 *   4. otherwise up to 3 fuzzy suggestions (trigram similarity) for the admin to confirm.
 */
export async function matchLines(lines: InvoiceLine[]): Promise<LineMatch[]> {
  const aliasKeys = lines.map((l) => toAliasKey(l.description));
  const barcodes = lines.map((l) => normalizeBarcode(l.barcode));
  const modelKeys = lines.map((l) => toModelKey(l.modelNumber));

  const [aliases, byBarcode, byModel] = await Promise.all([
    db.productAlias.findMany({
      where: { aliasKey: { in: [...new Set(aliasKeys.filter(Boolean))] } },
      select: { aliasKey: true, product: { select } },
    }),
    barcodes.some(Boolean)
      ? db.product.findMany({ where: { barcode: { in: barcodes.filter((b): b is string => !!b) } }, select })
      : Promise.resolve([] as ProductRow[]),
    modelKeys.some(Boolean)
      ? db.product.findMany({ where: { modelKey: { in: modelKeys.filter((m): m is string => !!m) } }, select })
      : Promise.resolve([] as ProductRow[]),
  ]);

  const aliasMap = new Map(aliases.map((a) => [a.aliasKey, a.product]));
  const barcodeMap = new Map(byBarcode.map((p) => [p.barcode!, p]));

  const exact: (LineMatch | null)[] = lines.map((line, i) => {
    const viaAlias = aliasMap.get(aliasKeys[i]!);
    if (viaAlias) return { productId: viaAlias.id, matchedBy: "alias", current: snapshot(viaAlias), suggestions: [] };
    const bc = barcodes[i];
    if (bc && barcodeMap.has(bc)) {
      const p = barcodeMap.get(bc)!;
      return { productId: p.id, matchedBy: "barcode", current: snapshot(p), suggestions: [] };
    }
    const mk = modelKeys[i];
    if (mk) {
      let pool = byModel.filter((p) => p.modelKey === mk);
      if (pool.length > 1 && line.brand) pool = pool.filter((p) => (p.brand ?? "").toLowerCase() === line.brand!.toLowerCase());
      if (pool.length === 1) return { productId: pool[0]!.id, matchedBy: "model", current: snapshot(pool[0]!), suggestions: [] };
    }
    return null;
  });

  // Fuzzy suggestions only for lines without an exact match (in parallel).
  return Promise.all(
    lines.map(async (line, i): Promise<LineMatch> => {
      if (exact[i]) return exact[i]!;
      const needle = [line.brand, line.description, line.modelNumber].filter(Boolean).join(" ").toLowerCase().slice(0, 160);
      const lineModel = modelKeys[i] ?? null;
      // Thresholds tuned on real wording: a true match scored sim 0.48 / word 0.81, near-misses
      // (same brand, different product) about 0.24 / 0.46–0.50. A different model number rules a candidate out.
      const rows = await db.$queryRaw<(ProductRow & { score: number })[]>`
        SELECT id, name, "skuCode", brand, barcode, "modelKey", "dealerPrice", mrp, "gstPercentage", "stockQty", "archivedAt",
               GREATEST(similarity(${needle}, "searchText"), word_similarity(${needle}, "searchText") * 0.8) AS score
        FROM "Product"
        WHERE "archivedAt" IS NULL
          AND (similarity(${needle}, "searchText") >= ${SUGGEST_SIMILARITY} OR word_similarity(${needle}, "searchText") >= ${SUGGEST_WORD_SIMILARITY})
          AND (${lineModel}::text IS NULL OR "modelKey" IS NULL OR "modelKey" = ${lineModel})
        ORDER BY score DESC
        LIMIT 3
      `;
      const suggestions: Suggestion[] = rows.map((r) => ({ id: r.id, score: Number(r.score), ...snapshot(r) }));
      return { productId: null, matchedBy: null, current: null, suggestions };
    }),
  );
}
