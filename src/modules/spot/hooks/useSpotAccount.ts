import useSWR from "swr";

import { getSpotCredentials, spotApi, type Account } from "../api/spotClient";
import { useSpotAuthReady } from "../api/spotSession";

export function useSpotAccount() {
  const ready = useSpotAuthReady();
  const credentials = ready ? getSpotCredentials() : null;
  const { data, error, mutate } = useSWR<Account>(
    credentials ? ["spot-account", credentials.key] : null,
    () => spotApi.account(),
    {
      dedupingInterval: 2000,
      refreshInterval: 5000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    }
  );

  return {
    ready,
    account: data ?? null,
    err: error ? (error instanceof Error ? error.message : String(error)) : null,
    refetch: () => {
      void mutate();
    },
  };
}
