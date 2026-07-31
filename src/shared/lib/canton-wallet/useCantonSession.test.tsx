import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCantonSession } from "./useCantonSession";

function SessionProbe() {
  const session = useCantonSession();
  return (
    <output data-testid="session-state">
      {session.connected ? `connected:${session.token}` : "disconnected"}
    </output>
  );
}

describe("useCantonSession", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not report an Exchange connection for a legacy-only MTC token", () => {
    localStorage.setItem("mtc_token", "legacy-token");

    render(<SessionProbe />);

    expect(screen.getByTestId("session-state").textContent).toBe("disconnected");
  });

  it("reports the authenticated Exchange session", () => {
    localStorage.setItem("rocky_exchange_session", "exchange-token");

    render(<SessionProbe />);

    expect(screen.getByTestId("session-state").textContent).toBe(
      "connected:exchange-token"
    );
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
