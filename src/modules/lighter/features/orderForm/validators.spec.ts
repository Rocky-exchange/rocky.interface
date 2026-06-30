// src/modules/lighter/features/orderForm/validators.spec.ts
import { describe, it, expect } from "vitest";
import { validateSize, validatePrice, validateLeverage, validateAll } from "./validators";

describe("validateSize", () => {
  it("rejects empty string", () => expect(validateSize("")).toBe("SIZE_EMPTY"));
  it("rejects whitespace", () => expect(validateSize("  ")).toBe("SIZE_EMPTY"));
  it("rejects zero", () => expect(validateSize("0")).toBe("SIZE_TOO_SMALL"));
  it("rejects negative", () => expect(validateSize("-1")).toBe("SIZE_TOO_SMALL"));
  it("rejects huge", () => expect(validateSize("1e10")).toBe("SIZE_TOO_LARGE"));
  it("accepts valid", () => expect(validateSize("0.01")).toBeNull());
});

describe("validatePrice", () => {
  it("ignored for Market mode", () => expect(validatePrice("", "Market")).toBeNull());
  it("rejects empty for Limit", () => expect(validatePrice("", "Limit")).toBe("PRICE_EMPTY"));
  it("rejects negative for Limit", () => expect(validatePrice("-5", "Limit")).toBe("PRICE_NEGATIVE"));
  it("accepts valid Limit", () => expect(validatePrice("100", "Limit")).toBeNull());
});

describe("validateLeverage", () => {
  it("accepts 1..max", () => expect(validateLeverage(50, 50)).toBeNull());
  it("rejects 0", () => expect(validateLeverage(0, 50)).toBe("LEVERAGE_OUT_OF_RANGE"));
  it("rejects > max", () => expect(validateLeverage(51, 50)).toBe("LEVERAGE_OUT_OF_RANGE"));
  it("rejects non-integer", () => expect(validateLeverage(10.5, 50)).toBe("LEVERAGE_OUT_OF_RANGE"));
});

describe("validateAll", () => {
  it("aggregates errors", () => {
    const errs = validateAll(
      {
        mode: "Limit",
        side: "buy",
        leverageValue: 0,
        marginTab: "Cross",
        size: "",
        sizeUnit: "BASE",
        price: "",
        tp: "",
        sl: "",
      },
      50
    );
    expect(errs).toContain("SIZE_EMPTY");
    expect(errs).toContain("PRICE_EMPTY");
    expect(errs).toContain("LEVERAGE_OUT_OF_RANGE");
  });
});
