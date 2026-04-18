import { t } from "@lingui/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useAccount } from "wagmi";

import { updateOrder } from "@/modules/cex/lib/api/custom/client";
import { useApiOrders } from "@/modules/cex/lib/api/custom/useApiOrders";
import { symbolToMarket } from "@/modules/lighter/adapters/lighterOpenOrders";
import { useOrdersInfoData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import { PositionOrderInfo, isSwapOrderType } from "domain/synthetics/orders";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";
import { getByKey } from "lib/objects";

import Modal from "components/Modal/Modal";

import { AmountUnit, convertAmountValue, formatAmountValue } from "./modifyOrderAmount";
import styles from "./OpenOrdersTab.module.scss";

function getSimpleOrderTypeLabel(orderType?: string) {
  switch ((orderType || "").toLowerCase()) {
    case "limit":
    case "take_profit":
    case "take_profit_limit":
      return "Limit";
    case "market":
      return "Market";
    case "stop_market":
    case "stop_limit":
      return "Trigger";
    default:
      return "Limit";
  }
}

type Props = {
  orderKey?: string;
  onClose: () => void;
};

export function ModifyOrderModal({ orderKey, onClose }: Props) {
  const { chainId } = useChainId();
  const { address } = useAccount();
  const { mutate } = useSWRConfig();
  const ordersInfoData = useOrdersInfoData();
  const { apiOrders } = useApiOrders(chainId, address);

  const order = orderKey ? getByKey(ordersInfoData, orderKey) : undefined;
  const positionOrder = order && !isSwapOrderType(order.orderType) ? (order as PositionOrderInfo) : undefined;
  const apiOrder = useMemo(() => {
    if (!positionOrder?.originalOrderId || !apiOrders) return undefined;
    return apiOrders.find((item) => item.id === positionOrder.originalOrderId);
  }, [apiOrders, positionOrder?.originalOrderId]);

  const [priceInputValue, setPriceInputValue] = useState("");
  const [amountInputValue, setAmountInputValue] = useState("");
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("symbol");
  const [isAmountUnitMenuOpen, setIsAmountUnitMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const amountUnitMenuRef = useRef<HTMLDivElement>(null);

  const marketSymbol = apiOrder?.symbol ? symbolToMarket(apiOrder.symbol) : positionOrder?.indexToken?.symbol ?? "-";
  const markPriceText = apiOrder?.mark_price ? formatAmountValue(apiOrder.mark_price) : "-";
  const orderTypeLabel = getSimpleOrderTypeLabel(apiOrder?.order_type);

  useEffect(() => {
    if (!apiOrder) return;

    setPriceInputValue(formatAmountValue(apiOrder.price ?? apiOrder.trigger_price ?? ""));
    setAmountUnit("symbol");
    setAmountInputValue(formatAmountValue(apiOrder.amount ?? apiOrder.size ?? ""));
  }, [apiOrder]);

  useEffect(() => {
    if (!isAmountUnitMenuOpen) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (amountUnitMenuRef.current?.contains(event.target as Node)) return;
      setIsAmountUnitMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isAmountUnitMenuOpen]);

  const normalizedPrice = priceInputValue.trim();
  const normalizedAmount = amountInputValue.trim();
  const currentAmountUnitLabel = amountUnit === "symbol" ? marketSymbol : "USD";
  const effectivePrice = normalizedPrice || apiOrder?.price || apiOrder?.mark_price || "";
  const originalAmountValue = amountUnit === "symbol" ? String(apiOrder?.amount ?? "") : String(apiOrder?.size ?? "");

  const error = useMemo(() => {
    if (!positionOrder?.originalOrderId || !apiOrder) return "Unknown order";
    if (!normalizedPrice) return "Enter a price";
    if (!normalizedAmount) return "Enter an amount";

    const isPriceChanged = normalizedPrice !== String(apiOrder.price ?? apiOrder.trigger_price ?? "");
    const isAmountChanged = normalizedAmount !== originalAmountValue;

    if (!isPriceChanged && !isAmountChanged) return "Enter a new size or price";

    return undefined;
  }, [apiOrder, normalizedAmount, normalizedPrice, originalAmountValue, positionOrder?.originalOrderId]);

  const handleMidClick = useCallback(() => {
    if (!apiOrder?.mark_price) return;
    setPriceInputValue(apiOrder.mark_price);
  }, [apiOrder?.mark_price]);

  const handleAmountUnitChange = useCallback(
    (nextUnit: AmountUnit) => {
      if (nextUnit === amountUnit) {
        setIsAmountUnitMenuOpen(false);
        return;
      }

      setAmountInputValue((currentValue) => convertAmountValue(currentValue, amountUnit, nextUnit, effectivePrice));
      setAmountUnit(nextUnit);
      setIsAmountUnitMenuOpen(false);
    },
    [amountUnit, effectivePrice]
  );

  const handleSubmit = useCallback(async () => {
    if (!chainId || !address || !apiOrder?.id || error) return;

    const submittedAmount = amountUnit === "symbol" ? normalizedAmount : convertAmountValue(normalizedAmount, "usd", "symbol", effectivePrice);
    const submittedSize = amountUnit === "usd" ? normalizedAmount : convertAmountValue(normalizedAmount, "symbol", "usd", effectivePrice);

    setIsSubmitting(true);

    try {
      await updateOrder(
        chainId,
        apiOrder.id,
        {
          price: normalizedPrice,
          size: submittedSize,
          amount: submittedAmount,
        },
        address
      );

      await Promise.all([
        mutate(["api-orders", chainId, address], undefined, { revalidate: true }),
        mutate(["api-positions", chainId, address], undefined, { revalidate: true }),
      ]);

      helperToast.success(t`Order updated`);
      onClose();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to update order";
      helperToast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [address, amountUnit, apiOrder?.id, chainId, effectivePrice, error, mutate, normalizedAmount, normalizedPrice, onClose]);

  if (!orderKey || !positionOrder) {
    return null;
  }

  return (
    <Modal
      isVisible
      setIsVisible={(visible) => {
        if (!visible) onClose();
      }}
      label="Modify Order"
      contentPadding={false}
      qa="lighter-modify-order-modal"
      contentClassName={styles.modifyOrderModalContent}
      className={styles.modifyOrderModal}
      disableOverflowHandling
    >
      <div className={styles.modifyOrderBody}>
        <div className={styles.modifyOrderInfoGrid}>
          <div className={styles.modifyOrderInfoRow}>
            <span className={styles.modifyOrderLabel}>Order Type</span>
            <span className={styles.modifyOrderValue}>{orderTypeLabel}</span>
          </div>
          <div className={styles.modifyOrderInfoRow}>
            <span className={styles.modifyOrderLabel}>Market</span>
            <span className={styles.modifyOrderValue}>{marketSymbol}</span>
          </div>
          <div className={styles.modifyOrderInfoRow}>
            <span className={styles.modifyOrderLabel}>Mark Price</span>
            <span className={styles.modifyOrderValue}>{markPriceText}</span>
          </div>
        </div>

        <div className={styles.modifyOrderField}>
          <span className={styles.modifyOrderFieldLabel}>Price</span>
          <div className={styles.modifyOrderFieldValue}>
            <input
              value={priceInputValue}
              onChange={(event) => setPriceInputValue(event.target.value)}
              className={styles.modifyOrderInput}
              inputMode="decimal"
            />
            <button type="button" className={styles.modifyOrderHint} onClick={handleMidClick}>
              Mid
            </button>
          </div>
        </div>

        <div className={styles.modifyOrderField} ref={amountUnitMenuRef}>
          <span className={styles.modifyOrderFieldLabel}>Amount</span>
          <div className={styles.modifyOrderFieldValue}>
            <input
              value={amountInputValue}
              onChange={(event) => setAmountInputValue(event.target.value)}
              className={styles.modifyOrderInput}
              inputMode="decimal"
            />
            <button
              type="button"
              className={styles.modifyOrderUnitButton}
              onClick={() => setIsAmountUnitMenuOpen((prev) => !prev)}
              aria-expanded={isAmountUnitMenuOpen}
            >
              <span>{currentAmountUnitLabel}</span>
              <span className={styles.modifyOrderUnitCaret}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
                </svg>
              </span>
            </button>
            {isAmountUnitMenuOpen && (
              <div className={styles.modifyOrderUnitMenu}>
                <button
                  type="button"
                  className={styles.modifyOrderUnitOption}
                  onClick={() => handleAmountUnitChange("symbol")}
                >
                  <span>{marketSymbol}</span>
                  {amountUnit === "symbol" && (
                    <span className={styles.modifyOrderUnitCheck}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                      </svg>
                    </span>
                  )}
                </button>
                <button type="button" className={styles.modifyOrderUnitOption} onClick={() => handleAmountUnitChange("usd")}>
                  <span>USD</span>
                  {amountUnit === "usd" && (
                    <span className={styles.modifyOrderUnitCheck}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className={styles.modifyOrderSubmit}
          disabled={Boolean(error) || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? "Submitting..." : "Modify Order"}
        </button>
      </div>
    </Modal>
  );
}
