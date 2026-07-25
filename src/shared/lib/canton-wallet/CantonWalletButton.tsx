import { Trans } from "@lingui/macro";
import { useState } from "react";

import ConnectWalletButton from "@/shared/components/ConnectWalletButton/ConnectWalletButton";

import { openCantonConnect } from "./cantonConnect";
import { CantonFundsModal } from "./CantonFundsModal";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";

export function CantonWalletButton() {
  const { connected, locked, username, party, provider } = useCantonSession();
  const { unlock, connecting } = useCantonWallet();
  const [fundsOpen, setFundsOpen] = useState(false);
  if (locked) {
    return (
      <ConnectWalletButton onClick={() => void unlock().catch(() => undefined)}>
        {connecting ? <Trans>Unlocking...</Trans> : <Trans>Unlock</Trans>}
      </ConnectWalletButton>
    );
  }
  if (connected) {
    const walletLabel = provider === "send" ? "sendwallet" : username || `${party.slice(0, 8)}...`;
    return (
      <>
        <ConnectWalletButton onClick={() => setFundsOpen(true)}>{walletLabel}</ConnectWalletButton>
        <CantonFundsModal open={fundsOpen} onClose={() => setFundsOpen(false)} />
      </>
    );
  }
  return (
    <ConnectWalletButton onClick={() => openCantonConnect()}>
      <Trans>Connect wallet</Trans>
    </ConnectWalletButton>
  );
}
