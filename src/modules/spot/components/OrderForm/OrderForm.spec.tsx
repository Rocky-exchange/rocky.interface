// Component-layer specs for SpotOrderForm — covers the connect gate,
// submit flow, error surfacing, and the affordability guard.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { afterEach, describe, it, expect, vi } from "vitest";

import { SpotApiError, type Account } from "../../api/spotClient";

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
      placeOrder: vi.fn(),
      account: vi.fn(),
      ticker: vi.fn(),
      depth: vi.fn(),
    },
  };
});

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import { spotApi } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { SpotOrderForm } from "./OrderForm";

const mReady = vi.mocked(useSpotAuthReady);
const mPlace = vi.mocked(spotApi.placeOrder);
const mAccount = vi.mocked(spotApi.account);
const mTicker = vi.mocked(spotApi.ticker);
const mDepth = vi.mocked(spotApi.depth);
const mConnect = vi.mocked(openCantonConnect);

function accountWith(usdaFree: string, cbtcFree = "0", cethFree = "0"): Account {
  return {
    accountType: "SPOT",
    canTrade: true,
    canWithdraw: false,
    canDeposit: false,
    updateTime: 0,
    balances: [
      { asset: "USDA", free: usdaFree, locked: "0" },
      { asset: "CBTC", free: cbtcFree, locked: "0" },
      // Matches the "CETH" base OrderForm derives from the "CETH-USDA" symbol
      // (a literal symbol.split("-"), not the markets.ts display alias).
      { asset: "CETH", free: cethFree, locked: "0" },
      { asset: "CC", free: "0", locked: "0" },
    ],
    permissions: ["SPOT"],
  };
}

