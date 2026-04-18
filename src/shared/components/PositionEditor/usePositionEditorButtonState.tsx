import { Trans, t } from "@lingui/macro";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { getContract } from "config/contracts";
import { UI_FEE_RECEIVER_ACCOUNT } from "config/ui";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import {
  usePositionsConstants,
  useTokensData,
  useUserReferralInfo,
} from "context/SyntheticsStateContext/hooks/globalsHooks";
import {
  usePositionEditorMinCollateralFactor,
  usePositionEditorPosition,
  usePositionEditorPositionState,
} from "context/SyntheticsStateContext/hooks/positionEditorHooks";
import { useSavedAllowedSlippage } from "context/SyntheticsStateContext/hooks/settingsHooks";
import {
  selectBlockTimestampData,
  selectGasPaymentTokenAllowance,
  selectMarketsInfoData,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import {
  selectPositionEditorCollateralInputAmountAndUsd,
  selectPositionEditorCollateralInputValue,
  selectPositionEditorIsCollateralTokenFromGmxAccount,
  selectPositionEditorSelectedCollateralAddress,
  selectPositionEditorSelectedCollateralToken,
  selectPositionEditorSetCollateralInputValue,
} from "context/SyntheticsStateContext/selectors/positionEditorSelectors";
import { selectTokenPermits } from "context/SyntheticsStateContext/selectors/tokenPermitsSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { getIsValidExpressParams } from "domain/synthetics/express/expressOrderUtils";
import { ExpressTxnParams } from "domain/synthetics/express/types";
import { useExpressOrdersParams } from "domain/synthetics/express/useRelayerFeeHandler";
import { DecreasePositionSwapType, OrderType } from "domain/synthetics/orders";
import { sendBatchOrderTxn } from "domain/synthetics/orders/sendBatchOrderTxn";
import { useOrderTxnCallbacks } from "domain/synthetics/orders/useOrderTxnCallbacks";
import {
  getIsPositionInfoLoaded,
  substractMaxLeverageSlippage,
  willPositionCollateralBeSufficientForPosition,
} from "domain/synthetics/positions";
import { convertToTokenAmount, getApprovalRequirements, useTokensAllowanceData } from "domain/synthetics/tokens";
import { getMarkPrice, getMinCollateralUsdForLeverage } from "domain/synthetics/trade";
import { getCommonError, getEditCollateralError, getExpressError } from "domain/synthetics/trade/utils/validation";
import { useApproveToken } from "domain/tokens/useApproveTokens";
import { bigNumberBinarySearch } from "lib/binarySearch";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";
import { useLocalizedMap } from "lib/i18n";
import {
  initEditCollateralMetricData,
  sendOrderSubmittedMetric,
  sendTxnValidationErrorMetric,
} from "lib/metrics/utils";
import { expandDecimals, formatAmountFree } from "lib/numbers";
import { useJsonRpcProvider } from "lib/rpc";
import { useHasOutdatedUi } from "lib/useHasOutdatedUi";
import useWallet from "lib/wallets/useWallet";
import { getToken } from "sdk/configs/tokens";
import {
  BatchOrderTxnParams,
  CreateOrderTxnParams,
  DecreasePositionOrderParams,
  IncreasePositionOrderParams,
  buildDecreaseOrderPayload,
  buildIncreaseOrderPayload,
} from "sdk/utils/orderTransactions";

import ExternalLink from "components/ExternalLink/ExternalLink";

import SpinnerIcon from "img/ic_spinner.svg?react";

import { shouldUseApiOrderSubmit } from "@/modules/cex/lib/api/custom/useZtdxOrderSubmit";
import {
  addPositionCollateral,
  removePositionCollateral,
  isAuthenticated,
} from "@/modules/cex/lib/api/custom/client";
import { usePositionEditorData } from "./hooks/usePositionEditorData";
import { usePositionEditorFees } from "./hooks/usePositionEditorFees";
import { OPERATION_LABELS, X10000_OPERATION_LABELS, Operation } from "./types";

export function usePositionEditorButtonState(operation: Operation): {
  text: ReactNode;
  tooltipContent: ReactNode | null;
  disabled: boolean;
  onSubmit: () => void;
  expressParams: ExpressTxnParams | undefined;
  isExpressLoading: boolean;
} {
  const [, setEditingPositionKey] = usePositionEditorPositionState();
  const allowedSlippage = useSavedAllowedSlippage();
  const { chainId, srcChainId } = useChainId();
  const { shouldDisableValidationForTesting } = useSettings();
  const tokensData = useTokensData();
  const { account, signer } = useWallet();
  const { provider } = useJsonRpcProvider(chainId);
  const { openConnectModal } = useConnectModal();
  const routerAddress = getContract(chainId, "SyntheticsRouter");
  const { minCollateralUsd } = usePositionsConstants();
  const userReferralInfo = useUserReferralInfo();
  const hasOutdatedUi = useHasOutdatedUi();
  const position = usePositionEditorPosition();
  const localizedOperationLabels = useLocalizedMap(OPERATION_LABELS);
  const localizedX10000Labels = useLocalizedMap(X10000_OPERATION_LABELS);
  const blockTimestampData = useSelector(selectBlockTimestampData);
  const selectedCollateralAddress = useSelector(selectPositionEditorSelectedCollateralAddress);
  const isCollateralTokenFromGmxAccount = useSelector(selectPositionEditorIsCollateralTokenFromGmxAccount);
  const selectedCollateralToken = useSelector(selectPositionEditorSelectedCollateralToken);
  const setCollateralInputValue = useSelector(selectPositionEditorSetCollateralInputValue);
  const collateralInputValue = useSelector(selectPositionEditorCollateralInputValue);
  const { collateralDeltaAmount, collateralDeltaUsd } = useSelector(selectPositionEditorCollateralInputAmountAndUsd);

  // x10000 mode state
  const [isX10000Submitting, setIsX10000Submitting] = useState(false);
  const { makeOrderTxnCallback } = useOrderTxnCallbacks();
  const marketsInfoData = useSelector(selectMarketsInfoData);

  const collateralTokenAllowance = useTokensAllowanceData(chainId, {
    spenderAddress: routerAddress,
    tokenAddresses: position ? [position.collateralTokenAddress] : [],
  });

  const gasPaymentTokenAllowance = useSelector(selectGasPaymentTokenAllowance);
  const tokenPermits = useSelector(selectTokenPermits);

  const isDeposit = operation === Operation.Deposit;

  const { executionFee } = usePositionEditorFees({
    operation,
  });

  const { nextLeverage, nextLiqPrice, receiveUsd } = usePositionEditorData({
    operation,
  });

  const minCollateralFactor = usePositionEditorMinCollateralFactor();
  const isX10000Mode = shouldUseApiOrderSubmit();

  const collateralPrice = selectedCollateralToken?.prices.minPrice;

  const markPrice = position
    ? getMarkPrice({
        prices: position.indexToken.prices,
        isLong: position.isLong,
        isIncrease: isDeposit,
      })
    : undefined;

  const batchParams: BatchOrderTxnParams | undefined = useMemo(() => {
    // x10000 mode uses API for collateral operations, not on-chain transactions
    // Skip building batch params to avoid errors with synthetic token addresses
    if (isX10000Mode) {
      return undefined;
    }

    if (
      !account ||
      !tokensData ||
      !marketsInfoData ||
      !position ||
      !selectedCollateralAddress ||
      !signer ||
      !executionFee ||
      markPrice === undefined ||
      collateralDeltaAmount === undefined ||
      !selectedCollateralToken
    ) {
      return undefined;
    }

    let createOrderParams: CreateOrderTxnParams<IncreasePositionOrderParams | DecreasePositionOrderParams>;

    if (isDeposit) {
      createOrderParams = buildIncreaseOrderPayload({
        chainId,
        receiver: account,
        executionFeeAmount: executionFee.feeTokenAmount,
        executionGasLimit: executionFee.gasLimit,
        referralCode: userReferralInfo?.referralCodeForTxn,
        swapPath: [],
        externalSwapQuote: undefined,
        payTokenAddress: selectedCollateralAddress,
        payTokenAmount: collateralDeltaAmount,
        collateralTokenAddress: selectedCollateralAddress,
        collateralDeltaAmount: collateralDeltaAmount,
        sizeDeltaUsd: 0n,
        sizeDeltaInTokens: 0n,
        acceptablePrice: markPrice,
        triggerPrice: undefined,
        orderType: OrderType.MarketIncrease,
        isLong: position.isLong,
        marketAddress: position.marketAddress,
        indexTokenAddress: position.indexToken.address,
        uiFeeReceiver: UI_FEE_RECEIVER_ACCOUNT,
        allowedSlippage,
        autoCancel: false,
        validFromTime: 0n,
      });
    } else {
      if (receiveUsd === undefined) {
        return;
      }
      createOrderParams = buildDecreaseOrderPayload({
        chainId,
        receiver: account,
        executionFeeAmount: executionFee.feeTokenAmount,
        executionGasLimit: executionFee.gasLimit,
        referralCode: userReferralInfo?.referralCodeForTxn,
        swapPath: [],
        externalSwapQuote: undefined,
        collateralTokenAddress: selectedCollateralAddress,
        collateralDeltaAmount: collateralDeltaAmount,
        receiveTokenAddress: selectedCollateralAddress,
        minOutputUsd: receiveUsd,
        decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
        orderType: OrderType.MarketDecrease,
        isLong: position.isLong,
        marketAddress: position.marketAddress,
        indexTokenAddress: position.indexToken.address,
        uiFeeReceiver: UI_FEE_RECEIVER_ACCOUNT,
        allowedSlippage,
        sizeDeltaUsd: 0n,
        sizeDeltaInTokens: 0n,
        acceptablePrice: markPrice,
        triggerPrice: undefined,
        autoCancel: false,
        validFromTime: 0n,
      });
    }

    return {
      createOrderParams: [createOrderParams],
      updateOrderParams: [],
      cancelOrderParams: [],
    };
  }, [
    account,
    allowedSlippage,
    chainId,
    collateralDeltaAmount,
    executionFee,
    isDeposit,
    isX10000Mode,
    markPrice,
    marketsInfoData,
    position,
    receiveUsd,
    selectedCollateralAddress,
    selectedCollateralToken,
    signer,
    tokensData,
    userReferralInfo?.referralCodeForTxn,
  ]);

  const {
    expressParams,
    isLoading: isExpressLoading,
    fastExpressParams,
    asyncExpressParams,
    expressParamsPromise,
  } = useExpressOrdersParams({
    label: "Position Editor",
    orderParams: batchParams,
    isGmxAccount: isCollateralTokenFromGmxAccount,
  });

  const { tokensToApprove, isAllowanceLoaded } = useMemo(() => {
    if (isCollateralTokenFromGmxAccount) {
      return { tokensToApprove: [], isAllowanceLoaded: true };
    }

    if (!selectedCollateralAddress || collateralDeltaAmount === undefined) {
      return { tokensToApprove: [], isAllowanceLoaded: false };
    }

    const approvalRequirements = getApprovalRequirements({
      chainId,
      payTokenParamsList: [
        {
          tokenAddress: selectedCollateralAddress,
          amount: collateralDeltaAmount,
          allowanceData: collateralTokenAllowance.tokensAllowanceData,
          isAllowanceLoaded: collateralTokenAllowance.isLoaded,
        },
      ],
      gasPaymentTokenParams: expressParams?.gasPaymentParams
        ? {
            tokenAddress: expressParams.gasPaymentParams.gasPaymentTokenAddress,
            amount: expressParams.gasPaymentParams.gasPaymentTokenAmount,
            allowanceData: gasPaymentTokenAllowance?.tokensAllowanceData,
            isAllowanceLoaded: gasPaymentTokenAllowance?.isLoaded,
          }
        : undefined,
      permits: expressParams && tokenPermits ? tokenPermits : [],
    });

    return approvalRequirements;
  }, [
    isCollateralTokenFromGmxAccount,
    selectedCollateralAddress,
    collateralDeltaAmount,
    chainId,
    collateralTokenAllowance.tokensAllowanceData,
    collateralTokenAllowance.isLoaded,
    expressParams,
    gasPaymentTokenAllowance?.tokensAllowanceData,
    gasPaymentTokenAllowance?.isLoaded,
    tokenPermits,
  ]);

  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (!tokensToApprove.length && isApproving) {
      setIsApproving(false);
    }
  }, [isApproving, tokensToApprove.length]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBalancesLoading = selectedCollateralToken?.balance === undefined;

  const onClose = useCallback(() => {
    setEditingPositionKey(undefined);
  }, [setEditingPositionKey]);

  const maxWithdrawAmount = useMemo(() => {
    if (!getIsPositionInfoLoaded(position)) return 0n;

    const minCollateralUsdForLeverage = getMinCollateralUsdForLeverage(position, 0n);
    let _minCollateralUsd = minCollateralUsdForLeverage;

    if (minCollateralUsd !== undefined && minCollateralUsd > _minCollateralUsd) {
      _minCollateralUsd = minCollateralUsd;
    }

    _minCollateralUsd =
      _minCollateralUsd + (position?.pendingBorrowingFeesUsd ?? 0n) + (position?.pendingFundingFeesUsd ?? 0n);

    if (position.collateralUsd < _minCollateralUsd) {
      return 0n;
    }

    const maxWithdrawUsd = position.collateralUsd - _minCollateralUsd;
    const maxWithdrawAmount = convertToTokenAmount(maxWithdrawUsd, selectedCollateralToken?.decimals, collateralPrice);

    return maxWithdrawAmount;
  }, [collateralPrice, selectedCollateralToken?.decimals, minCollateralUsd, position]);

  const detectAndSetMaxSize = useCallback(() => {
    if (maxWithdrawAmount === undefined) return;
    if (!selectedCollateralToken) return;
    if (!position) return;
    if (minCollateralFactor === undefined) return;

    const { result: safeMaxWithdrawal } = bigNumberBinarySearch(
      BigInt(1),
      maxWithdrawAmount,
      expandDecimals(1, Math.ceil(selectedCollateralToken.decimals / 3)),
      (x) => {
        const isValid = willPositionCollateralBeSufficientForPosition(position, x, 0n, minCollateralFactor, 0n);
        return { isValid, returnValue: null };
      }
    );
    setCollateralInputValue(
      formatAmountFree(substractMaxLeverageSlippage(safeMaxWithdrawal), selectedCollateralToken.decimals)
    );
  }, [selectedCollateralToken, maxWithdrawAmount, minCollateralFactor, position, setCollateralInputValue]);

  const [error, tooltipName] = useMemo(() => {
    const commonError = getCommonError({
      chainId,
      isConnected: Boolean(account),
      hasOutdatedUi,
    });

    const expressError = getExpressError({
      chainId,
      expressParams,
      tokensData,
    });

    const editCollateralError = getEditCollateralError({
      collateralDeltaAmount,
      collateralDeltaUsd,
      nextLeverage,
      nextLiqPrice,
      isDeposit,
      position,
      depositToken: selectedCollateralToken,
      depositAmount: collateralDeltaAmount,
      minCollateralFactor,
    });

    const error = commonError[0] || editCollateralError[0] || expressError[0];
    const tooltipName = commonError[1] || editCollateralError[1] || expressError[1];

    if (error) {
      return [error, tooltipName];
    }

    if (isSubmitting) {
      return [t`Creating order`];
    }

    return [];
  }, [
    chainId,
    account,
    hasOutdatedUi,
    expressParams,
    tokensData,
    collateralDeltaAmount,
    collateralDeltaUsd,
    nextLeverage,
    nextLiqPrice,
    isDeposit,
    position,
    selectedCollateralToken,
    minCollateralFactor,
    isSubmitting,
  ]);

  const errorTooltipContent = useMemo(() => {
    if (tooltipName !== "maxLeverage") return null;

    return (
      <Trans>
        Decrease the withdraw size to match the max.{" "}
        {/* GMX_DOCS_LINK_COMMENTED: https://docs.gmx.io/docs/trading/v2/#max-leverage */}
        <span className="text-blue-300">Read more</span>.
        <br />
        <br />
        <span onClick={detectAndSetMaxSize} className="Tradebox-handle">
          <Trans>Set max withdrawal</Trans>
        </span>
      </Trans>
    );
  }, [detectAndSetMaxSize, tooltipName]);

  const { approveToken } = useApproveToken();

  async function onSubmit() {
    if (!account || !signer) {
      openConnectModal?.();
      return;
    }

    if (isAllowanceLoaded && tokensToApprove.length && selectedCollateralToken) {
      if (!chainId || isApproving) return;

      approveToken({
        setIsApproving,
        tokenAddress: tokensToApprove[0].tokenAddress,
        chainId,
        signer,
        allowPermit: Boolean(expressParams),
      });

      return;
    }

    const orderType = isDeposit ? OrderType.MarketIncrease : OrderType.MarketDecrease;

    const metricData = initEditCollateralMetricData({
      collateralToken: selectedCollateralToken,
      executionFee,
      selectedCollateralAddress,
      marketInfo: position?.marketInfo,
      collateralDeltaAmount,
      subaccount: expressParams?.subaccount,
      isExpress: Boolean(expressParams),
      orderType,
      isLong: position?.isLong,
      expressParams,
      asyncExpressParams,
      fastExpressParams,
      chainId: srcChainId ?? chainId,
      isCollateralFromMultichain: isCollateralTokenFromGmxAccount,
    });

    sendOrderSubmittedMetric(metricData.metricId);

    if (!batchParams || !tokensData || !signer || !provider) {
      helperToast.error(t`Error submitting order`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return;
    }

    const fulfilledExpressParams = await expressParamsPromise;

    const txnPromise = sendBatchOrderTxn({
      chainId,
      signer,
      provider,
      batchParams,
      expressParams:
        fulfilledExpressParams && getIsValidExpressParams(fulfilledExpressParams) ? fulfilledExpressParams : undefined,
      isGmxAccount: isCollateralTokenFromGmxAccount,
      simulationParams: shouldDisableValidationForTesting
        ? undefined
        : {
            tokensData,
            blockTimestampData,
          },
      callback: makeOrderTxnCallback({
        metricId: metricData.metricId,
        slippageInputId: undefined,
      }),
    });

    if (expressParams?.subaccount) {
      onClose();
      setIsSubmitting(false);
      return;
    }

    txnPromise.then(onClose).finally(() => {
      setIsSubmitting(false);
    });
  }

  // x10000 mode: Submit handler for API-based collateral operations
  const onX10000Submit = useCallback(async () => {
    if (!account) {
      openConnectModal?.();
      return;
    }

    if (!position?.originalPositionId) {
      helperToast.error(t`Position ID not found`);
      return;
    }

    if (!isAuthenticated(account, chainId)) {
      helperToast.error(t`Please sign in first`);
      return;
    }

    const amountStr = collateralInputValue?.trim();
    if (!amountStr || parseFloat(amountStr) <= 0) {
      helperToast.error(t`Please enter a valid amount`);
      return;
    }

    setIsX10000Submitting(true);
    try {
      const positionId = position.originalPositionId;
      const request = { amount: amountStr };

      if (isDeposit) {
        await addPositionCollateral(chainId, positionId, request);
        helperToast.success(t`Collateral added successfully`);
      } else {
        await removePositionCollateral(chainId, positionId, request);
        helperToast.success(t`Collateral removed successfully`);
      }

      // Clear input and close modal
      setCollateralInputValue("");
      onClose();
    } catch (error: unknown) {
      console.error("[PositionEditor] x10000 collateral operation failed:", error);
      const errorMessage = error instanceof Error ? error.message : t`Operation failed`;
      helperToast.error(errorMessage);
    } finally {
      setIsX10000Submitting(false);
    }
  }, [
    account,
    chainId,
    collateralInputValue,
    isDeposit,
    onClose,
    openConnectModal,
    position?.originalPositionId,
    setCollateralInputValue,
  ]);

  const commonParams = {
    expressParams,
    isExpressLoading,
    onSubmit,
  };

  // x10000 mode: API-based collateral operations
  if (isX10000Mode) {
    // Validation for x10000 mode
    let x10000Error: ReactNode | null = null;

    if (!account) {
      x10000Error = t`Connect Wallet`;
    } else if (!isAuthenticated(account, chainId)) {
      x10000Error = t`Please sign in`;
    } else if (!collateralInputValue || parseFloat(collateralInputValue) <= 0) {
      x10000Error = t`Enter an amount`;
    } else if (!position?.originalPositionId) {
      x10000Error = t`Position not found`;
    }

    const x10000Disabled = Boolean(x10000Error) || isX10000Submitting;
    const x10000ButtonText = isX10000Submitting ? (
      <>
        {localizedX10000Labels[operation]}
        <SpinnerIcon className="ml-4 animate-spin" />
      </>
    ) : (
      x10000Error || localizedX10000Labels[operation]
    );

    return {
      text: x10000ButtonText,
      tooltipContent: null,
      disabled: x10000Disabled,
      expressParams: undefined,
      isExpressLoading: false,
      onSubmit: onX10000Submit,
    };
  }

  if (isApproving && tokensToApprove.length) {
    const tokenToApprove = tokensToApprove[0];
    return {
      text: (
        <>
          {t`Allow ${getToken(chainId, tokenToApprove.tokenAddress).symbol} to be spent`}{" "}
          <SpinnerIcon className="ml-4 animate-spin" />
        </>
      ),
      tooltipContent: errorTooltipContent,
      disabled: true,
      ...commonParams,
    };
  }

  if (isExpressLoading) {
    return {
      text: (
        <>
          {t`Loading Express params`}
          <SpinnerIcon className="ml-4 animate-spin" />
        </>
      ),
      tooltipContent: errorTooltipContent,
      disabled: true,
      ...commonParams,
    };
  }

  if (!isAllowanceLoaded || isBalancesLoading) {
    return {
      text: (
        <>
          {t`Loading...`}
          <SpinnerIcon className="ml-4 animate-spin" />
        </>
      ),
      tooltipContent: errorTooltipContent,
      disabled: true,
      ...commonParams,
    };
  }

  if (isAllowanceLoaded && tokensToApprove.length && selectedCollateralToken) {
    const tokenToApprove = tokensToApprove[0];
    return {
      text: t`Allow ${getToken(chainId, tokenToApprove.tokenAddress).symbol} to be spent`,
      tooltipContent: errorTooltipContent,
      disabled: false,
      ...commonParams,
    };
  }

  return {
    text: error || localizedOperationLabels[operation],
    tooltipContent: errorTooltipContent,
    disabled: Boolean(error) && !shouldDisableValidationForTesting,
    ...commonParams,
  };
}
