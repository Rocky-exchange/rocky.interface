import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      ...actual.spotApi,
      ticker: vi.fn(),
    },
  };
});

vi.mock("./MarketDropdown", () => ({
  SpotMarketDropdown: ({ market }: { market: { routeSymbol: string } }) => (
    <div data-testid="market-dropdown">{market.routeSymbol}</div>
  ),
}));

import { SpotSymbolBar } from "./SymbolBar";
import { spotApi, type Ticker24h } from "../../api/spotClient";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mTicker = vi.mocked(spotApi.ticker);
const cbtcMarket = resolveSpotMarket("CBTC-USDA");
const cethMarket = resolveSpotMarket("CETH-USDA");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ticker(symbol: string, lastPrice: string): Ticker24h {
  return {
    symbol,
    priceChange: "10.25",
    priceChangePercent: "1.250",
    weightedAvgPrice: lastPrice,
    openPrice: lastPrice,
    highPrice: lastPrice,
    lowPrice: lastPrice,
    lastPrice,
    volume: "2.5",
    quoteVolume: "1000",
    openTime: 0,
    closeTime: 1,
    count: 1,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotSymbolBar", () => {
  it("clears the previous ticker while the next market ticker is pending", async () => {
    const nextTicker = deferred<Ticker24h>();
    mTicker.mockImplementation((symbol) =>
      symbol === cethMarket.apiSymbol
        ? nextTicker.promise
        : Promise.resolve(ticker(cbtcMarket.apiSymbol, "66011.75"))
    );

    const { findAllByText, getAllByText, getByTestId, queryAllByText, rerender } = render(
      <SpotSymbolBar market={cbtcMarket} />
    );
    await findAllByText("66,011.75");

    rerender(<SpotSymbolBar market={cethMarket} />);

    expect(getByTestId("market-dropdown").textContent).toBe("CETH-USDA");
    expect(queryAllByText("66,011.75")).toHaveLength(0);
    expect(getAllByText("—").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(mTicker.mock.calls.map(([symbol]) => symbol)).toEqual(["CBTC-USDA", "CETH-USDA"]);
    });

    await act(async () => {
      nextTicker.resolve(ticker(cethMarket.apiSymbol, "3501.25"));
      await nextTicker.promise;
    });
    await findAllByText("3,501.25");
  });

  it("ignores a previous market response that settles after the market changed", async () => {
    const previousTicker = deferred<Ticker24h>();
    const nextTicker = deferred<Ticker24h>();
    mTicker.mockImplementation((symbol) =>
      symbol === cbtcMarket.apiSymbol ? previousTicker.promise : nextTicker.promise
    );

    const { findAllByText, getAllByText, queryAllByText, rerender } = render(
      <SpotSymbolBar market={cbtcMarket} />
    );
    rerender(<SpotSymbolBar market={cethMarket} />);
    await waitFor(() => {
      expect(mTicker.mock.calls.map(([symbol]) => symbol)).toEqual(["CBTC-USDA", "CETH-USDA"]);
    });

    await act(async () => {
      previousTicker.resolve(ticker(cbtcMarket.apiSymbol, "66011.75"));
      await previousTicker.promise;
    });

    expect(queryAllByText("66,011.75")).toHaveLength(0);
    expect(getAllByText("—").length).toBeGreaterThan(0);

    await act(async () => {
      nextTicker.resolve(ticker(cethMarket.apiSymbol, "3501.25"));
      await nextTicker.promise;
    });
    await findAllByText("3,501.25");
  });
});
