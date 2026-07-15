import { useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { spotApi, type Account } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";
import styles from "./Accounts.module.scss";

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

export function SpotAccountsPanel() {
  const ready = useSpotAuthReady();
  const { party } = useCantonSession();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);
  const { data, err } = usePolling<Account>(() => spotApi.account(), 2500, [], { enabled: ready });
  if (!ready)
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Spot Account</div>
        <button type="button" className={styles.connectCta} onClick={openCantonConnect}>
          Connect wallet
        </button>
      </div>
    );
  if (err)
    return (
      <div className={styles.panel}>
        <div className={styles.err}>{err}</div>
      </div>
    );
  if (!data)
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Loading…</div>
      </div>
    );

  // Rough total in USDCx-equivalent, treating base assets at 0 mark until we
  // wire ticker mid-prices per symbol. Users see the real numbers per row.
  const usdcx = data.balances.find((b) => b.asset === "USDCx");
  const totalUsdcx = usdcx ? parseFloat(usdcx.free) + parseFloat(usdcx.locked) : 0;
  const allZero = data.balances.every((b) => parseFloat(b.free) === 0 && parseFloat(b.locked) === 0);

  const onFaucet = async () => {
    if (!party) return;
    setFaucetBusy(true);
    setFaucetErr(null);
    try {
      await faucet(party);
    } catch (e: unknown) {
      setFaucetErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFaucetBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Spot Account</div>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>USDCx (free + locked)</span>
        <span className={styles.totalValue}>{totalUsdcx.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
      </div>
      <div className={styles.title}>Balances</div>
      <div className={styles.rows}>
        <span className={styles.rowHeader}>Asset</span>
        <span className={`${styles.rowHeader} ${styles.free}`}>Free</span>
        <span className={`${styles.rowHeader} ${styles.locked}`}>Locked</span>
        {data.balances.map((b) => (
          <div key={b.asset} style={{ display: "contents" }}>
            <span className={styles.asset}>{b.asset}</span>
            <span className={styles.free}>{fmt(b.free)}</span>
            <span className={styles.locked}>{fmt(b.locked)}</span>
          </div>
        ))}
      </div>
      {allZero && (
        <button type="button" className={styles.connectCta} onClick={onFaucet} disabled={faucetBusy}>
          {faucetBusy ? "Requesting…" : "Get test funds (dev)"}
        </button>
      )}
      {faucetErr && <div className={styles.err}>{faucetErr}</div>}
    </div>
  );
}
