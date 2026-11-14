import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decimalToPaise, formatINR, parseMoney, toDecimalString, type Paise } from "@/lib/money";
import { buildSearchText, cleanText, normalizeBarcode, toModelKey } from "@/lib/normalize";
import { dealerFromLanding, landingPaise } from "@/lib/pricing";
import type { ImportRow } from "./columns";

export type ImportOptions = { createMissing: boolean; updateDetails: boolean; updateStock: boolean };

export type RowOutcome = {
  rowNumber: number;
  status: "create" | "update" | "unchanged" | "error" | "skipped";
  name: string;
  productId?: string;
  skuCode?: string;
  match?: "sku" | "barcode" | "model";
  dealer?: { from: Paise | null; to: Paise };
  mrp?: { from: Paise | null; to: Paise };
  stock?: { from: number | null; to: number };
  details: string[]; // "Name", "Brand", ...
  messages: string[];
};

type Existing = {
  id: string;
  skuCode: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  modelNumber: string | null;
  modelKey: string | null;
  category: string | null;
  hsnCode: string | null;
  gstPercentage: Prisma.Decimal;
  dealerPrice: Prisma.Decimal;
  mrp: Prisma.Decimal;
  stockQty: number;
};

/** Everything needed to write one row, kept alongside its outcome. */
type Plan = RowOutcome & {
  write?: {
    gstPct: number;
    dealer: Paise;
    mrp: Paise;
    stock: number | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    category: string | null;
    hsnCode: string | null;
    barcode: string | null;
    sku: string | null;
  };
};

