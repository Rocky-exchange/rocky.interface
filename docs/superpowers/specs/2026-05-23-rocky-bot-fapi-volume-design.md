# rocky-bot + /fapi Volume Generation Design

**Date:** 2026-05-23
**Status:** Draft for review

## Goal

Make `demo.rocky.exchange/perp/{BTC-PERP, ETH-PERP}` show continuous
trade activity (book depth + steady fills) without real human flow, so
the UI looks alive while we onboard real users.

Two coupled deliverables:

1. **`/fapi/v1` surface on rocky-backend** — Binance Futures-compatible
   REST endpoints with HMAC API-key auth, suitable for any
   ccxt/freqtrade-style client.
2. **`rocky-bot`** — Python daemon, two accounts (MM + Taker), pulls
   Binance spot prices, places small ($30–80 notional) signed orders
   against `/fapi`.

Total capital at risk: ~$200 USDC (two accounts × $100). Expected
output: 1–3 fills/minute per symbol (~3k–9k fills/day total), bounded
by per-account $200 notional cap that recycles capital.

## Non-Goals

- Real market-making strategy. The bot exists to print volume, not to
  hedge inventory or capture spread.
- Full Binance Futures REST surface. Only the 8 endpoints the bot
  needs (plus the two read endpoints `exchangeInfo`/`ticker/price` for
  ccxt compatibility).
- HFT-grade signing performance (sub-ms HMAC). axum middleware is
  fine.
- Replacing `/v1`. `/v1` continues to serve mtc-exchange BFF for human
  users; `/fapi` is the new programmatic surface and runs alongside.

## Architecture

```
                  Binance spot WS (BTCUSDT, ETHUSDT bookTicker)
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  rocky-bot (Python, EC2)         │
        │  ┌────────────┐  ┌────────────┐  │
        │  │ MM loop    │  │ Taker loop │  │
        │  └─────┬──────┘  └─────┬──────┘  │
        │        │ HMAC-signed   │         │
        │        └───────┬───────┘         │
        └────────────────┼─────────────────┘
                         ▼
              demo.rocky.exchange/fapi/...
                         │ (nginx → 127.0.0.1:18080)
                         ▼
        ┌──────────────────────────────────┐
        │  api-gateway (Rust, axum)        │
        │  ┌──────────────────────────┐    │
        │  │ /fapi/v1/* routes        │    │
        │  │   ├─ HMAC middleware     │    │
        │  │   ├─ symbol BTCUSDT↔     │    │
        │  │   │   BTC-PERP mapping   │    │
        │  │   └─ Binance error codes │    │
        │  └──────────┬───────────────┘    │
        │  ┌──────────▼───────────────┐    │
        │  │ existing /v1 logic       │    │
        │  │   trading-router, pg,    │    │
        │  │   matching-engine, ...   │    │
        │  └──────────────────────────┘    │
        └──────────────────────────────────┘
```

`/fapi` is a thin Binance-shaped facade over the existing internal
logic. No duplicated business logic — the routes translate path/query/
body conventions, validate HMAC, then call into the same handlers `/v1`
uses (refactored to private helpers).

## Part A: rocky-backend `/fapi/v1`

### Endpoints

