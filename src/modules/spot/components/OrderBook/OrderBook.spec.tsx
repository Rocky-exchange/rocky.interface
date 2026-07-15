// Component-layer specs for SpotOrderBookPanel — renders levels, spread,
// cumulative totals, and switches to Trades tab.
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

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

import { spotApi } from "../../api/spotClient";
import { SpotOrderBookPanel } from "./OrderBook";

const mDepth = vi.mocked(spotApi.depth);
const mTrades = vi.mocked(spotApi.trades);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotOrderBookPanel", () => {
  it("shows 'No resting orders' when the book comes back empty", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [], bids: [] });
    const { findByText } = render(<SpotOrderBookPanel symbol="CBTC-USDCX" />);
    await findByText("No resting orders");
  });

  it("renders asks + bids with prices, quantities, and cumulative totals", async () => {
    // 3-tier ladder each side. Cumulative total for each row = sum of its
    // qty and every prior row's qty.
    mDepth.mockResolvedValue({
      lastUpdateId: 1,
      asks: [
        ["65010.00", "0.001"], // total = 0.0010
        ["65020.00", "0.002"], // total = 0.0030
        ["65030.00", "0.003"], // total = 0.0060
      ],
      bids: [
        ["64990.00", "0.001"],
        ["64980.00", "0.002"],
        ["64970.00", "0.003"],
      ],
    });
    const { findByText, container } = render(<SpotOrderBookPanel symbol="CBTC-USDCX" />);
    // Wait for asks + bids to render
    await findByText("65,010.00");
    await findByText("64,990.00");
    // Cumulative Total column — check the last-row totals which are the sum
    expect(container.textContent).toContain("0.0060");
    // Spread displayed in the mid row: 65010 - 64990 = 20, pct ~0.031%
    await findByText(/Spread 20\.00.*0\.031%/);
  });

  it("switches to Trades tab and calls trades() instead of depth()", async () => {
    mDepth.mockResolvedValue({ lastUpdateId: 1, asks: [["65010", "0.001"]], bids: [["64990", "0.001"]] });
    mTrades.mockResolvedValue([]);
    const { getByText, findByText } = render(<SpotOrderBookPanel symbol="CBTC-USDCX" />);
    await findByText("65,010.00");
    act(() => {
      fireEvent.click(getByText("Trades"));
    });
    await waitFor(() => expect(mTrades).toHaveBeenCalled());
  });
});
