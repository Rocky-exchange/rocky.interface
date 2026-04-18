import { Trans, t } from "@lingui/macro";
import cx from "classnames";
import { useCallback, useMemo } from "react";

import { formatDateTime } from "lib/dates";

import { USD_DECIMALS } from "config/factors";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import { useEditingOrderState } from "context/SyntheticsStateContext/hooks/orderEditorHooks";
import { useOrderErrors } from "context/SyntheticsStateContext/hooks/orderHooks";
import {
  selectChainId,
  selectMarketsInfoData,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectTradeboxSelectedOrderKey } from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { getMarketIndexName, getMarketPoolName } from "domain/synthetics/markets";
import {
  OrderInfo,
  PositionOrderInfo,
  SwapOrderInfo,
  TwapOrderInfo,
  getOrderTradeboxKey,
  isDecreaseOrderType,
  isIncreaseOrderType,
  isLimitOrderType,
  isMarketOrderType,
  isStopIncreaseOrderType,
  isStopLossOrderType,
  isSwapOrderType,
  isTwapOrder,
} from "domain/synthetics/orders";
import { PositionsInfoData, getNameByOrderType } from "domain/synthetics/positions";
import { adaptToV1TokenInfo, convertToTokenAmount, convertToUsd } from "domain/synthetics/tokens";
import { getMarkPrice } from "domain/synthetics/trade";
import { TokensRatioAndSlippage } from "domain/tokens";
import { getExchangeRate, getExchangeRateDisplay } from "lib/legacy";
import { calculateDisplayDecimals, formatAmount, formatBalanceAmount, formatUsd } from "lib/numbers";
import { getWrappedToken } from "sdk/configs/tokens";
import { shouldUseApiOrders, useApiOrders } from "@/modules/cex/lib/api";
import { useAccount } from "wagmi";

import { AppCard, AppCardSection } from "components/AppCard/AppCard";
import Button from "components/Button/Button";
import Checkbox from "components/Checkbox/Checkbox";
import { MarketWithDirectionLabel } from "components/MarketWithDirectionLabel/MarketWithDirectionLabel";
import StatsTooltipRow from "components/StatsTooltip/StatsTooltipRow";
import { SwapMarketLabel } from "components/SwapMarketLabel/SwapMarketLabel";
import { TableTd, TableTr } from "components/Table/Table";
import TokenIcon from "components/TokenIcon/TokenIcon";
import TooltipWithPortal from "components/Tooltip/TooltipWithPortal";

import TwapOrdersList from "./TwapOrdersList/TwapOrdersList";
import { getSwapPathMarketFullNames, getSwapPathTokenSymbols } from "../TradeHistory/TradeHistoryRow/utils/swap";

import "./OrderItem.scss";

type Props = {
  order: OrderInfo;
  onToggleOrder?: () => void;
  onCancelOrder?: () => void;
  isSelected?: boolean;
  isCanceling?: boolean;
  hideActions?: boolean;
  isLarge: boolean;
  positionsInfoData?: PositionsInfoData;
  setRef?: (el: HTMLElement | null, orderKey: string) => void;
  onSelectOrderClick: () => void | undefined;
};

export function OrderItem(p: Props) {
  const { showDebugValues, isSetAcceptablePriceImpactEnabled } = useSettings();

  const [, setEditingOrderState] = useEditingOrderState();

  const setEditingOrderKey = useCallback(() => {
    setEditingOrderState({ orderKey: p.order.key, source: "PositionsList" });
  }, [p.order.key, setEditingOrderState]);

  const isCurrentMarket = useSelector(selectTradeboxSelectedOrderKey) === getOrderTradeboxKey(p.order);

  return p.isLarge ? (
    <OrderItemLarge
      order={p.order}
      hideActions={p.hideActions}
      showDebugValues={showDebugValues}
      isSetAcceptablePriceImpactEnabled={isSetAcceptablePriceImpactEnabled}
      onToggleOrder={p.onToggleOrder}
      setEditingOrderKey={setEditingOrderKey}
      onCancelOrder={p.onCancelOrder}
      isCanceling={p.isCanceling}
      isSelected={p.isSelected}
      setRef={p.setRef}
      isCurrentMarket={isCurrentMarket}
      onSelectOrderClick={p.onSelectOrderClick}
    />
  ) : (
    <OrderItemSmall
      order={p.order}
      isSetAcceptablePriceImpactEnabled={isSetAcceptablePriceImpactEnabled}
      showDebugValues={showDebugValues}
      hideActions={p.hideActions}
      onCancelOrder={p.onCancelOrder}
      isCanceling={p.isCanceling}
      setEditingOrderKey={setEditingOrderKey}
      isSelected={p.isSelected}
      onToggleOrder={p.onToggleOrder}
      setRef={p.setRef}
      isCurrentMarket={isCurrentMarket}
      onSelectOrderClick={p.onSelectOrderClick}
    />
  );
}

