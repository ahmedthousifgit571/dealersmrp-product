// Money helpers shared by server and client.
// Amounts travel as integer paise (₹1 = 100 paise) so arithmetic never drifts.

export type Paise = number;

/**
 * Parses user / spreadsheet / invoice input into paise.
 * Accepts "₹1,23,456.75", "1234", "1,234.5", "Rs. 990", numbers, and Prisma Decimals.
 * Returns null for empty or unparseable input.
 */
export function parseMoney(input: unknown): Paise | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return parseMoney(input.toFixed(4));
  }
  const raw = String(input)
    .trim()
    .replace(/^(rs\.?|inr|₹)\s*/i, "")
    .replace(/[,\s₹]/g, "");
  if (raw === "" || raw === "-") return null;
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return null;
  const [, sign, intPart = "", fracPart = ""] = match;
  if (intPart === "" && fracPart === "") return null;
  const whole = Number(intPart || "0");
  const frac = (fracPart + "000").slice(0, 3);
  let paise = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) paise += 1; // round half up on the third decimal
  return sign ? -paise : paise;
}

/** Paise → fixed two-decimal string for Prisma Decimal writes ("1234.50"). */
export function toDecimalString(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Paise → rupees as a number (for charts only — never for arithmetic). */
export function toRupees(paise: Paise): number {
  return Math.round(paise) / 100;
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});
const inrFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const plainFull = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/**
 * "₹4,990" for whole rupees, "₹4,228.81" otherwise. Indian digit grouping (1,23,456).
 * `always` forces two decimals; `symbol: false` drops the ₹ sign.
 */
export function formatINR(
  paise: Paise | null | undefined,
  opts: { always?: boolean; symbol?: boolean } = {},
): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const rupees = Math.round(paise) / 100;
  if (opts.symbol === false) return plainFull.format(rupees);
  if (!opts.always && Math.round(paise) % 100 === 0) return inrWhole.format(rupees);
  return inrFull.format(rupees);
}

/** Prisma Decimal | string | number → paise (throws on bad data from the DB). */
export function decimalToPaise(value: { toString(): string } | string | number): Paise {
  const parsed = parseMoney(typeof value === "object" ? value.toString() : value);
  if (parsed === null) throw new Error(`Invalid money value: ${String(value)}`);
  return parsed;
}
