import BigNumber from "bignumber.js";
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

  it("rounds a 100% SELL down so quantity does not exceed the base balance", () => {
    const baseFree = "0.123456789";
    const quantity = quantityForPercent({
      side: "SELL",
      percent: 100,
      price: "",
      baseFree,
      quoteFree: "1000",
    });

    expect(quantity).toBe("0.12345678");
    expect(new BigNumber(quantity).lte(baseFree)).toBe(true);
  });

  it("rounds a 100% BUY down so notional does not exceed the quote balance", () => {
    const price = "3";
    const quoteFree = "2";
    const quantity = quantityForPercent({
      side: "BUY",
      percent: 100,
      price,
      baseFree: "0.4",
      quoteFree,
    });

    expect(quantity).toBe("0.66666666");
    expect(new BigNumber(quantity).times(price).lte(quoteFree)).toBe(true);
  });
});

describe("calculateOrderSummary", () => {
  it("charges a buy fee in the received base asset", () => {
    expect(calculateOrderSummary("BUY", "50000", "0.01")).toEqual({ total: "500", fee: "0.00001" });
  });

  it("charges a sell fee in the received quote asset", () => {
    expect(calculateOrderSummary("SELL", "50000", "0.01")).toEqual({ total: "500", fee: "0.5" });
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
      expect(calculateOrderSummary("BUY", price, quantity)).toEqual({ total: "", fee: "" });
    }
  });

  it("formats totals and fees to eight decimal places without trailing zeroes", () => {
    expect(calculateOrderSummary("BUY", "1", "0.123456789")).toEqual({
      total: "0.12345679",
      fee: "0.00012346",
    });
    expect(calculateOrderSummary("BUY", "1", "1.000000001")).toEqual({ total: "1", fee: "0.001" });
  });
});
