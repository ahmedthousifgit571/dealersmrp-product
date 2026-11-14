import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeBarcode, toAliasKey, toModelKey } from "@/lib/normalize";

describe("normalize", () => {
  it("builds model keys", () => {
    expect(toModelKey("WH-STROM 2/18")).toBe("WHSTROM218");
    expect(toModelKey(" -- ")).toBeNull();
    expect(toModelKey(null)).toBeNull();
  });

  it("folds supplier descriptions to the same alias key", () => {
    const a = toAliasKey('WH STROM2 18" Black');
    expect(a).toBe("wh strom2 18in black");
    expect(toAliasKey("wh  strom2 18 inch BLACK")).toBe(a);
    expect(toAliasKey("WH STROM2 18'' black")).toBe(a);
    expect(toAliasKey("WH-STROM2 18in. Black")).toBe(a);
  });

  it("normalizes barcodes", () => {
    expect(normalizeBarcode(" 8901 234-567890 ")).toBe("8901234567890");
    expect(normalizeBarcode("")).toBeNull();
  });

  it("builds search text including the compact model key", () => {
    const text = buildSearchText({
      name: 'Crompton HS Plus 48" Ceiling Fan',
      brand: "Crompton",
      modelNumber: "HS-PLUS 48",
      skuCode: "ELEC-1001",
      barcode: "8901234567890",
    });
    expect(text).toContain("hsplus48");
    expect(text).toContain("48in");
    expect(text).toContain("elec-1001");
  });
});
