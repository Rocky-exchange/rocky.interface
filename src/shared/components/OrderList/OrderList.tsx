import { Plural, Trans } from "@lingui/macro";
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef } from "react";

import {
  useIsOrdersLoading,
  useMarketsInfoData,
  usePositionsInfoData,
  useTokensData,
} from "context/SyntheticsStateContext/hooks/globalsHooks";
import { useCancellingOrdersKeysState } from "context/SyntheticsStateContext/hooks/orderEditorHooks";
import {
  selectAccount,
  selectChainId,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectTradeboxAvailableTokensOptions } from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import {
  OrderInfo,
  PositionOrderInfo,
  SwapOrderInfo,
  TwapOrderInfo,
  isLimitOrderType,
  isMarketOrderType,
  isPositionOrder,
  isSwapOrder,
  isTriggerDecreaseOrderType,
  isTwapOrder,
  sortPositionOrders,
  sortSwapOrders,
} from "domain/synthetics/orders";
import { OrderTypeFilterValue } from "domain/synthetics/orders/ordersFilters";
import { useOrdersInfoRequest } from "domain/synthetics/orders/useOrdersInfo";
import { EMPTY_ARRAY } from "lib/objects";
import { useBreakpoints } from "lib/useBreakpoints";
import { ContractsChainId } from "sdk/configs/chains";

// ZTDX API Integration
import { useCancelOrderHandler, shouldUseApiOrders } from "@/modules/cex/lib/api";