function OrderLeverage({ order }: { order: OrderInfo }) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  const leverage = isX10000Mode && originalApiOrder ? (originalApiOrder as any).leverage : undefined;

  if (!leverage) return <span className="text-typography-secondary">-</span>;

  return <span className="numbers">{leverage}x</span>;
}

function OrderSize({
  order,
  showDebugValues,
  className,
}: {
  order: OrderInfo;
  showDebugValues: boolean | undefined;
  className?: string;
}) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  if (isSwapOrderType(order.orderType)) {
    if (showDebugValues) {
      return (
        <TooltipWithPortal
          variant="none"
          handle={<SizeWithIcon order={order} className={className} />}
          position="bottom-start"
          content={
            <>
              <StatsTooltipRow
                label={"Key"}
                value={<div className="debug-key muted">{order.key}</div>}
                showDollar={false}
              />
              <StatsTooltipRow
                label={"Amount"}
                value={<div className="debug-key muted">{order.minOutputAmount.toString()}</div>}
                showDollar={false}
              />
            </>
          }
        />
      );
    }

    return <SizeWithIcon order={order} className={className} />;
  }

  const positionOrder = order as PositionOrderInfo;
  const isCollateralSwap =
    positionOrder.shouldUnwrapNativeToken ||
    positionOrder.initialCollateralToken.address !== positionOrder.targetCollateralToken.address;

  const wrappedToken = getWrappedToken(chainId);

  function getCollateralLabel() {
    if (isDecreaseOrderType(positionOrder.orderType)) {
      return t`Collateral Delta`;
    }
    return t`Collateral`;
  }

  function getCollateralText() {
    // In x10000 mode, show USDT as collateral
    // API's size/amount field already represents USDT value
    if (isX10000Mode && originalApiOrder) {
      const sizeStr = (originalApiOrder as any).size || (originalApiOrder as any).amount || "0";
      const sizeNum = parseFloat(sizeStr);
      return `${sizeNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
    }

    const collateralUsd = convertToUsd(
      positionOrder.initialCollateralDeltaAmount,
      positionOrder.initialCollateralToken.decimals,
      positionOrder.initialCollateralToken.prices.minPrice
    )!;

    const targetCollateralAmount = convertToTokenAmount(
      collateralUsd,
      positionOrder.targetCollateralToken.decimals,
      positionOrder.targetCollateralToken.prices.minPrice
    )!;

    const decreaseMultiplier = isDecreaseOrderType(positionOrder.orderType) ? -1n : 1n;

    const signedTargetCollateralAmount = targetCollateralAmount * decreaseMultiplier;

    const tokenAmountText = formatBalanceAmount(
      signedTargetCollateralAmount,
      positionOrder.targetCollateralToken.decimals,
      positionOrder.targetCollateralToken.isNative ? wrappedToken.symbol : positionOrder.targetCollateralToken.symbol,
      { isStable: positionOrder.targetCollateralToken.isStable }
    );

    return `${tokenAmountText}`;
  }

  return (
    <TooltipWithPortal
      handle={<SizeWithIcon order={order} className={className} />}
      position="bottom-start"
      tooltipClassName={isTwapOrder(order) ? "!p-0" : undefined}
      maxAllowedWidth={400}
      variant="none"
      content={
        isTwapOrder(order) ? (
          <TwapOrdersList order={order} />
        ) : (
          <>
            <StatsTooltipRow label={getCollateralLabel()} value={getCollateralText()} showDollar={false} />

            {isCollateralSwap && (
              <div className="OrderItem-tooltip-row">
                <Trans>
                  {formatBalanceAmount(
                    positionOrder.initialCollateralDeltaAmount,
                    positionOrder.initialCollateralToken.decimals,
                    positionOrder.initialCollateralToken[
                      positionOrder.shouldUnwrapNativeToken ? "baseSymbol" : "symbol"
                    ],
                    { isStable: positionOrder.initialCollateralToken.isStable }
                  )}{" "}
                  will be swapped to{" "}
                  {positionOrder.targetCollateralToken.isNative
                    ? wrappedToken.symbol
                    : positionOrder.targetCollateralToken.symbol}{" "}
                  on order execution.
                </Trans>
              </div>
            )}

            {showDebugValues && (
              <div className="OrderItem-tooltip-row">
                <StatsTooltipRow
                  label={"Key"}
                  value={<div className="debug-key muted">{positionOrder.key}</div>}
                  showDollar={false}
                />
              </div>
            )}
          </>
        )
      }
    />
  );
}

export function TwapOrderProgress({ order, className }: { order: TwapOrderInfo; className?: string }) {
  const content = ` (${order.numberOfParts - order.orders.length}/${order.numberOfParts})`;
  return <span className={className}>{content}</span>;
}

export function SizeWithIcon({ order, className }: { order: OrderInfo; className?: string }) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  if (isSwapOrderType(order.orderType)) {
    const { initialCollateralToken, targetCollateralToken, minOutputAmount, initialCollateralDeltaAmount } = order;

    const fromTokenText = formatBalanceAmount(
      initialCollateralDeltaAmount,
      initialCollateralToken.decimals,
      undefined,
      {
        isStable: initialCollateralToken.isStable,
      }
    );
    const fromTokenIcon = <TokenIcon symbol={initialCollateralToken.symbol} displaySize={18} />;

    const toTokenText = formatBalanceAmount(minOutputAmount, targetCollateralToken.decimals, undefined, {
      isStable: targetCollateralToken.isStable,
    });
    const toTokenIcon = <TokenIcon symbol={targetCollateralToken.symbol} displaySize={18} />;

    const handle = (
      <span className={className}>
        <Trans>
          <span>{fromTokenText} </span>
          {fromTokenIcon}
          <span> to </span>
          {isTwapOrder(order) ? null : <span>{toTokenText} </span>}
          {toTokenIcon}
          {isTwapOrder(order) ? (
            <TwapOrderProgress order={order} className="font-normal text-typography-secondary" />
          ) : null}
        </Trans>
      </span>
    );

    return (
      <div className={cx("inline-flex flex-wrap gap-y-8 whitespace-pre-wrap")}>
        {isTwapOrder(order) ? (
          <TooltipWithPortal
            handle={handle}
            position="bottom-start"
            content={<TwapOrdersList order={order} />}
            tooltipClassName="!p-0"
            maxAllowedWidth={450}
            variant="none"
          />
        ) : (
          handle
        )}
      </div>
    );
  }

  const { sizeDeltaUsd } = order;

  // In x10000 mode, display USDT amount directly from API
  // API returns "amount" field for regular orders and "size" field for trigger orders
  // Both fields represent USDT value, not token quantity
  let sizeText: string;
  if (isX10000Mode && originalApiOrder) {
    // API may return "size" (for trigger orders) or "amount" (for regular orders)
    const sizeStr = (originalApiOrder as any).size || (originalApiOrder as any).amount || "0";
    const sizeNum = parseFloat(sizeStr);

    sizeText = `${sizeNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  } else {
    sizeText = formatUsd(sizeDeltaUsd * (isIncreaseOrderType(order.orderType) ? 1n : -1n), {
      displayPlus: true,
    }) || "";
  }

  return (
    <span className={className}>
      {sizeText} {isTwapOrder(order) && <TwapOrderProgress order={order} className="text-typography-secondary" />}
    </span>
  );
}

function OrderStatus({ order, className }: { order: OrderInfo; className?: string }) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  // In x10000 mode, show status from API order
  if (isX10000Mode && originalApiOrder) {
    const status = originalApiOrder.status;
    const statusTextMap: Record<string, string> = {
      filled: t`Filled`,
      cancelled: t`Cancelled`,
      rejected: t`Rejected`,
      expired: t`Expired`,
      pending: t`Pending`,
      open: t`Open`,
      partially_filled: t`Partially Filled`,
    };
    const statusText = statusTextMap[status] || status;

    // Color coding for different statuses
    const statusColors: Record<string, string> = {
      filled: "text-green-400",
      cancelled: "text-gray-400",
      rejected: "text-red-400",
      expired: "text-yellow-400",
      pending: "text-blue-400",
      open: "text-white",
      partially_filled: "text-blue-300",
    };

    return (
      <span className={cx(className, statusColors[status] || "text-white")}>
        {statusText}
      </span>
    );
  }

  // For non-x10000 mode or when API order not found, show default
  return (
    <span className={className}>
      <Trans>Open</Trans>
    </span>
  );
}

