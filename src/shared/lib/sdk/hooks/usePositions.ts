/**
 * Positions Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { getPositions } from '../api/rest/account';
import type { Position } from '../types';

export interface UsePositionsReturn {
  positions: Position[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePositions(): UsePositionsReturn {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getPositions();
      if (response.success && response.data) {
        setPositions(
          response.data.positions.map((p) => ({
            id: p.positionId,
            symbol: p.symbol,
            side: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            leverage: p.leverage,
            liquidationPrice: p.liquidationPrice,
            margin: p.margin,
            unrealizedPnl: p.unrealizedPnl,
            unrealizedPnlPercent: p.unrealizedPnlPercent,
            realizedPnl: p.realizedPnl,
          }))
        );
      } else {
        setError(response.error?.message || 'Failed to fetch positions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Subscribe to position updates
  useEffect(() => {
    if (!isConnected) return;

    const handleUpdate = (data: unknown) => {
      const update = data as {
        positionId: string;
        symbol: string;
        side: 'long' | 'short';
        size: string;
        entryPrice: string;
        markPrice: string;
        unrealizedPnl: string;
        unrealizedPnlPercent: string;
        liquidationPrice: string;
      };

      setPositions((prev) => {
        const index = prev.findIndex((p) => p.id === update.positionId);
        if (index >= 0) {
          // Update existing position
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            markPrice: update.markPrice,
            unrealizedPnl: update.unrealizedPnl,
            unrealizedPnlPercent: update.unrealizedPnlPercent,
          };
          return updated;
        }
        return prev;
      });
    };

    subscribe('positions', handleUpdate);

    return () => {
      unsubscribe('positions', handleUpdate);
    };
  }, [isConnected, subscribe, unsubscribe]);

  return {
    positions,
    isLoading,
    error,
    refresh: fetchPositions,
  };
}
