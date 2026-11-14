"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { scanForUser } from "@/lib/invoice/access";
import { commitInvoice, CommitError } from "@/lib/invoice/commit";
import { ReviewDraftSchema, type ReviewDraft } from "@/lib/invoice/schema";
import { getSettings } from "@/lib/settings";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Autosave of the admin's edits while reviewing. */
export async function saveReviewDraft(scanId: string, draft: ReviewDraft): Promise<Result<{ savedAt: string }>> {
  await requireAdmin();
  const parsed = ReviewDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "Some values couldn't be saved. Check the highlighted lines." };
  const res = await db.invoiceScanLog.updateMany({
    where: { id: scanId, status: "PENDING_REVIEW" },
    data: {
      reviewJson: parsed.data,
      supplierName: parsed.data.header.supplierName,
      supplierGstin: parsed.data.header.supplierGstin,
      invoiceNumber: parsed.data.header.invoiceNumber,
    },
  });
  if (res.count === 0) return { ok: false, error: "This invoice is no longer open for review." };
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function confirmInvoice(
  scanId: string,
  draft: ReviewDraft,
): Promise<Result<{ updated: number; priceChanges: number; created: number; skipped: number }>> {
  const me = await requireAdmin();
  const parsed = ReviewDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "Some lines have invalid values. Check them and try again." };
  const settings = await getSettings();
  try {
    const summary = await commitInvoice(scanId, parsed.data, { userId: me.id, addQtyToStock: settings.addInvoiceQtyToStock });
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/products");
    revalidatePath("/admin/history");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${scanId}`);
    return { ok: true, ...summary };
  } catch (err) {
    if (err instanceof CommitError) return { ok: false, error: err.message };
    console.error("Invoice commit failed", err);
    return { ok: false, error: "Nothing was saved. Something went wrong; try again." };
  }
}

/** Discards an unconfirmed invoice and frees its stored images. */
export async function discardInvoice(scanId: string): Promise<Result> {
  const me = await requireUser();
  const scan = await scanForUser(scanId, me);
  if (!scan) return { ok: false, error: "Invoice not found." };
  const res = await db.invoiceScanLog.updateMany({
    where: { id: scanId, status: { in: ["UPLOADED", "FAILED", "PENDING_REVIEW"] } },
    data: { status: "DISCARDED" },
  });
  if (res.count === 0) return { ok: false, error: "Confirmed invoices can't be discarded." };
  await db.invoiceFile.updateMany({ where: { scanId }, data: { data: null, purgedAt: new Date() } });
  revalidatePath("/invoices");
  revalidatePath("/admin");
  return { ok: true };
}
