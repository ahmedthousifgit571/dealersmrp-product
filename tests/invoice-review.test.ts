import { describe, expect, it } from "vitest";
import { DEMO_EXTRACTION } from "@/lib/invoice/mock";
import { allIssues, buildHeader, buildReviewRows, rowIssues, rowStatus, rowWarnings, summarize, type LineMatch } from "@/lib/invoice/review";
import { extractionJsonSchema, InvoiceExtractionSchema, ReviewDraftSchema, type ReviewRow } from "@/lib/invoice/schema";

const snap = (dealer: number, mrp: number) => ({ name: "Existing", skuCode: "ELEC-1001", dealer, mrp, gstPct: 18, stockQty: 4, archived: false });
const none: LineMatch = { productId: null, matchedBy: null, current: null, suggestions: [] };

describe("invoice schema", () => {
  it("accepts the demo extraction", () => {
    expect(InvoiceExtractionSchema.safeParse(DEMO_EXTRACTION).success).toBe(true);
  });

  it("produces a JSON schema for Gemini without $schema", () => {
    const schema = extractionJsonSchema();
    expect(schema.$schema).toBeUndefined();
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain("lineItems");
  });
});

describe("buildReviewRows", () => {
  const matches: LineMatch[] = [
    { productId: "p1", matchedBy: "alias", current: snap(211800, 325000), suggestions: [] }, // price up
    { productId: "p2", matchedBy: "model", current: snap(348000, 539000), suggestions: [] }, // same price
    { productId: "p3", matchedBy: "alias", current: snap(735000, 1099000), suggestions: [] },
    { ...none, suggestions: [{ id: "p4", score: 0.52, ...snap(169000, 263000) }] }, // fuzzy only
    { productId: "p5", matchedBy: "model", current: snap(28500, 49900), suggestions: [] },
    none, // new, no MRP
    none, // new, MRP printed
  ];
  const rows = buildReviewRows(DEMO_EXTRACTION, matches, { markupPct: 20, defaultGst: 18 });

  it("computes dealer price from the taxable value", () => {
    expect(rows[0]).toMatchObject({ dealer: 215600, dealerBasis: "taxable", action: "UPDATE", confirmed: true });
    expect(rowStatus(rows[0]!)).toBe("changed");
    expect(rows[0]!.mrp).toBe(325000); // no MRP on the bill → keep current
    expect(rows[0]!.mrpSource).toBe("current");
  });

  it("marks unchanged prices as same", () => {
    expect(rows[1]!.dealer).toBe(348000);
    expect(rowStatus(rows[1]!)).toBe("same");
  });

  it("uses a printed MRP", () => {
    expect(rows[2]).toMatchObject({ mrp: 1099000, mrpSource: "invoice" });
  });

  it("puts a fuzzy suggestion up for review instead of trusting it", () => {
    expect(rows[3]).toMatchObject({ action: "UPDATE", productId: "p4", matchedBy: "suggestion", confirmed: false });
    expect(rowStatus(rows[3]!)).toBe("review");
    expect(rowIssues(rows[3]!)[0]).toMatch(/Confirm/);
  });

  it("flags a taxable value that disagrees with the line maths", () => {
    expect(rows[4]!.mathMismatch).toBe(true);
    expect(rows[4]!.dealer).toBe(27500);
    expect(rowWarnings(rows[4]!).join(" ")).toMatch(/doesn't match/);
  });

  it("creates new products, suggesting an MRP from the markup when none is printed", () => {
    expect(rows[5]).toMatchObject({ action: "CREATE", mrpSource: "markup", name: "Crompton Aura Prime Anti-Dust 1200mm Fan Pearl Brown" });
    expect(rows[5]!.mrp! % 1000).toBe(0); // rounded up to ₹10
    expect(rows[6]).toMatchObject({ action: "CREATE", mrp: 629000, mrpSource: "invoice" });
    expect(rowStatus(rows[6]!)).toBe("new");
  });

  it("summarises and round-trips through the draft schema", () => {
    expect(summarize(rows)).toEqual({ same: 1, changed: 3, new: 2, review: 1, skip: 0 });
    const header = buildHeader(DEMO_EXTRACTION);
    expect(header).toMatchObject({ invoiceNumber: "SBE/25-26/4188", invoiceDate: "2026-11-08", grandTotal: 8458700 });
    expect(ReviewDraftSchema.safeParse({ header, rows }).success).toBe(true);
  });
});

describe("issues", () => {
  const base = buildReviewRows(DEMO_EXTRACTION, DEMO_EXTRACTION.lineItems.map(() => none), { markupPct: null, defaultGst: 18 });

  it("requires an MRP for new products when none is printed and no markup is set", () => {
    const row = base[5]!;
    expect(row.mrp).toBeNull();
    expect(rowIssues(row)).toContain("Enter the MRP.");
  });

  it("skipped lines never block", () => {
    expect(rowIssues({ ...base[5]!, action: "SKIP" })).toEqual([]);
  });

  it("blocks two update lines pointing at the same product", () => {
    const a: ReviewRow = { ...base[0]!, key: "a", action: "UPDATE", productId: "same", confirmed: true, current: snap(1, 2), mrp: 2 };
    const b: ReviewRow = { ...a, key: "b" };
    const issues = allIssues([a, b]);
    expect(issues.get("a")?.join(" ")).toMatch(/another line/);
    expect(issues.get("b")?.join(" ")).toMatch(/another line/);
  });
});

describe("disambiguateNewModels", () => {
  it("makes same-model colour variants unique", () => {
    const base = DEMO_EXTRACTION.lineItems[0]!;
    const line = (description: string) => ({ ...base, description, brand: "Rapidus", modelNumber: "RAPIDUS 48 1Z", barcode: null });
    const extraction = { ...DEMO_EXTRACTION, lineItems: [line("Rapidus 48 Matte Birken 1Z"), line("Rapidus 48 Knight Blue 1Z")] };
    const none: LineMatch = { productId: null, matchedBy: null, current: null, suggestions: [] };
    const rows = buildReviewRows(extraction, [none, none], { markupPct: null, defaultGst: 18 });
    expect(rows[0]!.modelNumber).toBe("RAPIDUS 48 1Z MATTE BIRKEN");
    expect(rows[1]!.modelNumber).toBe("RAPIDUS 48 1Z KNIGHT BLUE");
    expect([...allIssues(rows).values()].flat().some((m) => m.includes("same model number"))).toBe(false);
  });
});
