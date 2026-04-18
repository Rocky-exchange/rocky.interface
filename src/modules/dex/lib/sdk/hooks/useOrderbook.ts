/**
 * Orderbook Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { getOrderbook } from '../api/rest/market';
import type { Orderbook, OrderbookLevel } from '../types';

export interface UseOrderbookReturn {
  orderbook: Orderbook | null;
  isLoading: boolean;
  error: string | null;
}

export function useOrderbook(symbol: string): UseOrderbookReturn {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial orderbook
  useEffect(() => {
    if (!symbol) return;

    setIsLoading(true);
    setError(null);

    getOrderbook(symbol)
      .then((response) => {
        if (response.success && response.data) {
          setOrderbook({
            symbol: response.data.symbol,
            bids: response.data.bids.map(([price, amount]) => ({ price, amount })),
            asks: response.data.asks.map(([price, amount]) => ({ price, amount })),
            timestamp: response.data.timestamp,
          });
        } else {
          setError(response.error?.message || 'Failed to fetch orderbook');
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [symbol]);

  // Subscribe to orderbook updates
  useEffect(() => {
    if (!symbol || !isConnected) return;

    const channel = `orderbook.${symbol}`;

    const handleUpdate = (data: unknown) => {
      const update = data as {
        bids: [string, string][];
        asks: [string, string][];
        timestamp: number;
      };

      setOrderbook((prev) => ({
        symbol,
        bids: update.bids.map(([price, amount]) => ({ price, amount })),
        asks: update.asks.map(([price, amount]) => ({ price, amount })),
        timestamp: update.timestamp,
      }));
    };

    subscribe(channel, handleUpdate);

    return () => {
      unsubscribe(channel, handleUpdate);
    };
  }, [symbol, isConnected, subscribe, unsubscribe]);

  return {
    orderbook,
    isLoading,
    error,
  };
}
