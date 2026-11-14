import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";

export type AppSettings = {
  businessName: string;
  staffCanSeeDealerPrice: boolean;
  skuPrefix: string;
  nextSkuNumber: number;
  defaultGst: number;
  mrpMarkupPct: number | null;
  addInvoiceQtyToStock: boolean;
  purgeInvoiceFilesAfterDays: number;
  updatedAt: Date;
};

/** The single settings row, created with defaults on first read. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  await connection(); // request-time only: never touch the database while prerendering
  // Plain read on the hot path; the row is only written the very first time.
  const row =
    (await db.appSetting.findUnique({ where: { id: "app" } })) ??
    (await db.appSetting.upsert({ where: { id: "app" }, update: {}, create: { id: "app" } }));
  return {
    businessName: row.businessName,
    staffCanSeeDealerPrice: row.staffCanSeeDealerPrice,
    skuPrefix: row.skuPrefix,
    nextSkuNumber: row.nextSkuNumber,
    defaultGst: Number(row.defaultGst),
    mrpMarkupPct: row.mrpMarkupPct === null ? null : Number(row.mrpMarkupPct),
    addInvoiceQtyToStock: row.addInvoiceQtyToStock,
    purgeInvoiceFilesAfterDays: row.purgeInvoiceFilesAfterDays,
    updatedAt: row.updatedAt,
  };
});
