import { Trans } from "@lingui/macro";

import { NETWORK_OPTIONS } from "config/networkOptions";
import { useChainId } from "lib/chains";
import { CantonWalletButton } from "@/shared/lib/canton-wallet/CantonWalletButton";

import NetworkDropdown from "../NetworkDropdown/NetworkDropdown";

type Props = {
  openSettings: () => void;
  menuToggle?: React.ReactNode;
};

export function AppHeaderUser({ openSettings, menuToggle }: Props) {
  const { chainId: settlementChainId, srcChainId } = useChainId();

  const visualChainId = srcChainId ?? settlementChainId;

  return (
    <div className="flex items-center gap-8">
      <CantonWalletButton />
      <NetworkDropdown chainId={visualChainId} networkOptions={NETWORK_OPTIONS} openSettings={openSettings} />
      {menuToggle ? menuToggle : null}
    </div>
  );
}
