import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      ...actual.spotApi,
      markets: vi.fn(),
      ticker: vi.fn(),
    },
  };
});

import { SpotMarketDetails } from "./SpotMarketDetails";
import { spotApi, type Ticker24h } from "../../api/spotClient";
import { resolveSpotMarket } from "../../model/spotMarkets";
import { renderWithI18n as render } from "../../test/renderWithI18n";

const market = resolveSpotMarket("CBTC-CUSD");
const mMarkets = vi.mocked(spotApi.markets);
const mTicker = vi.mocked(spotApi.ticker);

const ticker: Ticker24h = {
  symbol: market.apiSymbol,
  priceChange: "-100.5",
  priceChangePercent: "-0.152",
  weightedAvgPrice: "65500",
  openPrice: "66000",
  highPrice: "66500",
  lowPrice: "65000",
  lastPrice: "65900",
  volume: "12.3456",
  quoteVolume: "810000.5",
  openTime: 0,
  closeTime: 1,
  count: 42,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotMarketDetails", () => {
  it("renders ticker and spot market metadata for the routed symbol", async () => {
    mTicker.mockResolvedValue(ticker);
    mMarkets.mockResolvedValue([
      {
        symbol: market.apiSymbol,
        base: market.apiBase,
        quote: market.apiQuote,
        max_leverage: 1,
        tick_size: "0.01",
        min_qty: "0.0001",
      },
    ]);

    const view = render(<SpotMarketDetails market={market} />);

    await view.findByText("65,900");
    expect(view.getAllByText("CBTC/CUSD")).toHaveLength(2);
    expect(view.getByText("-0.152%")).toBeTruthy();
    expect(view.getByText("66,500")).toBeTruthy();
    expect(view.getByText("65,000")).toBeTruthy();
    expect(view.getByText("0.01")).toBeTruthy();
    expect(view.getByText("0.0001 CBTC")).toBeTruthy();
    await waitFor(() => expect(mTicker).toHaveBeenCalledWith("CBTC-CUSD"));
    expect(mMarkets).toHaveBeenCalled();
  });

  it("shows a ticker request error inside the panel", async () => {
    mTicker.mockRejectedValue(new Error("ticker failed"));
    mMarkets.mockResolvedValue([]);

    const view = render(<SpotMarketDetails market={market} />);

    await view.findByText("ticker failed");
  });
});
