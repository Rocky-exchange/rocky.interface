import useSWR from "swr";

import { fetchFundingAccountBalance } from "@/shared/lib/canton-wallet/funds";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

/**
 * 读取用户账户 Available to Trade(USD 值)。
 * 直接读取 Futures Account 的 CUSD available — 与 preview 独立,不依赖订单表单输入。
 * 未连钱包 / 未认证时返回 null。
 */
export function useAvailableBalanceAdapter(): {
  available: number | null;
  loading: boolean;
  setAvailable: (value: number) => void;
} {
  const { connected, party, username } = useCantonSession();
  const accountKey = connected ? party || username || "canton-session" : null;
  const { data, isLoading, mutate } = useSWR<number | null>(
    accountKey ? ["futures-usda-available", accountKey] : null,
    fetchFundingAccountBalance,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: 10000,
    }
  );

  const available = data != null && Number.isFinite(data) ? data : null;
  const setAvailable = (value: number) => {
    void mutate(value, false);
  };

  return { available, loading: isLoading, setAvailable };
}
