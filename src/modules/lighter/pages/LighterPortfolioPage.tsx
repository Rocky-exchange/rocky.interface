import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";

import "../styles/global.scss";
import { TopNav } from "../components/TopNav/TopNav";
import coinImg from "@/shared/img/home/coin.png";
import styles from "./LighterPortfolioPage.module.scss";

const PNL_SERIES = [
  { x: 1, y: 380 }, { x: 2, y: 340 }, { x: 3, y: 480 }, { x: 4, y: 420 },
  { x: 5, y: 560 }, { x: 6, y: 520 }, { x: 7, y: 650 }, { x: 8, y: 610 },
  { x: 9, y: 720 }, { x: 10, y: 680 }, { x: 11, y: 790 }, { x: 12, y: 760 },
  { x: 13, y: 860 }, { x: 14, y: 820 }, { x: 15, y: 740 }, { x: 16, y: 830 },
];

const HISTORY_RANGES = ["7D", "30D", "90D", "ALL"] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

type HistoryPoint = { label: string; value: number };

function buildHistory(range: HistoryRange): HistoryPoint[] {
  // Deterministic pseudo-random walk so the chart looks organic but stable across renders
  const seed = { "7D": 7, "30D": 30, "90D": 90, ALL: 180 }[range];
  const step = { "7D": 1, "30D": 1, "90D": 1, ALL: 1 }[range];
  const axisFmt = (i: number): string => {
    if (range === "7D") return `Day ${i + 1}`;
    if (range === "30D") return `${i + 1}`;
    if (range === "90D") return `${i + 1}d`;
    return `M${i + 1}`;
  };

  let acc = 40;
  let rng = 17;
  const out: HistoryPoint[] = [];
  for (let i = 0; i < seed; i += step) {
    rng = (rng * 9301 + 49297) % 233280;
    const noise = (rng / 233280) * 2 - 1; // -1..1
    const drift = range === "ALL" ? 16 : range === "90D" ? 12 : range === "30D" ? 28 : 110;
    acc = Math.max(20, acc + drift + noise * drift * 0.6);
    out.push({ label: axisFmt(i), value: Math.round(acc) });
  }
  return out;
}

const VIP_FILLED = 4;
const VIP_TOTAL = 8;

type Activity = {
  title: string;
  sub: string;
  time: string;
  amount: string;
  amountTone: "orange" | "neutral" | "green";
  status: "Claimed" | "Settled" | "Pending";
};

const ACTIVITIES: Activity[] = [
  { title: "Mining reward received", sub: "BTC-USDT Trade", time: "4/3 14:32:15", amount: "+25 ROCKY", amountTone: "orange", status: "Claimed" },
  { title: "Buy BTC", sub: "0.5 BTC @ $67,500", time: "4/3 14:32:15", amount: "-$33,750", amountTone: "neutral", status: "Settled" },
  { title: "Mining rewards pending minting", sub: "BTC-USDT Trade", time: "4/3 14:32:15", amount: "+35 ROCKY", amountTone: "green", status: "Pending" },
  { title: "Reward has been claimed", sub: "Cumulative 123", time: "4/3 10:15:00", amount: "+1047 ROCKY", amountTone: "orange", status: "Claimed" },
];

