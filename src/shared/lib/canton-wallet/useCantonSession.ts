import { useEffect, useSyncExternalStore } from "react";
import { getMtcAuthToken } from "./session";
import { disconnectCantonWalletSession, shouldDisconnectForRockyAccountChange } from "./sessionLogout";
import { notifyCantonSessionChange, subscribeCantonSession } from "./sessionStore";
import { subscribeRockyWalletAccountChanges } from "./rocky";
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

  useEffect(() => {
    if (!connected || provider !== "rocky" || !party) return undefined;
    return subscribeRockyWalletAccountChanges((account) => {
      if (shouldDisconnectForRockyAccountChange(party, account)) {
        void disconnectCantonWalletSession();
      }
    });
  }, [connected, party, provider]);

  return { connected, token, party, username, avatar, provider };
}
