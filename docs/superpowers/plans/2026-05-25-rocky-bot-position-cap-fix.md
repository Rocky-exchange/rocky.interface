# rocky-bot Position-Cap Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the 30-account funnel from saturating wallet margin by adding position-cap gating to all 3 strategies and tightening `max_notional_usdc` from $200 → $150.

**Architecture:** Each iteration queries `position_risk(symbol)` before deciding whether to place. If filling the new order would push `|position| × markPrice > cap`, the strategy cancels its stale same-side order and skips placing. Position-reducing moves are never gated. Self-draining steady state replaces monotonic growth.

**Tech Stack:** Python 3.12, asyncio, httpx, pytest, ruff. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-rocky-bot-position-cap-fix-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac is code-only. Allowed: `pytest`, `ruff`, `python -m py_compile`. **NOT allowed:** running the bot, docker, systemctl.
- Working dir: `/Users/ubuntu/Desktop/Rocky/rocky-bot/`. Branch: `main`. HEAD: `d858ecd`. 11 commits unpushed.
- Deploy: `./deploy.sh` (rsync + scp .env + scp .keys.json + uv pip install + systemctl --user restart). ssh ControlMaster already enabled (commits `ed23a13`, `9215324`).
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- Bot is **currently inactive** on EC2 (T8 stopped it). Saturated accounts still have positions + locked margin until T5's pre-deploy SQL reset.
- `.keys.json` is already present locally AND on EC2 — no re-mint, no re-seed.
- Funnel geometry unchanged. The 30 user_ids in `.keys.json` are reused.
- Do NOT `git push` until T5 acceptance criteria pass.

---

## File Structure

**Modified:**
- `rocky-bot/rocky_bot/strategies/ladder.py` — insert position-cap gating block in `iterate_once` (between wallet poll and open-orders fetch)
- `rocky-bot/rocky_bot/strategies/anchor.py` — same gating, applied independently in the `ensure()` closure per side
- `rocky-bot/rocky_bot/strategies/taker.py` — no code change (existing cancel-all-prior loop already cancels growing-side orders when at cap); test-only addition documents the behavior
- `rocky-bot/rocky_bot/main.py` — change `CircuitBreaker(RiskCaps())` to `CircuitBreaker(RiskCaps(max_notional_usdc=150.0))`
- `rocky-bot/tests/test_ladder.py` — add 2 tests
- `rocky-bot/tests/test_anchor.py` — add 2 tests
- `rocky-bot/tests/test_taker.py` — add 1 test

**Untouched:**
- `risk.py` (RiskCaps field already exists; default just overridden in main.py)
- `accounts.py`, `config.py`, `binance_feed.py`, `rocky_client.py`, `sign.py`, `symbol_map.py`
- `scripts/mint-30.sh`, `deploy.sh`, `.keys.json`
- rocky-backend (margin-release-on-fill already correct from commit `7709280`)

**Test count progression:** 46 (current) → 48 (after T1) → 50 (after T2) → 51 (after T3) → 51 (after T4, no new tests).

---

## Task 1: LadderMakerLoop — position-cap gating + 2 tests

**Files:**
- Modify: `rocky-bot/rocky_bot/strategies/ladder.py` (insert gating block)
- Modify: `rocky-bot/tests/test_ladder.py` (append 2 tests)

- [ ] **Step 1.1: Append 2 failing tests to `tests/test_ladder.py`**

Open the existing `tests/test_ladder.py` and append (at the END of the file) these two new test functions:

