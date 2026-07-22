import { useState } from "react";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import styles from "./Accounts.module.scss";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { SPOT_MARKETS, type SpotMarket, toSpotDisplayAsset } from "../../model/spotMarkets";

function fmt(v: string, digits = 4): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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
              {account?.balances.map((balance) => (
                <tr key={balance.asset}>
                  <td className={styles.asset}>{displayAsset(balance.asset, market)}</td>
                  <td>{fmt(balance.free)}</td>
                  <td className={styles.locked}>{fmt(balance.locked)}</td>
                </tr>
              ))}
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

  const quoteBalance = account.balances.find((balance) => balance.asset.trim().toUpperCase() === "USDCX");
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
              {account.balances.map((balance) => (
                <tr key={balance.asset}>
                  <td className={styles.asset}>{displayAsset(balance.asset, market)}</td>
                  <td>{fmt(balance.free)}</td>
                  <td className={styles.locked}>{fmt(balance.locked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
