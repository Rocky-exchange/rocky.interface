import { fetchRockyWalletBalancesFromSdk } from "./rocky";
import type { WalletProviderId } from "./types";
import { CANTON_FUNDING_ASSETS, walletFacingAssetSymbol, type CantonFundsAsset } from "./assets";

export type WalletBalanceStatus = "ready" | "disconnected" | "unavailable" | "error";

export type WalletBalanceRow = {
  symbol: CantonFundsAsset;
  amount: string | null;
};

export type WalletBalanceSnapshot = {
  provider: WalletProviderId | "";
  label: string;
  party: string;
  status: WalletBalanceStatus;
  balances: WalletBalanceRow[];
  message?: string;
};

type StoredWalletIdentity = {
  provider: WalletProviderId | "";
  party: string;
};

type UnknownRecord = Record<string, unknown>;
type LoopBalanceProvider = { party_id: string; getHolding(): Promise<unknown> };

const TRACKED_WALLET_SYMBOLS: WalletBalanceRow["symbol"][] = CANTON_FUNDING_ASSETS.map((asset) => asset.symbol);

export function emptyWalletBalanceRows(): WalletBalanceRow[] {
  return TRACKED_WALLET_SYMBOLS.map((symbol) => ({ symbol, amount: null }));
}

export function getWalletProviderLabel(provider: WalletProviderId | "" | undefined): string {
  switch (provider) {
    case "rocky":
      return "Rocky Wallet";
    case "loop":
      return "Loop Wallet";
    case "console":
      return "Console Wallet";
    case "other":
      return "Other Wallet";
    default:
      return "Wallet";
  }
}

export function getStoredWalletIdentity(): StoredWalletIdentity {
  if (typeof window === "undefined") return { provider: "", party: "" };
  const party = localStorage.getItem("mtc_party") || "";
  const provider = normalizeWalletProvider(localStorage.getItem("mtc_login_method"));
  return {
    party,
    provider: provider || (localStorage.getItem("mtc_token") ? "rocky" : ""),
  };
}

export async function fetchWalletBalanceSnapshot(): Promise<WalletBalanceSnapshot> {
  const identity = getStoredWalletIdentity();
  const base = baseSnapshot(identity);

  if (!identity.party) {
    return { ...base, status: "disconnected", message: "wallet_disconnected" };
  }

  try {
    switch (identity.provider) {
      case "console":
        return await fetchConsoleWalletBalances(identity);
      case "loop":
        return await fetchLoopWalletBalances(identity);
      case "rocky":
        return await fetchRockyWalletBalances(identity);
      case "other":
        return {
          ...base,
          status: "unavailable",
          message: "wallet_balance_api_pending",
        };
      default:
        return { ...base, status: "disconnected", message: "wallet_disconnected" };
    }
  } catch (error) {
    return {
      ...base,
      status: "error",
      message: error instanceof Error ? error.message : "wallet_balance_error",
    };
  }
}

export function normalizeConsoleTokenBalances(tokens: unknown): WalletBalanceRow[] {
  return normalizeBalanceRows(Array.isArray(tokens) ? tokens : [], (item) => {
    const record = asRecord(item);
    if (!record) return null;
    const symbol = canonicalWalletSymbol(stringField(record, "symbol") || stringField(record, "name"));
    if (!symbol) return null;
    const amount = stringField(record, "balance") || stringField(record, "amount");
    return { symbol, amount: amount || "0" };
  });
}

export function normalizeLoopHoldings(holdings: unknown): WalletBalanceRow[] {
  return normalizeBalanceRows(Array.isArray(holdings) ? holdings : [], (item) => {
    const record = asRecord(item);
    if (!record) return null;
    const instrument = asRecord(record.instrument_id);
    const symbol = canonicalWalletSymbol(
      stringField(record, "symbol") ||
        stringField(record, "org_name") ||
        (instrument ? stringField(instrument, "id") : ""),
    );
    if (!symbol) return null;
    return {
      symbol,
      amount: stringField(record, "total_unlocked_coin") || "0",
    };
  });
}

export function normalizeRockyWalletBalance(balance: unknown): WalletBalanceRow[] {
  if (Array.isArray(balance)) {
    return normalizeBalanceRows(balance, (item) => {
      const record = asRecord(item);
      if (!record) return null;
      const symbol = canonicalWalletSymbol(
        stringField(record, "symbol") ||
          stringField(record, "asset") ||
          stringField(record, "currency") ||
          stringField(record, "instrument_id"),
      );
      if (!symbol) return null;
      return { symbol, amount: amountFromBalanceRecord(record) || "0" };
    });
  }

  const record = asRecord(balance);
  const ccAmount = record ? amountFromBalanceRecord(record) : "";
  return emptyWalletBalanceRows().map((row) =>
    row.symbol === "CC" ? { ...row, amount: ccAmount || null } : row
  );
}

function normalizeBalanceRows(
  items: unknown[],
  extract: (item: unknown) => { symbol: WalletBalanceRow["symbol"]; amount: string } | null,
): WalletBalanceRow[] {
  const balances = new Map<WalletBalanceRow["symbol"], number>();
  for (const item of items) {
    const extracted = extract(item);
    if (!extracted) continue;
    const current = balances.get(extracted.symbol) || 0;
    const next = parseFloat(extracted.amount);
    balances.set(extracted.symbol, current + (Number.isFinite(next) ? next : 0));
  }
  return TRACKED_WALLET_SYMBOLS.map((symbol) => {
    const amount = balances.get(symbol);
    return { symbol, amount: amount === undefined ? null : String(amount) };
  });
}

