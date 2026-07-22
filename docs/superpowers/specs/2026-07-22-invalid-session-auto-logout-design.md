# Invalid Session Auto Logout

## Goal

When a Canton wallet funding request returns HTTP 401 with `invalid session`, immediately sign the user out instead of displaying the stale session inside the funds modal or attempting to renew it.

## Design

- Add one session cleanup function in `session.ts` that removes the exchange token, wallet identity, profile, and related Canton authentication keys.
- Reuse that function from the existing manual disconnect hook.
- In the shared funds request helper, parse failed responses first. When the response is HTTP 401 and its code or message contains `invalid session`, clear the session and dispatch the existing Canton session change event before throwing the original error.
- Remove the Rocky-only stale-session renewal path. An invalid exchange session always logs out, regardless of wallet provider.
- When the funds modal observes that the session is no longer connected, close the modal so the top navigation immediately returns to `Connect wallet`.

## Error Boundaries

- Do not log out for non-401 responses.
- Do not log out for unrelated 401 messages.
- Preserve the parsed backend error for callers after cleanup.
- Do not disconnect or mutate the browser wallet extension account; only clear the Rocky Exchange/Canton application session.

## Verification

- A funds request returning `401 { "error": "invalid session" }` clears all Canton session keys and emits the session change event.
- The request rejects with `CantonFundsError` and does not call wallet challenge or verify endpoints.
- Manual disconnect continues to clear the same key set.
- The funds modal calls `onClose` after the connected session becomes invalid.
