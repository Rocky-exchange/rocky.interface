# Email + Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the passwordless username-only login with email + password auth backed by a new `auth.users` table.

**Architecture:** Postgres migration adds `auth.users` (email PK uniqueness, bcrypt hash, username + party). Next.js BFF routes rewrite `/api/register` and `/api/auth` to require email+password — register hashes the password, allocates the Canton party via the existing Validator API helpers, stores the row; login looks up by email, bcrypt-verifies, mints the Canton token via the existing `authToken(username)` helper. Frontend form gets email + password inputs; TopNav modal surfaces the email. Bot's API-key flow is untouched.

**Tech Stack:** Postgres (`auth.users`), Next.js 16 BFF routes, `bcryptjs` + `pg` packages, existing Canton Validator API. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-email-password-auth-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `cargo build` for rocky-backend, `npm install / lint / build` for mtc-exchange, bash, git. No Docker, no `cargo run`, no `systemctl`.
- rocky-backend deploy: **touch `services/internal-ledger/src/migrate.rs` BEFORE build** (lesson learned — sqlx::migrate! doesn't auto-rebuild on migration file changes alone). Then `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`.
- mtc-exchange deploy: `bash deploy-devnet.sh` (script handles rsync + npm ci + build + restart).
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- EC2 frontend needs `DATABASE_URL` added to `~/mtc-exchange-devnet/.env.local`.
- Post-migration: `TRUNCATE auth.users` per the start-fresh decision (no existing users to preserve).
- Bot is currently **active** on EC2 — don't touch it. The funnel uses `auth.api_keys`, not `auth.users`. They coexist in the same schema.
- Pre-existing dirty files in rocky-backend (Makefile, scripts/remote.sh modified; login.sh, scripts/dev/services-remote.sh untracked). Leave alone.
- rocky-backend HEAD `ed350c7` (clean, 0 unpushed). mtc-exchange HEAD `d1664d7` (clean, 0 unpushed).
- Do NOT `git push` either repo until the deploy + smoke test passes (T3).

---

## File Structure

**rocky-backend new:**
- `services/internal-ledger/migrations/20260525002_auth_users.sql`

**mtc-exchange:**
- New: `src/lib/db.ts`, `src/lib/passwords.ts`, `src/lib/users.ts`
- Modified: `src/app/api/register/route.ts`, `src/app/api/auth/route.ts`, `src/app/page.tsx`, `src/components/TopNav.tsx`, `package.json`, `package-lock.json`, `.env.local.example`

**Untouched:**
- Canton Validator/party-allocation code paths (we still call `validatorApiBase()/v0/admin/users` for devnet; localnet party allocation still uses the admin token)
- `auth.api_keys` table (funnel bot)
- All bot code

---

## Task 1: Backend — auth.users migration

**Files:**
- Create: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/migrations/20260525002_auth_users.sql`

- [ ] **Step 1.1: Create the migration file**

Create the file with EXACTLY this content:

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

- [ ] **Step 1.2: Touch migrate.rs to force rebuild on EC2**

Per the lesson learned in prior rounds, sqlx::migrate! doesn't pick up new migration files unless something in `migrate.rs` (or its dependency tree) changes. Add a comment update there to force a rebuild later:

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
# Confirm migrate.rs exists
ls services/internal-ledger/src/migrate.rs
```

Add a stub comment to ensure cargo rebuilds during T3 deploy. Open `services/internal-ledger/src/migrate.rs` and add at the very top of the file (above any existing imports / `use` lines):

```rust
// 2026-05-25: bumped to include 20260525002_auth_users migration
```

This is a one-line no-op change purely to make cargo's file-mtime tracking notice the file. If a similar comment already exists from a prior round, just update the date.

- [ ] **Step 1.3: Compile + validate migration syntax**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p internal-ledger 2>&1 | tail -10
```

Expected: clean build. sqlx::migrate! macro parses migration files at compile time, so a SQL syntax error would fail here.

- [ ] **Step 1.4: Commit (specific files only)**

**CRITICAL: pre-existing dirty files (Makefile, scripts/remote.sh modified; login.sh, scripts/dev/services-remote.sh untracked) must stay untouched.**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/migrations/20260525002_auth_users.sql services/internal-ledger/src/migrate.rs
git status --short  # verify ONLY these 2 files are staged
git commit -m "feat(internal-ledger): auth.users table for email+password login

Adds auth.users (user_id PK, email UNIQUE, password_hash, username UNIQUE,
party, created_at) plus a lower(email) index for case-insensitive login
lookup. Enables pgcrypto for gen_random_uuid().

The Next.js BFF will INSERT on register + SELECT on login, looking up
the Canton party from the row instead of walking /v2/parties.

Funnel bot's auth.api_keys is unaffected (separate table).

See docs/superpowers/specs/2026-05-25-email-password-auth-design.md."
```

After commit: rocky-backend has 1 unpushed commit on `main`. **Do NOT push.**

---

## Task 2: Frontend — DB helpers + auth rewrites + form + TopNav modal

**Files:**
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/package.json` (deps)
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/lib/db.ts`
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/lib/passwords.ts`
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/lib/users.ts`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/register/route.ts`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/auth/route.ts`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/page.tsx`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/components/TopNav.tsx`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/.env.local.example`

- [ ] **Step 2.1: Install new dependencies**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
npm install bcryptjs pg
npm install --save-dev @types/pg
```

Expected: `package.json` and `package-lock.json` updated with `bcryptjs`, `pg`, `@types/pg`. (Note: `bcryptjs` is pure-JS so no native compile step — picked over `bcrypt` for reliable deploy.) The `@types/pg` is dev-only.

`bcryptjs` ships its own types so no `@types/bcryptjs` needed.

- [ ] **Step 2.2: Create `src/lib/db.ts`**

```typescript
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Reuse a single pool across hot reloads in dev + across requests in prod.
const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL || "postgres://rocky:rocky@127.0.0.1:5432/rocky",
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export async function query<T = unknown>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
```

- [ ] **Step 2.3: Create `src/lib/passwords.ts`**

```typescript
import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 2.4: Create `src/lib/users.ts`**

```typescript
import { query } from "./db";

export type UserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  username: string;
  party: string;
  created_at: string;
};