function OrderTime({ order, className }: { order: OrderInfo; className?: string }) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  // Get updated_at/created_at from API order or fallback to order.updatedAtTime
  const timeValue = useMemo(() => {
    if (isX10000Mode && originalApiOrder) {
      // Try updated_at first, then created_at
      const timestamp = (originalApiOrder as any).updated_at || (originalApiOrder as any).created_at;
      if (timestamp) {
        // Check if it's an ISO string (contains 'T' or '-')
        if (typeof timestamp === 'string' && (timestamp.includes('T') || timestamp.includes('-'))) {
          // Parse ISO string to Unix timestamp in seconds
          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            return Math.floor(date.getTime() / 1000);
          }
        } else {
          // If it's a number, assume it's Unix timestamp
          const ts = Number(timestamp);
          if (!isNaN(ts)) {
            // If timestamp is > 10^12, it's in milliseconds, convert to seconds
            return ts > 1e12 ? Math.floor(ts / 1000) : ts;
          }
        }
      }
    }
    // Fallback to SDK order's updatedAtTime (bigint, already in seconds)
    if (order.updatedAtTime) {
      return Number(order.updatedAtTime);
    }
    return undefined;
  }, [isX10000Mode, originalApiOrder, order.updatedAtTime]);

  if (!timeValue) {
    return (
      <span className={className}>
        <Trans>-</Trans>
      </span>
    );
  }

  return (
    <span className={cx(className, "text-typography-secondary text-12")}>
      {formatDateTime(timeValue)}
    </span>
  );
}

