// Pure review logic shared by the review screen and the commit step.
import { formatINR, parseMoney, type Paise } from "@/lib/money";
import { cleanText, toAliasKey, toModelKey } from "@/lib/normalize";
import { changePct, landingPaise, suggestMrp, unitNetFromLine } from "@/lib/pricing";
import type { InvoiceExtraction, ProductSnapshot, ReviewHeader, ReviewRow, Suggestion } from "./schema";

export type RowStatus = "same" | "changed" | "new" | "review" | "skip";

export type LineMatch = {
  productId: string | null;
  matchedBy: "alias" | "barcode" | "model" | null;
  current: ProductSnapshot | null;
  suggestions: Suggestion[];
};

export function rowStatus(row: ReviewRow): RowStatus {
  if (row.action === "SKIP") return "skip";
  if (row.action === "CREATE") return "new";
  if (!row.productId || !row.confirmed) return "review";
  if (row.current && (row.dealer !== row.current.dealer || row.mrp !== row.current.mrp)) return "changed";
  return "same";
}

/** Problems that block confirming the invoice. */
export function rowIssues(row: ReviewRow): string[] {
  if (row.action === "SKIP") return [];
  const issues: string[] = [];
  if (row.action === "UPDATE") {
    if (!row.productId) issues.push("Pick the matching product, or add it as new.");
    else if (!row.confirmed) issues.push("Confirm the suggested product, or pick another.");
  }
  if (row.action === "CREATE" && (cleanText(row.name)?.length ?? 0) < 3) issues.push("Enter a name for the new product.");
  if (row.dealer === null || row.dealer <= 0) issues.push("Enter the dealer price.");
  if (row.mrp === null || row.mrp <= 0) issues.push("Enter the MRP.");
  return issues;
}

/** Things worth a second look that don't block saving. */
export function rowWarnings(row: ReviewRow): string[] {
  if (row.action === "SKIP") return [];
  const warnings: string[] = [];
  if (row.mathMismatch) warnings.push("The printed taxable value doesn't match rate × qty − discount. Check the dealer price.");
  if (row.dealer !== null && row.mrp !== null) {
    const landing = landingPaise(row.dealer, row.gstPct);
    if (row.mrp < landing) {
      warnings.push(`MRP ${formatINR(row.mrp)} is below the landing cost ${formatINR(landing)} (dealer + ${row.gstPct}% GST), so this sells at a loss.`);
    }
  }
  if (row.action === "UPDATE" && row.current && row.dealer !== null) {
    const pct = changePct(row.current.dealer, row.dealer);
    if (pct !== null && Math.abs(pct) >= 25) warnings.push(`Dealer price moves ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}%. Is that right?`);
  }
  if (row.action === "UPDATE" && row.current?.archived) warnings.push("This product is archived; it stays hidden from search.");
  return warnings;
}

/** Update rows that point at the same product more than once (only the last would win). */
export function duplicateTargets(rows: ReviewRow[]): Map<string, string[]> {
  const byProduct = new Map<string, string[]>();
  for (const r of rows) {
    if (r.action !== "UPDATE" || !r.productId) continue;
    byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r.key]);
  }
  return new Map([...byProduct].filter(([, keys]) => keys.length > 1));
}

/** New-product rows that would collide on brand + model number (the commit rejects the second one). */
export function duplicateNewModels(rows: ReviewRow[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    if (r.action !== "CREATE") continue;
    const model = toModelKey(r.modelNumber);
    if (!model) continue;
    const id = `${(r.brand ?? "").toLowerCase()}|${model}`;
    groups.set(id, [...(groups.get(id) ?? []), r.key]);
  }
  const out = new Set<string>();
  for (const keys of groups.values()) if (keys.length > 1) keys.forEach((k) => out.add(k));
  return out;
}

export function allIssues(rows: ReviewRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const dups = duplicateTargets(rows);
  const dupKeys = new Map<string, number>();
  for (const keys of dups.values()) keys.forEach((k) => dupKeys.set(k, keys.length));
  const dupModels = duplicateNewModels(rows);
  for (const r of rows) {
    const issues = rowIssues(r);
    if (dupModels.has(r.key)) issues.push("Another new product on this bill has the same model number. Make the model numbers different (add the colour/variant), or match this line to an existing product.");
    if (dupKeys.has(r.key)) issues.push("The same product is on another line too. Skip one, or point it at a different product.");
    if (issues.length) out.set(r.key, issues);
  }
  return out;
}

export function summarize(rows: ReviewRow[]) {
  const c = { same: 0, changed: 0, new: 0, review: 0, skip: 0 };
  for (const r of rows) c[rowStatus(r)]++;
  return c;
}

const toPaise = (n: number | null | undefined): Paise | null => (n === null || n === undefined ? null : parseMoney(n));

function newProductName(description: string, brand: string | null): string {
  const d = cleanText(description) ?? "";
  if (!brand || d.toLowerCase().includes(brand.toLowerCase())) return d;
  return `${brand} ${d}`;
}

/** Turns AI output + database matches into editable review rows. */
export function buildReviewRows(
  extraction: InvoiceExtraction,
  matches: LineMatch[],
  opts: { markupPct: number | null; defaultGst: number },
): ReviewRow[] {
  return disambiguateNewModels(buildRows(extraction, matches, opts));
}