```python
@pytest.mark.asyncio
async def test_skips_place_when_position_would_exceed_cap():
    """BUY ladder when position is near long cap: should not place; should
    cancel stale same-side order to free its margin."""
    client = AsyncMock()
    client.balance.return_value = [{"asset": "USDC", "balance": "100"}]
    # Cap defaults to 200. positionAmt 1.9 × markPrice 100 = 190 notional.
    # qty 0.5 would push to 2.4 × 100 = 240 > 200 cap → gate.
    client.position_risk.return_value = [
        {"positionAmt": "1.9", "markPrice": "100"}
    ]
    # A stale BUY order exists at 99.95
    client.open_orders.return_value = [
        {"orderId": "stale", "side": "BUY", "price": "99.95", "symbol": "BTCUSDT"}
    ]
    client.cancel_order.return_value = {"status": "CANCELED"}

    loop = _loop(client, side="BUY", offset_bps=5, qty="0.5")
    await loop.iterate_once()

    # Cancel WAS called (free the stale same-side order)
    client.cancel_order.assert_called_once()
    assert client.cancel_order.call_args.kwargs["order_id"] == "stale"
    # Place was NOT called (we're at cap)
    client.place_order.assert_not_called()


@pytest.mark.asyncio
async def test_places_when_position_reducing():
    """SELL ladder with long position: reduces inventory → never gated."""
    client = AsyncMock()
    client.balance.return_value = [{"asset": "USDC", "balance": "100"}]
    # Long 2.5 × 100 = 250 (already over 200 cap), but SELL reduces it:
    # would_be = 2.5 + (-0.5) = 2.0 × 100 = 200 (≤ cap) → place allowed.
    client.position_risk.return_value = [
        {"positionAmt": "2.5", "markPrice": "100"}
    ]
    client.open_orders.return_value = []
    client.place_order.return_value = {"orderId": "x"}

    loop = _loop(client, side="SELL", offset_bps=5, qty="0.5")
    await loop.iterate_once()

    client.place_order.assert_called_once()
    assert client.place_order.call_args.kwargs["side"] == "SELL"
```

- [ ] **Step 1.2: Run new tests, expect FAIL (mock returns no position_risk yet OR mock returns truthy by default and asserts mismatch)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
source .venv/bin/activate
pytest tests/test_ladder.py::test_skips_place_when_position_would_exceed_cap tests/test_ladder.py::test_places_when_position_reducing -v 2>&1 | tail -20
```

Expected: both tests FAIL. The current `LadderMakerLoop` never calls `position_risk` and never gates, so:
- `test_skips_place_when_position_would_exceed_cap` will see `place_order` called (assertion fails)
- `test_places_when_position_reducing` will pass coincidentally because no gate exists — but the assertion `place_order.assert_called_once()` should match (it places anyway). Actually this test may pass even pre-implementation since the existing behavior places when no live order exists.

If `test_places_when_position_reducing` passes pre-implementation, that's fine — it's a regression-prevention test confirming the new gating doesn't accidentally over-gate reducing moves.

- [ ] **Step 1.3: Implement the gating block in `ladder.py`**

Replace the `iterate_once` method in `rocky_bot/strategies/ladder.py` (lines 60–103) with this new version. The change inserts a position-cap gating block right after the wallet poll and before the open-orders fetch:

```python
    async def iterate_once(self):
        if self.circuit.is_open():
            return
        try:
            mid = self.feed.mid(self.symbol)
        except StaleFeedError:
            return

        binance_sym = rocky_to_binance(self.symbol) or self.symbol
        sign = Decimal("1") if self.side == "SELL" else Decimal("-1")
        target = (mid * (Decimal("1") + sign * Decimal(self.offset_bps) / Decimal("10000"))).quantize(
            Decimal("0.01")
        )

        # Wallet poll for max_loss tracking (per-account CircuitBreaker.update_wallet).
        balances = await self.client.balance()
        self.circuit.record_api_success()
        for b in balances:
            if b["asset"] == "USDC":
                try:
                    self.circuit.update_wallet(float(b["balance"]))
                except (KeyError, ValueError):
                    pass
                break

        # Position-cap gate: skip placing if filling this order would grow
        # |position| × markPrice past the per-account cap. Stale same-side
        # order is cancelled to free its margin.
        positions = await self.client.position_risk(symbol=binance_sym)
        self.circuit.record_api_success()
        pos_amt = Decimal(str(positions[0]["positionAmt"])) if positions else Decimal("0")
        mark = Decimal(str(positions[0]["markPrice"])) if positions else mid
        place_sign = Decimal("1") if self.side == "BUY" else Decimal("-1")
        would_be = pos_amt + place_sign * self.qty
        would_be_notional = abs(would_be * mark)
        cap = Decimal(str(self.circuit.caps.max_notional_usdc))
        if would_be_notional > cap:
            existing = await self.client.open_orders(symbol=binance_sym)
            live = next((o for o in existing if o.get("side") == self.side), None)
            if live is not None:
                await self.client.cancel_order(symbol=binance_sym, order_id=str(live["orderId"]))
            log.info(
                "ladder[%s,%s] at cap: pos=%.6f mark=%.2f would_be_notional=%.2f cap=%.2f → skip place",
                self.account_id, self.symbol, float(pos_amt), float(mark),
                float(would_be_notional), float(cap),
            )
            return

        existing = await self.client.open_orders(symbol=binance_sym)
        # Find our own side's order(s) — ignore other sides
        live = next((o for o in existing if o.get("side") == self.side), None)

        if live is not None:
            drift = abs(Decimal(str(live["price"])) - target) / target
            if drift <= DRIFT_BPS:
                return  # in-place, nothing to do
            await self.client.cancel_order(symbol=binance_sym, order_id=str(live["orderId"]))
            live = None

        if live is None:
            await self.client.place_order(
                symbol=binance_sym,
                side=self.side,
                order_type="LIMIT",
                quantity=str(self.qty),
                price=str(target),
            )
