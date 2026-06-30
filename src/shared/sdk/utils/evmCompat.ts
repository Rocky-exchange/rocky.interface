export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type Abi = readonly unknown[];
export type PublicClient = any;
export type WalletClient = any;
export type ClientConfig = any;
export type MulticallBatchOptions = any;

export type Chain = {
  id: number;
  name: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls?: Record<string, { http: string[] }>;
  blockExplorers?: Record<string, { name: string; url: string }>;
  contracts?: Record<string, unknown>;
};

export const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
export const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash;
export const maxUint256 = (2n ** 256n - 1n) as bigint;
export const erc20Abi = [] as Abi;

export function defineChain<T extends Chain>(chain: T): T {
  return chain;
}

function disabledClient() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "extend") {
          return () => disabledClient();
        }

        return () => {
          throw new Error("EVM clients are disabled in the Canton runtime");
        };
      },
    }
  );
}

export function http(..._args: unknown[]) {
  return {};
}

export function createPublicClient(..._args: unknown[]) {
  return disabledClient();
}

export function createWalletClient(..._args: unknown[]) {
  return disabledClient();
}

export function createTestClient(..._args: unknown[]) {
  return disabledClient();
}

export const publicActions = {};
export const walletActions = {};

export async function withRetry<T>(
  fn: () => Promise<T> | T,
  opts: {
    retryCount?: number;
    delay?: number;
    shouldRetry?: (params: { error: any }) => boolean;
  } = {}
): Promise<T> {
  const retryCount = opts.retryCount ?? 0;
  let attempt = 0;
  let lastError: any;

  while (attempt <= retryCount) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt > retryCount || opts.shouldRetry?.({ error }) === false) {
        break;
      }

      if (opts.delay) {
        await new Promise((resolve) => setTimeout(resolve, opts.delay));
      }
    }
  }

  throw lastError;
}

export function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isAddressEqual(a: Address, b: Address) {
  return a.toLowerCase() === b.toLowerCase();
}

export function getAddress(value: string): Address {
  return value as Address;
}

export function parseUnits(value: string, decimals: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedFraction = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const unsignedWhole = whole.replace(/^-/, "") || "0";
  return sign * (BigInt(unsignedWhole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0"));
}

export function formatUnits(value: bigint, decimals: number): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function encodeFunctionData(..._args: unknown[]): Hash {
  return "0x" as Hash;
}

export function encodeAbiParameters(..._args: unknown[]): Hash {
  return "0x" as Hash;
}

export function decodeErrorResult<T = unknown>(..._args: unknown[]): { errorName: string; args: any[] } {
  throw new Error("EVM ABI decoding is disabled in the Canton runtime");
}

export function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToString(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function stringToHex(value: string): Hash {
  return bytesToHex(stringToBytes(value));
}

export function hexToBytes(value: string): Uint8Array {
  const clean = value.replace(/^0x/, "");
  const bytes = new Uint8Array(Math.ceil(clean.length / 2));

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2).padEnd(2, "0"), 16);
  }

  return bytes;
}

export function bytesToHex(value: Uint8Array): Hash {
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hash;
}

export function padHex(value: string, opts: { size: number; dir?: "left" | "right" }): Hash {
  const clean = value.replace(/^0x/, "");
  const targetLength = opts.size * 2;
  const padded =
    opts.dir === "right" ? clean.padEnd(targetLength, "0") : clean.padStart(targetLength, "0");
  return `0x${padded.slice(0, targetLength)}` as Hash;
}

export function keccak256(value: string | Uint8Array): Hash {
  const bytes = typeof value === "string" ? stringToBytes(value) : value;
  let hash = 0xcbf29ce484222325n;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & ((1n << 256n) - 1n);
  }

  return `0x${hash.toString(16).padStart(64, "0")}` as Hash;
}

export const base = defineChain({ id: 8453, name: "Base" });
export const optimismSepolia = defineChain({ id: 11155420, name: "Optimism Sepolia" });
export const sepolia = defineChain({ id: 11155111, name: "Sepolia" });
export const bsc = defineChain({ id: 56, name: "BNB" });
