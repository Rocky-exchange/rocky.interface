/**
 * Browser client for rocky-backend /api/v3/* (Binance Spot-compatible).
 *
 * Auth model:
 *   - Public routes (depth / trades / klines / ticker) → no signing.
 *   - Private routes (order, openOrders, account) → HMAC-SHA256 signed
 *     via Web Crypto API in the browser.
 *
 * Where does the secret come from?
 *   - v1 dev: VITE_SPOT_API_KEY + VITE_SPOT_API_SECRET in .env.local.
 *     ⚠ These end up in the production bundle if set at build time —
 *       DO NOT commit values, and DO NOT set them in .env.production.
 *   - v2: per-user session-issued key from an auth endpoint (TODO).
 *
 * All URLs go same-origin via the /api/v3 vite proxy in dev; in prod
 * they go same-origin behind nginx (mirroring the /v1 + /fapi pattern).
 */

const API_KEY = import.meta.env.VITE_SPOT_API_KEY as string | undefined;
const API_SECRET = import.meta.env.VITE_SPOT_API_SECRET as string | undefined;
const RECV_WINDOW_MS = Number(import.meta.env.VITE_SPOT_RECV_WINDOW_MS ?? 60000);

const BASE = ""; // same-origin — vite dev proxy or prod nginx handles /api/v3

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

export type Kline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string,
];

export type Ticker24h = {
  symbol: string;
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
  timeInForce: "GTC";
  type: "LIMIT";
  side: "BUY" | "SELL";
  time?: number;
  updateTime?: number;
  isWorking?: boolean;
};

// ── HMAC-SHA256 via Web Crypto ─────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

class SpotApiError extends Error {
  constructor(public readonly code: number, message: string) {
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
  extra: Record<string, string> = {},
): Promise<T> {
  if (!API_KEY || !API_SECRET) {
    throw new SpotApiError(
      -503,
      "VITE_SPOT_API_KEY / VITE_SPOT_API_SECRET not set in .env.local",
    );
  }
  const params = new URLSearchParams(extra);
  params.set("timestamp", String(Date.now()));
  params.set("recvWindow", String(RECV_WINDOW_MS));
  const query = params.toString();
  const signature = await sign(API_SECRET, query);
  const r = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": API_KEY, accept: "application/json" },
  });
  return parseOrThrow<T>(r);
}

async function publicGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  return parseOrThrow<T>(r);
}

// ── Public API ─────────────────────────────────────────────────────────────

export const spotApi = {
  depth: (symbol: string, limit = 100) =>
    publicGet<DepthResp>(
      `/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
    ),
  trades: (symbol: string, limit = 50) =>
    publicGet<Trade[]>(
      `/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
    ),
  klines: (symbol: string, interval = "1m", limit = 500) =>
    publicGet<Kline[]>(
      `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    ),
  ticker: (symbol: string) =>
    publicGet<Ticker24h>(
      `/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
    ),
  account: () => signedRequest<Account>("GET", "/api/v3/account"),
  openOrders: (symbol: string) =>
    signedRequest<SpotOrder[]>("GET", "/api/v3/openOrders", { symbol }),
  placeOrder: (b: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT";
    price: string;
    quantity: string;
    newClientOrderId?: string;
  }) => {
    const p: Record<string, string> = {
      symbol: b.symbol,
      side: b.side,
      type: b.type,
      price: b.price,
      quantity: b.quantity,
    };
    if (b.newClientOrderId) p.newClientOrderId = b.newClientOrderId;
    return signedRequest<SpotOrder>("POST", "/api/v3/order", p);
  },
  cancelOrder: (symbol: string, orderId: string) =>
    signedRequest<{ status: "CANCELED" }>("DELETE", "/api/v3/order", {
      symbol,
      orderId,
    }),
};

export const SPOT_MARKETS = [
  { symbol: "CBTC-USDCX", base: "CBTC", quote: "USDCx" },
  { symbol: "CETH-USDCX", base: "cETH", quote: "USDCx" },
] as const;

export { SpotApiError };