```

- [ ] **Step 1.4: Run all ladder tests — expect 8 passed**

```bash
pytest tests/test_ladder.py -v 2>&1 | tail -15
```

Expected: 6 prior tests + 2 new = 8 passed.

If `test_no_action_when_existing_order_within_drift` or `test_cancel_and_replace_when_drifted` fails, it's because the existing mocks don't stub `position_risk` and `AsyncMock` returns a default that the new code chokes on. AsyncMock's auto-return is a coroutine wrapping another AsyncMock, which when subscripted `[0]` returns another AsyncMock — won't have `positionAmt`. The existing tests need a non-empty `position_risk` return value that wouldn't trigger the gate. Solution: add to the existing test setup OR adjust the new gating code to gracefully handle missing positions.

The recommended fix is to update the existing tests' setup to add a benign position:

For each of the prior tests (`test_places_one_order_at_target_price_when_book_empty`, `test_sell_offset_above_mid`, `test_no_action_when_existing_order_within_drift`, `test_cancel_and_replace_when_drifted`, `test_ignores_orders_for_other_side`), add this line just after `client.balance.return_value = ...`:

```python
    client.position_risk.return_value = [{"positionAmt": "0", "markPrice": "100"}]
```

(`test_skips_when_circuit_open` doesn't need it — circuit-open path returns before position_risk is called.)

- [ ] **Step 1.5: Run all ladder tests again — expect 8 passed**

```bash
pytest tests/test_ladder.py -v 2>&1 | tail -15
```

Expected: 8 passed.

- [ ] **Step 1.6: Run full suite — expect 48 passed (no regressions)**

```bash
pytest 2>&1 | tail -3
```

Expected: 48 passed (46 prior + 2 new).

- [ ] **Step 1.7: ruff clean**

```bash
ruff check rocky_bot/strategies/ladder.py tests/test_ladder.py 2>&1 | tail -3
```

Expected: `All checks passed!`.

- [ ] **Step 1.8: Commit**

```bash
git add rocky_bot/strategies/ladder.py tests/test_ladder.py
git commit -m "fix(ladder): position-cap gate before placing

