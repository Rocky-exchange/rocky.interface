import { useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useHistory, useLocation } from "react-router-dom";

import { SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY, CURRENT_PROVIDER_LOCALSTORAGE_KEY } from "config/localStorage";
import { useGmxAccountModalOpen } from "context/GmxAccountContext/hooks";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import { userAnalytics } from "lib/userAnalytics";
import { DisconnectWalletEvent } from "lib/userAnalytics/types";
import { disconnectAllWebSockets } from "modules/cex/lib/api/custom/websocket";
import { logout as apiLogout } from "modules/cex/lib/api/custom/client";

export function useDisconnectAndClose() {
  const { setIsSettingsVisible } = useSettings();
  const [, setIsVisible] = useGmxAccountModalOpen();
  const { disconnect } = useDisconnect();
  const { address, connector: activeConnector } = useAccount();
  const history = useHistory();
  const location = useLocation();

  const handleDisconnect = useCallback(() => {
    // Clean up WebSocket connections first to prevent "CLOSING or CLOSED" errors
    disconnectAllWebSockets();

    // Clear API auth tokens
    apiLogout(address);

    // Disconnect with the active connector to ensure full cleanup
    if (activeConnector) {
      disconnect({ connector: activeConnector });
    } else {
      disconnect();
    }

    userAnalytics.pushEvent<DisconnectWalletEvent>({
      event: "ConnectWalletAction",
      data: {
        action: "Disconnect",
      },
    });
    localStorage.removeItem(SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY);
    localStorage.removeItem(CURRENT_PROVIDER_LOCALSTORAGE_KEY);

    // Clear wagmi persisted store to prevent stale connector state on reconnect
    localStorage.removeItem("wagmi.store");
    localStorage.removeItem("wagmi.recentConnectorId");

    setIsVisible(false);
    setIsSettingsVisible(false);

    // If on accounts page, redirect to /accounts to show connect wallet prompt
    if (location.pathname.startsWith("/accounts")) {
      setTimeout(() => {
        history.push("/accounts");
      }, 1000);
    }
  }, [disconnect, activeConnector, address, setIsVisible, setIsSettingsVisible, history, location]);

  return handleDisconnect;
}
