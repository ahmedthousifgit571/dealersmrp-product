// Text normalisation used for duplicate detection, alias matching and search.

/** "WH-STROM 2/18" → "WHSTROM218". Null when nothing usable is left. */
export function toModelKey(model: string | null | undefined): string | null {
  if (!model) return null;
  const key = model.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key.length > 0 ? key : null;
}

/** Folds inch notations: 18", 18'', 18 inch, 18 inches, 18in → 18in */
function foldInches(text: string): string {
  return text
    .replace(/(\d)\s*(?:"|''|”|″)/g, "$1in ")
    .replace(/(\d)\s*(?:inches|inch|in)\b/gi, "$1in");
}

/**
 * Supplier description → stable key, e.g. `WH STROM2 18" Black` and `wh strom2 18 inch BLACK`
 * both become "wh strom2 18in black".
 */
export function toAliasKey(text: string): string {
  return foldInches(text.normalize("NFKC"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Barcodes are compared without spaces or dashes. */
export function normalizeBarcode(code: string | null | undefined): string | null {
  if (!code) return null;
  const cleaned = code.trim().replace(/[\s-]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** Collapses whitespace in display names. */
export function cleanText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Everything a person might type to find a product, lower-cased for trigram search. */
export function buildSearchText(p: {
  name: string;
  brand?: string | null;
  modelNumber?: string | null;
  skuCode: string;
  barcode?: string | null;
  category?: string | null;
}): string {
  const modelKey = toModelKey(p.modelNumber);
  return [p.name, p.brand, p.modelNumber, modelKey, p.skuCode, p.barcode, p.category]
    .filter(Boolean)
    .map((part) => foldInches(String(part)).toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