import Button from "components/Button/Button";
import Checkbox from "components/Checkbox/Checkbox";
import { EmptyTableContent } from "components/EmptyTableContent/EmptyTableContent";
import { OrderEditorContainer } from "components/OrderEditorContainer/OrderEditorContainer";
import { Table, TableTh, TableTheadTr } from "components/Table/Table";
import { TableScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";

import { OrderItem } from "../OrderItem/OrderItem";
import { MarketFilterLongShort, MarketFilterLongShortItemData } from "../TableMarketFilter/MarketFilterLongShort";
import { OrderTypeFilter } from "./filters/OrderTypeFilter";
import { OrderStatusFilter, OrderStatusFilterValue } from "./filters/OrderStatusFilter";

type Props = {
  hideActions?: boolean;
  setSelectedOrderKeys?: Dispatch<SetStateAction<string[]>>;
  selectedOrdersKeys?: string[];
  selectedPositionOrderKey?: string;
  setSelectedPositionOrderKey?: Dispatch<SetStateAction<string | undefined>>;
  marketsDirectionsFilter: MarketFilterLongShortItemData[];
  setMarketsDirectionsFilter: Dispatch<SetStateAction<MarketFilterLongShortItemData[]>>;
  orderTypesFilter: OrderTypeFilterValue[];
  setOrderTypesFilter: Dispatch<SetStateAction<OrderTypeFilterValue[]>>;
  orderStatusFilter: OrderStatusFilterValue[];
  setOrderStatusFilter: Dispatch<SetStateAction<OrderStatusFilterValue[]>>;
  onCancelSelectedOrders?: () => void;
  onSelectOrderClick: ((key: string) => void) | undefined;
};

export function OrderList({
  selectedOrdersKeys,
  setSelectedOrderKeys,
  selectedPositionOrderKey,
  setSelectedPositionOrderKey,
  marketsDirectionsFilter,
  orderTypesFilter,
  orderStatusFilter,
  setMarketsDirectionsFilter,
  setOrderTypesFilter,
  setOrderStatusFilter,
  hideActions,
  onCancelSelectedOrders,
  onSelectOrderClick,
}: Props) {
  const positionsData = usePositionsInfoData();
  const isLoading = useIsOrdersLoading();

  const { isTablet: isContainerSmall } = useBreakpoints();

  const chainId = useSelector(selectChainId);
  const account = useSelector(selectAccount);
  const [cancellingOrdersKeys, setCancellingOrdersKeys] = useCancellingOrdersKeysState();

  // ZTDX API Cancel Order Handler
  const { cancelSingleOrder } = useCancelOrderHandler();

  const orders = useFilteredOrders({
    chainId,
    account,
    marketsDirectionsFilter: marketsDirectionsFilter,
    orderTypesFilter: orderTypesFilter,
    orderStatusFilter: orderStatusFilter,
  });

  const [onlySomeOrdersSelected, areAllOrdersSelected] = useMemo(() => {
    const onlySomeSelected =
      selectedOrdersKeys && selectedOrdersKeys.length > 0 && selectedOrdersKeys.length < orders.length;
    const allSelected = orders.length > 0 && orders.every((o) => selectedOrdersKeys?.includes(o.key));
    return [onlySomeSelected, allSelected];
  }, [selectedOrdersKeys, orders]);

  const orderRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  useEffect(() => {
    if (selectedPositionOrderKey) {
      const orderElement = orderRefs.current[selectedPositionOrderKey];
      if (orderElement) {
        const rect = orderElement.getBoundingClientRect();
        const isInViewPort =
          rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;

        if (!isInViewPort) {
          orderElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      return () => {
        setSelectedPositionOrderKey?.(undefined);
      };
    }
  }, [selectedPositionOrderKey, setSelectedPositionOrderKey]);

  function onToggleOrder(key: string) {
    setSelectedOrderKeys?.((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }

      return prev.concat(key);
    });
  }

  function onSelectAllOrders() {
    if (areAllOrdersSelected) {
      setSelectedOrderKeys?.(EMPTY_ARRAY);
      return;
    }

    const allSelectedOrders = orders.map((o) => o.key);

    setSelectedOrderKeys?.(allSelectedOrders);
  }

  async function onCancelOrder(order: OrderInfo) {
    const orderKeys = isTwapOrder(order) ? order.orders.map((o) => o.key) : [order.key];

    await cancelSingleOrder(
      order,
      // onStart
      () => setCancellingOrdersKeys((prev) => [...prev, ...orderKeys]),
      // onComplete
      () => {
        setCancellingOrdersKeys((prev) => prev.filter((k) => !orderKeys.includes(k)));
        setSelectedOrderKeys?.(EMPTY_ARRAY);
      }
    );
  }

  const handleSetRef = useCallback((el: HTMLElement | null, orderKey: string) => {
    if (el === null) {
      delete orderRefs.current[orderKey];
    } else {
      orderRefs.current[orderKey] = el;
    }
  }, []);

  return (
    <div className="flex grow flex-col">
      {isContainerSmall && !isLoading && (
        <div className="flex grow flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-8">
            {isContainerSmall ? (
              <div className="flex gap-8">
                <Button variant="secondary" onClick={onSelectAllOrders}>
                  <Checkbox
                    isPartialChecked={onlySomeOrdersSelected}
                    isChecked={areAllOrdersSelected}
                    setIsChecked={onSelectAllOrders}
                  ></Checkbox>
                </Button>
                <MarketFilterLongShort
                  asButton
                  withPositions="withOrders"
                  value={marketsDirectionsFilter}
                  onChange={setMarketsDirectionsFilter}
                />
                <OrderTypeFilter asButton value={orderTypesFilter} onChange={setOrderTypesFilter} />
                <OrderStatusFilter asButton value={orderStatusFilter} onChange={setOrderStatusFilter} />
              </div>
            ) : (
              <div />
            )}
            {isContainerSmall && selectedOrdersKeys && selectedOrdersKeys.length > 0 && (
              <Button variant="secondary" onClick={onCancelSelectedOrders}>
                <Plural value={selectedOrdersKeys.length} one="Cancel order" other="Cancel # orders" />
              </Button>
            )}
          </div>
          {isContainerSmall && (
            <div className="grid gap-8 sm:grid-cols-auto-fill-350">
              {orders.map((order) => (
                <OrderItem
                  key={order.key}
                  order={order}
                  isLarge={false}
                  isSelected={selectedOrdersKeys?.includes(order.key)}
                  onToggleOrder={() => onToggleOrder(order.key)}
                  isCanceling={cancellingOrdersKeys.includes(order.key)}
                  onCancelOrder={() => onCancelOrder(order)}
                  positionsInfoData={positionsData}
                  hideActions={hideActions}
                  setRef={handleSetRef}
                  onSelectOrderClick={() => onSelectOrderClick?.(order.key)}
                />
              ))}
            </div>
          )}
          {!isContainerSmall && <div />}
        </div>
      )}

      {isContainerSmall && orders.length === 0 && (
        <EmptyTableContent
          isLoading={isLoading}
          isEmpty={orders.length === 0}
          emptyText={<Trans>No open orders</Trans>}
        />
      )}

      {!isContainerSmall && (
        <TableScrollFadeContainer disableScrollFade={orders.length === 0} className="flex grow flex-col bg-slate-900">
          <Table className="!w-[max(100%,580px)] table-fixed">
            <thead>
              <TableTheadTr>
                {!hideActions && (
                  <TableTh className="w-[48px] cursor-pointer" onClick={onSelectAllOrders}>
                    <Checkbox
                      isPartialChecked={onlySomeOrdersSelected}
                      isChecked={areAllOrdersSelected}
                      setIsChecked={onSelectAllOrders}
                    />
                  </TableTh>
                )}
                <TableTh className="w-[18%]">
                  <MarketFilterLongShort
                    withPositions="withOrders"
                    value={marketsDirectionsFilter}
                    onChange={setMarketsDirectionsFilter}
                  />
                </TableTh>
                <TableTh className="w-[8%]">
                  <OrderTypeFilter value={orderTypesFilter} onChange={setOrderTypesFilter} />
                </TableTh>
                <TableTh className="w-[12%]">
                  <Trans>Size</Trans>
                </TableTh>
                <TableTh className="w-[7%]">
                  <Trans>Leverage</Trans>
                </TableTh>
                <TableTh className="w-[14%]">
                  <Trans>Trigger Price</Trans>
                </TableTh>
                <TableTh className="w-[13%]">
                  <Trans>Mark Price</Trans>
                </TableTh>
                <TableTh className="w-[10%]">
                  <OrderStatusFilter value={orderStatusFilter} onChange={setOrderStatusFilter} />
                </TableTh>
                <TableTh className="w-[12%]">
                  <Trans>Time</Trans>
                </TableTh>
                <TableTh className="w-[8%] !text-center">
                  <Trans>Action</Trans>
                </TableTh>
              </TableTheadTr>
            </thead>
            <tbody>
              {!isLoading &&
                orders.map((order) => (
                  <OrderItem
                    isLarge
                    isSelected={selectedOrdersKeys?.includes(order.key)}
                    key={order.key}
                    order={order}
                    onToggleOrder={() => onToggleOrder(order.key)}
                    isCanceling={cancellingOrdersKeys.includes(order.key)}
                    onCancelOrder={() => onCancelOrder(order)}
                    hideActions={hideActions}
                    positionsInfoData={positionsData}
                    setRef={(el) => (orderRefs.current[order.key] = el)}
                    onSelectOrderClick={() => onSelectOrderClick?.(order.key)}
                  />
                ))}
            </tbody>
          </Table>

          <EmptyTableContent
            isLoading={isLoading}
            isEmpty={orders.length === 0}
            emptyText={<Trans>No open orders</Trans>}
          />
        </TableScrollFadeContainer>
      )}

      <OrderEditorContainer />
    </div>
  );
}

function useFilteredOrders({
  chainId,
  account,
  marketsDirectionsFilter,
  orderTypesFilter,
  orderStatusFilter,
}: {
  chainId: ContractsChainId;
  account: string | undefined;
  marketsDirectionsFilter: MarketFilterLongShortItemData[];
  orderTypesFilter: OrderTypeFilterValue[];
  orderStatusFilter: OrderStatusFilterValue[];
}) {
  // In x10000 mode (API orders), we fetch all orders then filter locally
  const useApiDataSource = shouldUseApiOrders();
  const effectiveMarketsDirectionsFilter = useApiDataSource ? [] : marketsDirectionsFilter;
  const effectiveOrderTypesFilter = useApiDataSource ? [] : orderTypesFilter;

  const ordersResponse = useOrdersInfoRequest(chainId, {
    account: account,
    marketsDirectionsFilter: effectiveMarketsDirectionsFilter,
    orderTypesFilter: effectiveOrderTypesFilter,
    marketsInfoData: useMarketsInfoData(),
    tokensData: useTokensData(),
  });

  const availableTokensOptions = useSelector(selectTradeboxAvailableTokensOptions);
  const orders = useMemo(() => {
    const { sortedIndexTokensWithPoolValue, sortedLongAndShortTokens } = availableTokensOptions;

    // Parse filter conditions
    // Direction filter: marketAddress === "any" with specific direction
    const directionFilter = marketsDirectionsFilter.find(
      (f) => f.marketAddress === "any" && (f.direction === "long" || f.direction === "short")
    );
    const filterDirection = directionFilter?.direction;

    // Market filter: specific marketAddress (not "any")
    const marketFilters = marketsDirectionsFilter.filter((f) => f.marketAddress !== "any");
    const hasMarketFilter = marketFilters.length > 0;

    // Status filter: check if any status is selected
    const hasStatusFilter = orderStatusFilter.length > 0;

    // Order type filter: check if any order type is selected (for x10000 mode)
    const hasOrderTypeFilter = orderTypesFilter.length > 0;

    // Helper function: check if order matches market filter
    const matchesMarketFilter = (orderMarketAddress: string): boolean => {
      if (!hasMarketFilter) return true;
      // Both filter and order now use synthetic address format (x10000-BTC-USD)
      return marketFilters.some((f) =>
        f.marketAddress.toLowerCase() === orderMarketAddress.toLowerCase()
      );
    };

    // Helper function: check if order matches status filter (for x10000 mode)
    const matchesStatusFilter = (order: OrderInfo): boolean => {
      if (!hasStatusFilter) return true;
      // Get status from original API order data stored in order
      const originalStatus = (order as any).originalStatus as string | undefined;
      if (!originalStatus) return true; // If no status info, show the order
      return orderStatusFilter.includes(originalStatus as OrderStatusFilterValue);
    };

    // Helper function: check if order matches order type filter (for x10000 mode)
    const matchesOrderTypeFilter = (order: OrderInfo): boolean => {
      if (!hasOrderTypeFilter) return true;
      // Get order_type from original API order data
      const originalOrderType = (order as any).originalOrderType as string | undefined;
      if (!originalOrderType) return true; // If no type info, show the order

      // Map API order_type to filter values
      return orderTypesFilter.some((filterType) => {
        switch (filterType) {
          case "market":
            return originalOrderType === "market";
          case "limit":
            return originalOrderType === "limit";
          case "stop-loss":
            return originalOrderType === "stop_market" || originalOrderType === "stop_limit";
          case "take-profit":
            return originalOrderType === "take_profit" || originalOrderType === "take_profit_limit";
          default:
            return false;
        }
      });
    };

    const { swapOrders, positionOrders } = Object.values(ordersResponse.ordersInfoData || {}).reduce(
      (acc, order) => {
        // Check status filter first (applies to all orders in x10000 mode)
        if (!matchesStatusFilter(order)) {
          return acc;
        }

        // Check order type filter (for x10000 mode)
        if (!matchesOrderTypeFilter(order)) {
          return acc;
        }

        if (
          isLimitOrderType(order.orderType) ||
          isTriggerDecreaseOrderType(order.orderType) ||
          isMarketOrderType(order.orderType)
        ) {
          if (isSwapOrder(order)) {
            // Swap orders: show if no direction filter is selected
            if (!filterDirection) {
              acc.swapOrders.push(order);
            }
          } else if (isPositionOrder(order)) {
            // Check market filter first
            if (!matchesMarketFilter(order.marketAddress)) {
              return acc;
            }

            // Then check direction filter
            if (filterDirection) {
              const orderIsLong = order.isLong;
              const matchesDirection =
                (filterDirection === "long" && orderIsLong) ||
                (filterDirection === "short" && !orderIsLong);
              if (matchesDirection) {
                acc.positionOrders.push(order);
              }
            } else {
              // No direction filter, show all position orders that match market filter
              acc.positionOrders.push(order);
            }
          }
        }
        return acc;
      },
      {
        swapOrders: [] as (SwapOrderInfo | TwapOrderInfo<SwapOrderInfo>)[],
        positionOrders: [] as (PositionOrderInfo | TwapOrderInfo<PositionOrderInfo>)[],
      }
    );

    return [
      ...sortPositionOrders(positionOrders, sortedIndexTokensWithPoolValue),
      ...sortSwapOrders(swapOrders, sortedLongAndShortTokens),
    ];
  }, [availableTokensOptions, ordersResponse.ordersInfoData, marketsDirectionsFilter, orderStatusFilter, orderTypesFilter]);

  return orders;
}
