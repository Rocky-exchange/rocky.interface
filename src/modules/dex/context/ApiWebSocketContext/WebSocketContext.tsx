/**
 * WebSocketContext - Global WebSocket state management
 * Provides real-time data updates throughout the application
 */

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { isAuthenticated } from "@/modules/cex/lib/api/custom/client";
import {
  getWebSocketService,
  WsPositionUpdate,
  WsOrderUpdate,
  WsBalanceUpdate,
  WsPriceUpdate,
  WsConnectionStatus,
} from "@/modules/cex/lib/api";

interface WebSocketContextValue {
  // Connection state
  status: WsConnectionStatus;
  isConnected: boolean;

  // Latest updates
  lastPositionUpdate: WsPositionUpdate | null;
  lastOrderUpdate: WsOrderUpdate | null;
  lastBalanceUpdate: WsBalanceUpdate | null;
  prices: Record<string, WsPriceUpdate>;

  // Update counters (for triggering re-fetches)
  positionUpdateCount: number;
  orderUpdateCount: number;
  balanceUpdateCount: number;

  // Actions
  connect: () => void;
  disconnect: () => void;
  subscribePrices: (symbols: string[]) => void;
  unsubscribePrices: (symbols: string[]) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within WebSocketProvider");
  }
  return context;
}

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { chainId, address } = useAccount();
  const authenticated = isAuthenticated(address);

  // Connection state
  const [status, setStatus] = useState<WsConnectionStatus>("disconnected");

  // Latest updates
  const [lastPositionUpdate, setLastPositionUpdate] = useState<WsPositionUpdate | null>(null);
  const [lastOrderUpdate, setLastOrderUpdate] = useState<WsOrderUpdate | null>(null);
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<WsBalanceUpdate | null>(null);
  const [prices, setPrices] = useState<Record<string, WsPriceUpdate>>({});

  // Update counters
  const [positionUpdateCount, setPositionUpdateCount] = useState(0);
  const [orderUpdateCount, setOrderUpdateCount] = useState(0);
  const [balanceUpdateCount, setBalanceUpdateCount] = useState(0);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!chainId) return;

    const ws = getWebSocketService(chainId);
    setStatus("connecting");
    ws.connect();
  }, [chainId]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (!chainId) return;

    const ws = getWebSocketService(chainId);
    ws.disconnect();
    setStatus("disconnected");
  }, [chainId]);

  // Subscribe to price updates
  const subscribePrices = useCallback(
    (symbols: string[]) => {
      if (!chainId) return;

      const ws = getWebSocketService(chainId);
      ws.subscribePrices(symbols);
    },
    [chainId]
  );

  // Unsubscribe from price updates
  const unsubscribePrices = useCallback(
    (symbols: string[]) => {
      if (!chainId) return;

      const ws = getWebSocketService(chainId);
      ws.unsubscribePrices(symbols);
    },
    [chainId]
  );

  // Setup WebSocket connection and handlers
  useEffect(() => {
    if (!chainId) {
      setStatus("disconnected");
      return;
    }

    const ws = getWebSocketService(chainId);

    // Connection handlers
    const unsubConnect = ws.onConnect(() => {
      setStatus("connected");

      // Auto-subscribe to private channels if authenticated
      if (authenticated && address) {
        ws.authenticate(address);
        ws.subscribePositions(address);
        ws.subscribeOrders(address);
        ws.subscribeBalances(address);
      }
    });

    const unsubDisconnect = ws.onDisconnect(() => {
      setStatus("disconnected");
    });

    const unsubError = ws.onError(() => {
      setStatus("error");
    });

    // Data handlers
    const unsubPosition = ws.onPositionUpdate((update) => {
      setLastPositionUpdate(update);
      setPositionUpdateCount((c) => c + 1);
    });

    const unsubOrder = ws.onOrderUpdate((update) => {
      setLastOrderUpdate(update);
      setOrderUpdateCount((c) => c + 1);
    });

    const unsubBalance = ws.onBalanceUpdate((update) => {
      setLastBalanceUpdate(update);
      setBalanceUpdateCount((c) => c + 1);
    });

    const unsubPrice = ws.onPriceUpdate((update) => {
      setPrices((prev) => ({
        ...prev,
        [update.symbol]: update,
      }));
    });

    // Connect
    setStatus("connecting");
    ws.connect();

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubError();
      unsubPosition();
      unsubOrder();
      unsubBalance();
      unsubPrice();
    };
  }, [chainId, authenticated, address]);

  // Re-subscribe to private channels when authentication changes
  useEffect(() => {
    if (!chainId || status !== "connected") return;

    const ws = getWebSocketService(chainId);

    if (authenticated && address) {
      ws.authenticate(address);
      ws.subscribePositions(address);
      ws.subscribeOrders(address);
      ws.subscribeBalances(address);
    } else {
      ws.unsubscribePositions();
      ws.unsubscribeOrders();
      ws.unsubscribeBalances();
    }
  }, [chainId, authenticated, status, address]);

  const value = useMemo<WebSocketContextValue>(
    () => ({
      status,
      isConnected: status === "connected",
      lastPositionUpdate,
      lastOrderUpdate,
      lastBalanceUpdate,
      prices,
      positionUpdateCount,
      orderUpdateCount,
      balanceUpdateCount,
      connect,
      disconnect,
      subscribePrices,
      unsubscribePrices,
    }),
    [
      status,
      lastPositionUpdate,
      lastOrderUpdate,
      lastBalanceUpdate,
      prices,
      positionUpdateCount,
      orderUpdateCount,
      balanceUpdateCount,
      connect,
      disconnect,
      subscribePrices,
      unsubscribePrices,
    ]
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

/**
 * Hook to trigger SWR revalidation on WebSocket updates
 */
export function useWsRevalidationKey(type: "positions" | "orders" | "balances"): number {
  const context = useWebSocketContext();

  switch (type) {
    case "positions":
      return context.positionUpdateCount;
    case "orders":
      return context.orderUpdateCount;
    case "balances":
      return context.balanceUpdateCount;
    default:
      return 0;
  }
}
