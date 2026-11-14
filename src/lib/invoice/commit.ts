import "server-only";
import { db } from "@/lib/db";
import { toAliasKey } from "@/lib/normalize";
import { createProductTx, findDuplicates, setPricesTx } from "@/lib/products/mutations";
import { allIssues } from "./review";
import type { ReviewDraft } from "./schema";

export class CommitError extends Error {}

/**
 * Applies a reviewed invoice in one transaction. The first statement flips the scan from
 * PENDING_REVIEW to COMMITTED; if that touches no row, someone already confirmed it, and
 * nothing else runs (no double price changes).
 */
export async function commitInvoice(
  scanId: string,
  draft: ReviewDraft,
  ctx: { userId: string; addQtyToStock: boolean },
) {
  const issues = allIssues(draft.rows);
  if (issues.size > 0) {
    throw new CommitError(`${issues.size} line(s) still need attention before confirming.`);
  }
  const { header } = draft;
  const supplierName = header.supplierName ?? null;
  const invoiceNumber = header.invoiceNumber ?? null;

  return db.$transaction(
    async (tx) => {
      const claimed = await tx.invoiceScanLog.updateMany({
        where: { id: scanId, status: "PENDING_REVIEW" },
        data: {
          status: "COMMITTED",
          committedAt: new Date(),
          committedById: ctx.userId,
          reviewJson: draft,
          supplierName,
          supplierGstin: header.supplierGstin,
          invoiceNumber,
          invoiceDate: header.invoiceDate ? new Date(`${header.invoiceDate}T00:00:00+05:30`) : null,
          totalAmount: header.grandTotal !== null ? (header.grandTotal / 100).toFixed(2) : null,
        },
      });
      if (claimed.count === 0) throw new CommitError("This invoice was already confirmed or discarded.");

      const change = { source: "INVOICE_OCR" as const, changedById: ctx.userId, supplierName, invoiceNumber, invoiceScanId: scanId };
      let updated = 0;
      let priceChanges = 0;
      let created = 0;
      let skipped = 0;

      for (const row of draft.rows) {
        if (row.action === "SKIP") {
          skipped++;
          continue;
        }
        const qty = ctx.addQtyToStock && row.quantity && row.quantity > 0 ? Math.round(row.quantity) : 0;
        const aliasKey = toAliasKey(row.description);

        if (row.action === "UPDATE") {
          const exists = await tx.product.findUnique({ where: { id: row.productId! }, select: { id: true } });
          if (!exists) throw new CommitError(`Line ${row.lineNo}: the matched product no longer exists. Pick it again.`);
          const res = await setPricesTx(tx, row.productId!, { dealerPrice: row.dealer!, mrp: row.mrp!, stockDelta: qty }, change);
          updated++;
          if (res.priceChanged) priceChanges++;
          if (aliasKey) {
            await tx.productAlias.upsert({
              where: { aliasKey },
              create: { aliasKey, aliasName: row.description.slice(0, 200), supplierName, productId: row.productId! },
              update: { productId: row.productId!, aliasName: row.description.slice(0, 200), supplierName },
            });
          }
          continue;
        }

        // CREATE
        const dups = await findDuplicates({ barcode: row.barcode, brand: row.brand, modelNumber: row.modelNumber }, undefined, tx);
        if (dups.length > 0) {
          throw new CommitError(
            `Line ${row.lineNo}: "${row.name}" looks like ${dups[0]!.name} (${dups[0]!.skuCode}), which already exists. Match the line to it instead.`,
          );
        }
        const product = await createProductTx(
          tx,
          {
            name: row.name.trim(),
            brand: row.brand,
            modelNumber: row.modelNumber,
            barcode: row.barcode,
            category: row.category,
            hsnCode: row.hsnCode,
            gstPct: row.gstPct,
            dealerPrice: row.dealer!,
            mrp: row.mrp!,
            stockQty: qty,
          },
          { ...change, note: "Added from invoice" },
        );
        created++;
        if (aliasKey) {
          await tx.productAlias.upsert({
            where: { aliasKey },
            create: { aliasKey, aliasName: row.description.slice(0, 200), supplierName, productId: product.id },
            update: { productId: product.id, aliasName: row.description.slice(0, 200), supplierName },
          });
        }
      }

      return { updated, priceChanges, created, skipped };
    },
    { timeout: 90_000, maxWait: 15_000 },
  );
}