const words = (s: string) => s.split(/[^A-Za-z0-9]+/).filter(Boolean);

/**
 * New products that share brand + model number (e.g. the same fan in two colours) would collide
 * on commit. The AI is asked to keep them unique but sometimes doesn't, so append the words that
 * make each description different ("Matte Birken" vs "Knight Blue") to its model number.
 * Rows it can't tell apart are left alone: the review screen flags them for a manual edit.
 */
export function disambiguateNewModels(rows: ReviewRow[]): ReviewRow[] {
  const groups = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    const model = r.action === "CREATE" ? toModelKey(r.modelNumber) : null;
    if (!model) continue;
    const id = `${(r.brand ?? "").toLowerCase()}|${model}`;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const tokens = group.map((r) => words(r.description));
    const lower = tokens.map((t) => new Set(t.map((w) => w.toLowerCase())));
    group.forEach((r, i) => {
      const inModel = new Set(words(r.modelNumber ?? "").map((w) => w.toLowerCase()));
      // Words in this description that at least one other line in the group lacks.
      const distinct = tokens[i]!.filter((w) => !inModel.has(w.toLowerCase()) && lower.some((other, j) => j !== i && !other.has(w.toLowerCase())));
      if (distinct.length === 0) return;
      r.modelNumber = `${r.modelNumber} ${distinct.slice(0, 4).join(" ")}`.toUpperCase().slice(0, 60).trim();
    });
  }
  return rows;
}

function buildRows(
  extraction: InvoiceExtraction,
  matches: LineMatch[],
  opts: { markupPct: number | null; defaultGst: number },
): ReviewRow[] {
  return extraction.lineItems.map((line, i) => {
    const m = matches[i] ?? { productId: null, matchedBy: null, current: null, suggestions: [] };
    const rate = toPaise(line.rate);
    const printedTaxable = toPaise(line.taxableValue);
    const net = unitNetFromLine({
      quantity: line.quantity,
      rate,
      discountPct: line.discountPct,
      discountAmount: toPaise(line.discountAmount),
      taxableValue: printedTaxable,
    });

    const top = m.productId ? null : m.suggestions[0] ?? null;
    const productId = m.productId ?? top?.id ?? null;
    const current = m.current ?? (top ? { ...top } : null);
    const action: ReviewRow["action"] = productId ? "UPDATE" : "CREATE";
    const gstPct = line.gstRate ?? current?.gstPct ?? opts.defaultGst;
    const invoiceMrp = toPaise(line.mrp);

    let mrp: Paise | null = invoiceMrp;
    let mrpSource: ReviewRow["mrpSource"] = invoiceMrp !== null ? "invoice" : null;
    if (mrp === null && action === "UPDATE" && current) {
      mrp = current.mrp;
      mrpSource = "current";
    } else if (mrp === null && action === "CREATE" && opts.markupPct !== null && net.unitNet !== null) {
      mrp = suggestMrp(landingPaise(net.unitNet, gstPct), opts.markupPct);
      mrpSource = "markup";
    }

    return {
      key: `l${i + 1}`,
      lineNo: i + 1,
      description: line.description,
      action,
      productId,
      matchedBy: m.productId ? m.matchedBy : top ? "suggestion" : null,
      confirmed: !!m.productId,
      current: current
        ? { name: current.name, skuCode: current.skuCode, dealer: current.dealer, mrp: current.mrp, gstPct: current.gstPct, stockQty: current.stockQty, archived: current.archived ?? false }
        : null,
      suggestions: m.suggestions.slice(0, 3),
      quantity: line.quantity,
      rate,
      discountPct: line.discountPct,
      printedTaxable,
      expectedTaxable: net.expectedTaxable,
      mathMismatch: net.mathMismatch,
      dealer: net.unitNet,
      dealerBasis: net.basis,
      gstPct,
      mrp,
      mrpSource,
      invoiceMrp,
      name: newProductName(line.description, cleanText(line.brand)),
      brand: cleanText(line.brand),
      modelNumber: cleanText(line.modelNumber),
      hsnCode: cleanText(line.hsnCode)?.replace(/\D/g, "") || null,
      barcode: cleanText(line.barcode)?.replace(/[\s-]/g, "") || null,
      category: null,
    };
  });
}

/** Accepts YYYY-MM-DD, or day-first dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy (Indian bills). Returns YYYY-MM-DD or null. */
export function normalizeInvoiceDate(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function buildHeader(extraction: InvoiceExtraction): ReviewHeader {
  const date = normalizeInvoiceDate(extraction.invoiceDate);
  return {
    supplierName: cleanText(extraction.supplierName),
    supplierGstin: cleanText(extraction.supplierGstin)?.toUpperCase().replace(/\s/g, "") ?? null,
    invoiceNumber: cleanText(extraction.invoiceNumber),
    invoiceDate: date,
    grandTotal: toPaise(extraction.grandTotal),
    taxableTotal: toPaise(extraction.taxableTotal),
  };
}

export const aliasKeyFor = (row: Pick<ReviewRow, "description">) => toAliasKey(row.description);
