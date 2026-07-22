import { Trans, t } from "@lingui/macro";
import { useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { transferSpotBalance } from "@/shared/lib/canton-wallet/funds";
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

export const TRANSFER_ASSETS = ["USDA"] as const;
type TransferAsset = (typeof TRANSFER_ASSETS)[number];

export function SpotAccountsPanel() {
  const ready = useSpotAuthReady();
  const { party } = useCantonSession();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);
  const xferAsset: TransferAsset = "USDA";
  const [xferAmount, setXferAmount] = useState("");
  const [xferBusy, setXferBusy] = useState(false);
  const [xferMsg, setXferMsg] = useState<string | null>(null);
  const [xferErr, setXferErr] = useState<string | null>(null);
  const { data, err, refetch } = usePolling<Account>(() => spotApi.account(), 2500, [], { enabled: ready });
  if (!ready)
    return (
      <div className={styles.panel}>
        <div className={styles.title}>
          <Trans>Spot Account</Trans>
        </div>
        <button type="button" className={styles.connectCta} onClick={openCantonConnect}>
          <Trans>Connect wallet</Trans>
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
        <div className={styles.title}>
          <Trans>Loading…</Trans>
        </div>
      </div>
    );

  // Rough total in USDA-equivalent, treating base assets at 0 mark until we
  // wire ticker mid-prices per symbol. Users see the real numbers per row.
  const usda = data.balances.find((b) => b.asset === "USDA");
  const totalUsda = usda ? parseFloat(usda.free) + parseFloat(usda.locked) : 0;
  const allZero = data.balances.every((b) => parseFloat(b.free) === 0 && parseFloat(b.locked) === 0);

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
        asset: xferAsset,
        amount: xferAmount.trim(),
        direction,
      });
      setXferMsg(
        direction === "toSpot"
          ? t`Moved ${result.amount} ${result.asset} to spot (spot free: ${result.spotFree})`
          : t`Moved ${result.amount} ${result.asset} to futures (futures available: ${result.fundingAvailable})`
      );
      setXferAmount("");
      refetch();
    } catch (e: unknown) {
      setXferErr(e instanceof Error ? e.message : String(e));
    } finally {
      setXferBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>
        <Trans>Spot Account</Trans>
      </div>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>
          USDA (<Trans>free + locked</Trans>)
        </span>
        <span className={styles.totalValue}>{totalUsda.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
      </div>
      <div className={styles.title}>
        <Trans>Balances</Trans>
      </div>
      <div className={styles.rows}>
        <span className={styles.rowHeader}>
          <Trans>Asset</Trans>
        </span>
        <span className={`${styles.rowHeader} ${styles.free}`}>
          <Trans>Free</Trans>
        </span>
        <span className={`${styles.rowHeader} ${styles.locked}`}>
          <Trans>Locked</Trans>
        </span>
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
          {faucetBusy ? <Trans>Requesting…</Trans> : <Trans>Get test funds (dev)</Trans>}
        </button>
      )}
      {faucetErr && <div className={styles.err}>{faucetErr}</div>}
      <div className={styles.title}>
        <Trans>Transfer</Trans>
      </div>
      <div className={styles.transferRow}>
        <input
          className={styles.transferInput}
          inputMode="decimal"
          placeholder={t`Amount`}
          value={xferAmount}
          onChange={(e) => setXferAmount(e.target.value)}
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
          {xferBusy ? "…" : <Trans>Futures → Spot</Trans>}
        </button>
        <button
          type="button"
          className={styles.connectCta}
          disabled={xferBusy || !xferAmount.trim()}
          onClick={() => onTransfer("toFunding")}
        >
          {xferBusy ? "…" : <Trans>Spot → Futures</Trans>}
        </button>
      </div>
      {xferMsg && <div className={styles.totalLabel}>{xferMsg}</div>}
      {xferErr && <div className={styles.err}>{xferErr}</div>}
    </div>
  );
}