function OrderAction({
  order,
  onCancelOrder,
  isCanceling,
}: {
  order: OrderInfo;
  onCancelOrder: (() => void) | undefined;
  isCanceling: boolean | undefined;
}) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  // Check if order status is "open" or "pending" (both can be cancelled)
  const isCancellable = useMemo(() => {
    if (isX10000Mode) {
      if (!originalApiOrder) return false;
      return originalApiOrder.status === "open" || originalApiOrder.status === "pending";
    }
    // For non-x10000 mode, all orders in the list are considered cancellable
    return true;
  }, [isX10000Mode, originalApiOrder]);

  if (!isCancellable || !onCancelOrder) {
    return null;
  }

  return (
    <Button
      variant="secondary"
      size="small"
      disabled={isCanceling}
      onClick={(e) => {
        e.stopPropagation();
        onCancelOrder();
      }}
    >
      {isCanceling ? <Trans>Canceling...</Trans> : <Trans>Cancel</Trans>}
    </Button>
  );
}

function MarkPrice({ order, className }: { order: OrderInfo; className?: string }) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  // All hooks must be called unconditionally (Rules of Hooks)
  const markPrice = useMemo(() => {
    if (isSwapOrderType(order.orderType)) {
      return undefined;
    }

    const positionOrder = order as PositionOrderInfo;

    return getMarkPrice({
      prices: positionOrder.indexToken.prices,
      isIncrease: isIncreaseOrderType(positionOrder.orderType),
      isLong: positionOrder.isLong,
    });
  }, [order]);

  const positionOrder = order as PositionOrderInfo;
  const priceDecimals = calculateDisplayDecimals(
    positionOrder.indexToken?.prices?.minPrice,
    undefined,
    positionOrder.indexToken?.visualMultiplier
  );

  const markPriceFormatted = useMemo(() => {
    return formatUsd(markPrice, {
      displayDecimals: 5,
      visualMultiplier: positionOrder.indexToken?.visualMultiplier,
    });
  }, [markPrice, priceDecimals, positionOrder.indexToken?.visualMultiplier]);

  // In x10000 mode, use mark_price from API order
  if (isX10000Mode && originalApiOrder) {
    const apiMarkPrice = (originalApiOrder as any).mark_price;

    if (!apiMarkPrice || apiMarkPrice === "" || apiMarkPrice === "0") {
      return (
        <span className={className}>
          <Trans>N/A</Trans>
        </span>
      );
    }

    const markPriceNum = parseFloat(apiMarkPrice);
    if (isNaN(markPriceNum)) {
      return (
        <span className={className}>
          <Trans>N/A</Trans>
        </span>
      );
    }

    const apiMarkPriceFormatted = markPriceNum.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3
    });

    return (
      <span className={className}>
        {apiMarkPriceFormatted}
      </span>
    );
  }

  if (isTwapOrder(order) || isMarketOrderType(order.orderType)) {
    const { markSwapRatioText } = getSwapRatioText(order);

    return (
      <TooltipWithPortal
        handle={
          <span className={className}>{isSwapOrderType(order.orderType) ? markSwapRatioText : markPriceFormatted}</span>
        }
        position="bottom-end"
        content={
          <Trans>
            Note that there may be rare cases where the order cannot be executed, for example, if the chain is down and
            no oracle reports are produced or if there is not enough available liquidity.
          </Trans>
        }
      />
    );
  }

  if (isSwapOrderType(order.orderType)) {
    const { markSwapRatioText } = getSwapRatioText(order);

    return <span>{markSwapRatioText}</span>;
  } else {
    const positionOrder = order as PositionOrderInfo;

    return (
      <TooltipWithPortal
        handle={markPriceFormatted}
        position="bottom-end"
        handleClassName="numbers"
        renderContent={() => {
          return (
            <Trans>
              <p>
                The order will be executed when the oracle price is {positionOrder.triggerThresholdType}{" "}
                {formatUsd(positionOrder.triggerPrice, {
                  displayDecimals: priceDecimals,
                  visualMultiplier: positionOrder.indexToken?.visualMultiplier,
                })}
                .
              </p>
              <br />
              <p>
                Note that there may be rare cases where the order cannot be executed, for example, if the chain is down
                and no oracle reports are produced or if the price impact exceeds your acceptable price.
              </p>
            </Trans>
          );
        }}
      />
    );
  }
}

