import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAvailableBalanceAdapter } from "@/modules/lighter/adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "@/modules/lighter/adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter, usePreviewErrorMessage } from "@/modules/lighter/adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "@/modules/lighter/adapters/usePlaceOrderAdapter";
import { usePositionsAdapter } from "@/modules/lighter/adapters/usePositionsAdapter";
import { BonusOrderRejectedError } from "@/modules/lighter/features/bonus/api/useBonusOrderGate";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";

import { MobileAdvancedForm } from "./MobileAdvancedForm";

vi.mock("@/modules/lighter/adapters/useAvailableBalanceAdapter", () => ({ useAvailableBalanceAdapter: vi.fn() }));
vi.mock("@/modules/lighter/adapters/useMarketInfoAdapter", () => ({ useMarketInfoAdapter: vi.fn() }));
vi.mock("@/modules/lighter/adapters/useOrderPreviewAdapter", () => ({
  useOrderPreviewAdapter: vi.fn(),
  usePreviewErrorMessage: vi.fn(),
}));
vi.mock("@/modules/lighter/adapters/usePlaceOrderAdapter", () => ({ usePlaceOrderAdapter: vi.fn() }));
vi.mock("@/modules/lighter/adapters/usePositionsAdapter", () => ({ usePositionsAdapter: vi.fn() }));
vi.mock("@/modules/lighter/features/orderForm/useOrderInfoRows", () => ({
  useOrderInfoRows: vi.fn(),
}));

const mockUseAvailableBalanceAdapter = vi.mocked(useAvailableBalanceAdapter);
const mockUseMarketInfoAdapter = vi.mocked(useMarketInfoAdapter);
const mockUseOrderPreviewAdapter = vi.mocked(useOrderPreviewAdapter);
const mockUsePreviewErrorMessage = vi.mocked(usePreviewErrorMessage);
const mockUsePlaceOrderAdapter = vi.mocked(usePlaceOrderAdapter);
const mockUsePositionsAdapter = vi.mocked(usePositionsAdapter);
const mockUseOrderInfoRows = vi.mocked(useOrderInfoRows);
const placeOrder = vi.fn().mockResolvedValue(undefined);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderForm() {
  return render(
    <I18nProvider i18n={i18n}>
      <MobileAdvancedForm type="Stop Market" side="buy" isConnected leverage={10} marginMode="cross" baseSymbol="BTC" />
    </I18nProvider>
  );
}

function makeSubmittable(container: HTMLElement) {
  const view = within(container);
  fireEvent.change(view.getByPlaceholderText("0.000000"), { target: { value: "100" } });
  fireEvent.change(view.getByPlaceholderText("0.00"), { target: { value: "200" } });
  return view.getByRole("button", { name: "Submit Order" }) as HTMLButtonElement;
}

i18n.load("en", {});
i18n.activate("en");

beforeEach(() => {
  placeOrder.mockResolvedValue(undefined);
    mockUseAvailableBalanceAdapter.mockReturnValue({
      available: 1000,
      loading: false,
      setAvailable: vi.fn(),
    });
  mockUseMarketInfoAdapter.mockReturnValue({
    symbol: "BTC",
    markPrice: 100,
    markPriceReceivedAt: 1,
  } as ReturnType<typeof useMarketInfoAdapter>);
  mockUseOrderPreviewAdapter.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    errorCode: null,
  });
  mockUsePreviewErrorMessage.mockReturnValue(null);
  mockUsePlaceOrderAdapter.mockReturnValue({
    placeOrder,
    submitting: false,
  } as unknown as ReturnType<typeof usePlaceOrderAdapter>);
  mockUsePositionsAdapter.mockReturnValue([]);
  mockUseOrderInfoRows.mockReturnValue({
    availableToTrade: "$1,000.00",
    position: "—",
    orderSize: "1 BTC",
    orderValue: "$100.00",
    estPrice: "100",
    slippage: "Est: 0.00% | Max: 1.00%",
    fees: "Taker: 0.04% | Maker: 0.01%",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MobileAdvancedForm", () => {
  it("renders a safe backend submission rejection as an alert", async () => {
    placeOrder.mockRejectedValueOnce(
      new BonusOrderRejectedError("bonus_direction_restricted", "Safe backend mobile rejection")
    );
    const { container } = renderForm();
    const view = within(container);
    const submitButton = makeSubmittable(container);

    fireEvent.click(submitButton);

    expect((await view.findByRole("alert")).textContent).toBe("Safe backend mobile rejection");
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button and ignores another click while the order is pending", async () => {
    const pendingOrder = deferred<void>();
    placeOrder.mockReturnValue(pendingOrder.promise);
    const { container } = renderForm();
    const submitButton = makeSubmittable(container);

    fireEvent.click(submitButton);

    expect(submitButton.disabled).toBe(true);
    fireEvent.click(submitButton);
    expect(placeOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingOrder.resolve();
      await pendingOrder.promise;
    });
    await waitFor(() => expect(submitButton.disabled).toBe(false));
  });
});
