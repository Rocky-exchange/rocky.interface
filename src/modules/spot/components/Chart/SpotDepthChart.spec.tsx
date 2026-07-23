import { describe, expect, it } from "vitest";

import { buildSpotDepthPoints } from "./SpotDepthChart";

describe("buildSpotDepthPoints", () => {
  it("sorts both sides and builds cumulative size and quote cost", () => {
    const result = buildSpotDepthPoints({
      lastUpdateId: 1,
      bids: [
        ["99", "2"],
        ["100", "1"],
      ],
      asks: [
        ["102", "2.5"],
        ["101", "1.5"],
      ],
    });

    expect(result.midPrice).toBe(100.5);
    expect(result.points).toEqual([
      { price: 99, bid: 3, side: "bid", totalCost: 298 },
      { price: 100, bid: 1, side: "bid", totalCost: 100 },
      { price: 100.5, bid: 0, ask: 0, side: "mid", totalCost: 0 },
      { price: 101, ask: 1.5, side: "ask", totalCost: 151.5 },
      { price: 102, ask: 4, side: "ask", totalCost: 406.5 },
    ]);
    expect(result.priceRange).toEqual([99, 102]);
  });

  it("drops invalid and non-positive levels", () => {
    const result = buildSpotDepthPoints({
      lastUpdateId: 1,
      bids: [
        ["100", "0"],
        ["bad", "1"],
      ],
      asks: [["101", "-1"]],
    });

    expect(result).toEqual({ points: [], midPrice: 0, priceRange: [0, 0] });
  });
});
