# Invalid Session Auto Logout

## Goal

Keep the exchange session aligned with the active Rocky Wallet account. Sign the user out immediately when the extension account changes or when a Canton wallet funding request returns HTTP 401 with `invalid session`, and leave the SDK ready for a clean reconnect.

## Design

- Add one application session cleanup function in `session.ts` that removes the exchange token, wallet identity, profile, and related Canton authentication keys.
- Add one provider-aware disconnect function that calls the connected wallet adapter's `disconnect()` before clearing the application session. Reuse it from manual and automatic logout.
- In the shared funds request helper, parse failed responses first. When the response is HTTP 401 and its code or message contains `invalid session`, clear the session and dispatch the existing Canton session change event before throwing the original error.
- Remove the Rocky-only stale-session renewal path. An invalid exchange session always logs out, regardless of wallet provider.
- Extend Rocky Wallet's content bridge to forward `rockyWalletAccount` storage changes as the SDK-supported `rockyWallet#accountsChanged` browser event.
- When the extension's active account has an expired backend token, convert `/v1/session` HTTP 401 `invalid session` into the existing locked-wallet state. The current interactive unlock flow then asks for the account password and obtains a fresh backend token before completing dApp connection.
- While Rocky Wallet is connected, subscribe to `onAccountsChanged`. If the active Party differs from the Party stored by Rocky Exchange, run the provider-aware logout immediately.
- When the funds modal observes that the session is no longer connected, close the modal so the top navigation immediately returns to `Connect wallet`.

## Error Boundaries

- Do not log out for non-401 responses.
- Do not log out for unrelated 401 messages.
- Ignore Rocky account events that still identify the currently connected Party.
- Preserve the parsed backend error for callers after cleanup.
- Provider disconnect only revokes the current dApp connection and clears the injected Provider account cache. It does not delete or change the active wallet account.

## Verification

- A funds request returning `401 { "error": "invalid session" }` clears all Canton session keys and emits the session change event.
- The request rejects with `CantonFundsError`, disconnects the stored wallet provider, and does not call wallet challenge or verify endpoints.
- Manual disconnect continues to clear the same key set.
- Switching the extension from one Party to another emits `rockyWallet#accountsChanged`, logs out the old exchange session, and clears the Provider's cached account.
- Reconnecting an account with an expired extension backend token opens the existing unlock flow instead of leaving `invalid session` in the connect modal.
- The funds modal calls `onClose` after the connected session becomes invalid.
