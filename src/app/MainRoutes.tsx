import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "react-router-dom";

import LighterPortfolioPage from "@/modules/lighter/pages/LighterPortfolioPage";
import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";
import { LighterTradeRuntimeProviders } from "@/modules/lighter/providers/LighterTradeRuntimeProviders";
import { TradeStateProvider } from "@/modules/lighter/store/TradeStateContext/TradeStateContext";
import SpotTradePage from "@/modules/spot/pages/SpotTradePage";
import { RedirectWithQuery } from "@/shared/components/RedirectWithQuery/RedirectWithQuery";

import { TradingTerminalShell } from "./TradingTerminalShell";

const TRADING_ROUTE_PATHS = ["/trade", "/spot"];

const BonusPage = lazy(() =>
  import("@/modules/lighter/features/bonus/pages/BonusPage").then(({ BonusPage }) => ({ default: BonusPage }))
);
const RedeemCodePage = lazy(() =>
  import("@/modules/lighter/features/bonus/pages/RedeemCodePage").then(({ RedeemCodePage }) => ({
    default: RedeemCodePage,
  }))
);

export function MainRoutes({ openSettings: _openSettings }: { openSettings: () => void }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Switch>
      <Route exact path="/">
        <LighterTradeRuntimeProviders>
          <LighterPortfolioPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route path={TRADING_ROUTE_PATHS}>
        <TradingTerminalShell>
          <Switch>
            <Route exact path="/trade/:tradeType?">
              <LighterTradeRuntimeProviders>
                <TradeStateProvider>
                  <LighterTradePage />
                </TradeStateProvider>
              </LighterTradeRuntimeProviders>
            </Route>

            {/* Spot trading — CUSD symbols end-to-end (route, API, and display) via rocky-backend /api/v3 */}
            <Route exact path="/spot/:symbol?">
              <SpotTradePage />
            </Route>

            <Route>
              <RedirectWithQuery to="/trade" />
            </Route>
          </Switch>
        </TradingTerminalShell>
      </Route>

      <Route exact path="/portfolio">
        <LighterTradeRuntimeProviders>
          <LighterPortfolioPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/bonus">
        <LighterTradeRuntimeProviders>
          <Suspense fallback={null}>
            <BonusPage />
          </Suspense>
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/bonus/redeem">
        <LighterTradeRuntimeProviders>
          <Suspense fallback={null}>
            <RedeemCodePage />
          </Suspense>
        </LighterTradeRuntimeProviders>
      </Route>

      <Route>
        <RedirectWithQuery to="/trade" />
      </Route>
    </Switch>
  );
}
