import { connect } from "@console-wallet/dapp-sdk/dist/esm/requests/connect.js";
import consoleWalletSdkPackage from "@console-wallet/dapp-sdk/package.json";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("localforage", () => ({
  default: {
    INDEXEDDB: "INDEXEDDB",
    createInstance: () => ({
      clear: vi.fn(),
      getItem: vi.fn(),
      ready: vi.fn(async () => undefined),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    }),
  },
}));

type WalletRequest = {
  capability?: string;
  id: string;
  sdkVersion: string;
  target: string;
  type: string;
};

describe("Console Wallet SDK protocol", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies Canton capability when connecting to the browser extension", async () => {
    const requests: WalletRequest[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: WalletRequest) => {
      requests.push(message);
      const responseType = `${message.type}_RESPONSE`;
      const data = message.type === "CONNECT" ? { isConnected: true } : { isConnected: false };
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: {
              data,
              id: message.id,
              target: message.target,
              type: responseType,
            },
            source: window,
          }),
        );
      });
    });

    await expect(
      connect({
        name: "Rocky Exchange",
        target: "local",
      }),
    ).resolves.toMatchObject({ isConnected: true });

    const connectRequest = requests.find((request) => request.type === "CONNECT");
    expect(connectRequest).toMatchObject({
      capability: "Canton",
    });
    expect(isVersionAtLeast(connectRequest?.sdkVersion, "2.2.6")).toBe(true);
    expect(isVersionAtLeast(consoleWalletSdkPackage.version, "2.2.8")).toBe(true);
  });
});

function isVersionAtLeast(actual: string | undefined, minimum: string): boolean {
  if (!actual) return false;
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart !== minimumPart) return actualPart > minimumPart;
  }
  return true;
}