export default function LighterPortfolioPage() {
  const [range, setRange] = useState<HistoryRange>("7D");
  const historyData = buildHistory(range);

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav rightExtra={<RealtimeMining />} />
      </div>
      <div className={styles.content}>
        <div className={styles.summaryRow}>
          <div className={`${styles.panel} ${styles.totalPanel}`}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .8-3 2.1 0 3 6 1.7 6 4.7 0 1.4-1.3 2.2-3 2.2a3 3 0 0 1-3-1.5" />
                  <path d="M12 6v2M12 16v2" />
                </svg>
                Total Mined
              </div>
            </div>

            <div className={styles.totalValueRow}>
              <span className={styles.totalValue}>1,247.5</span>
              <span className={styles.totalSuffix}>ROCKY</span>
            </div>
            <div className={styles.totalBadges}>
              <span className={styles.badgeOrange}>↑ +12.5%</span>
              <span className={styles.badgeGhost}>+125 ROCKY</span>
            </div>

            <img src={coinImg} alt="Rocky" className={styles.totalRock} />

            <div className={styles.totalActions}>
              <button type="button" className={styles.btnPrimary}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3v3M10 3v3M14 3v3M18 3v3" />
                  <rect x="3" y="8" width="18" height="12" rx="2" />
                  <path d="M8 14h8" />
                </svg>
                Claim Rewards
              </button>
              <button type="button" className={styles.btnOutline}>Start Trading</button>
            </div>
          </div>

          <div className={`${styles.panel} ${styles.pnlPanel}`}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="13" width="4" height="7" rx="0.5" />
                  <rect x="10" y="9" width="4" height="11" rx="0.5" />
                  <rect x="16" y="5" width="4" height="15" rx="0.5" />
                </svg>
                Profit and losses
              </div>
            </div>
            <div>
              <div className={styles.pnlValue}>$837.2</div>
              <div className={styles.pnlSub}>Today's PnL</div>
            </div>
            <div className={styles.pnlChart}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={PNL_SERIES} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <pattern id="pnlDots" patternUnits="userSpaceOnUse" width="4" height="4">
                      <circle cx="1" cy="1" r="0.7" fill="rgba(61, 214, 140, 0.35)" />
                    </pattern>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="y"
                    stroke="#3dd68c"
                    strokeWidth={1.75}
                    fill="url(#pnlDots)"
                    fillOpacity={1}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
                </svg>
                Today's Trading Volume
              </div>
            </div>
            <div className={styles.statValue}>$15,210.21</div>
            <div className={styles.statSub}>
              <span>24 transactions</span>
              <span className={styles.statSubDivider}>|</span>
              <span>averaging $6,050</span>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                  <path d="M6 4h12l4 6-10 10L2 10z" />
                </svg>
                Today's Mining
              </div>
            </div>
            <div className={styles.statValueRow}>
              <span className={styles.statValue}>+125</span>
              <span className={styles.statSuffix}>ROCKY</span>
            </div>
            <div className={styles.statSub}>
              <span>≈ $62.5</span>
              <span className={styles.statPill}>
                <span className={styles.statPillDot} />
                Mining rate 2.5 ROCKY/USDT
              </span>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.vipHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 9 12 22 22 9 12 2" />
                  <path d="M2 9h20M8 9l4 13M16 9l-4 13" />
                </svg>
                VIP Level
              </div>
              <button type="button" className={styles.vipBadge}>
                VIP2
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className={styles.vipBar}>
              {Array.from({ length: VIP_TOTAL }).map((_, i) => (
                <div key={i} className={i < VIP_FILLED ? styles.vipSeg : styles.vipSegEmpty} />
              ))}
            </div>
            <div className={styles.vipMeta}>
              <span>VIP 2</span>
              <span className={styles.vipMetaCenter}>Another 15,000 ROCKY unlocks VIP 3</span>
              <span>VIP 3</span>
            </div>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.historyPanel}`}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
              Mining History
            </div>
            <div className={styles.tabGroup}>
              {HISTORY_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.tabItem} ${range === r ? styles.tabItemActive : ""}`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.historyChart}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3dd68c" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3dd68c" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1b1b22" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#6e6e72" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis stroke="#6e6e72" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toLocaleString()} width={56} />
                <Area type="monotone" dataKey="value" stroke="#3dd68c" strokeWidth={2} fill="url(#historyFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l14-6v14L3 13z" />
                <path d="M6 13v4a2 2 0 0 0 2 2h2" />
              </svg>
              Today's Activity
            </div>
            <button type="button" className={styles.viewAll}>
              View all
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          <div className={styles.activityTable}>
            {ACTIVITIES.map((a, i) => (
              <div key={i} className={styles.activityRow}>
                <div className={styles.activityCol}>
                  <span className={styles.activityTitle}>{a.title}</span>
                </div>
                <div className={styles.activityCol}>
                  <span className={styles.activitySub}>{a.sub}</span>
                </div>
                <div className={styles.activityTime}>{a.time}</div>
                <div className={styles.activityRight}>
                  <span
                    className={`${styles.activityAmount} ${
                      a.amountTone === "orange"
                        ? styles.activityAmountUp
                        : a.amountTone === "green"
                        ? styles.activityAmountGreen
                        : styles.activityAmountDown
                    }`}
                  >
                    {a.amount}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Activity["status"] }) {
  if (status === "Claimed") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusClaimed}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Claimed
      </span>
    );
  }
  if (status === "Settled") {
    return (
      <span className={`${styles.statusBadge} ${styles.statusSettled}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Settled
      </span>
    );
  }
  return (
    <span className={`${styles.statusBadge} ${styles.statusPending}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      Pending
    </span>
  );
}

function RealtimeMining() {
  return (
    <div className={styles.rtMining}>
      Real-time mining: <span className={styles.rtMiningValue}>+2.5 ROCKY/s</span>
    </div>
  );
}
