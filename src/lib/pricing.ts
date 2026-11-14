// Price arithmetic. Dealer Price is the net per-unit rate EXCLUDING GST;
// "landing" is what a unit really costs once GST is added.
import type { Paise } from "./money";

/** Dealer price + GST → landing cost per unit. */
export function landingPaise(dealerPaise: Paise, gstPct: number): Paise {
  return Math.round(dealerPaise * (1 + gstPct / 100));
}

/** Landing cost → dealer price excluding GST (inverse of landingPaise). */
export function dealerFromLanding(landing: Paise, gstPct: number): Paise {
  return Math.round(landing / (1 + gstPct / 100));
}

/** Margin earned at MRP, as a % of MRP. Null when MRP is zero. */
export function marginPct(landing: Paise, mrp: Paise): number | null {
  if (!mrp) return null;
  return ((mrp - landing) / mrp) * 100;
}

/** Percentage change from old to new. Null when there is no old value. */
export function changePct(oldValue: Paise | null | undefined, newValue: Paise): number | null {
  if (oldValue === null || oldValue === undefined || oldValue === 0) return null;
  return ((newValue - oldValue) / oldValue) * 100;
}

/** Suggested MRP: landing × (1 + markup%), rounded up to the next ₹10. */
export function suggestMrp(landing: Paise, markupPct: number): Paise {
  const raw = landing * (1 + markupPct / 100);
  return Math.ceil(raw / 1000) * 1000;
}

export type InvoiceLineAmounts = {
  quantity: number | null;
  rate: Paise | null; // list price / unit rate as printed
  discountPct: number | null;
  discountAmount: Paise | null; // total discount for the line
  taxableValue: Paise | null; // line taxable value after discount, before GST
};

export type UnitNetResult = {
  unitNet: Paise | null;
  basis: "taxable" | "computed" | "rate" | "none";
  /** True when rate × qty − discounts disagrees with the printed taxable value by more than ₹1. */
  mathMismatch: boolean;
  expectedTaxable: Paise | null;
};

/**
 * Works out the dealer price (net per unit, excl. GST) of one invoice line.
 * The AI only copies printed numbers; all arithmetic happens here.
 */
export function unitNetFromLine(line: InvoiceLineAmounts): UnitNetResult {
  const qty = line.quantity && line.quantity > 0 ? line.quantity : null;

  let expectedTaxable: Paise | null = null;
  if (qty !== null && line.rate !== null) {
    let gross = line.rate * qty;
    if (line.discountPct) gross = gross * (1 - line.discountPct / 100);
    if (line.discountAmount) gross = gross - line.discountAmount;
    expectedTaxable = Math.round(gross);
  }

  if (qty !== null && line.taxableValue !== null) {
    const mismatch =
      expectedTaxable !== null && Math.abs(expectedTaxable - line.taxableValue) > 100;
    return {
      unitNet: Math.round(line.taxableValue / qty),
      basis: "taxable",
      mathMismatch: mismatch,
      expectedTaxable,
    };
  }
  if (qty !== null && expectedTaxable !== null) {
    return {
      unitNet: Math.round(expectedTaxable / qty),
      basis: "computed",
      mathMismatch: false,
      expectedTaxable,
    };
  }
  if (line.rate !== null) {
    return { unitNet: line.rate, basis: "rate", mathMismatch: false, expectedTaxable };
  }
  return { unitNet: null, basis: "none", mathMismatch: false, expectedTaxable };
}
