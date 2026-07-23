import { useState } from "react";

import { transferSpotBalance } from "@/shared/lib/canton-wallet/funds";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import styles from "./Accounts.module.scss";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { SPOT_MARKETS, type SpotMarket, toSpotDisplayAsset } from "../../model/spotMarkets";

export const TRANSFER_ASSETS = ["USDA"] as const;

function fmt(v: string, digits = 4): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function BalanceAmount({ value, asset }: { value: string; asset: string }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return <>—</>;

  const normalizedAsset = asset.trim().toUpperCase();
  const isWrappedMarketAsset = normalizedAsset === "CBTC" || normalizedAsset === "CETH";
  if (!isWrappedMarketAsset) return <>{fmt(value)}</>;

  const leadingDecimalZeroes = numeric.toFixed(20).match(/^0\.(0+)/)?.[1].length || 0;
  const maximumFractionDigits = leadingDecimalZeroes >= 4 ? Math.min(leadingDecimalZeroes + 4, 20) : 6;
  const formatted = numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
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

async function faucet(party: string): Promise<void> {
  const r = await fetch("/api/v3/dev/faucet", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ party }),
  });
  if (!r.ok) throw new Error(`faucet HTTP ${r.status}`);
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
  const { ready, account, err, refetch } = useSpotAccount();
  const { party } = useCantonSession();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);
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
                <th>Asset</th>
                <th>Free</th>
                <th>Locked</th>
              </tr>
            </thead>
            <tbody>
              {account?.balances.map((balance) => {
                const asset = displayAsset(balance.asset, market);
                return (
                  <tr key={balance.asset}>
                    <td className={styles.asset}>{asset}</td>
                    <td>
                      <BalanceAmount value={balance.free} asset={asset} />
                    </td>
                    <td className={styles.locked}>
                      <BalanceAmount value={balance.locked} asset={asset} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !account && !err && (
            <div className={styles.workspaceState} role="status">
              Loading…
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
        <div className={styles.title}>Spot Account</div>
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
          Loading…
        </div>
      </div>
    );

  const quoteBalance = account.balances.find((balance) => balance.asset.trim().toUpperCase() === "USDA");
  const totalUsda = quoteBalance ? parseFloat(quoteBalance.free) + parseFloat(quoteBalance.locked) : 0;
  const allZero = account.balances.every(
    (balance) => parseFloat(balance.free) === 0 && parseFloat(balance.locked) === 0,
  );

  const onFaucet = async () => {
    if (!party) return;
    setFaucetBusy(true);
    setFaucetErr(null);
    try {
      await faucet(party);
      refetch();
    } catch (e: unknown) {
      setFaucetErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFaucetBusy(false);
    }
  };

  const onTransfer = async (direction: "toSpot" | "toFunding") => {
    setXferBusy(true);
    setXferErr(null);
    setXferMsg(null);
    try {
      const result = await transferSpotBalance({
        asset: "USDA",
        amount: xferAmount.trim(),
        direction,
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

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <div className={styles.title}>Spot Account</div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>USDA (free + locked)</span>
          <span className={styles.totalValue}>{totalUsda.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
        </div>
        {allZero && (
          <button type="button" className={styles.connectCta} onClick={onFaucet} disabled={faucetBusy}>
            {faucetBusy ? "Requesting…" : "Get test funds (dev)"}
          </button>
        )}
        {faucetErr && (
          <div className={styles.err} role="alert">
            {faucetErr}
          </div>
        )}
        <div className={styles.title}>Transfer</div>
        <div className={styles.transferRow}>
          <input
            aria-label="Transfer amount"
            className={styles.transferInput}
            inputMode="decimal"
            placeholder="Amount"
            value={xferAmount}
            onChange={(event) => setXferAmount(event.target.value)}
            disabled={xferBusy}
          />
        </div>
        <div className={styles.transferRow}>
          <button
            type="button"
            className={styles.connectCta}
            disabled={xferBusy || !xferAmount.trim()}
            onClick={() => onTransfer("toSpot")}
          >
            {xferBusy ? "…" : "Futures → Spot"}
          </button>
          <button
            type="button"
            className={styles.connectCta}
            disabled={xferBusy || !xferAmount.trim()}
            onClick={() => onTransfer("toFunding")}
          >
            {xferBusy ? "…" : "Spot → Futures"}
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
        <div className={styles.title}>Balances</div>
        <div className={styles.tableScroll}>
          <table className={styles.balanceTable}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Free</th>
                <th>Locked</th>
              </tr>
            </thead>
            <tbody>
              {account.balances.map((balance) => {
                const asset = displayAsset(balance.asset, market);
                return (
                  <tr key={balance.asset}>
                    <td className={styles.asset}>{asset}</td>
                    <td>
                      <BalanceAmount value={balance.free} asset={asset} />
                    </td>
                    <td className={styles.locked}>
                      <BalanceAmount value={balance.locked} asset={asset} />
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
