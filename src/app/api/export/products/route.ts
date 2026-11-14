import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { TEMPLATE_HEADERS } from "@/lib/excel/columns";
import { todayStamp, xlsxResponse } from "@/lib/excel/write";
import { decimalToPaise } from "@/lib/money";
import { landingPaise, marginPct } from "@/lib/pricing";

const r2 = (paise: number) => Math.round(paise) / 100;

/** All products as .xlsx, in the import template's columns, so the file can be edited and re-imported. */
export async function GET(request: NextRequest) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
  const products = await db.product.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });
  const updated = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
  const header = [...TEMPLATE_HEADERS.map((h) => h.header), "Landing incl. GST (info)", "Margin % (info)", "Last updated"];
  const rows = products.map((p) => {
    const gst = Number(p.gstPercentage);
    const dealer = decimalToPaise(p.dealerPrice);
    const mrp = decimalToPaise(p.mrp);
    const landing = landingPaise(dealer, gst);
    const margin = marginPct(landing, mrp);
    return [
      p.skuCode,
      p.barcode,
      p.name,
      p.brand,
      p.modelNumber,
      p.category,
      p.hsnCode,
      gst,
      r2(dealer),
      r2(mrp),
      p.stockQty,
      r2(landing),
      margin === null ? null : Math.round(margin * 10) / 10,
      updated.format(p.updatedAt),
    ];
  });
  return xlsxResponse(
    `electroprice-products-${todayStamp()}.xlsx`,
    "Products",
    [header, ...rows],
    [12, 15, 48, 14, 18, 14, 11, 7, 12, 11, 7, 14, 10, 14],
  );
}
