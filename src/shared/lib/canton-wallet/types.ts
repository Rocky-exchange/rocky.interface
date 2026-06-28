export type WalletProviderId = "rocky" | "loop" | "console" | "other";

export type WalletConnectionResult = {
  provider: WalletProviderId;
  userId?: string;
  partyId?: string;
  walletAddress?: string;
  alias?: string;
  proof?: string;
  metadata?: Record<string, unknown>;
  displayName?: string;
  email?: string;
};

export type ConnectedWallet = {
  connection: WalletConnectionResult;
  signMessage?: (message: string) => Promise<string>;
};

export type WalletProviderAdapter = {
  provider: WalletProviderId;
  connect(): Promise<ConnectedWallet>;
  disconnect(): Promise<void>;
  getPartyId(): Promise<string | null>;
  getAddress(): Promise<string | null>;
  signMessage?(message: string): Promise<string>;
};