All under `/fapi/v1` (or `/fapi/v2` where Binance puts them there).
Path, params, response shapes mirror Binance Futures docs.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/fapi/v1/exchangeInfo` | none | symbols + filters + leverage |
| GET | `/fapi/v1/ticker/price` | none | last price (`{symbol, price, time}`) |
| POST | `/fapi/v1/order` | signed | place order |
| DELETE | `/fapi/v1/order` | signed | cancel order |
| GET | `/fapi/v1/order` | signed | get order by orderId or origClientOrderId |
| GET | `/fapi/v1/openOrders` | signed | open orders (optionally by symbol) |
| GET | `/fapi/v2/balance` | signed | per-asset balance |
| GET | `/fapi/v2/positionRisk` | signed | open positions |

### Symbol mapping

Binance uses `BTCUSDT`, rocky uses `BTC-PERP`. The `/fapi` layer
translates both directions:

| Binance | Rocky |
|---|---|
| `BTCUSDT` | `BTC-PERP` |
| `ETHUSDT` | `ETH-PERP` |

`exchangeInfo` returns both fields per symbol (`symbol=BTCUSDT`,
`pair=BTC-PERP`) so clients can use either; the mapping table lives in
one module (`fapi/symbol_map.rs`) and is the only place the
correspondence is encoded.

### HMAC auth middleware

Implemented as an axum `from_fn_with_state` layer applied to all
signed routes.

**Request format (Binance-compatible):**
- `X-MBX-APIKEY: <key>` header — opaque 32-byte hex string
- `timestamp=<unix-ms>` query param (required)
- `recvWindow=<ms>` query param (optional, default 5000, max 60000)
- `signature=<hex>` query param — last param, value is
  `HMAC-SHA256(secret, "<query_string_without_signature>")` — for POST
  requests, body params are merged into the signed string by Binance
  convention (form-urlencoded body → treated as query)

**Validation order (fail-fast):**

1. Missing `X-MBX-APIKEY` → `-2014` `API-key format invalid`
2. Key unknown / revoked → `-2015` `Invalid API-key`
3. Missing `timestamp` or `signature` → `-1102` `Mandatory parameter
   was not sent`
4. `|now - timestamp| > recvWindow` → `-1021` `Timestamp for this
   request is outside of the recvWindow`
5. Signature mismatch (constant-time compare) → `-1022` `Signature for
   this request is not valid`
6. On success, inject `(user_id, key_id)` into request extensions for
   downstream handlers

**Error response shape:** `{"code": <int>, "msg": "<string>"}`,
HTTP 400 for client errors (-1xxx, -2014, -2015), 401 for sig/timestamp
(-1021, -1022), 422 for business errors (-2010 insufficient balance,
-2011 unknown order).

### API key store

New table `api_keys`:

```sql
CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  key          TEXT NOT NULL UNIQUE,           -- 32-byte hex, shown to user
  secret_hash  TEXT NOT NULL,                  -- bcrypt of secret
  label        TEXT,                           -- optional, e.g. "MM bot"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX api_keys_key_active ON api_keys(key) WHERE revoked_at IS NULL;
```

Bcrypt vs plaintext: bcrypt because losing the db should not leak
secrets. Verifying bcrypt per request is ~5ms on EC2 — acceptable for
a demo bot doing a few req/sec. If load grows, an in-memory
`HashMap<key, secret>` LRU cache can be added later.

### Key issuance: `mint_api_key` binary

New binary `services/api-gateway/src/bin/mint_api_key.rs`:

```
$ cargo run --bin mint_api_key -- --user-id <uuid> --label "MM bot"
key:    9f3e2a1b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f
secret: 7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c

⚠️  Save the secret now — it cannot be retrieved later.
```

Reads `DATABASE_URL` from env, inserts row, prints once. No `revoke`
subcommand for v1 (manual `UPDATE api_keys SET revoked_at=now()
WHERE key=...` is fine for demo).

Bootstrap: also accepts `--create-user-with-party-hint <hint>` to mint
a new user row in the existing `users` table if needed.

### Error code subset

Only these implemented; all others bubble as `-1000 UNKNOWN`:

| Code | HTTP | Meaning |
|---|---|---|
| `-1000` | 500 | UNKNOWN |
| `-1021` | 401 | Timestamp outside recvWindow |
| `-1022` | 401 | Signature invalid |
| `-1100` | 400 | Illegal parameter |
| `-1102` | 400 | Mandatory parameter missing |
| `-2010` | 422 | Insufficient balance |
| `-2011` | 422 | Unknown order |
| `-2014` | 400 | API-key format invalid |
| `-2015` | 401 | Invalid API-key |

### nginx exposure

Public path: `https://demo.rocky.exchange/fapi/...` proxies to
`http://127.0.0.1:18080/fapi/...` — add a single `location /fapi/` block
to the existing nginx site config. Same TLS cert. No path rewrite.

## Part B: rocky-bot

### Repository layout

```
rocky-bot/
├── pyproject.toml          # PEP 621, managed with uv
├── README.md
├── .env.example            # ROCKY_FAPI_URL, MM_KEY/SECRET, TAKER_KEY/SECRET, ...
├── .gitignore
├── rocky_bot/
│   ├── __init__.py
│   ├── config.py           # pydantic-settings
│   ├── binance_feed.py     # async WS subscriber, in-memory price cache
│   ├── rocky_client.py     # /fapi HMAC signer + httpx.AsyncClient
│   ├── strategies/
│   │   ├── __init__.py
│   │   ├── mm.py           # MakerLoop
│   │   └── taker.py        # TakerLoop
│   ├── risk.py             # caps + circuit breakers
│   └── main.py             # asyncio.gather of feed + per-symbol mm + per-symbol taker
├── tests/
│   ├── test_signing.py     # HMAC produces same bytes as Binance docs example
│   ├── test_symbol_map.py
│   └── test_risk.py
├── systemd/
│   └── rocky-bot.service   # user-mode unit, EnvironmentFile=.env, Restart=always
└── deploy.sh               # rsync to EC2 + uv venv + systemctl --user
```

