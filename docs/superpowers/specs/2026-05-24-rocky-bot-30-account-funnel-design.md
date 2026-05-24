# rocky-bot 30-Account Funnel Market Making Design

**Date:** 2026-05-24
**Status:** Draft for review
**Repo:** `rocky-bot`
**Supersedes:** the 2-account MM+Taker layout from `2026-05-23-rocky-bot-fapi-volume-design.md`.

## Goal

Replace rocky-bot's current 2-account daemon (1 MM + 1 Taker) with a
**30-account funnel-shaped market-making rig** so the demo book on
`demo.rocky.exchange/perp/*` shows multi-level resting depth around
Binance mid (center-dense, edges-sparse) plus continuous taker flow.

## Non-goals

- No rocky-backend / Daml changes. Pure rocky-bot rewrite.
- No new exchange features (still uses `/fapi/v1/order` LIMIT only).
- No WebSocket userData stream — still REST polling.
- No multi-process / docker / k8s deploy. Stay single asyncio process
  on the existing systemd-user unit.
- No persistent stats DB. Logs to journalctl only.

## Funnel geometry

For each symbol (BTC-PERP, ETH-PERP), 25 MM accounts split into three
price-distance layers per side, plus one cross-side **anchor**:

| Layer | Offset from mid (bps) — one account per bps | Accounts × side | qty BTC-PERP | qty ETH-PERP |
|---|---|---|---|---|
| **L1 tight** | 5, 6, 7, 8, 9, 10 | 6 | 0.0005 | 0.01 |
| **L2 mid** | 15, 20, 25, 30 | 4 | 0.001 | 0.02 |
| **L3 wide** | 50, 100 | 2 | 0.002 | 0.04 |
| **anchor** | best-bid + best-ask | 1 (cross-side) | 0.0003 | 0.006 |

Per side: 6 + 4 + 2 = 12 distinct price levels visible in the book.
Both sides: 24 accounts + 1 anchor = **25 MM accounts**.

**5 Taker accounts** complement the MM rig. Each Taker fires every
30s ± 10s, picks one random side, places an aggressive LIMIT at
±50 bps past Binance mid for ~$50 notional (continues current
`taker.py` semantics).

Total: **30 accounts**.

Book depth visualization (mid = $75,000):

```
SELL side:                                           BUY side:
  75,750  L3 anchor (0.002)                          74,250  L3 (0.002)
  75,375  L3 (0.002)                                 74,625  L3 (0.002)
  75,225  L2 (0.001)                                 74,775  L2 (0.001)
  75,187  L2 (0.001)                                 74,812  L2 (0.001)
  75,150  L2 (0.001)                                 74,850  L2 (0.001)
  75,112  L2 (0.001)                                 74,887  L2 (0.001)
  75,075  L1 (0.0005)                                74,925  L1 (0.0005)
  75,067  L1 (0.0005)                                74,932  L1 (0.0005)
  75,060  L1 (0.0005)                                74,940  L1 (0.0005)
  75,052  L1 (0.0005)                                74,947  L1 (0.0005)
  75,045  L1 (0.0005)                                74,955  L1 (0.0005)
  75,037  L1 (0.0005)   ▽ funnel narrows here        74,962  L1 (0.0005)
                          ↑ anchor at best ask
                          ↓ anchor at best bid
```

### Why 25 + 1 + 5 split

- 25 MM gives 12 distinct visible levels per side → book "feels"
  populated without overloading EC2 NATS/matching-engine
- Anchor account always tightens spread to ~best — guarantees a
  cross-able level when Taker fires
- 5 Taker rotates burden so no single account drains too fast

## Capital

Each account: **$100 USDC**. Total: **$3000 USDC**.

| Role | Count | Per account | Subtotal |
|---|---|---|---|
| MM L1+L2+L3 (per side) | 24 | $100 | $2400 |
| MM anchor | 1 | $100 | $100 |
| Taker | 5 | $100 | $500 |
| **Total** | **30** | — | **$3000** |

DevNet has no real value — capital choice is just sizing so each
account can support its assigned qty at 10x leverage with margin for
several orders to coexist while phantom-locked margin accumulates.

