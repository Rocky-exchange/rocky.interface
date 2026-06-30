import { t } from "@lingui/macro";
import { useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import { cancelOrder, cancelTriggerOrder } from "../api/custom/client";
import type { Order } from "../api/types";

function isTriggerOrder(order: Pick<Order, "trigger_type">) {
  return Boolean(order.trigger_type);
}

export function useCancelApiOrder() {
  const { chainId } = useChainId();
  const cantonSession = useCantonSession();
  const accountKey = useMemo(
    () => (cantonSession.connected ? cantonSession.party || cantonSession.username || "canton-session" : undefined),
    [cantonSession.connected, cantonSession.party, cantonSession.username]
  );
  const { mutate } = useSWRConfig();

  const cancel = useCallback(
    async (order: Pick<Order, "id" | "trigger_type">) => {
      if (!chainId) {
        throw new Error("Chain unavailable");
      }
      if (!accountKey) {
        helperToast.error(t`Please connect your wallet first`);
        throw new Error("Canton wallet session required");
      }

      const orderId = String(order.id);

      if (isTriggerOrder(order)) {
        await cancelTriggerOrder(chainId, orderId, accountKey);
      } else {
        await cancelOrder(
          chainId,
          orderId,
          {
            signature: "canton-session",
            timestamp: Math.floor(Date.now() / 1000),
          },
          accountKey
        );
      }

      await Promise.all([
        mutate((key) => Array.isArray(key) && String(key[0]).includes("orders"), undefined, { revalidate: true }),
        mutate((key) => Array.isArray(key) && String(key[0]).includes("positions"), undefined, { revalidate: true }),
      ]);

      helperToast.success(t`Order canceled`);
    },
    [accountKey, chainId, mutate]
  );

  return { cancel };
}
