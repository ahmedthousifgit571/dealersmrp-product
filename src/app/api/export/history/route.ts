import type { NextRequest } from "next/server";
import { authorizeApi } from "@/lib/auth/dal";
import { todayStamp, xlsxResponse } from "@/lib/excel/write";
import { listHistory, parseHistoryFilters } from "@/lib/history";

const r2 = (paise: number | null) => (paise === null ? null : Math.round(paise) / 100);
const SOURCE = { INVOICE_OCR: "Invoice", EXCEL_BULK: "Excel", MANUAL: "Manual" } as const;

/** Price history (same filters as the History page) as .xlsx. */
export async function GET(request: NextRequest) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const filters = parseHistoryFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { rows } = await listHistory(filters, { all: true });
  const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const header = [
    "Date", "SKU", "Product", "Brand", "Model", "Old dealer (ex GST)", "New dealer (ex GST)",
    "Old MRP", "New MRP", "Source", "Supplier", "Invoice no.", "Changed by", "Note",
  ];
  const data = rows.map((h) => [
    fmt.format(new Date(h.at)),
    h.skuCode,
    h.productName,
    h.brand,
    h.modelNumber,
    r2(h.oldDealer),
    r2(h.newDealer),
    r2(h.oldMrp),
    r2(h.newMrp),
    SOURCE[h.source],
    h.supplierName,
    h.invoiceNumber,
    h.changedBy,
    h.note,
  ]);
  return xlsxResponse(
    `electroprice-price-history-${todayStamp()}.xlsx`,
    "Price history",
    [header, ...data],
    [20, 12, 44, 14, 16, 12, 12, 10, 10, 9, 24, 16, 14, 30],
  );
}
