import { t } from "@lingui/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useAccount } from "wagmi";

import { getPositionTpSl, setPositionTpSl } from "@/modules/cex/lib/api/custom/client";
import type { TpSlRequest, TpSlResponse } from "@/modules/cex/lib/api/types";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import Modal from "components/Modal/Modal";

import styles from "./TpSlPositionModal.module.scss";
import type { LighterPosition } from "../../adapters/usePositionsAdapter";
import { Checkbox } from "../Checkbox/Checkbox";

type Props = {
  position?: LighterPosition;
  onClose: () => void;
};

type PositionMode = "entire" | "partial";

function parseNullableNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, maximumFractionDigits = 6) {
  if (!Number.isFinite(value)) return "-";
  const text = value.toFixed(maximumFractionDigits);
  return text.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/^0$/, "0");
}

function formatPrice(value: number | null | undefined, maximumFractionDigits = 6) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "-";
  return formatNumber(value, maximumFractionDigits);
}

function CaretIcon() {
  return (
    <span className={styles.caretIcon}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
        <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
      </svg>
    </span>
  );
}

function Slider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!draggingRef.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const next = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      onChange(Math.round(next));
    };

    const handleUp = () => {
      draggingRef.current = false;
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [onChange]);

  const rangeStyle = useMemo(() => ({ width: `${value}%` }), [value]);
  const thumbStyle = useMemo(() => ({ left: `calc(${value}% - 4px)` }), [value]);

  return (
    <div
      ref={trackRef}
      className={styles.slider}
      onMouseDown={(event) => {
        draggingRef.current = true;
        const rect = event.currentTarget.getBoundingClientRect();
        const next = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        onChange(Math.round(next));
      }}
    >
      <div className={styles.sliderTrack} />
      <div className={styles.sliderTicks}>
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className={styles.sliderTick} />
        ))}
      </div>
      <div className={styles.sliderRange} style={rangeStyle} />
      <div className={styles.sliderThumb} style={thumbStyle} />
    </div>
  );
}

