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
