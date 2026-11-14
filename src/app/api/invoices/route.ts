import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Starts a new invoice scan; pages are uploaded to /api/invoices/[id]/files next. */
export async function POST() {
  const auth = await authorizeApi();
  if (auth.error) return auth.error;
  const scan = await db.invoiceScanLog.create({
    data: { status: "UPLOADED", uploadedById: auth.user.id },
    select: { id: true },
  });
  return Response.json({ id: scan.id }, { status: 201 });
}
