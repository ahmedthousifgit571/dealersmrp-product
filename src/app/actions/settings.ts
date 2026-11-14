"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import type { ActionResult } from "./users";

const SettingsSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the shop's name").max(60),
  staffCanSeeDealerPrice: z.boolean(),
  skuPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Use 2–8 letters or digits, e.g. ELEC"),
  defaultGst: z.number().min(0).max(40),
  mrpMarkupPct: z.number().min(0).max(300).nullable(),
  addInvoiceQtyToStock: z.boolean(),
  purgeInvoiceFilesAfterDays: z.number().int().min(7).max(3650),
});

export type SettingsInput = z.input<typeof SettingsSchema>;

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  await db.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", ...d, defaultGst: d.defaultGst.toFixed(2), mrpMarkupPct: d.mrpMarkupPct?.toFixed(2) ?? null },
    update: { ...d, defaultGst: d.defaultGst.toFixed(2), mrpMarkupPct: d.mrpMarkupPct?.toFixed(2) ?? null },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
