# Task Plan: rocky.interface Canton Migration

## Goal
Bring `rocky.interface` back in sync with the trimmed `primit-avax-interface` `arbitrum` baseline, then replace EVM-specific exchange behavior with Canton-oriented wallet, session, balance, deposit, withdrawal, and trading flows based on `mtc-exchange`.

## Current Phase
Phase 6 cleanup: upstream structure is synced enough to compile, Canton wallet entry is active on the `/trade` surface, Rocky Wallet login/register creates a Canton exchange session, Canton funds are wired through the funds modal, direct EVM wallet dependencies are removed from the package graph, and `/trade` no longer mounts or calls RainbowKit/wagmi/EVM signing paths.

## Phases

### Phase 1: Repository Recon and Baseline Diff
- [x] Confirm current branch/status for `rocky.interface`, `primit-avax-interface`, and `mtc-exchange`
- [x] Map high-level deleted/changed file groups between `primit-avax-interface` `arbitrum` and `rocky.interface`
- [x] Identify local rocky-specific additions that must be kept
- [x] Document findings in `findings.md`
- **Status:** completed

### Phase 2: Architecture Split
- [x] Classify code as shared UI, Lighter/CEX UI, EVM-only, Canton-needed, or unknown
- [x] Define the first target boundary: single `/trade` route using upstream `lighter` runtime providers
- [x] Decide first-pass EVM flows: remove old DEX/CEX modules and upstream non-trade feature pages; temporarily retain deeper SDK/provider code only where still required for compilation
- [x] Replace the global `useWallet()` pseudo-EVM Canton fallback with an explicit Canton session/no-op facade across remaining paths
- [ ] Split Canton wallet SDK adapters, exchange session auth, and funds actions into separate modules
- **Status:** in_progress

### Phase 3: Prune and Sync from `primit-avax-interface`
- [x] Remove old `src/modules/cex`, `src/modules/dex`, and committed `sdk/build` artifacts from the active tree
- [x] Port relevant upstream `lighter`, shared UI, shared styles, shared context, app routes, and app theme files from `arbitrum`
- [x] Keep first-pass Canton draft under `src/shared/lib/canton-wallet/**`
- [x] Rebase the app shell/routes/providers onto upstream `lighter` structure before Canton funds work
- [x] Remove remaining EVM provider/runtime paths after Canton funds and trading replacements cover them
- **Status:** in_progress

### Phase 4: Canton Wallet and Exchange Session Layer
- [x] Replace Rainbow/EVM connection dependencies in the main trade navigation with Canton session state
- [x] Mount `CantonConnectModal` globally and wire desktop/mobile wallet buttons to Console/Loop connect
- [x] Port first-pass Console Wallet and Loop Wallet adapters from `mtc-exchange`
- [x] Add Rocky Wallet embedded login/register flow and exchange-session creation
- [x] Centralize session token storage and API auth headers for wallet and Rocky auth tokens
- [x] Keep provider-specific state keys documented: `rocky_exchange_session`, `mtc_token`, `mtc_party`, `mtc_login_method`, Rocky wallet token/preapproval state
- [ ] Complete Rocky Wallet preapproval callback handling once backend route ownership is final
- **Status:** in_progress

### Phase 5: Canton Funds and Trading Flow
- [x] Port balance, deposit reference, wallet transfer, withdrawal, and USDCx offer service handling from `mtc-exchange`
- [x] Replace connected wallet click behavior with a minimal Canton funds modal
- [x] Rewire first wallet funds UI actions to backend Canton APIs and Console/Loop SDK transfer helpers
- [x] Add funds modal copy buttons, Console pending USDCx offer list, Rocky auto-accept controls, and periodic refresh
- [x] Route `/trade` order submit, cancel, batch cancel, and close-position API-mode actions through Canton session auth instead of EVM typed-data signing
- [x] Use the Canton party/session identity as the `/trade` account key for API positions, orders, balances, and trade history compatibility hooks
- [x] Remove `TradingAccountContext` wallet-chain auto-follow so the remaining trading-account scaffold no longer subscribes to wagmi account state
- [ ] Polish funds modal production copy, layout, pending offer empty/error states, and mobile ergonomics
- [x] Remove or isolate chain transaction paths that require EVM signers/providers
- [x] Convert order, position, ticker, candle, and orderbook compatibility through Rocky backend APIs instead of EVM account-derived identifiers
- [ ] Remove the remaining GMX/TradingAccount deposit-withdraw scaffold after the Canton modal covers all required cases
- **Status:** in_progress

