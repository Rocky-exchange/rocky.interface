import { exchangeSessionHeaders } from "./session";
import { notifyCantonSessionChange } from "./useCantonSession";

export type SetDisplayNameErrorCode = "name_taken" | "invalid_name" | "unauthorized" | "unknown";

export class SetDisplayNameError extends Error {
  code: SetDisplayNameErrorCode;
  status: number;
  constructor(code: SetDisplayNameErrorCode, status: number, message: string) {
    super(message);
    this.name = "SetDisplayNameError";
    this.code = code;
    this.status = status;
  }
}

function mapErrorCode(status: number): SetDisplayNameErrorCode {
  if (status === 409) return "name_taken";
  if (status === 400) return "invalid_name";
  if (status === 401) return "unauthorized";
  return "unknown";
}

export type SetDisplayNameResult = {
  party_id: string;
  display_name: string;
};

/**
 * Set the current session's public display name. On success the value is written
 * back to localStorage (mtc_username) and the canton session is notified so the
 * top nav / funds modal refresh immediately.
 */
export async function setDisplayName(name: string): Promise<SetDisplayNameResult> {
  const res = await fetch("/v1/profile/name", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...exchangeSessionHeaders(),
    },
    body: JSON.stringify({ display_name: name }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`;
    throw new SetDisplayNameError(mapErrorCode(res.status), res.status, message);
  }

  const result = data as SetDisplayNameResult;
  if (typeof window !== "undefined" && result.display_name) {
    localStorage.setItem("mtc_username", result.display_name);
    notifyCantonSessionChange();
  }
  return result;
}

export type SetAvatarErrorCode = "invalid_avatar" | "unauthorized" | "unknown";

export class SetAvatarError extends Error {
  code: SetAvatarErrorCode;
  status: number;
  constructor(code: SetAvatarErrorCode, status: number, message: string) {
    super(message);
    this.name = "SetAvatarError";
    this.code = code;
    this.status = status;
  }
}

export type SetAvatarResult = {
  party_id: string;
  avatar: string | null;
};

/**
 * Set (or clear, with null) the current session's avatar. Expects a small
 * data:image/... URL — see fileToAvatarDataUrl. On success the value is written
 * back to localStorage (mtc_avatar) and the canton session is notified.
 */
export async function setAvatar(avatar: string | null): Promise<SetAvatarResult> {
  const res = await fetch("/v1/profile/avatar", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...exchangeSessionHeaders(),
    },
    body: JSON.stringify({ avatar }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`;
    const code: SetAvatarErrorCode =
      res.status === 400 ? "invalid_avatar" : res.status === 401 ? "unauthorized" : "unknown";
    throw new SetAvatarError(code, res.status, message);
  }

  const result = data as SetAvatarResult;
  if (typeof window !== "undefined") {
    if (result.avatar) {
      localStorage.setItem("mtc_avatar", result.avatar);
    } else {
      localStorage.removeItem("mtc_avatar");
    }
    notifyCantonSessionChange();
  }
  return result;
}

/**
 * Batch-resolve party ids to their avatars. Only parties that have set an
 * avatar appear in the returned map.
 */
export async function resolveAvatars(parties: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(parties.filter(Boolean)));
  if (unique.length === 0) return {};

  const res = await fetch("/v1/profile/avatars", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ parties: unique }),
  });

  if (!res.ok) return {};
  const data = await res.json().catch(() => ({}));
  const avatars = data?.avatars;
  return avatars && typeof avatars === "object" ? (avatars as Record<string, string>) : {};
}

/**
 * Pull the connected party's server-side profile (custom name + avatar) into
 * localStorage so the UI reflects it after a fresh login or on another device.
 * Never throws — profile hydration must not break the login flow.
 */
export async function hydrateOwnProfile(): Promise<void> {
  if (typeof window === "undefined") return;
  const party = localStorage.getItem("mtc_party") || "";
  if (!party) return;

  try {
    const [names, avatars] = await Promise.all([resolveNames([party]), resolveAvatars([party])]);
    const name = names[party];
    if (name) localStorage.setItem("mtc_username", name);
    const avatar = avatars[party];
    if (avatar) {
      localStorage.setItem("mtc_avatar", avatar);
    } else {
      localStorage.removeItem("mtc_avatar");
    }
    notifyCantonSessionChange();
  } catch (_error) {
    // Ignore — cosmetic data only.
  }
}

/**
 * Batch-resolve party ids to their public display names. Only parties that have
 * set a name appear in the returned map.
 */
export async function resolveNames(parties: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(parties.filter(Boolean)));
  if (unique.length === 0) return {};

  const res = await fetch("/v1/profile/names", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ parties: unique }),
  });

  if (!res.ok) return {};
  const data = await res.json().catch(() => ({}));
  const names = data?.names;
  return names && typeof names === "object" ? (names as Record<string, string>) : {};
}
