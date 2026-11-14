import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { redactForViewer, searchProducts } from "@/lib/products/queries";
import { getSettings } from "@/lib/settings";

/** Exact code lookup for scanners: barcode, SKU or model number. Returns only exact matches. */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) return Response.json({ code, results: [] });

  const [auth, settings, hits] = await Promise.all([authorizeApi(), getSettings(), searchProducts(code)]);
  if (auth.error) return auth.error;

  const exact = hits.filter((h) => h.match === "exact");
  const canSeeDealer = auth.user.role === "ADMIN" || settings.staffCanSeeDealerPrice;
  return Response.json(
    { code, results: redactForViewer(exact, canSeeDealer) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
