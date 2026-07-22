export const CANTON_SESSION_CHANGE_EVENT = "canton-session-change";

export const CANTON_SESSION_STORAGE_KEYS = [
  "rocky_exchange_session",
  "rocky_user_id",
  "rocky_binding_id",
  "rocky_perp_user_id",
  "rocky_perp_user_id_for",
  "mtc_token",
  "mtc_party",
  "mtc_username",
  "mtc_avatar",
  "mtc_email",
  "mtc_login_method",
] as const;

export function subscribeCantonSession(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CANTON_SESSION_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CANTON_SESSION_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function notifyCantonSessionChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CANTON_SESSION_CHANGE_EVENT));
  }
}

export function clearStoredCantonSession() {
  if (typeof window === "undefined") return;
  CANTON_SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  notifyCantonSessionChange();
}
