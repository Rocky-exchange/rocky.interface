import { spotApi, type Account } from "../../api/spotClient";
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

export function SpotAccountsPanel() {
  const { data, err } = usePolling<Account>(() => spotApi.account(), 2500, []);
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
    </div>
  );
}
