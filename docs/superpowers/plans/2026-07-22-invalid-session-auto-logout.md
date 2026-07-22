# Invalid Session Auto Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Automatically disconnect Rocky Wallet and clear the dapp session when the backend reports `invalid session` or the extension switches to another account, while allowing a clean reconnect through the extension unlock flow.

**Architecture:** The extension will translate an expired backend session into its existing locked-wallet recovery path and publish account changes through the injected-provider bridge. The interface will own one provider-aware logout function that disconnects the SDK, clears every persisted Canton session key, notifies React subscribers, and closes connected-only UI.

**Tech Stack:** React, TypeScript, Vitest, `@rocky-wallet/dapp-sdk`, Chrome Extension Manifest V3, Node test runner

---

### Task 1: Recover Expired Extension Sessions

**Files:**
- Modify: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/src/background.js`
- Test: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/test/background-unlock.test.js`

- [x] **Step 1: Write a failing test for an expired `/v1/session` response**

Add a test that returns HTTP 401 with `{ "error": "invalid session" }` for the stored token, invokes `rocky_connect`, and asserts that the existing unlock popup flow is used instead of returning `invalid session` to the dapp.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node --test test/background-unlock.test.js`

Expected: FAIL because `currentSessionAccount()` propagates `invalid session`.

- [x] **Step 3: Convert an invalid backend session into the locked state**

In `currentSessionAccount()`, catch only a 401 whose message contains `invalid session`, call `expireWalletSession()`, and throw `Rocky Wallet is locked` so the existing interactive unlock retry obtains a fresh token. Re-throw every unrelated error unchanged.

- [x] **Step 4: Run the focused test and commit**

Run: `node --test test/background-unlock.test.js`

Expected: PASS.

Commit: `fix: recover expired wallet sessions`

### Task 2: Publish Extension Account Changes

**Files:**
- Modify: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/src/content-script.js`
- Modify: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/src/inpage.js`
- Test: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/test/content-script.test.js`
- Test: `/Users/hellojk/.config/superpowers/worktrees/rocky-wallet-extension/fix-account-session-reset/test/inpage.test.js`

- [x] **Step 1: Write failing bridge tests**

Assert that a `chrome.storage.local` change for `rockyWalletAccount` is posted through the randomized content bridge and becomes a `rockyWallet#accountsChanged` `CustomEvent` in the page. Assert unrelated storage changes are ignored.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `node --test test/content-script.test.js test/inpage.test.js`

Expected: FAIL because no account-change event is forwarded.

- [x] **Step 3: Implement the account-change bridge**

Register `chrome.storage.onChanged` in the content script, sanitize the public account fields, and post an `accountsChanged` bridge message. Handle that bridge message in `inpage.js` by dispatching `CustomEvent("rockyWallet#accountsChanged", { detail: account })`.

- [x] **Step 4: Run tests and commit**

Run: `node --test test/content-script.test.js test/inpage.test.js`

Expected: PASS.

Commit: `fix: publish wallet account changes`

### Task 3: Centralize Interface Session Logout

**Files:**
- Create: `src/shared/lib/canton-wallet/sessionStore.ts`
- Create: `src/shared/lib/canton-wallet/sessionLogout.ts`
- Modify: `src/shared/lib/canton-wallet/useCantonSession.ts`
- Modify: `src/shared/lib/canton-wallet/useCantonWallet.ts`
- Modify: `src/shared/lib/canton-wallet/rocky.ts`
- Test: `src/shared/lib/canton-wallet/sessionLogout.test.ts`

- [x] **Step 1: Write failing logout and account-change tests**

Assert one logout operation calls the active provider SDK `disconnect()`, removes all Canton session keys, notifies subscribers, ignores duplicate concurrent calls, ignores same-party account events, and logs out for a changed or missing party.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/shared/lib/canton-wallet/sessionLogout.test.ts`

Expected: FAIL because the centralized helpers do not exist.

- [x] **Step 3: Implement centralized cleanup and event subscription**

Move persisted-session cleanup and subscription notification into `sessionStore.ts`. Implement a best-effort provider-aware `disconnectCantonWalletSession()` with a shared in-flight promise, delegate manual logout to it, and subscribe connected Rocky sessions to `onAccountsChanged`.

- [x] **Step 4: Run the focused test and commit**

Run: `npm test -- --run src/shared/lib/canton-wallet/sessionLogout.test.ts`

Expected: PASS.

Commit: `fix: centralize wallet session logout`

### Task 4: Logout on Invalid Funds Session

**Files:**
- Modify: `src/shared/lib/canton-wallet/funds.ts`
- Test: `src/shared/lib/canton-wallet/funds.test.ts`

- [x] **Step 1: Replace stale-session renewal coverage with logout coverage**

Assert a 401 `invalid session` response disconnects and clears the session without calling exchange challenge/verify endpoints. Add a control assertion that another 401 does not force logout.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/shared/lib/canton-wallet/funds.test.ts`

Expected: FAIL because requests currently propagate or refresh the stale session.

- [x] **Step 3: Implement invalid-session classification**

After parsing a funds error, call `disconnectCantonWalletSession()` only when status is 401 and the error code or message identifies `invalid session`, then rethrow the original error. Remove the Rocky exchange-session refresh retry.

- [x] **Step 4: Run the focused test and commit**

Run: `npm test -- --run src/shared/lib/canton-wallet/funds.test.ts`

Expected: PASS.

Commit: `fix: logout on invalid funds session`

### Task 5: Close Connected UI and Verify

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.tsx`
- Test: `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

- [x] **Step 1: Write a failing modal test**

Render an open funds modal, change the mocked Canton session from connected to disconnected, and assert `onClose` is called.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

Expected: FAIL because the open modal remains mounted after logout.

- [x] **Step 3: Close the modal when connection is lost**

Add a narrowly scoped effect that invokes `onClose()` when an open funds modal transitions to disconnected.

- [x] **Step 4: Run interface and extension verification**

Run: `npm test -- --run src/shared/lib/canton-wallet/sessionLogout.test.ts src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

Run: `npm run build`

Run in the extension worktree: `node --test test/background-unlock.test.js test/content-script.test.js test/inpage.test.js && npm run build`

Expected: all tests and both builds PASS.

- [x] **Step 5: Commit**

Commit: `fix: close wallet UI after session logout`
