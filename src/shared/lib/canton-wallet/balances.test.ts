import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMocks = vi.hoisted(() => ({
  fetchSendWalletHoldings: vi.fn(),
}));

vi.mock("./send", () => ({
  fetchSendWalletHoldings: sendMocks.fetchSendWalletHoldings,
}));

import {
  fetchWalletBalanceSnapshot,
  getWalletProviderLabel,
  normalizeRockyWalletBalance,
} from "./balances";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("normalizeRockyWalletBalance", () => {
  it("does not report a USDCx balance as CUSD", () => {
    const rows = normalizeRockyWalletBalance([
      {
        symbol: "USDCx",
        instrument_admin:
          "decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef",
        instrument_id: "USDCx",
        balance: "14.3357",
      },
      {
        symbol: "3574b536-cad1-4074-9b64-859398713ba0",
        instrument_admin:
          "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
        instrument_id: "3574b536-cad1-4074-9b64-859398713ba0",
        balance: "0",
      },
    ]);

    expect(rows.find((row) => row.symbol === "CUSD")?.amount).toBeNull();
  });
});

describe("Send Wallet balances", () => {
  it("loads and labels the connected Send wallet", async () => {
    localStorage.setItem("mtc_login_method", "send");
    localStorage.setItem("mtc_party", "send-user::1220send");
    sendMocks.fetchSendWalletHoldings.mockResolvedValue([
      {
        instrument_id: {
          admin: "cbtc-network::1220admin",
          id: "CBTC",
        },
        total_unlocked_coin: "2.75",
      },
    ]);

    const snapshot = await fetchWalletBalanceSnapshot();

    expect(getWalletProviderLabel("send")).toBe("Send Wallet");
    expect(snapshot).toMatchObject({
      provider: "send",
      label: "Send Wallet",
      party: "send-user::1220send",
      status: "ready",
    });
    expect(snapshot.balances.find((row) => row.symbol === "CBTC")?.amount).toBe("2.75");
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
