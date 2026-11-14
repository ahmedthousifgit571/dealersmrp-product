// Spreadsheet column detection, shared by the import page (browser) and tests.

export const IMPORT_FIELDS = [
  "sku",
  "barcode",
  "name",
  "brand",
  "model",
  "category",
  "hsn",
  "gst",
  "dealer",
  "dealerIncl",
  "mrp",
  "stock",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_INFO: Record<ImportField, { label: string; hint: string }> = {
  sku: { label: "SKU", hint: "The shop's product code, e.g. ELEC-1001" },
  barcode: { label: "Barcode", hint: "EAN / UPC digits" },
  name: { label: "Product name", hint: "Needed for new products" },
  brand: { label: "Brand", hint: "" },
  model: { label: "Model number", hint: "Used with brand to find existing products" },
  category: { label: "Category", hint: "" },
  hsn: { label: "HSN code", hint: "" },
  gst: { label: "GST %", hint: "e.g. 18" },
  dealer: { label: "Dealer price (ex GST)", hint: "Net rate per unit before GST" },
  dealerIncl: { label: "Dealer price (incl. GST)", hint: "Used only when there's no ex-GST column" },
  mrp: { label: "MRP", hint: "" },
  stock: { label: "Stock", hint: "Units in stock (replaces the current count)" },
};

// Header spellings seen in supplier price lists, normalised by `normalizeHeader`.
const SYNONYMS: Record<ImportField, string[]> = {
  sku: ["sku", "skucode", "itemcode", "productcode", "code", "partcode", "materialcode"],
  barcode: ["barcode", "ean", "eancode", "ean13", "upc", "gtin", "barcodeno"],
  name: ["name", "productname", "product", "item", "itemname", "description", "itemdescription", "particulars", "productdescription", "materialdescription"],
  brand: ["brand", "make", "company", "manufacturer", "brandname"],
  model: ["model", "modelno", "modelnumber", "modelcode", "partno", "partnumber", "article", "articleno"],
  category: ["category", "group", "itemgroup", "productgroup", "type", "subcategory"],
  hsn: ["hsn", "hsncode", "hsnsac", "hsnsaccode", "hsnno"],
  gst: ["gst", "gst%", "gstrate", "gstpercent", "gstpercentage", "tax", "tax%", "taxrate", "igst", "igst%", "gstrate%"],
  dealer: [
    "dealerprice",
    "dealerpriceexgst",
    "dpexgst",
    "dp",
    "d.p",
    "dealer",
    "dealerrate",
    "netrate",
    "rate",
    "basicrate",
    "basicprice",
    "cost",
    "costprice",
    "purchaseprice",
    "purchaserate",
    "nlc",
    "netlandingcostexgst",
    "dealerpriceexgst",
    "dealerprice(exgst)",
  ],
  dealerIncl: [
    "dealerpriceinclgst",
    "dpinclgst",
    "dpincgst",
    "landing",
    "landingprice",
    "landingcost",
    "landinginclgst",
    "netlandingcost",
    "nlcinclgst",
    "dealerprice(inclgst)",
    "dpwithgst",
  ],
  mrp: ["mrp", "m.r.p", "maxretailprice", "maximumretailprice", "retailprice", "sellingprice", "mrprs", "mrp(rs)"],
  stock: ["stock", "qty", "quantity", "stockqty", "closingstock", "availableqty", "onhand", "units", "unitsinstock", "stock(units)"],
};

/** "D.P. (Rs.)" → "d.p", "GST %" → "gst%", "Model No." → "modelno" */
export function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/\((?:rs|₹|inr)\.?\)|\brs\.?|₹|inr/g, "")
    .replace(/[^a-z0-9%.()]/g, "")
    .replace(/\.+$/, "")
    .replace(/\(\)/g, "");
}

const LOOKUP = new Map<string, ImportField>();
for (const field of IMPORT_FIELDS) {
  for (const s of SYNONYMS[field]) if (!LOOKUP.has(s)) LOOKUP.set(s, field);
}

export function fieldForHeader(header: unknown): ImportField | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  if (LOOKUP.has(n)) return LOOKUP.get(n)!;
  // Loose fallbacks for long headers like "Dealer Price incl. GST (Rs)".
  const plain = n.replace(/[().%]/g, "");
  if (/(incl|inc|with)gst|landing/.test(plain) && /(dealer|dp|price|cost|rate|nlc|landing)/.test(plain)) return "dealerIncl";
  if (/^mrp/.test(plain)) return "mrp";
  if (/(dealer|^dp)/.test(plain)) return "dealer";
  if (/^model/.test(plain)) return "model";
  if (/barcode|^ean/.test(plain)) return "barcode";
  if (/^hsn/.test(plain)) return "hsn";
  if (/gst|^tax/.test(plain)) return "gst";
  if (/stock|^qty/.test(plain)) return "stock";
  return null;
}

export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Maps header cells to fields; the first column wins when two headers mean the same thing. */
export function autoMap(headers: unknown[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  headers.forEach((h, i) => {
    const field = fieldForHeader(h);
    if (field && mapping[field] === undefined) mapping[field] = i;
  });
  return mapping;
}

/** The header row is the first of the top 15 rows that names an identifier and a price. */
export function detectHeaderRow(rows: unknown[][]): number {
  let best = { index: 0, score: -1 };
  rows.slice(0, 15).forEach((row, index) => {
    const m = autoMap(row);
    const hasId = m.name !== undefined || m.sku !== undefined || m.model !== undefined || m.barcode !== undefined;
    const hasPrice = m.dealer !== undefined || m.mrp !== undefined || m.dealerIncl !== undefined;
    const score = Object.keys(m).length + (hasId && hasPrice ? 10 : 0);
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

export type ImportRow = { rowNumber: number } & Partial<Record<ImportField, string | null>>;

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/** Turns sheet rows under the header into import rows (blank rows dropped). */
export function buildRows(rows: unknown[][], headerIndex: number, mapping: ColumnMapping): ImportRow[] {
  const out: ImportRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const item: ImportRow = { rowNumber: i + 1 };
    let filled = 0;
    for (const field of IMPORT_FIELDS) {
      const col = mapping[field];
      if (col === undefined) continue;
      const text = cellText(row[col]);
      item[field] = text;
      if (text !== null) filled++;
    }
    if (filled > 0) out.push(item);
  }
  return out;
}

/** Column headers used by the template and by product exports (round-trips through import). */
export const TEMPLATE_HEADERS: { field: ImportField; header: string }[] = [
  { field: "sku", header: "SKU" },
  { field: "barcode", header: "Barcode" },
  { field: "name", header: "Product name" },
  { field: "brand", header: "Brand" },
  { field: "model", header: "Model number" },
  { field: "category", header: "Category" },
  { field: "hsn", header: "HSN code" },
  { field: "gst", header: "GST %" },
  { field: "dealer", header: "Dealer price (ex GST)" },
  { field: "mrp", header: "MRP" },
  { field: "stock", header: "Stock" },
];
