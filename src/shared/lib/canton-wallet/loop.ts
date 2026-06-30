import type { ConnectedWallet, WalletProviderAdapter } from "./types";

type LoopProvider = {
  party_id: string;
  public_key?: string;
  email?: string;
  getAuthToken(): string;
  getHolding(): Promise<LoopHolding[]>;
  getActiveContracts?(params?: {
    templateId?: string;
    interfaceId?: string;
  }): Promise<unknown[]>;
  transfer(
    recipient: string,
    amount: string | number,
    instrument?: LoopInstrumentSpec,
    options?: LoopTransferOptions,
  ): Promise<unknown>;
  signMessage(message: string): Promise<unknown>;
};

type LoopInstrumentId = {
  admin?: string;
  id?: string;
};

type LoopHolding = {
  instrument_id?: LoopInstrumentId;
  symbol?: string;
  org_name?: string;
  total_unlocked_coin?: string;
  total_locked_coin?: string;
};

type LoopInstrumentSpec = {
  instrument_admin?: string;
  instrument_id: string;
};

type LoopTransferOptions = {
  requestedAt?: string | Date;
  executeBefore?: string | Date;
  requestTimeout?: number;
  memo?: string;
  message?: string;
  executionMode?: "async" | "wait";
  estimateTraffic?: boolean;
  deduplicationPeriod?: { seconds: number; nanos?: number } | { empty: true };
};

type LoopSdk = {
  loop: {
    init(config: {
      appName: string;
      network: "mainnet";
      options: { openMode: "popup"; requestSigningMode: "popup" };
      onAccept(provider: LoopProvider): void;
      onReject(): void;
    }): void;
    autoConnect(): Promise<void>;
    connect(): Promise<void>;
  };
};

type LoopWalletTransferToken = "CC" | "USDCx";

type LoopWalletTransferInput = {
  from?: string;
  to: string;
  token: LoopWalletTransferToken;
  amount: string;
  memo: string;
  message?: string;
  requestTimeout?: number;
};

const LOOP_TRANSFER_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const LOOP_AMULET_TEMPLATE_ID = "#splice-amulet:Splice.Amulet:Amulet";
const LOOP_HOLDING_INTERFACE_ID =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const LOOP_STALE_HOLDING_RETRY_DELAY_MS = 750;

export async function connectLoopWallet(): Promise<ConnectedWallet> {
  const { loop } = await import("@fivenorth/loop-sdk");

  return new Promise<ConnectedWallet>((resolve, reject) => {
    let settled = false;
    const finish = (result: ConnectedWallet) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error("Loop wallet connect failed"));
    };

    loop.init({
      appName: "Rocky Exchange",
      network: "mainnet",
      options: { openMode: "popup", requestSigningMode: "popup" },
      onAccept: (provider: LoopProvider) => {
        const party = provider.party_id;
        const authToken = provider.getAuthToken() || undefined;
        finish({
          connection: {
            provider: "loop",
            partyId: party,
            proof: authToken,
            displayName: provider.email || `${party.slice(0, 8)}...`,
            email: provider.email || "",
            metadata: {
              source: "loop-sdk",
              network: "mainnet",
              auth: authToken,
              authToken,
              publicKey: provider.public_key,
            },
          },
          signMessage: async (message: string) => stringifyProof(await provider.signMessage(message)),
        });
      },
      onReject: () => fail(new Error("Loop wallet connection rejected")),
    });

    loop.connect().catch(fail);
  });
}

export const loopWalletAdapter: WalletProviderAdapter = {
  provider: "loop",
  connect: connectLoopWallet,
  async disconnect() {
    return undefined;
  },
  async getPartyId() {
    return null;
  },
  async getAddress() {
    return null;
  },
};

