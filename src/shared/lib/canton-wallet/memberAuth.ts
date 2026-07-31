import { submitConsoleWalletTransaction } from "./console";
import { submitLoopWalletTransaction } from "./loop";
import { signRockyPreparedTransactionHash } from "./rocky";
import {
  submitSendWalletTransaction,
  type SendCantonTransactionRequest,
} from "./send";
import { exchangeSessionHeaders } from "./session";
import type { WalletProviderId } from "./types";

type MemberAuthState = {
  authorized: boolean;
  partyId: string;
  memberAuthContractId?: string | null;
  proposalContractId?: string | null;
};

type MemberAuthTransaction = SendCantonTransactionRequest & {
  commandId: string;
  actAs: string[];
  readAs: string[];
  disclosedContracts: NonNullable<SendCantonTransactionRequest["disclosedContracts"]>;
  synchronizerId: string;
  packageIdSelectionPreference: string[];
};

type MemberAuthProposal = MemberAuthState & {
  transaction?: MemberAuthTransaction | null;
};

type PreparedMemberAuth = {
  commandId: string;
  preparedTransactionHash: string;
  hashingSchemeVersion: string;
};

const authorizedParties = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const STATUS_RETRIES = 6;
const STATUS_RETRY_DELAY_MS = 400;

export async function ensureSpotMemberAuth(input: {
  provider: WalletProviderId | "";
  party: string;
}): Promise<void> {
  if (
    input.provider !== "rocky" &&
    input.provider !== "loop" &&
    input.provider !== "console" &&
    input.provider !== "send"
  ) {
    throw new Error("Reconnect with Rocky, Loop, Console, or Send Wallet before trading spot");
  }
  const party = input.party.trim();
  if (!party) throw new Error("Connected wallet did not provide a Canton party");
  const cacheKey = `${input.provider}:${party}`;
  if (authorizedParties.has(cacheKey)) return;

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const request = authorize(input.provider, party)
    .then(() => {
      authorizedParties.add(cacheKey);
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, request);
  return request;
}

async function authorize(
  provider: "rocky" | "loop" | "console" | "send",
  party: string,
): Promise<void> {
  const current = await request<MemberAuthState>("/v1/spot-chain/member-auth");
  assertParty(current, party);
  if (current.authorized) return;

  const proposal = await request<MemberAuthProposal>(
    "/v1/spot-chain/member-auth/proposal",
    { method: "POST" },
  );
  assertParty(proposal, party);
  if (proposal.authorized) return;

  if (provider === "rocky") {
    await authorizeRocky(party);
  } else {
    const transaction = proposal.transaction;
    if (!transaction) {
      throw new Error("Spot settlement authorization did not return an accept transaction");
    }
    if (provider === "loop") {
      await submitLoopWalletTransaction(transaction);
    } else if (provider === "console") {
      await submitConsoleWalletTransaction(transaction);
    } else {
      await submitSendWalletTransaction(transaction);
    }
  }

  for (let attempt = 0; attempt < STATUS_RETRIES; attempt += 1) {
    const status = await request<MemberAuthState>("/v1/spot-chain/member-auth");
    assertParty(status, party);
    if (status.authorized) return;
    await delay(STATUS_RETRY_DELAY_MS);
  }
  throw new Error("Spot settlement authorization was signed but is not active yet");
}

async function authorizeRocky(party: string): Promise<void> {
  const prepared = await request<PreparedMemberAuth>(
    "/v1/spot-chain/member-auth/prepare",
    { method: "POST" },
  );
  const signature = await signRockyPreparedTransactionHash(
    prepared.preparedTransactionHash,
    party,
  );
  const status = await request<MemberAuthState>(
    "/v1/spot-chain/member-auth/execute",
    {
      method: "POST",
      body: JSON.stringify({ signature }),
    },
  );
  assertParty(status, party);
  if (!status.authorized) {
    throw new Error("Rocky Wallet authorization did not create MemberAuth");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...exchangeSessionHeaders(),
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || `Spot settlement authorization failed (${response.status})`);
  }
  return body as T;
}

function assertParty(state: MemberAuthState, party: string): void {
  if (state.partyId !== party) {
    throw new Error("MemberAuth response does not match the connected wallet");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearSpotMemberAuthCache(): void {
  authorizedParties.clear();
  inFlight.clear();
}