function TriggerPrice({
  order,
  hideActions,
  isSetAcceptablePriceImpactEnabled,
  className,
}: {
  order: OrderInfo;
  hideActions: boolean | undefined;
  isSetAcceptablePriceImpactEnabled: boolean;
  className?: string;
}) {
  const chainId = useSelector(selectChainId);
  const { address } = useAccount();
  const isX10000Mode = shouldUseApiOrders();
  const { apiOrders } = useApiOrders(chainId, address);

  // Find original API order for x10000 mode
  const originalApiOrder = useMemo(() => {
    if (!isX10000Mode || !apiOrders || !order.originalOrderId) return undefined;
    return apiOrders.find((o) => o.id === order.originalOrderId);
  }, [isX10000Mode, apiOrders, order.originalOrderId]);

  if (isTwapOrder(order)) {
    return (
      <span className={className}>
        <Trans>N/A</Trans>
      </span>
    );
  }

  if (isMarketOrderType(order.orderType)) {
    const positionOrder = order as PositionOrderInfo;
    const priceDecimals = calculateDisplayDecimals(
      positionOrder?.indexToken?.prices?.minPrice,
      undefined,
      positionOrder?.indexToken?.visualMultiplier
    );

    // For filled market orders, show the execution price from API
    if (isX10000Mode && originalApiOrder && originalApiOrder.status === "filled" && originalApiOrder.price) {
      const priceStr = originalApiOrder.price;
      const priceNum = parseFloat(priceStr);
      const executionPriceText = priceNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
      
      return (
        <span className={className}>
          {executionPriceText}
        </span>
      );
    }

    const handle = (
      <span className="font-medium">
        <Trans>N/A</Trans>
      </span>
    );

    return !isSetAcceptablePriceImpactEnabled ? (
      handle
    ) : (
      <TooltipWithPortal
        position="bottom-end"
        handle={handle}
        content={
          <StatsTooltipRow
            label={t`Acceptable Price`}
            value={formatUsd(positionOrder.acceptablePrice, {
              displayDecimals: priceDecimals,
              visualMultiplier: positionOrder.indexToken?.visualMultiplier,
            })}
            showDollar={false}
          />
        }
      />
    );
  }

  if (isSwapOrderType(order.orderType)) {
    const swapOrder = order as SwapOrderInfo;
    const toAmount = swapOrder.minOutputAmount;
    const toToken = order.targetCollateralToken;
    const toAmountText = formatBalanceAmount(toAmount, toToken.decimals, toToken.symbol, {
      isStable: toToken.isStable,
    });
    const { swapRatioText, acceptablePriceText } = getSwapRatioText(order);

    return (
      <>
        {!hideActions ? (
          <TooltipWithPortal
            position="bottom-end"
            handle={swapRatioText}
            handleClassName="numbers"
            renderContent={() => (
              <>
                {isSetAcceptablePriceImpactEnabled && (
                  <div className="pb-8">
                    <StatsTooltipRow label={t`Acceptable Price`} value={acceptablePriceText} showDollar={false} />
                  </div>
                )}
                {t`You will receive at least ${toAmountText} if this order is executed. This price is being updated in real time based on swap fees and price impact.`}
              </>
            )}
          />
        ) : (
          swapRatioText
        )}
      </>
    );
  } else {
    const positionOrder = order as PositionOrderInfo;
    const priceDecimals = calculateDisplayDecimals(
      positionOrder?.indexToken?.prices?.minPrice,
      undefined,
      positionOrder?.indexToken?.visualMultiplier
    );

    // In x10000 mode, use raw API trigger price directly
    let triggerPriceText: string;
    if (isX10000Mode && originalApiOrder) {
      // For limit orders, use "price" field; for TP/SL orders, use "trigger_price" field
      const priceStr = originalApiOrder.trigger_price || originalApiOrder.price;
      if (priceStr) {
        const priceNum = parseFloat(priceStr);
        triggerPriceText = priceNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
      } else {
        triggerPriceText = formatUsd(positionOrder.triggerPrice, {
          displayDecimals: priceDecimals,
          visualMultiplier: positionOrder.indexToken?.visualMultiplier,
        }) || "...";
      }
    } else {
      triggerPriceText = formatUsd(positionOrder.triggerPrice, {
        displayDecimals: priceDecimals,
        visualMultiplier: positionOrder.indexToken?.visualMultiplier,
      }) || "...";
    }

    const handle = (
      <span>
        {positionOrder.triggerThresholdType}{" "}
        {triggerPriceText}
      </span>
    );
    return !isSetAcceptablePriceImpactEnabled ? (
      handle
    ) : (
      <TooltipWithPortal
        handle={handle}
        position="bottom-end"
        renderContent={() => (
          <StatsTooltipRow
            label={t`Acceptable Price`}
            value={
              isStopLossOrderType(positionOrder.orderType) || isStopIncreaseOrderType(positionOrder.orderType)
                ? "NA"
                : `${positionOrder.triggerThresholdType} ${formatUsd(positionOrder.acceptablePrice, {
                    displayDecimals: priceDecimals,
                    visualMultiplier: positionOrder.indexToken?.visualMultiplier,
                  })}`
            }
            showDollar={false}
          />
        )}
      />
    );
  }
}

