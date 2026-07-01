import { Trans } from "@lingui/macro";
import { useState } from "react";

import ConnectWalletButton from "@/shared/components/ConnectWalletButton/ConnectWalletButton";

import { openCantonConnect } from "./cantonConnect";
import { CantonFundsModal } from "./CantonFundsModal";
import { useCantonSession } from "./useCantonSession";

export function CantonWalletButton() {
  const { connected, username, party } = useCantonSession();
  const [fundsOpen, setFundsOpen] = useState(false);
  if (connected) {
    return (
      <>
        <ConnectWalletButton onClick={() => setFundsOpen(true)}>{username || `${party.slice(0, 8)}...`}</ConnectWalletButton>
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