export async function findUserByEmail(
  email: string,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT user_id, email, password_hash, username, party, created_at
       FROM auth.users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserByUsername(
  username: string,
): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT user_id, email, password_hash, username, party, created_at
       FROM auth.users
      WHERE username = $1
      LIMIT 1`,
    [username],
  );
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  password_hash: string;
  username: string;
  party: string;
}): Promise<UserRow> {
  const rows = await query<UserRow>(
    `INSERT INTO auth.users (email, password_hash, username, party)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, email, password_hash, username, party, created_at`,
    [input.email, input.password_hash, input.username, input.party],
  );
  return rows[0];
}
```

- [ ] **Step 2.5: Rewrite `/api/register/route.ts`**

Replace the ENTIRE contents of `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/register/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authToken, ledgerBase, validatorApiBase, isDevnet } from "@/lib/network";
import { hashPassword } from "@/lib/passwords";
import { createUser, findUserByEmail, findUserByUsername } from "@/lib/users";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "valid email is required" },
        { status: 400 },
      );
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "password must be at least 8 characters" },
        { status: 400 },
      );
    }
    if (!username || typeof username !== "string" || !USERNAME_RE.test(username)) {
      return NextResponse.json(
        {
          error:
            "username must be 3-32 characters (letters, numbers, underscore, hyphen)",
        },
        { status: 400 },
      );
    }

    if (await findUserByEmail(email)) {
      return NextResponse.json(
        { error: "an account with this email already exists" },
        { status: 409 },
      );
    }
    if (await findUserByUsername(username)) {
      return NextResponse.json(
        { error: "username is already taken" },
        { status: 409 },
      );
    }

    // Allocate the Canton party (existing flow — username is the party hint).
    const party = isDevnet()
      ? await allocatePartyDevnet(username)
      : await allocatePartyLocalnet(username);

    const password_hash = await hashPassword(password);
    const user = await createUser({ email, password_hash, username, party });
    const token = await authToken(username);
    return NextResponse.json({
      success: true,
      token,
      party: user.party,
      username: user.username,
      email: user.email,
      user_id: user.user_id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Register error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// On DevNet the Validator API owns party allocation + wallet provisioning.
async function allocatePartyDevnet(username: string): Promise<string> {
  const token = await authToken(username);
  const res = await fetch(`${validatorApiBase()}/v0/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: username, party_id: null }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`validator admin/users: ${res.status} ${text}`);
  }
  const data = JSON.parse(text);
  if (!data.party_id) {
    throw new Error(`validator returned no party_id: ${text}`);
  }
  return data.party_id as string;
}

