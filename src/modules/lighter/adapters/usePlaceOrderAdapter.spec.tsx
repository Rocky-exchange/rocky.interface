import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrimitOrderSubmit } from "modules/lighter/api/custom/usePrimitOrderSubmit";
import { useTradeState } from "modules/lighter/store/TradeStateContext";

import { type PlaceOrderParams, usePlaceOrderAdapter } from "./usePlaceOrderAdapter";
import { checkBonusOrder } from "../features/bonus/api/bonus.api";
import { BonusApiError, type BonusOrderDecision } from "../features/bonus/api/bonus.types";
import { BonusOrderRejectedError, useBonusOrderGate } from "../features/bonus/api/useBonusOrderGate";

vi.mock("modules/lighter/api/custom/usePrimitOrderSubmit", () => ({ usePrimitOrderSubmit: vi.fn() }));
vi.mock("modules/lighter/store/TradeStateContext", () => ({ useTradeState: vi.fn() }));
vi.mock("../features/bonus/api/bonus.api", () => ({ checkBonusOrder: vi.fn() }));
vi.mock("../features/bonus/api/useBonusOrderGate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/bonus/api/useBonusOrderGate")>();
  return { ...actual, useBonusOrderGate: vi.fn() };
});

const mockUsePrimitOrderSubmit = vi.mocked(usePrimitOrderSubmit);
const mockUseTradeState = vi.mocked(useTradeState);
const mockUseBonusOrderGate = vi.mocked(useBonusOrderGate);
const mockCheckBonusOrder = vi.mocked(checkBonusOrder);

const submitOrder = vi.fn();
const checkOpeningOrder = vi.fn();
let adapter: ReturnType<typeof usePlaceOrderAdapter>;
let useActualBonusOrderGate: typeof useBonusOrderGate;

const baseOrder: PlaceOrderParams = {
  side: "buy",
  type: "market",
  amount: 1,
};

const passDecision: BonusOrderDecision = {
  decision: "pass",
  reason_code: "",
  message: "",
  bonus_balance: "10",
  total_available: "100",
  bonus_ratio_pct: "10",
  net_direction: "long",
};

function Harness() {
  adapter = usePlaceOrderAdapter();
  return null;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  const actual = await vi.importActual<typeof import("../features/bonus/api/useBonusOrderGate")>(
    "../features/bonus/api/useBonusOrderGate"
  );
  useActualBonusOrderGate = actual.useBonusOrderGate;
});

