import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOrderGate } from "./useOrderGate";
import { BonusOrderRejectedError } from "../../bonus/api/useBonusOrderGate";

let gate: ReturnType<typeof useOrderGate>;

function Harness() {
  gate = useOrderGate({
    symbol: "BTCUSDT",
    side: "buy",
    isOpening: true,
    marginMode: "isolated_hedge",
  });

  return (
    <div>
      <span data-testid="checking">{gate.checking ? "yes" : "no"}</span>
      {gate.rejection && <div role="alert">{gate.rejection}</div>}
      <button type="button" onClick={gate.clearRejection}>
        clear
      </button>
    </div>
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useOrderGate presentation boundary", () => {
  it("turns a bonus rejection into a visible message without rejecting the caller promise", async () => {
    const { container } = render(<Harness />);
    const view = within(container);
    let result: unknown;

    await act(async () => {
      result = await gate.runGated(() =>
        Promise.reject(new BonusOrderRejectedError("bonus_direction_restricted", "Safe backend rejection"))
      );
    });

    expect(result).toBeUndefined();
    expect(view.getByRole("alert").textContent).toBe("Safe backend rejection");
    expect(view.getByTestId("checking").textContent).toBe("no");
  });

  it("clears a displayed rejection explicitly", async () => {
    const { container } = render(<Harness />);
    const view = within(container);
    await act(async () => {
      await gate.runGated(() => Promise.reject(new BonusOrderRejectedError("blocked", "Try another side")));
    });

    fireEvent.click(view.getByRole("button", { name: "clear" }));

    expect(view.queryByRole("alert")).toBeNull();
  });

  it("clears the previous rejection as soon as a new attempt starts", async () => {
    const { container } = render(<Harness />);
    const view = within(container);
    await act(async () => {
      await gate.runGated(() => Promise.reject(new BonusOrderRejectedError("blocked", "Old rejection")));
    });
    const pendingSubmit = deferred<void>();
    let attempt!: Promise<unknown>;

    act(() => {
      attempt = gate.runGated(() => pendingSubmit.promise);
    });

    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByTestId("checking").textContent).toBe("yes");

    await act(async () => {
      pendingSubmit.resolve();
      await attempt;
    });
  });

  it("propagates non-bonus submission errors unchanged", async () => {
    render(<Harness />);
    const error = new Error("signature failed");

    await expect(gate.runGated(() => Promise.reject(error))).rejects.toBe(error);
  });

  it("does not invoke an API while wrapping a successful submission", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);

    await expect(gate.runGated(() => Promise.resolve("submitted"))).resolves.toBe("submitted");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents synchronous duplicate submissions while one attempt is pending", async () => {
    render(<Harness />);
    const pendingSubmit = deferred<void>();
    const submit = vi.fn(() => pendingSubmit.promise);
    let firstAttempt!: Promise<unknown>;
    let duplicateAttempt!: Promise<unknown>;

    act(() => {
      firstAttempt = gate.runGated(submit);
      duplicateAttempt = gate.runGated(submit);
    });

    expect(submit).toHaveBeenCalledTimes(1);
    await expect(duplicateAttempt).resolves.toBeUndefined();

    await act(async () => {
      pendingSubmit.resolve();
      await firstAttempt;
    });
  });
});
