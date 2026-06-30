import React, { type FormEvent, useState, useSyncExternalStore } from "react";
import { useCantonWallet } from "./useCantonWallet";
import { walletPreapprovalAuthorizePath } from "./preapprovalRedirect";
import type { RockyWalletAuthMode } from "./rocky";

let isOpenState = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function openCantonConnect() { isOpenState = true; emit(); }
export function closeCantonConnect() { isOpenState = false; emit(); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function useOpen() { return useSyncExternalStore(subscribe, () => isOpenState, () => false); }

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modal: React.CSSProperties = { background: "#16161a", border: "1px solid #2a2a31", borderRadius: 12, padding: 24, width: 360, display: "flex", flexDirection: "column", gap: 12 };
const option: React.CSSProperties = { padding: "12px 16px", borderRadius: 8, background: "#23232b", color: "#fff", border: "1px solid #33333d", cursor: "pointer", fontSize: 15 };
const secondaryButton: React.CSSProperties = { background: "transparent", color: "#9aa1ad", border: 0, cursor: "pointer", padding: 0, fontSize: 13, textAlign: "left" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #33333d", background: "#101014", color: "#fff", fontSize: 14 };
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, color: "#cfd3dc", fontSize: 13 };
const helper: React.CSSProperties = { color: "#9aa1ad", fontSize: 12, lineHeight: 1.4 };

export function CantonConnectModal() {
  const open = useOpen();
  const { connect, connectRocky, connecting, error } = useCantonWallet();
  const [showRocky, setShowRocky] = useState(false);
  const [rockyMode, setRockyMode] = useState<RockyWalletAuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [preapprovalPath, setPreapprovalPath] = useState("");
  if (!open) return null;
  const pick = async (p: "loop" | "console") => { try { await connect(p); closeCantonConnect(); } catch (_error) { /* error shown */ } };

  const submitRocky = async (event: FormEvent) => {
    event.preventDefault();
    const result = await connectRocky({ mode: rockyMode, email, password, username });
    if (result.preapprovalRequired) {
      setPreapprovalPath(walletPreapprovalAuthorizePath(getReturnToPath()));
      return;
    }
    closeCantonConnect();
  };

  return (
    <div style={overlay} onClick={closeCantonConnect}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Connect Wallet</div>
        {!showRocky ? (
          <>
            <button type="button" style={option} disabled={connecting} onClick={() => setShowRocky(true)}>Rocky Wallet</button>
            <button type="button" style={option} disabled={connecting} onClick={() => pick("loop")}>Loop Wallet</button>
            <button type="button" style={option} disabled={connecting} onClick={() => pick("console")}>Console Wallet</button>
          </>
        ) : (
          <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={submitRocky}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={{ ...option, flex: 1, background: rockyMode === "login" ? "#343440" : "#23232b" }}
                onClick={() => setRockyMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                style={{ ...option, flex: 1, background: rockyMode === "register" ? "#343440" : "#23232b" }}
                onClick={() => setRockyMode("register")}
              >
                Register
              </button>
            </div>
            {rockyMode === "register" ? (
              <label style={label}>
                Username
                <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              </label>
            ) : null}
            <label style={label}>
              Email
              <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            </label>
            <label style={label}>
              Password
              <input style={input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={rockyMode === "register" ? "new-password" : "current-password"} />
            </label>
            <button type="submit" style={option} disabled={connecting}>
              {connecting ? "Connecting..." : rockyMode === "register" ? "Create Rocky Wallet" : "Connect Rocky Wallet"}
            </button>
            {preapprovalPath ? (
              <div style={helper}>
                Wallet authorization is required before Rocky Wallet transfers.
                <br />
                <button type="button" style={{ ...secondaryButton, color: "#fff", marginTop: 6 }} onClick={() => window.location.assign(preapprovalPath)}>
                  Open wallet authorization
                </button>
              </div>
            ) : null}
            <button type="button" style={secondaryButton} onClick={() => setShowRocky(false)}>
              Back to wallet choices
            </button>
          </form>
        )}
        {error ? <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div> : null}
      </div>
    </div>
  );
}

function getReturnToPath(): string {
  if (typeof window === "undefined") return "/trade";
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/trade";
}