### Phase 6: Verification and Cleanup
- [x] Run typecheck
- [x] Run focused tests for changed Lighter order adapter behavior
- [x] Run focused tests for Canton session and Rocky Wallet auth/session behavior
- [x] Run local dev smoke test and production build
- [x] Run lint
- [x] Verify no EVM signer requirement remains on the Canton trading path
- [x] Remove direct EVM wallet/relay/bridge packages from the app dependency graph
- [x] Disable legacy RPC, explorer, external swap, bridge, and indexer entrypoints behind Canton/no-op facades
- [x] Remove local static Arbitrum/Avalanche/BSC/MetaMask/Coinbase/WalletConnect/LayerZero assets that were still bundled by the legacy image glob
- [ ] Update docs/env examples for Canton deployment
- **Status:** in_progress

## Key Questions
1. Which `rocky.interface` files are intentional Rocky customizations versus stale copies from the old upstream?
2. Is the target product only the Lighter-style `/trade` app, or must legacy DEX/earn/pools/referrals routes remain?
3. Which backend API host should Vite call directly in production for Canton routes, and which routes still rely on the demo Next proxy?
4. Which app owns the Rocky Wallet preapproval callback in production: this Vite app, a backend service, or the demo Next proxy?
5. Are Console Wallet and Loop Wallet both production-required for first release, or can one be staged behind a feature flag?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Stop wallet feature implementation until architecture is planned | Current code has structural drift from both upstream EVM baseline and Canton demo; continuing ad hoc integration would increase rework. |
| Treat `primit-avax-interface` `arbitrum` as the pruning baseline | User stated `rocky.interface` was copied from that branch and upstream deleted many files that need syncing. |
| Treat `mtc-exchange` as the Canton behavior reference | User stated Canton chain logic should reference `mtc-exchange`. |
| Remove the pseudo-EVM Canton identity path instead of expanding it | A Canton party is not an EVM address; forcing it through global EVM wallet hooks would preserve invalid signer/account assumptions. |
| Sync the upstream app structure before wallet/funds rewiring | The upstream `lighter` module has new providers, routes, shared UI, and auth changes; Canton work should land on that smaller baseline. |
| Remove RainbowKit/wagmi as runtime dependencies | Canton sessions are not EVM wallets; remaining compatibility modules must use Canton account keys, backend APIs, or no-op facades instead of EVM providers/signers. |
| Remove upstream non-trade feature routes for this pass | `accounts`, `earn`, `bonus`, `feeVip`, `leaderboard`, `points`, `referrals`, and `blog` were disconnected from routes and deleted to keep the Canton trade shell focused. |
| Implement Rocky Wallet as embedded login/register first | `mtc-exchange` exposes frontend-safe `/api/auth` and `/api/register` behavior; OAuth/preapproval server internals remain backend-owned and should not be copied into the Vite client. |
| Use `/api/wallet/preapproval/authorize` as a redirect path | Vite proxies `/api` in dev, so the frontend can hand preapproval to the backend route without porting Next/server-only crypto code. |
| Keep Rocky Wallet CC/USDCx transfer execution behind backend API routes | The MTC implementation depends on server-side wallet access tokens, validator calls, and ledger/operator auth. Vite should call `/api/deposits/*` and `/api/wallet/*`, not copy server code. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `git rm` refused modified Referrals files | 1 | Forced removal for the explicitly deleted Referrals directory because the modifications were generated by the upstream sync and the feature was removed from Rocky Canton routes. |
| Baseline `yarn tscheck` failed after sync | 1 | Reconciled imports, type stubs, React type resolution, and stale EVM UI references until `yarn tscheck` passed. |
| Wallet tests failed because Vitest `localStorage` did not implement the full Storage API | 1 | Installed a memory `Storage` shim in the Canton wallet tests before exercising session cleanup and Rocky auth persistence. |

