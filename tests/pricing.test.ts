import { describe, expect, it } from "vitest";
import {
  changePct,
  dealerFromLanding,
  landingPaise,
  marginPct,
  suggestMrp,
  unitNetFromLine,
} from "@/lib/pricing";

describe("landing and margin", () => {
  it("adds GST to the dealer price", () => {
    expect(landingPaise(100000, 18)).toBe(118000);
    expect(landingPaise(358374, 18)).toBe(422881);
    expect(dealerFromLanding(118000, 18)).toBe(100000);
  });

  it("computes margin on MRP", () => {
    expect(marginPct(80000, 100000)).toBeCloseTo(20);
    expect(marginPct(80000, 0)).toBeNull();
  });

  it("computes price change", () => {
    expect(changePct(100000, 110000)).toBeCloseTo(10);
    expect(changePct(null, 110000)).toBeNull();
  });

  it("rounds suggested MRP up to the next ₹10", () => {
    expect(suggestMrp(422881, 20)).toBe(508000); // 5074.57 → 5080
  });
});

describe("unitNetFromLine", () => {
  it("prefers the printed taxable value", () => {
    const r = unitNetFromLine({
      quantity: 4,
      rate: 450000,
      discountPct: 12,
      discountAmount: null,
      taxableValue: 1584000,
    });
    expect(r).toMatchObject({ unitNet: 396000, basis: "taxable", mathMismatch: false });
  });

  it("flags a taxable value that disagrees with rate × qty − discount", () => {
    const r = unitNetFromLine({
      quantity: 2,
      rate: 100000,
      discountPct: 10,
      discountAmount: null,
      taxableValue: 150000, // expected 180000
    });
    expect(r.mathMismatch).toBe(true);
    expect(r.unitNet).toBe(75000);
  });

  it("computes from rate and discounts when taxable is missing", () => {
    const r = unitNetFromLine({
      quantity: 3,
      rate: 100000,
      discountPct: 5,
      discountAmount: 1500,
      taxableValue: null,
    });
    expect(r).toMatchObject({ unitNet: 94500, basis: "computed" });
  });

  it("falls back to the rate alone, then to nothing", () => {
    expect(
      unitNetFromLine({ quantity: null, rate: 2500, discountPct: null, discountAmount: null, taxableValue: null }),
    ).toMatchObject({ unitNet: 2500, basis: "rate" });
    expect(
      unitNetFromLine({ quantity: null, rate: null, discountPct: null, discountAmount: null, taxableValue: null }),
    ).toMatchObject({ unitNet: null, basis: "none" });
  });
});
