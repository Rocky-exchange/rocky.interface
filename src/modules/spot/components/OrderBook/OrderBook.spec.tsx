// Component-layer specs for SpotOrderBookPanel — renders levels, spread,
// cumulative totals, and filters the already-fetched book by side.
import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/macro";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      depth: vi.fn(),
      trades: vi.fn(),
      markets: vi.fn(),
    },
  };
});

import { SpotOrderBookPanel } from "./OrderBook";
import { spotApi, type DepthResp } from "../../api/spotClient";
import { resolveSpotMarket, type SpotMarket } from "../../model/spotMarkets";
import { renderWithI18n as render } from "../../test/renderWithI18n";

const mDepth = vi.mocked(spotApi.depth);
const mTrades = vi.mocked(spotApi.trades);
const mMarkets = vi.mocked(
  (
    spotApi as typeof spotApi & {
      markets: () => Promise<Array<{ symbol: string; tick_size: string }>>;
    }
  ).markets,
);
const market = resolveSpotMarket("CBTC-USDA");
const ethMarket = resolveSpotMarket("CETH-USDA");
const pepeMarket: SpotMarket = {
  routeSymbol: "PEPE-USDA",
  apiSymbol: "PEPE-USDA",
  displayBase: "PEPE",
  displayQuote: "USDA",
  apiBase: "PEPE",
  apiQuote: "USDA",
  chartSymbol: "PEPE-USDA",
  chartSource: "native",
};

const twoSidedDepth = {
  lastUpdateId: 1,
  asks: [
    ["65010.00", "0.001"],
    ["65020.00", "0.002"],
    ["65030.00", "0.003"],
  ] as [string, string][],
  bids: [
    ["64990.00", "0.004"],
    ["64980.00", "0.005"],
    ["64970.00", "0.006"],
  ] as [string, string][],
};

