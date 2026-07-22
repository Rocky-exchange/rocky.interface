import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

function readyAccount() {
  mUseSpotAccount.mockReturnValue({ ready: true, account, err: null, refetch });
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

  it("sizes a buy from quote balance and derives total and the 0.1% fee", () => {
    const { getByLabelText, getByRole, getByText } = render(<SpotOrderForm market={market} />);

    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByRole("slider", { name: "Order size percentage" }), { target: { value: "25" } });

    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).value).toBe("1");
    const total = getByLabelText(`Total (${market.displayQuote})`) as HTMLInputElement;
    expect(total.value).toBe("250");
    expect(total.readOnly).toBe(true);
    expect(getByText("0.25 USDA")).toBeTruthy();
    for (const label of ["0%", "25%", "50%", "75%", "100%"]) expect(getByText(label)).toBeTruthy();
  });

  it("sizes a sell from base balance without requiring a price", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);

    fireEvent.click(getByRole("tab", { name: `Sell ${market.displayBase}` }));
    fireEvent.change(getByRole("slider", { name: "Order size percentage" }), { target: { value: "50" } });

    expect((getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement).value).toBe("1.25");
  });

  it("leaves buy amount empty when percentage sizing has an empty or zero price", () => {
    const { getByLabelText, getByRole } = render(<SpotOrderForm market={market} />);
    const price = getByLabelText(`Price (${market.displayQuote})`);
    const amount = getByLabelText(`Amount (${market.displayBase})`) as HTMLInputElement;
    const slider = getByRole("slider", { name: "Order size percentage" });

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
    fireEvent.change(getByRole("slider", { name: "Order size percentage" }), { target: { value: "100" } });
    expect(amount.value).toBe("10");

    fireEvent.change(price, { target: { value: "200" } });
    expect(amount.value).toBe("5");
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

  it("surfaces SpotApiError code and message to the user", async () => {
    mPlace.mockRejectedValue(new SpotApiError(-2010, "insufficient balance"));
    const { getByLabelText, getByRole, findByText } = render(<SpotOrderForm market={market} />);
    fireEvent.change(getByLabelText(`Price (${market.displayQuote})`), { target: { value: "250" } });
    fireEvent.change(getByLabelText(`Amount (${market.displayBase})`), { target: { value: "1" } });
    fireEvent.click(getByRole("button", { name: `BUY ${market.displayBase}` }));

    await findByText(/-2010.*insufficient balance/);
  });
});
