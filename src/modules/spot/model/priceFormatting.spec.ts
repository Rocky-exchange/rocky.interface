import { describe, expect, it } from "vitest";

import { formatSpotPrice } from "./priceFormatting";

describe("formatSpotPrice", () => {
  it("preserves the configured precision carried by a decimal API value", () => {
    expect(formatSpotPrice("0.116540000000000000")).toBe("0.11654");
    expect(formatSpotPrice("-0.005820000000000000")).toBe("-0.00582");
  });

  it("keeps conventional two-decimal prices concise", () => {
    expect(formatSpotPrice("1853.640000000000000")).toBe("1,853.64");
    expect(formatSpotPrice("65260.870000000000000")).toBe("65,260.87");
  });

  it("returns a placeholder for invalid values", () => {
    expect(formatSpotPrice("not-a-price")).toBe("—");
  });
});
