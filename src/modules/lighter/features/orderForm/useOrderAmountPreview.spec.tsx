// src/modules/lighter/features/orderForm/useOrderAmountPreview.spec.tsx
// RTL v11 has no renderHook — use a Harness component + explicit cleanup.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter, usePreviewErrorMessage } from "../../adapters/useOrderPreviewAdapter";
import { useOrderAmountPreview, UseOrderAmountPreviewArgs } from "./useOrderAmountPreview";

vi.mock("../../adapters/useMarketInfoAdapter", () => ({ useMarketInfoAdapter: vi.fn() }));
vi.mock("../../adapters/useOrderPreviewAdapter", () => ({
  useOrderPreviewAdapter: vi.fn(),
  usePreviewErrorMessage: vi.fn(),
}));

const mInfo = vi.mocked(useMarketInfoAdapter);
const mPreview = vi.mocked(useOrderPreviewAdapter);
const mErr = vi.mocked(usePreviewErrorMessage);

const noop = (): void => undefined;

const EMPTY_PREVIEW = { data: null, loading: false, error: null, errorCode: null } as const;

function setPreviewData(data: Record<string, string> | null) {
  mPreview.mockReturnValue(
    (data ? { data, loading: false, error: null, errorCode: null } : EMPTY_PREVIEW) as ReturnType<
      typeof useOrderPreviewAdapter
    >
  );
}

function Harness({
  args,
  onState,
}: {
  args: UseOrderAmountPreviewArgs;
  onState: (s: ReturnType<typeof useOrderAmountPreview>) => void;
}) {
  const state = useOrderAmountPreview(args);
  onState(state);
  return (
    <div>
      <span data-testid="amount">{String(state.amountNum)}</span>
      <span data-testid="ready">{state.amountReady ? "ready" : "not-ready"}</span>
      <span data-testid="cost">{String(state.costMargin)}</span>
      <span data-testid="liq">{String(state.liqPrice)}</span>
      <span data-testid="err">{String(state.previewErrorMessage)}</span>
    </div>
  );
}

const BASE_ARGS: UseOrderAmountPreviewArgs = {
  side: "buy",
  mode: "Market",
  rawSize: "",
  sizeUnit: "BASE",
  limitPrice: "",
  leverage: 10,
  marginMode: "cross",
};

beforeEach(() => {
  mInfo.mockReturnValue({ symbol: "BTC", markPrice: 100, markPriceReceivedAt: 1 } as ReturnType<
    typeof useMarketInfoAdapter
  >);
  setPreviewData(null);
  mErr.mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useOrderAmountPreview", () => {
  it("Market BASE: amount is the raw size, ready when > 0", () => {
    const { container } = render(<Harness args={{ ...BASE_ARGS, rawSize: "0.5", sizeUnit: "BASE" }} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("amount").textContent).toBe("0.5");
    expect(view.getByTestId("ready").textContent).toBe("ready");
  });

  it("Market USD: divides by mark-price snapshot", () => {
    const { container } = render(<Harness args={{ ...BASE_ARGS, rawSize: "200", sizeUnit: "USD" }} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("amount").textContent).toBe("2"); // 200 / 100
    expect(view.getByTestId("ready").textContent).toBe("ready");
  });

  it("Market USD with no price available: amount 0, not ready", () => {
    mInfo.mockReturnValue({ symbol: "BTC", markPrice: null, markPriceReceivedAt: null } as ReturnType<
      typeof useMarketInfoAdapter
    >);
    const { container } = render(<Harness args={{ ...BASE_ARGS, rawSize: "200", sizeUnit: "USD" }} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("amount").textContent).toBe("0");
    expect(view.getByTestId("ready").textContent).toBe("not-ready");
  });

  it("Limit USD: divides by the limit price (not mark price)", () => {
    mInfo.mockReturnValue({ symbol: "BTC", markPrice: 100, markPriceReceivedAt: 1 } as ReturnType<
      typeof useMarketInfoAdapter
    >);
    const { container } = render(
      <Harness
        args={{ ...BASE_ARGS, mode: "Limit", rawSize: "200", sizeUnit: "USD", limitPrice: "50" }}
        onState={noop}
      />
    );
    const view = within(container);
    expect(view.getByTestId("amount").textContent).toBe("4"); // 200 / 50
    expect(mPreview).toHaveBeenCalledWith(expect.objectContaining({ orderType: "limit", price: 50, amount: 4 }));
  });

  it("extracts costMargin / liqPrice and passes through preview error", () => {
    setPreviewData({ position_margin_after: "12.5", est_liq_price: "98765.4", est_price: "100" });
    mErr.mockReturnValue("Insufficient balance");
    const { container } = render(<Harness args={{ ...BASE_ARGS, rawSize: "1", sizeUnit: "BASE" }} onState={noop} />);
    const view = within(container);
    expect(view.getByTestId("cost").textContent).toBe("12.5");
    expect(view.getByTestId("liq").textContent).toBe("98765.4");
    expect(view.getByTestId("err").textContent).toBe("Insufficient balance");
  });
});
