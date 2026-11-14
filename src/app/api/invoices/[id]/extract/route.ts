import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { scanForUser } from "@/lib/invoice/access";
import { ExtractionError, extractInvoice } from "@/lib/invoice/extract";
import { matchLines } from "@/lib/invoice/match";
import { buildHeader, buildReviewRows } from "@/lib/invoice/review";
import { getSettings } from "@/lib/settings";

// Reading a multi-page invoice can take a while on the AI side.
export const maxDuration = 60;

/** Reads the uploaded pages with AI, matches lines to products, and prepares the review. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/extract">) {
  const auth = await authorizeApi();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const scan = await scanForUser(id, auth.user);
  if (!scan) return Response.json({ error: "Invoice not found" }, { status: 404 });

  // Claim the scan so two taps don't read it twice.
  const claimed = await db.invoiceScanLog.updateMany({
    where: { id, status: { in: ["UPLOADED", "FAILED"] } },
    data: { status: "EXTRACTING", error: null },
  });
  if (claimed.count === 0) return Response.json({ error: "This invoice is already being read or was read." }, { status: 409 });

  const files = await db.invoiceFile.findMany({
    where: { scanId: id, data: { not: null } },
    orderBy: { pageOrder: "asc" },
    select: { mimeType: true, data: true },
  });
  if (files.length === 0) {
    await db.invoiceScanLog.update({ where: { id }, data: { status: "UPLOADED" } });
    return Response.json({ error: "Upload at least one page first." }, { status: 400 });
  }

  try {
    const [settings, result] = await Promise.all([
      getSettings(),
      extractInvoice(files.map((f) => ({ mimeType: f.mimeType, data: f.data! }))),
    ]);
    const matches = await matchLines(result.extraction.lineItems);
    const rows = buildReviewRows(result.extraction, matches, {
      markupPct: settings.mrpMarkupPct,
      defaultGst: settings.defaultGst,
    });
    const header = buildHeader(result.extraction);
    await db.invoiceScanLog.update({
      where: { id },
      data: {
        status: "PENDING_REVIEW",
        rawJson: result.extraction,
        reviewJson: { header, rows },
        aiModel: result.model,
        isMock: result.mock,
        lineCount: rows.length,
        supplierName: header.supplierName,
        supplierGstin: header.supplierGstin,
        invoiceNumber: header.invoiceNumber,
        invoiceDate: header.invoiceDate ? new Date(`${header.invoiceDate}T00:00:00+05:30`) : null,
        totalAmount: header.grandTotal !== null ? (header.grandTotal / 100).toFixed(2) : null,
      },
    });
    return Response.json({ id, status: "PENDING_REVIEW", lines: rows.length, mock: result.mock });
  } catch (err) {
    const message = err instanceof ExtractionError ? err.message : "Something went wrong while reading the invoice. Press Retry.";
    if (!(err instanceof ExtractionError)) console.error("Invoice extraction failed", err);
    await db.invoiceScanLog.update({ where: { id }, data: { status: "FAILED", error: message } });
    return Response.json({ error: message }, { status: 502 });
  }
}
