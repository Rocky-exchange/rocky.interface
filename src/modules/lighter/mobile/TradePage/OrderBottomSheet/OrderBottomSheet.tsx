// src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderBottomSheet.tsx
import { useEffect, useState } from "react";
import { Trans, t } from "@lingui/macro";
import { BottomSheet } from "@/modules/lighter/mobile/shared/BottomSheet";
import { useOrderFormState } from "@/modules/lighter/features/orderForm/useOrderFormState";
import { Side, AdvancedMode } from "@/modules/lighter/features/orderForm/types";
import { isAdvancedMode } from "@/modules/lighter/features/orderForm/advancedModes";
import { MobileAdvancedForm } from "./MobileAdvancedForm";
import { usePlaceOrderAdapter } from "@/modules/lighter/adapters/usePlaceOrderAdapter";
import { useOrderAmountPreview } from "@/modules/lighter/features/orderForm/useOrderAmountPreview";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { OrderInfoRows } from "./OrderInfoRows";
import { LeverageSlider } from "./LeverageSlider";
import styles from "./OrderBottomSheet.module.scss";
import { OrderTypeTabs } from "./OrderTypeTabs";
import { SizeInput } from "./SizeInput";
import { TPSLSection } from "./TPSLSection";

type Props = {
  open: boolean;
  side: Side;
  baseSymbol: string;
  onOpenChange: (open: boolean) => void;
  maxLeverage: number;
};

const fmtUsd = (n: number | null): string =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPrice = (n: number | null): string => (n == null ? "—" : n.toLocaleString());

export function OrderBottomSheet({ open, side, baseSymbol, onOpenChange, maxLeverage }: Props) {
  const form = useOrderFormState({ maxLeverage });
  const { placeOrder, submitting } = usePlaceOrderAdapter();
  const { connected } = useCantonSession();
  const isConnected = connected;
  const { amountNum, amountReady, preview, costMargin, liqPrice, previewErrorMessage } = useOrderAmountPreview({
    side: form.side,
    mode: form.mode,
    rawSize: form.size,
    sizeUnit: form.sizeUnit,
    limitPrice: form.price,
    leverage: form.leverageValue,
    marginMode: form.marginTab.toLowerCase() as "cross" | "isolated",
  });
  const info = useOrderInfoRows({ preview, side: form.side, amountNum, baseSymbol });
  const isAdvanced = isAdvancedMode(form.mode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    form.setSide(side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [open]);

  const onSubmit = async () => {
    if (!form.isValid || submitting || !amountReady || previewErrorMessage) return;
    if (!isConnected) {
      setError(t`Connect your wallet first`);
      return;
    }
    setError(null);
    try {
      await placeOrder({
        side: form.side,
        type: form.mode === "Market" ? "market" : "limit",
        amount: amountNum,
        price: form.mode === "Limit" ? Number(form.price) : undefined,
        leverage: form.leverageValue,
        marginMode: form.marginTab.toLowerCase() as "cross" | "isolated",
        tpPrice: form.tp ? Number(form.tp) : undefined,
        slPrice: form.sl ? Number(form.sl) : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const title = side === "buy" ? t`Long ${baseSymbol}` : t`Short ${baseSymbol}`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className={styles.body}>
        <OrderTypeTabs
          mode={form.mode}
          onChange={(m) => form.setMode(m)}
          advancedOpen={form.advancedOpen}
          onAdvancedToggle={form.setAdvancedOpen}
          onAdvancedSelect={(m) => form.setMode(m)}
        />

        <LeverageSlider value={form.leverageValue} max={maxLeverage} onChange={form.setLeverageValue} />

        {isAdvanced ? (
          <MobileAdvancedForm
            type={form.mode as AdvancedMode}
            side={form.side}
            isConnected={isConnected}
            leverage={form.leverageValue}
            marginMode={form.marginTab.toLowerCase() as "cross" | "isolated"}
            baseSymbol={baseSymbol}
          />
        ) : (
          <>
            <SizeInput
              value={form.size}
              unit={form.sizeUnit}
              baseSymbol={baseSymbol}
              onChange={form.setSize}
              onUnitToggle={() => form.setSizeUnit(form.sizeUnit === "BASE" ? "USD" : "BASE")}
            />

            {form.mode === "Limit" && (
              <div className={styles.priceRow}>
                <label className={styles.priceLabel}>
                  <Trans>Price</Trans>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => form.setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  className={styles.priceInput}
                  placeholder="0.00"
                />
              </div>
            )}

            <TPSLSection tp={form.tp} sl={form.sl} onTpChange={form.setTp} onSlChange={form.setSl} />

            <OrderInfoRows
              availableToTrade={info.availableToTrade}
              position={info.position}
              orderSize={info.orderSize}
              orderValue={info.orderValue}
              estPrice={info.estPrice}
              cost={fmtUsd(costMargin)}
              liquidation={fmtPrice(liqPrice)}
              slippage={info.slippage}
              fees={info.fees}
            />
            {previewErrorMessage && <div className={styles.error}>{previewErrorMessage}</div>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              disabled={!form.isValid || submitting || !amountReady || Boolean(previewErrorMessage)}
              onClick={onSubmit}
              className={
                side === "buy"
                  ? `${styles.placeButton} ${styles.buyButton}`
                  : `${styles.placeButton} ${styles.sellButton}`
              }
            >
              {submitting ? (
                <Trans>Submitting…</Trans>
              ) : form.mode === "Market" ? (
                side === "buy" ? (
                  <Trans>Place Long</Trans>
                ) : (
                  <Trans>Place Short</Trans>
                )
              ) : side === "buy" ? (
                <Trans>Place Limit Long</Trans>
              ) : (
                <Trans>Place Limit Short</Trans>
              )}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
