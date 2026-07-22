# Wallet Funds Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved five-view wallet funds modal with real multi-asset balances, Canton deposit/withdraw flows, USDA account transfer, and persistent user transfer history.

**Architecture:** Keep signed ledger events as the transfer audit source. Extend `SpotTransferred` with a backward-compatible origin marker, expose an authenticated history route, then refactor `CantonFundsModal` into a stable shell with Assets, Deposit, Withdraw, History, and Transfer views driven by one controller.

**Tech Stack:** Rust, Axum, SQLx, Serde, React 18, TypeScript, SCSS modules, Lingui, Vitest, Playwright CLI.

---

### Task 1: Persist And Query User-Initiated Spot Transfers

**Files:**
- Modify: `rocky-backend/crates/events/src/ledger.rs`
- Modify: `rocky-backend/services/internal-ledger/src/service.rs`
- Modify: `rocky-backend/services/internal-ledger/src/chain_events.rs`
- Modify: `rocky-backend/services/api-gateway/src/spot/routes_transfer.rs`

- [ ] **Step 1: Add failing event and route tests**

Add tests that require a source marker and normalize only user-originated history rows:

```rust
#[test]
fn maps_user_transfer_event_to_history_item() {
    let item = transfer_history_item(event_with_source("USER")).unwrap();
    assert_eq!(item.direction, "toSpot");
    assert!(transfer_history_item(event_with_source("DEPOSIT")).is_none());
    assert!(transfer_history_item(event_with_source("")).is_none());
}
```

- [ ] **Step 2: Run the focused backend tests and confirm failure**

Run: `cargo test -p api-gateway routes_transfer --lib && cargo test -p rocky-events --lib`

Expected: failure because `source` and transfer history mapping do not exist.

- [ ] **Step 3: Extend the signed event contract**

Add a backward-compatible field:

```rust
SpotTransferred {
    user_id: Uuid,
    spot_user_id: Uuid,
    asset: String,
    amount: String,
    direction: String,
    #[serde(default)]
    source: Option<String>,
    ts_ms: i64,
}
```

Emit `Some("USER")` from explicit gRPC transfers and `Some("DEPOSIT")` from automatic deposit credits.

- [ ] **Step 4: Add authenticated transfer history**

Extend the existing spot transfer router:

```rust
Router::new()
    .route("/v1/spot/transfer", post(spot_transfer))
    .route("/v1/spot/transfers", get(spot_transfer_history))
```

Query `ledger.events` for `event_type = 'SpotTransferred'`, matching session funding user, derived spot user, and `payload->>'source' = 'USER'`. Return the latest 200 rows as camelCase JSON.

- [ ] **Step 5: Run backend tests**

Run: `cargo test -p rocky-events --lib && cargo test -p internal-ledger --lib && cargo test -p api-gateway routes_transfer --lib`

Expected: all tests pass.

- [ ] **Step 6: Commit backend changes**

```bash
git add crates/events/src/ledger.rs services/internal-ledger/src/service.rs services/internal-ledger/src/chain_events.rs services/api-gateway/src/spot/routes_transfer.rs
git commit -m "feat: expose spot transfer history"
```

### Task 2: Extend The Frontend Funds Data Layer

**Files:**
- Modify: `src/shared/lib/canton-wallet/funds.ts`
- Modify: `src/shared/lib/canton-wallet/funds.test.ts`

- [ ] **Step 1: Add failing API tests**

Test all-balance loading and persistent transfer history:

```ts
await expect(fetchSpotTransferHistory()).resolves.toEqual({
  transfers: [{ eventId: "event-1", asset: "USDA", amount: "1", direction: "toSpot", createdAt: "2026-07-22T08:00:00Z" }],
});
expect(fetch).toHaveBeenCalledWith("/v1/spot/transfers", expect.objectContaining({ headers: expect.any(Object) }));
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `yarn vitest run src/shared/lib/canton-wallet/funds.test.ts`

Expected: failure because `fetchSpotTransferHistory` is not exported.

- [ ] **Step 3: Implement typed data helpers**

Add `CantonSpotTransferHistoryItem`, `CantonSpotTransferHistory`, and:

```ts
export async function fetchSpotTransferHistory(): Promise<CantonSpotTransferHistory> {
  return requestJson<CantonSpotTransferHistory>("/v1/spot/transfers", {
    method: "GET",
    headers: exchangeSessionHeaders(),
  });
}
```

Add a helper that loads all `CANTON_FUNDING_ASSETS` spot balances in parallel while preserving partial successful results.

- [ ] **Step 4: Run the focused tests**

Run: `yarn vitest run src/shared/lib/canton-wallet/funds.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit the data layer**

