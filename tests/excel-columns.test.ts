import { describe, expect, it } from "vitest";
import { autoMap, buildRows, detectHeaderRow, fieldForHeader, TEMPLATE_HEADERS } from "@/lib/excel/columns";

describe("fieldForHeader", () => {
  it.each([
    ["SKU", "sku"],
    ["Item Code", "sku"],
    ["EAN Code", "barcode"],
    ["Product Name", "name"],
    ["Particulars", "name"],
    ["Make", "brand"],
    ["Model No.", "model"],
    ["HSN/SAC", "hsn"],
    ["GST %", "gst"],
    ["D.P.", "dealer"],
    ["DP", "dealer"],
    ["Dealer Price (ex GST)", "dealer"],
    ["Net Rate", "dealer"],
    ["NLC", "dealer"],
    ["Dealer Price incl. GST (Rs)", "dealerIncl"],
    ["Landing Price", "dealerIncl"],
    ["M.R.P.", "mrp"],
    ["MRP (Rs)", "mrp"],
    ["Closing Stock", "stock"],
    ["Qty", "stock"],
  ])("%s → %s", (header, field) => {
    expect(fieldForHeader(header)).toBe(field);
  });

  it("ignores unrelated headers", () => {
    expect(fieldForHeader("Remarks")).toBeNull();
    expect(fieldForHeader("")).toBeNull();
  });
});

describe("sheet parsing", () => {
  const sheet: unknown[][] = [
    ["Sri Balaji Electricals — Price list Nov 2026"],
    [],
    ["S.No", "Make", "Model No.", "Particulars", "D.P.", "M.R.P.", "Remarks"],
    [1, "Crompton", "HS PLUS 48", "HS Plus 1200mm Brown", 2156, 3250, ""],
    [],
    [2, "Havells", "MONZA EC 15", "Monza 15L", 8899.5, 13800, "new rate"],
  ];

  it("finds the header row under a title block", () => {
    expect(detectHeaderRow(sheet)).toBe(2);
  });

  it("maps columns and builds rows, skipping blanks", () => {
    const mapping = autoMap(sheet[2]!);
    expect(mapping).toMatchObject({ brand: 1, model: 2, name: 3, dealer: 4, mrp: 5 });
    const rows = buildRows(sheet, 2, mapping);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 4, brand: "Crompton", model: "HS PLUS 48", dealer: "2156", mrp: "3250" });
    expect(rows[1]).toMatchObject({ rowNumber: 6, dealer: "8899.5" });
  });

  it("round-trips the template / export headers", () => {
    const mapping = autoMap(TEMPLATE_HEADERS.map((h) => h.header));
    for (const [i, h] of TEMPLATE_HEADERS.entries()) expect(mapping[h.field]).toBe(i);
  });
});