Query position_risk(symbol) each iteration. If filling the new order
would grow |position| × markPrice past caps.max_notional_usdc, cancel
the stale same-side order (frees its margin) and skip placing.
Position-reducing moves never gated."
```

---

## Task 2: AnchorMakerLoop — per-side position-cap gating + 2 tests

**Files:**
- Modify: `rocky-bot/rocky_bot/strategies/anchor.py` (modify the `ensure()` closure)
- Modify: `rocky-bot/tests/test_anchor.py` (append 2 tests, update prior tests)

- [ ] **Step 2.1: Append 2 failing tests to `tests/test_anchor.py`**

Append at the END of `tests/test_anchor.py`:

```python
@pytest.mark.asyncio
async def test_gates_buy_side_only_when_long():
    """Anchor long enough that BUY would push over cap, but SELL still
    reduces it. BUY half should be gated (cancel stale + no place);
    SELL half should place normally."""
    client = AsyncMock()
    client.balance.return_value = [{"asset": "USDC", "balance": "100"}]
    # positionAmt 1.9 × markPrice 100 = 190 notional. Cap default 200.
    # qty 0.3: BUY → would_be 2.2 × 100 = 220 > 200 (gate BUY).
    #         SELL → would_be 1.6 × 100 = 160 ≤ 200 (allow SELL).
    client.position_risk.return_value = [
        {"positionAmt": "1.9", "markPrice": "100"}
    ]
    client.open_orders.return_value = [
        {"orderId": "stale-buy", "side": "BUY", "price": "99.99", "symbol": "BTCUSDT"},
    ]
    client.cancel_order.return_value = {"status": "CANCELED"}
    client.place_order.return_value = {"orderId": "x"}

    loop = AnchorMakerLoop(
        client=client, feed=FakeFeed(), symbol="BTC-PERP",
        account_id="mm-anchor", qty=Decimal("0.3"),
        circuit=CircuitBreaker(RiskCaps()),
    )
    await loop.iterate_once()

    # Stale BUY cancelled
    assert any(
        c.kwargs.get("order_id") == "stale-buy"
        for c in client.cancel_order.call_args_list
    )
    # place_order called ONCE, for SELL (BUY half was gated)
    assert client.place_order.call_count == 1
    assert client.place_order.call_args.kwargs["side"] == "SELL"


@pytest.mark.asyncio
async def test_gates_both_sides_independently_when_flat():
    """Anchor flat: neither side gated, both place normally — confirms
    the new gating doesn't accidentally couple the two sides."""
    client = AsyncMock()
    client.balance.return_value = [{"asset": "USDC", "balance": "100"}]
    client.position_risk.return_value = [
        {"positionAmt": "0", "markPrice": "100"}
    ]
    client.open_orders.return_value = []
    client.place_order.return_value = {"orderId": "x"}

    loop = AnchorMakerLoop(
        client=client, feed=FakeFeed(), symbol="BTC-PERP",
        account_id="mm-anchor", qty=Decimal("0.3"),
        circuit=CircuitBreaker(RiskCaps()),
    )
    await loop.iterate_once()

    assert client.place_order.call_count == 2
    sides = sorted(c.kwargs["side"] for c in client.place_order.call_args_list)
    assert sides == ["BUY", "SELL"]
```

- [ ] **Step 2.2: Patch existing anchor tests to stub position_risk**

For each prior test in `tests/test_anchor.py` (`test_places_both_bid_and_ask_when_no_open_orders`, `test_skips_when_orders_within_drift`, `test_cancels_drifted_bid_only`) — add this line right after `client.balance.return_value = ...`:

```python
    client.position_risk.return_value = [{"positionAmt": "0", "markPrice": "100"}]
