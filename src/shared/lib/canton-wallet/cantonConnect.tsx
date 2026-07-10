import { Trans } from "@lingui/macro";
import React, { useState, useSyncExternalStore } from "react";

import { useCantonWallet } from "./useCantonWallet";
import type { WalletProviderId } from "./types";
import { getWalletProviderLogo, type WalletProviderLogo } from "./walletLogos";

export const ROCKY_WALLET_CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/rocky-wallet/mgafpjfkpppnmpcdfpjghcajhpljomcn";

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
const optionPending: React.CSSProperties = {
  borderColor: "#4b5563",
  background: "#282832",
};
const optionDisabled: React.CSSProperties = {
  cursor: "wait",
  opacity: 0.62,
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
const optionTextStack: React.CSSProperties = {
  display: "grid",
  gap: 4,
  flex: "1 1 auto",
};
const optionSubText: React.CSSProperties = {
  color: "#aeb7c8",
  fontSize: 12,
  lineHeight: 1.2,
};
const optionSpinnerFrame: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 22,
  height: 22,
  color: "#aeb7c8",
};
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
  const [connectingProvider, setConnectingProvider] = useState<Exclude<WalletProviderId, "other"> | null>(null);
  if (!open) return null;
  const pick = async (p: "rocky" | "loop" | "console") => {
    if (p === "rocky" && !window.rockyWallet) {
      window.open(ROCKY_WALLET_CHROME_WEB_STORE_URL, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      setConnectingProvider(p);
      await connect(p);
      closeCantonConnect();
    } catch (_error) {
      /* error shown */
    } finally {
      setConnectingProvider(null);
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
          const isPending = connecting && connectingProvider === item.provider;
          return (
            <button
              key={item.provider}
              type="button"
              style={{
                ...option,
                ...(connecting ? optionDisabled : null),
                ...(isPending ? optionPending : null),
              }}
              disabled={connecting}
              onClick={() => pick(item.provider)}
            >
              <span style={optionLogoFrame}>
                <img src={logo.src} alt="" style={logoImageStyle(logo)} />
              </span>
              <span style={isPending ? optionTextStack : optionText}>
                <span>{item.label}</span>
                {isPending ? (
                  <span style={optionSubText}>
                    <Trans>Connecting...</Trans>
                  </span>
                ) : null}
              </span>
              {isPending ? (
                <span style={optionSpinnerFrame}>
                  <ConnectingSpinner />
                </span>
              ) : null}
            </button>
          );
        })}
        {error ? <div style={errorText}>{error}</div> : null}
      </div>
    </div>
  );
}

function ConnectingSpinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2.4" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          dur="0.85s"
          from="0 12 12"
          repeatCount="indefinite"
          to="360 12 12"
          type="rotate"
        />
      </path>
    </svg>
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
