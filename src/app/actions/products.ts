"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import {
  createProductTx,
  findDuplicates,
  isUniqueViolation,
  setPricesTx,
  updateProductTx,
  type DuplicateHit,
} from "@/lib/products/mutations";
import {
  ProductFormSchema,
  QuickPriceSchema,
  type ProductFormInput,
  type QuickPriceInput,
} from "@/lib/products/schema";

export type ProductActionResult =
  | { ok: true; id: string; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; duplicates?: DuplicateHit[] };

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

function revalidateProducts(id?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/products/${id}`);
}

async function duplicateGuard(
  v: { barcode: string | null; brand: string | null; modelNumber: string | null; allowDuplicateModel: boolean },
  excludeId?: string,
): Promise<ProductActionResult | null> {
  const dups = await findDuplicates(v, excludeId);
  const barcodeClash = dups.find((d) => d.reason === "barcode");
  if (barcodeClash) {
    return {
      ok: false,
      error: `Barcode already belongs to ${barcodeClash.name} (${barcodeClash.skuCode}).`,
      fieldErrors: { barcode: "Already used by another product" },
      duplicates: dups,
    };
  }
  const modelClash = dups.filter((d) => d.reason === "model");
  if (modelClash.length > 0 && !v.allowDuplicateModel) {
    return {
      ok: false,
      error: "A product with this brand and model number already exists.",
      fieldErrors: { modelNumber: "Possible duplicate" },
      duplicates: modelClash,
    };
  }
  return null;
}

export async function createProduct(input: ProductFormInput): Promise<ProductActionResult> {
  const me = await requireAdmin();
  const parsed = ProductFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const v = parsed.data;
  const blocked = await duplicateGuard(v);
  if (blocked) return blocked;

  try {
    const product = await db.$transaction(
      (tx) => createProductTx(tx, v, { source: "MANUAL", changedById: me.id, note: v.note ?? "Opening price" }),
      { timeout: 20_000 },
    );
    revalidateProducts(product.id);
    return { ok: true, id: product.id, message: `${product.name} added as ${product.skuCode}.` };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "That barcode or SKU was just taken by another product." };
    throw err;
  }
}

export async function updateProduct(id: string, input: ProductFormInput): Promise<ProductActionResult> {
  const me = await requireAdmin();
  const parsed = ProductFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const v = parsed.data;
  const blocked = await duplicateGuard(v, id);
  if (blocked) return blocked;

  try {
    const { priceChanged } = await db.$transaction((tx) => updateProductTx(tx, id, v, me.id), { timeout: 20_000 });
    revalidateProducts(id);
    return { ok: true, id, message: priceChanged ? "Saved. The price change is in the history." : "Saved." };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "That barcode is already used by another product." };
    throw err;
  }
}

export async function quickUpdatePrice(input: QuickPriceInput): Promise<ProductActionResult> {
  const me = await requireAdmin();
  const parsed = QuickPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the prices.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const { id, dealerPrice, mrp, note } = parsed.data;
  const { priceChanged } = await db.$transaction(
    (tx) => setPricesTx(tx, id, { dealerPrice, mrp }, { source: "MANUAL", changedById: me.id, note: note ?? null }),
    { timeout: 20_000 },
  );
  revalidateProducts(id);
  return { ok: true, id, message: priceChanged ? "Price updated." : "No change. The prices were already the same." };
}

export async function setArchived(id: string, archived: boolean): Promise<ProductActionResult> {
  await requireAdmin();
  const p = await db.product.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    select: { name: true },
  });
  revalidateProducts(id);
  return {
    ok: true,
    id,
    message: archived ? `${p.name} archived. It no longer shows in search.` : `${p.name} is back in search.`,
  };
}

export async function deleteProduct(id: string): Promise<ProductActionResult> {
  await requireAdmin();
  const p = await db.product.delete({ where: { id }, select: { name: true } });
  revalidateProducts();
  return { ok: true, id, message: `${p.name} and its price history were deleted.` };
}

export async function removeAlias(aliasId: string): Promise<ProductActionResult> {
  await requireAdmin();
  const alias = await db.productAlias.delete({ where: { id: aliasId }, select: { productId: true } });
  revalidatePath(`/products/${alias.productId}`);
  return { ok: true, id: alias.productId, message: "Supplier name removed." };
}
