import { useEffect, useRef, useState } from "react";

import useWallet from "@/shared/lib/wallets/useWallet";
import { useChainId } from "lib/chains";
import { useApiMarkets, useZtdxUserPositions } from "modules/cex/lib/api/hooks";
import { useX10000State } from "modules/cex/store/X10000StateContext";

import { AdvancedOrderForm } from "./AdvancedOrderForm";
import { LimitOrderForm } from "./LimitOrderForm";
import { MarketOrderForm } from "./MarketOrderForm";
import styles from "./OrderFormPanel.module.scss";

type BasicMode = "Market" | "Limit";
type AdvancedMode = "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit";
type Mode = BasicMode | AdvancedMode;

const ADVANCED_MODES: AdvancedMode[] = [
  "Stop Market",
  "Stop Limit",
  "Take Profit Market",
  "Take Profit Limit",
];

const ADVANCED_MODE_LABELS: Record<AdvancedMode, string> = {
  "Stop Market": "S/L Market",
  "Stop Limit": "S/L Limit",
  "Take Profit Market": "T/P Market",
  "Take Profit Limit": "T/P Limit",
};

function normalizeMarketSymbol(symbol: string | null | undefined) {
  if (!symbol) return null;
  if (symbol.includes("USDT")) return symbol.toUpperCase();
  if (symbol.includes("-USD")) return symbol.replace("-USD", "USDT").toUpperCase();
  return `${symbol}USDT`.toUpperCase();
}