## Code structure

**New files:**
- `rocky-bot/scripts/mint-30.sh` — one-shot bash:
  - SSH to EC2, loop `cargo run --bin mint_api_key -- --new-user --label "<id>"` × 30
  - Parse stdout for `user_id` / `key` / `secret` per role+layer
  - Call `/v1/deposits/seed` × 30 to fund $100 each
  - Emit `.keys.json` (template below) to stdout for user to save into `rocky-bot/.keys.json`
- `rocky_bot/accounts.py` — `Account` dataclass + `load_accounts(path) -> list[Account]` reading `.keys.json`, validating shape (count = 30, role distribution, etc.)
- `rocky_bot/strategies/ladder.py` — new `LadderMakerLoop` for fixed-offset, fixed-side, fixed-qty quoting. Per-account, per-symbol task
- `rocky_bot/strategies/anchor.py` — new `AnchorMakerLoop` posting best-bid + best-ask, both sides, smaller qty

**Modified files:**
- `rocky_bot/main.py` — load accounts from `.keys.json`, spawn one task per (account, symbol). asyncio.gather all
- `rocky_bot/config.py` — drop MM_/TAKER_ env vars. Keep `ROCKY_FAPI_URL`, `LOG_VERBOSE`. Add `keys_path` (default `.keys.json`)
- `.env.example` — slim down to URL + log verbosity only

**Deleted files:**
- `rocky_bot/strategies/mm.py` — superseded by `ladder.py` + `anchor.py` (different semantics, not worth shimming)

**Unchanged:**
- `rocky_bot/strategies/taker.py` — works as-is, just runs 5 instances instead of 1
- `rocky_bot/binance_feed.py`, `risk.py`, `rocky_client.py`, `sign.py`, `symbol_map.py`

### `.keys.json` shape

```json
{
  "rocky_fapi_url": "https://demo.rocky.exchange",
  "accounts": [
    {
      "id": "mm-l1-buy-05bps",
      "role": "ladder",
      "side": "BUY",
      "offset_bps": 5,
      "user_id": "...",
      "key": "...",
      "secret": "..."
    },
    {
      "id": "mm-anchor",
      "role": "anchor",
      "user_id": "...",
      "key": "...",
      "secret": "..."
    },
    {
      "id": "taker-1",
      "role": "taker",
      "user_id": "...",
      "key": "...",
      "secret": "..."
    }
    // ... 30 total
  ]
}
```

Per-account size (BTC / ETH) is derived from `(role, offset_bps)` via
a constant table in `accounts.py` — not stored in the JSON, keeping
the config minimal.

### `LadderMakerLoop` semantics

Per account per symbol, every 3s ± 1s jitter:

1. If circuit open: sleep + return
2. mid = `feed.mid(symbol)` (raise StaleFeedError → sleep + return)
3. target_price = `mid * (1 + offset_bps * side_sign / 10000)`
4. Fetch own open_orders for symbol; if any drifted > 2 bps from target → cancel
5. If no live order at target → place LIMIT (side, qty, target_price)

Each account quotes EXACTLY ONE PRICE LEVEL on EXACTLY ONE SIDE.
No double-sided quoting per account.

### `AnchorMakerLoop` semantics

Single anchor account, two-sided, both BTC + ETH. Every 2s:

1. Fetch best_bid / best_ask from `/api/perp/orderbook` (or
   compute as `mid ± 1 bp`)
2. Maintain one BID at best_bid and one ASK at best_ask
3. Cancel and replace if either drifts > 1 bp

Smaller qty (0.0003 BTC, 0.006 ETH) so anchor doesn't dominate the
top of book — exists mainly to keep spread tight.

### Cadence jitter

All accounts share the same `3.0` interval but each starts with a
random 0–3s offset on first iteration so requests stagger across the
wall clock. Avoids 50 simultaneous API calls every 3 seconds at the
same instant.

## Configuration

`.env` (committed `.env.example`):
```
ROCKY_FAPI_URL=https://demo.rocky.exchange
LOG_VERBOSE=false
```