function OrderItemLarge({
  order,
  setRef,
  hideActions,
  onToggleOrder,
  showDebugValues,
  isSetAcceptablePriceImpactEnabled,
  setEditingOrderKey,
  onCancelOrder,
  isCanceling,
  isSelected,
  isCurrentMarket,
  onSelectOrderClick,
}: {
  order: OrderInfo;
  setRef?: (el: HTMLElement | null, orderKey: string) => void;
  hideActions: boolean | undefined;
  showDebugValues: boolean | undefined;
  isSetAcceptablePriceImpactEnabled: boolean;
  onToggleOrder: undefined | (() => void);
  setEditingOrderKey: undefined | (() => void);
  onCancelOrder: undefined | (() => void);
  isCanceling: boolean | undefined;
  isSelected: boolean | undefined;
  isCurrentMarket: boolean | undefined;
  onSelectOrderClick: undefined | (() => void);
}) {
  const marketInfoData = useSelector(selectMarketsInfoData);
  const isSwap = isSwapOrderType(order.orderType);
  const { indexName, poolName, tokenSymbol } = useMemo(() => {
    const marketInfo = marketInfoData?.[order.marketAddress];

    if (!marketInfo || isSwap)
      return {
        indexName: "...",
        tokenSymbol: "...",
      };
    return {
      indexName: getMarketIndexName(marketInfo),
      poolName: getMarketPoolName(marketInfo),
      tokenSymbol: marketInfo.indexToken.symbol,
    };
  }, [isSwap, marketInfoData, order.marketAddress]);

  const { swapPathTokenSymbols, swapPathMarketFullNames } = useMemo(() => {
    if (!isSwap) return {};
    const swapPathTokenSymbols = getSwapPathTokenSymbols(marketInfoData, order.initialCollateralToken, order.swapPath);
    const swapPathMarketFullNames = getSwapPathMarketFullNames(marketInfoData, order.swapPath);
    return { swapPathTokenSymbols, swapPathMarketFullNames };
  }, [isSwap, marketInfoData, order.initialCollateralToken, order.swapPath]);

  const handleSetRef = useCallback(
    (el: HTMLElement | null) => {
      if (setRef) setRef(el, order.key);
    },
    [order.key, setRef]
  );

  return (
    <TableTr
      hoverable={true}
      ref={handleSetRef}
      className={cx({
        "shadow-[inset_2px_0_0] shadow-cold-blue-500": isCurrentMarket,
      })}
    >
      {!hideActions && onToggleOrder && (
        <TableTd className="cursor-pointer" onClick={onToggleOrder}>
          <Checkbox isChecked={isSelected} setIsChecked={onToggleOrder} />
        </TableTd>
      )}
      <TableTd onClick={onSelectOrderClick} className="cursor-pointer">
        {isSwap ? (
          <TooltipWithPortal
            handle={
              <SwapMarketLabel
                bordered
                fromSymbol={swapPathTokenSymbols?.at(0)}
                toSymbol={swapPathTokenSymbols?.at(-1)}
              />
            }
            content={
              <>
                {swapPathMarketFullNames?.map((market, index) => (
                  <span key={market.indexName}>
                    {index > 0 && " → "}
                    <span>{market.indexName}</span>
                    <span className="subtext leading-1">[{market.poolName}]</span>
                  </span>
                ))}
              </>
            }
            variant="none"
          />
        ) : (
          <TooltipWithPortal
            handle={
              <MarketWithDirectionLabel
                bordered
                indexName={indexName}
                isLong={order.isLong}
                tokenSymbol={tokenSymbol}
              />
            }
            content={
              <StatsTooltipRow
                label={t`Market`}
                value={
                  <div className="flex items-center">
                    <span>{indexName && indexName}</span>
                    <span className="subtext leading-1">{poolName && `[${poolName}]`}</span>
                  </div>
                }
                showDollar={false}
              />
            }
            variant="none"
          />
        )}
      </TableTd>
      <TableTd>
        <OrderItemTypeLabel order={order} />
      </TableTd>
      <TableTd>
        <OrderSize order={order} showDebugValues={showDebugValues} />
      </TableTd>
      <TableTd>
        <OrderLeverage order={order} />
      </TableTd>

      <TableTd>
        <TriggerPrice
          order={order}
          hideActions={hideActions}
          isSetAcceptablePriceImpactEnabled={isSetAcceptablePriceImpactEnabled}
        />
      </TableTd>
      <TableTd>
        <MarkPrice order={order} />
      </TableTd>
      <TableTd>
        <OrderStatus order={order} />
      </TableTd>
      <TableTd>
        <OrderTime order={order} />
      </TableTd>
      <TableTd className="!text-center">
        <OrderAction order={order} onCancelOrder={onCancelOrder} isCanceling={isCanceling} />
      </TableTd>
    </TableTr>
  );
}

