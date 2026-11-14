"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { IMPORT_FIELDS, type ImportRow } from "@/lib/excel/columns";
import { commitImportChunk, planImport, stripPlans, type ImportOptions, type RowOutcome } from "@/lib/excel/import";
import { getSettings } from "@/lib/settings";

const cell = z.string().max(300).nullable().optional();
const RowSchema = z.object({
  rowNumber: z.number().int().positive(),
  ...Object.fromEntries(IMPORT_FIELDS.map((f) => [f, cell])),
});
const RowsSchema = z.array(RowSchema).max(1000, "Send at most 1,000 rows at a time.");
const OptionsSchema = z.object({ createMissing: z.boolean(), updateDetails: z.boolean(), updateStock: z.boolean() });

export async function previewImport(
  rows: ImportRow[],
  options: ImportOptions,
): Promise<{ ok: true; outcomes: RowOutcome[] } | { ok: false; error: string }> {
  await requireAdmin();
  const parsedRows = RowsSchema.safeParse(rows);
  const parsedOptions = OptionsSchema.safeParse(options);
  if (!parsedRows.success || !parsedOptions.success) return { ok: false, error: "The file couldn't be read. Check the columns and try again." };
  const settings = await getSettings();
  const plans = await planImport(parsedRows.data as ImportRow[], parsedOptions.data, settings.defaultGst);
  return { ok: true, outcomes: stripPlans(plans) };
}

export async function commitImport(
  rows: ImportRow[],
  options: ImportOptions,
  fileName: string,
): Promise<
  | { ok: true; created: number; updated: number; priceChanges: number; unchanged: number; errors: number; skipped: number }
  | { ok: false; error: string }
> {
  const me = await requireAdmin();
  const parsedRows = RowsSchema.safeParse(rows);
  const parsedOptions = OptionsSchema.safeParse(options);
  if (!parsedRows.success || !parsedOptions.success) return { ok: false, error: "The file couldn't be read. Check the columns and try again." };
  const settings = await getSettings();
  try {
    const result = await commitImportChunk(parsedRows.data as ImportRow[], parsedOptions.data, {
      defaultGst: settings.defaultGst,
      changedById: me.id,
      fileName: z.string().max(120).catch("spreadsheet").parse(fileName),
    });
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/products");
    revalidatePath("/admin/history");
    return { ok: true, ...result };
  } catch (err) {
    console.error("Import failed", err);
    return { ok: false, error: "Nothing was saved from this batch. Another change may have clashed; preview again and retry." };
  }
}
