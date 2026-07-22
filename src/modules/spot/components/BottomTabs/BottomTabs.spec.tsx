import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../Accounts/Accounts", () => ({
  SpotAccountsPanel: ({ market }: { market: { routeSymbol: string } }) => (
    <div data-testid="assets-view">Assets for {market.routeSymbol}</div>
  ),
}));

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
  it("shows Assets by default with the exact ZTDX tab set and disabled history placeholders", () => {
    mReady.mockReturnValue(true);

    const { getAllByRole, getByTestId } = render(<SpotBottomTabs market={market} />);
    const tabs = getAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual(["Assets", "Open Orders", "Order History", "Trade History"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect((tabs[2] as HTMLButtonElement).disabled).toBe(true);
    expect((tabs[3] as HTMLButtonElement).disabled).toBe(true);
    expect(getByTestId("assets-view").textContent).toBe("Assets for CBTC-USDA");
    expect(mOpen).not.toHaveBeenCalled();
  });

  it("switches to Open Orders and preserves the connect-wallet path", () => {
    mReady.mockReturnValue(false);

    const { getByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    fireEvent.click(getByRole("button", { name: "Connect wallet" }));

    expect(getByRole("tab", { name: "Open Orders" }).getAttribute("aria-selected")).toBe("true");
    expect(mConnect).toHaveBeenCalledOnce();
    expect(mOpen).not.toHaveBeenCalled();
  });

  it("fetches the API symbol and shows the empty state after switching to Open Orders", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([]);

    const { getByRole, findByText } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    await findByText("No open orders");
    expect(mOpen).toHaveBeenCalledWith("CBTC-USDCX");
  });

  it("shows a loading state while open orders are pending", () => {
    mReady.mockReturnValue(true);
    mOpen.mockReturnValue(new Promise(() => undefined));

    const { getByRole, getByText } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect(getByText("Loading…")).toBeTruthy();
  });

  it("shows the open-orders request error", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockRejectedValue(new Error("orders unavailable"));

    const { getByRole, findByText } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect(await findByText("orders unavailable")).toBeTruthy();
  });

  it("renders open-order rows and cancels with the backend API symbol", async () => {
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
    mCancel.mockResolvedValue({ status: "CANCELED" });

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    const row = await findByRole("row", { name: /SELL 65,000 0.001 0 NEW Cancel/ });
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(mCancel).toHaveBeenCalledOnce());
    expect(mCancel).toHaveBeenCalledWith("CBTC-USDCX", "019f64e35ff175d18108787dd7af24f2");
  });
});
