import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWalletBalanceSnapshot, type WalletBalanceSnapshot } from "@/shared/lib/canton-wallet/balances";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { ensureSpotMemberAuth } from "@/shared/lib/canton-wallet/memberAuth";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { SpotOrderForm } from "./OrderForm";
import { spotApi, type Account, type SpotOrder, SpotApiError } from "../../api/spotClient";
import { swapApi, SwapApiError, type SwapOrder } from "../../api/swapClient";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { resolveSpotMarket } from "../../model/spotMarkets";
import { renderWithI18n as render } from "../../test/renderWithI18n";

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/balances", () => ({ fetchWalletBalanceSnapshot: vi.fn() }));
vi.mock("@/shared/lib/canton-wallet/memberAuth", () => ({ ensureSpotMemberAuth: vi.fn() }));
vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({ useCantonSession: vi.fn() }));
vi.mock("../../hooks/useSpotAccount", () => ({
  useSpotAccount: vi.fn(),
}));
vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      placeOrder: vi.fn(),
      depth: vi.fn(),
    },
  };
});
vi.mock("../../api/swapClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/swapClient")>("../../api/swapClient");
  return { ...actual, swapApi: { capacity: vi.fn(), create: vi.fn(), get: vi.fn() } };
});

const mUseSpotAccount = vi.mocked(useSpotAccount);
const mPlace = vi.mocked(spotApi.placeOrder);
const mDepth = vi.mocked(spotApi.depth);
const mConnect = vi.mocked(openCantonConnect);
const mFetchWalletBalances = vi.mocked(fetchWalletBalanceSnapshot);
const mEnsureMemberAuth = vi.mocked(ensureSpotMemberAuth);
const mUseCantonSession = vi.mocked(useCantonSession);
const mCreateSwap = vi.mocked(swapApi.create);
const mGetSwap = vi.mocked(swapApi.get);
const mSwapCapacity = vi.mocked(swapApi.capacity);
const market = resolveSpotMarket("CBTC-CUSD");
const cethMarket = resolveSpotMarket("CETH-CUSD");
const refetch = vi.fn();
const walletBalances: WalletBalanceSnapshot = {
  provider: "rocky",
  label: "Rocky Wallet",
  party: "party-alice",
  status: "ready",
  balances: [
    { symbol: "CUSD", amount: "100000" },
    { symbol: "CBTC", amount: "2.5" },
    { symbol: "cETH", amount: "0" },
    { symbol: "CC", amount: "0" },
  ],
};

const account: Account = {
  accountType: "SPOT",
  canTrade: true,
  canWithdraw: true,
  canDeposit: true,
  updateTime: 1,
  balances: [
    { asset: "CUSD", free: "1000", locked: "25" },
    { asset: "CBTC", free: "2.5", locked: "0.5" },
  ],
  permissions: ["SPOT"],
};

function accountWith({
  quoteFree = "1000",
  baseFree = "2.5",
  canTrade = true,
}: { quoteFree?: string; baseFree?: string; canTrade?: boolean } = {}): Account {
  return {
    ...account,
    canTrade,
    balances: [
      { asset: "CUSD", free: quoteFree, locked: "25" },
      { asset: "CBTC", free: baseFree, locked: "0.5" },
    ],
  };
}

function readyAccount(nextAccount: Account | null = account) {
  mUseSpotAccount.mockReturnValue({ ready: true, account: nextAccount, err: null, refetch });
}

function successfulOrder(side: "BUY" | "SELL"): SpotOrder {
  return {
    symbol: market.apiSymbol,
    orderId: "abcdef1234567890",
    clientOrderId: "cid",
    price: "250",
    origQty: "1",
    executedQty: "0",
    cummulativeQuoteQty: "0",
    status: "NEW",
    timeInForce: "GTC",
    type: "LIMIT",
    side,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mPlace.mockReset();
});

beforeEach(() => {
  readyAccount();
  mUseCantonSession.mockReturnValue({
    connected: true,
    locked: false,
    token: "token",
    party: "party-alice",
    username: "Alice",
    avatar: "",
    provider: "rocky",
  });
  mEnsureMemberAuth.mockResolvedValue(false);
  mFetchWalletBalances.mockResolvedValue(walletBalances);
  mDepth.mockResolvedValue({
    lastUpdateId: 1,
    asks: [["65000", "10"]],
    bids: [["64000", "10"]],
  });
  mSwapCapacity.mockImplementation(async (symbol, side) => ({
    symbol,
    side,
    outputAsset: side === "BUY" ? "CBTC" : "CUSD",
    custodyBalance: "10",
    custodyUsableBalance: "8",
    configuredMinBase: "0.00001",
    feeAdjustedMinBase: "0.00001577",
    effectiveMinBase: "0.00001577",
    maxBase: "8",
  }));
  const swap: SwapOrder = {
    swapId: "019fswap1234567890",
    clientSwapId: "client-swap",
    symbol: market.apiSymbol,
    side: "BUY",
    requestedBase: "0.1",
    acceptedBase: "0.1",
    slippageBps: 50,
    referencePrice: "65000",
    protectionPrice: "65650",
    status: "MATCHING",
  };
  mCreateSwap.mockResolvedValue(swap);
  mGetSwap.mockResolvedValue(swap);
});

