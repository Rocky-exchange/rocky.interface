import { Trans, t } from "@lingui/macro";
import { useCallback, useMemo, useState } from "react";
import { useCopyToClipboard } from "react-use";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { getAddress, parseUnits } from "viem";

import { ContractsChainId } from "config/chains";
import { getExplorerUrl } from "config/chains";
import { helperToast } from "lib/helperToast";
import { shortenAddress } from "lib/legacy";
import { formatUsd } from "lib/numbers";
import { parseValue } from "lib/numbers";
import { formatDate } from "lib/dates";
import { userAnalytics } from "lib/userAnalytics";
import { ReferralShareEvent } from "lib/userAnalytics/types";
import useWallet from "lib/wallets/useWallet";

/**
 * 格式化金额为 USD，使用截断而非四舍五入
 * @param value - 字符串形式的金额（如 "0.246501089890600000"）
 * @param decimals - 显示的小数位数（默认 2）
 */
function formatUsdTruncated(value: string | undefined, decimals: number = 2): string {
  if (!value) return "$0.00";

  const num = parseFloat(value);
  if (isNaN(num)) return "$0.00";

  // 使用 Math.floor 截断而非四舍五入
  const multiplier = Math.pow(10, decimals);
  const truncated = Math.floor(num * multiplier) / multiplier;

  return `$${truncated.toFixed(decimals)}`;
}

