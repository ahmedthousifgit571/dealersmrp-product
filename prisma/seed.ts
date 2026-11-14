// npm run db:seed          → first admin (from SEED_ADMIN_* in .env) + demo catalogue if empty
// npm run db:seed -- --no-demo   → admin only
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSearchText, toAliasKey, toModelKey } from "../src/lib/normalize";
import { DEMO_PRODUCTS, DEMO_SUPPLIERS } from "./seed-data";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }),
});

// Deterministic pseudo-random numbers so every seed run produces the same history.
let state = 20261111;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const DAY = 86_400_000;

/** EAN-13 check digit. */
function ean13(first12: string): string {
  const sum = first12
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + String((10 - (sum % 10)) % 10);
}

const money = (rupees: number) => rupees.toFixed(2);
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Store Admin";
  if (!email || password.length < 8) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters) in .env first.");
  }
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Admin ${email} already exists (password unchanged).`);
    return existing;
  }
  const admin = await db.user.create({
    data: { name, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`✔ Created admin ${email}`);
  return admin;
}

async function seedDemo(adminId: string) {
  const count = await db.product.count();
  if (count > 0) {
    console.log(`• ${count} products already present — demo catalogue skipped.`);
    return;
  }
  const settings = await db.appSetting.upsert({ where: { id: "app" }, update: {}, create: { id: "app" } });
  const now = Date.now();
  let sku = settings.nextSkuNumber;
  let invoiceNo = 4100;

  for (const [index, p] of DEMO_PRODUCTS.entries()) {
    const skuCode = `${settings.skuPrefix}-${sku++}`;
    const barcode = p.barcode === false ? null : ean13(`20${String(1234500000 + index * 7919).slice(-10)}`);

    // Walk prices backwards from today's to build 1–3 earlier changes.
    // `at` = how many days ago that price was set; today's price was set 1–20 days ago.
    const changes = 1 + Math.floor(rand() * 3);
    let daysAgo = 1 + Math.floor(rand() * 20);
    const points: { dealer: number; mrp: number; at: number }[] = [{ dealer: p.dealer, mrp: p.mrp, at: daysAgo }];
    for (let i = 0; i < changes; i++) {
      const prev = points[points.length - 1]!;
      const dealerMove = 1 + (rand() * 0.07 + 0.015) * (rand() < 0.78 ? 1 : -1);
      const mrpChanged = rand() < 0.45;
      daysAgo += 14 + Math.floor(rand() * 40);
      points.push({
        dealer: Math.max(1, roundTo(prev.dealer / dealerMove, p.dealer > 500 ? 5 : 1)),
        mrp: mrpChanged ? Math.max(prev.dealer, roundTo(prev.mrp / (1 + rand() * 0.06), p.mrp > 1000 ? 10 : 1)) : prev.mrp,
        at: daysAgo,
      });
    }
    points.reverse(); // oldest first; the oldest is the opening price, set when the product was added
    const createdAt = new Date(now - points[0]!.at * DAY);
    const lastChangeAt = new Date(now - points[points.length - 1]!.at * DAY - Math.floor(rand() * 8) * 3_600_000);

    const product = await db.product.create({
      data: {
        skuCode,
        barcode,
        name: `${p.brand} ${p.name}`,
        brand: p.brand,
        modelNumber: p.model,
        modelKey: toModelKey(p.model),
        category: p.category,
        hsnCode: p.hsn,
        dealerPrice: money(p.dealer),
        mrp: money(p.mrp),
        gstPercentage: money(p.gst),
        stockQty: p.stock,
        searchText: buildSearchText({
          name: `${p.brand} ${p.name}`,
          brand: p.brand,
          modelNumber: p.model,
          skuCode,
          barcode,
          category: p.category,
        }),
        createdAt,
        updatedAt: lastChangeAt,
      },
    });

    const history = [
      {
        productId: product.id,
        oldDealerPrice: null,
        newDealerPrice: money(points[0]!.dealer),
        oldMrp: null,
        newMrp: money(points[0]!.mrp),
        source: "MANUAL" as const,
        note: "Opening price",
        changedById: adminId,
        changedAt: createdAt,
      },
      ...points.slice(1).map((pt, i) => {
        const prev = points[i]!;
        const source = pick(["INVOICE_OCR", "INVOICE_OCR", "EXCEL_BULK", "MANUAL"] as const);
        const supplier = source === "INVOICE_OCR" ? pick(DEMO_SUPPLIERS) : null;
        return {
          productId: product.id,
          oldDealerPrice: money(prev.dealer),
          newDealerPrice: money(pt.dealer),
          oldMrp: money(prev.mrp),
          newMrp: money(pt.mrp),
          source,
          supplierName: supplier?.name ?? null,
          invoiceNumber: supplier ? `SBE/25-26/${invoiceNo++}` : null,
          note: source === "EXCEL_BULK" ? "Supplier price list" : source === "MANUAL" ? "Price corrected at counter" : null,
          changedById: adminId,
          changedAt:
            i === points.length - 2 ? lastChangeAt : new Date(now - pt.at * DAY - Math.floor(rand() * 8) * 3_600_000),
        };
      }),
    ];
    await db.priceHistory.createMany({ data: history });

    if (p.aliases?.length) {
      await db.productAlias.createMany({
        data: p.aliases.map((alias) => ({
          aliasName: alias,
          aliasKey: toAliasKey(alias),
          supplierName: pick(DEMO_SUPPLIERS).name,
          productId: product.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  await db.appSetting.update({ where: { id: "app" }, data: { nextSkuNumber: sku } });
  console.log(`✔ Demo catalogue: ${DEMO_PRODUCTS.length} products with price history (SKUs up to ${settings.skuPrefix}-${sku - 1}).`);
}

async function main() {
  const admin = await seedAdmin();
  if (!process.argv.includes("--no-demo")) await seedDemo(admin.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
