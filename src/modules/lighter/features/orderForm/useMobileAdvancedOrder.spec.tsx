// src/modules/lighter/features/orderForm/useMobileAdvancedOrder.spec.tsx
// RTL v11 has no renderHook — Harness component + explicit cleanup.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";

import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter, usePreviewErrorMessage } from "../../adapters/useOrderPreviewAdapter";
import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";
import { usePlaceOrderAdapter } from "../../adapters/usePlaceOrderAdapter";
import { useMobileAdvancedOrder, UseMobileAdvancedOrderArgs } from "./useMobileAdvancedOrder";

vi.mock("../../adapters/useMarketInfoAdapter", () => ({ useMarketInfoAdapter: vi.fn() }));
vi.mock("../../adapters/useOrderPreviewAdapter", () => ({
  useOrderPreviewAdapter: vi.fn(),
  usePreviewErrorMessage: vi.fn(),
}));
vi.mock("../../adapters/useAvailableBalanceAdapter", () => ({ useAvailableBalanceAdapter: vi.fn() }));
vi.mock("../../adapters/usePositionsAdapter", () => ({ usePositionsAdapter: vi.fn() }));
vi.mock("../../adapters/usePlaceOrderAdapter", () => ({ usePlaceOrderAdapter: vi.fn() }));

const mInfo = vi.mocked(useMarketInfoAdapter);
const mPrev = vi.mocked(useOrderPreviewAdapter);
const mErr = vi.mocked(usePreviewErrorMessage);
const mAvail = vi.mocked(useAvailableBalanceAdapter);
const mPos = vi.mocked(usePositionsAdapter);
const mPlace = vi.mocked(usePlaceOrderAdapter);
const placeOrder = vi.fn().mockResolvedValue(undefined);
const noop = (): void => undefined;

function Harness({
  args,
  onState,
}: {
  args: UseMobileAdvancedOrderArgs;
  onState: (s: ReturnType<typeof useMobileAdvancedOrder>) => void;
}) {
  const s = useMobileAdvancedOrder(args);
  onState(s);
  return (
    <div>
      <span data-testid="amount">{String(s.amountNum)}</span>
      <span data-testid="can">{s.canSubmit ? "yes" : "no"}</span>
      <button onClick={() => s.setTriggerPrice("100")}>set-trigger</button>
      <button onClick={() => s.onAmountInput("200")}>set-amt</button>
      <button onClick={() => s.setLimitPrice("50")}>set-limit</button>
      <button onClick={() => void s.submit()}>do-submit</button>
    </div>
  );
}

const BASE_ARGS: UseMobileAdvancedOrderArgs = {
  type: "Stop Market",
  side: "buy",
  leverage: 10,
  marginMode: "cross",
};

beforeEach(() => {
  mInfo.mockReturnValue({ symbol: "BTC", markPrice: 80000, markPriceReceivedAt: 1 } as ReturnType<
    typeof useMarketInfoAdapter
  >);
  mPrev.mockReturnValue({ data: null, loading: false, error: null, errorCode: null } as ReturnType<
    typeof useOrderPreviewAdapter
  >);
  mErr.mockReturnValue(null);
  mAvail.mockReturnValue({ available: 1000, loading: false });
  mPos.mockReturnValue([]);
  mPlace.mockReturnValue({ placeOrder, submitting: false } as unknown as ReturnType<typeof usePlaceOrderAdapter>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useMobileAdvancedOrder", () => {
  it("Stop Market USD: amountNum divides by trigger price; canSubmit gates on trigger+amount", () => {
    let s!: ReturnType<typeof useMobileAdvancedOrder>;
    const { container } = render(<Harness args={BASE_ARGS} onState={(x) => (s = x)} />);
    const view = within(container);
    expect(view.getByTestId("can").textContent).toBe("no");
    fireEvent.click(view.getByText("set-trigger")); // trigger 100
    fireEvent.click(view.getByText("set-amt")); // amount 200 (USD)
    expect(view.getByTestId("amount").textContent).toBe("2"); // 200 / 100
    expect(view.getByTestId("can").textContent).toBe("yes");
    expect(s.hasLimitPrice).toBe(false);
  });

  it("Stop Limit: refPrice uses the limit price; previewOrderType is limit", () => {
    const { container } = render(<Harness args={{ ...BASE_ARGS, type: "Stop Limit" }} onState={noop} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-trigger")); // 100
    fireEvent.click(view.getByText("set-limit")); // 50
    fireEvent.click(view.getByText("set-amt")); // 200 USD
    expect(view.getByTestId("amount").textContent).toBe("4"); // 200 / 50 (limit price wins)
    expect(mPrev).toHaveBeenLastCalledWith(expect.objectContaining({ orderType: "limit", price: 50 }));
  });

  it("submit() sends the mapped request type + trigger/price/timeInForce", () => {
    const { container } = render(<Harness args={{ ...BASE_ARGS, type: "Take Profit Limit" }} onState={noop} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-trigger")); // 100
    fireEvent.click(view.getByText("set-limit")); // 50
    fireEvent.click(view.getByText("set-amt")); // 200 USD -> 4
    fireEvent.click(view.getByText("do-submit"));
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "take_profit_limit",
        triggerPrice: 100,
        price: 50,
        amount: 4,
        timeInForce: "GTC",
        workingType: "MARK_PRICE",
        side: "buy",
        reduceOnly: false,
      })
    );
  });
});
