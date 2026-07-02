import type { WalletConnectionResult, WalletProviderId } from "./types";

type ChallengeResponse = {
  challenge_id: string;
  message: string;
};

type VerifyResponse = {
  user_id: string;
  binding_id: string;
  provider: WalletProviderId;
  party_id?: string;
  wallet_address?: string;
  session_token: string;
  expires_at: string;
};

export async function createExchangeSession(
  connection: WalletConnectionResult,
  signMessage?: (message: string) => Promise<string>,
): Promise<VerifyResponse> {
  const subject = connection.partyId || connection.walletAddress;
  if (!subject) throw new Error("Wallet did not return a party or address");

  const challenge = await postJson<ChallengeResponse>("/v1/wallet/challenge", {
    provider: connection.provider,
    user_id: connection.userId,
    party_id: connection.partyId,
    wallet_address: connection.walletAddress,
  });

  let proof: string | undefined;
  if (signMessage) {
    try {
      proof = await signMessage(challenge.message);
    } catch (err) {
      if (!connection.proof) throw err;
    }
  }
  proof = proof || connection.proof;
  if (!proof?.trim()) throw new Error("Wallet did not provide a verification proof");

  const session = await postJson<VerifyResponse>("/v1/wallet/verify", {
    challenge_id: challenge.challenge_id,
    provider: connection.provider,
    party_id: connection.partyId,
    wallet_address: connection.walletAddress,
    alias: connection.alias,
    proof,
    metadata: connection.metadata || {},
  });

  persistExchangeSession(session, connection);
  return session;
}

export function persistExchangeSession(
  session: VerifyResponse,
  connection: Pick<WalletConnectionResult, "displayName" | "email" | "alias">,
) {
  if (typeof window === "undefined") return;
  const party = session.party_id || session.wallet_address || "";
  // Keep exchange sessions separate from Rocky/browser sessions.
  // Console/Loop login does not mint or overwrite a Rocky wallet token.
  localStorage.setItem("rocky_exchange_session", session.session_token);
  localStorage.setItem("rocky_user_id", session.user_id);
  localStorage.setItem("rocky_binding_id", session.binding_id);
  localStorage.setItem("mtc_party", party);
  localStorage.setItem("mtc_username", connection.displayName || connection.alias || `${party.slice(0, 8)}...`);
  localStorage.setItem("mtc_email", connection.email || "");
  localStorage.setItem("mtc_login_method", session.provider);
}

export function getExchangeSessionToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rocky_exchange_session") || "";
}

export function getMtcAuthToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mtc_token") || getExchangeSessionToken();
}

export function mtcAuthHeaders(): HeadersInit {
  const token = getMtcAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function exchangeSessionHeaders(): HeadersInit {
  const token = getExchangeSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data as T;
}
