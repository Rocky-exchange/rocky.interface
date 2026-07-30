// src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderBottomSheet.spec.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import { useOrderAmountPreview } from "@/modules/lighter/features/orderForm/useOrderAmountPreview";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";
import { usePlaceOrderAdapter } from "@/modules/lighter/adapters/usePlaceOrderAdapter";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { OrderBottomSheet } from "./OrderBottomSheet";

vi.mock("@/modules/lighter/features/orderForm/useOrderAmountPreview", () => ({
  useOrderAmountPreview: vi.fn(),
}));
vi.mock("@/modules/lighter/features/orderForm/useOrderInfoRows", () => ({
  useOrderInfoRows: vi.fn(),
}));
vi.mock("@/modules/lighter/adapters/usePlaceOrderAdapter", () => ({
  usePlaceOrderAdapter: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({ useCantonSession: vi.fn() }));
vi.mock("@/modules/lighter/mobile/shared/BottomSheet", () => ({
  BottomSheet: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ),
}));
vi.mock("./MobileAdvancedForm", () => ({
  MobileAdvancedForm: () => <div data-testid="mobile-advanced-form" />,
}));

const mPreview = vi.mocked(useOrderAmountPreview);
const mInfo = vi.mocked(useOrderInfoRows);
const mPlace = vi.mocked(usePlaceOrderAdapter);
const mCantonSession = vi.mocked(useCantonSession);
const placeOrder = vi.fn().mockResolvedValue(undefined);

function previewReturn(over: Partial<ReturnType<typeof useOrderAmountPreview>> = {}) {
  return {
    amountNum: 2,
    amountReady: true,
    effectivePrice: 100,
    preview: { data: null, loading: false, error: null, errorCode: null },
    costMargin: 12.5,
    liqPrice: 98765.4,
    previewErrorMessage: null,
    ...over,
  } as ReturnType<typeof useOrderAmountPreview>;
}

beforeEach(() => {
  mPlace.mockReturnValue({ placeOrder, submitting: false } as unknown as ReturnType<typeof usePlaceOrderAdapter>);
  mCantonSession.mockReturnValue({ connected: true } as ReturnType<typeof useCantonSession>);
  mPreview.mockReturnValue(previewReturn());
  mInfo.mockReturnValue({
    availableToTrade: "$1,234.50",
    position: "-",
    orderSize: "0.5 BTC",
    orderValue: "$39,870.30",
    estPrice: "79,740.6",
    slippage: "Est: 0.12% | Max: 1.00%",
    fees: "Taker: 0.036% | Maker: 0%",
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

i18n.load("en", {});
i18n.activate("en");

function renderSheet() {
  return render(
    <I18nProvider i18n={i18n}>
      <OrderBottomSheet open side="buy" baseSymbol="BTC" onOpenChange={() => undefined} maxLeverage={50} />
    </I18nProvider>
  );
}

describe("OrderBottomSheet preview wiring", () => {
  it("renders Cost (margin) and Liquidation from the hook", () => {
    const { container } = renderSheet();
    const view = within(container);
    expect(view.getByText("$12.50")).toBeTruthy();
    expect(view.getByText("98,765.4")).toBeTruthy();
  });

  it("disables Place when amount is not ready", () => {
    mPreview.mockReturnValue(previewReturn({ amountReady: false }));
    const { container } = renderSheet();
    const view = within(container);
    const btn = view.getByRole("button", { name: /Place Long/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("disables Place and shows the message on a preview error", () => {
    mPreview.mockReturnValue(previewReturn({ previewErrorMessage: "Insufficient balance" }));
    const { container } = renderSheet();
    const view = within(container);
    expect(view.getByText("Insufficient balance")).toBeTruthy();
    const btn = view.getByRole("button", { name: /Place Long/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("submits the converted amountNum, not the raw size", () => {
    const { container } = renderSheet();
    const view = within(container);
    fireEvent.change(view.getByPlaceholderText("0.00"), { target: { value: "200" } });
    fireEvent.click(view.getByRole("button", { name: /Place Long/i }));
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 2, effectivePrice: 100 }));
  });

  it("renders the Lighter-parity info rows", () => {
    const { container } = renderSheet();
    const view = within(container);
    expect(view.getByText("Available to Trade")).toBeTruthy();
    expect(view.getByText("$1,234.50")).toBeTruthy();
    expect(view.getByText("Order Value")).toBeTruthy();
    expect(view.getByText("$39,870.30")).toBeTruthy();
    expect(view.getByText(/Taker: 0\.036% \| Maker: 0%/)).toBeTruthy();
  });

  // rocky-backend has no standalone trigger-order endpoint (/v1/trigger-orders),
  // so the Advanced order types and the order-form TP/SL inputs are gated off
  // (TRIGGER_ORDERS_ENABLED). Position-level TP/SL (POSITION_TPSL_ENABLED) is
  // live but lives on the positions table, not this sheet. When trigger orders
  // ship and the flag flips, restore the "renders the mobile-native advanced
  // form" test this replaced.
  it("hides Advanced order types and the TP/SL section while TRIGGER_ORDERS_ENABLED is off", () => {
    const { container } = renderSheet();
    const view = within(container);
    expect(view.queryByText("Advanced")).toBeNull();
    expect(view.queryByText("Take Profit / Stop Loss")).toBeNull();
    expect(view.queryByTestId("mobile-advanced-form")).toBeNull();
  });
});