beforeEach(() => {
  submitOrder.mockResolvedValue({ order_id: "order-1" });
  checkOpeningOrder.mockResolvedValue(undefined);
  mockCheckBonusOrder.mockResolvedValue(passDecision);
  mockUsePrimitOrderSubmit.mockReturnValue({
    submitOrder,
    isReady: true,
  } as unknown as ReturnType<typeof usePrimitOrderSubmit>);
  mockUseTradeState.mockReturnValue({
    isTradeMode: true,
    selectedSymbol: "BTC-USD",
    setSelectedSymbol: vi.fn(),
  });
  mockUseBonusOrderGate.mockReturnValue({ checkOpeningOrder });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("usePlaceOrderAdapter bonus precheck", () => {
  it("awaits an opening BUY precheck with default leverage before submitting", async () => {
    const pendingCheck = deferred<void>();
    checkOpeningOrder.mockReturnValueOnce(pendingCheck.promise);
    render(<Harness />);

    const pendingOrder = adapter.placeOrder(baseOrder);

    expect(checkOpeningOrder).toHaveBeenCalledWith({
      symbol: "BTC-USD",
      side: "buy",
      is_opening: true,
      leverage: 10,
    });
    expect(submitOrder).not.toHaveBeenCalled();

    pendingCheck.resolve();
    await pendingOrder;

    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(checkOpeningOrder.mock.invocationCallOrder[0]).toBeLessThan(submitOrder.mock.invocationCallOrder[0]);
  });

  it("serializes synchronous calls and reports submitting until the active order settles", async () => {
    const pendingCheck = deferred<void>();
    checkOpeningOrder.mockReturnValue(pendingCheck.promise);
    render(<Harness />);
    let firstOrder!: ReturnType<typeof adapter.placeOrder>;
    let duplicateOrder!: ReturnType<typeof adapter.placeOrder>;

    act(() => {
      firstOrder = adapter.placeOrder(baseOrder);
      duplicateOrder = adapter.placeOrder(baseOrder);
    });

    expect(checkOpeningOrder).toHaveBeenCalledTimes(1);
    expect(submitOrder).not.toHaveBeenCalled();
    expect(adapter.submitting).toBe(true);

    let duplicateResult: unknown;
    await act(async () => {
      pendingCheck.resolve();
      [, duplicateResult] = await Promise.all([firstOrder, duplicateOrder]);
    });

    expect(duplicateResult).toBeUndefined();
    expect(checkOpeningOrder).toHaveBeenCalledTimes(1);
    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(adapter.submitting).toBe(false);
  });

  it("prechecks an opening SELL with lowercase side and provided leverage", async () => {
    render(<Harness />);

    await adapter.placeOrder({ ...baseOrder, side: "sell", leverage: 25 });

    expect(checkOpeningOrder).toHaveBeenCalledWith({
      symbol: "BTC-USD",
      side: "sell",
      is_opening: true,
      leverage: 25,
    });
    expect(submitOrder).toHaveBeenCalledTimes(1);
  });

  it("bypasses the precheck for reduce-only orders and still submits", async () => {
    render(<Harness />);

    await adapter.placeOrder({ ...baseOrder, reduceOnly: true });

    expect(checkOpeningOrder).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledTimes(1);
  });

  it("treats closePosition as a reduce-only closing order even when reduceOnly is omitted", async () => {
    render(<Harness />);

    await adapter.placeOrder({ ...baseOrder, closePosition: true });

    expect(checkOpeningOrder).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        isIncrease: false,
        orderType: 4,
        reduceOnly: true,
        closePosition: true,
      })
    );
  });

  it("propagates a safe bonus rejection with its code and never submits", async () => {
    mockCheckBonusOrder.mockResolvedValue({
      ...passDecision,
      decision: "reject",
      reason_code: "bonus_direction_restricted",
      message: "This opening order is restricted for trial funds",
    });
    mockUseBonusOrderGate.mockImplementation(() => useActualBonusOrderGate());
    render(<Harness />);

    const error = await adapter.placeOrder(baseOrder).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BonusOrderRejectedError);
    expect(error).toMatchObject({
      name: "BonusOrderRejectedError",
      code: "bonus_direction_restricted",
      message: "This opening order is restricted for trial funds",
    });
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("releases the submission lock after a bonus precheck rejection so the order can be retried", async () => {
    const rejection = new BonusOrderRejectedError("bonus_direction_restricted", "Trial funds cannot open this order");
    checkOpeningOrder.mockRejectedValueOnce(rejection);
    render(<Harness />);

    await act(async () => {
      await expect(adapter.placeOrder(baseOrder)).rejects.toBe(rejection);
    });
    expect(adapter.submitting).toBe(false);
    expect(submitOrder).not.toHaveBeenCalled();

    await act(async () => {
      await expect(adapter.placeOrder(baseOrder)).resolves.toEqual({ order_id: "order-1" });
    });
    expect(checkOpeningOrder).toHaveBeenCalledTimes(2);
    expect(submitOrder).toHaveBeenCalledTimes(1);
  });

  it("uses safe fallback rejection fields when the decision omits both", async () => {
    mockCheckBonusOrder.mockResolvedValue({
      ...passDecision,
      decision: "reject",
      reason_code: "",
      message: "",
    });
    mockUseBonusOrderGate.mockImplementation(() => useActualBonusOrderGate());
    render(<Harness />);

    const error = await adapter.placeOrder(baseOrder).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BonusOrderRejectedError);
    expect(error).toMatchObject({
      name: "BonusOrderRejectedError",
      code: "bonus_order_rejected",
      message: "Order is not allowed for trial funds",
    });
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("warns once without leaking precheck details and submits after an optional 5xx failure", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockCheckBonusOrder.mockRejectedValue(
      new BonusApiError("upstream included session-1", {
        status: 503,
        code: "bonus_request_failed",
        data: { raw_body: "secret upstream response" },
      })
    );
    mockUseBonusOrderGate.mockImplementation(() => useActualBonusOrderGate());
    render(<Harness />);

    await adapter.placeOrder(baseOrder);

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Bonus order precheck unavailable; ledger will enforce policy");
    expect(submitOrder).toHaveBeenCalledTimes(1);
  });

  it("returns the submitOrder result unchanged", async () => {
    const response = { order_id: "order-result", status: "new" };
    submitOrder.mockResolvedValueOnce(response);
    render(<Harness />);

    await expect(adapter.placeOrder(baseOrder)).resolves.toBe(response);
  });

  it("passes the live effective price to the shared MARKET submission boundary", async () => {
    render(<Harness />);

    await adapter.placeOrder({ ...baseOrder, side: "sell", effectivePrice: 100, maxSlippage: 0.01 });

    expect(submitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        isLong: false,
        acceptablePrice: 100n * 10n ** 30n,
        maxSlippage: "0.01",
      })
    );
  });

  it("propagates submitOrder errors unchanged", async () => {
    const error = new Error("ledger rejected the order");
    submitOrder.mockRejectedValueOnce(error);
    render(<Harness />);

    await act(async () => {
      await expect(adapter.placeOrder(baseOrder)).rejects.toBe(error);
    });
    expect(adapter.submitting).toBe(false);

    await act(async () => {
      await expect(adapter.placeOrder(baseOrder)).resolves.toEqual({ order_id: "order-1" });
    });
    expect(submitOrder).toHaveBeenCalledTimes(2);
  });

  it("fails not-ready orders before precheck or submission", async () => {
    mockUsePrimitOrderSubmit.mockReturnValue({
      submitOrder,
      isReady: false,
    } as unknown as ReturnType<typeof usePrimitOrderSubmit>);
    render(<Harness />);

    await expect(adapter.placeOrder(baseOrder)).rejects.toThrow("钱包未连接或未认证");
    await expect(adapter.placeOrder(baseOrder)).rejects.toThrow("钱包未连接或未认证");

    expect(adapter.submitting).toBe(false);
    expect(checkOpeningOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("fails missing-symbol orders before precheck or submission", async () => {
    mockUseTradeState.mockReturnValue({
      isTradeMode: true,
      selectedSymbol: null,
      setSelectedSymbol: vi.fn(),
    });
    render(<Harness />);

    await expect(adapter.placeOrder(baseOrder)).rejects.toThrow("未选择交易对");
    await expect(adapter.placeOrder(baseOrder)).rejects.toThrow("未选择交易对");

    expect(adapter.submitting).toBe(false);
    expect(checkOpeningOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("keeps checkOpeningOrder stable across rerenders", () => {
    let firstGate: ReturnType<typeof useBonusOrderGate> | undefined;
    let latestGate: ReturnType<typeof useBonusOrderGate> | undefined;
    mockUseBonusOrderGate.mockImplementation(() => {
      const gate = useActualBonusOrderGate();
      if (!firstGate) firstGate = gate;
      latestGate = gate;
      return gate;
    });
    const view = render(<Harness />);

    view.rerender(<Harness />);

    expect(latestGate?.checkOpeningOrder).toBe(firstGate?.checkOpeningOrder);
  });
});
