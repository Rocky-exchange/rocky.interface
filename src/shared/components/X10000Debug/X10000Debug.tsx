/**
 * X10000 Debug Panel
 *
 * This component shows API connection status and test calls
 * Only shown in development mode on the /trade route
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useLocation } from "react-router-dom";

import { useChainId } from "lib/chains";
import { getServerBaseUrl } from "config/backend";
import { getMarkets, getTicker } from "@/modules/cex/lib/api/client";
import {
  isAuthenticated,
  getNonce,
  getOrders,
  getPositions,
} from "@/modules/cex/lib/api/custom/client";
import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";

import "./X10000Debug.scss";

interface ApiTestResult {
  name: string;
  status: "pending" | "success" | "error";
  data?: unknown;
  error?: string;
  latency?: number;
}

export function X10000Debug() {
  const { chainId } = useChainId();
  const { address } = useAccount();
  const location = useLocation();
  const [results, setResults] = useState<ApiTestResult[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  // Check if we're on /trade route
  const isOnX10000Route = location.pathname.startsWith("/trade");
  const isX10000 = isX10000ModeActive() || isOnX10000Route;
  const authenticated = isAuthenticated(address, chainId);

  const runTests = useCallback(async () => {
    if (!chainId) return;
    const tests: ApiTestResult[] = [];

    // Test 1: Health check
    try {
      const start = Date.now();
      const baseUrl = getServerBaseUrl(chainId);
      const response = await fetch(`${baseUrl}/health`);
      const latency = Date.now() - start;
      tests.push({
        name: "Health Check",
        status: response.ok ? "success" : "error",
        data: response.ok ? "Backend is healthy" : `Status: ${response.status}`,
        latency,
      });
    } catch (e) {
      tests.push({
        name: "Health Check",
        status: "error",
        error: (e as Error).message,
      });
    }

    // Test 2: Get Markets (Public API)
    try {
      const start = Date.now();
      const markets = await getMarkets(chainId);
      const latency = Date.now() - start;
      const count = Array.isArray(markets) ? markets.length : 0;
      const symbols = Array.isArray(markets) ? markets.slice(0, 3).map((m) => m.symbol).join(", ") : "";
      tests.push({
        name: "Get Markets",
        status: "success",
        data: `${count} markets: ${symbols}${count > 3 ? "..." : ""}`,
        latency,
      });
    } catch (e) {
      tests.push({
        name: "Get Markets",
        status: "error",
        error: (e as Error).message,
      });
    }

    // Test 3: Get Ticker (Public API)
    try {
      const start = Date.now();
      const ticker = await getTicker(chainId, "BTC-USD");
      const latency = Date.now() - start;
      tests.push({
        name: "Get Ticker (BTC-USD)",
        status: "success",
        data: `Price: ${ticker.last_price}`,
        latency,
      });
    } catch (e) {
      tests.push({
        name: "Get Ticker (BTC-USD)",
        status: "error",
        error: (e as Error).message,
      });
    }

    // Test 4: Get Nonce (requires address)
    if (address) {
      try {
        const start = Date.now();
        const nonceResp = await getNonce(chainId, address);
        const latency = Date.now() - start;
        const nonceStr = typeof nonceResp.nonce === "string" ? nonceResp.nonce : JSON.stringify(nonceResp);
        tests.push({
          name: "Get Nonce",
          status: "success",
          data: `Nonce: ${nonceStr.substring(0, 20)}...`,
          latency,
        });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : JSON.stringify(e);
        tests.push({
          name: "Get Nonce",
          status: "error",
          error: errMsg,
        });
      }
    } else {
      tests.push({
        name: "Get Nonce",
        status: "pending",
        data: "Connect wallet first",
      });
    }

    // Test 5: Get Positions (requires auth)
    if (authenticated) {
      try {
        const start = Date.now();
        const positions = await getPositions(chainId);
        const latency = Date.now() - start;
        tests.push({
          name: "Get Positions",
          status: "success",
          data: `Found ${positions.positions.length} positions`,
          latency,
        });
      } catch (e) {
        tests.push({
          name: "Get Positions",
          status: "error",
          error: (e as Error).message,
        });
      }
    } else {
      tests.push({
        name: "Get Positions",
        status: "pending",
        data: "Login required",
      });
    }

    // Test 6: Get Orders (requires auth)
    if (authenticated) {
      try {
        const start = Date.now();
        const orders = await getOrders(chainId);
        const latency = Date.now() - start;
        tests.push({
          name: "Get Orders",
          status: "success",
          data: `Found ${orders.orders.length} orders`,
          latency,
        });
      } catch (e) {
        tests.push({
          name: "Get Orders",
          status: "error",
          error: (e as Error).message,
        });
      }
    } else {
      tests.push({
        name: "Get Orders",
        status: "pending",
        data: "Login required",
      });
    }

    setResults(tests);
  }, [chainId, address, authenticated]);

  useEffect(() => {
    runTests();
  }, [runTests, refreshCount]);

  const handleRefresh = () => {
    setRefreshCount((c) => c + 1);
  };

  // Only show in development and on /trade route
  if (import.meta.env.PROD || !isX10000) {
    return null;
  }

  if (!isVisible) {
    return (
      <button className="X10000Debug-toggle" onClick={() => setIsVisible(true)}>
        Show Debug
      </button>
    );
  }

  return (
    <div className="X10000Debug">
      <div className="X10000Debug-header">
        <h3>X10000 API Debug</h3>
        <div className="X10000Debug-header-buttons">
          <button onClick={handleRefresh}>Refresh</button>
          <button onClick={() => setIsVisible(false)}>Hide</button>
        </div>
      </div>
      <div className="X10000Debug-info">
        <div>Chain ID: {chainId}</div>
        <div>Backend: {chainId ? getServerBaseUrl(chainId) : "N/A"}</div>
        <div>X10000 Mode: {isX10000 ? "Active" : "Inactive"}</div>
        <div>Authenticated: {authenticated ? "Yes" : "No"}</div>
        <div>Wallet: {address ? `${address.substring(0, 8)}...` : "Not connected"}</div>
      </div>
      <div className="X10000Debug-results">
        {results.map((result, index) => (
          <div key={index} className={`X10000Debug-result X10000Debug-result--${result.status}`}>
            <div className="X10000Debug-result-name">{result.name}</div>
            <div className="X10000Debug-result-status">
              {result.status === "success" && "✓"}
              {result.status === "error" && "✗"}
              {result.status === "pending" && "○"}
            </div>
            <div className="X10000Debug-result-data">
              {result.error || result.data}
              {result.latency && <span className="latency"> ({result.latency}ms)</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
