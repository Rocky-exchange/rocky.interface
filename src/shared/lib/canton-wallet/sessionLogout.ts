import type { RockyAccount } from "@rocky-wallet/dapp-sdk";

import { consoleWalletAdapter } from "./console";
import { loopWalletAdapter } from "./loop";
import { rockyWalletAdapter } from "./rocky";
import { clearStoredCantonSession } from "./sessionStore";
import type { WalletProviderAdapter, WalletProviderId } from "./types";

let logoutInFlight: Promise<void> | null = null;

export function disconnectCantonWalletSession(): Promise<void> {
  if (logoutInFlight) return logoutInFlight;

  logoutInFlight = (async () => {
    const provider = storedProvider();
    clearStoredCantonSession();
    try {
      await adapterForProvider(provider)?.disconnect();
    } catch (_error) {
      // Local logout must still complete when the wallet extension is unavailable.
    }
  })().finally(() => {
    logoutInFlight = null;
  });

  return logoutInFlight;
}

export type RockyAccountChange = "ignored" | "locked" | "available" | "account-changed";

export function classifyRockyAccountChange(
  currentParty: string,
  account: RockyAccount | undefined
): RockyAccountChange {
  if (!currentParty) return "ignored";
  if (!account?.partyId) return "locked";
  return account.partyId === currentParty ? "available" : "account-changed";
}

function storedProvider(): WalletProviderId | "" {
  if (typeof window === "undefined") return "";
  const provider = localStorage.getItem("mtc_login_method") || "";
  return provider === "rocky" || provider === "loop" || provider === "console" || provider === "other"
    ? provider
    : "";
}

function adapterForProvider(provider: WalletProviderId | ""): WalletProviderAdapter | undefined {
  if (provider === "rocky") return rockyWalletAdapter;
  if (provider === "loop") return loopWalletAdapter;
  if (provider === "console") return consoleWalletAdapter;
  return undefined;
}