```bash
git add src/shared/lib/canton-wallet/funds.ts src/shared/lib/canton-wallet/funds.test.ts
git commit -m "feat: load wallet transfer history"
```

### Task 3: Refactor The Wallet Modal Into Five Views

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.tsx`
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.module.scss`
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

- [ ] **Step 1: Add failing interaction tests**

Cover the visible behavior:

```tsx
expect(screen.getByRole("tab", { name: "Assets" })).toHaveAttribute("aria-selected", "true");
expect(screen.getByText("USDA")).toBeInTheDocument();
expect(screen.getByText("CBTC")).toBeInTheDocument();
fireEvent.click(screen.getByRole("tab", { name: "Transfer" }));
expect(screen.getByText("Spot Account")).toBeInTheDocument();
expect(screen.getByText("Futures Account")).toBeInTheDocument();
```

Add tests for search, navigation, transfer direction swap, submit payload, and History filter tabs.

- [ ] **Step 2: Run the modal tests and confirm failure**

Run: `yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

Expected: failure because the primary tabs and asset table are absent.

- [ ] **Step 3: Implement the modal controller and views**

Introduce:

```ts
type WalletView = "assets" | "deposit" | "withdraw" | "history" | "transfer";
type UnifiedHistoryType = "deposit" | "withdraw" | "transfer";
```

Keep fetching and mutation handlers in `CantonFundsModal`. Render focused view components for Assets, Deposit, Withdraw, History, and Transfer. Preserve profile editing, invalid-session handling, deposit polling, amount subscript formatting, market token icons, and localization.

- [ ] **Step 4: Implement approved styling**

Set the desktop modal width to `min(960px, calc(100vw - 48px))`, add the primary tab strip, dense assets table, operation headers, compact form rows, and responsive stacked rows below 720 px. Keep border radius at 4 px and use stable row/control dimensions.

- [ ] **Step 5: Run modal and Canton wallet tests**

Run: `yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts src/shared/lib/canton-wallet/funds.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit modal changes**

```bash
git add src/shared/lib/canton-wallet/CantonFundsModal.tsx src/shared/lib/canton-wallet/CantonFundsModal.module.scss src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
git commit -m "feat: redesign wallet funds modal"
```

### Task 4: Localize New Wallet UI Text

**Files:**
- Modify: `src/shared/locales/*/messages.po`
- Modify: `src/shared/locales/*/messages.js`

- [ ] **Step 1: Extract new messages**

Run: `yarn lingui:prepare`

Expected: catalogs contain Assets, History, Transfer, All Assets, Search asset, Spot Account, Futures Account, From, To, and View All History.

- [ ] **Step 2: Preserve existing translations and compile catalogs**

Use generated English fallbacks for untranslated languages and retain existing Chinese/French translations. Run: `yarn lingui:prepare`.

Expected: extraction and compilation exit successfully.

- [ ] **Step 3: Commit catalogs**

```bash
git add src/shared/locales
git commit -m "i18n: add wallet funds navigation labels"
```

### Task 5: Integrate And Verify

**Files:**
- Verify only; no planned production code changes.

- [ ] **Step 1: Rebase frontend work onto current main**

Run: `git fetch origin && git rebase origin/main`

Expected: the existing isolated spot balance commit and new modal commits are retained.

- [ ] **Step 2: Run frontend verification**

Run: `yarn vitest run src/shared/lib/canton-wallet src/modules/spot/components/Accounts/Accounts.test.tsx`

Run: `yarn tscheck`

Run: `yarn build`

Expected: all commands exit 0.

- [ ] **Step 3: Run backend verification**

Run: `cargo test -p rocky-events --lib && cargo test -p internal-ledger --lib && cargo test -p api-gateway routes_transfer --lib`

Expected: all commands exit 0.

- [ ] **Step 4: Capture visual evidence**

Verify `npx` exists, start the Vite app on an unused local port, open the wallet modal with controlled API responses, and capture desktop 1440x1100 and mobile 390x844 screenshots under `output/playwright/`. Compare the header, tab strip, asset rows, each operation view, and responsive layout against the approved reference.

- [ ] **Step 5: Final repository checks**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors and only intended commits/files.

