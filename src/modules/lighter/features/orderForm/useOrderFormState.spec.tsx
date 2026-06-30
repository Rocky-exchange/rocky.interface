// src/modules/lighter/features/orderForm/useOrderFormState.spec.tsx
// Note: @testing-library/react@11.2.7 does not export renderHook (added in v13+).
// Using a Harness component approach with explicit cleanup to prevent DOM bleed between tests.
import { afterEach, describe, it, expect } from "vitest";
import { render, fireEvent, screen, cleanup, within } from "@testing-library/react";
import { useOrderFormState, UseOrderFormStateArgs } from "./useOrderFormState";

afterEach(() => cleanup());

function Harness({
  args,
  onState,
}: {
  args: UseOrderFormStateArgs;
  onState: (s: ReturnType<typeof useOrderFormState>) => void;
}) {
  const state = useOrderFormState(args);
  onState(state);
  return (
    <div>
      <span data-testid="isValid">{state.isValid ? "valid" : "invalid"}</span>
      <span data-testid="mode">{state.mode}</span>
      <span data-testid="leverage">{state.leverageValue}</span>
      <button onClick={() => state.setSize("0.5")}>set-size-0.5</button>
      <button onClick={() => state.setPrice("100")}>set-price-100</button>
      <button onClick={() => state.setMode("Limit")}>set-mode-limit</button>
      <button onClick={() => state.setLeverageValue(60)}>set-lev-60</button>
    </div>
  );
}

describe("useOrderFormState", () => {
  it("initializes with defaults", () => {
    let lastState: ReturnType<typeof useOrderFormState> | undefined;
    const { container } = render(<Harness args={{ maxLeverage: 50 }} onState={(s) => (lastState = s)} />);
    const view = within(container);
    expect(view.getByTestId("mode").textContent).toBe("Market");
    expect(view.getByTestId("leverage").textContent).toBe("10");
    expect(view.getByTestId("isValid").textContent).toBe("invalid");
    expect(lastState!.errors).toContain("SIZE_EMPTY");
  });

  it("becomes valid when size is set in Market mode", () => {
    const { container } = render(<Harness args={{ maxLeverage: 50 }} onState={() => undefined} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-size-0.5"));
    expect(view.getByTestId("isValid").textContent).toBe("valid");
  });

  it("requires price for Limit mode", () => {
    const { container } = render(<Harness args={{ defaultMode: "Limit", maxLeverage: 50 }} onState={() => undefined} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-size-0.5"));
    expect(view.getByTestId("isValid").textContent).toBe("invalid");
    fireEvent.click(view.getByText("set-price-100"));
    expect(view.getByTestId("isValid").textContent).toBe("valid");
  });

  it("rejects leverage > maxLeverage", () => {
    let lastState: ReturnType<typeof useOrderFormState> | undefined;
    const { container } = render(<Harness args={{ maxLeverage: 50 }} onState={(s) => (lastState = s)} />);
    const view = within(container);
    fireEvent.click(view.getByText("set-size-0.5"));
    fireEvent.click(view.getByText("set-lev-60"));
    expect(lastState!.errors).toContain("LEVERAGE_OUT_OF_RANGE");
  });
});
