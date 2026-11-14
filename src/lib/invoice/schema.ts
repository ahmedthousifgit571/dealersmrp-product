// What the AI must return for one supplier invoice, and the shape of the admin's review.
// Shared by the server (Gemini structured output + validation) and the review screen.
import { z } from "zod";

export const InvoiceLineSchema = z.object({
  description: z.string().describe("Item description exactly as printed on the line"),
  brand: z.string().nullable().describe("Brand if printed or obvious from the description, else null"),
  modelNumber: z.string().nullable().describe("Model / part / article code if present, e.g. 'HS PLUS 48' or 'UA43DUE70'"),
  hsnCode: z.string().nullable().describe("HSN/SAC code for the line"),
  barcode: z.string().nullable().describe("EAN/UPC barcode digits if printed"),
  quantity: z.number().nullable().describe("Quantity billed"),
  unit: z.string().nullable().describe("Unit such as PCS, NOS, BOX"),
  rate: z.number().nullable().describe("Per-unit rate or list price before discount and before GST"),
  discountPct: z.number().nullable().describe("Discount percentage for the line"),
  discountAmount: z.number().nullable().describe("Total discount amount for the line in rupees"),
  taxableValue: z.number().nullable().describe("Line taxable value after discount, before GST"),
  gstRate: z.number().nullable().describe("Total GST % for the line: CGST% + SGST%, or IGST%"),
  mrp: z.number().nullable().describe("MRP per unit, only if printed for this line"),
  lineTotal: z.number().nullable().describe("Line total as printed"),
});

export const InvoiceExtractionSchema = z.object({
  supplierName: z.string().nullable().describe("Seller / supplier name (not the buyer)"),
  supplierGstin: z.string().nullable().describe("Seller's 15-character GSTIN"),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("Invoice date as YYYY-MM-DD"),
  taxableTotal: z.number().nullable().describe("Total taxable value of the invoice"),
  taxTotal: z.number().nullable().describe("Total GST amount"),
  grandTotal: z.number().nullable().describe("Invoice grand total"),
  lineItems: z.array(InvoiceLineSchema).describe("One entry per product line, in printed order"),
  warnings: z.array(z.string()).describe("Anything unreadable, cut off, ambiguous, or skipped (freight, round-off)"),
});

export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

/** JSON Schema handed to Gemini's structured output (no $schema key). */
export function extractionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(InvoiceExtractionSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

// ── Review (admin edits) ──────────────────────────────────────────

const paise = z.number().int();

export const ProductSnapshotSchema = z.object({
  name: z.string(),
  skuCode: z.string(),
  dealer: paise,
  mrp: paise,
  gstPct: z.number(),
  stockQty: z.number().int(),
  archived: z.boolean().default(false),
});
export type ProductSnapshot = z.infer<typeof ProductSnapshotSchema>;

export const SuggestionSchema = ProductSnapshotSchema.extend({ id: z.string(), score: z.number() });
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const ReviewRowSchema = z.object({
  key: z.string(),
  lineNo: z.number().int(),
  description: z.string(),
  action: z.enum(["UPDATE", "CREATE", "SKIP"]),
  productId: z.string().nullable(),
  matchedBy: z.enum(["alias", "barcode", "model", "suggestion", "manual"]).nullable(),
  confirmed: z.boolean(),
  current: ProductSnapshotSchema.nullable(),
  suggestions: z.array(SuggestionSchema).max(5),
  quantity: z.number().nullable(),
  rate: paise.nullable(),
  discountPct: z.number().nullable(),
  printedTaxable: paise.nullable(),
  expectedTaxable: paise.nullable(),
  mathMismatch: z.boolean(),
  dealer: paise.nullable(),
  dealerBasis: z.enum(["taxable", "computed", "rate", "none", "manual"]),
  gstPct: z.number().min(0).max(40),
  mrp: paise.nullable(),
  mrpSource: z.enum(["invoice", "current", "markup", "manual"]).nullable(),
  invoiceMrp: paise.nullable(),
  // Used when creating a new product.
  name: z.string().max(160),
  brand: z.string().max(60).nullable(),
  modelNumber: z.string().max(60).nullable(),
  hsnCode: z.string().max(12).nullable(),
  barcode: z.string().max(32).nullable(),
  category: z.string().max(40).nullable(),
});
export type ReviewRow = z.infer<typeof ReviewRowSchema>;

export const ReviewHeaderSchema = z.object({
  supplierName: z.string().max(120).nullable(),
  supplierGstin: z.string().max(20).nullable(),
  invoiceNumber: z.string().max(60).nullable(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  grandTotal: paise.nullable(),
  taxableTotal: paise.nullable(),
});
export type ReviewHeader = z.infer<typeof ReviewHeaderSchema>;

export const ReviewDraftSchema = z.object({
  header: ReviewHeaderSchema,
  rows: z.array(ReviewRowSchema).max(200),
});
export type ReviewDraft = z.infer<typeof ReviewDraftSchema>;