describe("SpotOrderForm", () => {
  it("places order type controls before buy and sell controls like the futures panel", () => {
    const { getByRole } = render(<SpotOrderForm market={market} />);

    const orderTypes = getByRole("tablist", { name: "Order type" });
    const orderSide = getByRole("tablist", { name: "Order side" });

    expect(orderTypes.compareDocumentPosition(orderSide) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("shows Market, Limit, and the isolated Swap product tabs", () => {
    const { getByRole, queryByRole } = render(<SpotOrderForm market={market} />);

    const typeTabs = within(getByRole("tablist", { name: "Order type" })).getAllByRole("tab");
    const limit = getByRole("tab", { name: "Limit" }) as HTMLButtonElement;
    const marketType = getByRole("tab", { name: "Market" }) as HTMLButtonElement;
    const swap = getByRole("tab", { name: "Swap" }) as HTMLButtonElement;
    expect(typeTabs.map((tab) => tab.textContent)).toEqual(["Market", "Limit", "Swap"]);
    expect(queryByRole("tab", { name: "Advanced" })).toBeNull();
    expect(limit.getAttribute("aria-selected")).toBe("true");
    expect(limit.tabIndex).toBe(0);
    expect(marketType.disabled).toBe(false);
    expect(marketType.tabIndex).toBe(-1);

    fireEvent.click(marketType);
    expect(marketType.getAttribute("aria-selected")).toBe("true");
    expect(marketType.tabIndex).toBe(0);
    expect(limit.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(swap);
    expect(swap.getAttribute("aria-selected")).toBe("true");
    expect(swap.tabIndex).toBe(0);
    expect(marketType.getAttribute("aria-selected")).toBe("false");
  });

  it("renders Swap with a balance slider, 0.5% slippage, and one fee breakdown", async () => {
    const view = render(<SpotOrderForm market={market} />);

    fireEvent.click(view.getByRole("tab", { name: "Swap" }));

    expect(view.getByRole("tablist", { name: "Swap side" })).toBeTruthy();
    expect(view.getByText("Onchain atomic swap")).toBeTruthy();
    expect(view.getByText("Swap directly from your wallet")).toBeTruthy();
    expect(view.getByText(/Your swap is matched against available market liquidity/)).toBeTruthy();
    expect(view.getByText("CUSD")).toBeTruthy();
    expect(view.getAllByText("CBTC").length).toBeGreaterThan(0);
    expect(view.getByText(/Actual fills update trades, volume, and candles/)).toBeTruthy();
    expect(view.getByRole("slider", { name: "Swap percentage" })).toBeTruthy();
    expect((view.getByLabelText("Swap slippage") as HTMLInputElement).value).toBe("0.5");
    const fees = view.getByLabelText("Swap fees");
    expect(within(fees).getByLabelText("Swap trading fee")).toBeTruthy();
    expect(within(fees).getByLabelText("Swap gas fee")).toBeTruthy();
    expect(within(fees).getByLabelText("Swap total fees")).toBeTruthy();
    expect(view.queryByText("1 USDT equivalent")).toBeNull();
    expect(view.queryByText("Deducted from CBTC received")).toBeNull();
    expect(view.queryByText("No CC balance required")).toBeNull();
    await waitFor(() => expect(mFetchWalletBalances).toHaveBeenCalled());
    expect((view.getByRole("button", { name: /Swap to buy CBTC/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(mPlace).not.toHaveBeenCalled();
  });

  it("shows chain gas and total fees in the asset received instead of USDT", async () => {
    const view = render(<SpotOrderForm market={market} />);

    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.001" } });
    await waitFor(() => expect(view.getByLabelText("Swap gas fee").textContent).toContain("CBTC"));
    expect(view.getByLabelText("Swap total fees").textContent).toContain("CBTC");

    fireEvent.click(view.getByRole("button", { name: "Sell CBTC" }));
    await waitFor(() => expect(view.getByLabelText("Swap gas fee").textContent).toContain("1 CUSD"));
    expect(view.getByLabelText("Swap total fees").textContent).toContain("CUSD");
    expect(view.queryByText(/USDT/)).toBeNull();
  });

  it("sizes Swap amount from the connected wallet balance", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() =>
      expect((view.getByRole("slider", { name: "Swap percentage" }) as HTMLInputElement).disabled).toBe(false)
    );

    fireEvent.change(view.getByRole("slider", { name: "Swap percentage" }), { target: { value: "50" } });
    expect((view.getByLabelText("Swap amount (CBTC)") as HTMLInputElement).value).toBe("0.76923076");
    expect((view.getByLabelText("Swap percentage input") as HTMLInputElement).value).toBe("50");
  });

  it("blocks amounts above the backend custody-backed single Swap maximum", async () => {
    mSwapCapacity.mockResolvedValue({
      symbol: market.apiSymbol,
      side: "BUY",
      outputAsset: "CBTC",
      custodyBalance: "0.5",
      custodyUsableBalance: "0.4",
      configuredMinBase: "0.00001",
      feeAdjustedMinBase: "0.00001577",
      effectiveMinBase: "0.00001577",
      maxBase: "0.4",
    });
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(view.getByText("0.4 CBTC")).toBeTruthy());

    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.40000001" } });
    const submit = view.getByRole("button", { name: /Exceeds single Swap limit/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("blocks amounts below the backend effective Swap minimum", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    fireEvent.click(view.getByRole("button", { name: "Sell CBTC" }));
    await waitFor(() => expect(view.getByText("0.00001577 CBTC")).toBeTruthy());

    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.00000351" } });

    const submit = view.getByRole("button", { name: /Below minimum Swap amount/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("checks CBTC custody for BUY and CUSD custody for SELL", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));

    await waitFor(() => expect(view.getByText("Limited to 80% of current custody liquidity · CBTC")).toBeTruthy());
    expect(mSwapCapacity).toHaveBeenCalledWith(market.apiSymbol, "BUY", 50);

    fireEvent.click(view.getByRole("button", { name: "Sell CBTC" }));
    await waitFor(() => expect(view.getByText("Limited to 80% of current custody liquidity · CUSD")).toBeTruthy());
    expect(mSwapCapacity).toHaveBeenCalledWith(market.apiSymbol, "SELL", 50);
  });

  it("does not present the user wallet balance as the custody single Swap maximum", async () => {
    mFetchWalletBalances.mockResolvedValue({
      ...walletBalances,
      balances: walletBalances.balances.map((balance) =>
        balance.symbol === "CUSD" ? { ...balance, amount: "1" } : balance
      ),
    });
    mSwapCapacity.mockResolvedValue({
      symbol: market.apiSymbol,
      side: "BUY",
      outputAsset: "CBTC",
      custodyBalance: "0.5",
      custodyUsableBalance: "0.4",
      configuredMinBase: "0.00001",
      feeAdjustedMinBase: "0.00001577",
      effectiveMinBase: "0.00001577",
      maxBase: "0.4",
    });

    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));

    await waitFor(() => expect(view.getByText("0.4 CBTC")).toBeTruthy());
  });

  it("shows a zero maximum and disables Swap when custody has no usable balance", async () => {
    mSwapCapacity.mockResolvedValue({
      symbol: market.apiSymbol,
      side: "BUY",
      outputAsset: "CBTC",
      custodyBalance: "0",
      custodyUsableBalance: "0",
      configuredMinBase: "0.00001",
      feeAdjustedMinBase: "0.00001577",
      effectiveMinBase: "0.00001577",
      maxBase: "0",
    });
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(view.getByText("0 CBTC")).toBeTruthy());

    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.00001" } });
    expect((view.getByRole("button", { name: /Exceeds single Swap limit/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refreshes the custody-backed maximum on click before creating a Swap", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(mSwapCapacity).toHaveBeenCalled());
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.1" } });
    mSwapCapacity.mockResolvedValueOnce({
      symbol: market.apiSymbol,
      side: "BUY",
      outputAsset: "CBTC",
      custodyBalance: "0.1",
      custodyUsableBalance: "0.08",
      configuredMinBase: "0.00001",
      feeAdjustedMinBase: "0.00001577",
      effectiveMinBase: "0.00001577",
      maxBase: "0.08",
    });

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(view.getByText("Amount exceeds the single Swap maximum")).toBeTruthy());
    expect(mEnsureMemberAuth).not.toHaveBeenCalled();
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("refreshes the effective minimum on click before creating a Swap", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(mSwapCapacity).toHaveBeenCalled());
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.1" } });
    mSwapCapacity.mockResolvedValueOnce({
      symbol: market.apiSymbol,
      side: "BUY",
      outputAsset: "CBTC",
      custodyBalance: "10",
      custodyUsableBalance: "8",
      configuredMinBase: "0.00001",
      feeAdjustedMinBase: "0.2",
      effectiveMinBase: "0.2",
      maxBase: "8",
    });

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(view.getByText("Amount is below the minimum Swap amount")).toBeTruthy());
    expect(mEnsureMemberAuth).not.toHaveBeenCalled();
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("refreshes wallet balance on click and blocks a Swap that became unaffordable", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(mFetchWalletBalances).toHaveBeenCalledTimes(1));
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.001" } });
    mFetchWalletBalances.mockResolvedValueOnce({
      ...walletBalances,
      balances: walletBalances.balances.map((balance) =>
        balance.symbol === "CUSD" ? { ...balance, amount: "1" } : balance
      ),
    });

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(view.getByRole("button", { name: /Insufficient CUSD balance/ })).toBeTruthy());
    expect(mEnsureMemberAuth).not.toHaveBeenCalled();
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("drops an in-flight Swap preflight when the user changes side", async () => {
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    await waitFor(() => expect(mSwapCapacity).toHaveBeenCalled());
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.1" } });
    await waitFor(() =>
      expect((view.getByRole("button", { name: /Swap to buy CBTC/ }) as HTMLButtonElement).disabled).toBe(false)
    );

    let resolveDepth!: (value: { lastUpdateId: number; asks: [string, string][]; bids: [string, string][] }) => void;
    const pendingDepth = new Promise<{ lastUpdateId: number; asks: [string, string][]; bids: [string, string][] }>(
      (resolve) => {
        resolveDepth = resolve;
      }
    );
    mDepth.mockReturnValueOnce(pendingDepth);

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(mDepth).toHaveBeenCalledTimes(2));
    fireEvent.click(view.getByRole("button", { name: "Sell CBTC" }));

    await act(async () => {
      resolveDepth({
        lastUpdateId: 2,
        asks: [["65000", "10"]],
        bids: [["64000", "10"]],
      });
      await pendingDepth;
    });

    expect(mEnsureMemberAuth).not.toHaveBeenCalled();
    expect(mCreateSwap).not.toHaveBeenCalled();
  });

  it("requires a second confirmation after first-use wallet authorization", async () => {
    mEnsureMemberAuth.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    fireEvent.change(view.getByLabelText("Swap amount (CBTC)"), { target: { value: "0.1" } });
    await waitFor(() =>
      expect((view.getByRole("button", { name: /Swap to buy CBTC/ }) as HTMLButtonElement).disabled).toBe(false)
    );

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(mEnsureMemberAuth).toHaveBeenCalledTimes(1));
    expect(mCreateSwap).not.toHaveBeenCalled();
    expect(view.getByText(/Review the refreshed market and confirm Swap again/)).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: /Swap to buy CBTC/ }));
    await waitFor(() => expect(mCreateSwap).toHaveBeenCalledTimes(1));
    expect(mCreateSwap.mock.calls[0][0]).toMatchObject({
      symbol: market.apiSymbol,
      side: "BUY",
      amount: "0.1",
      slippageBps: 50,
    });
  });

  it("uses roving focus and arrow keys across the Buy and Sell tabs", () => {
    const { getByRole } = render(<SpotOrderForm market={market} />);
    const buy = getByRole("tab", { name: `Buy ${market.displayBase}` }) as HTMLButtonElement;
    const sell = getByRole("tab", { name: `Sell ${market.displayBase}` }) as HTMLButtonElement;

    expect(buy.tabIndex).toBe(0);
    expect(sell.tabIndex).toBe(-1);
    buy.focus();

    fireEvent.keyDown(buy, { key: "ArrowRight" });
    expect(document.activeElement).toBe(sell);
    expect(sell.getAttribute("aria-selected")).toBe("true");
    expect(buy.tabIndex).toBe(-1);
    expect(sell.tabIndex).toBe(0);

    fireEvent.keyDown(sell, { key: "Home" });
    expect(document.activeElement).toBe(buy);
    expect(buy.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(buy, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(sell);
    expect(sell.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(sell, { key: "End" });
    expect(document.activeElement).toBe(sell);
    expect(sell.getAttribute("aria-selected")).toBe("true");
  });

  it("moves one shared indicator between Buy and Sell like the futures panel", () => {
    const view = render(<SpotOrderForm market={market} />);
    const indicator = view.getByTestId("spot-side-indicator");

    expect(indicator.className).toContain("indicatorBuy");
    fireEvent.click(view.getByRole("tab", { name: `Sell ${market.displayBase}` }));
    expect(view.getByTestId("spot-side-indicator")).toBe(indicator);
    expect(indicator.className).toContain("indicatorSell");
    expect(indicator.className).not.toContain("indicatorBuy");

    const source = readFileSync("src/modules/spot/components/OrderForm/OrderForm.module.scss", "utf8");
    expect(source).toMatch(/\.sideIndicator\s*\{[^}]*transition:\s*transform 200ms/);
    expect(source).toMatch(/\.indicatorSell\s*\{[^}]*transform:\s*translateX\(100%\)/);
  });

  it("keeps side selection decoration on the shared indicator without an outer focus outline", () => {
    const source = readFileSync("src/modules/spot/components/OrderForm/OrderForm.module.scss", "utf8");
    const sideTabBlock = source.slice(source.indexOf(".sideTab {"), source.indexOf(".sideIndicator {"));

    expect(sideTabBlock).not.toContain("focus-visible");
  });

  it("switches the percentage slider from buy to sell colors with the selected side", () => {
    const view = render(<SpotOrderForm market={market} />);
    const slider = view.getByRole("slider", { name: "Order percentage" });

    expect(slider.className).toContain("sliderBuy");
    fireEvent.click(view.getByRole("tab", { name: `Sell ${market.displayBase}` }));
    expect(slider.className).toContain("sliderSell");
    expect(slider.className).not.toContain("sliderBuy");

    const source = readFileSync("src/modules/spot/components/OrderForm/OrderForm.module.scss", "utf8");
    const sellSliderBlock = source.slice(source.indexOf(".sliderSell {"), source.indexOf(".percentInput {"));
    expect(sellSliderBlock).toContain("var(--ltr-trade-sell-gradient-start)");
    expect(sellSliderBlock).toContain("var(--ltr-trade-sell-gradient-end)");
    expect(sellSliderBlock).toContain("var(--ltr-trade-sell-bright)");
  });

  it("keeps the Swap percentage slider enabled while balance and capacity data load", () => {
    mFetchWalletBalances.mockImplementation(() => new Promise(() => undefined));
    mSwapCapacity.mockImplementation(() => new Promise(() => undefined));
    const view = render(<SpotOrderForm market={market} />);

    fireEvent.click(view.getByRole("tab", { name: "Swap" }));

    expect((view.getByRole("slider", { name: "Swap percentage" }) as HTMLInputElement).disabled).toBe(false);
    expect((view.getByLabelText("Swap percentage input") as HTMLInputElement).disabled).toBe(false);
  });

  it("shows a capacity request failure instead of silently rendering empty Swap limits", async () => {
    mFetchWalletBalances.mockResolvedValue({
      ...walletBalances,
      balances: walletBalances.balances.map((balance) =>
        balance.symbol === "CC" ? { ...balance, amount: "5" } : balance
      ),
    });
    mSwapCapacity.mockRejectedValue(
      new SwapApiError(503, "swap_unavailable", "Swap is temporarily unavailable")
    );
    const view = render(<SpotOrderForm market={resolveSpotMarket("CC-CUSD")} />);

    fireEvent.click(view.getByRole("tab", { name: "Swap" }));
    fireEvent.click(view.getByRole("button", { name: "Sell CC" }));

    await waitFor(() =>
      expect(view.getByRole("status").textContent).toContain("Swap is temporarily unavailable")
    );
  });

  it("matches the futures Connect Wallet CTA while keeping the spot connection action", () => {
    mUseSpotAccount.mockReturnValue({ ready: false, account: null, err: null, refetch });
    const { getByRole, queryByRole } = render(<SpotOrderForm market={market} />);

    expect(queryByRole("button", { name: `BUY ${market.displayBase}` })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Connect Wallet" }));
    expect(mConnect).toHaveBeenCalledTimes(1);

    const source = readFileSync("src/modules/spot/components/OrderForm/OrderForm.module.scss", "utf8");
    expect(source).toMatch(
      /\.connect\s*\{[^}]*background:\s*var\(--rocky-tab-active-gradient,\s*linear-gradient\(90deg,\s*#f5a85f 0%,\s*#b0d6ea 100%\)\);[^}]*color:\s*#17110a;[^}]*font-weight:\s*600;/
    );
  });

  it("uses public CUSD and CBTC labels for the available balance", () => {
    const { getByText, getByRole } = render(<SpotOrderForm market={market} />);

    expect(getByText("1,000 CUSD")).toBeTruthy();
    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    expect(getByText("2.5 CBTC")).toBeTruthy();
  });

  it("uses the futures compact field rows and percentage input", () => {
    const view = render(<SpotOrderForm market={market} />);

    const price = view.getByLabelText(`Price (${market.displayQuote})`);
    const amount = view.getByLabelText(`Amount (${market.displayBase})`);
    const total = view.getByLabelText(`Total (${market.displayQuote})`);

    expect(price.parentElement?.querySelector("label")?.textContent).toBe("Price");
    expect(amount.parentElement?.querySelector("label")?.textContent).toBe("Amount");
    expect(total.parentElement?.querySelector("label")?.textContent).toBe("Total");
    expect(view.getByLabelText("Order percentage input")).toHaveProperty("value", "0");
    for (const label of ["0%", "25%", "50%", "75%", "100%"]) {
      expect(view.queryByText(label)).toBeNull();
    }
  });

  it("keeps input focus decoration on the field shell without an inner outline", () => {
    const source = readFileSync("src/modules/spot/components/OrderForm/OrderForm.module.scss", "utf8");
    const fieldBlock = source.slice(source.indexOf(".field {"), source.indexOf(".fieldLabel {"));
    const inputBlock = source.slice(source.indexOf(".input {"), source.indexOf(".unit {"));

    expect(fieldBlock).toContain("&:focus-within");
    expect(fieldBlock).toContain("box-shadow:");
    expect(inputBlock).toContain("outline: none;");
    expect(inputBlock).not.toContain("focus-visible");
  });

  it("formats large fractional balances without losing precision or rounding up", () => {
    readyAccount(accountWith({ quoteFree: "9007199254740993.123456789" }));
    const { getByText } = render(<SpotOrderForm market={market} />);

    expect(getByText("9,007,199,254,740,993.123456789 CUSD")).toBeTruthy();
  });

  it("truncates the available CUSD balance to ten decimals", () => {
    readyAccount(accountWith({ quoteFree: "1.1453822379697668" }));
    const { getByText, queryByText } = render(<SpotOrderForm market={market} />);

    expect(getByText("1.1453822379 CUSD")).toBeTruthy();
    expect(queryByText("1.1453822379697668 CUSD")).toBeNull();
  });

  it("disables submit until price and amount are valid positive values", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const submit = getByRole("button", { name: `BUY ${market.displayBase}` }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "0" } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    expect(submit.disabled).toBe(false);
  });

  it("requires a loaded account with trading enabled before submission", () => {
    readyAccount(null);
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(view.getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    expect((view.getByRole("button", { name: `BUY ${market.displayBase}` }) as HTMLButtonElement).disabled).toBe(true);

    readyAccount(accountWith({ canTrade: false }));
    view.rerender(<SpotOrderForm market={market} />);
    expect((view.getByRole("button", { name: `BUY ${market.displayBase}` }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("validates buy and sell amounts against only the asset being spent", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const price = getByLabelText(`Price (${market.displayQuote})`);
    const amount = getByLabelText(`Amount (${market.displayBase})`);
    const buy = getByRole("button", { name: `BUY ${market.displayBase}` }) as HTMLButtonElement;

    fireEvent.change(price, { target: { value: "1000" } });
    fireEvent.change(amount, { target: { value: "1" } });
    expect(buy.disabled).toBe(false);
    fireEvent.change(price, { target: { value: "1000.00000001" } });
    expect(buy.disabled).toBe(true);

    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    const sell = getByRole("button", { name: `SELL ${market.displayBase}` }) as HTMLButtonElement;
    fireEvent.change(amount, { target: { value: "2.50000001" } });
    expect(sell.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: "2.5" } });
    expect(sell.disabled).toBe(false);
  });

  it("spends the full quote balance on a 100% buy and shows the base-asset fee", () => {
    const { getByLabelText, getByRole, getByText } = render(<SpotOrderForm market={market} />);

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByRole("slider", { name: "Order percentage" }), { target: { value: "100" } });

    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).value).toBe("4");
    const total = getByLabelText(`Total (${market.displayQuote})`) as HTMLInputElement;
    expect(total.value).toBe("1000");
    expect(total.readOnly).toBe(true);
    expect(getByText("0.004 CBTC")).toBeTruthy();
    expect(getByLabelText("Order percentage input")).toHaveProperty("value", "100");
  });

  it("shows a sell fee in the received quote asset", () => {
    const { getByLabelText, getByRole, getByText } = render(<SpotOrderForm market={market} />);

    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });

    expect(getByText("0.25 CUSD")).toBeTruthy();
  });

  it("sizes a sell from the full base balance without requiring a price", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);

    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    fireEvent.change(getByRole("slider", { name: "Order percentage" }), { target: { value: "50" } });

    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).value).toBe("1.25");
  });

  it("leaves buy amount empty when percentage sizing has an empty or zero price", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const price = getByLabelText(`Price (${market.displayQuote})`);
    const amount = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    const slider = getByRole("slider", { name: "Order percentage" });

    fireEvent.change(slider, { target: { value: "100" } });
    expect(amount.value).toBe("");
    fireEvent.change(price, { target: { value: "0" } });
    fireEvent.change(slider, { target: { value: "75" } });
    expect(amount.value).toBe("");
  });

  it("recalculates a percentage-sized buy when price changes so it cannot exceed quote balance", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const price = getByLabelText(`Price (${market.displayQuote})`);
    const amount = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;

    fireEvent.change(price, { target: { value: "100" } });
    fireEvent.change(getByRole("slider", { name: "Order percentage" }), { target: { value: "100" } });
    expect(amount.value).toBe("10");

    fireEvent.change(price, { target: { value: "200" } });
    expect(amount.value).toBe("5");
  });

  it("keeps active percentage sizing when switching sides", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const amount = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    const slider = getByRole("slider", { name: "Order percentage" }) as HTMLInputElement;

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(slider, { target: { value: "50" } });
    expect(amount.value).toBe("2");
    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));

    expect(slider.value).toBe("50");
    expect(amount.value).toBe("1.25");
  });

  it("recalculates active percentage sizing when a polled balance falls", async () => {
    const view = render(<SpotOrderForm market={market} />);
    const amount = view.getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;

    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "100" } });
    fireEvent.change(view.getByRole("slider", { name: "Order percentage" }), { target: { value: "100" } });
    expect(amount.value).toBe("10");

    readyAccount(accountWith({ quoteFree: "100" }));
    view.rerender(<SpotOrderForm market={market} />);
    await waitFor(() => expect(amount.value).toBe("1"));
  });

  it("shows a user-facing BUY submission confirmation instead of the backend NEW status", async () => {
    mPlace.mockResolvedValue(successfulOrder("BUY"));
    const { getByLabelText, getByRole, findByText, queryByText } = render(<SpotOrderForm market={market} />);
    const priceInput = getByLabelText(`Price (${market.displayQuote})`) as HTMLInputElement;
    const amountInput = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "250" } });
    fireEvent.change(amountInput, { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `BUY ${market.displayBase}` }));

    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());
    expect(mPlace).toHaveBeenCalledWith({
      symbol: "CBTC-CUSD",
      side: "BUY",
      type: "LIMIT",
      price: "250",
      quantity: "1",
    });
    await waitFor(() => {
      expect(priceInput.value).toBe("");
      expect(amountInput.value).toBe("");
    });
    expect(await findByText("Buy order submitted · abcdef123456…")).toBeTruthy();
    expect(queryByText(/NEW ·/)).toBeNull();
  });

  it("sends a LIMIT SELL to the internal API symbol", async () => {
    mPlace.mockResolvedValue(successfulOrder("SELL"));
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `SELL ${market.displayBase}` }));

    await waitFor(() =>
      expect(mPlace).toHaveBeenCalledWith({
        symbol: "CBTC-CUSD",
        side: "SELL",
        type: "LIMIT",
        price: "250",
        quantity: "1",
      })
    );
  });

  it("locks every mutable control while the order request is pending", async () => {
    let resolveOrder!: (order: SpotOrder) => void;
    mPlace.mockReturnValue(
      new Promise((resolve) => {
        resolveOrder = resolve;
      })
    );
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `BUY ${market.displayBase}` }));

    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());
    expect((getByRole("tab", { name: `Buy ${market.displayBase}` }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("tab", { name: `Sell ${market.displayBase}` }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText(`Price (${market.displayQuote})`) as HTMLInputElement).disabled).toBe(true);
    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).disabled).toBe(true);
    expect((getByRole("slider", { name: "Order percentage" }) as HTMLInputElement).disabled).toBe(true);

    await act(async () => resolveOrder(successfulOrder("BUY")));
  });

  it("clears the market draft on symbol change and only submits newly entered values to the new market", async () => {
    mPlace
      .mockRejectedValueOnce(new SpotApiError(-2010, "insufficient balance"))
      .mockResolvedValueOnce({ ...successfulOrder("BUY"), symbol: cethMarket.apiSymbol });
    const view = render(<SpotOrderForm market={market} />);

    fireEvent.click(view.getByRole("tab", { name: `Sell ${market.displayBase}` }));
    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(view.getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `SELL ${market.displayBase}` }));
    await view.findByText(/-2010.*insufficient balance/);
    fireEvent.change(view.getByRole("slider", { name: "Order percentage" }), { target: { value: "50" } });
    expect((view.getByLabelText(`Total (${market.displayQuote})`) as HTMLInputElement).value).not.toBe("");

    view.rerender(<SpotOrderForm market={cethMarket} />);
    const cethPrice = view.getByLabelText(`Price (${cethMarket.displayQuote})`) as HTMLInputElement;
    const cethAmount = view.getByLabelText(`Amount (${cethMarket.displayBase})`) as HTMLInputElement;
    const cethTotal = view.getByLabelText(`Total (${cethMarket.displayQuote})`) as HTMLInputElement;
    const slider = view.getByRole("slider", { name: "Order percentage" }) as HTMLInputElement;
    await waitFor(() => {
      expect(cethPrice.value).toBe("");
      expect(cethAmount.value).toBe("");
      expect(cethTotal.value).toBe("");
      expect(slider.value).toBe("0");
      expect(view.queryByText(/insufficient balance/)).toBeNull();
      expect(view.getByText(`— ${cethMarket.displayBase}`)).toBeTruthy();
      expect(view.getByRole("tab", { name: `Buy ${cethMarket.displayBase}` }).getAttribute("aria-selected")).toBe(
        "true"
      );
    });

    fireEvent.change(cethPrice, { target: { value: "250" } });
    fireEvent.change(cethAmount, { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `BUY ${cethMarket.displayBase}` }));
    await waitFor(() => expect(mPlace).toHaveBeenCalledTimes(2));
    expect(mPlace).toHaveBeenLastCalledWith({
      symbol: "CETH-CUSD",
      side: "BUY",
      type: "LIMIT",
      price: "250",
      quantity: "1",
    });
  });

  it("ignores an old market success that settles after switching to a new market", async () => {
    let resolveOldOrder!: (order: SpotOrder) => void;
    mPlace.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOldOrder = resolve;
      })
    );
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(view.getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `BUY ${market.displayBase}` }));
    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());

    view.rerender(<SpotOrderForm market={cethMarket} />);
    const cethPrice = view.getByLabelText(`Price (${cethMarket.displayQuote})`) as HTMLInputElement;
    const cethAmount = view.getByLabelText(`Amount (${cethMarket.displayBase})`) as HTMLInputElement;
    await waitFor(() => {
      expect(cethPrice.disabled).toBe(false);
      expect(cethPrice.value).toBe("");
      expect(cethAmount.value).toBe("");
    });
    fireEvent.change(cethPrice, { target: { value: "300" } });
    fireEvent.change(cethAmount, { target: { value: "1" } });

    await act(async () => resolveOldOrder(successfulOrder("BUY")));
    expect(cethPrice.value).toBe("300");
    expect(cethAmount.value).toBe("1");
    expect(view.queryByText(/order submitted ·/)).toBeNull();
    expect((view.getByRole("button", { name: `BUY ${cethMarket.displayBase}` }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("uses market generation to ignore an old A response after switching A to B to A", async () => {
    let rejectOldOrder!: (error: Error) => void;
    let resolveNewOrder!: (order: SpotOrder) => void;
    mPlace
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectOldOrder = reject;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNewOrder = resolve;
        })
      );
    const view = render(<SpotOrderForm market={market} />);
    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(view.getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `BUY ${market.displayBase}` }));
    await waitFor(() => expect(mPlace).toHaveBeenCalledTimes(1));

    view.rerender(<SpotOrderForm market={cethMarket} />);
    await waitFor(() =>
      expect((view.getByLabelText(`Price (${cethMarket.displayQuote})`) as HTMLInputElement).disabled).toBe(false)
    );
    view.rerender(<SpotOrderForm market={market} />);
    const newPrice = view.getByLabelText(`Price (${market.displayQuote})`) as HTMLInputElement;
    const newAmount = view.getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    await waitFor(() => expect(newPrice.disabled).toBe(false));
    fireEvent.change(newPrice, { target: { value: "400" } });
    fireEvent.change(newAmount, { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `BUY ${market.displayBase}` }));
    await waitFor(() => expect(mPlace).toHaveBeenCalledTimes(2));

    await act(async () => rejectOldOrder(new SpotApiError(-2010, "stale A error")));
    expect(newPrice.value).toBe("400");
    expect(newAmount.value).toBe("1");
    expect(newPrice.disabled).toBe(true);
    expect(view.getByRole("button", { name: "Sending…" })).toBeTruthy();
    expect(view.queryByText(/stale A error/)).toBeNull();

    await act(async () => resolveNewOrder(successfulOrder("BUY")));
    await waitFor(() => {
      expect(newPrice.value).toBe("");
      expect(newAmount.value).toBe("");
      expect(view.getByText("Buy order submitted · abcdef123456…")).toBeTruthy();
    });
  });

  it("surfaces SpotApiError code and message to the user", async () => {
    mPlace.mockRejectedValue(new SpotApiError(-2010, "insufficient balance"));
    const { getByLabelText, getByRole, findByText } = render(<SpotOrderForm market={market} />);
    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `BUY ${market.displayBase}` }));

    await findByText(/-2010.*insufficient balance/);
  });
});