```

(`test_skips_when_circuit_open` is unaffected — circuit-open path returns before position_risk is called.)

- [ ] **Step 2.3: Run anchor tests, expect 2 new FAIL**

```bash
pytest tests/test_anchor.py -v 2>&1 | tail -10
```

Expected: prior 4 tests still pass, new 2 fail because there's no gating yet.

- [ ] **Step 2.4: Implement per-side gating in `anchor.py`**

Replace the `iterate_once` method in `rocky_bot/strategies/anchor.py` (lines 57–98) with this new version. The change adds a position fetch and gates each side independently inside `ensure()`:

```python
    async def iterate_once(self):
        if self.circuit.is_open():
            return
        try:
            mid = self.feed.mid(self.symbol)
        except StaleFeedError:
            return

        binance_sym = rocky_to_binance(self.symbol) or self.symbol
        target_bid = (mid * (Decimal("1") - ANCHOR_OFFSET_BPS / Decimal("10000"))).quantize(Decimal("0.01"))
        target_ask = (mid * (Decimal("1") + ANCHOR_OFFSET_BPS / Decimal("10000"))).quantize(Decimal("0.01"))

        balances = await self.client.balance()
        self.circuit.record_api_success()
        for b in balances:
            if b["asset"] == "USDC":
                try:
                    self.circuit.update_wallet(float(b["balance"]))
                except (KeyError, ValueError):
                    pass
                break

        positions = await self.client.position_risk(symbol=binance_sym)
        self.circuit.record_api_success()
        pos_amt = Decimal(str(positions[0]["positionAmt"])) if positions else Decimal("0")
        mark = Decimal(str(positions[0]["markPrice"])) if positions else mid
        cap = Decimal(str(self.circuit.caps.max_notional_usdc))

        existing = await self.client.open_orders(symbol=binance_sym)
        live_bid = next((o for o in existing if o.get("side") == "BUY"), None)
        live_ask = next((o for o in existing if o.get("side") == "SELL"), None)

        async def ensure(target_price: Decimal, side: str, live):
            # Per-side position-cap gate.
            place_sign = Decimal("1") if side == "BUY" else Decimal("-1")
            would_be = pos_amt + place_sign * self.qty
            if abs(would_be * mark) > cap:
                if live is not None:
                    await self.client.cancel_order(symbol=binance_sym, order_id=str(live["orderId"]))
                log.info(
                    "anchor[%s,%s,%s] at cap: pos=%.6f mark=%.2f would=%.2f cap=%.2f → skip",
                    self.account_id, self.symbol, side, float(pos_amt), float(mark),
                    float(abs(would_be * mark)), float(cap),
                )
                return
            if live is not None:
                drift = abs(Decimal(str(live["price"])) - target_price) / target_price
                if drift <= DRIFT_BPS:
                    return
                await self.client.cancel_order(symbol=binance_sym, order_id=str(live["orderId"]))
            await self.client.place_order(
                symbol=binance_sym,
                side=side,
                order_type="LIMIT",
                quantity=str(self.qty),
                price=str(target_price),
            )

        await ensure(target_bid, "BUY", live_bid)
        await ensure(target_ask, "SELL", live_ask)
```

- [ ] **Step 2.5: Run anchor tests — expect 6 passed**

```bash
pytest tests/test_anchor.py -v 2>&1 | tail -10
```

Expected: 6 passed (4 prior + 2 new).

- [ ] **Step 2.6: Run full suite — expect 50 passed**

```bash
pytest 2>&1 | tail -3
```

Expected: 50 passed (48 + 2 new).

- [ ] **Step 2.7: ruff clean**

```bash
ruff check rocky_bot/strategies/anchor.py tests/test_anchor.py 2>&1 | tail -3
```

- [ ] **Step 2.8: Commit**

```bash
git add rocky_bot/strategies/anchor.py tests/test_anchor.py
git commit -m "fix(anchor): per-side position-cap gate inside ensure()

