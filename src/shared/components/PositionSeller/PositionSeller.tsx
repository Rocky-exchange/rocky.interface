import { MessageDescriptor } from "@lingui/core";
import { msg, t, Trans } from "@lingui/macro";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import cx from "classnames";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useKey, useLatest, useMedia } from "react-use";
import { useSWRConfig } from "swr";

import { USD_DECIMALS } from "config/factors";
import { UI_FEE_RECEIVER_ACCOUNT } from "config/ui";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import {
  useClosingPositionKeyState,
  usePositionsConstants,
  useTokensData,
  useUserReferralInfo,
} from "context/SyntheticsStateContext/hooks/globalsHooks";
import {
  usePositionSeller,
  usePositionSellerKeepLeverage,
  usePositionSellerLeverageDisabledByCollateral,
} from "context/SyntheticsStateContext/hooks/positionSellerHooks";
import {
  selectBlockTimestampData,
  selectGasPaymentTokenAllowance,
  selectMarketsInfoData,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import {
  selectPositionSellerAvailableReceiveTokens,
  selectPositionSellerDecreaseAmounts,
  selectPositionSellerFees,
  selectPositionSellerMarkPrice,
  selectPositionSellerMaxLiquidityPath,
  selectPositionSellerNextPositionValuesForDecrease,
  selectPositionSellerPosition,
  selectPositionSellerReceiveToken,
  selectPositionSellerSetDefaultReceiveToken,
  selectPositionSellerShouldSwap,
  selectPositionSellerSwapAmounts,
  selectPositionSellerTriggerPrice,
} from "context/SyntheticsStateContext/selectors/positionSellerSelectors";
import { selectExecutionFeeBufferBps } from "context/SyntheticsStateContext/selectors/settingsSelectors";
import { makeSelectMarketPriceDecimals } from "context/SyntheticsStateContext/selectors/statsSelectors";
import { selectTokenPermits } from "context/SyntheticsStateContext/selectors/tokenPermitsSelectors";
import { selectTradeboxAvailableTokensOptions } from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { getIsValidExpressParams } from "domain/synthetics/express/expressOrderUtils";
import { useExpressOrdersParams } from "domain/synthetics/express/useRelayerFeeHandler";
import { DecreasePositionSwapType, OrderType } from "domain/synthetics/orders";
import { sendBatchOrderTxn } from "domain/synthetics/orders/sendBatchOrderTxn";
import { useOrderTxnCallbacks } from "domain/synthetics/orders/useOrderTxnCallbacks";
import { formatLeverage, formatLiquidationPrice, getNameByOrderType } from "domain/synthetics/positions";
import { getApprovalRequirements } from "domain/synthetics/tokens";
import { getPositionSellerTradeFlags } from "domain/synthetics/trade";
import { getTwapRecommendation } from "domain/synthetics/trade/twapRecommendation";
import { TradeType } from "domain/synthetics/trade/types";
import { useDebugExecutionPrice } from "domain/synthetics/trade/useExecutionPrice";
import { useMaxAutoCancelOrdersState } from "domain/synthetics/trade/useMaxAutoCancelOrdersState";
import { ORDER_OPTION_TO_TRADE_MODE, OrderOption } from "domain/synthetics/trade/usePositionSellerState";
import { usePriceImpactWarningState } from "domain/synthetics/trade/usePriceImpactWarningState";
import { getCommonError, getDecreaseError, getExpressError } from "domain/synthetics/trade/utils/validation";
import { Token } from "domain/tokens";
import { useApproveToken } from "domain/tokens/useApproveTokens";
import { useChainId } from "lib/chains";
import { useDebouncedInputValue } from "lib/debounce/useDebouncedInputValue";
import { helperToast } from "lib/helperToast";
import { useLocalizedMap } from "lib/i18n";
import { initDecreaseOrderMetricData, sendOrderSubmittedMetric, sendTxnValidationErrorMetric } from "lib/metrics/utils";
import {
  calculateDisplayDecimals,
  formatAmount,
  formatAmountFree,
  formatDeltaUsd,
  formatPercentage,
  formatUsd,
  parseValue,
} from "lib/numbers";
import { formatUnits } from "viem";
import { useJsonRpcProvider } from "lib/rpc";
import { useHasOutdatedUi } from "lib/useHasOutdatedUi";
import useWallet from "lib/wallets/useWallet";
import { convertTokenAddress, getToken, getTokenVisualMultiplier } from "sdk/configs/tokens";
import { useClosePositionHandler, shouldUseApiOrderSubmit, TpSlRequest } from "@/modules/cex/lib/api";
import { setPositionTpSl, isAuthenticated } from "@/modules/cex/lib/api/custom/client";
import { bigMath } from "sdk/utils/bigmath";
import {
  BatchOrderTxnParams,
  buildDecreaseOrderPayload,
  buildTwapOrdersPayloads,
  CreateOrderTxnParams,
  DecreasePositionOrderParams,
} from "sdk/utils/orderTransactions";
import { getIsValidTwapParams } from "sdk/utils/twap";

import { AmountWithUsdBalance } from "components/AmountWithUsd/AmountWithUsd";
import Button from "components/Button/Button";
import BuyInputSection from "components/BuyInputSection/BuyInputSection";
import { ColorfulBanner } from "components/ColorfulBanner/ColorfulBanner";
import ExternalLink from "components/ExternalLink/ExternalLink";
import Modal from "components/Modal/Modal";
import Tabs from "components/Tabs/Tabs";
import ToggleSwitch from "components/ToggleSwitch/ToggleSwitch";
import TokenSelector from "components/TokenSelector/TokenSelector";
import TooltipWithPortal from "components/Tooltip/TooltipWithPortal";
import { ValueTransition } from "components/ValueTransition/ValueTransition";

import InfoCircleIcon from "img/ic_info_circle_stroke.svg?react";
import SpinnerIcon from "img/ic_spinner.svg?react";

import { PositionSellerAdvancedRows } from "./PositionSellerAdvancedDisplayRows";
import { HighPriceImpactOrFeesWarningCard } from "../HighPriceImpactOrFeesWarningCard/HighPriceImpactOrFeesWarningCard";
import { SyntheticsInfoRow } from "../SyntheticsInfoRow";
import { ExpressTradingWarningCard } from "../TradeBox/ExpressTradingWarningCard";
import TradeInfoIcon from "../TradeInfoIcon/TradeInfoIcon";
import TwapRows from "../TwapRows/TwapRows";
import { PositionSellerPriceImpactFeesRow } from "./rows/PositionSellerPriceImpactFeesRow";

import "./PositionSeller.scss";

export type Props = {
  setPendingTxns: (txns: any) => void;
};

const ORDER_OPTION_LABELS: Record<OrderOption, MessageDescriptor> = {
  [OrderOption.Market]: msg`Market`,
  [OrderOption.Trigger]: msg`TP/SL`,
  [OrderOption.Twap]: msg`TWAP`,
};

export function PositionSeller() {
  const [, setClosingPositionKey] = useClosingPositionKeyState();
  const [isApproving, setIsApproving] = useState(false);

  const onClose = useCallback(() => {
    setClosingPositionKey(undefined);
  }, [setClosingPositionKey]);
  const availableTokensOptions = useSelector(selectTradeboxAvailableTokensOptions);
  const availableReceiveTokens = useSelector(selectPositionSellerAvailableReceiveTokens);
  const tokensData = useTokensData();
  const { chainId, srcChainId } = useChainId();
  const { signer, account } = useWallet();
  const { provider } = useJsonRpcProvider(chainId);
  const { openConnectModal } = useConnectModal();
  const { minCollateralUsd, minPositionSizeUsd } = usePositionsConstants();
  const userReferralInfo = useUserReferralInfo();
  const hasOutdatedUi = useHasOutdatedUi();
  const position = useSelector(selectPositionSellerPosition);
  const toToken = position?.indexToken;
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const { shouldDisableValidationForTesting } = useSettings();
  const localizedOrderOptionLabels = useLocalizedMap(ORDER_OPTION_LABELS);
  const blockTimestampData = useSelector(selectBlockTimestampData);
  const marketsInfoData = useSelector(selectMarketsInfoData);
  const gasPaymentTokenAllowance = useSelector(selectGasPaymentTokenAllowance);
  const tokenPermits = useSelector(selectTokenPermits);
  const { approveToken } = useApproveToken();
  const executionFeeBufferBps = useSelector(selectExecutionFeeBufferBps);
  const { mutate } = useSWRConfig();

  const isVisible = Boolean(position);

  const { makeOrderTxnCallback } = useOrderTxnCallbacks();

  // X10000 API close position handler
  const { closePositionViaApi, isApiEnabled, isReady } = useClosePositionHandler();
  const isX10000Mode = shouldUseApiOrderSubmit();

  const setDefaultReceiveToken = useSelector(selectPositionSellerSetDefaultReceiveToken);
  const marketDecimals = useSelector(makeSelectMarketPriceDecimals(position?.market.indexTokenAddress));

  const {
    allowedSlippage,
    closeUsdInputValue: closeUsdInputValueRaw,
    defaultTriggerAcceptablePriceImpactBps,
    isSubmitting,
    orderOption,
    handleSetOrderOption,
    receiveTokenAddress,
    setCloseUsdInputValue: setCloseUsdInputValueRaw,
    setDefaultTriggerAcceptablePriceImpactBps,
    setIsSubmitting,
    setReceiveTokenAddress,
    setSelectedTriggerAcceptablePriceImpactBps,
    setTriggerPriceInputValue: setTriggerPriceInputValueRaw,
    triggerPriceInputValue: triggerPriceInputValueRaw,
    resetPositionSeller,
    setIsReceiveTokenChanged,
    setKeepLeverage,
    duration,
    numberOfParts,
    setDuration,
    setNumberOfParts,
  } = usePositionSeller();

  const [closeUsdInputValue, setCloseUsdInputValue] = useDebouncedInputValue(
    closeUsdInputValueRaw,
    setCloseUsdInputValueRaw
  );
  const [triggerPriceInputValue, setTriggerPriceInputValue] = useDebouncedInputValue(
    triggerPriceInputValueRaw,
    setTriggerPriceInputValueRaw
  );

  // x10000 mode TP/SL state
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [isX10000TpSlSubmitting, setIsX10000TpSlSubmitting] = useState(false);

  const [isWaitingForDebounceBeforeSubmit, setIsWaitingForDebounceBeforeSubmit] = useState(false);

  const triggerPrice = useSelector(selectPositionSellerTriggerPrice);

  const isTrigger = orderOption === OrderOption.Trigger;
  const isTwap = orderOption === OrderOption.Twap;
  const isMarket = orderOption === OrderOption.Market;
  const closeSizeUsd = parseValue(closeUsdInputValue || "0", USD_DECIMALS)!;
  const maxCloseSize = position?.sizeInUsd || 0n;

  const setReceiveTokenManually = useCallback(
    (token: Token) => {
      setIsReceiveTokenChanged(true);
      setReceiveTokenAddress(token.address);
    },
    [setReceiveTokenAddress, setIsReceiveTokenChanged]
  );

  const receiveToken = useSelector(selectPositionSellerReceiveToken);

  useEffect(() => {
    if (!isVisible) {
      // timeout to not disturb animation
      setTimeout(() => {
        resetPositionSeller();
        // Reset x10000 TP/SL state
        setTakeProfitPrice("");
        setStopLossPrice("");
      }, 200);
    }
  }, [isVisible, resetPositionSeller]);

  // Sync TP/SL price to triggerPriceInputValue in x10000 TP/SL mode
  // This ensures that Receive and PnL calculations reflect the trigger price
  // Priority: Take Profit > Stop Loss (users care more about profit scenarios)
  useEffect(() => {
    if (isX10000Mode && isTrigger) {
      const priceToUse = takeProfitPrice || stopLossPrice;
      if (priceToUse) {
        setTriggerPriceInputValueRaw(priceToUse);
      }
    }
  }, [isX10000Mode, isTrigger, takeProfitPrice, stopLossPrice, setTriggerPriceInputValueRaw]);

  const markPrice = useSelector(selectPositionSellerMarkPrice);
  const { maxLiquidity: maxSwapLiquidity } = useSelector(selectPositionSellerMaxLiquidityPath);
  const decreaseAmounts = useSelector(selectPositionSellerDecreaseAmounts);

  useDebugExecutionPrice(chainId, {
    skip: true,
    marketInfo: position?.marketInfo,
    sizeInUsd: position?.sizeInUsd,
    sizeInTokens: position?.sizeInTokens,
    sizeDeltaUsd: decreaseAmounts?.sizeDeltaUsd ? decreaseAmounts.sizeDeltaUsd * -1n : undefined,
    isLong: position?.isLong,
  });

  const shouldSwap = useSelector(selectPositionSellerShouldSwap);
  const swapAmounts = useSelector(selectPositionSellerSwapAmounts);

  const receiveUsd = swapAmounts?.usdOut || decreaseAmounts?.receiveUsd;
  const receiveTokenAmount = swapAmounts?.amountOut || decreaseAmounts?.receiveTokenAmount;

  const nextPositionValues = useSelector(selectPositionSellerNextPositionValuesForDecrease);

  const { fees, executionFee } = useSelector(selectPositionSellerFees);

  const twapRecommendation = getTwapRecommendation({
    enabled: orderOption !== OrderOption.Twap && Boolean(position),
    sizeDeltaUsd: decreaseAmounts?.sizeDeltaUsd,
    priceImpactPrecise: fees?.decreasePositionPriceImpact?.precisePercentage,
  });

  const priceImpactWarningState = usePriceImpactWarningState({
    collateralNetPriceImpact: fees?.collateralNetPriceImpact,
    swapPriceImpact: fees?.swapPriceImpact,
    swapProfitFee: fees?.swapProfitFee,
    executionFeeUsd: executionFee?.feeUsd,
    tradeFlags: getPositionSellerTradeFlags(position?.isLong, orderOption),
    payUsd: closeSizeUsd,
  });

  const isNotEnoughReceiveTokenLiquidity = shouldSwap ? maxSwapLiquidity < (receiveUsd ?? 0n) : false;
  const setIsDismissedLatestRef = useLatest(priceImpactWarningState.setIsDismissed);

  const slippageInputId = useId();

  useEffect(() => {
    if (isVisible) {
      setIsDismissedLatestRef.current(false);
    }
  }, [setIsDismissedLatestRef, isVisible, orderOption]);

  const { autoCancelOrdersLimit } = useMaxAutoCancelOrdersState({ positionKey: position?.key });

  const batchParams: BatchOrderTxnParams | undefined = useMemo(() => {
    // x10000 mode uses API for closing positions, not on-chain transactions
    // Skip building batch params to avoid errors with synthetic token addresses
    if (isX10000Mode) {
      return undefined;
    }

    let orderType = isTrigger ? decreaseAmounts?.triggerOrderType : OrderType.MarketDecrease;
    orderType = isTwap ? OrderType.LimitDecrease : orderType;

    // TODO findSwapPath considering decreasePositionSwapType?
    const swapPath =
      decreaseAmounts?.decreaseSwapType === DecreasePositionSwapType.SwapCollateralTokenToPnlToken
        ? []
        : swapAmounts?.swapStrategy.swapPathStats?.swapPath || [];

    if (
      !account ||
      !tokensData ||
      !marketsInfoData ||
      !position ||
      executionFee?.feeTokenAmount == undefined ||
      !receiveToken?.address ||
      receiveUsd === undefined ||
      decreaseAmounts?.acceptablePrice === undefined ||
      !signer ||
      !orderType
    ) {
      return undefined;
    }

    const decreaseOrderParams: DecreasePositionOrderParams = {
      receiver: account,
      chainId,
      executionFeeAmount: executionFee.feeTokenAmount,
      executionGasLimit: executionFee.gasLimit,
      referralCode: userReferralInfo?.referralCodeForTxn,
      allowedSlippage: isMarket ? allowedSlippage : 0,
      autoCancel: isTrigger ? autoCancelOrdersLimit > 0 : false,
      uiFeeReceiver: UI_FEE_RECEIVER_ACCOUNT,
      orderType,
      marketAddress: position.marketAddress,
      indexTokenAddress: position.indexToken.address,
      collateralTokenAddress: position.collateralTokenAddress,
      collateralDeltaAmount: decreaseAmounts.collateralDeltaAmount ?? 0n,
      receiveTokenAddress: receiveToken.address,
      swapPath,
      sizeDeltaUsd: decreaseAmounts.sizeDeltaUsd,
      sizeDeltaInTokens: decreaseAmounts.sizeDeltaInTokens,
      triggerPrice: isTrigger ? triggerPrice : undefined,
      acceptablePrice: decreaseAmounts.acceptablePrice,
      decreasePositionSwapType: decreaseAmounts.decreaseSwapType,
      externalSwapQuote: undefined,
      isLong: position.isLong,
      minOutputUsd: 0n,
      validFromTime: 0n,
    };

    let createOrderParams: CreateOrderTxnParams<DecreasePositionOrderParams>[] = [];

    if (isTwap && getIsValidTwapParams(duration, numberOfParts)) {
      createOrderParams = buildTwapOrdersPayloads(decreaseOrderParams, { duration, numberOfParts });
    } else {
      createOrderParams = [buildDecreaseOrderPayload(decreaseOrderParams)];
    }

    return {
      createOrderParams,
      updateOrderParams: [],
      cancelOrderParams: [],
    };
  }, [
    account,
    allowedSlippage,
    autoCancelOrdersLimit,
    chainId,
    decreaseAmounts?.acceptablePrice,
    decreaseAmounts?.collateralDeltaAmount,
    decreaseAmounts?.decreaseSwapType,
    decreaseAmounts?.sizeDeltaInTokens,
    decreaseAmounts?.sizeDeltaUsd,
    decreaseAmounts?.triggerOrderType,
    duration,
    executionFee?.feeTokenAmount,
    executionFee?.gasLimit,
    isMarket,
    isTrigger,
    isTwap,
    isX10000Mode,
    marketsInfoData,
    numberOfParts,
    position,
    receiveToken?.address,
    receiveUsd,
    signer,
    swapAmounts?.swapStrategy.swapPathStats?.swapPath,
    tokensData,
    triggerPrice,
    userReferralInfo?.referralCodeForTxn,
  ]);

  const {
    expressParams,
    isLoading: isExpressLoading,
    expressParamsPromise,
    fastExpressParams,
    asyncExpressParams,
  } = useExpressOrdersParams({
    label: "Position Seller",
    orderParams: batchParams,
    isGmxAccount: srcChainId !== undefined,
  });

  const { tokensToApprove, isAllowanceLoaded } = useMemo(() => {
    if (srcChainId) {
      return { tokensToApprove: [], isAllowanceLoaded: true };
    }

    if (!batchParams) {
      return { tokensToApprove: [], isAllowanceLoaded: false };
    }

    const approvalRequirements = getApprovalRequirements({
      chainId,
      payTokenParamsList: [],
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
    batchParams,
    chainId,
    expressParams,
    gasPaymentTokenAllowance?.isLoaded,
    gasPaymentTokenAllowance?.tokensAllowanceData,
    srcChainId,
    tokenPermits,
  ]);

  const error = useMemo(() => {
    if (!position) {
      return undefined;
    }

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

    const decreaseError = getDecreaseError({
      marketInfo: position.marketInfo,
      inputSizeUsd: closeSizeUsd,
      sizeDeltaUsd: decreaseAmounts?.sizeDeltaUsd,
      receiveToken,
      isTrigger,
      triggerPrice,
      triggerThresholdType: undefined,
      existingPosition: position,
      markPrice,
      nextPositionValues,
      isLong: position.isLong,
      isContractAccount: false,
      minCollateralUsd,
      isNotEnoughReceiveTokenLiquidity,
      minPositionSizeUsd,
      isTwap,
      numberOfParts,
    });

    if (commonError[0] || decreaseError[0] || expressError[0]) {
      return commonError[0] || decreaseError[0] || expressError[0];
    }

    if (isSubmitting) {
      return t`Creating order`;
    }
  }, [
    account,
    chainId,
    closeSizeUsd,
    decreaseAmounts?.sizeDeltaUsd,
    expressParams,
    hasOutdatedUi,
    isNotEnoughReceiveTokenLiquidity,
    isSubmitting,
    isTrigger,
    markPrice,
    minCollateralUsd,
    nextPositionValues,
    position,
    receiveToken,
    tokensData,
    triggerPrice,
    minPositionSizeUsd,
    isTwap,
    numberOfParts,
  ]);

  async function onSubmit() {
    if (!account) {
      openConnectModal?.();
      return;
    }

    // X10000 mode: Use API to close position (no blockchain logic)
    if (isX10000Mode) {
      if (!position) {
        helperToast.error(t`Position not found`);
        return;
      }

      // Check if position has originalPositionId (required for API close)
      if (!position.originalPositionId) {
        console.error("[PositionSeller] Missing originalPositionId for x10000 position:", position);
        helperToast.error(t`Unable to close position: missing position ID`);
        return;
      }

      // Check if API handler is ready (for Market orders)
      if (!isTrigger && !isReady) {
        helperToast.error(t`Please wait, loading...`);
        return;
      }

      // Check authentication for TP/SL
      if (isTrigger && !isAuthenticated(account, chainId)) {
        helperToast.error(t`Please sign in first`);
        return;
      }

      // In x10000 mode, TWAP orders are not supported
      if (isTwap) {
        helperToast.error(t`TWAP orders are not supported. Please use Market or TP/SL.`);
        return;
      }

      // Handle TP/SL (Trigger) mode - call setPositionTpSl API
      if (isTrigger) {
        // Validate at least one of TP or SL is set
        if (!takeProfitPrice && !stopLossPrice) {
          helperToast.error(t`Please enter at least one of Take Profit or Stop Loss price`);
          return;
        }

        // Validate close size is entered
        if (!closeSizeUsd || closeSizeUsd === 0n) {
          helperToast.error(t`Please enter a close size`);
          return;
        }

        setIsX10000TpSlSubmitting(true);
        try {
          // Determine if max is selected (full position close)
          // When max is selected, use the full position size without truncation
          const isMaxSelected = closeSizeUsd >= maxCloseSize;
          const sizeStr = isMaxSelected
            ? formatUnits(maxCloseSize, USD_DECIMALS)  // Use full size without truncation
            : (Number(closeSizeUsd) / 1e30).toFixed(2);

          // Build request with separate size fields for TP and SL per new API spec
          const request: TpSlRequest = {};
          if (takeProfitPrice && parseFloat(takeProfitPrice) > 0) {
            request.take_profit_price = takeProfitPrice;
            request.take_profit_size = sizeStr;
          }
          if (stopLossPrice && parseFloat(stopLossPrice) > 0) {
            request.stop_loss_price = stopLossPrice;
            request.stop_loss_size = sizeStr;
          }

          await setPositionTpSl(chainId, position.originalPositionId, request);
          helperToast.success(t`TP/SL set successfully`);

          // Refresh orders list to show new trigger orders
          if (account) {
            setTimeout(() => {
              mutate(["api-orders", chainId, account], undefined, { revalidate: true });
            }, 100);
          }

          onClose();
        } catch (error: unknown) {
          console.error("[PositionSeller] Failed to set TP/SL:", error);
          const errorMessage = error instanceof Error ? error.message : t`Failed to set TP/SL`;
          helperToast.error(errorMessage);
        } finally {
          setIsX10000TpSlSubmitting(false);
        }
        return;
      }

      setIsSubmitting(true);

      try {
        // Get size from API position data - DO NOT calculate, use original value
        // API expects size as position size (e.g., "42.1528662308" for BTC position)
        // IMPORTANT: positions数据中size是多少就传递多少给接口，不能截取、不能四舍五入
        let size: string;
        const isFullClose = closeSizeUsd >= maxCloseSize;

        if (isFullClose) {
          // Full close: use original size from API position data
          const originalSize = (position as any).originalSize as string | undefined;
          if (originalSize) {
            // Use the exact size value from API response
            size = originalSize;
          } else {
            // Fallback: use position.sizeInTokens with full precision (no rounding)
            if (position.sizeInTokens > 0n && position.indexToken?.decimals) {
              // Use formatUnits to preserve full precision without rounding
              size = formatUnits(position.sizeInTokens, position.indexToken.decimals);
            } else if (position.entryPrice && position.entryPrice > 0n) {
              // Calculate from sizeInUsd / entryPrice
              const sizeInTokensBigInt = (position.sizeInUsd * 10n ** 18n) / position.entryPrice;
              size = formatUnits(sizeInTokensBigInt, 18);
            } else {
              helperToast.error(t`Unable to calculate position size`);
              setIsSubmitting(false);
              return;
            }
          }
        } else {
          // Partial close: calculate proportional size based on closeSizeUsd
          // IMPORTANT: Calculate based on original size to maintain precision
          const originalSize = (position as any).originalSize as string | undefined;

          if (originalSize && position.sizeInUsd > 0n) {
            // Calculate: originalSize * (closeSizeUsd / position.sizeInUsd)
            // Convert originalSize string to bigint for precise calculation
            const decimalIndex = originalSize.indexOf('.');
            const decimals = decimalIndex === -1 ? 0 : originalSize.length - decimalIndex - 1;
            const sizeBigInt = BigInt(originalSize.replace('.', ''));

            // Calculate proportional size: (sizeBigInt * closeSizeUsd) / position.sizeInUsd
            const partialSizeBigInt = (sizeBigInt * closeSizeUsd) / position.sizeInUsd;

            // Convert back to string with original decimal places
            size = formatUnits(partialSizeBigInt, decimals);
          } else if (position.entryPrice && position.entryPrice > 0n) {
            // Fallback: calculate from closeSizeUsd / entryPrice
            const closeSizeInTokensBigInt = (closeSizeUsd * 10n ** 18n) / position.entryPrice;
            size = formatUnits(closeSizeInTokensBigInt, 18);
          } else {
            helperToast.error(t`Unable to calculate close amount`);
            setIsSubmitting(false);
            return;
          }
        }

        // Determine price: null for market orders, triggerPrice for limit orders
        // According to API docs: price is null for market orders, or a string for limit orders
        // IMPORTANT: DO NOT truncate or round - use full precision
        const price: string | null = isTrigger && triggerPrice && orderOption === OrderOption.Trigger
          ? formatUnits(triggerPrice, USD_DECIMALS) // Convert from 30 decimals with full precision
          : null; // Market order: price is null

        await closePositionViaApi(position.originalPositionId, {
          size,
          price,
        });

        // Refresh orders list
        if (account) {
          setTimeout(() => {
            mutate(["api-orders", chainId, account], undefined, { revalidate: true });
          }, 100);
        }

        onClose();
        setIsSubmitting(false);
        setDefaultReceiveToken(receiveToken?.address);
        return;
      } catch (error: any) {
        console.error("[PositionSeller] Failed to close position via API:", error);
        setIsSubmitting(false);
        return;
      }
    }

    // Non-x10000 mode: Use blockchain logic
    if (!signer) {
      openConnectModal?.();
      return;
    }

    if (isAllowanceLoaded && tokensToApprove.length) {
      if (!chainId || isApproving) return;

      approveToken({
        signer,
        tokenAddress: tokensToApprove[0].tokenAddress,
        chainId,
        allowPermit: Boolean(expressParams),
        setIsApproving,
      });

      return;
    }

    const params = batchParams?.createOrderParams[0];

    const metricData = initDecreaseOrderMetricData({
      collateralToken: position?.collateralToken,
      decreaseAmounts,
      hasExistingPosition: true,
      swapPath: params?.orderPayload.addresses.swapPath,
      executionFee,
      orderType: params?.orderPayload.orderType,
      hasReferralCode: Boolean(userReferralInfo?.referralCodeForTxn),
      subaccount: expressParams?.subaccount,
      triggerPrice,
      marketInfo: position?.marketInfo,
      executionFeeBufferBps,
      isTwap,
      allowedSlippage,
      isLong: position?.isLong,
      place: "positionSeller",
      interactionId: undefined,
      priceImpactDeltaUsd: undefined,
      priceImpactPercentage: undefined,
      netRate1h: undefined,
      isExpress: Boolean(expressParams),
      duration,
      partsCount: numberOfParts,
      tradeMode: ORDER_OPTION_TO_TRADE_MODE[orderOption],
      fastExpressParams,
      asyncExpressParams,
      expressParams,
      chainId: srcChainId ?? chainId,
      isCollateralFromMultichain: srcChainId !== undefined,
    });

    sendOrderSubmittedMetric(metricData.metricId);

    if (
      !batchParams ||
      !tokensData ||
      !marketsInfoData ||
      !position ||
      executionFee?.feeTokenAmount == undefined ||
      !receiveToken?.address ||
      receiveUsd === undefined ||
      decreaseAmounts?.acceptablePrice === undefined ||
      !signer ||
      !provider
    ) {
      helperToast.error(t`Error submitting order`);
      sendTxnValidationErrorMetric(metricData.metricId);
      return;
    }

    setIsSubmitting(true);

    const fulfilledExpressParams = await expressParamsPromise;

    const txnPromise = sendBatchOrderTxn({
      chainId,
      signer,
      provider,
      batchParams,
      isGmxAccount: srcChainId !== undefined,
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
      }),
    });

    if (expressParams?.subaccount) {
      onClose();
      setIsSubmitting(false);
      setDefaultReceiveToken(receiveToken.address);
      return;
    }

    txnPromise.then(onClose).finally(() => {
      setIsSubmitting(false);
      setDefaultReceiveToken(receiveToken.address);
    });
  }

  const latestOnSubmit = useLatest(onSubmit);

  useKey(
    "Enter",
    () => {
      if (isVisible && !error) {
        submitButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        if (closeUsdInputValue === closeUsdInputValueRaw && triggerPriceInputValue === triggerPriceInputValueRaw) {
          latestOnSubmit.current();
        } else {
          setIsWaitingForDebounceBeforeSubmit(true);
        }
      }
    },
    {},
    [
      isVisible,
      error,
      closeUsdInputValue,
      triggerPriceInputValue,
      closeUsdInputValueRaw,
      triggerPriceInputValueRaw,
      latestOnSubmit,
    ]
  );

  useEffect(() => {
    if (!tokensToApprove.length && isApproving) {
      setIsApproving(false);
    }
  }, [isApproving, tokensToApprove.length]);

  useEffect(() => {
    if (
      isWaitingForDebounceBeforeSubmit &&
      closeUsdInputValue === closeUsdInputValueRaw &&
      triggerPriceInputValue === triggerPriceInputValueRaw
    ) {
      setIsWaitingForDebounceBeforeSubmit(false);
      latestOnSubmit.current();
    }
  }, [
    isWaitingForDebounceBeforeSubmit,
    latestOnSubmit,
    closeUsdInputValue,
    triggerPriceInputValue,
    closeUsdInputValueRaw,
    triggerPriceInputValueRaw,
  ]);

  useEffect(() => {
    if (!isVisible) {
      setIsWaitingForDebounceBeforeSubmit(false);
    }
  }, [isVisible]);

  useEffect(
    function initReceiveToken() {
      if (!receiveTokenAddress && position?.collateralToken?.address) {
        const convertedAddress = convertTokenAddress(chainId, position?.collateralToken.address, "native");
        setReceiveTokenAddress(convertedAddress);
      }
    },
    [chainId, position?.collateralToken, receiveTokenAddress, setReceiveTokenAddress]
  );

  useEffect(() => {
    if (isTrigger && decreaseAmounts) {
      if (
        defaultTriggerAcceptablePriceImpactBps === undefined ||
        defaultTriggerAcceptablePriceImpactBps !== bigMath.abs(decreaseAmounts.recommendedAcceptablePriceDeltaBps)
      ) {
        setDefaultTriggerAcceptablePriceImpactBps(bigMath.abs(decreaseAmounts.recommendedAcceptablePriceDeltaBps));
        setSelectedTriggerAcceptablePriceImpactBps(bigMath.abs(decreaseAmounts.recommendedAcceptablePriceDeltaBps));
      }
    }
  }, [
    decreaseAmounts,
    defaultTriggerAcceptablePriceImpactBps,
    isTrigger,
    setDefaultTriggerAcceptablePriceImpactBps,
    setSelectedTriggerAcceptablePriceImpactBps,
  ]);

  const liqPriceRow = position && (
    <SyntheticsInfoRow
      label={t`Liquidation Price`}
      value={
        <ValueTransition
          from={
            formatLiquidationPrice(position.liquidationPrice, {
              displayDecimals: marketDecimals,
              visualMultiplier: toToken?.visualMultiplier,
            })!
          }
          to={
            decreaseAmounts?.isFullClose
              ? "-"
              : decreaseAmounts?.sizeDeltaUsd
                ? formatLiquidationPrice(nextPositionValues?.nextLiqPrice, {
                    displayDecimals: marketDecimals,
                    visualMultiplier: toToken?.visualMultiplier,
                  })
                : undefined
          }
        />
      }
    />
  );

  const receiveTokenRow = isTrigger || isX10000Mode ? (
    <SyntheticsInfoRow
      className="SwapBox-info-row"
      label={t`Receive`}
      value={
        <AmountWithUsdBalance
          amount={decreaseAmounts?.receiveTokenAmount}
          decimals={position?.collateralToken.decimals ?? 0}
          symbol={isX10000Mode ? "USDT" : position?.collateralToken.symbol}
          usd={decreaseAmounts?.receiveUsd}
          isStable={true}
        />
      }
    />
  ) : (
    <SyntheticsInfoRow
      label={t`Receive`}
      value={
        receiveToken && (
          <TokenSelector
            label={t`Receive`}
            className={cx({
              "*:!text-yellow-300 hover:!text-yellow-300": isNotEnoughReceiveTokenLiquidity,
            })}
            chainId={chainId}
            showBalances={false}
            infoTokens={availableTokensOptions?.infoTokens}
            tokenAddress={receiveToken.address}
            onSelectToken={setReceiveTokenManually}
            tokens={availableReceiveTokens}
            showTokenImgInDropdown={true}
            selectedTokenLabel={
              <span className="PositionSelector-selected-receive-token">
                <AmountWithUsdBalance
                  className={cx({
                    "*:!text-yellow-300 hover:!text-yellow-300": isNotEnoughReceiveTokenLiquidity,
                  })}
                  amount={receiveTokenAmount}
                  decimals={receiveToken.decimals}
                  symbol={receiveToken.symbol}
                  usd={receiveUsd}
                  isStable={receiveToken.isStable}
                />
              </span>
            }
            extendedSortSequence={availableTokensOptions?.sortedLongAndShortTokens}
          />
        )
      }
    />
  );

  const { warning: maxAutoCancelOrdersWarning } = useMaxAutoCancelOrdersState({
    positionKey: position?.key,
    isCreatingNewAutoCancel: isTrigger,
  });
  const leverageCheckboxDisabledByCollateral = usePositionSellerLeverageDisabledByCollateral();
  const keepLeverage = usePositionSellerKeepLeverage();
  const keepLeverageChecked = decreaseAmounts?.isFullClose ? false : keepLeverage ?? false;

  let keepLeverageAtValue: string | undefined = "...";
  if (position?.leverage && !decreaseAmounts?.isFullClose) {
    keepLeverageAtValue = formatLeverage(position.leverage);
  }

  const keepLeverageText = <Trans>Keep leverage at {keepLeverageAtValue}</Trans>;

  const keepLeverageTextElem = leverageCheckboxDisabledByCollateral ? (
    <TooltipWithPortal
      handle={keepLeverageText}
      content={
        <Trans>
          Keep leverage is not available as Position exceeds max. allowed leverage.{" "}
          {/* GMX_DOCS_LINK_COMMENTED: https://docs.gmx.io/docs/trading/v2/#max-leverage */}
          <span className="text-blue-300">Read more</span>.
        </Trans>
      }
    />
  ) : (
    keepLeverageText
  );

  const pnlRow =
    position &&
    (isTrigger ? (
      <SyntheticsInfoRow
        label={t`PnL`}
        value={
          <ValueTransition
            from={
              <>
                {formatDeltaUsd(decreaseAmounts?.estimatedPnl)} (
                {formatPercentage(decreaseAmounts?.estimatedPnlPercentage, { signed: true })})
              </>
            }
            to={
              decreaseAmounts?.sizeDeltaUsd ? (
                <>
                  {formatDeltaUsd(nextPositionValues?.nextPnl)} (
                  {formatPercentage(nextPositionValues?.nextPnlPercentage, { signed: true })})
                </>
              ) : undefined
            }
          />
        }
      />
    ) : (
      <SyntheticsInfoRow
        label={t`PnL`}
        value={
          <ValueTransition
            from={formatDeltaUsd(position.pnl, position.pnlPercentage)}
            to={formatDeltaUsd(nextPositionValues?.nextPnl, nextPositionValues?.nextPnlPercentage)}
          />
        }
      />
    ));

  const tabsOptions = useMemo(() => {
    return Object.values(OrderOption)
      .filter((option) => option !== OrderOption.Twap) // Remove TWAP tab
      .map((option) => ({
        value: option,
        label: localizedOrderOptionLabels[option],
      }));
  }, [localizedOrderOptionLabels]);

  const buttonState = useMemo(() => {
    // x10000 mode: Handle TP/SL separately
    if (isX10000Mode && isTrigger) {
      if (isX10000TpSlSubmitting) {
        return {
          text: (
            <>
              {t`Setting TP/SL...`}
              <SpinnerIcon className="ml-4 animate-spin" />
            </>
          ),
          disabled: true,
        };
      }

      // Validate TP/SL inputs
      const hasTp = takeProfitPrice && parseFloat(takeProfitPrice) > 0;
      const hasSl = stopLossPrice && parseFloat(stopLossPrice) > 0;

      if (!hasTp && !hasSl) {
        return {
          text: t`Enter TP or SL price`,
          disabled: true,
        };
      }

      return {
        text: t`Set TP/SL`,
        disabled: false,
      };
    }

    // x10000 mode uses API, skip chain-related loading states
    if (!isX10000Mode) {
      if (!isAllowanceLoaded) {
        return {
          text: t`Loading`,
          disabled: true,
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
          disabled: true,
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
          disabled: true,
        };
      }

      if (isAllowanceLoaded && tokensToApprove.length) {
        const tokenToApprove = tokensToApprove[0];
        return {
          text: t`Allow ${getToken(chainId, tokenToApprove.tokenAddress).symbol} to be spent`,
          disabled: false,
        };
      }
    }

    return {
      text:
        error ||
        (isTrigger || isTwap
          ? t`Create ${isTwap ? "TWAP Decrease" : getNameByOrderType(decreaseAmounts?.triggerOrderType, isTwap)} Order`
          : t`Close`),
      disabled: Boolean(error) && !shouldDisableValidationForTesting,
    };
  }, [
    chainId,
    decreaseAmounts?.triggerOrderType,
    error,
    isAllowanceLoaded,
    isApproving,
    isExpressLoading,
    isTrigger,
    isTwap,
    isX10000Mode,
    isX10000TpSlSubmitting,
    shouldDisableValidationForTesting,
    stopLossPrice,
    takeProfitPrice,
    tokensToApprove,
  ]);

  const isMobile = useMedia("(max-width: 1024px)");

  return (
    <div className="text-body-medium">
      <Modal
        isVisible={isVisible}
        setIsVisible={onClose}
        label={
          <Trans>
            Close {position?.isLong ? t`Long` : t`Short`}{" "}
            {position?.indexToken && getTokenVisualMultiplier(position.indexToken)}
            {position?.indexToken?.symbol}
          </Trans>
        }
        qa="position-close-modal"
        contentClassName="w-[380px]"
      >
        <div className="mb-[10.5px] flex w-full items-center justify-between">
          <Tabs
            options={tabsOptions}
            selectedValue={orderOption}
            type="inline"
            onChange={handleSetOrderOption}
            qa="operation-tabs"
          />

          <TradeInfoIcon
            isMobile={isMobile}
            tradeType={position?.isLong ? TradeType.Long : TradeType.Short}
            tradePlace="position-seller"
          />
        </div>

        <div className="w-full">
          {position && (
            <>
              <div className="flex flex-col gap-4">
                {/* Hide TWAP recommendation in x10000 mode */}
                {twapRecommendation && !isX10000Mode && (
                  <ColorfulBanner color="blue" icon={InfoCircleIcon}>
                    <div className="flex flex-col gap-8">
                      <span>
                        <span
                          className="cursor-pointer font-medium text-blue-300"
                          onClick={() => {
                            handleSetOrderOption(OrderOption.Twap);
                          }}
                        >
                          <Trans>Use a TWAP order</Trans>
                        </span>{" "}
                        <Trans> for lower net price impact.</Trans>
                      </span>
                    </div>
                  </ColorfulBanner>
                )}
                <div className="flex flex-col gap-2">
                  {/* Show Close amount input - required for all modes including x10000 TP/SL */}
                  <BuyInputSection
                    topLeftLabel={t`Close`}
                    inputValue={closeUsdInputValue}
                    onInputValueChange={(e) => setCloseUsdInputValue(e.target.value)}
                    bottomLeftValue={formatUsd(closeSizeUsd)}
                    bottomRightLabel={t`Max`}
                    bottomRightValue={formatUsd(maxCloseSize)}
                    onClickMax={
                      maxCloseSize > 0 && closeSizeUsd !== maxCloseSize
                        ? () => setCloseUsdInputValueRaw(formatAmountFree(maxCloseSize, USD_DECIMALS))
                        : undefined
                    }
                    showPercentSelector
                    onPercentChange={(percentage) => {
                      const formattedAmount = formatAmountFree(
                        (maxCloseSize * BigInt(percentage)) / 100n,
                        USD_DECIMALS,
                        2
                      );
                      setCloseUsdInputValueRaw(formattedAmount);
                    }}
                    qa="amount-input"
                  >
                    USD
                  </BuyInputSection>
                  {isTrigger && !isX10000Mode && (
                    <BuyInputSection
                      topLeftLabel={t`Trigger Price`}
                      topRightLabel={t`Mark`}
                      topRightValue={formatUsd(markPrice, {
                        displayDecimals: 5,
                        visualMultiplier: toToken?.visualMultiplier,
                      })}
                      onClickTopRightLabel={() => {
                        setTriggerPriceInputValueRaw(
                          formatAmount(
                            markPrice,
                            USD_DECIMALS,
                            5,
                            undefined,
                            undefined,
                            toToken?.visualMultiplier
                          )
                        );
                      }}
                      inputValue={triggerPriceInputValue}
                      onInputValueChange={(e) => {
                        setTriggerPriceInputValue(e.target.value);
                      }}
                      qa="trigger-input"
                    >
                      USD
                    </BuyInputSection>
                  )}
                  {/* x10000 mode: Show TP and SL inputs separately */}
                  {isTrigger && isX10000Mode && (
                    <>
                      <BuyInputSection
                        topLeftLabel={t`Take Profit Price`}
                        topRightLabel={t`Mark`}
                        topRightValue={formatUsd(markPrice, {
                          displayDecimals: 5,
                          visualMultiplier: toToken?.visualMultiplier,
                        })}
                        onClickTopRightLabel={() => {
                          const formattedPrice = formatAmount(
                            markPrice,
                            USD_DECIMALS,
                            5,
                            undefined,
                            undefined,
                            toToken?.visualMultiplier
                          );
                          setTakeProfitPrice(formattedPrice);
                        }}
                        inputValue={takeProfitPrice}
                        onInputValueChange={(e) => setTakeProfitPrice(e.target.value)}
                        qa="take-profit-input"
                      >
                        USD
                      </BuyInputSection>
                      <BuyInputSection
                        topLeftLabel={t`Stop Loss Price`}
                        topRightLabel={t`Mark`}
                        topRightValue={formatUsd(markPrice, {
                          displayDecimals: 5,
                          visualMultiplier: toToken?.visualMultiplier,
                        })}
                        onClickTopRightLabel={() => {
                          const formattedPrice = formatAmount(
                            markPrice,
                            USD_DECIMALS,
                            5,
                            undefined,
                            undefined,
                            toToken?.visualMultiplier
                          );
                          setStopLossPrice(formattedPrice);
                        }}
                        inputValue={stopLossPrice}
                        onInputValueChange={(e) => setStopLossPrice(e.target.value)}
                        qa="stop-loss-input"
                      >
                        USD
                      </BuyInputSection>
                    </>
                  )}
                </div>
              </div>

              {isTwap && (
                <div className="pt-14">
                  <TwapRows
                    duration={duration}
                    numberOfParts={numberOfParts}
                    setNumberOfParts={setNumberOfParts}
                    setDuration={setDuration}
                    isLong={position.isLong}
                    sizeUsd={decreaseAmounts?.sizeDeltaUsd}
                    marketInfo={position.marketInfo}
                    type="decrease"
                  />
                </div>
              )}

              <div className="flex w-full flex-col gap-14 pt-14">
                {isTrigger && maxAutoCancelOrdersWarning}
                <HighPriceImpactOrFeesWarningCard
                  priceImpactWarningState={priceImpactWarningState}
                  swapPriceImpact={fees?.swapPriceImpact}
                  swapProfitFee={fees?.swapProfitFee}
                  executionFeeUsd={isX10000Mode ? undefined : executionFee?.feeUsd}
                />

                {!isTwap && (
                  <ToggleSwitch
                    textClassName="text-typography-secondary"
                    isChecked={leverageCheckboxDisabledByCollateral ? false : keepLeverageChecked}
                    setIsChecked={setKeepLeverage}
                    disabled={leverageCheckboxDisabledByCollateral || decreaseAmounts?.isFullClose}
                  >
                    {keepLeverageTextElem}
                  </ToggleSwitch>
                )}

                <Button
                  className="w-full"
                  variant="primary-action"
                  disabled={buttonState.disabled}
                  onClick={onSubmit}
                  buttonRef={submitButtonRef}
                  qa="confirm-button"
                >
                  {buttonState.text}
                </Button>

                {!isX10000Mode && (
                  <ExpressTradingWarningCard
                    expressParams={expressParams}
                    payTokenAddress={undefined}
                    isWrapOrUnwrap={false}
                    isGmxAccount={srcChainId !== undefined}
                  />
                )}

                {!isTwap && (
                  <>
                    {receiveTokenRow}
                    {!isX10000Mode && liqPriceRow}
                    {pnlRow}
                  </>
                )}

                <PositionSellerAdvancedRows
                  triggerPriceInputValue={triggerPriceInputValue}
                  slippageInputId={slippageInputId}
                  gasPaymentParams={isX10000Mode ? undefined : expressParams?.gasPaymentParams}
                  isX10000Mode={isX10000Mode}
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