function stubQuietPolls() {
  // Resolve-never keeps usePolling data undefined without unhandled rejects.
  mAccount.mockImplementation(() => new Promise(() => undefined));
  mTicker.mockImplementation(() => new Promise(() => undefined));
  mDepth.mockImplementation(() => new Promise(() => undefined));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


i18n.load("en", {});
i18n.activate("en");
const I18nWrapper = ({ children }: { children?: React.ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);

describe("SpotOrderForm", () => {
  it("shows Connect wallet CTA and skips submit when auth not ready", () => {
    mReady.mockReturnValue(false);
    stubQuietPolls();
    const { getByText, queryByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    // Uppercase submit buttons are only rendered when ready; the side tabs
    // ("Buy CBTC" / "Sell CBTC") always render.
    expect(queryByText("BUY CBTC · Limit")).toBeNull();
    expect(queryByText("SELL CBTC · Limit")).toBeNull();
    fireEvent.click(getByText("Connect wallet"));
    expect(mConnect).toHaveBeenCalledOnce();
  });

  it("renders Limit and Market order-type tabs, defaulting to Limit", () => {
    mReady.mockReturnValue(true);
    stubQuietPolls();
    const { getByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    expect(getByText("Limit")).toBeTruthy();
    expect(getByText("Market")).toBeTruthy();
  });

  it("disables submit until both price and quantity are provided", () => {
    mReady.mockReturnValue(true);
    stubQuietPolls();
    const { getByPlaceholderText, getByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    const submit = getByText("BUY CBTC · Limit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(getByPlaceholderText("Limit price"), { target: { value: "65000" } });
    expect(submit.disabled).toBe(true); // still no qty
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.001" } });
    expect(submit.disabled).toBe(false);
  });

  it("sends LIMIT BUY with the entered price/qty and clears the fields on success", async () => {
    mReady.mockReturnValue(true);
    stubQuietPolls();
    mPlace.mockResolvedValue({
      symbol: "CBTC-USDA",
      orderId: "abcdef1234567890",
      clientOrderId: "cid",
      price: "65000",
      origQty: "0.001",
      executedQty: "0",
      cummulativeQuoteQty: "0",
      status: "NEW",
      timeInForce: "GTC",
      type: "LIMIT",
      side: "BUY",
    });
    const { getByPlaceholderText, getByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    const priceInput = getByPlaceholderText("Limit price") as HTMLInputElement;
    const qtyInput = getByPlaceholderText("0.1") as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "65000" } });
    fireEvent.change(qtyInput, { target: { value: "0.001" } });
    fireEvent.click(getByText("BUY CBTC · Limit"));
    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());
    expect(mPlace).toHaveBeenCalledWith({
      symbol: "CBTC-USDA",
      side: "BUY",
      type: "LIMIT",
      price: "65000",
      quantity: "0.001",
    });
    // Fields cleared after success
    await waitFor(() => {
      expect(priceInput.value).toBe("");
      expect(qtyInput.value).toBe("");
    });
  });

  it("surfaces SpotApiError code + msg to the user on submit failure", async () => {
    mReady.mockReturnValue(true);
    stubQuietPolls();
    mPlace.mockRejectedValue(new SpotApiError(-2010, "insufficient balance"));
    const { getByPlaceholderText, getByText, findByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    fireEvent.change(getByPlaceholderText("Limit price"), { target: { value: "65000" } });
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.001" } });
    fireEvent.click(getByText("BUY CBTC · Limit"));
    // "[code] msg" pattern from OrderForm's error handler
    await findByText(/-2010.*insufficient balance/);
  });

  it("blocks a BUY whose notional exceeds available quote and explains why", async () => {
    mReady.mockReturnValue(true);
    mAccount.mockResolvedValue(accountWith("100")); // 100 USDA free
    mTicker.mockImplementation(() => new Promise(() => undefined));
    const { getByPlaceholderText, getByText, findByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    // Wait for the balance row so the guard has data.
    await findByText("Available");
    fireEvent.change(getByPlaceholderText("Limit price"), { target: { value: "65000" } });
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.01" } }); // notional 650 > 100
    const submit = getByText("BUY CBTC · Limit") as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(true));
    await findByText(/Insufficient USDA/);
    expect(mPlace).not.toHaveBeenCalled();
  });

  it("allows a BUY within available quote once balances load", async () => {
    mReady.mockReturnValue(true);
    mAccount.mockResolvedValue(accountWith("1000"));
    mTicker.mockImplementation(() => new Promise(() => undefined));
    const { getByPlaceholderText, getByText, findByText } = render(<SpotOrderForm symbol="CBTC-USDA" />, { wrapper: I18nWrapper });
    await findByText("Available");
    fireEvent.change(getByPlaceholderText("Limit price"), { target: { value: "65000" } });
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.01" } }); // 650 <= 1000
    const submit = getByText("BUY CBTC · Limit") as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("switches to Market: price input hidden, submits type MARKET without price", async () => {
    mReady.mockReturnValue(true);
    mAccount.mockResolvedValue(accountWith("10000"));
    mTicker.mockImplementation(() => new Promise(() => undefined));
    mDepth.mockResolvedValue({ lastUpdateId: 1, bids: [["1900", "5"]], asks: [["2000", "5"]] });
    mPlace.mockResolvedValue({ status: "NEW", orderId: "abc123456789xyz" } as never);

    const { getByText, queryByPlaceholderText, getByPlaceholderText } = render(
      <SpotOrderForm symbol="CETH-USDA" />, { wrapper: I18nWrapper });

    fireEvent.click(getByText("Market"));
    expect(queryByPlaceholderText("Limit price")).toBeNull();

    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.5" } });
    await waitFor(() => expect(getByText("BUY CETH · Market")).not.toHaveProperty("disabled", true));
    fireEvent.click(getByText("BUY CETH · Market"));

    await waitFor(() => expect(mPlace).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MARKET", quantity: "0.5", symbol: "CETH-USDA" })));
    expect(mPlace.mock.calls[0][0]).not.toHaveProperty("price");
  });

  it("market BUY affordability uses best-ask × 1.05 cap", async () => {
    mReady.mockReturnValue(true);
    // 100 USDA available; ask 2000 → cap 2100; qty 0.05 → 105 > 100 → blocked.
    mAccount.mockResolvedValue(accountWith("100"));
    mTicker.mockImplementation(() => new Promise(() => undefined));
    mDepth.mockResolvedValue({ lastUpdateId: 1, bids: [["1900", "5"]], asks: [["2000", "5"]] });

    const { getByText, getByPlaceholderText, findByText } = render(
      <SpotOrderForm symbol="CETH-USDA" />, { wrapper: I18nWrapper });
    fireEvent.click(getByText("Market"));
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.05" } });
    await findByText(/Insufficient USDA/);
  });

  it("submits MARKET SELL without a price (notional estimate uses the bid floor, not the ask cap)", async () => {
    mReady.mockReturnValue(true);
    // 5 CETH free — plenty to cover a 0.5 qty sell.
    mAccount.mockResolvedValue(accountWith("0", "0", "5"));
    mTicker.mockImplementation(() => new Promise(() => undefined));
    mDepth.mockResolvedValue({ lastUpdateId: 1, bids: [["1900", "5"]], asks: [["2000", "5"]] });
    mPlace.mockResolvedValue({ status: "NEW", orderId: "sell-market-abc" } as never);

    const { getByText, getByPlaceholderText } = render(
      <SpotOrderForm symbol="CETH-USDA" />, { wrapper: I18nWrapper });

    fireEvent.click(getByText("Market"));
    fireEvent.click(getByText("Sell CETH"));
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.5" } });

    await waitFor(() => expect(getByText("SELL CETH · Market")).not.toHaveProperty("disabled", true));
    fireEvent.click(getByText("SELL CETH · Market"));

    await waitFor(() => expect(mPlace).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MARKET", side: "SELL", quantity: "0.5", symbol: "CETH-USDA" })));
    expect(mPlace.mock.calls[0][0]).not.toHaveProperty("price");
  });
});
