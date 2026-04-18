import { Trans } from "@lingui/macro";
import cx from "classnames";
import { useCallback } from "react";
import Skeleton from "react-loading-skeleton";

import { useGmxAccountModalOpen } from "context/GmxAccountContext/hooks";
import { useGmxAccountShowDepositButton } from "domain/multichain/useGmxAccountShowDepositButton";
import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { useChainId } from "lib/chains";
import { useENS } from "lib/legacy";
import { formatUsd } from "lib/numbers";
import { useBreakpoints } from "lib/useBreakpoints";
import { shortenAddressOrEns } from "lib/wallets";

import { Avatar } from "components/Avatar/Avatar";
import Button from "components/Button/Button";
import { useAvailableToTradeAssetSettlementChain } from "components/GmxAccountModal/hooks";

type Props = {
  account: string;
};

export function AddressDropdownWithMultichain({ account }: Props) {
  const { srcChainId } = useChainId();
  const { ensName } = useENS(account);
  const [, setGmxAccountModalOpen] = useGmxAccountModalOpen();
  const { totalUsd, apiAccountUsd, isGmxAccountLoading } = useAvailableToTradeAssetSettlementChain();
  const { shouldShowDepositButton } = useGmxAccountShowDepositButton();

  const { isMobile, isSmallMobile } = useBreakpoints();
  const displayAddressLength = isMobile ? 9 : 13;

  const handleOpenGmxAccountModal = useCallback(() => {
    setGmxAccountModalOpen(true);
  }, [setGmxAccountModalOpen]);

  const handleOpenDeposit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setGmxAccountModalOpen("deposit");
    },
    [setGmxAccountModalOpen]
  );

  // In x10000 mode, always show apiAccountUsd (from /balances API)
  const shouldShowGmxAccountBalance = isX10000ModeActive() || srcChainId !== undefined;
  const showSideButton = shouldShowGmxAccountBalance || (apiAccountUsd !== undefined && apiAccountUsd > 0n);

  return (
    <div className="text-body-medium flex font-medium text-typography-primary">
      <Button
        variant="secondary"
        type="button"
        size="controlled"
        className={cx("h-32 md:h-40", {
          "!py-4 !pl-12 !pr-4": shouldShowDepositButton && !isMobile,
          "!py-0 !pl-12 !pr-0": shouldShowDepositButton && isMobile,
        })}
        onClick={handleOpenGmxAccountModal}
      >
        <div
          className={cx(
            "text-body-medium flex items-center font-medium text-typography-primary",
            !isMobile && (!shouldShowDepositButton ? "gap-16" : "gap-20"),
            isMobile && "gap-8"
          )}
        >
          <div className="flex items-center gap-8">
            <Avatar size={isMobile ? 16 : 24} ensName={ensName} address={account} />

            {!isSmallMobile && <>{shortenAddressOrEns(ensName || account, displayAddressLength)}</>}
          </div>

          {showSideButton && !shouldShowDepositButton && (
            <>
              {!isSmallMobile && <div className="h-20 w-1 shrink-0 bg-slate-600" />}

              {isGmxAccountLoading ? (
                <Skeleton baseColor="#B4BBFF1A" highlightColor="#B4BBFF1A" width={55} height={18} />
              ) : (
                formatUsd(shouldShowGmxAccountBalance ? apiAccountUsd : totalUsd, { displayDecimals: 0 })
              )}
            </>
          )}

          {shouldShowDepositButton && (
            <Button variant="primary" onClick={handleOpenDeposit}>
              <Trans>Deposit</Trans>
            </Button>
          )}
        </div>
      </Button>
    </div>
  );
}
