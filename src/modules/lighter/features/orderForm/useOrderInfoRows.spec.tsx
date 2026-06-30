// src/modules/lighter/features/orderForm/useOrderInfoRows.spec.tsx
// RTL v11 has no renderHook — use a Harness component + explicit cleanup.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";
import { getProjectedOrderFormPositionValue } from "./desktop/orderFormPosition";
import { useOrderInfoRows, UseOrderInfoRowsArgs } from "./useOrderInfoRows";

vi.mock("../../adapters/useAvailableBalanceAdapter", () => ({ useAvailableBalanceAdapter: vi.fn() }));
vi.mock("../../adapters/usePositionsAdapter", () => ({ usePositionsAdapter: vi.fn() }));
vi.mock("./desktop/orderFormPosition", () => ({
  getCurrentOrderFormPosition: vi.fn(() => null),
  getProjectedOrderFormPositionValue: vi.fn(() => "POS"),
}));

const mAvail = vi.mocked(useAvailableBalanceAdapter);
const mPos = vi.mocked(usePositionsAdapter);

const noop = (): void => undefined;

function previewState(data: Record<string, unknown> | null) {
  return { data, loading: false, error: null, errorCode: null } as UseOrderInfoRowsArgs["preview"];
}

function Harness({
  args,
  onState,
}: {
  args: UseOrderInfoRowsArgs;
  onState: (s: ReturnType<typeof useOrderInfoRows>) => void;
}) {
  const state = useOrderInfoRows(args);
  onState(state);
  return (
    <div>
      <span data-testid="avail">{state.availableToTrade}</span>
      <span data-testid="size">{state.orderSize}</span>
      <span data-testid="value">{state.orderValue}</span>
      <span data-testid="price">{state.estPrice}</span>
      <span data-testid="slip">{state.slippage}</span>
      <span data-testid="fees">{state.fees}</span>
    </div>
  );
}

const BASE_ARGS: UseOrderInfoRowsArgs = {
  preview: previewState(null),
  side: "buy",
  amountNum: 0,
  baseSymbol: "BTC",
};

beforeEach(() => {
  mAvail.mockReturnValue({ available: null, loading: false });
  mPos.mockReturnValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useOrderInfoRows", () => {
  it("empty preview: placeholders, slippage falls back to 0.00%/1.00%", () => {
    const { container } = render(<Harness args={BASE_ARGS} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("avail").textContent).toBe("—");
    expect(view.getByTestId("size").textContent).toBe("—");
    expect(view.getByTestId("value").textContent).toBe("—");
    expect(view.getByTestId("price").textContent).toBe("—");
    expect(view.getByTestId("slip").textContent).toBe("Est: 0.00% | Max: 1.00%");
    expect(view.getByTestId("fees").textContent).toBe("Taker: - | Maker: -");
  });

  it("formats preview fields", () => {
    const { container } = render(
      <Harness
        args={{
          ...BASE_ARGS,
          preview: previewState({
            available_balance: "1234.5",
            order_size_symbol: "0.5 BTC",
            order_value: "39870.3",
            est_price: "79740.6",
            est_slippage: "0.0012",
            max_slippage: "0.01",
            taker_fee_rate: "0.00036",
            maker_fee_rate: "0",
          }),
        }}
        onState={noop}
      />
    );
    const view = within(container);
    expect(view.getByTestId("avail").textContent).toBe("$1,234.50");
    expect(view.getByTestId("size").textContent).toBe("0.5 BTC");
    expect(view.getByTestId("value").textContent).toBe("$39,870.30");
    expect(view.getByTestId("price").textContent).toBe((79740.6).toLocaleString());
    expect(view.getByTestId("slip").textContent).toBe("Est: 0.12% | Max: 1.00%");
    expect(view.getByTestId("fees").textContent).toBe("Taker: 0.036% | Maker: 0%");
  });

  it("Available falls back to the balance adapter when preview lacks it", () => {
    mAvail.mockReturnValue({ available: 500, loading: false });
    const { container } = render(<Harness args={BASE_ARGS} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("avail").textContent).toBe("$500.00");
  });

  it("passes reduceOnly through to the position projection (defaults false)", () => {
    const mProj = vi.mocked(getProjectedOrderFormPositionValue);
    render(<Harness args={BASE_ARGS} onState={noop} />);
    expect(mProj).toHaveBeenLastCalledWith(null, "BTC", 0, "buy", false);

    mProj.mockClear();
    render(<Harness args={{ ...BASE_ARGS, reduceOnly: true }} onState={noop} />);
    expect(mProj).toHaveBeenLastCalledWith(null, "BTC", 0, "buy", true);
  });
});
