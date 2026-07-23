import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketOrderForm } from "./MarketOrderForm";

vi.mock("../../../adapters/useAvailableBalanceAdapter", () => ({
  useAvailableBalanceAdapter: () => ({ available: null, loading: false }),
}));
vi.mock("../../../adapters/useMarketInfoAdapter", () => ({
  useMarketInfoAdapter: () => ({ symbol: "BTC", markPrice: null }),
}));
vi.mock("../../../adapters/useOrderPreviewAdapter", () => ({
  useOrderPreviewAdapter: () => ({
    data: null,
    loading: false,
    error: null,
    errorCode: null,
  }),
  usePreviewErrorMessage: () => null,
}));
vi.mock("../../../adapters/usePlaceOrderAdapter", () => ({
  usePlaceOrderAdapter: () => ({ placeOrder: vi.fn(), submitting: false }),
}));
vi.mock("../../../adapters/usePositionsAdapter", () => ({
  usePositionsAdapter: () => [],
}));
vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

i18n.load("en", {});
i18n.activate("en");

afterEach(cleanup);

describe("MarketOrderForm", () => {
  it("shows zero instead of a dash when available balance has not loaded", () => {
    const view = render(
      <I18nProvider i18n={i18n}>
        <MarketOrderForm side="buy" isConnected={false} leverage={10} marginMode="cross" />
      </I18nProvider>,
    );

    const row = view.getByText("Available to Trade").closest(".ltr-form__row");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("0")).toBeTruthy();
    expect(within(row as HTMLElement).queryByText("-")).toBeNull();
  });
});
