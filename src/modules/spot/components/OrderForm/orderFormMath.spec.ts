import { describe, expect, it } from "vitest";

import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";

describe("quantityForPercent", () => {
  it("sizes a BUY from the quote balance", () => {
    expect(
      quantityForPercent({
        side: "BUY",
        percent: 25,
        price: "50000",
        baseFree: "0.4",
        quoteFree: "1000",
      }),
    ).toBe("0.005");
  });

  it("sizes a SELL from the base balance without a price", () => {
    expect(
      quantityForPercent({
        side: "SELL",
        percent: 25,
        price: "",
        baseFree: "0.4",
        quoteFree: "1000",
      }),
    ).toBe("0.1");
  });

  it("returns an empty quantity for a BUY with zero or invalid price", () => {
    const input = { side: "BUY" as const, percent: 25, baseFree: "0.4", quoteFree: "1000" };

    expect(quantityForPercent({ ...input, price: "0" })).toBe("");
    expect(quantityForPercent({ ...input, price: "invalid" })).toBe("");
  });

  it("clamps percentage to the 0 to 100 range", () => {
    const input = { side: "SELL" as const, price: "", baseFree: "0.4", quoteFree: "1000" };

    expect(quantityForPercent({ ...input, percent: -25 })).toBe("0");
    expect(quantityForPercent({ ...input, percent: 150 })).toBe("0.4");
  });

  it("formats calculated quantities to eight decimal places without trailing zeroes", () => {
    expect(
      quantityForPercent({
        side: "SELL",
        percent: 100,
        price: "",
        baseFree: "0.123456789",
        quoteFree: "1000",
      }),
    ).toBe("0.12345679");
  });
});

describe("calculateOrderSummary", () => {
  it("calculates the total and fee using the fee cap", () => {
    expect(calculateOrderSummary("50000", "0.01")).toEqual({ total: "500", fee: "0.5" });
  });

  it("returns empty values for invalid or non-positive input", () => {
    for (const [price, quantity] of [
      ["", "0.01"],
      ["0", "0.01"],
      ["invalid", "0.01"],
      ["50000", ""],
      ["50000", "0"],
      ["50000", "invalid"],
    ]) {
      expect(calculateOrderSummary(price, quantity)).toEqual({ total: "", fee: "" });
    }
  });

  it("formats totals and fees to eight decimal places without trailing zeroes", () => {
    expect(calculateOrderSummary("1", "0.123456789")).toEqual({ total: "0.12345679", fee: "0.00012346" });
  });
});
