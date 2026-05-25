# Email + Password Auth Design

**Status:** Spec — ready for implementation plan.
**Date:** 2026-05-25

## Problem

Current login/register at `/api/auth` + `/api/register` (and the unified form at `src/app/page.tsx`) is **passwordless** — users type any username, the backend allocates / looks up a Canton party with that username as the hint, and the user is logged in. There is no email field, no password, no user database.

User wants:
1. Registration adds an **email** field
2. Login uses **email** (not username) as the identity key
3. Email + password is the auth model (user explicitly chose password over passwordless / magic-link / OTP)
4. Existing test users get wiped — fresh start

The bot's 30 funnel accounts use API keys (`auth.api_keys` table) and never touch the login flow — they are unaffected.

## Solution

Add a `auth.users` table to Postgres (`auth` schema already exists). Rewrite the Next.js BFF routes `/api/register` and `/api/auth` to require email + password, hash passwords with bcrypt, and look users up by email. Update the login form, register form, and TopNav account modal to surface email.

The Canton party allocation flow stays the same — username remains the party hint, but the user authenticates by email + password and the username is stored in the DB alongside the party id.

## Architecture

```
Browser
  └── POST /api/register {email, password, username}
        ├── validate (email regex, password ≥ 8, username [a-zA-Z0-9_-]{3,32})
        ├── check email + username uniqueness (DB)
        ├── bcrypt hash (10 rounds)
        ├── allocate Canton party (existing Validator API call)
        ├── INSERT auth.users (email, password_hash, username, party)
        └── return {token, party, username, email, user_id}

  └── POST /api/auth {email, password}
        ├── SELECT FROM auth.users WHERE lower(email) = lower($1)
        ├── bcrypt verify password
        ├── authToken(username) — mint Canton token (existing helper)
        └── return {token, party, username, email, user_id}
```

The Next.js process on EC2 already has network access to Postgres on `127.0.0.1:5432` (the funnel ops have proven this works). New env var `DATABASE_URL` configures the pool.

## Files Changed

### rocky-backend

| File | Change |
|---|---|
| `services/internal-ledger/migrations/20260525002_auth_users.sql` (new) | Enable `pgcrypto` extension (for `gen_random_uuid()`), CREATE TABLE `auth.users` + email-lowercase index. SET LOCAL search_path = auth at the top to avoid the leak pattern. |

No Rust code change.

### mtc-exchange

| File | Change |
|---|---|
| `package.json` | Add `bcryptjs` (pure-JS bcrypt — no native build), `pg` (node-postgres), `@types/pg` |
| `src/lib/db.ts` (new) | Module-level `pg.Pool` reading `DATABASE_URL`. Export typed `query()` helper |
| `src/lib/passwords.ts` (new) | `hashPassword(plain)`, `verifyPassword(plain, hash)` — thin bcryptjs wrappers |
| `src/lib/users.ts` (new) | `findUserByEmail(email)`, `findUserByUsername(name)`, `createUser({email, password_hash, username, party})` |
| `src/app/api/register/route.ts` | Rewrite: accept `{email, password, username}`. Validate, check uniqueness, hash, allocate party (existing devnet/localnet helpers), INSERT user, return `{token, party, username, email, user_id}`. |
| `src/app/api/auth/route.ts` | Rewrite: accept `{email, password}`. Look up by email, bcrypt verify, mint Canton token via existing `authToken(username)`, return same response shape as `/api/register`. |
| `src/app/page.tsx` | Replace single `username` input with `email` + `password` (login mode) and `email` + `password` + `username` (register mode). Update localStorage to set `mtc_email`. |
| `src/components/TopNav.tsx` | Display email above username in the account modal. Read from localStorage (`mtc_email`). |
| `.env.local.example` | Add `DATABASE_URL=postgres://rocky:rocky@127.0.0.1:5432/rocky` |

### EC2 ops (manual, not in repo)

| Step | Command |
|---|---|
| Add DB URL to `~/mtc-exchange-devnet/.env.local` | One-liner using `grep -q ... \|\| echo ...` |
| Wipe pre-existing test users (start-fresh decision) | `psql -c "TRUNCATE auth.users"` after migration runs |

