import { t } from "@lingui/macro";
import { BottomSheet } from "@/modules/lighter/mobile/shared/BottomSheet";
import { TradingMarketsDropdown } from "@/shared/components/TradingMarketsList/TradingMarketsDropdown";
import { useTradeState } from "@/modules/lighter/store/TradeStateContext";
import styles from "./MarketSelectorSheet.module.scss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MarketSelectorSheet({ open, onOpenChange }: Props) {
  const { setSelectedSymbol } = useTradeState();

  const handleSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    onOpenChange(false);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t`Select market`} maxHeight="90vh">
      <div className={styles.wrap}>
        <TradingMarketsDropdown onMarketSelect={handleSelect} />
      </div>
    </BottomSheet>
  );
}
