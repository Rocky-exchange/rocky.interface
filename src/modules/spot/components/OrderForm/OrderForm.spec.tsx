import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import { SpotOrderForm } from "./OrderForm";
import { spotApi, type Account, type SpotOrder, SpotApiError } from "../../api/spotClient";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { resolveSpotMarket } from "../../model/spotMarkets";

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));
vi.mock("../../hooks/useSpotAccount", () => ({
  useSpotAccount: vi.fn(),
}));
vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      placeOrder: vi.fn(),
    },
  };
});

const mUseSpotAccount = vi.mocked(useSpotAccount);
const mPlace = vi.mocked(spotApi.placeOrder);
const mConnect = vi.mocked(openCantonConnect);
const market = resolveSpotMarket("CBTC-USDA");
const cethMarket = resolveSpotMarket("CETH-USDA");
const refetch = vi.fn();

const account: Account = {
  accountType: "SPOT",
  canTrade: true,
  canWithdraw: true,
  canDeposit: true,
  updateTime: 1,
  balances: [
    { asset: "USDCx", free: "1000", locked: "25" },
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
      { asset: "USDCx", free: quoteFree, locked: "25" },
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
});

describe("SpotOrderForm", () => {
  it("shows Limit as the active order type and exposes unsupported types as disabled", () => {
    const { getByRole } = render(<SpotOrderForm market={market} />);

    expect(getByRole("tab", { name: "Limit" }).getAttribute("aria-selected")).toBe("true");
    expect((getByRole("tab", { name: "Market" }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("tab", { name: "Limit Order" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows Connect wallet CTA and skips submit when auth is not ready", () => {
    mUseSpotAccount.mockReturnValue({ ready: false, account: null, err: null, refetch });
    const { getByRole, queryByRole } = render(<SpotOrderForm market={market} />);

    expect(queryByRole("button", { name: `BUY ${market.displayBase}` })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Connect wallet" }));
    expect(mConnect).toHaveBeenCalledOnce();
  });

  it("uses public USDA and CBTC labels for the available balance", () => {
    const { getByText, getByRole, queryByText } = render(<SpotOrderForm market={market} />);

    expect(getByText("1,000 USDA")).toBeTruthy();
    expect(queryByText(/USDCx/)).toBeNull();
    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    expect(getByText("2.5 CBTC")).toBeTruthy();
  });

  it("formats large fractional balances without losing precision or rounding up", () => {
    readyAccount(accountWith({ quoteFree: "9007199254740993.123456789" }));
    const { getByText } = render(<SpotOrderForm market={market} />);

    expect(getByText("9,007,199,254,740,993.12345678 USDA")).toBeTruthy();
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

  it("rejects manual buy and sell amounts that exceed their available balances", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const price = getByLabelText(`Price (${market.displayQuote})`);
    const amount = getByLabelText(`Amount (${market.displayBase})`);
    const buy = getByRole("button", { name: `BUY ${market.displayBase}` }) as HTMLButtonElement;

    fireEvent.change(price, { target: { value: "1000" } });
    fireEvent.change(amount, { target: { value: "1" } });
    expect(buy.disabled).toBe(true); // total plus 0.1% fee is 1001 USDA
    fireEvent.change(price, { target: { value: "999" } });
    expect(buy.disabled).toBe(false);

    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    const sell = getByRole("button", { name: `SELL ${market.displayBase}` }) as HTMLButtonElement;
    fireEvent.change(amount, { target: { value: "2.50000001" } });
    expect(sell.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: "2.5" } });
    expect(sell.disabled).toBe(false);
  });

  it("reserves the fee when sizing a 100% buy and derives total and the 0.1% fee", () => {
    const { getByLabelText, getByRole, getByText } = render(<SpotOrderForm market={market} />);

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByRole("slider", { name: "Order percentage" }), { target: { value: "100" } });

    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).value).toBe("3.99600399");
    const total = getByLabelText(`Total (${market.displayQuote})`) as HTMLInputElement;
    expect(total.value).toBe("999.0009975");
    expect(total.readOnly).toBe(true);
    expect(getByText("0.999001 USDA")).toBeTruthy();
    for (const label of ["0%", "25%", "50%", "75%", "100%"]) expect(getByText(label)).toBeTruthy();
  });

  it("sizes a sell from base balance without requiring a price", () => {
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
    expect(amount.value).toBe("9.99000999");

    fireEvent.change(price, { target: { value: "200" } });
    expect(amount.value).toBe("4.99500499");
  });

  it("keeps active percentage sizing when switching sides", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const amount = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    const slider = getByRole("slider", { name: "Order percentage" }) as HTMLInputElement;

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(slider, { target: { value: "50" } });
    expect(amount.value).toBe("1.99800199");
    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));

    expect(slider.value).toBe("50");
    expect(amount.value).toBe("1.25");
  });

  it("recalculates active percentage sizing when a polled balance falls", async () => {
    const view = render(<SpotOrderForm market={market} />);
    const amount = view.getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;

    fireEvent.change(view.getByLabelText(`Price (${market.displayQuote})`), { target: { value: "100" } });
    fireEvent.change(view.getByRole("slider", { name: "Order percentage" }), { target: { value: "100" } });
    expect(amount.value).toBe("9.99000999");

    readyAccount(accountWith({ quoteFree: "100" }));
    view.rerender(<SpotOrderForm market={market} />);
    await waitFor(() => expect(amount.value).toBe("0.99900099"));
  });

  it("sends a LIMIT BUY to the internal API symbol and clears fields on success", async () => {
    mPlace.mockResolvedValue(successfulOrder("BUY"));
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const priceInput = getByLabelText(`Price (${market.displayQuote})`) as HTMLInputElement;
    const amountInput = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "250" } });
    fireEvent.change(amountInput, { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `BUY ${market.displayBase}` }));

    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());
    expect(mPlace).toHaveBeenCalledWith({
      symbol: "CBTC-USDCX",
      side: "BUY",
      type: "LIMIT",
      price: "250",
      quantity: "1",
    });
    await waitFor(() => {
      expect(priceInput.value).toBe("");
      expect(amountInput.value).toBe("");
    });
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
        symbol: "CBTC-USDCX",
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
      expect(view.getByText("— USDA")).toBeTruthy();
      expect(view.getByRole("tab", { name: `Buy ${cethMarket.displayBase}` }).getAttribute("aria-selected")).toBe(
        "true"
      );
    });

    fireEvent.change(cethPrice, { target: { value: "250" } });
    fireEvent.change(cethAmount, { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: `BUY ${cethMarket.displayBase}` }));
    await waitFor(() => expect(mPlace).toHaveBeenCalledTimes(2));
    expect(mPlace).toHaveBeenLastCalledWith({
      symbol: "CETH-USDCX",
      side: "BUY",
      type: "LIMIT",
      price: "250",
      quantity: "1",
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
