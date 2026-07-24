import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockIconCache = vi.hoisted(() => new Map<string, string>());

vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    getCachedSpotIconUrl: (symbol: string) => mockIconCache.get(symbol.toUpperCase()),
    spotApi: {
      ...actual.spotApi,
      ticker: vi.fn(),
    },
  };
});

vi.mock("./MarketDropdown", () => ({
  SpotMarketDropdown: ({
    market,
    iconUrl,
    iconLoading,
  }: {
    market: { routeSymbol: string };
    iconUrl?: string;
    iconLoading?: boolean;
  }) => (
    <div
      data-testid="market-dropdown"
      data-icon-url={iconUrl ?? ""}
      data-icon-loading={String(Boolean(iconLoading))}
    >
      {market.routeSymbol}
    </div>
  ),
}));

import { SpotSymbolBar } from "./SymbolBar";
import { spotApi, type Ticker24h } from "../../api/spotClient";
import { resolveSpotMarket } from "../../model/spotMarkets";
import { renderWithI18n as render } from "../../test/renderWithI18n";

const mTicker = vi.mocked(spotApi.ticker);
const cbtcMarket = resolveSpotMarket("CBTC-CUSD");
const cethMarket = resolveSpotMarket("CETH-CUSD");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ticker(symbol: string, lastPrice: string): Ticker24h {
  const base = symbol.split("-")[0];
  return {
    symbol,
    iconUrl: `/v1/token-icons/${base}`,
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
  mockIconCache.clear();
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

    expect(getByTestId("market-dropdown").textContent).toBe("CETH-CUSD");
    expect(getByTestId("market-dropdown").dataset.iconLoading).toBe("true");
    expect(queryAllByText("66,011.75")).toHaveLength(0);
    expect(getAllByText("—").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(mTicker.mock.calls.map(([symbol]) => symbol)).toEqual(["CBTC-CUSD", "CETH-CUSD"]);
    });

    await act(async () => {
      nextTicker.resolve(ticker(cethMarket.apiSymbol, "3501.25"));
      await nextTicker.promise;
    });
    await findAllByText("3,501.25");
  });

  it("uses a cached backend icon URL while the route ticker is pending", () => {
    const pendingTicker = deferred<Ticker24h>();
    mockIconCache.set(cethMarket.apiSymbol, "/v1/token-icons/CETH");
    mTicker.mockReturnValue(pendingTicker.promise);

    const { getByTestId } = render(<SpotSymbolBar market={cethMarket} />);

    expect(getByTestId("market-dropdown").dataset.iconUrl).toBe("/v1/token-icons/CETH");
    expect(getByTestId("market-dropdown").dataset.iconLoading).toBe("false");
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
      expect(mTicker.mock.calls.map(([symbol]) => symbol)).toEqual(["CBTC-CUSD", "CETH-CUSD"]);
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