## Schema Detail

`services/internal-ledger/migrations/20260525002_auth_users.sql`:

```sql
-- Email + password auth (replaces passwordless username-only flow).
-- SET LOCAL (not bare SET) so search_path doesn't leak past commit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET LOCAL search_path = auth;

CREATE TABLE IF NOT EXISTS auth.users (
    user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    username       TEXT NOT NULL UNIQUE,
    party          TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON auth.users (lower(email));
```

Notes:
- `pgcrypto` is enabled at the database level (one-time). Subsequent migrations don't need it.
- The `users_email_lower_idx` lets login do case-insensitive email lookup without a sequential scan.
- `password_hash` stores bcrypt's full string (`$2b$10$...`); no separate salt column needed.

## Validation Rules

- **email:** regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` (RFC-light; rejects obvious garbage). Case-insensitive uniqueness.
- **password:** length ≥ 8 (plain rule for demo; no entropy check). Sent over HTTPS, never logged.
- **username:** existing pattern `^[a-zA-Z0-9_-]{3,32}$` (unchanged from current register).

## Response Shape

Both `/api/register` and `/api/auth` return:

```json
{
  "token": "eyJ...",
  "party": "alice-test::1220...",
  "username": "alice-test",
  "email": "alice@example.com",
  "user_id": "01F9..."
}
```

Frontend stores into localStorage:
- `mtc_token` (existing)
- `mtc_party` (existing)
- `mtc_username` (existing)
- `mtc_email` (NEW)

## Out of Scope

- Email verification (no SMTP)
- Password reset / "Forgot password" flow
- Email or password change after registration
- Rate limiting on login attempts
- Multi-factor authentication
- Migration of existing users (wipe + restart per user decision)
- Anything affecting `auth.api_keys` (funnel bot accounts)

## Deploy Procedure

1. **Local backend:** `cargo build -p internal-ledger` validates the migration SQL parses
2. **Local frontend:** `npm install` to pick up new deps, then `npm run lint && npm run build`
3. **Commit both repos** (1 commit each — backend migration, frontend everything-else)
4. **Backend deploy:**
   - `touch services/internal-ledger/src/migrate.rs` (force rebuild — sqlx::migrate! doesn't always auto-detect new migration files)
   - `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`
5. **Verify migration:**
   ```bash
   ssh ... 'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "\d auth.users"'
   ```
6. **Wipe test users (no-op if table is fresh):**
   ```bash
   ssh ... 'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "TRUNCATE auth.users"'
   ```
7. **Set DATABASE_URL on EC2:**
   ```bash
   ssh ... 'grep -q "^DATABASE_URL=" ~/mtc-exchange-devnet/.env.local || echo "DATABASE_URL=postgres://rocky:rocky@127.0.0.1:5432/rocky" >> ~/mtc-exchange-devnet/.env.local'
   ```
8. **Frontend deploy:** `bash deploy-devnet.sh` (does rsync + npm ci + build + restart)
9. **Browser smoke test:**
   - Visit `https://demo.rocky.exchange` — see new register form with email + password + username
   - Register `test@example.com` / `password123` / `testuser1` → land on `/perp/BTC-PERP`; account modal shows email
   - Logout, log back in with same email + password — works
   - Try wrong password — see error
   - Try login with non-existent email — see error
   - Try register with same email — see uniqueness error
10. **Push both repos** if smoke passes:
    - `cd rocky-backend && git push origin main`
    - `cd mtc-exchange && git push origin main`

## Acceptance

- `auth.users` table exists with 5 columns + email-lowercase index
- `/api/register` accepts email+password+username, validates, hashes, INSERTs, returns full payload
- `/api/auth` accepts email+password, looks up, verifies, returns same payload
- Login form has email + password fields
- Register form has email + password + username fields
- Account modal shows email
- Wrong password rejected
- Duplicate email rejected
- Both repos pushed to `origin/main`
- Bot keeps running uninterrupted (different auth table)
