import { useEffect, useMemo, useState } from "react";

import "../styles/global.scss";
import { LighterToastContainer } from "../components/LighterToast/LighterToast";
import { emitToast } from "../components/LighterToast/toastBus";
import { TopNav } from "../components/TopNav/TopNav";
import styles from "./LighterExplorerPage.module.scss";

type TxStatus = "success" | "pending" | "failed";

type BlockRow = {
  height: string;
  ago: string;
  txns: number;
  proposer: string;
  reward: string;
};

type TxnRow = {
  hash: string;
  ago: string;
  kind: string;
  pair: string;
  value: string;
  valueSub: string;
  status: TxStatus;
};

type MinerRow = {
  rank: number;
  name: string;
  address: string;
  mined: string;
  blocks: number;
  share: number;
  status: "Online" | "Idle" | "Offline";
};

const BLOCKS: BlockRow[] = [
  { height: "#214,241,984", ago: "2s ago", txns: 186, proposer: "validator-07", reward: "+2.5 ROCKY" },
  { height: "#214,241,983", ago: "4s ago", txns: 142, proposer: "validator-03", reward: "+2.5 ROCKY" },
  { height: "#214,241,982", ago: "6s ago", txns: 201, proposer: "validator-12", reward: "+2.5 ROCKY" },
  { height: "#214,241,981", ago: "8s ago", txns: 98, proposer: "validator-01", reward: "+2.5 ROCKY" },
  { height: "#214,241,980", ago: "10s ago", txns: 167, proposer: "validator-09", reward: "+2.5 ROCKY" },
  { height: "#214,241,979", ago: "12s ago", txns: 223, proposer: "validator-05", reward: "+2.5 ROCKY" },
];

const TXNS: TxnRow[] = [
  { hash: "0xa1b2...c3d4", ago: "1s ago", kind: "Trade", pair: "BTC-USDT", value: "+$67,500", valueSub: "0.5 BTC", status: "success" },
  { hash: "0x83f4...9e02", ago: "3s ago", kind: "Claim", pair: "Mining reward", value: "+25 ROCKY", valueSub: "≈ $12.50", status: "success" },
  { hash: "0x41cd...7b88", ago: "5s ago", kind: "Stake", pair: "ROCKY", value: "+1,000 ROCKY", valueSub: "15% APY", status: "pending" },
  { hash: "0x90a7...1d33", ago: "8s ago", kind: "Trade", pair: "ETH-USDT", value: "-$3,250", valueSub: "1.2 ETH", status: "success" },
  { hash: "0x2e19...88fa", ago: "11s ago", kind: "Transfer", pair: "Rocky::a1f2", value: "+520 ROCKY", valueSub: "≈ $260.00", status: "success" },
  { hash: "0xc7b3...22e6", ago: "14s ago", kind: "Trade", pair: "SOL-USDT", value: "+$412", valueSub: "2.4 SOL", status: "failed" },
];

const MINERS: MinerRow[] = [
  { rank: 1, name: "DeepRock.eth", address: "Rocky::7fa1...8e4c", mined: "18,420 ROCKY", blocks: 842, share: 92, status: "Online" },
  { rank: 2, name: "Ironvein", address: "Rocky::c3b9...2a10", mined: "14,865 ROCKY", blocks: 701, share: 74, status: "Online" },
  { rank: 3, name: "Stonebreaker", address: "Rocky::9d22...5510", mined: "11,910 ROCKY", blocks: 612, share: 60, status: "Online" },
  { rank: 4, name: "Mantle.xyz", address: "Rocky::2b45...ff03", mined: "9,240 ROCKY", blocks: 498, share: 47, status: "Idle" },
  { rank: 5, name: "Pyroclast", address: "Rocky::60aa...7712", mined: "7,805 ROCKY", blocks: 421, share: 40, status: "Online" },
  { rank: 6, name: "Obsidian-01", address: "Rocky::18cd...4e8a", mined: "6,120 ROCKY", blocks: 358, share: 32, status: "Offline" },
];

function matchesQuery(q: string, ...fields: string[]): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(needle));
}

async function copyAndToast(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    emitToast(`${label} copied`, "success");
  } catch {
    emitToast("Unable to copy to clipboard", "error");
  }
}

