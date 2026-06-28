import React, { useSyncExternalStore } from "react";
import { useCantonWallet } from "./useCantonWallet";

let isOpenState = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function openCantonConnect() { isOpenState = true; emit(); }
export function closeCantonConnect() { isOpenState = false; emit(); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function useOpen() { return useSyncExternalStore(subscribe, () => isOpenState, () => false); }

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modal: React.CSSProperties = { background: "#16161a", border: "1px solid #2a2a31", borderRadius: 12, padding: 24, width: 320, display: "flex", flexDirection: "column", gap: 12 };
const option: React.CSSProperties = { padding: "12px 16px", borderRadius: 8, background: "#23232b", color: "#fff", border: "1px solid #33333d", cursor: "pointer", fontSize: 15 };

export function CantonConnectModal() {
  const open = useOpen();
  const { connect, connecting, error } = useCantonWallet();
  if (!open) return null;
  const pick = async (p: "loop" | "console") => { try { await connect(p); closeCantonConnect(); } catch { /* error shown */ } };
  return (
    <div style={overlay} onClick={closeCantonConnect}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Connect Wallet</div>
        <button style={option} disabled={connecting} onClick={() => pick("loop")}>Loop Wallet</button>
        <button style={option} disabled={connecting} onClick={() => pick("console")}>Console Wallet</button>
        {error ? <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div> : null}
      </div>
    </div>
  );
}
