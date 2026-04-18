import { ReactNode, useCallback, useRef } from "react";

import Button from "components/Button/Button";

import WalletIcon from "img/ic_wallet.svg?react";

type Props = {
  children: ReactNode;
  onClick?: () => void;
};

export default function ConnectWalletButton({ children, onClick }: Props) {
  const isConnectingRef = useRef(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Prevent multiple simultaneous connection requests
      if (isConnectingRef.current || !onClick) {
        return;
      }

      isConnectingRef.current = true;
      try {
        onClick();
      } finally {
        // Reset after a short delay to allow the modal to open
        setTimeout(() => {
          isConnectingRef.current = false;
        }, 1000);
      }
    },
    [onClick]
  );

  return (
    <Button
      variant="primary"
      size="controlled"
      data-qa="connect-wallet-button"
      className="flex h-40 items-center gap-6 max-md:h-32"
      onClick={handleClick}
    >
      <WalletIcon className="box-content size-20" />
      <span>{children}</span>
    </Button>
  );
}
