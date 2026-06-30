import { useMemo } from "react";

import { useApiOrders } from "@/modules/lighter/api";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";

import { formatExpiry, mapApiOrderToLighterOpenOrder, type LighterOpenOrder } from "./lighterOpenOrders";

export type { LighterOpenOrder } from "./lighterOpenOrders";

export function useOpenOrdersAdapter(): LighterOpenOrder[] {
  const { chainId } = useChainId();
  const cantonSession = useCantonSession();
  const accountKey = useMemo(
    () => (cantonSession.connected ? cantonSession.party || cantonSession.username || "canton-session" : undefined),
    [cantonSession.connected, cantonSession.party, cantonSession.username]
  );
  const { apiOrders } = useApiOrders(chainId, accountKey);

  return useMemo(() => {
    const list = apiOrders;
    if (!list?.length) return [];

    return list
      .filter((order) => {
        const status = (order.status || "").toLowerCase();
        return status === "open" || status === "pending" || status === "partially_filled";
      })
      .map((order) => ({
        ...mapApiOrderToLighterOpenOrder(order),
        expiresIn: order.expires_at ? formatExpiry(order.expires_at) : null,
      }));
  }, [apiOrders]);
}