export default function LighterExplorerPage() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  const filteredBlocks = useMemo(
    () => BLOCKS.filter((b) => matchesQuery(query, b.height, b.proposer)),
    [query]
  );
  const filteredTxns = useMemo(
    () => TXNS.filter((t) => matchesQuery(query, t.hash, t.kind, t.pair)),
    [query]
  );
  const filteredMiners = useMemo(
    () => MINERS.filter((m) => matchesQuery(query, m.name, m.address)),
    [query]
  );

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav rightExtra={<BlockBadge />} />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.title}>Rocky Explorer</div>
          <div className={styles.subtitle}>Track blocks, transactions, and mining activity across the network.</div>
        </div>

        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search by block height / transaction hash / address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={styles.searchGo} onClick={() => emitToast(query.trim() ? `Searching for "${query.trim()}"...` : "Enter a query to search", query.trim() ? "info" : "error")}>
            Search
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.panel}>
            <div className={styles.statLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Latest Block
            </div>
            <div className={styles.statValueRow}>
              <span className={styles.statValue}>214,241,984</span>
            </div>
            <div className={styles.statNote}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "#3dd68c", display: "inline-block" }} />
              Produced 1.2s ago
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.statLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              Avg Block Time
            </div>
            <div className={styles.statValueRow}>
              <span className={styles.statValue}>1.8</span>
              <span className={styles.statUnit}>s</span>
            </div>
            <div className={styles.statNote}>Rolling 24h average</div>
          </div>

          <div className={styles.panel}>
            <div className={styles.statLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
              </svg>
              24H Mining Output
            </div>
            <div className={styles.statValueRow}>
              <span className={styles.statValue}>2,847,320</span>
              <span className={styles.statUnit}>ROCKY</span>
            </div>
            <span className={styles.statBadge}>↑ +18.4% vs. yesterday</span>
          </div>

          <div className={styles.panel}>
            <div className={styles.statLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                <circle cx="10" cy="7" r="4" />
                <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M17 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Active Miners
            </div>
            <div className={styles.statValueRow}>
              <span className={styles.statValue}>3,432</span>
            </div>
            <span className={`${styles.statBadge} ${styles.statBadgeGreen}`}>● Online now</span>
          </div>
        </div>

        <div className={styles.tablesRow}>
          <div className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>
                <svg className={styles.tableTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Latest Blocks
              </div>
              <button type="button" className={styles.tableLink} onClick={() => emitToast("Full block explorer coming soon", "info")}>
                View all
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className={styles.tableBody}>
              {filteredBlocks.length === 0 ? (
                <div style={{ padding: "24px 20px", color: "var(--ltr-text-muted)", fontSize: 12, textAlign: "center" }}>
                  No blocks match "{query}"
                </div>
              ) : null}
              {filteredBlocks.map((b) => (
                <div key={b.height} className={styles.rowBlock}>
                  <div className={styles.rowIcon}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
                      <polyline points="4 7.5 12 12 20 7.5" />
                      <line x1="12" y1="12" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div>
                    <span className={styles.blockNumber} onClick={() => copyAndToast(b.height, "Block height")}>{b.height}</span>
                    <div className={styles.rowMetaInline}>
                      <span>{b.ago}</span>
                      <span>Proposer {b.proposer}</span>
                    </div>
                  </div>
                  <div className={styles.rowRight}>
                    {b.txns}
                    <div className={styles.rowRightSub}>txns</div>
                  </div>
                  <div className={`${styles.rowRight} ${styles.rowAmountUp}`}>
                    {b.reward}
                    <div className={styles.rowRightSub}>block reward</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.panel} ${styles.tablePanel}`}>
            <div className={styles.tableHeader}>
              <div className={styles.tableTitle}>
                <svg className={styles.tableTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3l4 4-4 4" />
                  <path d="M21 7H7a4 4 0 0 0 0 8" />
                  <path d="M7 21l-4-4 4-4" />
                  <path d="M3 17h14a4 4 0 0 0 0-8" />
                </svg>
                Latest Transactions
              </div>
              <button type="button" className={styles.tableLink} onClick={() => emitToast("Full transaction explorer coming soon", "info")}>
                View all
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className={styles.tableBody}>
              {filteredTxns.length === 0 ? (
                <div style={{ padding: "24px 20px", color: "var(--ltr-text-muted)", fontSize: 12, textAlign: "center" }}>
                  No transactions match "{query}"
                </div>
              ) : null}
              {filteredTxns.map((t) => (
                <div key={t.hash} className={styles.rowTxn}>
                  <div className={`${styles.rowIcon} ${styles.rowIconTx}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3l4 4-4 4" />
                      <path d="M21 7H7a4 4 0 0 0 0 8" />
                      <path d="M7 21l-4-4 4-4" />
                      <path d="M3 17h14a4 4 0 0 0 0-8" />
                    </svg>
                  </div>
                  <div>
                    <span className={styles.rowHash} onClick={() => copyAndToast(t.hash, "Tx hash")}>{t.hash}</span>
                    <div className={styles.rowMetaInline}>
                      <span>{t.kind}</span>
                      <span>{t.pair}</span>
                      <span>{t.ago}</span>
                    </div>
                  </div>
                  <div className={styles.rowRight}>
                    <span className={t.value.startsWith("+") ? styles.rowAmountGreen : styles.rowRight}>{t.value}</span>
                    <div className={styles.rowRightSub}>{t.valueSub}</div>
                  </div>
                  <TxStatusPill status={t.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.tableHeader} style={{ padding: "0 4px 14px" }}>
            <div className={styles.tableTitle}>
              <svg className={styles.tableTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2" />
              </svg>
              Top Miners (24H)
            </div>
            <button type="button" className={styles.tableLink} onClick={() => emitToast("Full miner leaderboard coming soon", "info")}>
              Full leaderboard
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className={styles.minersTable}>
            <div className={styles.minersHead}>
              <div>RANK</div>
              <div>MINER</div>
              <div>ROCKY MINED</div>
              <div>BLOCKS</div>
              <div>NETWORK SHARE</div>
              <div style={{ textAlign: "right" }}>STATUS</div>
            </div>
            {filteredMiners.length === 0 ? (
              <div style={{ padding: "24px 20px", color: "var(--ltr-text-muted)", fontSize: 12, textAlign: "center" }}>
                No miners match "{query}"
              </div>
            ) : null}
            {filteredMiners.map((m) => (
              <div key={m.rank} className={styles.minersRow}>
                <div>
                  <span
                    className={`${styles.rankBadge} ${
                      m.rank === 1 ? styles.rankBadgeTop1 : m.rank === 2 ? styles.rankBadgeTop2 : m.rank === 3 ? styles.rankBadgeTop3 : ""
                    }`}
                  >
                    {m.rank}
                  </span>
                </div>
                <div className={styles.minerIdCell}>
                  <span className={styles.minerAvatar} />
                  <div>
                    <div className={styles.minerName}>{m.name}</div>
                    <div
                      className={styles.minerAddr}
                      style={{ cursor: "pointer" }}
                      onClick={() => copyAndToast(m.address, "Address")}
                    >
                      {m.address}
                    </div>
                  </div>
                </div>
                <div className={`${styles.rowAmountUp}`} style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{m.mined}</div>
                <div style={{ color: "var(--ltr-text-primary)", fontVariantNumeric: "tabular-nums" }}>{m.blocks}</div>
                <div>
                  <div className={styles.shareBar}>
                    <div className={styles.shareBarFill} style={{ ["--p" as any]: `${m.share}%` }} />
                  </div>
                  <span className={styles.shareValue}>{m.share}%</span>
                </div>
                <div className={styles.minerStatus}>
                  <MinerStatusPill status={m.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <LighterToastContainer />
    </div>
  );
}

function TxStatusPill({ status }: { status: TxStatus }) {
  if (status === "success") {
    return (
      <span className={`${styles.statusPill} ${styles.statusSuccess}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Success
      </span>
    );
  }
  if (status === "pending") {
    return <span className={`${styles.statusPill} ${styles.statusPending}`}>● Pending</span>;
  }
  return <span className={`${styles.statusPill} ${styles.statusFailed}`}>✕ Failed</span>;
}

function MinerStatusPill({ status }: { status: "Online" | "Idle" | "Offline" }) {
  const cls =
    status === "Online" ? styles.statusSuccess : status === "Idle" ? styles.statusPending : styles.statusFailed;
  const dot = status === "Online" ? "#3dd68c" : status === "Idle" ? "#f7a43b" : "#ff384f";
  return (
    <span className={`${styles.statusPill} ${cls}`}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

function BlockBadge() {
  return (
    <div className={styles.blockBadge}>
      <span className={styles.blockDot} />
      Block <span className={styles.blockValue}>214,241,984</span>
    </div>
  );
}
