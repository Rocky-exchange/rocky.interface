import { spotApi, type Account } from "../api/spotClient";
import { useSpotAuthReady } from "../api/spotSession";
import { usePolling } from "./usePolling";

export function useSpotAccount() {
  const ready = useSpotAuthReady();
  const polling = usePolling<Account>(() => spotApi.account(), 2500, [], { enabled: ready });
  return { ready, account: polling.data, err: polling.err, refetch: polling.refetch };
}
