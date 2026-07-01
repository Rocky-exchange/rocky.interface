import { createRockyWalletSdk } from "./rocky-wallet-sdk";
import type { GetCoinsResponse, RockyAccount, RockyWalletSdk } from "./rocky-wallet-sdk";
import type { ConnectedWallet, WalletProviderAdapter } from "./types";

type RockyWalletTarget = "local";
type RockyWalletTransferToken = "CC" | "USDCx";

type RockyWalletTransferInput = {
  from?: string;
  to: string;
  token: RockyWalletTransferToken;
  amount: string;
  memo: string;
  waitForFinalization?: number;
};

export type RockyWalletBalanceResult = {
  party: string;
  network: string;
  balance: GetCoinsResponse;
};

const ROCKY_MAINNET_NETWORK_ID = "CANTON_NETWORK";
const ROCKY_WALLET_TARGET: RockyWalletTarget = "local";
const ROCKY_WALLET_APP_NAME = "Rocky Exchange";

export async function connectRockyWallet(): Promise<ConnectedWallet> {
  const sdk = getRockyWalletSdk();
  const availability = await sdk.checkExtensionAvailability();
  if (availability.status !== "installed") {
    throw new Error("Rocky Wallet Chrome extension not detected");
  }

  const status = await sdk.connect({
    name: ROCKY_WALLET_APP_NAME,
    target: ROCKY_WALLET_TARGET,
  });
  if (status?.isConnected === false) {
    throw new Error(status.reason || "Rocky Wallet connection failed");
  }

  const account = await resolveRockyAccount(sdk, status?.account);
  const network = await resolveRockyNetwork(sdk, account);
  assertRockyMainnet(network);

  const party = account.partyId;
  return {
    connection: {
      provider: "rocky",
      partyId: party,
      displayName: account.displayName || account.username || `${party.slice(0, 8)}...`,
      metadata: {
        source: "rocky-wallet-sdk",
        target: ROCKY_WALLET_TARGET,
        networkId: network,
        namespace: account.namespace,
        fingerprint: account.fingerprint,
        externalSigningKey: account.externalSigningKey,
      },
    },
    signMessage: async (message: string) => {
      const signature = await sdk.signMessage({
        message: { hex: utf8ToHex(message) },
        metaData: {
          purpose: "authentication",
          app: ROCKY_WALLET_APP_NAME,
        },
      });
      if (!signature) throw new Error("Rocky Wallet did not return a signature");
      return signature;
    },
  };
}

export async function submitRockyWalletTransfer(input: RockyWalletTransferInput) {
  const sdk = getRockyWalletSdk();
  const account = await resolveRockyAccount(sdk);
  const network = await resolveRockyNetwork(sdk, account);
  assertRockyMainnet(network);
  if (input.from && input.from !== account.partyId) {
    throw new Error("Rocky Wallet active account does not match the logged-in party");
  }

  const result = await sdk.sendTransfer({
    from: account.partyId,
    to: input.to,
    token: input.token,
    amount: input.amount,
    expireDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    memo: input.memo,
    waitForFinalization: input.waitForFinalization ?? 5000,
  });
  if (!result?.status) {
    throw new Error("rocky_wallet_transfer_failed");
  }
  return result;
}

export async function fetchRockyWalletBalancesFromSdk(input: {
  party?: string;
} = {}): Promise<RockyWalletBalanceResult> {
  const sdk = getRockyWalletSdk();
  const account = await resolveRockyAccount(sdk);
  const network = await resolveRockyNetwork(sdk, account);
  assertRockyMainnet(network);
  const party = input.party || account.partyId;
  if (party !== account.partyId) {
    throw new Error("Rocky Wallet active account does not match the logged-in party");
  }

  return {
    party,
    network,
    balance: await sdk.getCoinsBalance({ party, network }),
  };
}

export const rockyWalletAdapter: WalletProviderAdapter = {
  provider: "rocky",
  connect: connectRockyWallet,
  async disconnect() {
    const sdk = getRockyWalletSdk();
    await sdk.disconnect().catch(() => undefined);
  },
  async getPartyId() {
    try {
      const account = await getRockyWalletSdk().getPrimaryAccount();
      return account?.partyId || null;
    } catch (_error) {
      if (typeof window === "undefined") return null;
      return localStorage.getItem("mtc_party");
    }
  },
  async getAddress() {
    return null;
  },
  async signMessage(message: string) {
    const signature = await getRockyWalletSdk().signMessage({
      message: { hex: utf8ToHex(message) },
      metaData: {
        purpose: "authentication",
        app: ROCKY_WALLET_APP_NAME,
      },
    });
    if (!signature) throw new Error("Rocky Wallet did not return a signature");
    return signature;
  },
};

function getRockyWalletSdk(): RockyWalletSdk {
  return createRockyWalletSdk();
}

async function resolveRockyAccount(
  sdk: RockyWalletSdk,
  connectedAccount?: RockyAccount,
): Promise<RockyAccount & { partyId: string }> {
  const account = connectedAccount?.partyId ? connectedAccount : await sdk.getPrimaryAccount();
  if (!account?.partyId) {
    throw new Error("Rocky Wallet did not return an active account");
  }
  return account as RockyAccount & { partyId: string };
}

async function resolveRockyNetwork(
  sdk: RockyWalletSdk,
  account: RockyAccount,
): Promise<string> {
  const activeNetwork = await sdk.getActiveNetwork().catch(() => undefined);
  return (
    activeNetwork?.id ||
    activeNetwork?.networkId ||
    account.networkId ||
    ROCKY_MAINNET_NETWORK_ID
  );
}

function assertRockyMainnet(network: string) {
  if (network !== ROCKY_MAINNET_NETWORK_ID) {
    throw new Error("Please switch Rocky Wallet to Canton mainnet");
  }
}

function utf8ToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
