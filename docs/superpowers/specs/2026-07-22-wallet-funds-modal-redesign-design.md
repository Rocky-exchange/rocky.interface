# Wallet Funds Modal Redesign

## Objective

Replace the current single-asset wallet funds dashboard with the approved five-view wallet modal shown in the July 22 UI reference. The modal must display real wallet, spot, and contract-account data; preserve the existing Canton deposit and withdrawal behavior; support USDA transfers between spot and contract accounts; and provide persistent transfer history.

## Scope

### Frontend

- Keep the existing wallet identity header, avatar editing, explorer link, overflow menu, disconnect action, and close action.
- Expand the desktop modal to approximately 960 px while retaining a nearly full-width mobile layout.
- Add top-level views: Assets, Deposit, Withdraw, History, and Transfer.
- Remove the old balance card, expandable action cards, and permanently visible history card.
- Continue using the existing Canton wallet session, wallet provider SDKs, funding asset configuration, amount formatting, and localization system.
- Do not add mock balances, fake addresses, or a QR code. The reference QR deposit flow is not valid for the connected Canton wallet transfer flow.

### Backend

- Reuse signed `SpotTransferred` ledger events as the source of persistent user transfer history.
- Mark user-initiated transfers separately from deposit-generated spot credits.
- Add an authenticated endpoint that returns only user-initiated transfers for the current wallet session.
- Do not introduce a second balance ledger or a duplicate transfer table.

## Information Architecture

The modal has a stable shell and one active content view.

### Header

The header remains visible while content scrolls. It contains the wallet logo or avatar, display name and Edit action, abbreviated party ID with copy action, explorer link, profile menu, and close button.

### Primary Navigation

The navigation contains five icon-and-text tabs:

1. Assets
2. Deposit
3. Withdraw
4. History
5. Transfer

The active tab uses the existing cool accent underline from the approved reference. Switching tabs must not close the modal or disconnect the wallet.

### Assets View

The default view lists USDA, CBTC, cETH, and CC in one table. Each row contains:

- Market-derived token icon and wallet-facing symbol.
- Connected wallet balance.
- Spot exchange balance.
- A row action that selects the asset and opens Deposit.

The toolbar provides an asset filter, text search, and refresh icon. Search is case-insensitive and filters symbols and display names. Refresh updates wallet balances, spot balances, and funds history without changing the selected tab.

### Deposit View

The view contains a back action, asset selector, wallet balance, amount input, available/max affordance, and submit button. Submission continues to use the existing connected-wallet transfer flow and deposit reference API. Successful submission refreshes balances and history. Pending platform credit remains visible as a submitted history item until polling confirms it.

### Withdraw View

The view contains a back action, asset selector, destination wallet party, spot available balance, amount input, native-asset fee quote, calculated receive amount, and submit button. Withdrawals continue to debit only the spot account. Existing insufficient-balance and invalid-session handling remains authoritative.

### History View

The view combines deposits, withdrawals, and user-initiated USDA transfers in reverse chronological order. Filters are All, Deposit, Withdraw, and Transfer. Each row shows type, timestamp, signed amount, asset, status, and the appropriate explorer/copy action when an external transaction identifier exists. Transfer rows show their account direction and Completed status without inventing a chain transaction hash.

### Transfer View

The view supports USDA only. It contains From and To account selectors, a swap-direction icon, both available balances, asset display, amount input, Max affordance, and submit button.

- Spot Account maps to `ledger.spot_balances`.
- Futures Account maps to the contract/funding `ledger.accounts` balance.
- `Spot -> Futures` sends `direction: "toFunding"`.
- `Futures -> Spot` sends `direction: "toSpot"`.
- The UI prevents identical source and destination accounts.
- A successful transfer refreshes both balances and persistent transfer history.

## Backend Event Contract

`LedgerEvent::SpotTransferred` gains a backward-compatible optional source field. New values are:

- `USER`: an explicit `/v1/spot/transfer` request and eligible for transfer history.
- `DEPOSIT`: an automatic spot credit caused by a wallet deposit and excluded from transfer history.

Old events without the field remain readable and are excluded because their origin cannot be proven.

`GET /v1/spot/transfers` uses the existing exchange wallet session bearer token. It derives both the funding user and spot user from the session, then returns signed events where both IDs match and `source = USER`.

Response shape:

```json
{
  "transfers": [
    {
      "eventId": "uuid",
      "asset": "USDA",
      "amount": "1.25",
      "direction": "toSpot",
      "createdAt": "2026-07-22T08:00:00Z"
    }
  ]
}
```

Results are ordered newest first and limited to the latest 200 records. The endpoint is read-only and does not expose other users' events.

## Frontend Components

`CantonFundsModal` remains the integration boundary but is divided into focused internal components in the same module or adjacent files:

- `WalletModalHeader`
- `WalletModalNavigation`
- `AssetsView`
- `DepositView`
- `WithdrawView`
- `HistoryView`
- `TransferView`
- Shared asset selector, amount field, balance value, and history row components

Data fetching and mutation handlers remain owned by the modal controller. Presentational views receive typed values and callbacks and do not call APIs directly.

## State And Data Flow

- One refresh operation loads the wallet snapshot, all four spot balances, deposit/withdraw history, and transfer history in parallel.
- The selected asset is shared by Assets, Deposit, and Withdraw.
- The Transfer view always uses USDA and maintains its own direction and amount state.
- Server history is merged with optimistic local rows using stable deposit, withdrawal, and transfer identifiers.
- Successful mutations clear only the relevant amount field and preserve the current view.
- Closing the modal cancels pending deposit polling and clears transient notices.

## Error Handling

- Invalid exchange sessions continue through the centralized disconnect flow.
- A locked wallet closes the modal without destroying a valid exchange session.
- Partial refresh failures preserve the last successful data and show an inline error in the active view.
- Mutation buttons are disabled during submission and while required values are invalid.
- Empty and loading states keep stable dimensions so the modal does not jump.
- Unknown assets and malformed amounts are rejected before API submission.

## Accessibility And Responsive Behavior

- Tabs use button semantics and expose the active state with `aria-current` or `aria-selected`.
- Icon-only actions have localized accessible names and hover tooltips.
- Focus states remain visible against the dark surface.
- Desktop uses the approved dense table layout at up to 960 px.
- Below 720 px, asset rows become compact stacked rows and operation views use one column.
- All controls remain at least 40 px tall and text must not overlap or truncate critical amounts.

## Verification

Focused tests cover:

- Assets view renders all four real assets and filtering works.
- Navigation switches views without losing selected asset state.
- Deposit and withdrawal submit the existing payloads.
- USDA transfer maps both directions correctly and refreshes balances.
- Transfer history excludes deposit-generated `SpotTransferred` events.
- Unified history filters and ordering work.
- Invalid-session and locked-wallet regressions remain covered.

Run frontend unit tests, TypeScript checks, production build, backend unit tests for event serialization and route filtering, and `git diff --check`. Start the local app and capture desktop and mobile Playwright screenshots for comparison with the approved UI reference. Verify no overlap, clipping, blank content, or unexpected mock data.

