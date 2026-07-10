import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROCKY_ASSET_SYMBOLS } from "./rocky-wallet-sdk";
import { connectRockyWallet, submitRockyWalletTransfer } from "./rocky";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("rocky wallet sdk", () => {
  it("exposes CBTC through the vendored SDK", () => {
    expect(ROCKY_ASSET_SYMBOLS).toEqual(["CC", "USDCx", "CBTC"]);
  });

  it("connects with the injected local Rocky Wallet SDK provider", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;

    const wallet = await connectRockyWallet();

    expect(provider.connect).toHaveBeenCalledWith({
      name: "Rocky Exchange",
      target: "local",
    });
    expect(wallet.connection).toMatchObject({
      provider: "rocky",
      partyId: "party-1",
      displayName: "alice",
      metadata: {
        source: "rocky-wallet-sdk",
        target: "local",
        networkId: "CANTON_NETWORK",
      },
    });

    await expect(wallet.signMessage?.("sign me")).resolves.toBe("rocky-signature");
    expect(provider.signMessage).toHaveBeenCalledWith({
      message: { hex: "0x7369676e206d65" },
      metaData: {
        purpose: "authentication",
        app: "Rocky Exchange",
      },
    });
  });

  it("submits CBTC transfers through the Rocky Wallet provider", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;

    await expect(submitRockyWalletTransfer({
      from: "party-1",
      to: "Cantex::party",
      token: "CBTC",
      amount: "0.0001",
      memo: "cBTC transfer",
    })).resolves.toMatchObject({ status: true });

    expect(provider.sendTransfer).toHaveBeenCalledWith(expect.objectContaining({
      from: "party-1",
      to: "Cantex::party",
      token: "CBTC",
      amount: "0.0001",
      memo: "cBTC transfer",
    }));
  });
});

function createRockyWalletProvider() {
  return {
    isRockyWallet: true,
    version: "0.1.0",
    connect: vi.fn(async () => ({
      isConnected: true,
      account: {
        partyId: "party-1",
        displayName: "alice",
        networkId: "CANTON_NETWORK",
      },
    })),
    getPrimaryAccount: vi.fn(async () => ({
      partyId: "party-1",
      displayName: "alice",
      networkId: "CANTON_NETWORK",
    })),
    getActiveNetwork: vi.fn(async () => ({ id: "CANTON_NETWORK" })),
    getCoinsBalance: vi.fn(),
    signMessage: vi.fn(async () => "rocky-signature"),
    submitCommands: vi.fn(),
    sendTransfer: vi.fn(async () => ({ status: true, transferId: "cbtc-transfer-1" })),
    getNodeOffers: vi.fn(),
    submitInstructionChoice: vi.fn(),
  };
}

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
