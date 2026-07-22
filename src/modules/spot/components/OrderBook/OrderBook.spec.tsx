// Component-layer specs for SpotOrderBookPanel — renders levels, spread,
// cumulative totals, and filters the already-fetched book by side.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      depth: vi.fn(),
      trades: vi.fn(),
    },
  };
});

import { SpotOrderBookPanel } from "./OrderBook";
import { spotApi } from "../../api/spotClient";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mDepth = vi.mocked(spotApi.depth);
const mTrades = vi.mocked(spotApi.trades);
const market = resolveSpotMarket("CBTC-USDA");

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotOrderBookPanel", () => {
  it("shows 'No resting orders' when the book comes back empty", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [], bids: [] });
    const { findByText } = render(<SpotOrderBookPanel market={market} />);
    await findByText("No resting orders");
  });

  it("requests the API symbol and renders market-aware ZTDX labels", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, getByRole } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    await waitFor(() => expect(mDepth).toHaveBeenCalledWith("CBTC-USDCX", 20));
    expect((getByRole("button", { name: "Order Book" }) as HTMLButtonElement).disabled).toBe(false);
    expect((getByRole("button", { name: "Recent Trades" }) as HTMLButtonElement).disabled).toBe(false);
    expect(getByRole("button", { name: "Show full order book" })).toBeTruthy();
    expect(getByRole("button", { name: "Show asks only" })).toBeTruthy();
    expect(getByRole("button", { name: "Show bids only" })).toBeTruthy();
    expect(getByRole("columnheader", { name: "Price (USDA)" })).toBeTruthy();
    expect(getByRole("columnheader", { name: "Amount (CBTC)" })).toBeTruthy();
    expect(getByRole("columnheader", { name: "Total (USDA)" })).toBeTruthy();
    expect(mTrades).not.toHaveBeenCalled();
  });

  it("preserves the existing Recent Trades view and requests the API symbol", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    mTrades.mockResolvedValue([]);
    const { findByText, getByRole } = render(<SpotOrderBookPanel market={market} />);
    await findByText("65,010.00");

    fireEvent.click(getByRole("button", { name: "Recent Trades" }));

    await findByText("No trades yet");
    await waitFor(() => expect(mTrades).toHaveBeenCalledWith("CBTC-USDCX", 30));
  });

  it("renders asks + bids with prices, quantities, cumulative totals, and spread", async () => {
    mDepth.mockResolvedValue(twoSidedDepth);
    const { findByText, container } = render(<SpotOrderBookPanel market={market} />);

    await findByText("65,010.00");
    await findByText("64,990.00");
    expect(container.textContent).toContain("0.0060");
    expect(container.textContent).toContain("0.0150");
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
});