### Dependencies

```
python = "^3.12"
httpx = "^0.27"
websockets = "^13.0"
pydantic = "^2"
pydantic-settings = "^2"
```

No ccxt — single-exchange use case, the surface is small enough to
implement directly and it's good test coverage for our own `/fapi`.

### `binance_feed.py`

- Connects to `wss://fstream.binance.com/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker`
- Maintains `dict[symbol_rocky → (bid, ask, ts_ms)]` in memory
- Auto-reconnects with exponential backoff (max 30s)
- `mid(symbol) -> Decimal` returns `(bid + ask) / 2`; raises
  `StaleFeedError` if `now - ts_ms > 10000`

### `rocky_client.py`

```python
class RockyClient:
    def __init__(self, base_url: str, key: str, secret: str): ...
    async def place_order(self, symbol, side, type, quantity, price=None) -> dict: ...
    async def cancel_order(self, symbol, order_id) -> dict: ...
    async def open_orders(self, symbol=None) -> list[dict]: ...
    async def balance(self) -> list[dict]: ...
    async def position_risk(self, symbol=None) -> list[dict]: ...
```

Sign helper is internal; query string built from sorted params for
determinism, `signature=` appended last. Returns parsed JSON; raises
`FapiError(code, msg)` on non-2xx.

### MM Loop (`mm.py`)

Per-symbol, runs every 2s:

```
mid = binance_feed.mid(symbol)
target_bid = mid * (1 - SPREAD)        # SPREAD = 0.0005 (5 bps)
target_ask = mid * (1 + SPREAD)
qty = MM_QTY_BY_SYMBOL[symbol]

existing = rocky.open_orders(symbol)
for o in existing:
    if abs(o.price - target_{side}) / target_{side} > 0.0002:  # 2 bps drift
        rocky.cancel_order(symbol, o.orderId)

if no live bid: rocky.place_order(symbol, BUY, LIMIT, qty, target_bid)
if no live ask: rocky.place_order(symbol, SELL, LIMIT, qty, target_ask)
```

Quantities (constants, top of `mm.py`):

```python
MM_QTY_BY_SYMBOL = {
    "BTC-PERP": Decimal("0.001"),    # ~$75 at $75k
    "ETH-PERP": Decimal("0.02"),     # ~$60 at $3k
}
```

### Taker Loop (`taker.py`)

Per-symbol, runs every 30s + random jitter ±10s:

```
mid = binance_feed.mid(symbol)
pos = rocky.position_risk(symbol)[0]
notional = abs(pos.positionAmt * mid)

if notional > MAX_NOTIONAL:
    side = SELL if pos.positionAmt > 0 else BUY   # force flatten direction
else:
    side = random.choice([BUY, SELL])

qty = TAKE_QTY_BY_SYMBOL[symbol]
rocky.place_order(symbol, side, MARKET, qty)
```

Quantities (constants, top of `taker.py`):

```python
TAKE_QTY_BY_SYMBOL = {
    "BTC-PERP": Decimal("0.0005"),   # ~$37 at $75k
    "ETH-PERP": Decimal("0.01"),     # ~$30 at $3k
}
```

`MAX_NOTIONAL = $200` per symbol per account.

### `risk.py` (single source of truth for limits)

```python
class RiskCaps:
    MAX_LOSS_USDC = 50              # per account; pause 30min if breached
    MAX_NOTIONAL_USDC = 200         # per symbol; force-flatten side
    MAX_LEVERAGE = 10
    API_ERROR_PAUSE_SECONDS = 60    # after 5 consecutive errors
    FEED_STALE_SECONDS = 10         # stop trading if feed older

class CircuitBreaker:
    def check(self, account_state) -> Optional[PauseReason]: ...
    def trip(self, reason: PauseReason): ...
    def is_open(self) -> bool: ...
```