import Button from "components/Button/Button";
import ExternalLink from "components/ExternalLink/ExternalLink";
import ReferralInfoCard from "./ReferralInfoCard";
import { getReferralCodeTradeUrl, getTwitterShareUrl } from "./referralsHelper";
import CopyIcon from "img/ic_copy.svg?react";
import TwitterIcon from "img/ic_x.svg?react";
import { TrackingLink } from "components/TrackingLink/TrackingLink";
import { TableTd, TableTh, TableTheadTr, TableTr } from "components/Table/Table";
import { TableScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";
import Card from "../Card/Card";
import Loader from "../Loader/Loader";
import { useReferralDashboard } from "@/modules/cex/lib/api/custom/useReferralDashboard";
import { getReferralClaimSignature } from "@/modules/cex/lib/api/custom/client";
import { getReferralRebateAddress } from "config/custom/contracts";

type Props = {
  chainId: ContractsChainId;
};

// ReferralRebate ABI for claimRebate function
const REBATE_ABI = [
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    name: "claimRebate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function ReferralDashboard({ chainId }: Props) {
  const { address } = useAccount();
  const { walletClient } = useWallet();
  const publicClient = usePublicClient({ chainId });
  const [, copyToClipboard] = useCopyToClipboard();
  const [isClaiming, setIsClaiming] = useState(false);

  // useReferralDashboard internally uses useAuthToken() to check for token
  // No need for redundant token check here
  const { dashboard, isLoading, error, mutate } = useReferralDashboard(chainId);

  const trackCopyCode = useCallback(() => {
    userAnalytics.pushEvent<ReferralShareEvent>(
      {
        event: "ReferralCodeAction",
        data: {
          action: "CopyCode",
        },
      },
      { instantSend: true }
    );
  }, []);

  const trackShareTwitter = useCallback(() => {
    userAnalytics.pushEvent<ReferralShareEvent>(
      {
        event: "ReferralCodeAction",
        data: {
          action: "ShareTwitter",
        },
      },
      { instantSend: true }
    );
  }, []);

  const handleCopy = useCallback(() => {
    if (!dashboard?.code) return;
    trackCopyCode();
    copyToClipboard(getReferralCodeTradeUrl(dashboard.code));
    helperToast.success(t`Referral link copied to your clipboard`);
  }, [dashboard?.code, trackCopyCode, copyToClipboard]);

  const handleClaim = useCallback(async () => {
    if (!dashboard?.pending_earnings || !walletClient || !publicClient || !address) {
      helperToast.error(t`Missing required parameters for claiming`);
      return;
    }

    const pendingAmount = parseFloat(dashboard.pending_earnings);
    if (pendingAmount <= 0) {
      helperToast.error(t`No pending earnings to claim`);
      return;
    }

    setIsClaiming(true);
    try {
      // Step 1: Get claim signature from backend
      const claimResponse = await getReferralClaimSignature(chainId, {
        amount: dashboard.pending_earnings,
      });

      if (!claimResponse.signature) {
        throw new Error("Backend did not return signature");
      }

      // Step 2: Call contract to claim rebate
      const amountInWei = BigInt(claimResponse.amount);
      const deadline = BigInt(claimResponse.deadline);
      const signature = claimResponse.signature as `0x${string}`;

      const defaultContractAddress = getReferralRebateAddress(chainId);
      const contractAddress = (claimResponse.contract_address || defaultContractAddress) as `0x${string}`;

      if (!contractAddress) {
        throw new Error(`ReferralRebate contract address not found for chain ${chainId}`);
      }

      // Step 2.1: Simulate contract call first to catch revert errors
      console.log("[ReferralDashboard] Simulating claimRebate with params:", {
        contractAddress,
        amount: amountInWei.toString(),
        deadline: deadline.toString(),
        signature,
        account: address,
      });

      try {
        const { request } = await publicClient.simulateContract({
          address: contractAddress,
          abi: REBATE_ABI,
          functionName: "claimRebate",
          args: [amountInWei, deadline, signature],
          account: getAddress(address),
        });
        console.log("[ReferralDashboard] Simulation successful, request:", request);
      } catch (simulationError: unknown) {
        console.error("[ReferralDashboard] Contract simulation failed:", simulationError);

        // Extract detailed error information
        if (simulationError && typeof simulationError === "object") {
          const err = simulationError as Record<string, unknown>;
          console.error("[ReferralDashboard] Error details:", {
            name: err.name,
            message: err.message,
            cause: err.cause,
            // ContractFunctionExecutionError specific fields
            contractAddress: err.contractAddress,
            functionName: err.functionName,
            args: err.args,
            // Revert error details
            data: err.data,
            reason: err.reason,
            shortMessage: err.shortMessage,
          });
        }

        // Re-throw with more context
        throw simulationError;
      }

      // Step 2.2: Execute the actual transaction
      const txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: REBATE_ABI,
        functionName: "claimRebate",
        args: [amountInWei, deadline, signature],
        account: getAddress(address),
        chain: publicClient.chain,
      });

      helperToast.success(t`Claim transaction submitted`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      helperToast.success(t`Claim completed successfully`);

      // Refresh dashboard data
      await mutate();

      // Open explorer link
      const explorerUrl = getExplorerUrl(chainId, receipt.transactionHash);
      if (explorerUrl) {
        window.open(explorerUrl, "_blank");
      }
    } catch (error: any) {
      console.error("[ReferralDashboard] Failed to claim rebate:", error);
      helperToast.error(error?.message || t`Failed to claim rebate`);
    } finally {
      setIsClaiming(false);
    }
  }, [dashboard, walletClient, publicClient, address, chainId, mutate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-40">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-12 p-40 text-typography-secondary">
        <p>{t`Failed to load dashboard`}</p>
        <Button variant="secondary" onClick={() => mutate()}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center p-40 text-typography-secondary">
        <Trans>No dashboard data available</Trans>
      </div>
    );
  }

  const hasPendingEarnings = parseFloat(dashboard.pending_earnings || "0") > 0;
  const tier = dashboard.tier;

  return (
    <div className="flex flex-col gap-16">
      {/* Referral Code Section */}
      {dashboard.code && (
        <div className="referral-card section-center">
          <h2 className="title">
            <Trans>Your Referral Code</Trans>
          </h2>
          <p className="sub-title">
            <Trans>Share your referral code and earn rebates from traders you refer.</Trans>
          </p>
          <div className="card-action">
            <div className="flex items-center justify-center gap-12 mb-16">
              <span className="referral-text text-20 font-mono font-medium">{dashboard.code}</span>
              <div
                onClick={handleCopy}
                className="referral-code-icon size-20 cursor-pointer text-typography-secondary hover:text-typography-primary flex items-center"
              >
                <CopyIcon className="size-20" />
              </div>
              <TrackingLink onClick={trackShareTwitter}>
                <a
                  href={getTwitterShareUrl(dashboard.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="referral-code-icon size-20 text-typography-secondary hover:text-typography-primary flex items-center"
                >
                  <TwitterIcon className="size-20" />
                </a>
              </TrackingLink>
            </div>
            <Button variant="primary-action" className="w-full max-w-[400px] mx-auto" onClick={handleCopy}>
              <Trans>Copy Referral Link</Trans>
            </Button>
          </div>
        </div>
      )}

      {/* Stats Cards - 5 cards: Total Referrals, Active Referrals, Claimed Earnings, Total Earnings, Pending Earnings */}
      <div className="grid grid-cols-5 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-8">
        <ReferralInfoCard
          value={String(dashboard.total_referrals ?? "N/A")}
          label={t`Total Referrals`}
          labelTooltipText={t`Total number of traders you referred.`}
        />
        <ReferralInfoCard
          value={String(dashboard.active_referrals ?? "N/A")}
          label={t`Active Referrals`}
          labelTooltipText={t`Number of active traders you referred.`}
        />
        <ReferralInfoCard
          value={
            dashboard.claimed_earnings
              ? formatUsd(parseValue(dashboard.claimed_earnings, 30), { fallbackToZero: true }) || "N/A"
              : "N/A"
          }
          label={t`Claimed Earnings`}
          labelTooltipText={t`Total earnings that have been claimed.`}
        />
        <ReferralInfoCard
          value={
            dashboard.total_earnings
              ? formatUsd(parseValue(dashboard.total_earnings, 30), { fallbackToZero: true }) || "N/A"
              : "N/A"
          }
          label={t`Total Earnings`}
          labelTooltipText={t`Total earnings from referrals.`}
        />
        <ReferralInfoCard
          value={
            dashboard.pending_earnings
              ? formatUsd(parseValue(dashboard.pending_earnings, 30), { fallbackToZero: true }) || "N/A"
              : "N/A"
          }
          label={t`Pending Earnings`}
          labelTooltipText={t`Earnings available to claim.`}
        />
      </div>

      {/* Tier Info and Claim Section */}
      {tier && (
        <Card
          title={
            <div className="flex w-full flex-row gap-12">
              <div className="flex w-full items-center justify-between">
                <span>
                  <Trans>Tier: {tier.name}</Trans>
                  <span className="ml-8 text-body-small text-typography-secondary">
                    ({t`Commission Rate: ${tier.commission_rate}%`})
                  </span>
                </span>
              </div>
              {hasPendingEarnings && (
                <div className="flex justify-end">
                  <Button
                    variant="primary-action"
                    onClick={handleClaim}
                    disabled={isClaiming}
                    className="min-w-[120px]"
                  >
                    {isClaiming ? <Trans>Claiming...</Trans> : <Trans>Claim</Trans>}
                  </Button>
                </div>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between text-body-small">
              <span className="text-typography-secondary">
                <Trans>Claimed Earnings</Trans>
              </span>
              <span className="text-typography-primary font-medium">
                {formatUsd(dashboard.claimed_earnings || "0")}
              </span>
            </div>
            {tier.next_tier_requirement > 0 && (
              <div className="flex items-center justify-between text-body-small">
                <span className="text-typography-secondary">
                  <Trans>Next Tier Requirement</Trans>
                </span>
                <span className="text-typography-primary font-medium">
                  {t`${tier.next_tier_requirement} referrals`}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      {dashboard.recent_activity && dashboard.recent_activity.length > 0 && (
        <Card title={<Trans>Recent Activity</Trans>} divider={true} bodyPadding={false}>
          <TableScrollFadeContainer>
            <table className="w-full">
              <thead>
                <TableTheadTr>
                  <TableTh scope="col">
                    <Trans>Referral Address</Trans>
                  </TableTh>
                  <TableTh scope="col">
                    <Trans>Event Type</Trans>
                  </TableTh>
                  <TableTh scope="col">
                    <Trans>Volume</Trans>
                  </TableTh>
                  <TableTh scope="col">
                    <Trans>Commission</Trans>
                  </TableTh>
                  <TableTh scope="col">
                    <Trans>Time</Trans>
                  </TableTh>
                </TableTheadTr>
              </thead>
              <tbody>
                {dashboard.recent_activity.map((activity, index) => (
                  <TableTr key={index}>
                      <TableTd data-label="Referral Address">
                        {activity.referral_address ? (
                          <ExternalLink
                            href={getExplorerUrl(chainId, activity.referral_address)}
                            className="text-primary hover:text-primary-hover"
                          >
                            {shortenAddress(activity.referral_address, 13) || activity.referral_address}
                          </ExternalLink>
                        ) : (
                          <span className="text-typography-secondary">-</span>
                        )}
                      </TableTd>
                    <TableTd data-label="Event Type" className="capitalize">
                      {activity.event_type}
                    </TableTd>
                    <TableTd data-label="Volume">
                      {formatUsd(parseValue(activity.volume, 30), { fallbackToZero: true })}
                    </TableTd>
                    <TableTd data-label="Commission">
                      {formatUsdTruncated(activity.commission)}
                    </TableTd>
                    <TableTd data-label="Time">
                      {(() => {
                        // API returns timestamp in milliseconds, but formatDate expects seconds
                        // So we need to convert milliseconds to seconds
                        const timestampMs =
                          typeof activity.timestamp === "string"
                            ? parseInt(activity.timestamp)
                            : activity.timestamp;
                        // Convert milliseconds to seconds for formatDate
                        const timestampSeconds = Math.floor(timestampMs / 1000);
                        return formatDate(timestampSeconds);
                      })()}
                    </TableTd>
                  </TableTr>
                ))}
              </tbody>
            </table>
          </TableScrollFadeContainer>
        </Card>
      )}
    </div>
  );
}
