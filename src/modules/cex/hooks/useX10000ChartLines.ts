/**
 * useX10000ChartLines Hook
 *
 * Provides chart lines (entry, liquidation, TP/SL) for x10000 mode TradingView chart.
 * Fetches TP/SL settings from API and converts them to StaticChartLine format.
 */

import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { t } from "@lingui/macro";

import { selectPositionsInfoData } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useX10000State } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { getPositionTpSl } from "@/modules/cex/lib/api/custom/client";
import { TpSlResponse } from "@/modules/cex/lib/api/types";
import { useChainId } from "lib/chains";
import { EMPTY_ARRAY } from "lib/objects";

import type { StaticChartLine } from "components/TVChartContainer/types";

// Refresh interval for TP/SL data (5 seconds)
const TPSL_REFRESH_INTERVAL = 5000;

/**
 * Fetches TP/SL data for all positions matching current symbol
 * Includes periodic refresh to pick up new TP/SL orders
 */
function usePositionsTpSl(
  chainId: number,
  positionIds: string[]
): Map<string, TpSlResponse | null> {
  const [tpSlMap, setTpSlMap] = useState<Map<string, TpSlResponse | null>>(new Map());
  const positionIdsRef = useRef<string[]>([]);

  // Update ref when positionIds change
  positionIdsRef.current = positionIds;

  const fetchTpSl = useCallback(async () => {
    const ids = positionIdsRef.current;
    if (ids.length === 0) {
      setTpSlMap(new Map());
      return;
    }

    const results = new Map<string, TpSlResponse | null>();

    await Promise.all(
      ids.map(async (positionId) => {
        try {
          const tpSl = await getPositionTpSl(chainId, positionId);
          results.set(positionId, tpSl);
        } catch {
          // Position may not have TP/SL set
          results.set(positionId, null);
        }
      })
    );

    setTpSlMap(results);
  }, [chainId]);

  // Initial fetch and fetch when positionIds change
  useEffect(() => {
    fetchTpSl();
  }, [fetchTpSl, positionIds.join(",")]);

  // Periodic refresh to pick up new TP/SL orders
  useEffect(() => {
    if (positionIds.length === 0) return;

    const intervalId = setInterval(fetchTpSl, TPSL_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchTpSl, positionIds.length]);

  return tpSlMap;
}

/**
 * Hook to get chart lines for x10000 mode
 * Returns entry, liquidation, take profit, and stop loss lines
 */
export function useX10000ChartLines(): StaticChartLine[] {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  const positionsInfoData = useSelector(selectPositionsInfoData);

  // Extract base asset from selected symbol (e.g., "BTC-USD" -> "BTC")
  const baseAsset = useMemo(() => {
    if (!selectedSymbol) return null;
    return selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
  }, [selectedSymbol]);

  // Filter positions matching current symbol
  const matchingPositions = useMemo(() => {
    if (!baseAsset || !positionsInfoData) return [];

    const positions = Object.values(positionsInfoData);

    const matched = positions.filter((position) => {
      // Try multiple ways to get the symbol
      const marketSymbol = position.marketInfo?.indexToken?.symbol?.toUpperCase()
        || position.indexToken?.symbol?.toUpperCase();
      return marketSymbol === baseAsset;
    });

    return matched;
  }, [baseAsset, positionsInfoData]);

  // Get position IDs for TP/SL fetch
  const positionIds = useMemo(() => {
    return matchingPositions.map((p) => p.originalPositionId).filter(Boolean) as string[];
  }, [matchingPositions]);

  // Fetch TP/SL data for all matching positions
  const tpSlMap = usePositionsTpSl(chainId, positionIds);

  // Build chart lines
  const chartLines = useMemo<StaticChartLine[]>(() => {
    if (matchingPositions.length === 0) return EMPTY_ARRAY;

    const lines: StaticChartLine[] = [];

    matchingPositions.forEach((position) => {
      const longOrShort = position.isLong ? t`Long` : t`Short`;
      const symbol = position.marketInfo?.indexToken?.symbol || "";

      // Entry price line
      if (position.entryPrice) {
        const entryPriceNum = Number(position.entryPrice) / 1e30;
        if (entryPriceNum > 0) {
          lines.push({
            title: t`Entry ${longOrShort} ${symbol}`,
            price: entryPriceNum,
          });
        }
      }

      // Liquidation price line
      if (position.liquidationPrice) {
        const liqPriceNum = Number(position.liquidationPrice) / 1e30;
        if (liqPriceNum > 0) {
          lines.push({
            title: t`Liq. ${longOrShort} ${symbol}`,
            price: liqPriceNum,
          });
        }
      }

      // TP/SL lines from API data
      const positionId = position.originalPositionId;
      if (positionId) {
        const tpSlData = tpSlMap.get(positionId);
        if (tpSlData) {
          // Take Profit line - green color (matching K-line up color)
          if (tpSlData.take_profit_price) {
            const tpPrice = parseFloat(tpSlData.take_profit_price);
            if (tpPrice > 0) {
              lines.push({
                title: t`TP ${longOrShort} ${symbol}`,
                price: tpPrice,
                color: "#0FDE8D", // Green - K-line up color
              });
            }
          }

          // Stop Loss line - red color (matching K-line down color)
          if (tpSlData.stop_loss_price) {
            const slPrice = parseFloat(tpSlData.stop_loss_price);
            if (slPrice > 0) {
              lines.push({
                title: t`SL ${longOrShort} ${symbol}`,
                price: slPrice,
                color: "#FF506A", // Red - K-line down color
              });
            }
          }
        }
      }
    });

    return lines;
  }, [matchingPositions, tpSlMap]);

  return chartLines;
}