export async function submitLoopWalletTransfer(input: LoopWalletTransferInput): Promise<unknown> {
  const provider = await getConnectedLoopProvider();
  if (input.from && provider.party_id && input.from !== provider.party_id) {
    throw new Error("Loop Wallet active account does not match the logged-in party");
  }

  const submit = async () => {
    const holdings = await refreshLoopWalletHoldings(provider, input.token);
    const instrument = findLoopWalletInstrument(holdings, input.token);
    return provider.transfer(input.to, input.amount, instrument, {
      memo: input.memo,
      message: input.message || `Deposit ${input.amount} ${input.token} to Rocky Exchange`,
      executionMode: "wait",
      requestTimeout: input.requestTimeout ?? LOOP_TRANSFER_REQUEST_TIMEOUT_MS,
      estimateTraffic: true,
      deduplicationPeriod: { seconds: 60 },
    });
  };

  try {
    return await submit();
  } catch (error) {
    if (!isStaleLoopHoldingError(error)) throw error;
    await delay(LOOP_STALE_HOLDING_RETRY_DELAY_MS);
    return submit();
  }
}

function stringifyProof(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) throw new Error("Loop wallet did not return a signature");
  return JSON.stringify(value);
}

async function getConnectedLoopProvider(): Promise<LoopProvider> {
  const sdk = (await import("@fivenorth/loop-sdk")) as unknown as LoopSdk;

  return new Promise<LoopProvider>((resolve, reject) => {
    let settled = false;
    const finish = (provider: LoopProvider) => {
      if (settled) return;
      settled = true;
      resolve(provider);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("Loop wallet connection failed"));
    };

    sdk.loop.init({
      appName: "Rocky Exchange",
      network: "mainnet",
      options: { openMode: "popup", requestSigningMode: "popup" },
      onAccept: finish,
      onReject: () => fail(new Error("Loop wallet connection rejected")),
    });

    sdk.loop.autoConnect().then(() => {
      if (settled) return;
      sdk.loop.connect().catch(fail);
    }, () => {
      sdk.loop.connect().catch(fail);
    });
  });
}

async function refreshLoopWalletHoldings(
  provider: LoopProvider,
  token: LoopWalletTransferToken,
): Promise<LoopHolding[]> {
  await refreshActiveContracts(provider, token);
  return provider.getHolding();
}

async function refreshActiveContracts(
  provider: LoopProvider,
  token: LoopWalletTransferToken,
): Promise<void> {
  if (!provider.getActiveContracts) return;
  if (token === "CC") {
    await provider.getActiveContracts({ templateId: LOOP_AMULET_TEMPLATE_ID });
    return;
  }
  await provider.getActiveContracts({ interfaceId: LOOP_HOLDING_INTERFACE_ID });
}

function findLoopWalletInstrument(
  holdings: LoopHolding[],
  token: LoopWalletTransferToken,
): LoopInstrumentSpec {
  const holding = holdings.find((item) => loopHoldingMatchesToken(item, token));
  const instrument = holding?.instrument_id;
  if (!instrument?.id) {
    throw new Error(`Loop Wallet ${token} holding not found`);
  }
  return {
    instrument_admin: instrument.admin,
    instrument_id: instrument.id,
  };
}

function loopHoldingMatchesToken(holding: LoopHolding, token: LoopWalletTransferToken): boolean {
  const values = [
    holding.symbol,
    holding.org_name,
    holding.instrument_id?.id,
  ].map(normalizeLoopTokenText);

  if (token === "USDCx") {
    return values.some((value) => value === "usdcx" || value === "usdc");
  }
  return values.some(
    (value) => value === "cc" || value === "amulet" || value === "cantoncoin",
  );
}

function normalizeLoopTokenText(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isStaleLoopHoldingError(error: unknown): boolean {
  const details = describeLoopError(error);
  return (
    /archiv|not active|inactive|contract.*not found|contract_not_found|invalid_contract_id/i.test(
      details,
    ) || /Splice\.Amulet:Amulet/i.test(details)
  );
}

function describeLoopError(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join(" ");
  }
  if (typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch (_error) {
      return String(error);
    }
  }
  return String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