beforeEach(() => {
  mMarkets.mockResolvedValue([
    { symbol: market.apiSymbol, tick_size: "0.01" },
    { symbol: ethMarket.apiSymbol, tick_size: "0.01" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotOrderBookPanel", () => {
  it("renders the order book navigation in the active language", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const orderBookMessage = msg`Order Book`;
    const zhI18n = setupI18n({
      locale: "zh",
      messages: { zh: { [orderBookMessage.id]: "訂單簿" } },
    });
    const { findByText, getByRole } = render(
      <I18nProvider i18n={zhI18n}>
        <SpotOrderBookPanel market={market} />
      </I18nProvider>,
    );

    await findByText("65,010.00");
    expect(getByRole("tab", { name: "訂單簿" })).toBeTruthy();
  });

  it("shows 'No resting orders' when the book comes back empty", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [], bids: [] });
    const { findByText } = render(<SpotOrderBookPanel market={market} />);
    await findByText("No resting orders");
  });

  it("requests the API symbol and renders market-aware ZTDX labels", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, getByText } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    await waitFor(() => expect(mDepth).toHaveBeenCalledWith("CBTC-USDA", 20));
    expect(getByRole("tablist")).toBeTruthy();
    expect(getByRole("tab", { name: "Order Book" }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: "Recent Trades" }).getAttribute("aria-selected")).toBe("false");
    expect(getByRole("button", { name: "Show full order book" })).toBeTruthy();
    expect(getByRole("button", { name: "Show asks only" })).toBeTruthy();
    expect(getByRole("button", { name: "Show bids only" })).toBeTruthy();
    expect(getByText("Price (USDA)")).toBeTruthy();
    expect(getByText("Amount (CBTC)")).toBeTruthy();
    expect(getByText("Total (USDA)")).toBeTruthy();
    expect(mTrades).not.toHaveBeenCalled();
  });

  it("uses the futures toolbar rhythm with quote and aggregation controls", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, getByTestId } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    expect(getByTestId("spot-orderbook-toolbar").textContent).toContain("USDA");
    expect(getByRole("button", { name: "Order book price level" }).textContent).toContain("0.01");
  });

  it("uses the current low-priced spot market tick as the default price level", async () => {
    mMarkets.mockResolvedValue([{ symbol: pepeMarket.apiSymbol, tick_size: "0.00000001" }]);
    mDepth.mockResolvedValue({
      lastUpdateId: 1,
      asks: [["0.00000289", "1000000"]],
      bids: [["0.00000288", "1000000"]],
    });
    const { getByRole } = render(<SpotOrderBookPanel market={pepeMarket} />);

    await waitFor(() => expect(document.body.textContent).toContain("0.00000289"));
    await waitFor(() => expect(document.body.textContent).toContain("0.00000288"));
    await waitFor(() =>
      expect(getByRole("button", { name: "Order book price level" }).textContent).toContain("0.00000001"),
    );
  });

  it("groups displayed price levels from the order book level menu", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, queryByText } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    fireEvent.click(getByRole("button", { name: "Order book price level" }));
    fireEvent.click(getByRole("menuitemradio", { name: "100" }));

    await findByText("65,100.00");
    expect(queryByText("65,010.00")).toBeNull();
    expect(getByRole("button", { name: "Order book price level" }).textContent).toContain("100");
  });

  it("preserves the existing Recent Trades view and requests the API symbol", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    mTrades.mockResolvedValue([]);
    const { findByText, getByRole } = render(<SpotOrderBookPanel market={market} />);
    await findByText("65,010.00");

    fireEvent.click(getByRole("tab", { name: "Recent Trades" }));

    await findByText("No trades yet");
    await waitFor(() => expect(mTrades).toHaveBeenCalledWith("CBTC-USDA", 30));
  });

  it("uses roving focus and arrow keys across the order book tabs", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    mTrades.mockResolvedValue([]);
    const { findByText, getByRole } = render(<SpotOrderBookPanel market={market} />);
    await findByText("65,010.00");

    const orderBook = getByRole("tab", { name: "Order Book" }) as HTMLButtonElement;
    const recentTrades = getByRole("tab", { name: "Recent Trades" }) as HTMLButtonElement;
    expect(orderBook.tabIndex).toBe(0);
    expect(recentTrades.tabIndex).toBe(-1);
    orderBook.focus();

    fireEvent.keyDown(orderBook, { key: "ArrowRight" });
    expect(document.activeElement).toBe(recentTrades);
    expect(recentTrades.getAttribute("aria-selected")).toBe("true");
    expect(orderBook.tabIndex).toBe(-1);
    expect(recentTrades.tabIndex).toBe(0);

    fireEvent.keyDown(recentTrades, { key: "Home" });
    expect(document.activeElement).toBe(orderBook);
    expect(orderBook.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(orderBook, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(recentTrades);
    expect(recentTrades.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(recentTrades, { key: "End" });
    expect(document.activeElement).toBe(recentTrades);
    expect(recentTrades.getAttribute("aria-selected")).toBe("true");
  });

  it("renders asks + bids with quote notional totals and spread", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, container } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    await findByText("64,990.00");
    expect(container.textContent).toContain("195.09");
    expect(container.textContent).toContain("259.96");
    await findByText(/Spread 20\.00.*0\.031%/);
  });

  it("filters already-fetched rows to asks while keeping the mid/spread row", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, queryByText } = render(<SpotOrderBookPanel market={market} />);
    await findByText("65,010.00");

    fireEvent.click(getByRole("button", { name: "Show asks only" }));

    expect(queryByText("65,010.00")).not.toBeNull();
    expect(queryByText("64,990.00")).toBeNull();
    expect(queryByText(/Spread 20\.00.*0\.031%/)).not.toBeNull();
    expect(mDepth).toHaveBeenCalledTimes(1);
  });

  it("filters already-fetched rows to bids while keeping the mid/spread row", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, queryByText } = render(<SpotOrderBookPanel market={market} />);
    await findByText("64,990.00");

    fireEvent.click(getByRole("button", { name: "Show bids only" }));

    expect(queryByText("65,010.00")).toBeNull();
    expect(queryByText("64,990.00")).not.toBeNull();
    expect(queryByText(/Spread 20\.00.*0\.031%/)).not.toBeNull();
    expect(mDepth).toHaveBeenCalledTimes(1);
  });

  it("returns to the full book view without fetching a new snapshot", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole, queryByText } = render(<SpotOrderBookPanel market={market} />);
    await findByText("65,010.00");

    fireEvent.click(getByRole("button", { name: "Show asks only" }));
    expect(queryByText("64,990.00")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Show full order book" }));

    expect(queryByText("65,010.00")).not.toBeNull();
    expect(queryByText("64,990.00")).not.toBeNull();
    expect(mDepth).toHaveBeenCalledTimes(1);
  });

  it("clears rows from the previous market while the new market snapshot is pending", async () => {
    let resolveNextDepth!: (value: DepthResp) => void;
    const nextDepth = new Promise<DepthResp>((resolve) => {
      resolveNextDepth = resolve;
    });
    mDepth.mockImplementation((symbol) =>
      symbol === ethMarket.apiSymbol ? nextDepth : Promise.resolve(twoSidedDepth)
    );
    const { findAllByText, findByText, getByText, queryByText, rerender } = render(
      <SpotOrderBookPanel market={market} />
    );
    await findByText("65,010.00");

    rerender(<SpotOrderBookPanel market={ethMarket} />);

    expect(queryByText("65,010.00")).toBeNull();
    expect(getByText("Loading…")).toBeTruthy();
    await waitFor(() => expect(mDepth).toHaveBeenCalledWith("CETH-USDA", 20));

    resolveNextDepth({ lastUpdateId: 2, asks: [["3501", "1"]], bids: [["3499", "1"]] });
    expect(await findAllByText("3,501.00")).toHaveLength(2);
  });

  it("does not fabricate a spread for an ask-only snapshot", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [["65010", "0.001"]], bids: [] });
    const { findAllByText, findByText } = render(<SpotOrderBookPanel market={market} />);

    expect(await findAllByText("65,010.00")).toHaveLength(2);
    await findByText("Spread —");
  });

  it("does not fabricate a spread for a bid-only snapshot", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [], bids: [["64990", "0.001"]] });
    const { findAllByText, findByText } = render(<SpotOrderBookPanel market={market} />);

    expect(await findAllByText("64,990.00")).toHaveLength(2);
    await findByText("Spread —");
  });
});
