import { CantonWalletButton } from "@/shared/lib/canton-wallet/CantonWalletButton";
import { CantonConnectModal } from "@/shared/lib/canton-wallet/cantonConnect";

type Props = {
  openSettings: () => void;
  menuToggle?: React.ReactNode;
};

export function AppHeaderUser({ menuToggle }: Props) {
  return (
    <div className="flex items-center gap-8">
      {menuToggle ? menuToggle : null}
      <CantonWalletButton />
      <CantonConnectModal />
    </div>
  );
}
