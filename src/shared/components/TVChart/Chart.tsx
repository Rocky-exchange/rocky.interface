import { Trans } from "@lingui/macro";
import { Suspense, lazy } from "react";
import cx from "classnames";

import { isDevelopment } from "config/env";
import {
  selectTradeboxMarketInfo,
  selectTradeboxTradeFlags,
} from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useLocalStorageSerializeKey } from "lib/localStorage";
import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";

import { ColorfulBanner } from "components/ColorfulBanner/ColorfulBanner";
import { DepthChart } from "components/DepthChart/DepthChart";
import { DepthChartx10000 } from "@/modules/cex/components/DepthChartx10000";
import ExternalLink from "components/ExternalLink/ExternalLink";
import Tabs from "components/Tabs/Tabs";

import { TVChart } from "./TVChart";

import "./TVChart.scss";

const LazyMarketGraph = lazy(() => import("components/DebugMarketGraph/DebugMarketGraph"));

const TAB_LABELS = {
  PRICE: (
    <div className="flex items-center gap-8">
      <Trans>Price</Trans>
    </div>
  ),
  DEPTH: (
    <div className="flex items-center gap-8">
      <Trans>Depth</Trans>
    </div>
  ),
  MARKET_GRAPH: (
    <div className="flex items-center gap-8">
      <Trans>Market Graph</Trans>
    </div>
  ),
};

// Market Graph tab commented out
const TABS = ["PRICE", "DEPTH"]; // Removed MARKET_GRAPH tab

const TABS_OPTIONS = TABS.map((tab) => ({
  value: tab,
  label: TAB_LABELS[tab],
}));

export function Chart() {
  const [tab, setTab] = useLocalStorageSerializeKey("chart-tab", "PRICE");
  const { isSwap } = useSelector(selectTradeboxTradeFlags);
  const activeTab = tab || "PRICE";

  return (
    <div className="ExchangeChart tv Synthetics-chart flex flex-col">
      <div className="flex grow flex-col overflow-hidden rounded-8 bg-slate-900">
        {isSwap ? (
          activeTab === "MARKET_GRAPH" ? (
            <Suspense fallback={<div>...</div>}>
              <LazyMarketGraph />
            </Suspense>
          ) : (
            <TVChart />
          )
        ) : (
          <>
            <ChartTabs tab={activeTab} setTab={setTab} />

            {/* Keep both tabs mounted to prevent reload, use CSS to show/hide */}
            {/* Use opacity instead of visibility for proper hiding while keeping TradingView initialized */}
            <div className="relative grow">
              <div
                className={cx("absolute inset-0 flex flex-col transition-opacity duration-0", {
                  "opacity-100 z-10": activeTab === "PRICE",
                  "opacity-0 z-0 pointer-events-none": activeTab !== "PRICE",
                })}
              >
                <TVChart />
              </div>
              <div
                className={cx("absolute inset-0 flex flex-col transition-opacity duration-0", {
                  "opacity-100 z-10": activeTab === "DEPTH",
                  "opacity-0 z-0 pointer-events-none": activeTab !== "DEPTH",
                })}
              >
                <DepthChartContainer />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DepthChartContainer() {
  const marketInfo = useSelector(selectTradeboxMarketInfo);
  const isX10000Mode = isX10000ModeActive();

  // For x10000 mode, use the orderbook-based depth chart
  if (isX10000Mode) {
    return (
      <div className="flex h-full w-full flex-col gap-8 p-8">
        <div className="w-full grow">
          <DepthChartx10000 />
        </div>
      </div>
    );
  }

  if (!marketInfo) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-8 p-8">
      {/* Depth chart explanation banner commented out */}
      {/* <ColorfulBanner color="blue">
        <span>
          <Trans>
            This simulated depth chart offers a hypothetical orderbook-style view of GMX liquidity—it's not how trades
            actually execute. Opens always execute at the mark price with zero impact applied, so any shown execution
            price for opening is purely virtual. The actual net price impact, applied only on closes, sums the displayed
            open and close impacts but is capped at 0.5%.{" "}
            <ExternalLink href="https://docs.gmx.io/docs/trading/v2#price-impact-and-price-impact-rebates" newTab>
              Read more
            </ExternalLink>
            .
          </Trans>
        </span>
      </ColorfulBanner> */}
      <div className="w-full grow">
        <DepthChart marketInfo={marketInfo} />
      </div>
    </div>
  );
}

const ChartTabs = ({ tab, setTab }: { tab: string | undefined; setTab: (tab: string) => void }) => {
  return <Tabs options={TABS_OPTIONS} selectedValue={tab} onChange={setTab} />;
};
