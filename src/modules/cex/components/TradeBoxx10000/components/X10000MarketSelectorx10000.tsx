import { t } from "@lingui/macro";
import { useCallback, useMemo, useState } from "react";
import type React from "react";

import { useX10000State } from "@/modules/cex/store/X10000StateContext";
import { useX10000SelectedMarket } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { useChainId } from "lib/chains";
import { getNormalizedTokenSymbol } from "sdk/configs/tokens";

import { X10000MarketsDropdown } from "components/X10000MarketsList";
import TokenIcon from "components/TokenIcon/TokenIcon";
import { SlideModal } from "components/Modal/SlideModal";

type Props = {
  label?: string;
  onAfterSelect?: (baseSymbol: string) => void;
};

export function X10000MarketSelectorx10000({ label = t`Market`, onAfterSelect }: Props) {
  const { chainId } = useChainId();
  const { selectedSymbol, setSelectedSymbol } = useX10000State();
  const selectedMarket = useX10000SelectedMarket(chainId, selectedSymbol);

  const [isOpen, setIsOpen] = useState(false);

  const baseSymbol = useMemo(() => {
    const raw = selectedMarket?.base_asset || selectedSymbol || "BTCUSDT";
    return getNormalizedTokenSymbol(raw.replace(/[-/]?USD[T]?$/i, ""));
  }, [selectedMarket?.base_asset, selectedSymbol]);

  const selectedLabel = useMemo(() => {
    return (
      <div className="flex items-center gap-4">
        <TokenIcon className="mr-4" symbol={baseSymbol} displaySize={20} />
        <span>{`${baseSymbol}/USD`}</span>
      </div>
    );
  }, [baseSymbol]);

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(true);
    },
    [setIsOpen]
  );

  const handleSelect = useCallback(
    (symbol: string) => {
      // X10000MarketsDropdown returns API symbol format like BTCUSDT / ETHUSDT
      setSelectedSymbol(symbol);
      setIsOpen(false);

      const selectedBase = getNormalizedTokenSymbol(symbol.replace(/[-/]?USD[T]?$/i, ""));
      onAfterSelect?.(selectedBase);
    },
    [onAfterSelect, setSelectedSymbol]
  );

  return (
    <>
      <SlideModal
        qa="x10000-market-selector-modal"
        className="TokenSelector-modal"
        isVisible={isOpen}
        setIsVisible={setIsOpen}
        label={label}
        contentPadding={false}
      >
        <X10000MarketsDropdown onMarketSelect={handleSelect} />
      </SlideModal>

      <div
        className="group/hoverable group flex cursor-pointer items-center gap-4 whitespace-nowrap tracking-wide hover:text-blue-300"
        onClick={handleOpen}
        data-qa="market-selector"
      >
        {selectedLabel}
      </div>
    </>
  );
}


