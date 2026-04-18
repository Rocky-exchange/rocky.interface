import { Trans, t } from "@lingui/macro";
import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { selectChainId } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useClaimCollateralHistory } from "domain/synthetics/claimHistory";
import { formatUsd } from "lib/numbers";
import { useZtdxUserBalances, useZtdxUserWithdrawHistory } from "@/modules/cex/lib/api";
import { helperToast } from "lib/helperToast";
import useWallet from "lib/wallets/useWallet";
import { usePublicClient } from "wagmi";

import Button from "components/Button/Button";
import { ClaimsHistory } from "./ClaimsHistory";
import { WithdrawModal } from "./WithdrawModal";

import "./Claims.scss";

const CLAIMS_HISTORY_PREFETCH_SIZE = 100;

export function ClaimsRedesigned() {
  const chainId = useSelector(selectChainId);
  const { account, walletClient } = useWallet();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const [isClaiming, setIsClaiming] = useState(false);

  // Get balances from /balances API
  const { data: balancesData, isLoading: isBalancesLoading, mutate: mutateBalances } = useZtdxUserBalances({
    refreshInterval: 10000,
  });

  // Get withdraw history to calculate total accrued withdrawals
  const { data: withdrawHistoryData, isLoading: isWithdrawHistoryLoading } = useZtdxUserWithdrawHistory({
    refreshInterval: 30000,
  });

  const { isLoading: isHistoryLoading } = useClaimCollateralHistory(chainId, {
    pageSize: CLAIMS_HISTORY_PREFETCH_SIZE,
  });

  // Calculate total accrued withdrawals (sum of all completed withdrawals in USDT)
  const totalAccruedUsdt = useMemo(() => {
    if (!withdrawHistoryData?.withdrawals) return "0.00";

    const completedWithdrawals = withdrawHistoryData.withdrawals.filter(
      (w) => w.status === "completed" && (w.token === "USDT" || w.token === "USDC")
    );

    const total = completedWithdrawals.reduce((sum, w) => {
      return sum + parseFloat(w.amount || "0");
    }, 0);

    return total.toFixed(2);
  }, [withdrawHistoryData]);

  // Get claimable USDT balance from /balances API
  const claimableUsdt = useMemo(() => {
    if (!balancesData?.balances) return "0.00";

    const usdtBalance = balancesData.balances.find(
      (b) => b.token === "USDT" || b.token === "USDC" || b.symbol === "USDT" || b.symbol === "USDC"
    );

    return usdtBalance?.available || "0.00";
  }, [balancesData]);

  const isLoading = isBalancesLoading || isWithdrawHistoryLoading;

  const handleClaimClick = useCallback(() => {
    if (!account || !chainId) {
      helperToast.error(t`Please connect your wallet`);
      return;
    }

    const claimableAmount = parseFloat(claimableUsdt);
    if (claimableAmount <= 0) {
      helperToast.error(t`No USDT available to claim`);
      return;
    }

    setIsClaiming(true);
  }, [account, chainId, claimableUsdt]);

  const handleWithdrawModalClose = useCallback(() => {
    setIsClaiming(false);
  }, []);

  return (
    <>
      {/* Withdraw Modal */}
      <WithdrawModal
        isVisible={isClaiming}
        onClose={handleWithdrawModalClose}
        availableBalance={claimableUsdt}
      />

      <div className="flex grow flex-col gap-16">
        {/* Loading state */}
        {account && isLoading && (
          <div className="Claims-loading bg-slate-900">
            <Trans>Loading...</Trans>
          </div>
        )}

        {/* Two-column layout: Accrued (left) and Claimable (right) */}
        {account && !isLoading && (
          <div className="flex w-full gap-16 max-lg:flex-col">
            {/* Left: Accrued Card */}
            <div className="flex w-full flex-col gap-12 rounded-lg border border-slate-600 bg-slate-900 p-20 lg:w-1/2">
              <div className="text-[11px] font-medium uppercase text-typography-secondary">
                <Trans>Accrued</Trans>
              </div>
              <div className="flex flex-col gap-8">
                <div className="text-2xl font-semibold text-typography-primary">
                  ${parseFloat(totalAccruedUsdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-body-small text-typography-secondary">
                  <Trans>Total accumulated withdrawals in USDT</Trans>
                </div>
              </div>
            </div>

            {/* Right: Claimable Card */}
            <div className="flex w-full flex-col gap-12 rounded-lg border border-slate-600 bg-slate-900 p-20 lg:w-1/2">
              <div className="text-[11px] font-medium uppercase text-typography-secondary">
                <Trans>Claimable</Trans>
              </div>
              <div className="flex flex-col gap-8">
                <div className="text-2xl font-semibold text-typography-primary">
                  ${parseFloat(claimableUsdt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-body-small text-typography-secondary">
                  <Trans>Available USDT balance to withdraw</Trans>
                </div>
                <div className="mt-4">
                  <Button
                    variant="primary"
                    disabled={parseFloat(claimableUsdt) <= 0}
                    onClick={handleClaimClick}
                    className="w-full"
                  >
                    <Trans>Claim</Trans>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Claims History at the bottom */}
        <ClaimsHistory />
      </div>
    </>
  );
}

