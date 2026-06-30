import type { ConnectedWallet, WalletConnectionResult, WalletProviderAdapter } from "./types";
import { createExchangeSession } from "./session";

type RockyAuthData = {
  token?: string;
  user_id?: string;
  party?: string;
  username?: string;
  email?: string;
  wallet_preapproval_status?: string;
};

export type RockyWalletAuthMode = "login" | "register";

export type RockyWalletAuthInput = {
  mode: RockyWalletAuthMode;
  email: string;
  password: string;
  username?: string;
};

export type RockyWalletAuthResult = RockyAuthData & {
  preapprovalRequired: boolean;
};

export function createRockyConnectionFromAuth(
  data: RockyAuthData,
  source: "rocky-login" | "rocky-register" | string,
): WalletConnectionResult {
  return {
    provider: "rocky",
    userId: data.user_id,
    partyId: data.party,
    proof: data.token,
    displayName: data.username,
    email: data.email,
    metadata: { source },
  };
}

export async function connectRockyWallet(input: RockyWalletAuthInput): Promise<RockyWalletAuthResult> {
  const email = input.email.trim();
  const password = input.password;
  const username = input.username?.trim() || "";

  if (!email || !password) {
    throw new Error("Email and password are required");
  }
  if (input.mode === "register" && !username) {
    throw new Error("Username is required");
  }

  const endpoint = input.mode === "register" ? "/api/register" : "/api/auth";
  const body =
    input.mode === "register"
      ? { email, password, username }
      : { email, password };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as RockyAuthData & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || (input.mode === "register" ? "Registration failed" : "Login failed"));
  }

  if (data.user_id && data.party) {
    await createExchangeSession(
      createRockyConnectionFromAuth(
        data,
        input.mode === "register" ? "rocky-register" : "rocky-login",
      ),
    );
  }
  persistRockyAuthData(data);

  return {
    ...data,
    preapprovalRequired: data.wallet_preapproval_status === "wallet_login_required",
  };
}

function persistRockyAuthData(data: RockyAuthData) {
  if (typeof window === "undefined") return;
  if (data.token) localStorage.setItem("mtc_token", data.token);
  if (data.party) localStorage.setItem("mtc_party", data.party);
  if (data.username) localStorage.setItem("mtc_username", data.username);
  if (data.email) localStorage.setItem("mtc_email", data.email);
  if (data.user_id) localStorage.setItem("rocky_user_id", data.user_id);
  localStorage.setItem("mtc_login_method", "rocky");
}

export const rockyWalletAdapter: WalletProviderAdapter = {
  provider: "rocky",
  async connect(): Promise<ConnectedWallet> {
    throw new Error("Rocky wallet connection requires email authentication");
  },
  async disconnect() {
    return undefined;
  },
  async getPartyId() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("mtc_party");
  },
  async getAddress() {
    return null;
  },
};
