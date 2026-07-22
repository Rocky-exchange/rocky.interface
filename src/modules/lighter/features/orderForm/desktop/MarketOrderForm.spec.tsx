import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAvailableBalanceAdapter } from "../../../adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "../../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter, usePreviewErrorMessage } from "../../../adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "../../../adapters/usePlaceOrderAdapter";
import { usePositionsAdapter } from "../../../adapters/usePositionsAdapter";
import { MarketOrderForm } from "./MarketOrderForm";
import { useOrderGate } from "./useOrderGate";

vi.mock("../../../adapters/useAvailableBalanceAdapter", () => ({ useAvailableBalanceAdapter: vi.fn() }));
vi.mock("../../../adapters/useMarketInfoAdapter", () => ({ useMarketInfoAdapter: vi.fn() }));
vi.mock("../../../adapters/useOrderPreviewAdapter", () => ({
  useOrderPreviewAdapter: vi.fn(),
  usePreviewErrorMessage: vi.fn(),
}));
vi.mock("../../../adapters/usePlaceOrderAdapter", () => ({ usePlaceOrderAdapter: vi.fn() }));
vi.mock("../../../adapters/usePositionsAdapter", () => ({ usePositionsAdapter: vi.fn() }));
vi.mock("./useOrderGate", () => ({ useOrderGate: vi.fn() }));

const placeOrder = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.mocked(useAvailableBalanceAdapter).mockReturnValue({ available: 1_000 } as ReturnType<
    typeof useAvailableBalanceAdapter
  >);
  vi.mocked(useMarketInfoAdapter).mockReturnValue({ symbol: "BTC", markPrice: 100 } as ReturnType<
    typeof useMarketInfoAdapter
  >);
  vi.mocked(useOrderPreviewAdapter).mockReturnValue({
    data: null,
    loading: false,
    error: null,
    errorCode: null,
  });
  vi.mocked(usePreviewErrorMessage).mockReturnValue(null);
  vi.mocked(usePlaceOrderAdapter).mockReturnValue({
    placeOrder,
    submitting: false,
    isReady: true,
  } as unknown as ReturnType<typeof usePlaceOrderAdapter>);
  vi.mocked(usePositionsAdapter).mockReturnValue([]);
  vi.mocked(useOrderGate).mockReturnValue({
    checking: false,
    rejection: null,
    clearRejection: vi.fn(),
    runGated: async <T,>(submit: () => T | Promise<T>) => submit(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

i18n.load("en", {});
i18n.activate("en");

describe("MarketOrderForm order propagation", () => {
  it("passes its live effective market price to placeOrder", async () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <MarketOrderForm side="buy" isConnected leverage={10} marginMode="cross" />
      </I18nProvider>
    );
    const view = within(container);

    await waitFor(() => expect(view.getByRole("button", { name: /Buy \/ Long/i })).toBeTruthy());
    fireEvent.change(view.getByPlaceholderText("0.00"), { target: { value: "200" } });
    fireEvent.click(view.getByRole("button", { name: /Buy \/ Long/i }));

    await waitFor(() =>
      expect(placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: "market", amount: 2, effectivePrice: 100 })
      )
    );
  });
});