Each side checked independently. BUY half can be capped while SELL
half places normally (and vice versa). When capped, the stale order
on that side is cancelled to free margin."
```

---

## Task 3: TakerLoop — add 1 regression-prevention test (no code change)

**Files:**
- Modify: `rocky-bot/tests/test_taker.py` (append 1 test)

**Why no code change?** The existing `TakerLoop.iterate_once` already:
1. Queries `position_risk` and flips `side` to the reducing direction when `notional > cap` (lines 70–80 of `taker.py`)
2. Unconditionally cancels ALL prior orders on the symbol before placing the new aggressive limit (lines 90–95)

So the "cancel growing-side at cap" behavior is incidentally provided by the cancel-all loop. The test below pins this behavior so a future cleanup doesn't accidentally remove the cancel-growing-side property.

- [ ] **Step 3.1: Append 1 test to `tests/test_taker.py`**

Append at the END of `tests/test_taker.py`:

```python
@pytest.mark.asyncio
async def test_cancels_growing_side_order_when_at_cap():
    """When taker is over cap: side flips to reducing, AND any existing
    growing-side open order gets cancelled before the new order is placed."""
    client = AsyncMock()
    client.balance.return_value = [{"asset": "USDC", "balance": "100"}]
    # positionAmt 2.5 × markPrice 100 = 250 notional > 200 cap → side flips to SELL.
    client.position_risk.return_value = [
        {"positionAmt": "2.5", "markPrice": "100"}
    ]
    # Existing BUY (growing) order — should be cancelled.
    client.open_orders.return_value = [
        {"orderId": "growing", "side": "BUY", "price": "99.50", "symbol": "BTCUSDT"},
    ]
    client.cancel_order.return_value = {"status": "CANCELED"}
    client.place_order.return_value = {"orderId": "new"}

    loop = TakerLoop(
        client=client, feed=FakeFeed("100"), symbol="BTC-PERP",
        circuit=CircuitBreaker(RiskCaps()),
        rng=_DeterministicRNG(),
    )
    await loop.iterate_once()

    # Growing-side order cancelled
    assert any(
        c.kwargs.get("order_id") == "growing"
        for c in client.cancel_order.call_args_list
    )
    # New aggressive order placed on SELL (reducing) side
    assert client.place_order.call_count == 1
    assert client.place_order.call_args.kwargs["side"] == "SELL"
```

If `_DeterministicRNG` / `FakeFeed` are not already defined in `tests/test_taker.py`, check the file's existing fixtures — the existing tests must define them in some form. If they use different names (e.g., `FakeRng`, `FakeMid`), substitute. **Read the top of `tests/test_taker.py` first to see the existing patterns and use them.**

- [ ] **Step 3.2: Run the new test — expect PASS (existing code already does this)**

```bash
pytest tests/test_taker.py::test_cancels_growing_side_order_when_at_cap -v 2>&1 | tail -10
```

Expected: PASS. If FAIL, check that the fixtures (`FakeFeed`, `_DeterministicRNG`) match what the file uses. The test asserts behavior already present in `iterate_once`; if it fails, the fixtures are wrong, not the code.

- [ ] **Step 3.3: Run full taker tests + full suite — expect 51 passed**

```bash
pytest tests/test_taker.py 2>&1 | tail -3
pytest 2>&1 | tail -3
```

Expected: 4 taker tests passed (3 prior + 1 new), full suite 51 passed.

- [ ] **Step 3.4: ruff clean**

```bash
ruff check tests/test_taker.py 2>&1 | tail -3
```

- [ ] **Step 3.5: Commit**

```bash
git add tests/test_taker.py
git commit -m "test(taker): pin cancel-growing-side-when-at-cap behavior

The existing cancel-all-prior loop incidentally provides this; the
test prevents a future refactor from accidentally narrowing it."
```

---

## Task 4: main.py — tighten cap to $150 per account

**Files:**
- Modify: `rocky-bot/rocky_bot/main.py` (one-line tweak)

- [ ] **Step 4.1: Change `RiskCaps()` to `RiskCaps(max_notional_usdc=150.0)`**

In `rocky_bot/main.py`, find line 36:

```python
    circuits: dict[str, CircuitBreaker] = {acc.id: CircuitBreaker(RiskCaps()) for acc in accounts}
```

Change to:

```python
    circuits: dict[str, CircuitBreaker] = {
        acc.id: CircuitBreaker(RiskCaps(max_notional_usdc=150.0)) for acc in accounts
    }
```

(Same value uniformly for all 30 accounts. Per-role differentiation is deliberately deferred.)

- [ ] **Step 4.2: Smoke-compile**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
source .venv/bin/activate
python -m py_compile rocky_bot/main.py 2>&1
```

Expected: no output.

- [ ] **Step 4.3: Run full suite — expect 51 passed (no regressions)**