export function TpSlPositionModal({ position, onClose }: Props) {
  const { chainId } = useChainId();
  const { address } = useAccount();
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<PositionMode>("entire");
  const [partialPercent, setPartialPercent] = useState(0);
  const [tpPercent, setTpPercent] = useState(0);
  const [slPercent, setSlPercent] = useState(0);
  const [tpPrice, setTpPrice] = useState("");
  const [tpLimitPrice, setTpLimitPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [slLimitPrice, setSlLimitPrice] = useState("");
  const [tpLimit, setTpLimit] = useState(false);
  const [slLimit, setSlLimit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!position) return;
    setMode("entire");
    setPartialPercent(0);
    setTpPercent(0);
    setSlPercent(0);
    setTpPrice("");
    setTpLimitPrice("");
    setSlPrice("");
    setSlLimitPrice("");
    setTpLimit(false);
    setSlLimit(false);
  }, [position]);

  useEffect(() => {
    if (!position?.positionId || !chainId || !address) return;

    let cancelled = false;

    const applyTpSl = (data: TpSlResponse) => {
      if (cancelled) return;

      const nextTpPrice = data.take_profit_price ?? "";
      const nextSlPrice = data.stop_loss_price ?? "";
      const nextTpLimitPrice = data.take_profit_limit_price ?? "";
      const nextSlLimitPrice = data.stop_loss_limit_price ?? "";
      const nextTpSize = parseNullableNumber(data.take_profit_size);
      const nextSlSize = parseNullableNumber(data.stop_loss_size);
      const nextPartialUsdSize = [nextTpSize, nextSlSize].find((value) => value != null && value > 0) ?? null;

      setTpPrice(String(nextTpPrice));
      setSlPrice(String(nextSlPrice));
      setTpLimitPrice(String(nextTpLimitPrice));
      setSlLimitPrice(String(nextSlLimitPrice));
      setTpLimit(Boolean(nextTpLimitPrice));
      setSlLimit(Boolean(nextSlLimitPrice));

      if (nextPartialUsdSize && position.size > 0) {
        setMode("partial");
        setPartialPercent(Math.max(0, Math.min(100, Math.round((nextPartialUsdSize / position.size) * 100))));
      } else {
        setMode("entire");
        setPartialPercent(0);
      }
    };

    const loadTpSl = async () => {
      try {
        const data = await getPositionTpSl(chainId, position.positionId, address);
        applyTpSl(data);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        if (message.includes("404")) return;
      }
    };

    loadTpSl();

    return () => {
      cancelled = true;
    };
  }, [address, chainId, position?.positionId, position?.size]);

  const partialAmount = useMemo(() => {
    if (!position) return "0";
    const amount = (position.sizeTokenAmount * partialPercent) / 100;
    return formatNumber(amount, 6);
  }, [partialPercent, position]);

  const partialUsdSize = useMemo(() => {
    if (!position) return undefined;
    const usdAmount = (position.size * partialPercent) / 100;
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) return undefined;
    return usdAmount;
  }, [partialPercent, position]);

  const submitError = useMemo(() => {
    if (!position?.positionId) return "Unknown position";
    if (!tpPrice.trim() && !slPrice.trim()) return "Enter TP or SL price";
    if (tpLimit && !tpPrice.trim()) return "TP limit requires TP price";
    if (tpLimit && !tpLimitPrice.trim()) return "Enter TP limit price";
    if (slLimit && !slPrice.trim()) return "SL limit requires SL price";
    if (slLimit && !slLimitPrice.trim()) return "Enter SL limit price";
    if (mode === "partial" && (!partialUsdSize || partialUsdSize <= 0)) return "Enter partial size";
    return undefined;
  }, [mode, partialUsdSize, position?.positionId, slLimit, slLimitPrice, slPrice, tpLimit, tpLimitPrice, tpPrice]);

  const handleSubmit = async () => {
    if (!chainId || !address || !position?.positionId || submitError) return;

    const payload: TpSlRequest = {};

    if (tpPrice.trim()) {
      payload.take_profit_price = tpPrice.trim();
      payload.take_profit_size = mode === "partial" ? String(partialUsdSize) : 0;
      if (tpLimit && tpLimitPrice.trim()) {
        payload.take_profit_limit_price = tpLimitPrice.trim();
      }
    }

    if (slPrice.trim()) {
      payload.stop_loss_price = slPrice.trim();
      payload.stop_loss_size = mode === "partial" ? String(partialUsdSize) : 0;
      if (slLimit && slLimitPrice.trim()) {
        payload.stop_loss_limit_price = slLimitPrice.trim();
      }
    }

    setIsSubmitting(true);
    try {
      await setPositionTpSl(chainId, position.positionId, payload, address);
      await Promise.all([
        mutate(["api-positions", chainId, address], undefined, { revalidate: true }),
        mutate(["api-orders", chainId, address], undefined, { revalidate: true }),
      ]);
      helperToast.success(t`TP/SL updated`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update TP/SL";
      helperToast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!position) return null;

  return (
    <Modal
      isVisible
      setIsVisible={(visible) => {
        if (!visible) onClose();
      }}
      label="TP/SL for Position"
      contentPadding={false}
      qa="lighter-position-tpsl-modal"
      contentClassName={`${styles.modalContent} ${mode === "entire" ? styles.modalContentEntire : styles.modalContentPartial}`}
      className={styles.modal}
      disableOverflowHandling
    >
      <div className={styles.modeTabsWrap}>
        <div className={styles.modeTabs}>
          <button
            type="button"
            className={`${styles.modeTab} ${mode === "entire" ? styles.modeTabActive : ""}`}
            onClick={() => setMode("entire")}
          >
            Entire Position
          </button>
          <button
            type="button"
            className={`${styles.modeTab} ${mode === "partial" ? styles.modeTabActive : ""}`}
            onClick={() => setMode("partial")}
          >
            Partial Position
          </button>
        </div>
      </div>
      <div className={styles.tabsDivider} />

      <div className={`${styles.body} ${mode === "entire" ? styles.bodyEntire : styles.bodyPartial}`}>
        <div
          className={styles.scrollContent}
          data-testid={mode === "entire" ? "modify-entire-position-content" : "modify-partial-position-content"}
        >
        <div className={styles.infoGrid}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Market</span>
            <span className={styles.infoValue}>{position.market}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Size</span>
            <span className={`${styles.infoValue} ${position.side === "long" ? styles.up : styles.down}`}>
              {formatNumber(position.sizeTokenAmount, 6)}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Entry Price</span>
            <span className={styles.infoValue}>{formatPrice(position.entryPrice)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Mark Price</span>
            <span className={styles.infoValue}>{formatPrice(position.markPrice)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Liq. Price</span>
            <span className={styles.infoValue}>{formatPrice(position.liqPrice)}</span>
          </div>
        </div>

        {mode === "partial" && (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Amount</span>
              <div className={styles.fieldValue}>
                <input value={partialAmount} readOnly className={styles.input} />
                <span className={styles.trailingText}>{position.market}</span>
              </div>
            </div>
            <Slider value={partialPercent} onChange={setPartialPercent} />
          </>
        )}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Take Profit</div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>TP Price</span>
              <div className={styles.fieldValue}>
                <input
                  value={tpPrice}
                  onChange={(event) => setTpPrice(event.target.value)}
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="0.000000"
                />
              </div>
            </div>
            <button type="button" className={`${styles.field} ${styles.selectField}`}>
              <span className={styles.fieldLabel}>Gain</span>
              <div className={styles.fieldValue}>
                <span className={styles.selectValue}>0.00 %</span>
                <CaretIcon />
              </div>
            </button>
          </div>
          <Slider value={tpPercent} onChange={setTpPercent} />
          <div className={styles.checkboxRow}>
            <Checkbox checked={tpLimit} onChange={setTpLimit} label="Limit" />
          </div>
          {tpLimit && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>TP Limit Price</span>
              <div className={styles.fieldValue}>
                <input
                  value={tpLimitPrice}
                  onChange={(event) => setTpLimitPrice(event.target.value)}
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="0.000000"
                />
              </div>
            </div>
          )}
          <div className={styles.infoRow}>
            <span className={`${styles.infoLabel} ${styles.secondaryLabel}`}>Estimated PnL</span>
            <span className={`${styles.infoValue} ${styles.lightValue}`}>N/A</span>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Stop Loss</div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>SL Price</span>
              <div className={styles.fieldValue}>
                <input
                  value={slPrice}
                  onChange={(event) => setSlPrice(event.target.value)}
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="0.000000"
                />
              </div>
            </div>
            <button type="button" className={`${styles.field} ${styles.selectField}`}>
              <span className={styles.fieldLabel}>Loss</span>
              <div className={styles.fieldValue}>
                <span className={styles.selectValue}>0.00 %</span>
                <CaretIcon />
              </div>
            </button>
          </div>
          <Slider value={slPercent} onChange={setSlPercent} />
          <div className={styles.checkboxRow}>
            <Checkbox checked={slLimit} onChange={setSlLimit} label="Limit" />
          </div>
          {slLimit && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>SL Limit Price</span>
              <div className={styles.fieldValue}>
                <input
                  value={slLimitPrice}
                  onChange={(event) => setSlLimitPrice(event.target.value)}
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="0.000000"
                />
              </div>
            </div>
          )}
          <div className={styles.infoRow}>
            <span className={`${styles.infoLabel} ${styles.secondaryLabel}`}>Estimated PnL</span>
            <span className={`${styles.infoValue} ${styles.lightValue}`}>N/A</span>
          </div>
        </section>

        <button type="button" className={styles.submitButton} disabled={Boolean(submitError) || isSubmitting} onClick={handleSubmit}>
          Submit
        </button>
        </div>
      </div>
    </Modal>
  );
}
