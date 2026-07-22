// Component-layer specs for SpotOrderForm — covers the connect gate,
// submit flow, and error surfacing.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import { SpotOrderForm } from "./OrderForm";
import { spotApi, SpotApiError } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { resolveSpotMarket } from "../../model/spotMarkets";

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
    },
  };
});

const mReady = vi.mocked(useSpotAuthReady);
const mPlace = vi.mocked(spotApi.placeOrder);
const mConnect = vi.mocked(openCantonConnect);
const market = resolveSpotMarket("CBTC-USDA");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotOrderForm", () => {
  it("shows Connect wallet CTA and skips submit when auth not ready", () => {
    mReady.mockReturnValue(false);
    const { getByText, queryByText } = render(<SpotOrderForm market={market} />);
    // Uppercase submit buttons are only rendered
    // when ready; the case-sensitive queries here distinguish them from the
    // title-case side-tab labels that always render.
    expect(queryByText(`BUY ${market.displayBase}`)).toBeNull();
    expect(queryByText(`SELL ${market.displayBase}`)).toBeNull();
    fireEvent.click(getByText("Connect wallet"));
    expect(mConnect).toHaveBeenCalledOnce();
  });

  it("disables submit until both price and quantity are provided", () => {
    mReady.mockReturnValue(true);
    const { getByPlaceholderText, getByText } = render(<SpotOrderForm market={market} />);
    const submit = getByText(`BUY ${market.displayBase}`) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(getByPlaceholderText("500"), { target: { value: "65000" } });
    expect(submit.disabled).toBe(true); // still no qty
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.001" } });
    expect(submit.disabled).toBe(false);
  });

  it("sends LIMIT BUY with the entered price/qty and clears the fields on success", async () => {
    mReady.mockReturnValue(true);
    mPlace.mockResolvedValue({
      symbol: "CBTC-USDCX",
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
    const { getByPlaceholderText, getByText } = render(<SpotOrderForm market={market} />);
    const priceInput = getByPlaceholderText("500") as HTMLInputElement;
    const qtyInput = getByPlaceholderText("0.1") as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "65000" } });
    fireEvent.change(qtyInput, { target: { value: "0.001" } });
    fireEvent.click(getByText(`BUY ${market.displayBase}`));
    await waitFor(() => expect(mPlace).toHaveBeenCalledOnce());
    expect(mPlace).toHaveBeenCalledWith({
      symbol: "CBTC-USDCX",
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
    mPlace.mockRejectedValue(new SpotApiError(-2010, "insufficient balance"));
    const { getByPlaceholderText, getByText, findByText } = render(<SpotOrderForm market={market} />);
    fireEvent.change(getByPlaceholderText("500"), { target: { value: "65000" } });
    fireEvent.change(getByPlaceholderText("0.1"), { target: { value: "0.001" } });
    fireEvent.click(getByText(`BUY ${market.displayBase}`));
    // "[code] msg" pattern from OrderForm's error handler
    await findByText(/-2010.*insufficient balance/);
  });
});