```bash
pytest 2>&1 | tail -3
```

- [ ] **Step 4.4: ruff clean (broad check)**

```bash
ruff check rocky_bot/ tests/ 2>&1 | tail -3
```

- [ ] **Step 4.5: Commit**

```bash
git add rocky_bot/main.py
git commit -m "fix(main): tighten max_notional_usdc to 150 per account

\$150 per (account, symbol) → max \$30 position margin + ~\$6 order margin
= ~\$36 max locked. \$64 wallet headroom for fee accrual + order rotation."
```

---

## Task 5: EC2 reset + deploy + 30-min monitor + push

**Files:** none modified.

### Step 5.1: Verify local state before touching EC2

- [ ] **Step 5.1.1: Confirm 14–15 unpushed commits on main**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git log --oneline origin/main..HEAD
```

Expected: 14 commits (11 from prior plan + 3 from T1/T2/T3 + 1 from T4 = 15 if T3 produced a commit, otherwise 14). All on main branch.

- [ ] **Step 5.1.2: Confirm `.keys.json` still present locally**

```bash
test -s /Users/ubuntu/Desktop/Rocky/rocky-bot/.keys.json && \
  python3 -c "import json; d=json.load(open('/Users/ubuntu/Desktop/Rocky/rocky-bot/.keys.json')); print(f'accounts={len(d[\"accounts\"])}, base={d[\"rocky_fapi_url\"]}')"
```

Expected: `accounts=30, base=https://demo.rocky.exchange`.

### Step 5.2: Reset perp positions + locked margin on EC2 (clean slate)

The 30 funnel accounts each carry residual positions + locked margin from the T8 saturation. Zero them so the cap-gating fix has a clean starting point.

- [ ] **Step 5.2.1: Discover position-table schema (in case column names differ)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c '\\dt ledger.*'"
```

Expected: table list including `ledger.accounts`, `ledger.positions` (or similar), `ledger.orders`, `ledger.trades`.

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c '\\d ledger.positions'"
```

Note the actual column names. If `position_amt` is named differently (e.g., `quantity`, `size`), adapt the UPDATE in the next step.

- [ ] **Step 5.2.2: Zero positions + reset locked margin for the 30 funnel accounts**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 bash <<'REMOTE'
docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky <<'SQL'
-- Zero perp positions for any user labelled mm-* or taker-*
UPDATE ledger.positions
  SET position_amt = 0, updated_at = now()
  WHERE user_id IN (
    SELECT user_id FROM auth.api_keys
    WHERE label LIKE 'mm-%' OR label LIKE 'taker-%'
  );

-- Return all locked margin to available for those USDC accounts
UPDATE ledger.accounts
  SET available = available + locked, locked = 0
  WHERE asset = 'USDC' AND user_id IN (
    SELECT user_id FROM auth.api_keys
    WHERE label LIKE 'mm-%' OR label LIKE 'taker-%'
  );

-- Cancel any still-open orders for those accounts (stop next bot from inheriting stale orders)
UPDATE ledger.orders
  SET status = 'CANCELED', updated_at = now()
  WHERE status = 'OPEN' AND user_id IN (
    SELECT user_id FROM auth.api_keys
    WHERE label LIKE 'mm-%' OR label LIKE 'taker-%'
  );

-- Sanity-check: count and a sample
SELECT count(*) AS funnel_accounts,
       round(min(available)::numeric, 2) AS min_avail,
       round(max(available)::numeric, 2) AS max_avail,
       round(sum(locked)::numeric, 2) AS sum_locked
  FROM ledger.accounts
  WHERE asset = 'USDC' AND user_id IN (
    SELECT user_id FROM auth.api_keys
    WHERE label LIKE 'mm-%' OR label LIKE 'taker-%'
  );
SQL
REMOTE
```

Expected: `funnel_accounts=30, min_avail≈100.00, max_avail≈100.00, sum_locked=0.00`.

If the schema differs (column not found, table named differently), use the discovery output from 5.2.1 to adapt. The intent: all 30 funnel accounts back to `$100 available, $0 locked, position_amt = 0`.

### Step 5.3: Deploy

- [ ] **Step 5.3.1: Run deploy.sh**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
./deploy.sh
```