`.keys.json` (gitignored, generated by `mint-30.sh`, manually placed):
30 accounts as above.

`config.py::Settings` reduced to two fields. New `KeysConfig`
loader is a separate concern in `accounts.py`.

## Risk / circuit breakers

**Per-account independent CircuitBreaker** (one instance per
account, keyed by `account.id` in a dict). Trip conditions unchanged:

- 5 consecutive API errors → pause 60s
- Cumulative realised loss > $50 → pause 60s
- Stale feed > 10s → skip iteration (not a trip)

One account tripping does not affect the other 29. Logs include
account id to disambiguate journal lines.

`record_realised_pnl` continues to use the wallet-delta polling
implemented for the 2-account version.

## Mint + seed dance

`mint-30.sh` runs locally and SSHes to EC2 for each mint:

```
#!/usr/bin/env bash
# Usage: bash scripts/mint-30.sh > .keys.json
# WARNING: prints 60 secrets to stdout. Redirect immediately.

SSH="ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218"
BACKEND_DIR=~/rocky-backend-stack

# Generate 30 (id, role, side, offset_bps) tuples
ROLES=$(python3 - <<'PY'
import json
out = []
for side in ("BUY", "SELL"):
    for bps in [5,6,7,8,9,10]:
        out.append({"id": f"mm-l1-{side.lower()}-{bps:02d}bps", "role": "ladder", "side": side, "offset_bps": bps})
    for bps in [15,20,25,30]:
        out.append({"id": f"mm-l2-{side.lower()}-{bps:02d}bps", "role": "ladder", "side": side, "offset_bps": bps})
    for bps in [50,100]:
        out.append({"id": f"mm-l3-{side.lower()}-{bps:03d}bps", "role": "ladder", "side": side, "offset_bps": bps})
out.append({"id": "mm-anchor", "role": "anchor"})
for i in range(1, 6):
    out.append({"id": f"taker-{i}", "role": "taker"})
print(json.dumps(out))
PY
)

# Mint each + seed $100
ACCOUNTS=$(echo "$ROLES" | python3 - <<'PY'
import json, subprocess, sys, os
roles = json.loads(sys.stdin.read())
ssh_cmd = os.environ["SSH"]
backend = os.environ["BACKEND_DIR"]
out = []
for r in roles:
    res = subprocess.check_output(
        f'{ssh_cmd} \'cd {backend} && . "$HOME/.cargo/env" && '
        f'PG_URL="postgres://rocky:rocky@127.0.0.1:5432/rocky" '
        f'cargo run -q -p api-gateway --bin mint_api_key -- --new-user --label "{r["id"]}"\'',
        shell=True, text=True,
    )
    # parse user_id / key / secret from output
    parts = {l.split(": ")[0]: l.split(": ", 1)[1] for l in res.splitlines() if ": " in l}
    r |= {"user_id": parts["user_id"], "key": parts["key"], "secret": parts["secret"]}
    # seed $100 USDC
    subprocess.check_call(
        f'{ssh_cmd} \'curl -sf -X POST http://127.0.0.1:18080/v1/deposits/seed '
        f'-H "Content-Type: application/json" '
        f'-d \\\'{{"user_id":"{r["user_id"]}","asset":"USDC","amount":"100"}}\\\'\'',
        shell=True,
    )
    print(f"  ✓ {r['id']}: {r['user_id'][:8]}...", file=sys.stderr)
    out.append(r)
print(json.dumps({"rocky_fapi_url": "https://demo.rocky.exchange", "accounts": out}, indent=2))
PY
)

echo "$ACCOUNTS"
```

Approximate runtime: 30 × 3s (mint + seed per account) ≈ 1.5 min.

Output redirected to `rocky-bot/.keys.json`. User responsible for
keeping that file safe.

## Deployment

