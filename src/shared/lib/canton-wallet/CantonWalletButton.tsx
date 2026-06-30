import { useState } from "react";

import ConnectWalletButton from "@/shared/components/ConnectWalletButton/ConnectWalletButton";
import { useCantonSession } from "./useCantonSession";
import { openCantonConnect } from "./cantonConnect";
import { CantonFundsModal } from "./CantonFundsModal";

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
  return <ConnectWalletButton onClick={() => openCantonConnect()}>Connect wallet</ConnectWalletButton>;
}