const parseNumber = (v: string | null | undefined) => {
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

async function loadCandidates(client: Prisma.TransactionClient | typeof db, rows: ImportRow[]) {
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  const modelKeys = new Set<string>();
  for (const r of rows) {
    if (r.sku) skus.add(r.sku.trim().toUpperCase());
    const b = normalizeBarcode(r.barcode);
    if (b) barcodes.add(b);
    const mk = toModelKey(r.model);
    if (mk) modelKeys.add(mk);
  }
  const or: Prisma.ProductWhereInput[] = [];
  if (skus.size) or.push({ skuCode: { in: [...skus] } });
  if (barcodes.size) or.push({ barcode: { in: [...barcodes] } });
  if (modelKeys.size) or.push({ modelKey: { in: [...modelKeys] } });
  if (!or.length) return [] as Existing[];
  return client.product.findMany({
    where: { OR: or },
    select: {
      id: true, skuCode: true, barcode: true, name: true, brand: true, modelNumber: true, modelKey: true,
      category: true, hsnCode: true, gstPercentage: true, dealerPrice: true, mrp: true, stockQty: true,
    },
  });
}

/** Works out what each row would do. Pure apart from the candidate lookup. */
export async function planImport(
  rows: ImportRow[],
  options: ImportOptions,
  defaultGst: number,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<Plan[]> {
  const candidates = await loadCandidates(client, rows);
  const bySku = new Map(candidates.map((c) => [c.skuCode.toUpperCase(), c]));
  const byBarcode = new Map(candidates.filter((c) => c.barcode).map((c) => [c.barcode!, c]));
  const byModel = new Map<string, Existing[]>();
  for (const c of candidates) if (c.modelKey) byModel.set(c.modelKey, [...(byModel.get(c.modelKey) ?? []), c]);

  const seenProducts = new Map<string, number>();
  const seenNewKeys = new Map<string, number>();

  return rows.map<Plan>((r) => {
    const messages: string[] = [];
    const name = cleanText(r.name) ?? "";
    const sku = r.sku?.trim().toUpperCase() || null;
    const barcode = normalizeBarcode(r.barcode);
    const brand = cleanText(r.brand);
    const modelNumber = cleanText(r.model);
    const modelKey = toModelKey(modelNumber);

    // ── Match ──
    let match: Existing | undefined;
    let matchedBy: RowOutcome["match"];
    if (sku && bySku.has(sku)) [match, matchedBy] = [bySku.get(sku), "sku"];
    else if (barcode && byBarcode.has(barcode)) [match, matchedBy] = [byBarcode.get(barcode), "barcode"];
    else if (modelKey && byModel.has(modelKey)) {
      const pool = byModel.get(modelKey)!;
      const sameBrand = brand ? pool.filter((p) => (p.brand ?? "").toLowerCase() === brand.toLowerCase()) : pool;
      if (sameBrand.length === 1) [match, matchedBy] = [sameBrand[0], "model"];
      else if (sameBrand.length > 1) messages.push(`${sameBrand.length} products share model ${modelNumber}. Add the SKU or barcode column to pick one.`);
    }

    // ── Parse numbers ──
    const gstParsed = parseNumber(r.gst);
    if (Number.isNaN(gstParsed)) messages.push(`GST "${r.gst}" isn't a number.`);
    const gstPct = gstParsed !== null && !Number.isNaN(gstParsed) ? gstParsed : match ? Number(match.gstPercentage) : defaultGst;
    if (gstPct < 0 || gstPct > 40) messages.push(`GST ${gstPct}% is outside 0–40%.`);

    const dealerEx = r.dealer ? parseMoney(r.dealer) : null;
    const dealerIn = r.dealerIncl ? parseMoney(r.dealerIncl) : null;
    if (r.dealer && dealerEx === null) messages.push(`Dealer price "${r.dealer}" isn't a number.`);
    if (!r.dealer && r.dealerIncl && dealerIn === null) messages.push(`Dealer price incl. GST "${r.dealerIncl}" isn't a number.`);
    const dealer = dealerEx ?? (dealerIn !== null ? dealerFromLanding(dealerIn, gstPct) : null);
    const mrp = r.mrp ? parseMoney(r.mrp) : null;
    if (r.mrp && mrp === null) messages.push(`MRP "${r.mrp}" isn't a number.`);
    const stockParsed = parseNumber(r.stock);
    if (Number.isNaN(stockParsed) || (stockParsed !== null && (stockParsed < 0 || !Number.isInteger(stockParsed)))) {
      messages.push(`Stock "${r.stock}" must be a whole number.`);
    }
    const stock = options.updateStock && stockParsed !== null && !Number.isNaN(stockParsed) ? Math.max(0, Math.round(stockParsed)) : null;
    if ((dealer !== null && dealer <= 0) || (mrp !== null && mrp <= 0)) messages.push("Prices must be more than ₹0.");

    const errorOut = (extra: string[] = []): Plan => ({
      rowNumber: r.rowNumber,
      status: "error",
      name: name || match?.name || modelNumber || sku || "(no name)",
      productId: match?.id,
      skuCode: match?.skuCode,
      match: matchedBy,
      details: [],
      messages: [...messages, ...extra],
    });
    if (messages.length > 0 && !(messages.length === 1 && messages[0]!.includes("share model"))) return errorOut();

    // ── Existing product ──
    if (match) {
      const firstRow = seenProducts.get(match.id);
      if (firstRow) return errorOut([`Same product as row ${firstRow}. Keep one of them.`]);
      seenProducts.set(match.id, r.rowNumber);

      const curDealer = decimalToPaise(match.dealerPrice);
      const curMrp = decimalToPaise(match.mrp);
      const nextDealer = dealer ?? curDealer;
      const nextMrp = mrp ?? curMrp;
      const details: string[] = [];
      const next = {
        name: match.name,
        brand: match.brand,
        modelNumber: match.modelNumber,
        category: match.category,
        hsnCode: match.hsnCode,
        gstPct: Number(match.gstPercentage),
      };
      if (options.updateDetails) {
        const category = cleanText(r.category);
        const hsn = cleanText(r.hsn);
        if (name && name !== match.name) {
          next.name = name;
          details.push("Name");
        }
        if (brand && brand !== match.brand) {
          next.brand = brand;
          details.push("Brand");
        }
        if (modelNumber && modelNumber !== match.modelNumber) {
          next.modelNumber = modelNumber;
          details.push("Model");
        }
        if (category && category !== match.category) {
          next.category = category;
          details.push("Category");
        }
        if (hsn && hsn !== match.hsnCode) {
          next.hsnCode = hsn;
          details.push("HSN");
        }
        if (gstParsed !== null && gstParsed !== Number(match.gstPercentage)) {
          next.gstPct = gstParsed;
          details.push("GST");
        }
      }
      const priceChanged = nextDealer !== curDealer || nextMrp !== curMrp;
      const stockChanged = stock !== null && stock !== match.stockQty;
      const warnings: string[] = [];
      if (nextMrp < landingPaise(nextDealer, next.gstPct)) warnings.push(`MRP ${formatINR(nextMrp)} is below landing ${formatINR(landingPaise(nextDealer, next.gstPct))}.`);
      if (messages.length) warnings.push(...messages);
      const changed = priceChanged || stockChanged || details.length > 0;
      return {
        rowNumber: r.rowNumber,
        status: changed ? "update" : "unchanged",
        name: match.name,
        productId: match.id,
        skuCode: match.skuCode,
        match: matchedBy,
        dealer: nextDealer !== curDealer ? { from: curDealer, to: nextDealer } : undefined,
        mrp: nextMrp !== curMrp ? { from: curMrp, to: nextMrp } : undefined,
        stock: stockChanged ? { from: match.stockQty, to: stock! } : undefined,
        details,
        messages: warnings,
        write: changed
          ? { ...next, dealer: nextDealer, mrp: nextMrp, stock: stockChanged ? stock : null, barcode: match.barcode, sku: match.skuCode }
          : undefined,
      };
    }

    // ── New product ──
    if (messages.length) return errorOut();
    if (!options.createMissing) {
      return { rowNumber: r.rowNumber, status: "skipped", name: name || modelNumber || "(no name)", details: [], messages: ["No matching product. Creating new products is switched off."] };
    }
    const missing = [!name && "product name", dealer === null && "dealer price", mrp === null && "MRP"].filter(Boolean);
    if (missing.length) return errorOut([`New product needs ${missing.join(", ")}.`]);
    const newKey = barcode ?? (modelKey ? `${(brand ?? "").toLowerCase()}|${modelKey}` : `name|${name.toLowerCase()}`);
    const firstNew = seenNewKeys.get(newKey);
    if (firstNew) return errorOut([`Duplicate of new product in row ${firstNew}.`]);
    seenNewKeys.set(newKey, r.rowNumber);
    const warnings = mrp! < landingPaise(dealer!, gstPct) ? [`MRP ${formatINR(mrp)} is below landing ${formatINR(landingPaise(dealer!, gstPct))}.`] : [];
    return {
      rowNumber: r.rowNumber,
      status: "create",
      name,
      skuCode: sku ?? undefined,
      dealer: { from: null, to: dealer! },
      mrp: { from: null, to: mrp! },
      stock: stockParsed !== null && !Number.isNaN(stockParsed) ? { from: null, to: Math.max(0, Math.round(stockParsed)) } : undefined,
      details: [],
      messages: warnings,
      write: {
        gstPct,
        dealer: dealer!,
        mrp: mrp!,
        stock: stockParsed !== null && !Number.isNaN(stockParsed) ? Math.max(0, Math.round(stockParsed)) : 0,
        name,
        brand,
        modelNumber,
        category: cleanText(r.category),
        hsnCode: cleanText(r.hsn),
        barcode,
        sku,
      },
    };
  });
}

export function stripPlans(plans: Plan[]): RowOutcome[] {
  return plans.map((plan) => {
    const outcome: RowOutcome & { write?: unknown } = { ...plan };
    delete outcome.write;
    return outcome;
  });
}

/** Applies one chunk inside a transaction: bulk price/stock update, per-row detail edits, creates, history. */
export async function commitImportChunk(
  rows: ImportRow[],
  options: ImportOptions,
  meta: { defaultGst: number; changedById: string; fileName: string },
) {
  return db.$transaction(
    async (tx) => {
      const plans = await planImport(rows, options, meta.defaultGst, tx);
      const updates = plans.filter((p) => p.status === "update" && p.write && p.productId);
      const creates = plans.filter((p) => p.status === "create" && p.write);
      const note = `Excel: ${meta.fileName}`.slice(0, 200);

      // 1. Prices and stock for every updated row in one statement.
      if (updates.length) {
        const values = Prisma.join(
          updates.map(
            (u) =>
              Prisma.sql`(${u.productId}, ${toDecimalString(u.write!.dealer)}::numeric, ${toDecimalString(u.write!.mrp)}::numeric, ${u.write!.stock}::int)`,
          ),
        );
        await tx.$executeRaw`
          UPDATE "Product" AS p
          SET "dealerPrice" = v.dealer, "mrp" = v.mrp, "stockQty" = COALESCE(v.stock, p."stockQty"), "updatedAt" = now()
          FROM (VALUES ${values}) AS v(id, dealer, mrp, stock)
          WHERE p.id = v.id
        `;
      }

      // 2. Detail edits (rare), one by one so searchText stays right.
      for (const u of updates.filter((x) => x.details.length > 0)) {
        const w = u.write!;
        await tx.product.update({
          where: { id: u.productId },
          data: {
            name: w.name,
            brand: w.brand,
            modelNumber: w.modelNumber,
            modelKey: toModelKey(w.modelNumber),
            category: w.category,
            hsnCode: w.hsnCode,
            gstPercentage: w.gstPct.toFixed(2),
            searchText: buildSearchText({ ...w, skuCode: u.skuCode! }),
          },
        });
      }

      // 3. New products: reserve a block of SKUs, then create them all.
      const createdIds: { id: string; plan: Plan }[] = [];
      if (creates.length) {
        const needAuto = creates.filter((c) => !c.write!.sku).length + 10;
        const s = await tx.appSetting.upsert({
          where: { id: "app" },
          create: { id: "app", nextSkuNumber: 1001 + needAuto },
          update: { nextSkuNumber: { increment: needAuto } },
        });
        const start = s.nextSkuNumber - needAuto;
        const candidatesSkus = Array.from({ length: needAuto }, (_, i) => `${s.skuPrefix}-${start + i}`);
        const requested = creates.map((c) => c.write!.sku).filter((x): x is string => !!x);
        const taken = new Set(
          (await tx.product.findMany({ where: { skuCode: { in: [...candidatesSkus, ...requested] } }, select: { skuCode: true } })).map((p) => p.skuCode),
        );
        const free = candidatesSkus.filter((c) => !taken.has(c));
        const data = creates.map((c) => {
          const w = c.write!;
          const skuCode = w.sku && !taken.has(w.sku) ? w.sku : free.shift();
          if (!skuCode) throw new Error("Ran out of free SKUs; try again.");
          taken.add(skuCode);
          c.skuCode = skuCode;
          return {
            skuCode,
            barcode: w.barcode,
            name: w.name,
            brand: w.brand,
            modelNumber: w.modelNumber,
            modelKey: toModelKey(w.modelNumber),
            category: w.category,
            hsnCode: w.hsnCode,
            gstPercentage: w.gstPct.toFixed(2),
            dealerPrice: toDecimalString(w.dealer),
            mrp: toDecimalString(w.mrp),
            stockQty: w.stock ?? 0,
            searchText: buildSearchText({ ...w, skuCode }),
          };
        });
        // Hand back the unused part of the reserved block (this transaction still holds the settings row lock).
        const usedInBlock = data
          .map((d) => d.skuCode)
          .filter((sku) => sku.startsWith(`${s.skuPrefix}-`))
          .map((sku) => Number(sku.slice(s.skuPrefix.length + 1)))
          .filter((n) => n >= start && n < start + needAuto);
        await tx.appSetting.update({
          where: { id: "app" },
          data: { nextSkuNumber: usedInBlock.length ? Math.max(...usedInBlock) + 1 : start },
        });
        const created = await tx.product.createManyAndReturn({ data, select: { id: true, skuCode: true } });
        const bySku = new Map(created.map((c) => [c.skuCode, c.id]));
        for (const c of creates) createdIds.push({ id: bySku.get(c.skuCode!)!, plan: c });
      }

      // 4. History rows for every price that moved, plus opening prices of new products.
      const history: Prisma.PriceHistoryCreateManyInput[] = [
        ...updates
          .filter((u) => u.dealer || u.mrp)
          .map((u) => ({
            productId: u.productId!,
            oldDealerPrice: toDecimalString(u.dealer?.from ?? u.write!.dealer),
            newDealerPrice: toDecimalString(u.write!.dealer),
            oldMrp: toDecimalString(u.mrp?.from ?? u.write!.mrp),
            newMrp: toDecimalString(u.write!.mrp),
            source: "EXCEL_BULK" as const,
            note,
            changedById: meta.changedById,
          })),
        ...createdIds.map(({ id, plan }) => ({
          productId: id,
          oldDealerPrice: null,
          newDealerPrice: toDecimalString(plan.write!.dealer),
          oldMrp: null,
          newMrp: toDecimalString(plan.write!.mrp),
          source: "EXCEL_BULK" as const,
          note,
          changedById: meta.changedById,
        })),
      ];
      if (history.length) await tx.priceHistory.createMany({ data: history });

      return {
        created: creates.length,
        updated: updates.length,
        priceChanges: updates.filter((u) => u.dealer || u.mrp).length,
        unchanged: plans.filter((p) => p.status === "unchanged").length,
        errors: plans.filter((p) => p.status === "error").length,
        skipped: plans.filter((p) => p.status === "skipped").length,
      };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}