// Legacy localnet path: admin allocates a party then creates a Daml user
// with CanActAs rights, using HS256 self-signed admin token.
async function allocatePartyLocalnet(username: string): Promise<string> {
  const base = ledgerBase("app-user");
  const adminToken = await authToken("participant_admin");

  // Check if the Daml user already exists (shouldn't, since auth.users
  // uniqueness was already enforced — but the underlying participant might
  // still have a stale entry from a previous run).
  const checkRes = await fetch(`${base}/v2/users/${username}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (checkRes.ok) {
    throw new Error(`Daml user "${username}" already exists on participant`);
  }

  const partyRes = await fetch(`${base}/v2/parties`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ partyIdHint: username, displayName: username }),
  });
  if (!partyRes.ok) {
    throw new Error(`Failed to allocate party: ${await partyRes.text()}`);
  }
  const partyData = await partyRes.json();
  const partyId = partyData.partyDetails?.party || partyData.party;
  if (!partyId) throw new Error("Failed to extract party ID from response");

  const userRes = await fetch(`${base}/v2/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: { id: username, primaryParty: partyId },
      rights: [{ kind: { CanActAs: { value: { party: partyId } } } }],
    }),
  });
  if (!userRes.ok) {
    throw new Error(`Failed to create user: ${await userRes.text()}`);
  }
  return partyId as string;
}
```

- [ ] **Step 2.6: Rewrite `/api/auth/route.ts`**

Replace the ENTIRE contents of `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/auth/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authToken } from "@/lib/network";
import { verifyPassword } from "@/lib/passwords";
import { findUserByEmail } from "@/lib/users";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 },
      );
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "password is required" },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Don't leak whether email exists — generic message.
      return NextResponse.json(
        { error: "invalid email or password" },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "invalid email or password" },
        { status: 401 },
      );
    }

    const token = await authToken(user.username);
    return NextResponse.json({
      token,
      party: user.party,
      username: user.username,
      email: user.email,
      user_id: user.user_id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Auth error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

The `lookupPartyByHint` function is removed — the party is now stored in `auth.users` at registration time.

- [ ] **Step 2.7: Rewrite the login/register form `src/app/page.tsx`**

Replace the ENTIRE contents of `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/page.tsx` with:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  // Already logged in? Skip the login form and go straight to Perp.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("mtc_token")) {
      router.replace("/perp/BTC-PERP");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === "register" && !username.trim()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const endpoint = mode === "register" ? "/api/register" : "/api/auth";
      const body =
        mode === "register"
          ? { email: email.trim(), password, username: username.trim() }
          : { email: email.trim(), password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || (mode === "register" ? "Registration failed" : "Login failed"),
        );

      localStorage.setItem("mtc_token", data.token);
      localStorage.setItem("mtc_party", data.party);
      localStorage.setItem("mtc_username", data.username);
      localStorage.setItem("mtc_email", data.email);

      if (mode === "register") {
        setSuccess(`Account created! Party: ${String(data.party).slice(0, 40)}...`);
        setTimeout(() => router.push("/perp/BTC-PERP"), 1200);
      } else {
        router.push("/perp/BTC-PERP");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 mb-6">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Rocky Exchange</h1>
          <p className="text-emerald-400 text-lg font-medium">Trade Mining Platform</p>
          <p className="text-zinc-500 text-sm mt-2">
            Earn MTC tokens for every trade on the Canton blockchain
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          {/* Mode Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "login" ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); setSuccess(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "register" ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                disabled={loading}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={mode === "register" ? 8 : undefined}
              />
            </div>

            {mode === "register" && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-zinc-400 mb-2">
                  Username (display name)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username (3-32 chars)"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  disabled={loading}
                  pattern="[a-zA-Z0-9_-]{3,32}"
                  autoComplete="username"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Letters, numbers, underscore, hyphen. A new party will be allocated on Canton.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-xl">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password || (mode === "register" && !username.trim())}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mode === "register" ? "Creating account..." : "Logging in..."}
                </span>
              ) : mode === "register" ? (
                "Create Account"
              ) : (
                "Log In"
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Canton Network
              </span>
              <span className="text-zinc-700">|</span>
              <span>Splice Protocol</span>
              <span className="text-zinc-700">|</span>
              <span>Trade Mining</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.8: Update TopNav modal to show email**

In `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/components/TopNav.tsx`:

**Edit A** — Add a state for email alongside the existing party/username/token. Find this block (around line 52-54):

```typescript
  const [party, setParty] = useState("");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
```

Change to:

```typescript
  const [party, setParty] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
```

**Edit B** — In the useEffect that reads from localStorage (around line 61-68), add the email read. Find:

```typescript
  useEffect(() => {
    const t = localStorage.getItem("mtc_token") || "";
    const p = localStorage.getItem("mtc_party") || "";
    const u = localStorage.getItem("mtc_username") || "";
    setToken(t);
    setParty(p);
    setUsername(u);
  }, []);
```

Change to:

```typescript
  useEffect(() => {
    const t = localStorage.getItem("mtc_token") || "";
    const p = localStorage.getItem("mtc_party") || "";
    const u = localStorage.getItem("mtc_username") || "";
    const e = localStorage.getItem("mtc_email") || "";
    setToken(t);
    setParty(p);
    setUsername(u);
    setEmail(e);
  }, []);
```

**Edit C** — In the modal's header section, display the email above the username. Find this block (around line 204-213):

```tsx
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white">
                  {(username || "?").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{username}</div>
                  <div className="text-[11px] text-zinc-500">Canton Network DevNet</div>
                </div>
              </div>
```

Change to:

```tsx
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white">
                  {(email || username || "?").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{email || username}</div>
                  <div className="text-[11px] text-zinc-500">@{username} · Canton DevNet</div>
                </div>
              </div>
```

**Edit D** — Update `handleLogout` to also clear email. Find:

```typescript
  function handleLogout() {
    localStorage.removeItem("mtc_token");
    localStorage.removeItem("mtc_party");
    localStorage.removeItem("mtc_username");
    router.push("/");
  }
```

Change to:

```typescript
  function handleLogout() {
    localStorage.removeItem("mtc_token");
    localStorage.removeItem("mtc_party");
    localStorage.removeItem("mtc_username");
    localStorage.removeItem("mtc_email");
    router.push("/");
  }
```

- [ ] **Step 2.9: Update `.env.local.example`**

Open `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/.env.local.example`. At the END of the file, append:

```
# Postgres connection for auth.users (email+password login)
DATABASE_URL=postgres://rocky:rocky@127.0.0.1:5432/rocky
```

If the file already has a `DATABASE_URL=` line, leave it alone.

- [ ] **Step 2.10: Lint + build locally**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
npm run lint 2>&1 | tail -15
```

Expected: clean on the files YOU touched. There may be pre-existing lint errors elsewhere in the project (per the prior round's observation — 66 unrelated errors). Focus on issues in your changes only.

```bash
npm run build 2>&1 | tail -20
```

Expected: clean Next.js build with no type errors. Build takes 30-60 sec.

If the build fails complaining about `pg` or `bcryptjs` types, double-check `npm install` step 2.1 ran cleanly. Reinstall with `npm install` if necessary.

- [ ] **Step 2.11: Commit (specific files only)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git add package.json package-lock.json .env.local.example \
  src/lib/db.ts src/lib/passwords.ts src/lib/users.ts \
  src/app/api/register/route.ts src/app/api/auth/route.ts \
  src/app/page.tsx src/components/TopNav.tsx
git status --short  # verify only the above are staged
git commit -m "feat(auth): email + password login backed by auth.users table

- Add pg + bcryptjs + @types/pg deps
- New src/lib/db.ts (pg.Pool from DATABASE_URL, dev hot-reload safe)
- New src/lib/passwords.ts (bcryptjs hash + verify, 10 rounds)
- New src/lib/users.ts (find by email/username, create)
- Rewrite /api/register: {email, password, username} → validate → check
  uniqueness → bcrypt → allocate Canton party (existing Validator API
  helper) → INSERT auth.users → return {token, party, username, email,
  user_id}
- Rewrite /api/auth: {email, password} → SELECT by email → bcrypt verify
  → mint Canton token via authToken(username) → return same payload.
  Drops the devnet lookupPartyByHint walk — party is stored on the row.
- Login/register form: add email + password inputs; register also keeps
  username (display name + party hint)
- TopNav account modal: show email prominently with @username subtitle;
  clear mtc_email on logout
- .env.local.example: document DATABASE_URL

See docs/superpowers/specs/2026-05-25-email-password-auth-design.md."
```

After commit: mtc-exchange has 1 unpushed commit on `main`. **Do NOT push.**

---

## Task 3: Deploy + browser smoke + push both repos

**Files:** none modified (purely operational).

### Step 3.1: Backend build + restart on EC2

- [ ] **3.1.1: Build (touched migrate.rs forces internal-ledger rebuild)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build 2>&1 | tail -10
```

Expected: incremental build including internal-ledger recompile (due to the migrate.rs touch in T1.2).

- [ ] **3.1.2: Restart all services**

```bash
bash scripts/dev/services-remote.sh restart 2>&1 | tail -10
```

Expected: all 8 services killed and re-launched; migrations run on internal-ledger startup.

- [ ] **3.1.3: Verify the migration ran**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "\\d auth.users"'
```

Expected: table description showing `user_id`, `email`, `password_hash`, `username`, `party`, `created_at` columns, with the email index `users_email_lower_idx`.

If the table doesn't exist, internal-ledger may not have detected the migration. Re-run 3.1.1 (the migrate.rs touch from T1.2 should have forced the rebuild). If still missing, force rebuild:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'cd ~/rocky-backend-stack && source ~/.cargo/env && touch services/internal-ledger/src/migrate.rs && cargo build --release -p internal-ledger 2>&1 | tail -5'
bash scripts/dev/services-remote.sh restart 2>&1 | tail -5
```

### Step 3.2: Truncate test users (start-fresh decision)

- [ ] **3.2.1: Empty the table**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "TRUNCATE auth.users; SELECT count(*) FROM auth.users"'
```

Expected: `count = 0`.

### Step 3.3: Set DATABASE_URL on EC2 frontend

- [ ] **3.3.1: Append to ~/mtc-exchange-devnet/.env.local if missing**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'grep -q "^DATABASE_URL=" ~/mtc-exchange-devnet/.env.local || echo "DATABASE_URL=postgres://rocky:rocky@127.0.0.1:5432/rocky" >> ~/mtc-exchange-devnet/.env.local; grep DATABASE_URL ~/mtc-exchange-devnet/.env.local'
```

Expected: prints the `DATABASE_URL=postgres://...` line. If it's already there from a prior round, this is a no-op.

### Step 3.4: Frontend deploy

- [ ] **3.4.1: Run deploy script**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
bash deploy-devnet.sh 2>&1 | tail -25
```

Expected:
- `rsync src` (uploads new code including lib/db.ts etc.)
- `Installing .env.local (devnet)`
- `npm ci` (installs new bcryptjs + pg deps on EC2 — this may take 30-60 sec)
- `npm run build` (clean build)
- `Stopping anything on :8080`
- `Starting next start on :8080`
- `Smoke: POST /api/auth alice-test` (the old smoke test in deploy-devnet.sh uses the OLD payload shape — it will return 400 "email is required" now. **That's expected and not a failure of the deploy itself** — the new server is up).

### Step 3.5: Browser smoke test

- [ ] **3.5.1: Verify the new register form renders**

Open `https://demo.rocky.exchange` in a browser (incognito tab recommended to avoid stale localStorage):

- Should see the login form with **Email** and **Password** fields
- Click the "Register" tab → form should also show **Username (display name)** field
- Old single-field username form is gone

- [ ] **3.5.2: Register a fresh test user**

In Register mode:
- Email: `test1@example.com`
- Password: `password123`
- Username: `testuser1`

Click "Create Account". Should see a success banner with the party ID, then auto-redirect to `/perp/BTC-PERP`. Open the TopNav account modal — should show email `test1@example.com` (prominently) and `@testuser1` (subtitle).

- [ ] **3.5.3: Logout + re-login**

Click Logout in the modal. Should land on `/`. Confirm fields are empty. Log in with:
- Email: `test1@example.com`
- Password: `password123`

Should land on `/perp/BTC-PERP` with the same identity.

- [ ] **3.5.4: Error cases**

In an incognito tab, attempt:
- Login with `test1@example.com` + wrong password → should see `invalid email or password` error
- Login with `nobody@example.com` + any password → should see same generic error (don't leak email existence)
- Register with `test1@example.com` (already exists) → should see `an account with this email already exists`
- Register with `test2@example.com` / short password (`12345`) → should see `password must be at least 8 characters`

If any of these don't behave as specified, capture the actual error message and report.

### Step 3.6: Push both repos

Only if all smoke checks pass:

- [ ] **3.6.1: Push rocky-backend**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git log --oneline origin/main..HEAD
git push origin main
```

Expected: 1 commit ahead (the migration commit), push succeeds.

- [ ] **3.6.2: Push mtc-exchange**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git log --oneline origin/main..HEAD
git push origin main
```

Expected: 1 commit ahead (the email-auth commit), push succeeds.

- [ ] **3.6.3: Verify both clean**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend && git log --oneline origin/main..HEAD
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange && git log --oneline origin/main..HEAD
```

Both should return empty.

---

## Final Acceptance Checklist

- [ ] `cargo build -p internal-ledger` clean locally
- [ ] `npm run lint` clean for the new/modified files (pre-existing project errors OK)
- [ ] `npm run build` clean
- [ ] `auth.users` table exists on EC2 with 5 columns + lower(email) index
- [ ] `auth.users` was truncated post-migration (count = 0)
- [ ] `DATABASE_URL` set in EC2 `~/mtc-exchange-devnet/.env.local`
- [ ] Frontend deploy completed; new register form renders with Email + Password + Username
- [ ] Registered `test1@example.com / password123 / testuser1` successfully
- [ ] TopNav account modal shows email prominently
- [ ] Logout + re-login with same email + password works
- [ ] Wrong password rejected with generic error
- [ ] Non-existent email rejected with generic error
- [ ] Duplicate email rejected with 409
- [ ] Bot still active and trading (`systemctl --user is-active rocky-bot` → `active`)
- [ ] Both repos pushed; both `log..HEAD` empty

When all checked, email+password auth is live on demo.rocky.exchange, the bot is undisturbed, and existing passwordless logins are gone.