function OrderItemSmall({
  showDebugValues,
  order,
  isSetAcceptablePriceImpactEnabled,
  setEditingOrderKey,
  onCancelOrder,
  isCanceling,
  hideActions,
  isSelected,
  onToggleOrder,
  setRef,
  isCurrentMarket,
  onSelectOrderClick,
}: {
  showDebugValues: boolean;
  order: OrderInfo;
  isSetAcceptablePriceImpactEnabled: boolean;
  hideActions: boolean | undefined;
  setEditingOrderKey: undefined | (() => void);
  onCancelOrder: undefined | (() => void);
  isCanceling: boolean | undefined;
  isSelected: boolean | undefined;
  onToggleOrder: undefined | (() => void);
  setRef?: (el: HTMLElement | null, orderKey: string) => void;
  isCurrentMarket: boolean | undefined;
  onSelectOrderClick: undefined | (() => void);
}) {
  const marketInfoData = useSelector(selectMarketsInfoData);

  const title = useMemo(() => {
    if (isSwapOrderType(order.orderType)) {
      const swapPathTokenSymbols = getSwapPathTokenSymbols(
        marketInfoData,
        order.initialCollateralToken,
        order.swapPath
      );

      return <SwapMarketLabel fromSymbol={swapPathTokenSymbols?.at(0)} toSymbol={swapPathTokenSymbols?.at(-1)} />;
    }

    const marketInfo = marketInfoData?.[order.marketAddress];

    if (!marketInfo) {
      return "...";
    }

    const indexName = getMarketIndexName(marketInfo);

    const tokenSymbol = marketInfoData?.[order.marketAddress]?.indexToken.symbol;

    return <MarketWithDirectionLabel isLong={order.isLong} indexName={indexName} tokenSymbol={tokenSymbol} />;
  }, [
    marketInfoData,
    order.initialCollateralToken,
    order.isLong,
    order.marketAddress,
    order.orderType,
    order.swapPath,
  ]);

  const handleSetRef = useCallback(
    (el: HTMLElement | null) => {
      if (setRef) setRef(el, order.key);
    },
    [order.key, setRef]
  );

  return (
    <AppCard ref={handleSetRef}>
      <AppCardSection
        className={cx("relative", {
          "after:absolute after:left-10 after:top-[50%] after:h-16 after:w-2 after:-translate-y-[50%] after:bg-blue-300":
            isCurrentMarket,
        })}
      >
        <div className="flex cursor-pointer items-center gap-8" onClick={onSelectOrderClick}>
          {hideActions ? (
            title
          ) : (
            <>
              <Checkbox isChecked={isSelected} setIsChecked={onToggleOrder}></Checkbox>
              {title}
            </>
          )}
        </div>
      </AppCardSection>
      <AppCardSection>
        {showDebugValues && (
          <div className="App-card-row">
            <div className="font-medium text-typography-secondary">Key</div>
            <div className="debug-key muted">{order.key}</div>
          </div>
        )}
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Order Type</Trans>
          </div>
          <div>
            <OrderItemTypeLabel order={order} />
          </div>
        </div>
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Size</Trans>
          </div>
          <OrderSize order={order} showDebugValues={showDebugValues} />
        </div>
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Trigger Price</Trans>
          </div>
          <div>
            <TriggerPrice
              order={order}
              hideActions={hideActions}
              isSetAcceptablePriceImpactEnabled={isSetAcceptablePriceImpactEnabled}
            />
          </div>
        </div>

        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Mark Price</Trans>
          </div>
          <div>
            <MarkPrice order={order} />
          </div>
        </div>
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Status</Trans>
          </div>
          <div>
            <OrderStatus order={order} />
          </div>
        </div>
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Time</Trans>
          </div>
          <div>
            <OrderTime order={order} />
          </div>
        </div>
        <div className="App-card-row">
          <div className="font-medium text-typography-secondary">
            <Trans>Action</Trans>
          </div>
          <div>
            <OrderAction order={order} onCancelOrder={onCancelOrder} isCanceling={isCanceling} />
          </div>
        </div>
      </AppCardSection>
    </AppCard>
  );
}

