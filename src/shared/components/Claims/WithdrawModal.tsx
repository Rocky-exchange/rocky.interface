import { Trans, t } from "@lingui/macro";
import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { selectChainId } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { parseValue, formatAmountFree } from "lib/numbers";
import { useZtdxUserBalances } from "@/modules/cex/lib/api";
import { requestWithdraw, isAuthenticated } from "@/modules/cex/lib/api/custom/client";
import { helperToast } from "lib/helperToast";
import useWallet from "lib/wallets/useWallet";
import { getTokenBySymbolSafe } from "sdk/configs/tokens";
import { parseUnits } from "viem";
import { getX10000ZtdxVaultAddress } from "config/custom/contracts";
import { usePublicClient } from "wagmi";

import Button from "components/Button/Button";
import Modal from "components/Modal/Modal";
import NumberInput from "components/NumberInput/NumberInput";
import { formatUsd } from "lib/numbers";

const USD_DECIMALS = 30;

interface WithdrawModalProps {
  isVisible: boolean;
  onClose: () => void;
  availableBalance: string; // Available USDT balance as string
}

export function WithdrawModal({ isVisible, onClose, availableBalance }: WithdrawModalProps) {
  const chainId = useSelector(selectChainId);
  const { account, walletClient } = useWallet();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutate: mutateBalances } = useZtdxUserBalances({
    refreshInterval: 10000,
  });

  // Get USDT token info
  const usdtToken = useMemo(() => {
    return getTokenBySymbolSafe(chainId, "USDT") || getTokenBySymbolSafe(chainId, "USDC");
  }, [chainId]);

  // Parse input value to USD amount
  const inputAmountUsd = useMemo(() => {
    if (!inputValue || !usdtToken) return 0n;
    try {
      return parseValue(inputValue, usdtToken.decimals || 18) || 0n;
    } catch {
      return 0n;
    }
  }, [inputValue, usdtToken]);

  // Parse available balance
  const availableBalanceBigInt = useMemo(() => {
    if (!availableBalance || !usdtToken) return 0n;
    try {
      return parseValue(availableBalance, usdtToken.decimals || 18) || 0n;
    } catch {
      return 0n;
    }
  }, [availableBalance, usdtToken]);

  // Check if input is valid
  const isInputValid = useMemo(() => {
    if (!inputValue || inputAmountUsd === 0n) return false;
    return inputAmountUsd <= availableBalanceBigInt && inputAmountUsd > 0n;
  }, [inputValue, inputAmountUsd, availableBalanceBigInt]);

  // Handle max button click
  const handleMaxClick = useCallback(() => {
    if (!usdtToken || availableBalanceBigInt === 0n) return;
    // Format available balance to display string (without $ and commas)
    const formatted = formatAmountFree(availableBalanceBigInt, usdtToken.decimals || 18, {
      displayDecimals: usdtToken.decimals || 18,
    });
    setInputValue(formatted);
  }, [availableBalanceBigInt, usdtToken]);

  // Handle withdraw submission
  const handleSubmit = useCallback(async () => {
    if (!isInputValid || !chainId || !walletClient || !usdtToken) {
      return;
    }

    // Check JWT authentication before proceeding
    if (!isAuthenticated(address, chainId)) {
      helperToast.error(t`Please sign in first to withdraw funds`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Get USDT token address
      if (!usdtToken) {
        throw new Error("USDT token not found");
      }

      // Step 2: Request withdraw from backend to get signature
      // token should be the USDT contract address, same as deposit
      const withdrawResponse = await requestWithdraw(chainId, {
        token: usdtToken.address, // Use USDT contract address, same as deposit
        amount: inputValue, // Use input value directly
      });

      // API returns "backend_signature", fallback to "signature" for backward compatibility
      const signature = withdrawResponse.backend_signature || withdrawResponse.signature;
      if (!signature) {
        throw new Error("Backend did not return signature");
      }

      // Use vault_address from response if available, otherwise fallback to config
      const vaultAddress = withdrawResponse.vault_address || getX10000ZtdxVaultAddress(chainId);
      if (!vaultAddress) {
        throw new Error("Vault contract not found");
      }

      // Import Vault ABI (simplified - you may need to adjust based on actual ABI)
      const vaultAbi = [
        {
          inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "expiry", type: "uint256" },
            { name: "backendSignature", type: "bytes" },
          ],
          name: "withdraw",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as const;

      const amountInWei = parseUnits(inputValue, usdtToken.decimals || 18);

      // API returns "expiry", fallback to "deadline" for backward compatibility
      const expiry = withdrawResponse.expiry || withdrawResponse.deadline || 0;

      // Call Vault contract using walletClient (viem)
      const txHash = await walletClient.writeContract({
        address: vaultAddress as `0x${string}`,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [
          usdtToken.address as `0x${string}`,
          amountInWei,
          BigInt(withdrawResponse.nonce),
          BigInt(expiry),
          signature as `0x${string}`,
        ],
      });

      helperToast.success(t`Withdraw transaction submitted`);

      // Wait for transaction confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      helperToast.success(t`Withdraw completed successfully`);

      // Refresh balances after successful withdraw
      mutateBalances();

      // Close modal and reset input
      setInputValue("");
      onClose();
    } catch (error: any) {
      console.error("[WithdrawModal] Failed to request withdraw:", error);
      helperToast.error(error?.message || t`Failed to request withdraw`);
    } finally {
      setIsSubmitting(false);
    }
  }, [isInputValid, chainId, walletClient, usdtToken, inputValue, publicClient, mutateBalances, onClose]);

  return (
    <Modal
      isVisible={isVisible}
      setIsVisible={onClose}
      label={t`Withdraw USDT`}
      className="WithdrawModal"
    >
      <div className="flex flex-col gap-16 p-20">
        {/* Available Balance */}
        <div className="flex items-center justify-between text-body-medium text-typography-secondary">
          <Trans>Available</Trans>
          <div className="text-typography-primary">
            ${parseFloat(availableBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
          </div>
        </div>

        {/* Amount Input */}
        <div className="flex flex-col gap-8">
          <div className="text-body-medium text-typography-secondary">
            <Trans>Withdraw</Trans>
          </div>
          <div className="relative text-16 leading-base">
            <NumberInput
              value={inputValue}
              onValueChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded-8 border border-slate-800 bg-slate-800 py-13 pl-14 pr-96 text-16 leading-base
                         focus-within:border-blue-300 hover:bg-fill-surfaceElevatedHover"
              placeholder="0.00"
            />
            <div className="pointer-events-none absolute right-14 top-1/2 flex -translate-y-1/2 items-center gap-8">
              <span className="text-typography-secondary">USDT</span>
              <button
                className="text-body-small pointer-events-auto rounded-full bg-slate-600 px-8 py-2 font-medium disabled:opacity-50
                         hover:not-disabled:bg-slate-500 focus-visible:not-disabled:bg-slate-500 active:not-disabled:bg-slate-500/70"
                disabled={availableBalanceBigInt === 0n}
                onClick={handleMaxClick}
              >
                <Trans>Max</Trans>
              </button>
            </div>
          </div>
          {inputValue && inputAmountUsd > 0n && (
            <div className="text-body-medium text-typography-secondary numbers">
              {formatUsd(inputAmountUsd)}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="mt-8">
          <Button
            variant="primary"
            disabled={!isInputValid || isSubmitting}
            onClick={handleSubmit}
            className="w-full"
          >
            {isSubmitting ? <Trans>Processing...</Trans> : <Trans>Withdraw</Trans>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

