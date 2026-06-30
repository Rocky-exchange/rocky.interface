/**
 * AvaxUsdteSwapBanner
 *
 * Surfaces a clear deposit-page guidance for AVAX users who hold native
 * USDT (or USDC) but not USDT.e — they must swap before they can deposit
 * into Primit's Vault.
 *
 * Pre-W4 (before AVAX mainnet deploy):
 *   - This component is shown but Deposit is paused via IS_NETWORK_DISABLED
 *
 * W4-W8 (during AVAX mainnet rollout):
 *   - Component appears in the deposit modal / collateral selector
 *
 * Related: PRD-2026-0511-001 §11 user FAQ Q3
 *          D-AVAX-6 / D-AVAX-7 (Lee/CTO 2026-05-11)
 */

import { Trans, t } from "@lingui/macro";
import type { ReactElement } from "react";

import {
  shouldShowSwapGuidance,
  SWAP_TO_USDTE_LINKS,
  type AvaxStablecoinHoldings,
} from "lib/chains/avaxStablecoin";

interface AvaxUsdteSwapBannerProps {
  chainId: number;
  holdings: AvaxStablecoinHoldings;
  /** Optional className for layout positioning. */
  className?: string;
  /** Compact mode — single line with single CTA. */
  compact?: boolean;
}

export function AvaxUsdteSwapBanner({
  chainId,
  holdings,
  className,
  compact = false,
}: AvaxUsdteSwapBannerProps): ReactElement | null {
  if (!shouldShowSwapGuidance(chainId, holdings)) return null;

  if (compact) {
    return (
      <div
        className={className}
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          background: "rgba(252, 211, 77, 0.12)",
          border: "1px solid rgba(252, 211, 77, 0.4)",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        <span aria-hidden>⚠️</span>
        <span>
          <Trans>You hold native USDT — please swap to USDT.e on Avalanche before depositing.</Trans>
        </span>
        <a
          href={SWAP_TO_USDTE_LINKS[0]?.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
        >
          <Trans>Swap on Trader Joe →</Trans>
        </a>
      </div>
    );
  }

  return (
    <div
      className={className}
      role="alert"
      style={{
        padding: 16,
        background: "rgba(252, 211, 77, 0.08)",
        border: "1px solid rgba(252, 211, 77, 0.4)",
        borderRadius: 8,
      }}
    >
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        <Trans>Swap to USDT.e before depositing</Trans>
      </h4>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.5 }}>
        <Trans>
          Primit on Avalanche accepts <strong>USDT.e</strong> (the bridged version, address starting with{" "}
          <code>0xc71984…</code>), not the native Avalanche USDT. The two are separate tokens and cannot be
          used interchangeably.
        </Trans>
      </p>
      <p style={{ margin: "8px 0 12px 0", fontSize: 14, lineHeight: 1.5 }}>
        <Trans>
          To deposit, please swap your native USDT or USDC for USDT.e on one of the AVAX DEXes below. The
          swap typically takes &lt; 30 seconds and incurs a small slippage of &lt;0.1% for normal amounts.
        </Trans>
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {SWAP_TO_USDTE_LINKS.map((dex) => (
          <a
            key={dex.name}
            href={dex.url}
            target="_blank"
            rel="noopener noreferrer"
            title={dex.tagline}
            style={{
              padding: "8px 12px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 6,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            {t`Swap on ${dex.name}`} →
          </a>
        ))}
      </div>
      <p style={{ margin: "12px 0 0 0", fontSize: 12, opacity: 0.7 }}>
        <Trans>
          Note: this notice appears because Primit uses Avalanche Bridge's wrapped USDT for compatibility
          with cross-chain deposits from Arbitrum. If you bridged from Arbitrum, you already have USDT.e
          and this banner should not appear.
        </Trans>
      </p>
    </div>
  );
}
