import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import BigNumber from "bignumber.js";
import { useState } from "react";

import { transferSpotBalance } from "@/shared/lib/canton-wallet/funds";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import cbtcIconSrc from "@/shared/lib/canton-wallet/token-icons/cBTC.webp";
import ccIconSrc from "@/shared/lib/canton-wallet/token-icons/CC.webp";
import cethIconSrc from "@/shared/lib/canton-wallet/token-icons/cETH.webp";
import cusdIconSrc from "@/shared/lib/canton-wallet/token-icons/CUSD.png";

import styles from "./Accounts.module.scss";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { useSpotAssetPrecisions } from "../../hooks/useSpotAssetPrecisions";
import {
  formatSpotAssetAmount,
  hasSpotAssetPrecision,
  type SpotAssetPrecisions,
} from "../../model/assetPrecision";
import { SPOT_MARKETS, type SpotMarket, toSpotDisplayAsset } from "../../model/spotMarkets";

export const TRANSFER_ASSETS = ["CUSD"] as const;

const BALANCE_ASSET_ICON_SOURCES: Record<string, string> = {
  CUSD: cusdIconSrc,
  CBTC: cbtcIconSrc,
  CETH: cethIconSrc,
  CC: ccIconSrc,
};

function BalanceAmount({
  value,
  asset,
  precisions,
}: {
  value: string;
  asset: string;
  precisions: SpotAssetPrecisions;
}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return <>—</>;

  const normalizedAsset = asset.trim().toUpperCase();
  const isWrappedMarketAsset = normalizedAsset === "CBTC" || normalizedAsset === "CETH";
  if (!isWrappedMarketAsset) return <>{formatSpotAssetAmount(value, asset, precisions)}</>;

  const leadingDecimalZeroes = numeric.toFixed(20).match(/^0\.(0+)/)?.[1].length || 0;
  const maximumFractionDigits = leadingDecimalZeroes >= 4 ? Math.min(leadingDecimalZeroes + 4, 20) : 6;
  const formatted = numeric.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
  const compactMatch = formatted.match(/^([+-]?[\d,]+)\.(0{3,})(\d+)$/);

  if (!compactMatch) return <>{formatted}</>;

  return (
    <span>
      {compactMatch[1]}.0
      <sub className={styles.balanceZeroCount}>{compactMatch[2].length}</sub>
      {compactMatch[3]}
    </span>
  );
}

function BalanceAssetSymbol({ asset }: { asset: string }) {
  const iconSrc = BALANCE_ASSET_ICON_SOURCES[asset.trim().toUpperCase()];

  return (
    <span className={styles.assetSymbol}>
      {iconSrc && (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          className={styles.assetIcon}
          data-testid={`balance-asset-icon-${asset}`}
        />
      )}
      <span>{asset}</span>
    </span>
  );
}

function hasVisibleBalance(balance: { free: string; locked: string }): boolean {
  const free = new BigNumber(balance.free);
  const locked = new BigNumber(balance.locked);

  if (!free.isFinite() || !locked.isFinite()) return true;
  return !free.isZero() || !locked.isZero();
}

function displayAsset(asset: string, market: SpotMarket): string {
  const publicAsset = toSpotDisplayAsset(asset);
  if (publicAsset !== asset) return publicAsset;

  const normalizedAsset = asset.trim().toUpperCase();
  return (
    [market, ...SPOT_MARKETS].find((configuredMarket) => configuredMarket.apiBase.toUpperCase() === normalizedAsset)
      ?.displayBase ?? asset
  );
}

