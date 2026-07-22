import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      myTrades: vi.fn(),
    },
  };
});
vi.mock("../Accounts/Accounts", () => ({
  SpotAccountsPanel: ({ market }: { market: { routeSymbol: string } }) => (
    <div data-testid="assets-view">Assets for {market.routeSymbol}</div>
  ),
}));

import { SpotBottomTabs } from "./BottomTabs";
import { spotApi } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mReady = vi.mocked(useSpotAuthReady);
const mOpen = vi.mocked(spotApi.openOrders);
const mCancel = vi.mocked(spotApi.cancelOrder);
const mTrades = vi.mocked(spotApi.myTrades);
const market = resolveSpotMarket("CBTC-USDA");
const cethMarket = resolveSpotMarket("CETH-USDA");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function order(orderId: string, side: "BUY" | "SELL" = "SELL", price = "65000.00") {
  return {
    symbol: "CBTC-USDCX",
    orderId,
    clientOrderId: `client-${orderId}`,
    price,
    origQty: "0.001",
    executedQty: "0",
    cummulativeQuoteQty: "0",
    status: "NEW" as const,
    timeInForce: "GTC" as const,
    type: "LIMIT" as const,
    side,
    time: 1_700_000_000_000,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotBottomTabs", () => {
  it("shows Assets by default; Order History disabled, Trade History enabled", () => {
    mReady.mockReturnValue(true);

    const { getAllByRole, getByTestId } = render(<SpotBottomTabs market={market} />);
    const tabs = getAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual(["Assets", "Open Orders", "Order History", "Trade History"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    // Order History still needs /api/v3/allOrders (unbuilt) → disabled.
    expect((tabs[2] as HTMLButtonElement).disabled).toBe(true);
    // Trade History is now backed by /api/v3/myTrades → enabled.
    expect((tabs[3] as HTMLButtonElement).disabled).toBe(false);
    expect(getByTestId("assets-view").textContent).toBe("Assets for CBTC-USDA");
    expect(mOpen).not.toHaveBeenCalled();
    expect(mTrades).not.toHaveBeenCalled();
  });

  it("keeps the futures-style view controls in the tab toolbar", () => {
    mReady.mockReturnValue(true);

    const { getByTestId } = render(<SpotBottomTabs market={market} />);

    expect(getByTestId("spot-bottom-view-controls").children).toHaveLength(3);
  });

  it("uses roving focus over the 3 enabled tabs and skips disabled Order History", () => {
    mReady.mockReturnValue(false);

    const { getByRole } = render(<SpotBottomTabs market={market} />);
    const assets = getByRole("tab", { name: "Assets" }) as HTMLButtonElement;
    const openOrders = getByRole("tab", { name: "Open Orders" }) as HTMLButtonElement;
    const orderHistory = getByRole("tab", { name: "Order History" }) as HTMLButtonElement;
    const tradeHistory = getByRole("tab", { name: "Trade History" }) as HTMLButtonElement;

    expect(assets.tabIndex).toBe(0);
    expect(openOrders.tabIndex).toBe(-1);
    expect(orderHistory.tabIndex).toBe(-1);
    expect(tradeHistory.tabIndex).toBe(-1);
    assets.focus();

    fireEvent.keyDown(assets, { key: "ArrowRight" });
    expect(document.activeElement).toBe(openOrders);
    expect(openOrders.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(openOrders, { key: "Home" });
    expect(document.activeElement).toBe(assets);
    expect(assets.getAttribute("aria-selected")).toBe("true");

    // ArrowLeft from the first tab wraps to the last ENABLED tab (Trade History),
    // skipping the disabled Order History.
    fireEvent.keyDown(assets, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tradeHistory);
    expect(tradeHistory.getAttribute("aria-selected")).toBe("true");

    // End jumps to the last enabled tab too.
    fireEvent.keyDown(tradeHistory, { key: "End" });
    expect(document.activeElement).toBe(tradeHistory);
    expect(orderHistory.disabled).toBe(true);
  });

  it("switches to Open Orders without rendering a panel-level wallet CTA", () => {
    mReady.mockReturnValue(false);

    const { getByRole, queryByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect(getByRole("tab", { name: "Open Orders" }).getAttribute("aria-selected")).toBe("true");
    expect(queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(mOpen).not.toHaveBeenCalled();
  });

  it("fetches the API symbol and shows the empty state after switching to Open Orders", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([]);

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect((await findByRole("status")).textContent).toBe("No open orders");
    expect(mOpen).toHaveBeenCalledWith("CBTC-USDCX");
  });

  it("shows a loading state while open orders are pending", () => {
    mReady.mockReturnValue(true);
    mOpen.mockReturnValue(new Promise(() => undefined));

    const { getByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect(getByRole("status").textContent).toBe("Loading…");
  });

  it("shows the open-orders request error", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockRejectedValue(new Error("orders unavailable"));

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));

    expect((await findByRole("alert")).textContent).toBe("orders unavailable");
  });

  it("remounts Open Orders on market changes so the previous market cannot be cancelled under a new symbol", async () => {
    const cethOrders = deferred<ReturnType<typeof order>[]>();
    mReady.mockReturnValue(true);
    mOpen.mockImplementation((symbol) =>
      symbol === "CBTC-USDCX" ? Promise.resolve([order("cbtc-old")]) : cethOrders.promise,
    );

    const { getByRole, findByRole, queryByRole, rerender } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    expect(await findByRole("row", { name: /65,000.*Cancel/ })).toBeTruthy();

    rerender(<SpotBottomTabs market={cethMarket} />);

    expect(queryByRole("row", { name: /65,000.*Cancel/ })).toBeNull();
    expect(getByRole("status").textContent).toBe("Loading…");
    expect(mOpen).toHaveBeenCalledWith("CETH-USDCX");
    expect(mCancel).not.toHaveBeenCalled();
    cethOrders.resolve([]);
  });

  it("renders open-order rows and cancels with the backend API symbol", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([order("019f64e35ff175d18108787dd7af24f2")]);
    mCancel.mockResolvedValue({ status: "CANCELED" });

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    const row = await findByRole("row", { name: /SELL 65,000 0.001 0 NEW Cancel/ });
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(mCancel).toHaveBeenCalledOnce());
    expect(mCancel).toHaveBeenCalledWith("CBTC-USDCX", "019f64e35ff175d18108787dd7af24f2");
    await waitFor(() => expect(mOpen).toHaveBeenCalledTimes(2));
  });

  it("keeps each overlapping cancellation disabled until its own request finishes", async () => {
    const firstCancel = deferred<{ status: "CANCELED" }>();
    const secondCancel = deferred<{ status: "CANCELED" }>();
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([order("order-1", "SELL", "65001"), order("order-2", "BUY", "65002")]);
    mCancel.mockImplementation((_symbol, orderId) =>
      orderId === "order-1" ? firstCancel.promise : secondCancel.promise,
    );

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    const firstRow = await findByRole("row", { name: /SELL 65,001.*Cancel/ });
    const secondRow = await findByRole("row", { name: /BUY 65,002.*Cancel/ });
    const firstButton = within(firstRow).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    const secondButton = within(secondRow).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;

    fireEvent.click(firstButton);
    fireEvent.click(secondButton);
    expect(firstButton.disabled).toBe(true);
    expect(secondButton.disabled).toBe(true);

    firstCancel.resolve({ status: "CANCELED" });
    await waitFor(() => expect(firstButton.disabled).toBe(false));
    expect(secondButton.disabled).toBe(true);
    expect(mOpen).toHaveBeenCalledTimes(2);

    secondCancel.resolve({ status: "CANCELED" });
    await waitFor(() => expect(secondButton.disabled).toBe(false));
    expect(mOpen).toHaveBeenCalledTimes(3);
  });

  it("announces cancel errors and re-enables the affected order", async () => {
    mReady.mockReturnValue(true);
    mOpen.mockResolvedValue([order("order-fail")]);
    mCancel.mockRejectedValue(new Error("cancel rejected"));

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Open Orders" }));
    const row = await findByRole("row", { name: /65,000.*Cancel/ });
    const cancelButton = within(row).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    fireEvent.click(cancelButton);

    expect((await findByRole("alert")).textContent).toBe("cancel rejected");
    await waitFor(() => expect(cancelButton.disabled).toBe(false));
  });

  it("switches to Trade History and renders myTrades rows for the API symbol", async () => {
    mReady.mockReturnValue(true);
    mTrades.mockResolvedValue([
      {
        symbol: "CBTC-USDCX",
        id: "018f0000-0000-0000-0000-0000000000aa",
        price: "65000.00",
        qty: "0.001",
        quoteQty: "65.00",
        commission: "0.026",
        commissionAsset: "USDA",
        time: 1_700_000_000_000,
        isBuyer: true,
        isMaker: false,
        isBestMatch: true,
      },
    ]);

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Trade History" }));

    const row = await findByRole("row", { name: /BUY.*65,000.*Taker/ });
    expect(within(row).getByText("Taker")).toBeTruthy();
    expect(mTrades).toHaveBeenCalledWith("CBTC-USDCX");
  });

  it("shows the empty state when the user has no trades", async () => {
    mReady.mockReturnValue(true);
    mTrades.mockResolvedValue([]);

    const { getByRole, findByRole } = render(<SpotBottomTabs market={market} />);
    fireEvent.click(getByRole("tab", { name: "Trade History" }));

    expect((await findByRole("status")).textContent).toBe("No trades yet");
  });
});
