import { Trans } from "@lingui/macro";
import { useEffect, useState } from "react";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import {
  combineNodes,
  leafHashHex,
  parseAmount18dp,
  sumBalances,
  type SolvencyNode,
} from "@/shared/lib/solvency/verify";

import "@/modules/lighter/styles/global.scss";
import {
  SolvencyApiError,
  fetchLatestReport,
  fetchMyProof,
  type SolvencyReport,
} from "../api/solvency.api";
import styles from "./SolvencyPage.module.scss";

/** "100.500000000000000000" -> "100.5"; keeps at most `dp` fraction digits. */
function fmtAmount(raw: string, dp = 6): string {
  const [int, frac = ""] = raw.split(".");
  const trimmed = frac.slice(0, dp).replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

function fmtTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toUTCString();
}

type VerifyState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "unavailable"; reason: "not-included" | "no-report" | "error"; message?: string }
  | {
      phase: "done";
      leafOk: boolean;
      rootOk: boolean;
      totalsOk: boolean | null;
      balances: Record<string, string>;
      reportId: string;
    };

export function SolvencyPage() {
  const { connected } = useCantonSession();
  const [report, setReport] = useState<SolvencyReport | null>(null);
  const [reportState, setReportState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [verify, setVerify] = useState<VerifyState>({ phase: "idle" });

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLatestReport()
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setReportState(r ? "ready" : "empty");
      })
      .catch(() => !cancelled && setReportState("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function runVerification() {
    setVerify({ phase: "running" });
    try {
      const proof = await fetchMyProof();
      // 1. Recompute the leaf hash from the served preimage.
      const recomputed = await leafHashHex(proof.leaf.salt, proof.leaf.user_id, proof.leaf.balances);
      const leafOk = recomputed === proof.leaf.leaf_hash;
      // 2. Fold the sibling path up to the root.
      let current: SolvencyNode = { hashHex: recomputed, sums: sumBalances(proof.leaf.balances) };
      for (const step of proof.path) {
        const sibling: SolvencyNode = {
          hashHex: step.sibling_hash,
          sums: sumBalances(step.sibling_sums),
        };
        current = step.sibling_on_left
          ? await combineNodes(sibling, current)
          : await combineNodes(current, sibling);
      }
      const rootOk = current.hashHex === proof.root_hash;
      // 3. When the public report is the same snapshot, the totals derived
      //    from the path must equal the published liabilities.
      let totalsOk: boolean | null = null;
      if (report && report.report_id === proof.report_id) {
        totalsOk = Object.entries(report.liabilities).every(
          ([asset, amount]) => (current.sums[asset] ?? 0n) === parseAmount18dp(amount)
        );
      }
      setVerify({
        phase: "done",
        leafOk,
        rootOk,
        totalsOk,
        balances: proof.leaf.balances,
        reportId: proof.report_id,
      });
    } catch (e) {
      if (e instanceof SolvencyApiError && e.status === 404) {
        setVerify({
          phase: "unavailable",
          reason: e.message.includes("no solvency report") ? "no-report" : "not-included",
        });
      } else {
        setVerify({ phase: "unavailable", reason: "error", message: (e as Error).message });
      }
    }
  }

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>
            <Trans>Proof of Solvency</Trans>
          </h1>
          <p className={styles.sub}>
            <Trans>
              Rocky publishes a daily cryptographic commitment to all user balances. Anyone can
              check the totals; every user can verify their own balance is included — without
              trusting us.
            </Trans>
          </p>
        </header>

        {reportState === "loading" && (
          <div className={styles.panel}>
            <Trans>Loading the latest report…</Trans>
          </div>
        )}
        {reportState === "error" && (
          <div className={styles.panel}>
            <Trans>The solvency report is temporarily unavailable.</Trans>
          </div>
        )}
        {reportState === "empty" && (
          <div className={styles.panel}>
            <Trans>No report has been published yet. The first daily snapshot is coming soon.</Trans>
          </div>
        )}

        {report && (
          <>
            <section className={styles.panel}>
              <div className={styles.metaGrid}>
                <div>
                  <label>
                    <Trans>Snapshot (UTC)</Trans>
                  </label>
                  <span>{fmtTime(report.snapshot_at)}</span>
                </div>
                <div>
                  <label>
                    <Trans>Users committed</Trans>
                  </label>
                  <span>{report.user_count}</span>
                </div>
                <div>
                  <label>
                    <Trans>House accounts excluded</Trans>
                  </label>
                  <span>{report.house_excluded}</span>
                </div>
                <div className={styles.rootHash}>
                  <label>
                    <Trans>Merkle root</Trans>
                  </label>
                  <code>{report.root_hash}</code>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <h2>
                <Trans>Liabilities by asset</Trans>
              </h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>
                      <Trans>Asset</Trans>
                    </th>
                    <th>
                      <Trans>User liabilities</Trans>
                    </th>
                    <th>
                      <Trans>Custody assets</Trans>
                    </th>
                    <th>
                      <Trans>Insurance fund</Trans>
                    </th>
                    <th>
                      <Trans>Bad debt</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.liabilities).map(([asset, amount]) => (
                    <tr key={asset}>
                      <td>{asset}</td>
                      <td>{fmtAmount(amount)}</td>
                      <td>
                        {report.assets?.[asset] ? (
                          fmtAmount(report.assets[asset])
                        ) : (
                          <span className={styles.muted}>
                            <Trans>verification launching</Trans>
                          </span>
                        )}
                      </td>
                      <td>{fmtAmount(report.insurance_fund[asset] ?? "0")}</td>
                      <td>{fmtAmount(report.bad_debt[asset] ?? "0")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.footnote}>
                <Trans>
                  Liabilities include unrealized PnL at the snapshot mark prices. Negative-equity
                  accounts are clamped to zero and disclosed as bad debt. House accounts are
                  excluded from liabilities and disclosed above.
                </Trans>
              </p>
            </section>
          </>
        )}

        <section className={styles.panel}>
          <h2>
            <Trans>Verify my balance</Trans>
          </h2>
          {!connected ? (
            <p className={styles.muted}>
              <Trans>Connect your wallet to verify your balance is included in the report.</Trans>
            </p>
          ) : (
            <>
              <button
                className={styles.verifyButton}
                disabled={verify.phase === "running"}
                onClick={runVerification}
                type="button"
              >
                {verify.phase === "running" ? (
                  <Trans>Verifying…</Trans>
                ) : (
                  <Trans>Verify my balance</Trans>
                )}
              </button>
              {verify.phase === "unavailable" && (
                <p className={styles.muted}>
                  {verify.reason === "not-included" ? (
                    <Trans>
                      Your account is not in the latest snapshot yet (new accounts appear in the
                      next daily report).
                    </Trans>
                  ) : verify.reason === "no-report" ? (
                    <Trans>No report has been published yet.</Trans>
                  ) : (
                    (verify.message ?? "error")
                  )}
                </p>
              )}
              {verify.phase === "done" && (
                <div className={styles.verifyResult}>
                  <ul className={styles.checks}>
                    <li className={verify.leafOk ? styles.ok : styles.fail}>
                      {verify.leafOk ? "✓" : "✗"} <Trans>Leaf commitment matches my balances</Trans>
                    </li>
                    <li className={verify.rootOk ? styles.ok : styles.fail}>
                      {verify.rootOk ? "✓" : "✗"}{" "}
                      <Trans>Inclusion path recombines to the published root</Trans>
                    </li>
                    {verify.totalsOk !== null && (
                      <li className={verify.totalsOk ? styles.ok : styles.fail}>
                        {verify.totalsOk ? "✓" : "✗"}{" "}
                        <Trans>Derived totals equal the published liabilities</Trans>
                      </li>
                    )}
                  </ul>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>
                          <Trans>Asset</Trans>
                        </th>
                        <th>
                          <Trans>Committed balance</Trans>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(verify.balances).map(([asset, amount]) => (
                        <tr key={asset}>
                          <td>{asset}</td>
                          <td>{fmtAmount(amount, 18)}</td>
                        </tr>
                      ))}
                      {Object.keys(verify.balances).length === 0 && (
                        <tr>
                          <td colSpan={2} className={styles.muted}>
                            <Trans>No positive balances at the snapshot time.</Trans>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <p className={styles.footnote}>
            <Trans>
              Verification runs entirely in your browser: your leaf hash is recomputed from the
              disclosed salt and balances, then combined up the Merkle sum tree and compared with
              the published root.
            </Trans>
          </p>
        </section>
      </main>
    </div>
  );
}
