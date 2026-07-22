import { createRockyWalletSdk } from "@rocky-wallet/dapp-sdk";
import type { GetCoinsResponse, RockyAccount, RockyAssetDescriptor, RockyWalletSdk } from "@rocky-wallet/dapp-sdk";
import { getCantonFundingAsset, type CantonFundsAsset } from "./assets";
import type { ConnectedWallet, WalletProviderAdapter } from "./types";

type RockyWalletTarget = "local";
type RockyWalletTransferInput = {
  from?: string;
  to: string;
  token: CantonFundsAsset;
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
      const signature = await sdk.signLoginChallenge(message, { app: ROCKY_WALLET_APP_NAME });
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

  const asset = getCantonFundingAsset(input.token);
  const catalog = await sdk.getAssetCatalog();
  const descriptor = findRockyAssetDescriptor(catalog, input.token);
  if (!descriptor) {
    throw new Error(`Rocky Wallet ${input.token} asset is unavailable`);
  }
  const result = await sdk.transfer({
    ...(descriptor.asset_id ? { asset_id: descriptor.asset_id } : { symbol: descriptor.symbol || asset.symbol }),
    to: input.to,
    amount: input.amount,
    memo: input.memo,
  });
  if (!result?.status) {
    throw new Error("rocky_wallet_transfer_failed");
  }
  return result;
}

function findRockyAssetDescriptor(
  catalog: RockyAssetDescriptor[],
  symbol: CantonFundsAsset
): RockyAssetDescriptor | undefined {
  const asset = getCantonFundingAsset(symbol);
  if (!asset.instrumentAdmin || !asset.instrumentId) {
    return catalog.find((item) => item.symbol?.trim().toUpperCase() === "CC");
  }
  return catalog.find(
    (item) =>
      item.instrument_admin === asset.instrumentAdmin &&
      item.instrument_id?.trim().toUpperCase() === asset.instrumentId?.trim().toUpperCase()
  );
}

export async function fetchRockyWalletBalancesFromSdk(
  input: {
    party?: string;
  } = {}
): Promise<RockyWalletBalanceResult> {
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
    const signature = await getRockyWalletSdk().signLoginChallenge(message, { app: ROCKY_WALLET_APP_NAME });
    if (!signature) throw new Error("Rocky Wallet did not return a signature");
    return signature;
  },
};

function getRockyWalletSdk(): RockyWalletSdk {
  return createRockyWalletSdk();
}

async function resolveRockyAccount(
  sdk: RockyWalletSdk,
  connectedAccount?: RockyAccount
): Promise<RockyAccount & { partyId: string }> {
  const account = connectedAccount?.partyId ? connectedAccount : await sdk.getPrimaryAccount();
  if (!account?.partyId) {
    throw new Error("Rocky Wallet did not return an active account");
  }
  return account as RockyAccount & { partyId: string };
}

async function resolveRockyNetwork(sdk: RockyWalletSdk, account: RockyAccount): Promise<string> {
  const activeNetwork = await sdk.getActiveNetwork().catch(() => undefined);
  return activeNetwork?.id || activeNetwork?.networkId || account.networkId || ROCKY_MAINNET_NETWORK_ID;
}

function assertRockyMainnet(network: string) {
  if (network !== ROCKY_MAINNET_NETWORK_ID) {
    throw new Error("Please switch Rocky Wallet to Canton mainnet");
  }
}
