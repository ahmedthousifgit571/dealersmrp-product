import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { redactForViewer, searchProducts } from "@/lib/products/queries";
import { getSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const started = performance.now();

  // The three reads are independent, so they run in parallel (one round trip of latency).
  // proxy.ts has already rejected requests without a valid session cookie; the user is
  // re-checked against the database here before anything is returned.
  const [auth, settings, results] = await Promise.all([authorizeApi(), getSettings(), searchProducts(query)]);
  if (auth.error) return auth.error;

  const canSeeDealer = auth.user.role === "ADMIN" || settings.staffCanSeeDealerPrice;
  return Response.json(
    { query, results: redactForViewer(results, canSeeDealer), canSeeDealer },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}`,
      },
    },
  );
}
