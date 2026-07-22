// Component-layer specs for SpotBottomTabs — connect gate + Open Orders
// render + cancel action.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));
vi.mock("../../api/spotSession", () => ({
  useSpotAuthReady: vi.fn(),
}));
vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      openOrders: vi.fn(),
      cancelOrder: vi.fn(),
    },
  };
});

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import { SpotBottomTabs } from "./BottomTabs";
import { spotApi } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mReady = vi.mocked(useSpotAuthReady);
const mOpen = vi.mocked(spotApi.openOrders);
const mCancel = vi.mocked(spotApi.cancelOrder);
const mConnect = vi.mocked(openCantonConnect);
const market = resolveSpotMarket("CBTC-USDA");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotBottomTabs", () => {
  it("shows Connect wallet placeholder when auth not ready and skips API calls", () => {
    mReady.mockReturnValue(false);
    const { getByText } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByText("Connect wallet"));
    expect(mConnect).toHaveBeenCalledOnce();
    expect(mOpen).not.toHaveBeenCalled();
  });

  it("shows 'No open orders' when ready and empty", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([]);
    const { findByText } = render(<SpotBottomTabs market={market} />);
    await findByText("No open orders");
  });

  it("renders order rows and fires cancelOrder(symbol, orderId) on Cancel click", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([
      {
        symbol: "CBTC-USDCX",
        orderId: "019f64e35ff175d18108787dd7af24f2",
        clientOrderId: "cid-1",
        price: "65000.00",
        origQty: "0.001",
        executedQty: "0",
        cummulativeQuoteQty: "0",
        status: "NEW",
        timeInForce: "GTC",
        type: "LIMIT",
        side: "SELL",
        time: 1_700_000_000_000,
      },
    ]);
    mCancel.mockResolvedValue({
      status: "CANCELED",
    });
    const { findByText, getByText } = render(<SpotBottomTabs market={market} />);
    await findByText("SELL");
    await findByText("65,000");
    fireEvent.click(getByText("Cancel"));
    await waitFor(() => expect(mCancel).toHaveBeenCalledOnce());
    expect(mCancel).toHaveBeenCalledWith("CBTC-USDCX", "019f64e35ff175d18108787dd7af24f2");
  });
});
