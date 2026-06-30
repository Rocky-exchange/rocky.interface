import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let formatAmount: typeof import("lib/numbers").formatAmount;
let getLiquidationPrice: typeof import("lib/positions/getLiquidationPrice").default;

function parseUnits(value: string, decimals: number) {
  const [integerPart = "0", decimalPart = ""] = value.split(".");
  const normalizedDecimalPart = decimalPart.slice(0, decimals).padEnd(decimals, "0");

  return BigInt(integerPart) * 10n ** BigInt(decimals) + BigInt(normalizedDecimalPart || "0");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

beforeAll(async () => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  ({ formatAmount } = await import("lib/numbers"));
  ({ default: getLiquidationPrice } = await import("lib/positions/getLiquidationPrice"));
});

describe("getLiquidationPrice", function () {
  const cases = [
    {
      name: "New Position Long, to trigger 1% Buffer rule",
      isLong: true,
      size: parseUnits("98712.87", 30),
      collateral: parseUnits("9871.29", 30),
      averagePrice: parseUnits("23091.42", 30),
      fundingFee: parseUnits("0", 30),
      expected: "21013.1915",
    },
    {
      name: "New Position Long, to trigger $5 Buffer rule",
      isLong: true,
      size: parseUnits("162.50", 30),
      collateral: parseUnits("16.25", 30),
      averagePrice: parseUnits("23245.74", 30),
      fundingFee: parseUnits("0", 30),
      expected: "21659.6653",
    },
    {
      name: "New Position Short, to trigger 1% Buffer rule",
      isLong: false,
      size: parseUnits("99009.90", 30),
      collateral: parseUnits("9901.00", 30),
      averagePrice: parseUnits("23118.40", 30),
      fundingFee: parseUnits("0", 30),
      expected: "25199.0583",
    },
    {
      name: "Long Position with Positive PnL",
      isLong: true,
      size: parseUnits("7179585.19", 30),
      collateral: parseUnits("145919.45", 30),
      averagePrice: parseUnits("1301.50", 30),
      fundingFee: parseUnits("55354.60", 30),
      expected: "1288.0630",
    },
  ];

  for (const { name: caseName, expected, ...case_ } of cases) {
    it(`getLiquidationPrice: ${caseName}`, function () {
      const liqPrice = getLiquidationPrice(case_);
      const formattedLiquidationPrice = formatAmount(liqPrice, 30, 4);
      expect(formattedLiquidationPrice).toEqual(expected);
    });
  }
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}
