import { ARBITRUM, AVALANCHE, ARBITRUM_SEPOLIA } from "./chains";

export const GMX_STATS_API_URL = "https://stats.gmx.io/api";

// ============================================
// 统一的后端服务 URL 配置
// ============================================
// Same-origin by default: requests go to "/api/v1/*" on the current host,
// which nginx (prod) / vite proxy (dev) forwards to the demo Next.js compat routes.
const X10000_API_DOMAINS: Record<number, string> = {
  [ARBITRUM]: import.meta.env.VITE_PROXY_API_URL || "",
  [ARBITRUM_SEPOLIA]: import.meta.env.VITE_PROXY_SEPOLIA_API_URL || "",
};

// WebSocket URL (unused — live updates use REST polling; see X10000KlineDataFeed)
const X10000_WS_DOMAINS: Record<number, string> = {
  [ARBITRUM]: import.meta.env.VITE_PROXY_WS_URL || "",
  [ARBITRUM_SEPOLIA]: import.meta.env.VITE_PROXY_SEPOLIA_WS_URL || "",
};

// Legacy ZTDX 后端 URL（已弃用，保留兼容）
const ZTDX_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

const BACKEND_URLS: Record<number | string, string> = {
  default: ZTDX_BACKEND_URL,
  [ARBITRUM]: ZTDX_BACKEND_URL,
  [AVALANCHE]: ZTDX_BACKEND_URL,
  [ARBITRUM_SEPOLIA]: ZTDX_BACKEND_URL,
};

// ============================================
// 导出函数
// ============================================

/**
 * 获取 X10000 后端 API URL（根据链 ID 自动切换）
 */
export function getX10000BackendUrl(chainId: number): string {
  return X10000_API_DOMAINS[chainId] || X10000_API_DOMAINS[ARBITRUM];
}

/**
 * 获取 X10000 WebSocket URL（根据链 ID 自动切换）
 */
export function getX10000WsUrl(chainId: number): string {
  return X10000_WS_DOMAINS[chainId] || X10000_WS_DOMAINS[ARBITRUM];
}


/**
 * 获取积分系统 API URL（根据链 ID 自动切换）
 * 使用与理财接口相同的基础URL，拼接 /api/v1 路径
 */
export function getPointsApiUrl(chainId: number): string {
  const baseUrl = getX10000BackendUrl(chainId);
  return `${baseUrl}/api/v1`;
}

/**
 * 是否启用 X10000 数据模式
 * 当前始终返回 true
 */
function isX10000Mode(): boolean {
  return true;
}

export function getServerBaseUrl(chainId: number) {
  if (!chainId) {
    throw new Error("chainId is not provided");
  }

  // Force x10000 mode to use new backend URL (根据链 ID 自动切换)
  if (isX10000Mode()) {
    return getX10000BackendUrl(chainId);
  }

  if (document.location.hostname.includes("deploy-preview")) {
    const fromLocalStorage = localStorage.getItem("SERVER_BASE_URL");
    if (fromLocalStorage) {
      return fromLocalStorage;
    }
  }

  return BACKEND_URLS[chainId] || BACKEND_URLS.default;
}

export function getServerUrl(chainId: number, path: string) {
  return `${getServerBaseUrl(chainId)}${path}`;
}