export function SpotAccountsPanel({
  market,
  variant = "account",
}: {
  market: SpotMarket;
  variant?: "account" | "workspace";
}) {
  const { i18n } = useLingui();
  const { party, provider } = useCantonSession();
  const { ready, account, err, refetch } = useSpotAccount();
  const precisions = useSpotAssetPrecisions();
  const [xferAmount, setXferAmount] = useState("");
  const [xferBusy, setXferBusy] = useState(false);
  const [xferMsg, setXferMsg] = useState<string | null>(null);
  const [xferErr, setXferErr] = useState<string | null>(null);

  if (variant === "workspace") {
    return (
      <div className={`${styles.panel} ${styles.workspacePanel}`}>
        <div className={styles.tableScroll}>
          <table className={`${styles.balanceTable} ${styles.workspaceTable}`}>
            <thead>
              <tr>
                <th>
                  <Trans>Asset</Trans>
                </th>
                <th>
                  <Trans>Free</Trans>
                </th>
                <th>
                  <Trans>Locked</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {account?.balances.filter(hasVisibleBalance).map((balance) => {
                const asset = displayAsset(balance.asset, market);
                return (
                  <tr key={balance.asset}>
                    <td className={styles.asset}>
                      <BalanceAssetSymbol asset={asset} />
                    </td>
                    <td>
                      <BalanceAmount value={balance.free} asset={asset} precisions={precisions} />
                    </td>
                    <td className={styles.locked}>
                      <BalanceAmount value={balance.locked} asset={asset} precisions={precisions} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !account && !err && (
            <div className={styles.workspaceState} role="status">
              <Trans>Loading…</Trans>
            </div>
          )}
          {err && (
            <div className={styles.workspaceState} role="alert">
              {err}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!ready)
    return (
      <div className={styles.panel}>
        <div className={styles.title}>
          <Trans>Spot Account</Trans>
        </div>
      </div>
    );
  if (err)
    return (
      <div className={styles.panel}>
        <div className={styles.err} role="alert">
          {err}
        </div>
      </div>
    );
  if (!account)
    return (
      <div className={styles.panel}>
        <div className={styles.title} role="status">
          <Trans>Loading…</Trans>
        </div>
      </div>
    );

  const quoteBalance = account.balances.find((balance) => balance.asset.trim().toUpperCase() === "CUSD");
  const totalUsda = quoteBalance
    ? formatSpotAssetAmount(
        new BigNumber(quoteBalance.free).plus(quoteBalance.locked).toFixed(),
        "CUSD",
        precisions,
      )
    : "0";
  const onTransfer = async (direction: "toSpot" | "toFunding") => {
    setXferBusy(true);
    setXferErr(null);
    setXferMsg(null);
    try {
      const result = await transferSpotBalance({
        asset: "CUSD",
        amount: xferAmount.trim(),
        direction,
        walletParty: party,
        sessionParty: party,
        walletProvider: provider,
      });
      setXferMsg(
        direction === "toSpot"
          ? `Moved ${result.amount} ${result.asset} to spot (spot free: ${result.spotFree})`
          : `Moved ${result.amount} ${result.asset} to futures (futures available: ${result.fundingAvailable})`
      );
      setXferAmount("");
      refetch();
    } catch (error: unknown) {
      setXferErr(error instanceof Error ? error.message : String(error));
    } finally {
      setXferBusy(false);
    }
  };
  const transferAmountValid =
    Boolean(xferAmount.trim()) && hasSpotAssetPrecision(xferAmount.trim(), "CUSD", precisions);

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <div className={styles.title}>
          <Trans>Spot Account</Trans>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>
            CUSD (<Trans>free + locked</Trans>)
          </span>
          <span className={styles.totalValue}>{totalUsda}</span>
        </div>
        {/* Dev faucet entry is intentionally hidden. */}
        <div className={styles.title}>
          <Trans>Transfer</Trans>
        </div>
        <div className={styles.transferRow}>
          <input
            aria-label="Transfer amount"
            className={styles.transferInput}
            inputMode="decimal"
            placeholder={i18n._(t`Amount`)}
            value={xferAmount}
            onChange={(event) => setXferAmount(event.target.value)}
            disabled={xferBusy}
          />
        </div>
        <div className={styles.transferRow}>
          <button
            type="button"
            className={styles.connectCta}
            disabled={xferBusy || !transferAmountValid}
            onClick={() => onTransfer("toSpot")}
          >
            {xferBusy ? "…" : <Trans>Futures → Spot</Trans>}
          </button>
          <button
            type="button"
            className={styles.connectCta}
            disabled={xferBusy || !transferAmountValid}
            onClick={() => onTransfer("toFunding")}
          >
            {xferBusy ? "…" : <Trans>Spot → Futures</Trans>}
          </button>
        </div>
        {xferMsg && <div className={styles.totalLabel}>{xferMsg}</div>}
        {xferErr && (
          <div className={styles.err} role="alert">
            {xferErr}
          </div>
        )}
      </div>
      <div className={styles.balanceSection}>
        <div className={styles.balanceHead}>
          <Trans>Balances</Trans>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.balanceTable}>
            <thead>
              <tr>
                <th>
                  <Trans>Asset</Trans>
                </th>
                <th>
                  <Trans>Free</Trans>
                </th>
                <th>
                  <Trans>Locked</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {account.balances.filter(hasVisibleBalance).map((balance) => {
                const asset = displayAsset(balance.asset, market);
                return (
                  <tr key={balance.asset}>
                    <td className={styles.asset}>
                      <BalanceAssetSymbol asset={asset} />
                    </td>
                    <td>
                      <BalanceAmount value={balance.free} asset={asset} precisions={precisions} />
                    </td>
                    <td className={styles.locked}>
                      <BalanceAmount value={balance.locked} asset={asset} precisions={precisions} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
