import cx from "classnames";
import { useMemo } from "react";

import type { X10000Market } from "@/modules/cex/lib/api/custom/useX10000Markets";

import Button from "components/Button/Button";

const MARKET_TYPE_LABELS: Record<string, string> = {
  all: "All",
  favorites: "Favorites",
  layer1: "Layer 1",
  layer2: "Layer 2",
  defi: "DeFi",
  meme: "Meme",
  ai: "AI",
  rwa: "RWA",
};

function getTypeLabel(type: string): string {
  return MARKET_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

interface MarketTypeTabsProps {
  markets: X10000Market[];
  selectedTab: string;
  onTabChange: (tab: string) => void;
  showFavorites?: boolean;
  className?: string;
}

export function MarketTypeTabs({
  markets,
  selectedTab,
  onTabChange,
  showFavorites = true,
  className,
}: MarketTypeTabsProps) {
  const marketTypes = useMemo(() => {
    const types = new Set<string>();
    markets.forEach((market) => {
      if (market.type) {
        types.add(market.type);
      }
    });
    return Array.from(types).sort();
  }, [markets]);

  const tabOptions = useMemo(() => {
    const options = ["all"];
    if (showFavorites) {
      options.push("favorites");
    }
    options.push(...marketTypes);
    return options;
  }, [marketTypes, showFavorites]);

  return (
    <div className={cx("flex items-center gap-8 whitespace-nowrap", className)}>
      {tabOptions.map((option) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          size="small"
          className={cx({
            "!bg-button-secondary !text-typography-primary": selectedTab === option,
          })}
          onClick={() => onTabChange(option)}
          data-selected={selectedTab === option}
        >
          {getTypeLabel(option)}
        </Button>
      ))}
    </div>
  );
}
