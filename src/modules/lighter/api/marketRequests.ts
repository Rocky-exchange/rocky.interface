export const MARKET_DATA_REQUEST_TIMEOUT_MS = 8000;

const inFlightMarketRequests = new Map<string, Promise<unknown>>();

export function marketDataRequest<T>(
  key: string,
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = MARKET_DATA_REQUEST_TIMEOUT_MS
): Promise<T> {
  const inFlight = inFlightMarketRequests.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const promise = requestWithTimeout(request, timeoutMs).finally(() => {
    if (inFlightMarketRequests.get(key) === promise) {
      inFlightMarketRequests.delete(key);
    }
  });
  inFlightMarketRequests.set(key, promise);
  return promise;
}

function requestWithTimeout<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return Promise.resolve()
    .then(() => request(controller.signal))
    .finally(() => {
      globalThis.clearTimeout(timeoutId);
    });
}