## Notes
- Keep wallet feature coding constrained to the explicit Canton wallet/session boundary until the EVM provider cleanup is complete.
- Keep upstream sync/pruning separate from Canton behavior changes for reviewability.
- Avoid destructive git operations; preserve uncommitted user changes.
- `src/shared/lib/canton-wallet` now contains Console, Loop, Rocky auth/session, preapproval redirect, and balance helpers; it is the active draft boundary for Canton wallet work.
- `mtc-exchange/src/components/TopNav.tsx` contains too much funds logic inline; extract behavior into services/hooks when porting.
- `src/shared/lib/canton-wallet/funds.ts` now owns the first Canton funds API boundary for deposit references, Rocky deposit calls, Console/Loop wallet deposits, withdrawals, Rocky preapproval redirect, USDCx authorization, USDCx offer accept, and USDCx auto-accept API calls.
- `src/shared/lib/canton-wallet/CantonFundsModal.tsx` is still intentionally compact, but now includes copy buttons, Console pending USDCx offers, Rocky auto-accept controls, and a 15s refresh loop.
- `/trade` API-mode submit/cancel/batch-cancel/close-position paths now require Canton session auth (`rocky_exchange_session` / `mtc_token`) and no longer sign EVM typed data.
- API positions, orders, balances, unified account, account trades, previews, private websocket hooks, TP/SL edits, referral hooks, and Earn hooks now use the Canton party/session identity as the account key.
- Global `WalletProvider`, `useWallet`, `useEthersSigner`, chain switch helpers, account-type helpers, ENS/avatar hooks, RainbowKit config, and old EVM connector files were removed or reduced to no-op compatibility shells.
- Synthetics subaccount, token permit, synthetics event, multichain compose gas, empty trading accounts, and wallet multicall token-balance paths were downgraded to no-op or API-only Canton behavior.
- `SyntheticsStateContextProvider` now uses API positions directly instead of mounting the old positions multicall source.
- Current verification:
  - `yarn tscheck`: passed.
  - `yarn test:ci src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed.
  - `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed.
  - `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed.
  - `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed.
  - `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed, 13 tests.
  - `yarn build`: passed.
  - `curl http://localhost:3012/trade`: returned 200 after funds modal hardening.
  - `git diff --check`: passed.
  - Latest run after Canton API-mode auth routing:
    - `yarn tscheck`: passed.
    - `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed, 13 tests.
    - `yarn build`: passed with existing Rollup sourcemap/chunk warnings.
    - `curl -I -s http://localhost:3012/trade`: returned `HTTP/1.1 200 OK`.
    - `git diff --check`: passed.
  - Latest run after EVM runtime removal:
    - `yarn tscheck`: passed.
    - `yarn test:ci src/shared/lib/wallets/useEthersSigner.spec.ts src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed, 15 tests.
    - `yarn build`: passed with existing sourcemap/chunk warnings.
    - `curl -I -s http://localhost:3012/trade`: returned `HTTP/1.1 200 OK`.
    - `git diff --check`: passed.
    - Active `/trade` runtime scan for direct `ethers`, `viem`, `lib/rpc`, wagmi, RainbowKit, `window.ethereum`, Gelato, and relay imports/mocks returned no matches across `src/modules/lighter/**`, `src/shared/components/SettingsModal/**`, `src/shared/lib/wallets/**`, and `src/app/**`.
    - `find build/assets -maxdepth 1 -type f -name 'web3-*' -print`: no `web3-*` chunk remains.
    - `rg -l "GelatoRelay|relay-sdk|ethers|viem|walletconnect|RainbowKit|wagmi|window\\.ethereum|MetaMask|CoinbaseWallet" build/assets --glob '*.js'`: still reports `build/assets/index-ChTbbcrS.js`, `build/assets/multicall.worker-D5jT_zXA.js`, and `build/assets/index-DF54_0bs.js`.
  - Latest run after dependency and static asset cleanup:
    - `rg -n "from ['\\\"](ethers|viem|viem/.*|wagmi|@rainbow-me/rainbowkit|@gelatonetwork/relay-sdk|@stargatefinance/stg-evm-sdk-v2|@layerzerolabs/lz-v2-utilities|@davatar/react|react-jazzicon)['\\\"]|window\\.ethereum|Stargate|LayerZero|GelatoRelay|MetaMask|CoinbaseWallet|RainbowKit|arbiscan|snowtrace|etherscan|basescan|bscscan|layerzeroscan|https://[^\\\"]*(arbitrum|avalanche|avax|bsc|bnb-mainnet|arb-|eth-sepolia|base-mainnet|layerzero)|arbitrum|avalanche|layerzero|walletConnect|ethers|viem|wagmi" src/shared src/modules/lighter src/app -g '*.{ts,tsx,js,json,d.ts,scss,css}' -g '!src/shared/locales/**'`: no matches.
    - `rg --files src/shared/img | rg -i "(arbitrum|avalanche|avax|layerzero|layer_zero|bscscan|bsc|walletconnect|metamask|coinbase)"`: no matches.
    - `yarn tscheck`: passed.
    - `yarn test:ci src/shared/lib/wallets/useEthersSigner.spec.ts src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts src/shared/lib/__tests__/ethersErrors.spec.ts src/shared/lib/__tests__/getLiquidationPrice.spec.ts src/shared/sdk/utils/__tests__/parseError.spec.ts src/shared/lib/rpc/getProviderNameFromUrl.spec.ts`: passed, 40 tests.
    - `yarn build`: passed with existing npm config, Lingui sourcemap, circular chunk, and chunk-size warnings.
    - `git diff --check`: passed.
    - `rg -o "ethers|viem|wagmi|RainbowKit|MetaMask|CoinbaseWallet|GelatoRelay|relay-sdk|@walletconnect|Stargate|LayerZero|window\\.ethereum|arbiscan|snowtrace|etherscan|basescan|bscscan|layerzero|arbitrum|avalanche" build/assets --glob '*.js' --glob '*.css' | sort -u`: only `build/assets/index-8YvybDeI.js:ethers`.
    - `find build/assets -maxdepth 1 -type f \( -iname '*arbitrum*' -o -iname '*avalanche*' -o -iname '*avax*' -o -iname '*layerzero*' -o -iname '*layer_zero*' -o -iname '*bscscan*' -o -iname '*bsc*' -o -iname '*walletconnect*' -o -iname '*metamask*' -o -iname '*coinbase*' \) -print | sort`: only `build/assets/walletConnect-ZiyLJNgK.png`.
  - Latest run after lint-error cleanup:
    - `yarn lint --quiet`: passed, 0 errors.
    - `yarn lint`: passed, 0 errors and 589 warnings. The remaining warnings are mostly import ordering, `no-console`, React hook/perf, and unused migration scaffolding warnings.
    - `yarn tscheck`: passed.
    - `yarn test:ci src/shared/lib/wallets/useEthersSigner.spec.ts src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts src/shared/lib/__tests__/ethersErrors.spec.ts src/shared/lib/__tests__/getLiquidationPrice.spec.ts src/shared/sdk/utils/__tests__/parseError.spec.ts src/shared/lib/rpc/getProviderNameFromUrl.spec.ts src/modules/lighter/features/orderForm/useOrderFormState.spec.tsx`: passed, 44 tests. Vitest still prints React 18 `ReactDOM.render` warnings from the order form test harness.
    - `yarn build`: passed with existing npm config, Lingui sourcemap, circular chunk, and chunk-size warnings.
    - `git diff --check`: passed.
    - Source scan for direct EVM/RainbowKit/wagmi/Gelato/Stargate/LayerZero imports and old explorer/chain strings across `src/shared`, `src/modules/lighter`, and `src/app`: no matches.
    - Build scan for direct EVM/RainbowKit/wagmi/Gelato/Stargate/LayerZero/explorer strings: only `build/assets/index-Ct6I5sDD.js:ethers`.
    - Build old asset filename scan: only `build/assets/walletConnect-ZiyLJNgK.png`.
- Remaining legacy EVM/GMX SDK and ABI files still exist under `src/shared/sdk`, `src/shared/lib/multicall`, static wallet icon assets, and inactive synthetics/multichain helpers. They are no longer connected through the wagmi/RainbowKit runtime on the active trade path, but physical deletion should be a separate pruning pass because many type and UI compatibility modules still import shared SDK shapes.
- Lint-error cleanup removed the unused local `LayerZeroProvider` typechain stub, converted the remaining `SyntheticsReader` typechain namespace stub to plain TypeScript types, and fixed ES target/bigint/empty-block violations without attempting the broader warning-only formatting cleanup.
- The remaining `ethers` build string is from `node_modules/@console-wallet/dapp-sdk/dist/esm/api/generated-wallet-api.js` (`evmControllerAddUserEvmWalletAddress`, `evmControllerAddUserEvmWalletAddresses`, and `proxyEtherscanControllerGetAbi`). The remaining `walletConnect-ZiyLJNgK.png` asset is from `node_modules/@console-wallet/dapp-sdk/dist/esm/services/wc-service/connector-select.js`. Removing those requires an upstream Console Wallet SDK change or a local SDK fork/patch, not another local Rocky source cleanup.
