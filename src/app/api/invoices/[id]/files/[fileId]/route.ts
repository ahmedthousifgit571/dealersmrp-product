import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { scanForUser } from "@/lib/invoice/access";

/** Streams one uploaded invoice page to the review viewer. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/files/[fileId]">) {
  const auth = await authorizeApi();
  if (auth.error) return auth.error;
  const { id, fileId } = await ctx.params;
  const scan = await scanForUser(id, auth.user);
  if (!scan) return new Response("Not found", { status: 404 });

  const file = await db.invoiceFile.findFirst({
    where: { id: fileId, scanId: id },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!file) return new Response("Not found", { status: 404 });
  if (!file.data) return new Response("This file was removed after the retention period.", { status: 410 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
