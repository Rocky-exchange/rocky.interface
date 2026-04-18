import { t } from "@lingui/macro";
import { useCallback, useId, useMemo } from "react";

import { BASIS_POINTS_DIVISOR } from "config/factors";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import { useTokensData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import { selectChartHeaderInfo } from "context/SyntheticsStateContext/selectors/chartSelectors";
import {
  selectBlockTimestampData,
  selectIsFirstOrder,
  selectMarketsInfoData,
  selectPositionsInfoData,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import {
  selectExecutionFeeBufferBps,
  selectIsLeverageSliderEnabled,
} from "context/SyntheticsStateContext/selectors/settingsSelectors";
import {
  selectSetShouldFallbackToInternalSwap,
  selectTradeboxAllowedSlippage,
  selectTradeboxCloseSizeInputValue,
  selectTradeboxCollateralToken,
  selectTradeboxDecreasePositionAmounts,
  selectTradeboxExecutionFee,
  selectTradeboxFees,
  selectTradeboxFromToken,
  selectTradeboxIncreasePositionAmounts,
  selectTradeboxIsFromTokenGmxAccount,
  selectTradeboxLeverage,
  selectTradeboxMarketInfo,
  selectTradeboxPayTokenAllowance,
  selectTradeboxSelectedPosition,
  selectTradeboxSwapAmounts,
  selectTradeboxToTokenAddress,
  selectTradeboxTradeFlags,
  selectTradeboxTradeMode,
  selectTradeboxTriggerPrice,
  selectTradeboxTwapDuration,
  selectTradeboxTwapNumberOfParts,
  selectTradeboxTakeProfitPriceInputValue,
  selectTradeboxStopLossPriceInputValue,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { selectTradeBoxCreateOrderParams } from "context/SyntheticsStateContext/selectors/transactionsSelectors/tradeBoxOrdersSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useUserReferralCode } from "domain/referrals";
import { getIsValidExpressParams } from "domain/synthetics/express/expressOrderUtils";
import { useExpressOrdersParams } from "domain/synthetics/express/useRelayerFeeHandler";
import { OrderType } from "domain/synthetics/orders";
import { createStakeOrUnstakeTxn } from "domain/synthetics/orders/createStakeOrUnStakeTxn";
import { createWrapOrUnwrapTxn } from "domain/synthetics/orders/createWrapOrUnwrapTxn";
import { sendBatchOrderTxn } from "domain/synthetics/orders/sendBatchOrderTxn";
import { useOrderTxnCallbacks } from "domain/synthetics/orders/useOrderTxnCallbacks";
import { formatLeverage } from "domain/synthetics/positions/utils";
import { TradeMode } from "domain/synthetics/trade";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";
import {
  initDecreaseOrderMetricData,
  initIncreaseOrderMetricData,
  initSwapMetricData,
  sendOrderSubmittedMetric,
  sendTxnValidationErrorMetric,
} from "lib/metrics/utils";
import { getByKey } from "lib/objects";
import { useJsonRpcProvider } from "lib/rpc";
import { getTradeInteractionKey, sendUserAnalyticsOrderConfirmClickEvent, userAnalytics } from "lib/userAnalytics";
import useWallet from "lib/wallets/useWallet";
import { BatchOrderTxnParams, getBatchTotalExecutionFee } from "sdk/utils/orderTransactions";

// ZTDX API Integration
import { useZtdxOrderSubmit, shouldUseApiOrderSubmit, TpSlRequest } from "@/modules/cex/lib/api";
import { setPositionTpSl, isAuthenticated } from "@/modules/cex/lib/api/custom/client";
import { formatUnits } from "viem";

import { useSidecarOrderPayloadsx10000 as useSidecarOrderPayloads } from "./useSidecarOrderPayloadsx10000";

interface TradeboxTransactionsProps {
  setPendingTxns: (txns: any) => void;
}

export function useTradeboxTransactionsx10000({ setPendingTxns }: TradeboxTransactionsProps) {
  const { chainId, srcChainId } = useChainId();
  const { signer, account } = useWallet();
  const { provider } = useJsonRpcProvider(chainId);
  const tokensData = useTokensData();
  const { shouldDisableValidationForTesting } = useSettings();

  const { makeOrderTxnCallback } = useOrderTxnCallbacks();

  // ZTDX API Order Submission
  const { submitOrder: submitApiOrder, isApiEnabled } = useZtdxOrderSubmit();
  const useApiOrderSubmit = shouldUseApiOrderSubmit();
  // For x10000 route, we allow order submission even without prior authentication
  // because the signature will be requested from wallet, which doesn't require backend auth

  const isFirstOrder = useSelector(selectIsFirstOrder);
  const blockTimestampData = useSelector(selectBlockTimestampData);
  const isLeverageSliderEnabled = useSelector(selectIsLeverageSliderEnabled);
  const increaseAmounts = useSelector(selectTradeboxIncreasePositionAmounts);
  const swapAmounts = useSelector(selectTradeboxSwapAmounts);
  const decreaseAmounts = useSelector(selectTradeboxDecreasePositionAmounts);
  const fromToken = useSelector(selectTradeboxFromToken);
  const isFromTokenGmxAccount = useSelector(selectTradeboxIsFromTokenGmxAccount);
  const toTokenAddress = useSelector(selectTradeboxToTokenAddress);
  const marketInfo = useSelector(selectTradeboxMarketInfo);
  const collateralToken = useSelector(selectTradeboxCollateralToken);
  const tradeFlags = useSelector(selectTradeboxTradeFlags);
  const tradeMode = useSelector(selectTradeboxTradeMode);
  const { isLong, isSwap, isIncrease, isTrigger } = tradeFlags;
  const allowedSlippage = useSelector(selectTradeboxAllowedSlippage);
  const fees = useSelector(selectTradeboxFees);
  const chartHeaderInfo = useSelector(selectChartHeaderInfo);
  const marketsInfoData = useSelector(selectMarketsInfoData);
  const positionsInfoData = useSelector(selectPositionsInfoData);
  const executionFeeBufferBps = useSelector(selectExecutionFeeBufferBps);
  const duration = useSelector(selectTradeboxTwapDuration);
  const numberOfParts = useSelector(selectTradeboxTwapNumberOfParts);

  const setShouldFallbackToInternalSwap = useSelector(selectSetShouldFallbackToInternalSwap);

  const selectedPosition = useSelector(selectTradeboxSelectedPosition);
  const executionFee = useSelector(selectTradeboxExecutionFee);
  const triggerPrice = useSelector(selectTradeboxTriggerPrice);
  const closeSizeInputValue = useSelector(selectTradeboxCloseSizeInputValue);
  // Separate TP/SL price input values
  const takeProfitPriceInputValue = useSelector(selectTradeboxTakeProfitPriceInputValue);
  const stopLossPriceInputValue = useSelector(selectTradeboxStopLossPriceInputValue);
  const leverage = useSelector(selectTradeboxLeverage);
  const { referralCodeForTxn } = useUserReferralCode(signer, chainId, account);

  const toToken = getByKey(tokensData, toTokenAddress);

  const initialCollateralAllowance = useSelector(selectTradeboxPayTokenAllowance);
  const sidecarOrderPayloads = useSidecarOrderPayloads();

  const primaryCreateOrderParams = useSelector(selectTradeBoxCreateOrderParams);

  const slippageInputId = useId();

  const batchParams: BatchOrderTxnParams = useMemo(() => {
    if (!primaryCreateOrderParams) {
      return {
        createOrderParams: [],
        updateOrderParams: [],
        cancelOrderParams: [],
      };
    }

    return {
      createOrderParams: [...primaryCreateOrderParams, ...(sidecarOrderPayloads?.createPayloads ?? [])],
      updateOrderParams: sidecarOrderPayloads?.updatePayloads ?? [],
      cancelOrderParams: sidecarOrderPayloads?.cancelPayloads ?? [],
    };
  }, [primaryCreateOrderParams, sidecarOrderPayloads]);

  const totalExecutionFee = useMemo(() => {
    return tokensData ? getBatchTotalExecutionFee({ batchParams, chainId, tokensData }) : undefined;
  }, [batchParams, chainId, tokensData]);

  const {
    expressParams,
    fastExpressParams,
    asyncExpressParams,
    expressParamsPromise,
    isLoading: isExpressLoading,
  } = useExpressOrdersParams({
    orderParams: batchParams,
    label: "TradeBox",
    isGmxAccount: isFromTokenGmxAccount,
  });

  const initOrderMetricData = useCallback(() => {
    const primaryOrder = primaryCreateOrderParams?.[0];

    if (isSwap) {
      return initSwapMetricData({
        fromToken,
        toToken,
        hasReferralCode: Boolean(referralCodeForTxn),
        swapAmounts,
        isExpress: Boolean(expressParams),
        executionFee,
        allowedSlippage,
        executionFeeBufferBps,
        orderType: primaryOrder?.orderPayload.orderType,
        subaccount: expressParams?.subaccount,
        isFirstOrder,
        initialCollateralAllowance,
        isTwap: tradeMode === TradeMode.Twap,
        duration,
        partsCount: numberOfParts,
        tradeMode,
        expressParams,
        asyncExpressParams,
        fastExpressParams,
        chainId: srcChainId ?? chainId,
        isCollateralFromMultichain: isFromTokenGmxAccount,
      });
    }

    if (isIncrease) {
      return initIncreaseOrderMetricData({
        fromToken,
        increaseAmounts,
        orderPayload: primaryOrder?.orderPayload,
        hasExistingPosition: Boolean(selectedPosition),
        leverage: formatLeverage(increaseAmounts?.estimatedLeverage) ?? "",
        executionFee,
        executionFeeBufferBps,
        orderType: primaryOrder?.orderPayload.orderType ?? OrderType.MarketIncrease,
        hasReferralCode: Boolean(referralCodeForTxn),
        subaccount: expressParams?.subaccount,
        triggerPrice,
        allowedSlippage,
        marketInfo,
        isLong,
        isFirstOrder,
        isExpress: Boolean(expressParams),
        isTwap: tradeMode === TradeMode.Twap,
        isLeverageEnabled: isLeverageSliderEnabled,
        initialCollateralAllowance,
        isTPSLCreated: Boolean(sidecarOrderPayloads?.createPayloads?.length),
        slCount: sidecarOrderPayloads?.createPayloads.filter(
          (entry) => entry.orderPayload.orderType === OrderType.StopLossDecrease
        ).length,
        tpCount: sidecarOrderPayloads?.createPayloads.filter(
          (entry) => entry.orderPayload.orderType === OrderType.LimitDecrease
        ).length,
        priceImpactDeltaUsd: increaseAmounts?.positionPriceImpactDeltaUsd,
        priceImpactPercentage: fees?.increasePositionPriceImpact?.precisePercentage,
        netRate1h: isLong ? chartHeaderInfo?.fundingRateLong : chartHeaderInfo?.fundingRateShort,
        interactionId: marketInfo?.name
          ? userAnalytics.getInteractionId(getTradeInteractionKey(marketInfo.name))
          : undefined,
        duration,
        partsCount: numberOfParts,
        tradeMode: tradeMode,
        expressParams,
        asyncExpressParams,
        fastExpressParams,
        chainId: srcChainId ?? chainId,
        isCollateralFromMultichain: isFromTokenGmxAccount,
      });
    }

    return initDecreaseOrderMetricData({
      collateralToken,
      decreaseAmounts,
      hasExistingPosition: Boolean(selectedPosition),
      executionFee,
      swapPath: [],
      executionFeeBufferBps,
      orderType: primaryOrder?.orderPayload.orderType,
      hasReferralCode: Boolean(referralCodeForTxn),
      subaccount: expressParams?.subaccount,
      triggerPrice,
      marketInfo,
      allowedSlippage,
      isLong,
      place: "tradeBox",
      isExpress: Boolean(expressParams),
      isTwap: tradeMode === TradeMode.Twap,
      interactionId: marketInfo?.name ? userAnalytics.getInteractionId(getTradeInteractionKey(marketInfo.name)) : "",
      priceImpactDeltaUsd: decreaseAmounts?.totalPendingImpactDeltaUsd,
      priceImpactPercentage: fees?.decreasePositionPriceImpact?.precisePercentage,
      netRate1h: isLong ? chartHeaderInfo?.fundingRateLong : chartHeaderInfo?.fundingRateShort,
      tradeMode,
      duration,
      partsCount: numberOfParts,
      expressParams,
      asyncExpressParams,
      fastExpressParams,
      chainId: srcChainId ?? chainId,
      isCollateralFromMultichain: isFromTokenGmxAccount,
    });
  }, [
    allowedSlippage,
    asyncExpressParams,
    chainId,
    chartHeaderInfo?.fundingRateLong,
    chartHeaderInfo?.fundingRateShort,
    collateralToken,
    decreaseAmounts,
    duration,
    executionFee,
    executionFeeBufferBps,
    expressParams,
    fastExpressParams,
    fees?.decreasePositionPriceImpact?.precisePercentage,
    fees?.increasePositionPriceImpact?.precisePercentage,
    fromToken,
    increaseAmounts,
    initialCollateralAllowance,
    isFirstOrder,
    isFromTokenGmxAccount,
    isIncrease,
    isLeverageSliderEnabled,
    isLong,
    isSwap,
    marketInfo,
    numberOfParts,
    primaryCreateOrderParams,
    referralCodeForTxn,
    selectedPosition,
    sidecarOrderPayloads?.createPayloads,
    srcChainId,
    swapAmounts,
    toToken,
    tradeMode,
    triggerPrice,
  ]);

  // ZTDX API Order Submission Handler
  const onSubmitOrderViaApi = useCallback(async () => {
    console.log(" onSubmitOrderViaApi called", {
      marketInfo: marketInfo?.name,
      account,
      primaryOrder: !!primaryCreateOrderParams?.[0],
      isIncrease,
      isLong,
      isTrigger,
    });

    const metricData = initOrderMetricData();
    sendOrderSubmittedMetric(metricData.metricId);

    // For Trigger mode (TP/SL) decrease orders in x10000, call setPositionTpSl API
    if (isTrigger && !isIncrease) {
      // Find the matching position by market symbol and direction
      // First try selectedPosition, then fallback to searching all positions
      let targetPosition = selectedPosition;

      if (!targetPosition?.originalPositionId && positionsInfoData && marketInfo) {
        // Get the base symbol from market info (e.g., "BTC" from "BTC-USD")
        const indexTokenSymbol = marketInfo.indexToken?.symbol?.toUpperCase() || "";
        const baseSymbol = indexTokenSymbol.replace("-USD", "").replace("USDT", "");

        // Search for a position matching this market and direction
        const positions = Object.values(positionsInfoData);
        targetPosition = positions.find((pos) => {
          // Check if position matches direction
          if (pos.isLong !== isLong) return false;
          // Check if position has originalPositionId (x10000 position)
          if (!pos.originalPositionId) return false;
          // Check if market address contains the base symbol (e.g., "x10000-BTC-USD")
          const posMarket = pos.marketAddress?.toUpperCase() || "";
          return posMarket.includes(baseSymbol);
        });

        console.log(" Searching for position:", {
          baseSymbol,
          isLong,
          found: !!targetPosition,
          positionCount: positions.length,
        });
      }

      console.log(" Trigger mode decrease: attempting to set TP/SL", {
        selectedPosition: selectedPosition?.originalPositionId,
        targetPosition: targetPosition?.originalPositionId,
        takeProfitPriceInputValue,
        stopLossPriceInputValue,
        isLong,
      });

      // Check if we have a position
      if (!targetPosition?.originalPositionId) {
        console.error(" No position found for TP/SL");
        helperToast.error(t`No matching position found. Please ensure you have an open position for this market.`);
        sendTxnValidationErrorMetric(metricData.metricId);
        return Promise.reject(new Error("No position found for TP/SL"));
      }

      // Check authentication
      if (!isAuthenticated(account, chainId)) {
        helperToast.error(t`Please sign in first`);
        sendTxnValidationErrorMetric(metricData.metricId);
        return Promise.reject(new Error("Authentication required"));
      }

      // Parse TP and SL prices from separate input fields
      const tpPrice = takeProfitPriceInputValue && parseFloat(takeProfitPriceInputValue) > 0
        ? parseFloat(takeProfitPriceInputValue)
        : null;
      const slPrice = stopLossPriceInputValue && parseFloat(stopLossPriceInputValue) > 0
        ? parseFloat(stopLossPriceInputValue)
        : null;

      // Validate at least one price is set
      if (!tpPrice && !slPrice) {
        helperToast.error(t`Please enter at least one trigger price (Take Profit or Stop Loss)`);
        sendTxnValidationErrorMetric(metricData.metricId);
        return Promise.reject(new Error("No trigger price set"));
      }

      console.log(" Setting TP/SL:", {
        positionId: targetPosition.originalPositionId,
        takeProfitPrice: tpPrice,
        stopLossPrice: slPrice,
        isLong,
      });

      try {
        // Determine size: if user entered a specific size, use it; otherwise use full position size
        const fullPositionSizeStr = targetPosition.sizeInUsd
          ? formatUnits(targetPosition.sizeInUsd, 30)  // USD_DECIMALS = 30
          : "0";
        const userInputSize = closeSizeInputValue && parseFloat(closeSizeInputValue) > 0
          ? closeSizeInputValue
          : null;

        // Check if user selected "max" (no input or input equals full position size)
        const fullPositionSizeForComparison = targetPosition.sizeInUsd
          ? (Number(targetPosition.sizeInUsd) / 1e30).toFixed(2)
          : "0";
        const isMaxSelected = !userInputSize || userInputSize === fullPositionSizeForComparison;
        // When max is selected, use full position size without truncation
        const sizeStr = isMaxSelected ? fullPositionSizeStr : userInputSize;

        // Build request with separate TP and SL values
        const request: TpSlRequest = {};
        if (tpPrice) {
          request.take_profit_price = tpPrice.toFixed(8);
          request.take_profit_size = sizeStr;
        }
        if (slPrice) {
          request.stop_loss_price = slPrice.toFixed(8);
          request.stop_loss_size = sizeStr;
        }

        await setPositionTpSl(chainId, targetPosition.originalPositionId, request);

        // Build success message based on what was set
        const setItems: string[] = [];
        if (tpPrice) setItems.push("Take Profit");
        if (slPrice) setItems.push("Stop Loss");
        helperToast.success(t`${setItems.join(" and ")} set successfully`);
        return;
      } catch (error) {
        console.error(" Failed to set TP/SL:", error);
        const errorMessage = error instanceof Error ? error.message : t`Failed to set TP/SL`;
        helperToast.error(errorMessage);
        sendTxnValidationErrorMetric(metricData.metricId);
        throw error;
      }
    }

    if (!marketInfo || !account) {
      console.error(" Missing required data:", { marketInfo: !!marketInfo, account: !!account });
      helperToast.error(t` Error submitting order: Missing market info or account`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return Promise.reject(new Error("Missing market info or account"));
    }

    sendUserAnalyticsOrderConfirmClickEvent(chainId, metricData.metricId);

    // Get symbol from market info (e.g., "ETH-USD")
    const indexToken = marketInfo.indexToken;
    const symbol = `${indexToken.symbol}-USD`;

    // Backend API expects position size in tokens (仓位数量), not USD amount
    // According to test code, amount = Decimal("0.001") represents 0.001 BTC (position size in tokens)
    // For increase orders, use indexTokenAmount (position size in index token units)
    // For decrease orders, use sizeDeltaInTokens (position size to close in tokens)
    let positionSizeInTokens = isIncrease
      ? increaseAmounts?.indexTokenAmount ?? 0n
      : decreaseAmounts?.sizeDeltaInTokens ?? 0n;

    // Validate that we have a valid position size
    if (!positionSizeInTokens || positionSizeInTokens === 0n) {
      console.error(" Invalid position size:", { positionSizeInTokens, isIncrease });
      helperToast.error(t`Invalid position size`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return Promise.reject(new Error("Invalid position size"));
    }

    // Convert leverage from BASIS_POINTS_DIVISOR (10000) to integer (e.g., 500000 = 50)
    // Leverage is stored as bigint in basis points, divide by BASIS_POINTS_DIVISOR to get the actual leverage
    // Backend expects integer, so we use Math.round() to ensure it's an integer
    const leverageValue = leverage ? Math.round(Number(leverage) / BASIS_POINTS_DIVISOR) : 1;

    // Determine orderType from tradeMode and triggerPrice
    // If primaryOrder exists, use its orderType; otherwise, derive from tradeMode
    let orderType: OrderType;
    const primaryOrder = primaryCreateOrderParams?.[0];
    if (primaryOrder) {
      orderType = primaryOrder.orderPayload.orderType;
    } else {
      // Fallback: determine orderType from tradeMode and triggerPrice
      if (isIncrease) {
        if (tradeMode === TradeMode.Limit) {
          orderType = OrderType.LimitIncrease;
        } else if (tradeMode === TradeMode.Stop) {
          orderType = OrderType.StopLossIncrease;
        } else {
          orderType = OrderType.MarketIncrease;
        }
      } else {
        // For decrease orders
        if (tradeMode === TradeMode.Limit) {
          orderType = OrderType.LimitDecrease;
        } else if (tradeMode === TradeMode.Stop) {
          orderType = OrderType.StopLossDecrease;
        } else {
          orderType = OrderType.MarketDecrease;
        }
      }
    }

    // Validate required data
    if (positionSizeInTokens === 0n) {
      console.error(" Invalid position size:", { positionSizeInTokens, isIncrease, increaseAmounts, decreaseAmounts });
      helperToast.error(t` Invalid position size`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return Promise.reject();
    }

    try {
      return await submitApiOrder({
        symbol,
        isLong,
        isIncrease,
        sizeDeltaUsd: positionSizeInTokens, // Pass position size in tokens (bigint)
        indexTokenDecimals: indexToken.decimals, // Pass decimals for formatting
        triggerPrice: triggerPrice,
        acceptablePrice: isIncrease
          ? increaseAmounts?.acceptablePrice
          : decreaseAmounts?.acceptablePrice,
        orderType: orderType,
        reduceOnly: !isIncrease,
        leverage: leverageValue,
      });
    } catch (error) {
      sendTxnValidationErrorMetric(metricData.metricId);
      throw error;
    }
  }, [
    account,
    chainId,
    closeSizeInputValue,
    decreaseAmounts?.acceptablePrice,
    decreaseAmounts?.sizeDeltaInTokens,
    increaseAmounts?.acceptablePrice,
    increaseAmounts?.indexTokenAmount,
    initOrderMetricData,
    isIncrease,
    isLong,
    isTrigger,
    leverage,
    marketInfo,
    positionsInfoData,
    primaryCreateOrderParams,
    selectedPosition?.originalPositionId,
    selectedPosition?.entryPrice,
    submitApiOrder,
    takeProfitPriceInputValue,
    stopLossPriceInputValue,
    tradeMode,
    triggerPrice,
  ]);

  // Original On-Chain Order Submission Handler
  const onSubmitOrderOnChain = useCallback(async () => {
    const fulfilledExpressParams = await expressParamsPromise;

    const metricData = initOrderMetricData();

    sendOrderSubmittedMetric(metricData.metricId);

    if (!primaryCreateOrderParams || !signer || !provider || !tokensData || !account || !marketsInfoData) {
      helperToast.error(t` Error submitting order`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return Promise.reject();
    }

    sendUserAnalyticsOrderConfirmClickEvent(chainId, metricData.metricId);

    return sendBatchOrderTxn({
      chainId,
      signer,
      provider,
      batchParams,
      isGmxAccount: isFromTokenGmxAccount,
      expressParams:
        fulfilledExpressParams && getIsValidExpressParams(fulfilledExpressParams) ? fulfilledExpressParams : undefined,
      simulationParams: shouldDisableValidationForTesting
        ? undefined
        : {
            tokensData,
            blockTimestampData,
          },
      callback: makeOrderTxnCallback({
        metricId: metricData.metricId,
        slippageInputId,
        additionalErrorContent: undefined,
        onInternalSwapFallback: () => {
          setShouldFallbackToInternalSwap(true);
        },
      }),
    });
  }, [
    account,
    batchParams,
    blockTimestampData,
    chainId,
    expressParamsPromise,
    initOrderMetricData,
    isFromTokenGmxAccount,
    makeOrderTxnCallback,
    marketsInfoData,
    primaryCreateOrderParams,
    provider,
    setShouldFallbackToInternalSwap,
    shouldDisableValidationForTesting,
    signer,
    slippageInputId,
    tokensData,
  ]);

  // Always use API submission for x10000 (centralized version)
  const onSubmitOrder = useCallback(async () => {
    console.log(" onSubmitOrder called", { useApiOrderSubmit, isSwap });

    // For x10000, always use API submission (no on-chain submission)
    // Note: We allow API submission even if not authenticated yet, as signature will be requested from wallet
    if (useApiOrderSubmit && !isSwap) {
      console.log(" Calling onSubmitOrderViaApi");
      try {
        return await onSubmitOrderViaApi();
      } catch (error) {
        console.error(" onSubmitOrderViaApi error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error) || "Unknown error";
        helperToast.error(t` Failed to submit order: ${errorMessage}`);
        throw error;
      }
    }
    // For swaps, show error
    if (isSwap) {
      helperToast.error(t` Swap orders not supported in centralized mode`);
      return Promise.reject(new Error("Swap orders not supported"));
    }
    // This should never happen for x10000 route
    console.warn(" onSubmitOrder: unexpected condition");
    helperToast.error(t` Unexpected error: Unable to submit order`);
    return Promise.reject(new Error("Unexpected error"));
  }, [useApiOrderSubmit, isSwap, onSubmitOrderViaApi]);

  function onSubmitWrapOrUnwrap() {
    if (!account || !swapAmounts || !fromToken || !signer) {
      return Promise.reject();
    }

    return createWrapOrUnwrapTxn(chainId, signer, {
      amount: swapAmounts.amountIn,
      isWrap: Boolean(fromToken.isNative),
      setPendingTxns,
    });
  }

  function onSubmitStakeOrUnstake() {
    if (!account || !swapAmounts || !fromToken || !signer || !toToken) {
      return Promise.reject();
    }

    return createStakeOrUnstakeTxn(chainId, signer, {
      amount: swapAmounts.amountIn,
      isStake: Boolean(toToken.isStaking),
      isWrapBeforeStake: Boolean(fromToken.isNative),
      isUnwrapAfterStake: Boolean(toToken.isNative),
      setPendingTxns,
    });
  }

  return {
    onSubmitSwap: onSubmitOrder,
    onSubmitIncreaseOrder: onSubmitOrder,
    onSubmitDecreaseOrder: onSubmitOrder,
    onSubmitWrapOrUnwrap,
    onSubmitStakeOrUnstake,
    slippageInputId,
    expressParams,
    batchParams,
    isExpressLoading,
    totalExecutionFee,
  };
}
