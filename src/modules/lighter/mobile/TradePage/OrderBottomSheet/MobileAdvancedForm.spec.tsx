import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMobileAdvancedOrder } from "@/modules/lighter/features/orderForm/useMobileAdvancedOrder";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";

import { MobileAdvancedForm } from "./MobileAdvancedForm";

vi.mock("@/modules/lighter/features/orderForm/useMobileAdvancedOrder", () => ({
  useMobileAdvancedOrder: vi.fn(),
}));
vi.mock("@/modules/lighter/features/orderForm/useOrderInfoRows", () => ({
  useOrderInfoRows: vi.fn(),
}));

const mockUseMobileAdvancedOrder = vi.mocked(useMobileAdvancedOrder);
const mockUseOrderInfoRows = vi.mocked(useOrderInfoRows);

i18n.load("en", {});
i18n.activate("en");

beforeEach(() => {
  mockUseMobileAdvancedOrder.mockReturnValue({
    triggerPrice: "100",
    setTriggerPrice: vi.fn(),
    limitPrice: "",
    setLimitPrice: vi.fn(),
    hasLimitPrice: false,
    isTakeProfit: false,
    amount: "1",
    onAmountInput: vi.fn(),
    amountUnit: "USD",
    onUnitToggle: vi.fn(),
    pct: 10,
    onPctChange: vi.fn(),
    reduceOnly: false,
    setReduceOnly: vi.fn(),
    amountNum: 1,
    canSubmit: true,
    submitting: false,
    preview: { data: null, loading: false, error: null, errorCode: null },
    orderSizeText: "1 BTC",
    maxOrderValueText: "$100.00",
    orderValueText: "$100.00",
    previewErrorMessage: null,
    submissionRejection: "Safe backend mobile rejection",
    markPrice: 100,
    submit: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useMobileAdvancedOrder>);
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
  it("renders the safe backend submission rejection as an alert", () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <MobileAdvancedForm
          type="Stop Market"
          side="buy"
          isConnected
          leverage={10}
          marginMode="cross"
          baseSymbol="BTC"
        />
      </I18nProvider>
    );

    expect(within(container).getByRole("alert").textContent).toBe("Safe backend mobile rejection");
  });
});
