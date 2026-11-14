import "server-only";
import { db } from "@/lib/db";

/** Existing brands and categories, for the product form's suggestions. */
export async function productOptions() {
  const [brands, categories] = await Promise.all([
    db.product.findMany({ where: { brand: { not: null } }, distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
    db.product.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);
  return { brands: brands.map((b) => b.brand!), categories: categories.map((c) => c.category!) };
}
