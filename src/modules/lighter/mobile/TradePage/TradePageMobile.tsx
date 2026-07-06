import { useState, useMemo } from "react";

import { MobileTopNav } from "@/modules/lighter/mobile/shared/MobileTopNav";
import { useChainId } from "lib/chains";
import { useApiMarketDetails } from "@/modules/lighter/api/hooks";
import { useTradeState } from "@/modules/lighter/store/TradeStateContext";
import { Side } from "@/modules/lighter/features/orderForm/types";

import { MarketHeaderRow } from "./MarketHeaderRow";
import { MobileTradeCTA } from "./MobileTradeCTA";
import { MobileTradeTabs, MobileTradeTabKey } from "./MobileTradeTabs";
import { MarketSelectorSheet } from "./MarketSelectorSheet";
import { OrderBottomSheet } from "./OrderBottomSheet/OrderBottomSheet";
import { DepthPanel } from "./panels/DepthPanel";
import { DetailsPanel } from "./panels/DetailsPanel";
import { FundingPanel } from "./panels/FundingPanel";
import { OrderBookPanel } from "./panels/OrderBookPanel";
import { PriceChartPanel } from "./panels/PriceChartPanel";
import { RecentTradesPanel } from "./panels/RecentTradesPanel";
import styles from "./TradePageMobile.module.scss";

export function TradePageMobile() {
  const [tab, setTab] = useState<MobileTradeTabKey>("Price");
  const [marketSelectorOpen, setMarketSelectorOpen] = useState(false);
  const [sheetSide, setSheetSide] = useState<Side | null>(null);

  const { selectedSymbol } = useTradeState();
  const { chainId } = useChainId();

  const normalizedSymbol = useMemo(() => {
    if (!selectedSymbol) return undefined;
    if (selectedSymbol.includes("USDT")) return selectedSymbol.toUpperCase();
    if (selectedSymbol.includes("-USD")) return selectedSymbol.replace("-USD", "USDT").toUpperCase();
    return `${selectedSymbol}USDT`.toUpperCase();
  }, [selectedSymbol]);

  const { details: marketDetails } = useApiMarketDetails(chainId, normalizedSymbol, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  // See the comment in features/orderForm/desktop/OrderFormPanel.tsx:
  // marketDetails is always undefined in practice (its endpoint doesn't
  // exist on rocky-backend), so this fallback governs the real slider max.
  const maxLeverage = Math.max(1, marketDetails?.max_leverage ?? 100);

  const baseSymbol = useMemo(() => selectedSymbol?.split("-")[0] ?? "BTC", [selectedSymbol]);

  return (
    <div className={styles.page}>
      <MobileTopNav />
      <MarketHeaderRow onOpenMarketSelector={() => setMarketSelectorOpen(true)} />
      <MobileTradeTabs active={tab} onChange={setTab} />
      <div
        role="tabpanel"
        id={`mobile-tradepanel-${tab}`}
        aria-labelledby={`mobile-tradetab-${tab}`}
        className={styles.body}
      >
        {tab === "Price" && <PriceChartPanel />}
        {tab === "OrderBook" && <OrderBookPanel />}
        {tab === "Trades" && <RecentTradesPanel />}
        {tab === "Depth" && <DepthPanel />}
        {tab === "Funding" && <FundingPanel />}
        {tab === "Details" && <DetailsPanel />}
      </div>
      <MobileTradeCTA onBuy={() => setSheetSide("buy")} onSell={() => setSheetSide("sell")} />
      <OrderBottomSheet
        open={sheetSide !== null}
        side={sheetSide ?? "buy"}
        baseSymbol={baseSymbol}
        maxLeverage={maxLeverage}
        onOpenChange={(o) => !o && setSheetSide(null)}
      />
      <MarketSelectorSheet open={marketSelectorOpen} onOpenChange={setMarketSelectorOpen} />
    </div>
  );
}
