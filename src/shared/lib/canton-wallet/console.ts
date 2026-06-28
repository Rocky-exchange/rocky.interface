import type { ConnectedWallet, WalletProviderAdapter } from "./types";

type ConsoleWalletTarget = "local" | "remote" | "combined";
type ConsoleWalletTransferToken = "CC" | "USDCx";

type ConsoleWalletTransferInput = {
  from?: string;
  to: string;
  token: ConsoleWalletTransferToken;
  amount: string;
  memo: string;
  waitForFinalization?: number;
};

type ConsoleWalletAcceptOffersInput = {
  party?: string;
  limit?: number;
};

export type ConsoleWalletPendingOffer = {
  amount?: string;
  coin?: string;
  createdAt?: string;
  expiredAt?: string;
  receiver?: string;
  sender?: string;
  status?: string;
  transferCid?: string;
};

type ConsoleWalletSdk = {
  CANTON_NETWORK_VARIANTS?: { CANTON_NETWORK?: string };
  consoleWallet: {
    getPrimaryAccount(): Promise<{ partyId?: string; networkId?: string } | undefined>;
    getActiveNetwork(): Promise<{ id?: string } | undefined>;
    getNodeOffers(request: {
      query: { party_id: string; limit: number; cursor: string };
      network: string;
    }): Promise<{ items?: ConsoleWalletPendingOffer[] } | null | undefined>;
    submitInstructionChoice(request: {
      transferCid: string;
      coin: string;
      choice: "Accept";
      instructionData: ConsoleWalletPendingOffer;
    }): Promise<{ status?: boolean } | undefined>;
  };
};

const CONSOLE_MAINNET_NETWORK_ID = "CANTON_NETWORK";

export async function connectConsoleWallet(): Promise<ConnectedWallet> {
  const { consoleWallet } = await import("@console-wallet/dapp-sdk");

  const target = getConsoleWalletTarget();
  if (target === "local") {
    const availability = await consoleWallet.checkExtensionAvailability();
    if (availability.status !== "installed") {
      throw new Error("Console Wallet Chrome extension not detected");
    }
  }

  const status = await consoleWallet.connect({
    name: "Rocky Exchange",
    target,
  });
  if (!status?.isConnected) {
    throw new Error(status?.reason || "Console wallet connection failed");
  }

  const account = await consoleWallet.getPrimaryAccount();
  if (!account?.partyId) {
    throw new Error("Console wallet did not return an active account");
  }
  if (account.networkId !== CONSOLE_MAINNET_NETWORK_ID) {
    throw new Error("Please switch Console Wallet to Canton mainnet");
  }

  const party = account.partyId;
  return {
    connection: {
      provider: "console",
      partyId: party,
      displayName: account.hint || `${party.slice(0, 8)}...`,
      metadata: {
        source: "console-wallet-sdk",
        target,
        networkId: account.networkId,
        publicKey: account.publicKey,
        namespace: account.namespace,
        signingProviderId: account.signingProviderId,
      },
    },
    signMessage: async (message: string) => {
      const signature = await consoleWallet.signMessage({
        message: { hex: utf8ToHex(message) },
        metaData: {
          purpose: "authentication",
          app: "Rocky Exchange",
        },
      });
      if (!signature) throw new Error("Console wallet did not return a signature");
      return signature;
    },
  };
}

export const consoleWalletAdapter: WalletProviderAdapter = {
  provider: "console",
  connect: connectConsoleWallet,
  async disconnect() {},
  async getPartyId() {
    return null;
  },
  async getAddress() {
    return null;
  },
};

export async function submitConsoleWalletTransfer(input: ConsoleWalletTransferInput) {
  const { consoleWallet } = await import("@console-wallet/dapp-sdk");
  const account = await consoleWallet.getPrimaryAccount();
  if (!account?.partyId) {
    throw new Error("Console wallet did not return an active account");
  }
  if (account.networkId !== CONSOLE_MAINNET_NETWORK_ID) {
    throw new Error("Please switch Console Wallet to Canton mainnet");
  }
  if (input.from && input.from !== account.partyId) {
    throw new Error("Console Wallet active account does not match the logged-in party");
  }

  const result = await consoleWallet.submitCommands({
    from: account.partyId,
    to: input.to,
    token: input.token,
    amount: input.amount,
    expireDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    memo: input.memo,
    waitForFinalization: input.waitForFinalization ?? 5000,
  });
  if (!result?.status) {
    throw new Error("console_wallet_transfer_failed");
  }
  return result;
}

export async function acceptConsoleWalletUsdcxOffers(
  input: ConsoleWalletAcceptOffersInput = {},
): Promise<{ acceptedCount: number }> {
  const { sdk, offers: pendingUsdcxOffers } = await loadPendingConsoleWalletUsdcxOffers(input);
  const offer = pendingUsdcxOffers[0];
  if (!offer?.transferCid) {
    return { acceptedCount: 0 };
  }

  const result = await sdk.consoleWallet.submitInstructionChoice({
    transferCid: offer.transferCid,
    coin: offer.coin || "USDCx",
    choice: "Accept",
    instructionData: offer,
  });
  if (!result?.status) {
    throw new Error("console_wallet_usdcx_accept_failed");
  }

  return { acceptedCount: 1 };
}

export async function getPendingConsoleWalletUsdcxOffers(
  input: ConsoleWalletAcceptOffersInput = {},
): Promise<{ offers: ConsoleWalletPendingOffer[] }> {
  const { offers } = await loadPendingConsoleWalletUsdcxOffers(input);
  return { offers };
}

async function loadPendingConsoleWalletUsdcxOffers(
  input: ConsoleWalletAcceptOffersInput,
): Promise<{ sdk: ConsoleWalletSdk; offers: ConsoleWalletPendingOffer[] }> {
  const sdk = (await import("@console-wallet/dapp-sdk")) as unknown as ConsoleWalletSdk;
  const account = await sdk.consoleWallet.getPrimaryAccount();
  if (!account?.partyId) {
    throw new Error("Console wallet did not return an active account");
  }
  if (account.networkId !== CONSOLE_MAINNET_NETWORK_ID) {
    throw new Error("Please switch Console Wallet to Canton mainnet");
  }
  const party = input.party || account.partyId;
  if (party !== account.partyId) {
    throw new Error("Console Wallet active account does not match the logged-in party");
  }

  const activeNetwork = await sdk.consoleWallet.getActiveNetwork();
  const network =
    activeNetwork?.id ||
    account.networkId ||
    sdk.CANTON_NETWORK_VARIANTS?.CANTON_NETWORK ||
    CONSOLE_MAINNET_NETWORK_ID;
  const response = await sdk.consoleWallet.getNodeOffers({
    query: { party_id: party, limit: input.limit ?? 50, cursor: "0" },
    network,
  });
  const offers = Array.isArray(response?.items) ? response.items : [];
  const pendingUsdcxOffers = offers.filter((offer) => {
    const coin = (offer.coin || "").trim().toUpperCase();
    const status = (offer.status || "").trim().toUpperCase();
    return (
      offer.transferCid &&
      offer.receiver === party &&
      (coin === "USDCX" || coin === "USDC") &&
      (status === "PENDING" || status === "")
    );
  });

  return { sdk, offers: pendingUsdcxOffers };
}

function getConsoleWalletTarget(): ConsoleWalletTarget {
  const configured = import.meta.env.VITE_CONSOLE_WALLET_TARGET;
  return configured === "local" || configured === "remote" || configured === "combined"
    ? configured
    : "combined";
}

function utf8ToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
