import { describe, expect, it } from "vitest";

describe("formatOrderSubmitError", () => {
  it("maps Rocky Canton unsupported trigger-order responses to a stable user message", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    const orderSubmit = await import("./usePrimitOrderSubmit");

    expect(typeof (orderSubmit as any).formatOrderSubmitError).toBe("function");

    const error = new Error("Trigger orders are not supported by the Rocky Canton compat layer yet.");
    (error as any).errorData = { code: "TRIGGER_ORDERS_UNSUPPORTED" };

    expect((orderSubmit as any).formatOrderSubmitError(error)).toBe(
      "Advanced trigger orders are not available on Rocky Canton yet. Use Market/Limit orders or Close All for now."
    );
  });
});
