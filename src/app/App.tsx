import "@wagmi/connectors";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SWRConfig } from "swr";

import "react-toastify/dist/ReactToastify.css";
import "styles/Font.css";
import "styles/Input.css";
import "styles/Shared.scss";
import "styles/recharts.css";
import "styles/DeprecatedExchageStyles.scss";
import "components/Card/Card.css";
import "./App.scss";

// Global Providers (app-level)
import {
  ThemeProvider,
  GlobalStateProvider,
  SettingsContextProvider,
  WebsocketContextProvider,
  ChainContextProvider,
  PendingTxnsContextProvider,
} from "./providers";

// DEX-specific Providers
import { GmxAccountContextProvider } from "context/GmxAccountContext/GmxAccountContext";
import { SorterContextProvider } from "context/SorterContext/SorterContextProvider";
import { SubaccountContextProvider } from "context/SubaccountContext/SubaccountContextProvider";
import { SyntheticsEventsProvider } from "context/SyntheticsEvents";
import { TokenPermitsContextProvider } from "context/TokenPermitsContext/TokenPermitsContextProvider";
import { TokensBalancesContextProvider } from "context/TokensBalancesContext/TokensBalancesContextProvider";
import { TokensFavoritesContextProvider } from "context/TokensFavoritesContext/TokensFavoritesContextProvider";

// CEX-specific Providers
import { WebSocketProvider as ZtdxWebSocketProvider } from "context/ApiWebSocketContext";
import { useChainId } from "lib/chains";
import { RainbowKitProviderWrapper } from "lib/wallets/WalletProvider";

import SEO from "components/Seo/SEO";

import { AppRoutes } from "./AppRoutes";
import { SWRConfigProp } from "./swrConfig";

// @ts-ignore
if (window?.ethereum?.autoRefreshOnNetworkChange) {
  // @ts-ignore
  window.ethereum.autoRefreshOnNetworkChange = false;
}

function SWRConfigWithKey({ children }: { children: React.ReactNode }) {
  const { chainId } = useChainId();
  return (
    <SWRConfig key={chainId} value={SWRConfigProp}>
      {children}
    </SWRConfig>
  );
}

function App() {
  let app = <AppRoutes />;
  app = <SorterContextProvider>{app}</SorterContextProvider>;
  app = <TokensFavoritesContextProvider>{app}</TokensFavoritesContextProvider>;
  app = <SyntheticsEventsProvider>{app}</SyntheticsEventsProvider>;
  app = <SubaccountContextProvider>{app}</SubaccountContextProvider>;
  app = <TokenPermitsContextProvider>{app}</TokenPermitsContextProvider>;
  app = <TokensBalancesContextProvider>{app}</TokensBalancesContextProvider>;
  app = <WebsocketContextProvider>{app}</WebsocketContextProvider>;
  app = <ZtdxWebSocketProvider>{app}</ZtdxWebSocketProvider>;
  app = <SEO>{app}</SEO>;
  app = <RainbowKitProviderWrapper>{app}</RainbowKitProviderWrapper>;
  app = <I18nProvider i18n={i18n as any}>{app}</I18nProvider>;
  app = <PendingTxnsContextProvider>{app}</PendingTxnsContextProvider>;
  app = <SWRConfigWithKey>{app}</SWRConfigWithKey>;
  app = <SettingsContextProvider>{app}</SettingsContextProvider>;
  app = <GlobalStateProvider>{app}</GlobalStateProvider>;
  app = <ChainContextProvider>{app}</ChainContextProvider>;
  app = <GmxAccountContextProvider>{app}</GmxAccountContextProvider>;
  app = <ThemeProvider>{app}</ThemeProvider>;

  return app;
}

export default App;
