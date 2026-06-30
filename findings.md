# Findings & Decisions

## Requirements
- Stop the current wallet integration work.
- Plan a large structural migration for `rocky.interface`.
- `rocky.interface` was copied from `/Users/hellojk/git/xblade/primit/avax/primit-avax-interface` on branch `arbitrum`.
- `primit-avax-interface` has deleted many files; those deletions need to be synchronized into `rocky.interface`.
- `primit-avax-interface` is EVM-chain oriented.
- `rocky.interface` will be published on Canton, so EVM-specific chain logic must be removed, isolated, or replaced.
- Canton chain logic should be based on `/Users/hellojk/git/rocky/mtc-exchange`.

## Research Findings
- Initial status:
  - `rocky.interface`: `main...origin/main`
  - `primit-avax-interface`: `arbitrum`
  - `mtc-exchange`: `main...origin/main`
- Latest commits:
  - `rocky.interface`: `cd9f2a0 docs: refresh README and add CHANGELOG`
  - `primit-avax-interface`: `2fd81f13 fix(nav): align mobile menu labels`
  - `mtc-exchange`: `4796b83 feat(candles): aggregate 1w/1M from 1d in compat layer`
- Tracked file count comparison:
  - `rocky.interface`: 4057 tracked files
  - `primit-avax-interface` `arbitrum`: 3045 tracked files
  - Files in `rocky.interface` but not upstream: 1701
  - Files in upstream but not `rocky.interface`: 689
- Major `rocky.interface` extra-file groups versus upstream:
  - `sdk/build`: 609 files
  - `src/modules`: 603 files, mainly `src/modules/dex` and `src/modules/cex`
  - `src/shared`: 446 files, mainly old shared components/lib/img/config
  - `docs/superpowers`: 24 files
- Major upstream-only groups missing from `rocky.interface`:
  - `src/modules/lighter`: 508 files
  - `src/shared/styles`, `src/shared/ui`, `src/shared/components`, `src/shared/fonts`: newer shared surface
  - `e2e/mobile`: mobile Playwright tests and snapshots
  - upstream env/doc/workflow files
