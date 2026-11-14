import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * Deletes stored invoice images/PDFs once they are older than the retention setting
 * (counted from confirmation). Extracted lines and price history are kept.
 * Called daily by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`,
 * or manually by a signed-in admin.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const viaCron = !!secret && bearer === `Bearer ${secret}`;
  if (!viaCron) {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") return Response.json({ error: "Not allowed" }, { status: 401 });
  }

  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.purgeInvoiceFilesAfterDays * 86_400_000);
  const staleCutoff = new Date(Date.now() - 30 * 86_400_000);

  const [committed, abandoned] = await Promise.all([
    db.invoiceFile.updateMany({
      where: { data: { not: null }, scan: { status: "COMMITTED", committedAt: { lt: cutoff } } },
      data: { data: null, purgedAt: new Date() },
    }),
    // Uploads nobody finished reviewing within 30 days.
    db.invoiceFile.updateMany({
      where: { data: { not: null }, scan: { status: { in: ["UPLOADED", "FAILED", "DISCARDED"] }, updatedAt: { lt: staleCutoff } } },
      data: { data: null, purgedAt: new Date() },
    }),
  ]);
  return Response.json({ purged: committed.count + abandoned.count, retentionDays: settings.purgeInvoiceFilesAfterDays });
}
