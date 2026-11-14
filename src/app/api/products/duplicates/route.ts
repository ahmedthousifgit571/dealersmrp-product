import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { normalizeBarcode } from "@/lib/normalize";
import { findDuplicates } from "@/lib/products/mutations";

/** Live duplicate check for the product form (admins only). */
export async function GET(request: NextRequest) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const p = request.nextUrl.searchParams;
  const duplicates = await findDuplicates(
    {
      barcode: normalizeBarcode(p.get("barcode")),
      brand: p.get("brand")?.trim() || null,
      modelNumber: p.get("model")?.trim() || null,
    },
    p.get("exclude") ?? undefined,
  );
  return Response.json({ duplicates }, { headers: { "Cache-Control": "private, no-store" } });
}
