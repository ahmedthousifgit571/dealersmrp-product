import "server-only";
import { Prisma, type PriceSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise, toDecimalString, type Paise } from "@/lib/money";
import { buildSearchText, toModelKey } from "@/lib/normalize";
import type { ProductFormValues } from "./schema";

export type Tx = Prisma.TransactionClient;

export type DuplicateHit = { id: string; name: string; skuCode: string; reason: "barcode" | "model" | "sku" };

/** Products that would clash with these identifiers (excluding `excludeId`). */
export async function findDuplicates(
  input: { barcode?: string | null; brand?: string | null; modelNumber?: string | null; skuCode?: string | null },
  excludeId?: string,
  client: Tx | typeof db = db,
): Promise<DuplicateHit[]> {
  const modelKey = toModelKey(input.modelNumber);
  const or: Prisma.ProductWhereInput[] = [];
  if (input.barcode) or.push({ barcode: input.barcode });
  if (input.skuCode) or.push({ skuCode: input.skuCode });
  if (modelKey) {
    or.push({
      modelKey,
      ...(input.brand ? { brand: { equals: input.brand, mode: "insensitive" as const } } : {}),
    });
  }
  if (or.length === 0) return [];
  const rows = await client.product.findMany({
    where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, skuCode: true, barcode: true, modelKey: true },
    take: 5,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    skuCode: r.skuCode,
    reason:
      input.barcode && r.barcode === input.barcode
        ? "barcode"
        : input.skuCode && r.skuCode === input.skuCode
          ? "sku"
          : "model",
  }));
}

/** Allocates the next free SKU (e.g. ELEC-1041) inside the caller's transaction. */
export async function allocateSku(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const s = await tx.appSetting.upsert({
      where: { id: "app" },
      create: { id: "app", nextSkuNumber: 1002 },
      update: { nextSkuNumber: { increment: 1 } },
    });
    const sku = `${s.skuPrefix}-${s.nextSkuNumber - 1}`;
    const taken = await tx.product.findUnique({ where: { skuCode: sku }, select: { id: true } });
    if (!taken) return sku;
  }
  throw new Error("Couldn't find a free SKU. Check the SKU prefix in Settings.");
}

type PriceChange = {
  source: PriceSource;
  changedById: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceScanId?: string | null;
  note?: string | null;
};

/** Creates a product and its opening price record. */
export async function createProductTx(
  tx: Tx,
  v: Omit<ProductFormValues, "allowDuplicateModel" | "note"> & { skuCode?: string | null },
  change: PriceChange,
) {
  const skuCode = v.skuCode || (await allocateSku(tx));
  const product = await tx.product.create({
    data: {
      skuCode,
      barcode: v.barcode,
      name: v.name,
      brand: v.brand,
      modelNumber: v.modelNumber,
      modelKey: toModelKey(v.modelNumber),
      category: v.category,
      hsnCode: v.hsnCode,
      gstPercentage: v.gstPct.toFixed(2),
      dealerPrice: toDecimalString(v.dealerPrice),
      mrp: toDecimalString(v.mrp),
      stockQty: v.stockQty,
      searchText: buildSearchText({ ...v, skuCode }),
    },
  });
  await tx.priceHistory.create({
    data: {
      productId: product.id,
      oldDealerPrice: null,
      newDealerPrice: toDecimalString(v.dealerPrice),
      oldMrp: null,
      newMrp: toDecimalString(v.mrp),
      source: change.source,
      supplierName: change.supplierName ?? null,
      invoiceNumber: change.invoiceNumber ?? null,
      invoiceScanId: change.invoiceScanId ?? null,
      note: change.note ?? "Opening price",
      changedById: change.changedById,
    },
  });
  return product;
}

/**
 * Sets new prices (and optional other fields) and records a PriceHistory row when a price moved.
 * Returns whether the price changed.
 */
export async function setPricesTx(
  tx: Tx,
  productId: string,
  next: { dealerPrice: Paise; mrp: Paise; stockDelta?: number; extra?: Prisma.ProductUpdateInput },
  change: PriceChange,
): Promise<{ priceChanged: boolean }> {
  const current = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { dealerPrice: true, mrp: true },
  });
  const oldDealer = decimalToPaise(current.dealerPrice);
  const oldMrp = decimalToPaise(current.mrp);
  const priceChanged = oldDealer !== next.dealerPrice || oldMrp !== next.mrp;

  const data: Prisma.ProductUpdateInput = { ...(next.extra ?? {}) };
  if (priceChanged) {
    data.dealerPrice = toDecimalString(next.dealerPrice);
    data.mrp = toDecimalString(next.mrp);
  }
  if (next.stockDelta) data.stockQty = { increment: next.stockDelta };
  if (Object.keys(data).length > 0) await tx.product.update({ where: { id: productId }, data });

  if (priceChanged) {
    await tx.priceHistory.create({
      data: {
        productId,
        oldDealerPrice: toDecimalString(oldDealer),
        newDealerPrice: toDecimalString(next.dealerPrice),
        oldMrp: toDecimalString(oldMrp),
        newMrp: toDecimalString(next.mrp),
        source: change.source,
        supplierName: change.supplierName ?? null,
        invoiceNumber: change.invoiceNumber ?? null,
        invoiceScanId: change.invoiceScanId ?? null,
        note: change.note ?? null,
        changedById: change.changedById,
      },
    });
  }
  return { priceChanged };
}

/** Full edit from the product form. */
export async function updateProductTx(
  tx: Tx,
  productId: string,
  v: Omit<ProductFormValues, "allowDuplicateModel">,
  changedById: string,
) {
  const existing = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { skuCode: true } });
  const extra: Prisma.ProductUpdateInput = {
    name: v.name,
    brand: v.brand,
    modelNumber: v.modelNumber,
    modelKey: toModelKey(v.modelNumber),
    barcode: v.barcode,
    category: v.category,
    hsnCode: v.hsnCode,
    gstPercentage: v.gstPct.toFixed(2),
    stockQty: v.stockQty,
    searchText: buildSearchText({ ...v, skuCode: existing.skuCode }),
  };
  return setPricesTx(
    tx,
    productId,
    { dealerPrice: v.dealerPrice, mrp: v.mrp, extra },
    { source: "MANUAL", changedById, note: v.note ?? null },
  );
}

/** True for Prisma unique-constraint errors (e.g. two people saving the same barcode at once). */
export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