function normalizeWalletProvider(value: string | null): WalletProviderId | "" {
  return value === "rocky" || value === "loop" || value === "console" || value === "other"
    ? value
    : "";
}

function baseSnapshot(identity: StoredWalletIdentity): WalletBalanceSnapshot {
  return {
    provider: identity.provider,
    label: getWalletProviderLabel(identity.provider),
    party: identity.party,
    status: "unavailable",
    balances: emptyWalletBalanceRows(),
  };
}

async function fetchConsoleWalletBalances(
  identity: StoredWalletIdentity,
): Promise<WalletBalanceSnapshot> {
  const sdk = (await import("@console-wallet/dapp-sdk")) as unknown as {
    CANTON_NETWORK_VARIANTS?: { CANTON_NETWORK?: string };
    consoleWallet: {
      getPrimaryAccount(): Promise<{ partyId?: string; networkId?: string } | undefined>;
      getActiveNetwork(): Promise<{ id?: string } | undefined>;
      getCoinsBalance(request: { party: string; network: string }): Promise<{ tokens?: unknown }>;
    };
  };
  const account = await sdk.consoleWallet.getPrimaryAccount();
  const activeNetwork = await sdk.consoleWallet.getActiveNetwork();
  const party = account?.partyId || identity.party;
  const network =
    activeNetwork?.id ||
    account?.networkId ||
    sdk.CANTON_NETWORK_VARIANTS?.CANTON_NETWORK ||
    "CANTON_NETWORK";

  if (!party) throw new Error("console_wallet_party_missing");

  const balance = await sdk.consoleWallet.getCoinsBalance({ party, network });
  return {
    ...baseSnapshot({ ...identity, party }),
    status: "ready",
    balances: normalizeConsoleTokenBalances(balance.tokens),
  };
}

async function fetchLoopWalletBalances(identity: StoredWalletIdentity): Promise<WalletBalanceSnapshot> {
  const sdk = (await import("@fivenorth/loop-sdk")) as unknown as {
    loop: {
      init(config: {
        appName: string;
        network: "mainnet";
        options: { openMode: "popup"; requestSigningMode: "popup" };
        onAccept(provider: LoopBalanceProvider): void;
        onReject(): void;
      }): void;
      autoConnect(): Promise<void>;
    };
  };

  const accepted: { provider: LoopBalanceProvider | null } = { provider: null };
  sdk.loop.init({
    appName: "Rocky Exchange",
    network: "mainnet",
    options: { openMode: "popup", requestSigningMode: "popup" },
    onAccept(nextProvider) {
      accepted.provider = nextProvider;
    },
    onReject() {
      accepted.provider = null;
    },
  });
  await sdk.loop.autoConnect();

  const provider = accepted.provider;
  if (!provider) {
    return {
      ...baseSnapshot(identity),
      status: "unavailable",
      message: "wallet_reconnect_required",
    };
  }

  const holdings = await provider.getHolding();
  return {
    ...baseSnapshot({ ...identity, party: provider.party_id || identity.party }),
    status: "ready",
    balances: normalizeLoopHoldings(holdings),
  };
}

async function fetchRockyWalletBalances(
  identity: StoredWalletIdentity,
): Promise<WalletBalanceSnapshot> {
  const result = await fetchRockyWalletBalancesFromSdk({ party: identity.party });

  return {
    ...baseSnapshot({ ...identity, party: result.party }),
    status: "ready",
    balances: normalizeRockyWalletBalance(result.balance.tokens ?? result.balance.items ?? result.balance),
  };
}

function canonicalWalletSymbol(value: string): WalletBalanceRow["symbol"] | null {
  return walletFacingAssetSymbol(value);
}

function amountFromBalanceRecord(record: UnknownRecord): string {
  const explicitTotal = firstStringField(
    record,
    "total",
    "total_coin",
    "total_amulet",
    "effective_total_qty",
    "amount",
    "balance",
  );
  if (explicitTotal) return explicitTotal;

  const unlocked = firstStringField(
    record,
    "effective_unlocked_qty",
    "total_unlocked_coin",
    "unlocked_qty",
    "unlocked",
    "available",
  );
  const locked = firstStringField(
    record,
    "effective_locked_qty",
    "total_locked_coin",
    "locked_qty",
    "locked",
  );
  if (unlocked || locked) return sumDecimalStrings(unlocked, locked);

  const nested =
    asRecord(record.amulet) ||
    asRecord(record.amulet_balance) ||
    asRecord(record.cc) ||
    asRecord(record.canton_coin);
  return nested ? amountFromBalanceRecord(nested) : "";
}

function firstStringField(record: UnknownRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = stringField(record, key);
    if (value) return value;
  }
  return "";
}

function sumDecimalStrings(...values: Array<string | undefined>): string {
  const total = values.reduce((sum, value) => {
    const parsed = value ? parseFloat(value) : 0;
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
  return String(total);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringField(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