Same `./deploy.sh` flow as the 2-account version. One addition:
rsync now includes `.keys.json` (gitignored locally, must exist
before deploy, scp'd to EC2 explicitly):

```bash
# In deploy.sh, after the .env copy:
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/.keys.json" "$SSH_HOST:~/${REMOTE_DIR}/.keys.json"
```

`systemctl --user restart rocky-bot` cycles the bot. No
`rocky-bot.service` changes — same unit, same `WorkingDirectory`,
same `EnvironmentFile=.env`.

## Migration from 2-account version

1. Mint 30 new accounts via `mint-30.sh` (the existing 2 keys can
   stay in the db; they'll just be idle).
2. Update `rocky-bot/.env` to strip MM_/TAKER_ vars.
3. Place `rocky-bot/.keys.json` locally.
4. `./deploy.sh` — Python code changes pick up automatically; the
   old `mm.py` import is gone so the new bot only spawns the 30 new
   actor tasks.
5. The old MM+Taker accounts' open orders persist; cancel them
   manually via:
   ```bash
   ssh ... 'for u in 5cfb031b-5936-4467-9533-cd2df576dbb8 0252d054-c3d2-4df6-bf14-805058321235; do
     curl -sf "http://127.0.0.1:18080/v1/orders/me?user_id=$u" | \
       jq -r ".[].order_id" | \
       xargs -I{} curl -sf -X DELETE "http://127.0.0.1:18080/v1/orders/{}?user_id=$u"
   done'
   ```

## Tests

`rocky-bot/tests/test_accounts.py` (unit):
- Round-trip `.keys.json` → `load_accounts()` → list of 30 `Account`
- Reject `.keys.json` with wrong account count (29, 31)
- Reject ladder account missing `side` / `offset_bps`
- Validate qty table maps `(role, layer) → qty` per symbol

`rocky-bot/tests/test_ladder.py` (unit, mock httpx):
- Single iteration: no existing order → places LIMIT at exact target price
- Existing order at within-2-bps drift → no action
- Existing order outside drift → cancels + re-places
- Circuit open → no API calls

`rocky-bot/tests/test_anchor.py`:
- Best-bid / best-ask updates → cancel-replace if drift > 1 bp
- Both sides quoted in one iteration

No new integration tests needed — existing pytest suite + EC2 smoke
covers the runtime path.

## Operational characteristics

**Expected QPS** (single bot process):
- 50 MM ladder tasks @ ~1 GET balance + 1 GET orders + ~0.5 DELETE
  + ~0.5 POST per 3s iteration = ~3 RPS per task = ~150 RPS total
  - Wait: 50 tasks × ~3 reqs / 3s = 50 RPS. Manageable.
- 1 anchor task @ 2s: ~2 RPS
- 10 Taker tasks @ 30s: ~0.7 RPS
- ~52 RPS sustained against `/fapi`. api-gateway single instance
  on EC2 handles this comfortably.

**Expected fills**:
- L1 layers near mid cross Binance moves frequently; expect 5–20
  fills/min across all symbols/sides
- Taker fires guarantee 0.3–0.7 fills/min on top of natural crossing
- Total: ~10–30 fills/min for `recent-trades` tape

**Expected book visual** (`/api/perp/markets/BTC-PERP/orderbook`):
- 12 distinct ask levels (red gradient from 5–100 bps above mid)
- 12 distinct bid levels (green gradient from 5–100 bps below mid)
- Spread typically 10–20 bps (anchor maintains near-best)

## Acceptance criteria

- `mint-30.sh` produces 30-account `.keys.json` successfully
- `pytest` passes (4 unit-test cases above + existing 30+)
- After `./deploy.sh`:
  - `systemctl --user is-active rocky-bot` returns `active`
  - `journalctl --user -u rocky-bot --since "30s ago"` shows tasks
    from at least 10 distinct `account_id` prefixes
  - `/api/perp/markets/BTC-PERP/orderbook` shows ≥ 8 distinct
    price levels per side within 2 minutes
- After 30 minutes:
  - `accounts.locked` for the 30 new users stays bounded (the
    margin-leak fix from 2026-05-24 plan applies here too)
  - `recent-trades` tape grows continuously, no `-2010` log spam

## Out of scope (future)

- Funnel parameter tuning UI / hot reload
- Symbol-specific qty curves (currently linear in offset_bps)
- WebSocket userData stream for sub-second fill notifications
- Multi-region bot deploy
- Replacing the 5 Taker accounts with smarter crossing logic
