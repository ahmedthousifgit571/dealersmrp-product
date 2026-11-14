import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { ALLOWED_TYPES, MAX_FILE_BYTES, MAX_PAGES, scanForUser } from "@/lib/invoice/access";

/** Adds one page (compressed image or a PDF) to a scan that hasn't been read yet. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/files">) {
  const auth = await authorizeApi();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const scan = await scanForUser(id, auth.user);
  if (!scan) return Response.json({ error: "Invoice not found" }, { status: 404 });
  if (scan.status !== "UPLOADED" && scan.status !== "FAILED") {
    return Response.json({ error: "This invoice has already been read." }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return Response.json({ error: "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF." }, { status: 415 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "That file is over 4 MB. Use a smaller PDF or retake the photo." }, { status: 413 });
  }

  const existing = await db.invoiceFile.findMany({ where: { scanId: id }, select: { mimeType: true } });
  if (existing.length >= MAX_PAGES) return Response.json({ error: `Up to ${MAX_PAGES} pages per invoice.` }, { status: 400 });
  const hasPdf = existing.some((f) => f.mimeType === "application/pdf");
  if (hasPdf || (mimeType === "application/pdf" && existing.length > 0)) {
    return Response.json({ error: "A PDF has to be the only file for an invoice." }, { status: 400 });
  }

  const saved = await db.invoiceFile.create({
    data: {
      scanId: id,
      fileName: (file.name || "invoice").slice(0, 120),
      mimeType,
      size: file.size,
      data: new Uint8Array(await file.arrayBuffer()),
      pageOrder: existing.length,
    },
    select: { id: true, pageOrder: true },
  });
  return Response.json(saved, { status: 201 });
}
