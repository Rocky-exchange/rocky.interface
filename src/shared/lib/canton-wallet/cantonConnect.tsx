import { Trans } from "@lingui/macro";
import React, { useSyncExternalStore } from "react";

import { useCantonWallet } from "./useCantonWallet";
import type { WalletProviderId } from "./types";
import { getWalletProviderLogo, type WalletProviderLogo } from "./walletLogos";

let isOpenState = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
export function openCantonConnect() {
  isOpenState = true;
  emit();
}
export function closeCantonConnect() {
  isOpenState = false;
  emit();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function useOpen() {
  return useSyncExternalStore(
    subscribe,
    () => isOpenState,
    () => false
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: "#16161a",
  border: "1px solid #2a2a31",
  borderRadius: 12,
  padding: 24,
  width: 360,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const option: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  minHeight: 68,
  borderRadius: 8,
  background: "#23232b",
  color: "#fff",
  border: "1px solid #33333d",
  cursor: "pointer",
  fontSize: 15,
  textAlign: "left",
};
const optionLogoFrame: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 32,
  height: 32,
  overflow: "visible",
  borderRadius: 12,
  background: "transparent",
};
const optionText: React.CSSProperties = { flex: "1 1 auto" };
const title: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#fff" };
const errorText: React.CSSProperties = { color: "#ff6b6b", fontSize: 13 };

const WALLET_OPTIONS: Array<{ provider: Exclude<WalletProviderId, "other">; label: string }> = [
  { provider: "rocky", label: "Rocky Wallet" },
  { provider: "loop", label: "Loop Wallet" },
  { provider: "console", label: "Console Wallet" },
];

export function CantonConnectModal() {
  const open = useOpen();
  const { connect, connecting, error } = useCantonWallet();
  if (!open) return null;
  const pick = async (p: "rocky" | "loop" | "console") => {
    try {
      await connect(p);
      closeCantonConnect();
    } catch (_error) {
      /* error shown */
    }
  };

  return (
    <div style={overlay} onClick={closeCantonConnect}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={title}>
          <Trans>Connect Wallet</Trans>
        </div>
        {WALLET_OPTIONS.map((item) => {
          const logo = getWalletProviderLogo(item.provider);
          return (
            <button
              key={item.provider}
              type="button"
              style={option}
              disabled={connecting}
              onClick={() => pick(item.provider)}
            >
              <span style={optionLogoFrame}>
                <img src={logo.src} alt="" style={logoImageStyle(logo)} />
              </span>
              <span style={optionText}>{item.label}</span>
            </button>
          );
        })}
        {error ? <div style={errorText}>{error}</div> : null}
      </div>
    </div>
  );
}

function logoImageStyle(logo: WalletProviderLogo): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "block",
    flex: "0 0 auto",
    width: "100%",
    height: "100%",
  };
  if (logo.fit === "contain") {
    return { ...base, objectFit: "contain" };
  }
  return { ...base, objectFit: "cover" };
}