export function OrderFormPanel() {
  const { active, account } = useWallet();
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  const { markets } = useApiMarkets(chainId, { refreshInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: positionsData } = useZtdxUserPositions({ refreshInterval: 5000, revalidateOnFocus: false, revalidateOnReconnect: false });
  const [mode, setMode] = useState<Mode>("Market");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [leverageValue, setLeverageValue] = useState(10);
  const [pendingLeverageValue, setPendingLeverageValue] = useState(10);
  const [marginTab, setMarginTab] = useState<"Cross" | "Isolated">("Cross");
  const [pendingMarginTab, setPendingMarginTab] = useState<"Cross" | "Isolated">("Cross");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [leverageModalOpen, setLeverageModalOpen] = useState(false);
  const [marginModalOpen, setMarginModalOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);
  const isConnected = Boolean(active && account);
  const normalizedSymbol = normalizeMarketSymbol(selectedSymbol);
  const currentMarket = markets?.markets.markets.find((market) => market.symbol === normalizedSymbol) ?? null;
  const maxLeverage = Math.max(1, currentMarket?.leverage ?? 10);
  const currentPositionLeverage =
    positionsData?.positions?.find((position) => normalizeMarketSymbol(position.symbol) === normalizedSymbol)?.leverage ?? 0;
  const marginMode = marginTab === "Cross" ? "cross" : "isolated";

  useEffect(() => {
    if (!advancedOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!advancedRef.current?.contains(e.target as Node)) setAdvancedOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [advancedOpen]);

  useEffect(() => {
    setLeverageValue((prev) => Math.min(prev, maxLeverage));
    setPendingLeverageValue((prev) => Math.min(prev, maxLeverage));
  }, [maxLeverage]);

  const isAdvanced = ADVANCED_MODES.includes(mode as AdvancedMode);

  return (
    <div className={styles.root}>
      {isConnected && (
        <div className={styles.topTabs}>
          <button
            type="button"
            className={styles.topTabActive}
            onClick={() => {
              setPendingLeverageValue(leverageValue);
              setLeverageModalOpen(true);
            }}
          >
            {leverageValue}x
          </button>
          <button
            type="button"
            className={styles.topTabActive}
            onClick={() => {
              setPendingMarginTab(marginTab);
              setMarginModalOpen(true);
            }}
          >
            {marginTab}
          </button>
        </div>
      )}
      <div className={styles.modes}>
        <button onClick={() => setMode("Market")} className={mode === "Market" ? styles.modeActive : styles.mode}>
          Market
        </button>
        <button onClick={() => setMode("Limit")} className={mode === "Limit" ? styles.modeActive : styles.mode}>
          Limit
        </button>
        <div ref={advancedRef} className={styles.advancedWrap}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
            className={isAdvanced ? styles.modeActive : styles.mode}
          >
            <span>{isAdvanced ? ADVANCED_MODE_LABELS[mode as AdvancedMode] : "Advanced"}</span>
            <span className={`${styles.caret} ${advancedOpen ? styles.caretOpen : ""}`}>
              <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
                <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
              </svg>
            </span>
          </button>
          {advancedOpen && (
            <div role="menu" aria-label="Advanced" className={styles.advancedMenu}>
              {ADVANCED_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="menuitem"
                  className={styles.advancedItem}
                  onClick={() => {
                    setMode(m);
                    setAdvancedOpen(false);
                  }}
                >
                  {ADVANCED_MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.sides}>
        <button
          onClick={() => setSide("buy")}
          className={styles.sideBtn}
        >
          Buy / Long
        </button>
        <button
          onClick={() => setSide("sell")}
          className={styles.sideBtn}
        >
          Sell / Short
        </button>
        <div className={`${styles.sideIndicator} ${side === "buy" ? styles.indicatorBuy : styles.indicatorSell}`} />
      </div>

      <div className={styles.body}>
        {mode === "Market" && (
          <MarketOrderForm side={side} isConnected={isConnected} leverage={leverageValue} marginMode={marginMode} />
        )}
        {mode === "Limit" && (
          <LimitOrderForm side={side} isConnected={isConnected} leverage={leverageValue} marginMode={marginMode} />
        )}
        {isAdvanced && (
          <AdvancedOrderForm
            side={side}
            type={mode as AdvancedMode}
            isConnected={isConnected}
            leverage={leverageValue}
            marginMode={marginMode}
          />
        )}
      </div>

      {leverageModalOpen && (
        <div className={styles.leverageOverlay} onClick={() => setLeverageModalOpen(false)}>
          <div className={styles.leverageModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.leverageHeader}>
              <span>Adjust Max Leverage</span>
              <button type="button" className={styles.leverageClose} onClick={() => setLeverageModalOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className={styles.leverageBody}>
              <div className={styles.leverageSliderSection}>
                <div className={styles.leverageSliderRow}>
                  <input
                    className={styles.leverageSlider}
                    type="range"
                    min={1}
                    max={maxLeverage}
                    step={1}
                    value={pendingLeverageValue}
                    onChange={(event) => setPendingLeverageValue(Number(event.target.value))}
                    style={
                      {
                        "--leverage-fill":
                          maxLeverage > 1 ? `${((pendingLeverageValue - 1) / (maxLeverage - 1)) * 100}%` : "0%",
                      } as Record<string, string>
                    }
                  />
                  <div className={styles.leverageValueBadge}>
                    <input
                      className={styles.leverageValueInput}
                      value={pendingLeverageValue}
                      onChange={(event) => {
                        const next = Number(event.target.value.replace(/[^0-9]/g, ""));
                        if (!Number.isFinite(next)) return;
                        setPendingLeverageValue(Math.max(1, Math.min(maxLeverage, next)));
                      }}
                      inputMode="numeric"
                      placeholder="0"
                    />
                    <span>x</span>
                  </div>
                </div>
              </div>
              <div className={styles.leverageCopySection}>
                <div className={styles.leverageText}>
                  Set the maximum leverage you are willing to use. Higher leverage increases the risk of liquidation.
                </div>
                <div className={styles.leverageMeta}>Current Maximum Leverage: {maxLeverage}x</div>
                <div className={styles.leverageMeta}>Current Position Leverage: {currentPositionLeverage}x</div>
              </div>
            </div>
            <div className={styles.leverageFooter}>
              <button
                type="button"
                className={styles.leverageConfirm}
                onClick={() => {
                  setLeverageValue(pendingLeverageValue);
                  setLeverageModalOpen(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {marginModalOpen && (
        <div className={styles.leverageOverlay} onClick={() => setMarginModalOpen(false)}>
          <div className={styles.marginModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.marginHeader}>
              <span>Margin Mode</span>
              <button type="button" className={styles.marginClose} onClick={() => setMarginModalOpen(false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className={styles.marginBody}>
              <div className={styles.marginOptions}>
              <button
                type="button"
                className={`${styles.marginOption} ${pendingMarginTab === "Cross" ? styles.marginOptionSelected : ""}`}
                onClick={() => setPendingMarginTab("Cross")}
              >
                <span className={styles.marginCheck}>{pendingMarginTab === "Cross" ? "✓" : ""}</span>
                <span className={styles.marginCopy}>
                  <span className={styles.marginTitle}>Cross</span>
                  <span className={styles.marginText}>
                    All cross positions share the same cross margin as collateral. In the event of liquidation, your
                    cross margin balance and any remaining open positions under assets in this mode may be forfeited.
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`${styles.marginOption} ${pendingMarginTab === "Isolated" ? styles.marginOptionSelected : ""}`}
                onClick={() => setPendingMarginTab("Isolated")}
              >
                <span className={styles.marginCheck}>{pendingMarginTab === "Isolated" ? "✓" : ""}</span>
                <span className={styles.marginCopy}>
                  <span className={styles.marginTitle}>Isolated</span>
                  <span className={styles.marginText}>
                    Manage your risk on individual positions by restricting the amount of margin allocated to each. If
                    the margin ratio of an isolated position reaches 100%, the position will be liquidated.
                  </span>
                </span>
              </button>
              </div>
            </div>
            <div className={styles.marginFooter}>
              <button
                type="button"
                className={styles.marginConfirm}
                onClick={() => {
                  setMarginTab(pendingMarginTab);
                  setMarginModalOpen(false);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
