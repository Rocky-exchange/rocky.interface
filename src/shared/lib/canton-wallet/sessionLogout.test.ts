import { beforeEach, describe, expect, it, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
  rockyDisconnect: vi.fn<[], Promise<void>>(),
  loopDisconnect: vi.fn<[], Promise<void>>(),
  consoleDisconnect: vi.fn<[], Promise<void>>(),
}));

vi.mock("./rocky", () => ({
  rockyWalletAdapter: { disconnect: adapterMocks.rockyDisconnect },
}));
vi.mock("./loop", () => ({
  loopWalletAdapter: { disconnect: adapterMocks.loopDisconnect },
}));
vi.mock("./console", () => ({
  consoleWalletAdapter: { disconnect: adapterMocks.consoleDisconnect },
}));

import {
  disconnectCantonWalletSession,
  shouldDisconnectForRockyAccountChange,
} from "./sessionLogout";
import { CANTON_SESSION_STORAGE_KEYS } from "./sessionStore";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
  adapterMocks.rockyDisconnect.mockResolvedValue();
  adapterMocks.loopDisconnect.mockResolvedValue();
  adapterMocks.consoleDisconnect.mockResolvedValue();
});

describe("Canton wallet session logout", () => {
  it("disconnects the active provider, clears all session keys, and notifies subscribers", async () => {
    CANTON_SESSION_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, `value:${key}`));
    localStorage.setItem("mtc_login_method", "rocky");
    const changed = vi.fn();
    window.addEventListener("canton-session-change", changed);

    await disconnectCantonWalletSession();

    expect(adapterMocks.rockyDisconnect).toHaveBeenCalledTimes(1);
    expect(adapterMocks.loopDisconnect).not.toHaveBeenCalled();
    expect(CANTON_SESSION_STORAGE_KEYS.every((key) => localStorage.getItem(key) === null)).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("canton-session-change", changed);
  });

  it("coalesces concurrent logout requests", async () => {
    let releaseDisconnect: (() => void) | undefined;
    adapterMocks.rockyDisconnect.mockImplementation(
      () => new Promise<void>((resolve) => {
        releaseDisconnect = resolve;
      })
    );
    localStorage.setItem("mtc_login_method", "rocky");
    localStorage.setItem("rocky_exchange_session", "token");

    const first = disconnectCantonWalletSession();
    const second = disconnectCantonWalletSession();
    expect(adapterMocks.rockyDisconnect).toHaveBeenCalledTimes(1);

    releaseDisconnect?.();
    await Promise.all([first, second]);
    expect(adapterMocks.rockyDisconnect).toHaveBeenCalledTimes(1);
  });

  it("only logs out when the Rocky account party changes or disappears", () => {
    const party = "rockywallet-block::1220block";

    expect(shouldDisconnectForRockyAccountChange(party, { partyId: party })).toBe(false);
    expect(
      shouldDisconnectForRockyAccountChange(party, {
        partyId: "rockywallet-etouyang::1220etouyang",
      })
    ).toBe(true);
    expect(shouldDisconnectForRockyAccountChange(party, undefined)).toBe(true);
    expect(shouldDisconnectForRockyAccountChange("", undefined)).toBe(false);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}
