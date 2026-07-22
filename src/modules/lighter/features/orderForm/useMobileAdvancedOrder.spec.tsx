// src/modules/lighter/features/orderForm/useMobileAdvancedOrder.spec.tsx
// RTL v11 has no renderHook — Harness component + explicit cleanup.
import { act, render, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import { useMobileAdvancedOrder, UseMobileAdvancedOrderArgs } from "./useMobileAdvancedOrder";
import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter, usePreviewErrorMessage } from "../../adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "../../adapters/usePlaceOrderAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";
import { BonusOrderRejectedError } from "../bonus/api/useBonusOrderGate";

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
      <span data-testid="submitting">{s.submitting ? "yes" : "no"}</span>
      <span data-testid="submission-rejection">{s.submissionRejection}</span>
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
const STOP_LIMIT_ARGS: UseMobileAdvancedOrderArgs = { ...BASE_ARGS, type: "Stop Limit" };
const TAKE_PROFIT_LIMIT_ARGS: UseMobileAdvancedOrderArgs = { ...BASE_ARGS, type: "Take Profit Limit" };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  placeOrder.mockResolvedValue(undefined);
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
    const { container } = render(<Harness args={STOP_LIMIT_ARGS} onState={noop} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-trigger")); // 100
    fireEvent.click(view.getByText("set-limit")); // 50
    fireEvent.click(view.getByText("set-amt")); // 200 USD
    expect(view.getByTestId("amount").textContent).toBe("4"); // 200 / 50 (limit price wins)
    expect(mPrev).toHaveBeenLastCalledWith(expect.objectContaining({ orderType: "limit", price: 50 }));
  });

  it("submit() sends the mapped request type + trigger/price/timeInForce", () => {
    const { container } = render(<Harness args={TAKE_PROFIT_LIMIT_ARGS} onState={noop} />);
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

  it("stores a bonus rejection, resolves, and releases the submission lock for retry", async () => {
    const rejection = new BonusOrderRejectedError("bonus_direction_restricted", "Safe mobile rejection");
    placeOrder.mockRejectedValueOnce(rejection);
    let state!: ReturnType<typeof useMobileAdvancedOrder>;
    const { container } = render(<Harness args={BASE_ARGS} onState={(next) => (state = next)} />);
    const view = within(container);

    await act(async () => {
      await expect(state.submit()).resolves.toBeUndefined();
    });

    expect(view.getByTestId("submission-rejection").textContent).toBe("Safe mobile rejection");
    expect(view.getByTestId("submitting").textContent).toBe("no");
    expect(placeOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      await state.submit();
    });
    expect(placeOrder).toHaveBeenCalledTimes(2);
  });

  it("clears an earlier bonus rejection when the next submission starts", async () => {
    placeOrder.mockRejectedValueOnce(new BonusOrderRejectedError("blocked", "Old mobile rejection"));
    let state!: ReturnType<typeof useMobileAdvancedOrder>;
    const { container } = render(<Harness args={BASE_ARGS} onState={(next) => (state = next)} />);
    const view = within(container);
    await act(async () => {
      await state.submit();
    });
    const pendingOrder = deferred<void>();
    placeOrder.mockReturnValueOnce(pendingOrder.promise);
    let nextAttempt!: Promise<void>;

    act(() => {
      nextAttempt = state.submit();
    });

    expect(view.getByTestId("submission-rejection").textContent).toBe("");
    expect(placeOrder).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingOrder.resolve();
      await nextAttempt;
    });
  });

  it("continues to propagate non-bonus submission errors", async () => {
    const error = new Error("signature failed");
    placeOrder.mockRejectedValueOnce(error);
    let state!: ReturnType<typeof useMobileAdvancedOrder>;
    const { container } = render(<Harness args={BASE_ARGS} onState={(next) => (state = next)} />);
    const view = within(container);

    await act(async () => {
      await expect(state.submit()).rejects.toBe(error);
    });
    expect(view.getByTestId("submitting").textContent).toBe("no");

    await act(async () => {
      await state.submit();
    });
    expect(placeOrder).toHaveBeenCalledTimes(2);
  });

  it("prevents synchronous duplicate submits and reports pending until settlement", async () => {
    const pendingOrder = deferred<void>();
    placeOrder.mockReturnValue(pendingOrder.promise);
    let state!: ReturnType<typeof useMobileAdvancedOrder>;
    const { container } = render(<Harness args={BASE_ARGS} onState={(next) => (state = next)} />);
    const view = within(container);
    let firstAttempt!: Promise<void>;
    let duplicateAttempt!: Promise<void>;

    act(() => {
      firstAttempt = state.submit();
      duplicateAttempt = state.submit();
    });

    expect(placeOrder).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("submitting").textContent).toBe("yes");
    await expect(duplicateAttempt).resolves.toBeUndefined();

    await act(async () => {
      pendingOrder.resolve();
      await firstAttempt;
    });
    expect(view.getByTestId("submitting").textContent).toBe("no");
  });
});
