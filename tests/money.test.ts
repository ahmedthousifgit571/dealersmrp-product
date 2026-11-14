import { describe, expect, it } from "vitest";
import { formatINR, parseMoney, toDecimalString } from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["1234", 123400],
    ["1,23,456.75", 12345675],
    ["₹ 4,990", 499000],
    ["Rs. 990.5", 99050],
    ["INR 12.345", 1235], // half-up on the third decimal
    ["1234.565", 123457],
    [".5", 50],
    [4228.81, 422881],
    ["-15.20", -1520],
  ])("%s → %d paise", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "  ", "abc", "12.3.4", "-", null, undefined, Number.NaN])("rejects %s", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("uses Indian grouping and hides .00", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(422881)).toBe("₹4,228.81");
    expect(formatINR(499000, { always: true })).toBe("₹4,990.00");
    expect(formatINR(null)).toBe("—");
  });

  it("writes Decimal strings", () => {
    expect(toDecimalString(123450)).toBe("1234.50");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(-1520)).toBe("-15.20");
  });
});