Expected sequence: rsync → scp .env → scp .keys.json → uv pip install (--allow-existing) → systemctl --user restart rocky-bot.

If the script fails on rsync (broken pipe), re-run — it's idempotent. If it fails because `.env` or `.keys.json` is missing locally, STOP — that's a real failure, escalate.

- [ ] **Step 5.3.2: Verify bot started clean**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user is-active rocky-bot; journalctl --user -u rocky-bot --since "1 min ago" --no-pager | grep -E "rocky-bot started|ERROR|Traceback" | head -10'
```

Expected:
- `active`
- A log line: `INFO rocky_bot.main: rocky-bot started: accounts=30 (ladder=24, anchor=1, taker=5), symbols=['BTC-PERP', 'ETH-PERP'], base=https://demo.rocky.exchange, tasks=61`
- No `ERROR` or `Traceback`

### Step 5.4: 30-minute monitor

- [ ] **Step 5.4.1: Sample at t=2min, t=12min, t=22min, t=32min**

Run this script in the foreground. It samples `locked`/`available` four times over ~30 minutes via separate SSH calls (NOT a single SSH with `sleep 600` — that hangs the connection without keepalive).

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 1 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'

sleep 600

ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 2 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'

sleep 600

ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 3 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'

sleep 600

ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 4 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'

ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "echo '=== -2010 count last 30 min ==='; journalctl --user -u rocky-bot --since '30 min ago' --no-pager 2>&1 | grep -c '\\-2010'; echo '=== recent trades ==='; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c \"SELECT symbol, side, price, qty, ts FROM ledger.trades ORDER BY ts DESC LIMIT 3\""
```

Expected per sample: `max_locked, avg_locked, over_50, over_80`. Acceptance criteria:
- **Sample 4 `max(locked) < 50`** (strict — was the spec's pre-acceptance metric)
- **All 4 samples: `over_80 == 0`**
- **`-2010` count < 30**
- Recent trades tape shows fills within the last minute (proves the bot is actively quoting)

If `max(locked)` is climbing across samples (sample1 < sample2 < sample3 < sample4) and any single sample exceeds $50, the cap gating is not working as designed. STOP, do NOT push, capture the latest sample output and report.

- [ ] **Step 5.4.2: If acceptance fails, stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 'systemctl --user stop rocky-bot'
```

Report status as `DONE_WITH_CONCERNS` with the sample output. Do NOT push.

### Step 5.5: Push to GitHub (only if 5.4 passed)

- [ ] **Step 5.5.1: Sanity check no extra changes**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git status --short
git log --oneline origin/main..HEAD | wc -l
```

Expected: empty status, ~14 commits ahead.

- [ ] **Step 5.5.2: Push**

```bash
git push origin main
```

Expected: success, all commits accepted.

- [ ] **Step 5.5.3: Verify clean**

```bash
git log --oneline origin/main..HEAD
```

Expected: empty output (everything pushed).

---

## Final Acceptance Checklist

- [ ] Full pytest passes (51 tests across all files)
- [ ] `ruff check rocky_bot/ tests/` clean
- [ ] EC2 SQL reset returned all 30 accounts to `$100 available, $0 locked`
- [ ] `./deploy.sh` completes; `systemctl --user is-active rocky-bot` → `active`
- [ ] Bot startup log shows `accounts=30 (ladder=24, anchor=1, taker=5), tasks=61`
- [ ] Sample 4 of the 30-min monitor: `max(locked) < $50`, `over_80 == 0`
- [ ] `-2010` count over 30 min < 30
- [ ] Recent trades tape shows activity within last minute
- [ ] `git push origin main` succeeded; `git log --oneline origin/main..HEAD` empty

When all checked, the 30-account funnel runs stably and the prior plan's 11 commits + this plan's fix commits are all on `origin/main`.
