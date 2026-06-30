// src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderBottomSheet.spec.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import { useOrderAmountPreview } from "@/modules/lighter/features/orderForm/useOrderAmountPreview";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";
import { usePlaceOrderAdapter } from "@/modules/lighter/adapters/usePlaceOrderAdapter";
import useWallet from "@/shared/lib/wallets/useWallet";
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
vi.mock("@/shared/lib/wallets/useWallet", () => ({ default: vi.fn() }));
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
const mWallet = vi.mocked(useWallet);
const placeOrder = vi.fn().mockResolvedValue(undefined);

function previewReturn(over: Partial<ReturnType<typeof useOrderAmountPreview>> = {}) {
  return {
    amountNum: 2,
    amountReady: true,
    preview: { data: null, loading: false, error: null, errorCode: null },
    costMargin: 12.5,
    liqPrice: 98765.4,
    previewErrorMessage: null,
    ...over,
  } as ReturnType<typeof useOrderAmountPreview>;
}

beforeEach(() => {
  mPlace.mockReturnValue({ placeOrder, submitting: false } as unknown as ReturnType<typeof usePlaceOrderAdapter>);
  mWallet.mockReturnValue({ active: true, account: "0xabc" } as unknown as ReturnType<typeof useWallet>);
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
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 2 }));
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

  it("renders the mobile-native advanced form (not the desktop ltr-form) when an advanced mode is picked", () => {
    const { container } = renderSheet();
    const view = within(container);
    fireEvent.click(view.getByText("Advanced"));
    fireEvent.click(view.getByText("S/L Market"));
    expect(view.getByTestId("mobile-advanced-form")).toBeTruthy();
    expect(container.querySelector(".ltr-form")).toBeNull();
  });
});
