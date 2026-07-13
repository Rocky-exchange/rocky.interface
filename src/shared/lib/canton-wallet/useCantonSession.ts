import { useSyncExternalStore } from "react";
import { getMtcAuthToken } from "./session";
import type { WalletProviderId } from "./types";

const EVT = "canton-session-change";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function notifyCantonSessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}

export function useCantonSession() {
  const token = useSyncExternalStore(
    subscribe,
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
  return { connected: Boolean(token), token, party, username, avatar, provider };
}
