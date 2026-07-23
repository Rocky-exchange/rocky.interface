/**
 * Browser client for rocky-backend /api/v3/* (Binance Spot-compatible).
 *
 * Public routes → plain fetch. Private routes → HMAC-SHA256 signed via
 * Web Crypto API using VITE_SPOT_API_KEY + VITE_SPOT_API_SECRET.
 *
 * ⚠ v1 auth is DEV-ONLY: those env vars end up in the production bundle
 * if set at build time. Production path (v2): per-user session-issued
 * keys from an auth endpoint.
 *
 * All URLs go same-origin via the /api/v3 vite proxy in dev; in prod
 * they go same-origin behind nginx.
 */

// Session credentials: initially null. `useSpotSession` fills them in
// after Canton wallet connect (per-user HMAC key minted by the backend
// /api/v3/session-key endpoint). `.env.local` values are DEV FALLBACK ONLY
// — never leak them into prod bundles.
type Creds = { key: string; secret: string } | null;

let creds: Creds = (() => {
  const envKey = import.meta.env.VITE_SPOT_API_KEY as string | undefined;
  const envSec = import.meta.env.VITE_SPOT_API_SECRET as string | undefined;
  if (envKey && envSec && import.meta.env.DEV) return { key: envKey, secret: envSec };
  return null;
})();

const RECV_WINDOW_MS = Number(import.meta.env.VITE_SPOT_RECV_WINDOW_MS ?? 60000);

const CREDS_CHANGE_EVENT = "spot-creds-change";

export function setSpotCredentials(next: Creds): void {
  creds = next;
  // Invalidate HMAC key cache — a new secret needs a fresh CryptoKey.
  cachedKey = null;
  cachedKeySecret = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDS_CHANGE_EVENT));
}

export function getSpotCredentials(): Creds {
  return creds;
}

export function subscribeSpotCredentials(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CREDS_CHANGE_EVENT, cb);
  return () => window.removeEventListener(CREDS_CHANGE_EVENT, cb);
}

const BASE = "";
const spotIconUrlCache = new Map<string, string>();

function normalizeMarketSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function getCachedSpotIconUrl(symbol: string): string | undefined {
  return spotIconUrlCache.get(normalizeMarketSymbol(symbol));
}

// ── Types (see rocky-backend/services/api-gateway/src/spot/*) ───────────────

export type DepthResp = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

export type Trade = {
  id: string;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
};

export type Kline = [number, string, string, string, string, string, number, string, number, string, string, string];

export type Ticker24h = {
  symbol: string;
  iconUrl?: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
};

export type Balance = { asset: string; free: string; locked: string };

export type SupportedAsset = {
  symbol: string;
  decimals: number;
  enabled: boolean;
  metadata?: {
    wallet_symbol?: string;
    aliases?: string[];
  };
};

export type SupportedAssetsResponse = {
  assets: SupportedAsset[];
  margin_assets: SupportedAsset[];
};

export type SpotMarketInfo = {
  symbol: string;
  base: string;
  quote: string;
  icon_url?: string;
  max_leverage: number;
  tick_size: string;
  min_qty: string;
};

export type Account = {
  accountType: "SPOT";
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  balances: Balance[];
  permissions: string[];
};

export type SpotOrder = {
  symbol: string;
  orderId: string;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED";
  timeInForce: "GTC" | "IOC";
  type: "LIMIT" | "MARKET";
  side: "BUY" | "SELL";
  time?: number;
  updateTime?: number;
  isWorking?: boolean;
};

// One personal fill (GET /api/v3/myTrades). Backend has no order_id column on
// spot_trades, so orderId is absent; display only needs price/qty/side/fee/time.
export type MyTrade = {
  symbol: string;
  id: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
};

// ── HMAC-SHA256 via Web Crypto ─────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;
let cachedKeySecret: string | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeySecret === secret) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  cachedKeySecret = secret;
  return cachedKey;
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class SpotApiError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "SpotApiError";
  }
}

async function parseOrThrow<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (!r.ok) {
    try {
      const j = JSON.parse(text) as { code?: number; msg?: string };
      throw new SpotApiError(j.code ?? r.status, j.msg ?? text);
    } catch (e) {
      if (e instanceof SpotApiError) throw e;
      throw new SpotApiError(r.status, text || `HTTP ${r.status}`);
    }
  }
  return JSON.parse(text) as T;
}

async function signedRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  extra: Record<string, string> = {}
): Promise<T> {
  const c = creds;
  if (!c) {
    throw new SpotApiError(-401, "Connect your wallet to trade spot");
  }
  const params = new URLSearchParams(extra);
  params.set("timestamp", String(Date.now()));
  params.set("recvWindow", String(RECV_WINDOW_MS));
  const query = params.toString();
  const signature = await sign(c.secret, query);
  const r = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": c.key, accept: "application/json" },
  });
  return parseOrThrow<T>(r);
}

async function publicGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  return parseOrThrow<T>(r);
}

async function getTicker(symbol: string): Promise<Ticker24h> {
  const ticker = await publicGet<Ticker24h>(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
  if (ticker.iconUrl) {
    spotIconUrlCache.set(normalizeMarketSymbol(ticker.symbol || symbol), ticker.iconUrl);
  }
  return ticker;
}

// ── Public API ─────────────────────────────────────────────────────────────

export const spotApi = {
  assets: () => publicGet<SupportedAssetsResponse>("/v1/assets"),
  markets: () => publicGet<SpotMarketInfo[]>("/v1/markets?type=SPOT"),
  depth: (symbol: string, limit = 100) =>
    publicGet<DepthResp>(`/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
  trades: (symbol: string, limit = 50) =>
    publicGet<Trade[]>(`/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
  klines: (symbol: string, interval = "1m", limit = 500) =>
    publicGet<Kline[]>(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`),
  ticker: getTicker,
  account: () => signedRequest<Account>("GET", "/api/v3/account"),
  openOrders: (symbol: string) => signedRequest<SpotOrder[]>("GET", "/api/v3/openOrders", { symbol }),
  allOrders: (symbol: string, limit = 500) =>
    signedRequest<SpotOrder[]>("GET", "/api/v3/allOrders", { symbol, limit: String(limit) }),
  myTrades: (symbol: string, limit = 500) =>
    signedRequest<MyTrade[]>("GET", "/api/v3/myTrades", { symbol, limit: String(limit) }),
  placeOrder: (b: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET";
    price?: string;
    quantity: string;
    newClientOrderId?: string;
  }) => {
    const p: Record<string, string> = {
      symbol: b.symbol,
      side: b.side,
      type: b.type,
      quantity: b.quantity,
    };
    if (b.type === "LIMIT" && b.price) p.price = b.price;
    if (b.newClientOrderId) p.newClientOrderId = b.newClientOrderId;
    return signedRequest<SpotOrder>("POST", "/api/v3/order", p);
  },
  cancelOrder: (symbol: string, orderId: string) =>
    signedRequest<{ symbol: string; orderId: string; status: "CANCELED" }>(
      "DELETE",
      "/api/v3/order",
      { symbol, orderId },
    ),
};

export { SPOT_MARKETS } from "../markets";
