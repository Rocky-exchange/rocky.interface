/**
 * @deprecated EVM gas estimation is disabled in the Canton runtime.
 */
export async function getGasLimit(
  _contract: unknown,
  _method: string,
  _params: unknown[] = [],
  _value?: bigint | number,
  _from?: string
) {
  throw new Error("EVM gas estimation is disabled in the Canton runtime");
}

/**
 * @deprecated Kept for legacy tests and inactive EVM callers.
 */
export function getBestNonce(providers: { getNonce: (blockTag: "pending") => Promise<number> }[]): Promise<number> {
  const MAX_NONCE_NEEDED = 3;
  const MAX_WAIT = 5000;
  const ONE_MORE_WAIT = 1000;

  return new Promise(async (resolve, reject) => {
    const results: number[] = [];
    let resolved = false;

    const handleResolve = () => {
      resolved = true;

      if (results.length) {
        resolve(Math.max(...results));
      } else {
        reject(new Error("Failed to fetch nonce from any provider"));
      }
    };

    let timerId = setTimeout(handleResolve, MAX_WAIT);

    const setResolveTimeout = (time: number) => {
      clearTimeout(timerId);

      if (resolved) return;

      if (time) {
        timerId = setTimeout(handleResolve, time);
      } else {
        handleResolve();
      }
    };

    await Promise.all(
      providers.map((provider, i) =>
        provider
          .getNonce("pending")
          .then((nonce) => results.push(nonce))
          .then(() => {
            if (results.length === providers.length || results.length >= MAX_NONCE_NEEDED) {
              setResolveTimeout(0);
            } else {
              setResolveTimeout(ONE_MORE_WAIT);
            }
          })
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error(`Error fetching nonce from provider ${i}: ${error.message}`);
          })
      )
    );

    setResolveTimeout(0);
  });
}
