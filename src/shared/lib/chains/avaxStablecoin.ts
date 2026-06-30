/**
 * AVAX C-Chain stablecoin awareness.
 *
 * Per D-AVAX-6 (Lee/CTO 2026-05-11):
 *   - Primit AVAX uses **USDT.e** (Avalanche Bridge wrapped USDT, address 0xc719...5118)
 *   - NOT native USDT (Tether direct issuance at 0x9702...8c7)
 *
 * These are TWO DIFFERENT TOKENS. A user who holds native USDT on AVAX
 * cannot directly deposit into Primit's Vault — they must first swap
 * native USDT → USDT.e on Trader Joe / Pangolin.
 *
 * This module helps the UI detect the situation and surface a clear
 * swap guidance to the user (PRD-2026-0511-001 §7.4 / §11).
 */

import { AVALANCHE } from "config/chains";

/**
 * USDT.e (Avalanche Bridge wrapped) — Primit's accepted collateral on AVAX.
 *
 * ⚠ W1 must verify on Snowtrace before any production deploy.
 */
export const AVAX_USDTE_ADDRESS = "0xc7198437980c041c805A1EDcbA50c1Ce5db95118".toLowerCase();

/**
 * Native USDT on AVAX (Tether direct deployment) — NOT accepted by Primit.
 * Source: https://tether.to/en/supported-protocols (verify periodically).
 */
export const AVAX_NATIVE_USDT_ADDRESS = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7".toLowerCase();

/**
 * Native USDC on AVAX (Circle direct deployment) — not used by Primit V1,
 * but listed for completeness in case user holds USDC.
 */
export const AVAX_NATIVE_USDC_ADDRESS = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e".toLowerCase();

export interface AvaxStablecoinHoldings {
  /** USDT.e balance in raw token units (6 decimals). */
  usdtEBalance: bigint;
  /** Native USDT balance in raw token units (6 decimals). */
  nativeUsdtBalance: bigint;
  /** Native USDC balance in raw token units (6 decimals). */
  nativeUsdcBalance: bigint;
}

/** Whether user should see the "swap to USDT.e" guidance banner. */
export function shouldShowSwapGuidance(
  chainId: number,
  holdings: AvaxStablecoinHoldings,
): boolean {
  if (chainId !== AVALANCHE) return false;
  // Show banner if user has native USDT (or non-trivial USDC) but no USDT.e.
  // Threshold: 1 USDT raw value = 1_000_000 (6 decimals).
  const threshold = 1_000_000n;
  return (
    (holdings.nativeUsdtBalance >= threshold || holdings.nativeUsdcBalance >= threshold) &&
    holdings.usdtEBalance < threshold
  );
}

/**
 * Suggested DEX deep links for the swap.
 * The user clicks one of these from the banner — opens new tab.
 */
export const SWAP_TO_USDTE_LINKS: ReadonlyArray<{
  name: string;
  url: string;
  /** Tagline shown in the swap-guidance banner. */
  tagline: string;
}> = [
  {
    name: "Trader Joe",
    url: "",
    tagline: "External swap disabled",
  },
  {
    name: "Pangolin",
    url: "",
    tagline: "External swap disabled",
  },
];
