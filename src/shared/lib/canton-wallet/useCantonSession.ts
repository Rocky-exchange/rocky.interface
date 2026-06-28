import { useSyncExternalStore } from "react";
import { getExchangeSessionToken } from "./session";

const EVT = "canton-session-change";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
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
    () => (typeof window !== "undefined" ? getExchangeSessionToken() : ""),
    () => "",
  );
  const party = typeof window !== "undefined" ? localStorage.getItem("mtc_party") || "" : "";
  const username = typeof window !== "undefined" ? localStorage.getItem("mtc_username") || "" : "";
  return { connected: Boolean(token), token, party, username };
}
