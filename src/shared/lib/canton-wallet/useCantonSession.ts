import { useEffect, useSyncExternalStore } from "react";

import { subscribeRockyWalletAccountChanges } from "./rocky";
import { getMtcAuthToken } from "./session";
import { classifyRockyAccountChange, disconnectCantonWalletSession } from "./sessionLogout";
import {
  getCantonWalletLocked,
  setCantonWalletLocked,
  subscribeCantonSession,
  subscribeCantonWalletLock,
} from "./sessionStore";
import type { WalletProviderId } from "./types";

export { notifyCantonSessionChange } from "./sessionStore";

export function useCantonSession() {
  const token = useSyncExternalStore(
    subscribeCantonSession,
    () => (typeof window !== "undefined" ? getMtcAuthToken() : ""),
    () => "",
  );
  const party = typeof window !== "undefined" ? localStorage.getItem("mtc_party") || "" : "";
  const username = typeof window !== "undefined" ? localStorage.getItem("mtc_username") || "" : "";
  const avatar = typeof window !== "undefined" ? localStorage.getItem("mtc_avatar") || "" : "";
  const storedProvider = typeof window !== "undefined" ? localStorage.getItem("mtc_login_method") || "" : "";
  const provider: WalletProviderId | "" =
    storedProvider === "rocky" || storedProvider === "loop" || storedProvider === "console" || storedProvider === "other"
      ? storedProvider
      : "";
  const connected = Boolean(token);
  const walletLocked = useSyncExternalStore(subscribeCantonWalletLock, getCantonWalletLocked, () => false);
  const locked = connected && provider === "rocky" && walletLocked;

  useEffect(() => {
    if (!connected || provider !== "rocky" || !party) return undefined;
    return subscribeRockyWalletAccountChanges((account) => {
      const change = classifyRockyAccountChange(party, account);
      if (change === "locked") {
        setCantonWalletLocked(true);
      } else if (change === "available") {
        setCantonWalletLocked(false);
      } else if (change === "account-changed") {
        void disconnectCantonWalletSession();
      }
    });
  }, [connected, party, provider]);

  return { connected, locked, token, party, username, avatar, provider };
}