Loops call `circuit.check()` at the top of each iteration; if open,
sleep + continue. Reasons + timestamps logged.

### `main.py`

```python
async def main():
    feed = BinanceFeed(symbols=["BTC-PERP", "ETH-PERP"])
    mm_client = RockyClient(cfg.fapi_url, cfg.mm_key, cfg.mm_secret)
    taker_client = RockyClient(cfg.fapi_url, cfg.taker_key, cfg.taker_secret)
    mm_circuit = CircuitBreaker(); taker_circuit = CircuitBreaker()

    await asyncio.gather(
        feed.run(),
        mm_loop(mm_client, feed, "BTC-PERP", mm_circuit),
        mm_loop(mm_client, feed, "ETH-PERP", mm_circuit),
        taker_loop(taker_client, feed, "BTC-PERP", taker_circuit),
        taker_loop(taker_client, feed, "ETH-PERP", taker_circuit),
    )
```

Single process, asyncio. MM/Taker share Binance feed; separate
circuits since one account misbehaving shouldn't pause the other.

### Bootstrap procedure

One-time setup, documented in `rocky-bot/README.md`:

```bash
# 1. on EC2 / rocky-backend
cd ~/rocky-backend
cargo run --bin mint_api_key -- --create-user-with-party-hint mm-bot --label "MM bot"
# → prints MM_KEY, MM_SECRET, user_id

cargo run --bin mint_api_key -- --create-user-with-party-hint taker-bot --label "Taker bot"
# → prints TAKER_KEY, TAKER_SECRET, user_id

# 2. seed USDC to both
curl -X POST http://127.0.0.1:18080/v1/deposits/seed \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"<MM-uuid>","amount":"100","asset":"USDC"}'
curl -X POST http://127.0.0.1:18080/v1/deposits/seed \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"<TAKER-uuid>","amount":"100","asset":"USDC"}'

# 3. fill .env on local Mac, deploy
cd ~/Desktop/Rocky/rocky-bot
cp .env.example .env  # fill 4 secrets + ROCKY_FAPI_URL=https://demo.rocky.exchange
./deploy.sh
```

### Deploy

`deploy.sh`:
1. `rsync -az --exclude .venv --exclude __pycache__ ./ ec2:~/rocky-bot/`
2. ssh: `cd ~/rocky-bot && uv venv && uv pip install -e .`
3. ssh: `cp systemd/rocky-bot.service ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user restart rocky-bot`
4. ssh: `journalctl --user -u rocky-bot --since "10 seconds ago" -n 20` — smoke

Logs: `journalctl --user -u rocky-bot -f`.

## Testing

### Backend (`/fapi`)
- **Unit:** HMAC signing matches Binance docs golden example
  (`5b3a3b6c...` from official docs).
- **Unit:** symbol_map round-trips both directions.
- **Integration:** spin up api-gateway with in-memory key, hit all 8
  endpoints with httpc + signing, assert Binance-shaped responses.
- **Integration:** all 9 error codes return correct shape + HTTP code.

### Bot
- **Unit:** `RockyClient.sign()` produces identical signature to
  Binance docs example given same inputs.
- **Unit:** `RiskCaps` trip / reset state transitions.
- **Unit:** symbol_map.
- **Integration:** mock httpx transport, simulate 5 consecutive 500s,
  assert circuit opens.
- **Manual smoke:** run against EC2 staging, watch journalctl + mtc-exchange
  UI for live fills over 5 minutes.

## Open questions / future work (explicitly out of scope for v1)

- WebSocket userData stream (`listenKey` + ws://...) — bot polls REST
  for now; if poll rate hurts, add WS later.
- Real make-or-take strategy (inventory-aware quoting, latency arb).
- Per-symbol risk caps configurable via YAML rather than hardcoded.
- API key rotation via Auth0-authenticated UI.
- Bot metrics endpoint (prometheus).
- Multiple bot instances (HA / load split).

## Sequencing

Two plans, executed in order:

1. **`/fapi` backend plan** (~1-2 days): table + middleware + 8
   endpoints + mint_api_key + nginx exposure + tests. Deployable
   independently (ccxt connects, doesn't matter that no bot is using
   it yet).
2. **`rocky-bot` plan** (~1-2 days): repo scaffold + feed + client +
   loops + risk + deploy. Depends on (1) being live on EC2.

Each plan can produce a separate repo/branch and ship independently.
