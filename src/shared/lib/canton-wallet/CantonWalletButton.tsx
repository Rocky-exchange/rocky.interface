import ConnectWalletButton from "@/shared/components/ConnectWalletButton/ConnectWalletButton";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";
import { openCantonConnect } from "./cantonConnect";

export function CantonWalletButton() {
  const { connected, username, party } = useCantonSession();
  const { disconnect } = useCantonWallet();
  if (connected) {
    return <ConnectWalletButton onClick={disconnect}>{username || `${party.slice(0, 8)}…`}</ConnectWalletButton>;
  }
  return <ConnectWalletButton onClick={() => openCantonConnect()}>Connect wallet</ConnectWalletButton>;
}