- `rocky.interface` already contains a partial `src/shared/lib/canton-wallet` implementation, including Console Wallet and Loop Wallet adapter files copied from the demo.
- The current wallet integration attempt should not proceed until repository pruning and module boundaries are decided.
- `rocky.interface/src/shared/lib/canton-wallet` now has Console, Loop, Rocky auth/session, preapproval redirect, balance helpers, session hooks, and a connect modal. Rocky Wallet embedded login/register is wired; full funds and callback ownership are still pending.
- `rocky.interface/src/shared/lib/wallets/useWallet.ts` currently maps a Canton party into a deterministic pseudo-EVM `0x...` address when a Canton session exists. This is a structural risk because many order/account/funds components still depend on EVM address, signer, chain, and wagmi assumptions.
- `rocky.interface/src/app/App.tsx` still installs global EVM/DEX providers: RainbowKit, GMX account context, token permits, DEX websocket/state providers, and CEX websocket provider. Upstream `primit-avax-interface/src/app/App.tsx` has already been trimmed to the smaller `lighter` app shell.
- `rocky.interface/src/modules/lighter/components/TopNav/TopNav.tsx` still imports `useZtdxAuth`, `useGmxAccountModalOpen`, DEX settings, RainbowKit connect modal, and global `useWallet`. Upstream has moved to `usePrimitAuth`, `TradingAccountContext`, upstream shared UI, and the newer `LighterTradeRuntimeProviders`.
- `primit-avax-interface/src/modules/lighter/providers/LighterTradeRuntimeProviders.tsx` is the new trading runtime boundary: Global state, settings, websocket, pending txns, subaccount, token permits, trading account, token balances, and synthetic events are scoped around the Lighter trade surface instead of being installed as old global app providers.
- `mtc-exchange` Canton funds behavior is broader than wallet connection. It includes exchange session creation (`/api/wallet/challenge`, `/api/wallet/verify`), deposit reference creation (`/api/deposits/reference`), provider-specific wallet transfers for Console/Loop, Rocky Wallet transfer preapproval, CC/USDCx credit routes, withdrawals, wallet balances, and USDCx offer acceptance.
- `mtc-exchange/src/lib/wallet/console.ts` and `loop.ts` already include transfer helpers for CC and USDCx. These should be reused as Canton wallet SDK adapters, not embedded directly in navigation UI.
- `mtc-exchange/src/lib/wallet/balances.ts` normalizes Console, Loop, and Rocky Wallet CC/USDCx balances and is a better source for the Canton wallet balance module than the current EVM token-balance/GMX account code.
- `mtc-exchange/src/lib/wallet/rocky.ts`, `balances.ts`, and `preapprovalRedirect.ts` are frontend-safe enough to reuse after small boundary changes. `preapprovalOAuth.ts` is Next/server-only and should not be copied into the Vite client.
- `mtc-exchange/src/components/TopNav.tsx` currently owns deposit/withdraw/preapproval/offer logic inline. When porting to `rocky.interface`, that behavior should be split into Canton funds API services and UI hooks/components.
- The frontend-safe part of the MTC funds flow is now split into `src/shared/lib/canton-wallet/funds.ts`. It wraps deposit reference creation, Rocky Wallet deposit API calls, Console/Loop SDK deposits, withdrawals, Rocky preapproval redirects, USDCx authorization, USDCx offer acceptance, and USDCx auto-accept API calls.
- Rocky Wallet CC and USDCx transfers should stay behind backend/API routes. The MTC implementation uses server-side wallet access cookies, validator API calls, and operator ledger auth that do not belong in a Vite client bundle.
- Console Wallet and Loop Wallet deposits can be browser-side because the existing SDK helpers submit transfers from the connected wallet and only need a backend-issued deposit reference.
- The connected Canton wallet button now opens a minimal `CantonFundsModal`; disconnect moved into that modal so the button can become the funds entry point.
- `CantonFundsModal` now includes copy affordances, Console Wallet pending USDCx offer visibility, Rocky Wallet USDCx auto-accept controls, and periodic balance/offer refresh while open.
- Pending USDCx offer listing is currently Console-only on the frontend. Rocky Wallet offer acceptance and auto-accept are supported via backend APIs, but no Rocky pending-offer listing API exists in the Vite-facing route set yet.
- Baseline `yarn tscheck` currently fails before migration changes. The failure is not a Canton implementation regression; it reflects the existing mixed state: old `dex/cex` files, missing `typechain-types/*`, duplicate React type trees from dependencies, stale custom API type exports, and Lighter adapter type mismatches.
- After the first sync/prune pass, `yarn tscheck` passes.
- The active trade route is now reduced to `/trade/:tradeType?` and uses upstream `LighterTradeRuntimeProviders`.
- Desktop and mobile trade navigation now open the Canton connect modal instead of RainbowKit/TradingAccount modal.
- `CantonConnectModal` is mounted at app level so both desktop and mobile share the same connect state.
- Route-disconnected upstream feature areas removed in this pass: `accounts`, `blog`, `bonus`, `earn`, `feeVip`, `leaderboard`, `points`, `referrals`, `BlogPage`, `TradingAccountModal`, `PrimitAuth`, and shared `Referrals`.
- Temporary no-op compatibility remains for old multichain/TradingAccount warning hooks where TypeScript still compiles broader source files.
- Remaining EVM/RainbowKit references are no longer on the main trade navigation path, but still exist in scaffolding under `src/shared/lib/wallets/**`, `TradingAccountContext`, `usePrimitAuth`, and selected old synthetics/multichain modules.
- Rocky Wallet login/register in `CantonConnectModal` now calls `/api/auth` or `/api/register`, persists Rocky auth data, then creates a Canton exchange session through `/api/wallet/challenge` and `/api/wallet/verify`.
- `useCantonSession()` now reads `getMtcAuthToken()` so Rocky Wallet `mtc_token` and `rocky_exchange_session` are treated as the Canton auth boundary.
- Vite dev proxy already forwards `/api` and `/auth` to the configured backend/demo host, so preapproval authorization can be delegated to `/api/wallet/preapproval/authorize` without client-side OAuth crypto.
- `vite.config.ts` previously still resolved `context`, `domain`, `pages`, `features`, and `typechain-types` aliases into the deleted `src/modules/dex` tree. Those runtime aliases now point to `src/modules/lighter`, and `yarn build` confirms Vite can resolve them.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use file-based planning for this migration | The task spans multiple repos, large deletions, and architecture changes. Persistent findings prevent losing context. |
| Start with recon and diff classification | The biggest risk is deleting Rocky-specific work or preserving stale EVM-only code accidentally. |
| Do not bulk-delete the 1701 `rocky.interface` extra files yet | Many are likely stale upstream files, but some are Rocky/Canton customizations or generated artifacts that need owner decisions. |
| Treat the pseudo-EVM address fallback as temporary broken scaffolding | It hides Canton/EVM mismatch and lets invalid EVM paths remain active. |
| Port upstream `lighter` structure before Canton wallet/funds work | The target should start from the smaller upstream app shell, then replace chain behavior with Canton. |
| Extract Canton wallet/funds behavior into modules before wiring UI | Directly porting the large `mtc-exchange` TopNav would recreate the current structural problem in another form. |
| Do not spend time fixing old EVM type errors directly | The failing baseline is dominated by code that the migration intends to remove or replace; fixing it first would create throwaway work. |
| Make TypeScript green after the first structural pass | Once old route surfaces were removed, keeping `tscheck` green makes the next Canton funds/Rocky Wallet steps safer and prevents hidden broken imports. |
| Use no-op compatibility only for removed EVM UI surfaces | Stubs are acceptable for deleted route surfaces, but the next phase must replace real funds/trading logic with Canton modules rather than expanding stubs. |
| Keep Rocky Wallet preapproval OAuth server code out of the Vite client | The MTC implementation depends on server-only crypto/cookies; the frontend should redirect to the backend route and handle the resulting session state. |
| Align Vite aliases with TypeScript paths | TypeScript was already using `modules/lighter`; Vite still pointed to deleted dex paths and could fail at browser/runtime resolution. |
| Add a funds service boundary before polishing funds UI | The MTC TopNav mixes API calls, wallet SDK calls, polling, notices, and layout. A service layer keeps Rocky Canton behavior testable before production UI work. |
| Keep pending-offer listing provider-specific | Console Wallet exposes pending offers through its browser SDK. Rocky Wallet currently exposes accept and auto-accept through backend APIs, not a list route. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `git rm` refused modified `src/shared/components/Referrals` files | Forced removal for this explicitly deleted directory; the modifications were generated by the upstream sync and the route was removed. |
| TypeScript failed after upstream sync | Added minimal typechain stubs, corrected imports/types, removed stale feature references, and updated the open-orders spec until `yarn tscheck` passed. |
| Canton wallet tests failed under Vitest because the default `localStorage` object did not expose full Storage methods | Added a memory `Storage` shim inside the focused wallet tests before exercising session cleanup and Rocky auth persistence. |

## Resources
- `/Users/hellojk/git/rocky/rocky.interface`
- `/Users/hellojk/git/xblade/primit/avax/primit-avax-interface`
- `/Users/hellojk/git/rocky/mtc-exchange`
- `rocky.interface/src/shared/lib/canton-wallet`
- `mtc-exchange/src/lib/wallet`
- `mtc-exchange/src/components/TopNav.tsx`
- `mtc-exchange/src/app/api/deposits/*`
- `mtc-exchange/src/app/api/wallet/*`
- `mtc-exchange/src/app/api/withdrawals/*`
- `primit-avax-interface/src/modules/lighter`
- `primit-avax-interface/src/app/App.tsx`
- `primit-avax-interface/src/app/MainRoutes.tsx`

## Visual/Browser Findings
- Not applicable.

## Verification
- `yarn tscheck`: passed after migration changes.
- `yarn test:ci src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed, 3 tests.
- `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed, 3 tests.
- `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed, 8 tests.
- `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed, 6 tests.
- `curl http://localhost:3012/trade`: returned 200 after restarting Vite.
- `yarn build`: passed, with existing Rollup chunk/sourcemap warnings only.
- `git diff --check`: passed.
