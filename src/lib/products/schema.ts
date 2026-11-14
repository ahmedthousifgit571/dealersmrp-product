// Product form validation, shared by the browser form and the server actions.
import { z } from "zod";
import { parseMoney } from "@/lib/money";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v.replace(/\s+/g, " ")));

const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((v) => parseMoney(v) !== null, `Enter the ${label} as a number, e.g. 2499 or 2,499.50`)
    .transform((v) => parseMoney(v)!)
    .refine((v) => v > 0, `${label[0]!.toUpperCase()}${label.slice(1)} must be more than ₹0`);

export const ProductFormSchema = z
  .object({
    name: z.string().trim().min(3, "Enter the product name").max(160),
    brand: optionalText(60),
    modelNumber: optionalText(60),
    barcode: z
      .string()
      .trim()
      .max(32)
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => v === "" || /^[A-Za-z0-9]+$/.test(v), "Barcodes are letters and digits only")
      .transform((v) => (v === "" ? null : v)),
    category: optionalText(40),
    hsnCode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4,8}$/.test(v), "HSN codes are 4–8 digits")
      .transform((v) => (v === "" ? null : v)),
    gstPct: z.coerce.number<string | number>().min(0, "GST can't be negative").max(40, "GST can't exceed 40%"),
    dealerPrice: money("dealer price"),
    mrp: money("MRP"),
    stockQty: z.coerce
      .number<string | number>()
      .int("Stock is a whole number")
      .min(0, "Stock can't be negative")
      .max(1_000_000),
    allowDuplicateModel: z.boolean().default(false),
    note: optionalText(200).optional(),
  });

/** Raw form values (strings straight from inputs). */
export type ProductFormInput = z.input<typeof ProductFormSchema>;
/** Parsed values: prices in paise, blanks as null. */
export type ProductFormValues = z.output<typeof ProductFormSchema>;

export const QuickPriceSchema = z.object({
  id: z.string().min(1),
  dealerPrice: money("dealer price"),
  mrp: money("MRP"),
  note: optionalText(200).optional(),
});
export type QuickPriceInput = z.input<typeof QuickPriceSchema>;