function getSwapRatioText(order: OrderInfo) {
  if (!isLimitOrderType(order.orderType) && !isMarketOrderType(order.orderType)) return {};

  const fromToken = order.initialCollateralToken;
  const toToken = order.targetCollateralToken;

  const fromTokenInfo = fromToken ? adaptToV1TokenInfo(fromToken) : undefined;
  const toTokenInfo = toToken ? adaptToV1TokenInfo(toToken) : undefined;

  const triggerRatio = (order as SwapOrderInfo).triggerRatio as TokensRatioAndSlippage;

  const markExchangeRate =
    fromToken && toToken
      ? getExchangeRate(adaptToV1TokenInfo(fromToken), adaptToV1TokenInfo(toToken), false)
      : undefined;

  const ratioDecimals = calculateDisplayDecimals(triggerRatio?.ratio);

  const sign = triggerRatio?.smallestToken.address === fromToken.address ? "<" : ">";

  const swapRatioText = `${sign} ${formatAmount(
    triggerRatio?.ratio,
    USD_DECIMALS,
    ratioDecimals,
    true
  )} ${triggerRatio?.smallestToken.symbol} / ${triggerRatio?.largestToken.symbol}`;

  const markSwapRatioText = getExchangeRateDisplay(markExchangeRate, fromTokenInfo, toTokenInfo);

  const acceptablePriceText = `${sign} ${formatAmount(triggerRatio?.acceptablePrice, USD_DECIMALS, 2, true)} ${triggerRatio?.smallestToken.symbol} / ${triggerRatio?.largestToken.symbol}`;

  return { swapRatioText, markSwapRatioText, acceptablePriceText };
}

function OrderItemTypeLabel({ order, className }: { order: OrderInfo; className?: string }) {
  const { errors, level } = useOrderErrors(order.key);

  const handle = <span className={className}>{getNameByOrderType(order.orderType, order.isTwap)}</span>;

  if (errors.length === 0) {
    return <>{handle}</>;
  }

  return (
    <TooltipWithPortal
      variant="none"
      handle={
        <span
          className={cx("cursor-help underline decoration-dashed decoration-1 underline-offset-2", {
            "text-red-500 decoration-red-500/50": level === "error",
            "text-yellow-300 decoration-yellow-300/50": level === "warning",
          })}
        >
          {handle}
        </span>
      }
      content={
        errors.length ? (
          <div className="flex flex-col gap-20">
            {errors.map((error) => (
              <div key={error.key}>
                <span
                  className={cx({
                    "text-red-500": error!.level === "error",
                    "text-yellow-300": error!.level === "warning",
                  })}
                >
                  {error.msg}
                </span>
              </div>
            ))}
          </div>
        ) : null
      }
    />
  );
}
