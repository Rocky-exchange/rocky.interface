import { useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import "../styles/global.scss";
import { ClaimRewardsFlow } from "../components/ClaimRewardsFlow/ClaimRewardsFlow";
import { CountUp } from "../components/CountUp/CountUp";
import { LighterToastContainer } from "../components/LighterToast/LighterToast";
import { emitToast } from "../components/LighterToast/toastBus";
import { MiningBadgeContainer } from "../components/MiningBadge/MiningBadge";
import { TopNav } from "../components/TopNav/TopNav";
import styles from "./LighterMiningPage.module.scss";

type StatCard = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  unit?: string;
  badge?: string;
  note?: string;
};

const STATS: StatCard[] = [
  {
    label: "Today's Total Mining Output",
    value: 2847320,
    suffix: "ROCKY",
    badge: "↑ +18.4% vs. yesterday",
  },
  {
    label: "My Ranking",
    value: 347,
    prefix: "#",
    unit: "/ 12,313",
    badge: "↑ 12 places",
  },
  {
    label: "My Proportion",
    value: 0.032,
    decimals: 3,
    suffix: "%",
    note: "Daily Contributions 1,247 ROCKY",
  },
  {
    label: "Currently Online Miners",
    value: 3432,
    note: "Active in the last 5 minutes",
  },
];

const TRACKER_STEPS = [
  { label: "PENDING", value: 45 },
  { label: "MINTED", value: 120 },
  { label: "CLAIMED", value: 1080 },
];

const TRACKER_TABS = [
  { key: "pending", label: "Pending", count: 3 },
  { key: "minted", label: "Minted", count: 8 },
  { key: "all", label: "All History", count: 147 },
] as const;

const REWARDS = [
  { symbol: "BTC-USDT", side: "Taker", time: "14:32:15", round: "#45678", amount: "+25 ROCKY", status: "Pending • -8min" },
  { symbol: "ETH-UST", side: "Maker", time: "14:28:42", round: "#45678", amount: "+12 ROCKY", status: "Pending • -6min" },
  { symbol: "SOL-USDT", side: "Taker", time: "14:25:10", round: "#45678", amount: "+12 ROCKY", status: "Pending • -6min" },
];

const INCOME = [
  { key: "taker", label: "As Taker", value: 249, color: "#3dd68c" },
  { key: "maker", label: "As Maker", value: 249, color: "#5bb4f7" },
  { key: "operator", label: "Operator", value: 249, color: "#8b9bff" },
  { key: "insurance", label: "Insurance", value: 436, color: "#f7a43b" },
];

const TAKER_MAKER = { taker: 55, maker: 45 };

type FeedItem = { id: string; user: string; meta: string; amount: string; self: boolean };

const INITIAL_FEED: FeedItem[] = [
  { id: "f0", user: "party::abc.. xyz", meta: "BTC · Taker · 1s ago", amount: "+25 ROCKY", self: false },
  { id: "f1", user: "You", meta: "BTC · Taker · 2s ago", amount: "+20 ROCKY", self: true },
  { id: "f2", user: "party::def.. uvw", meta: "ETH · Taker · 2s ago", amount: "+12 ROCKY", self: false },
  { id: "f3", user: "guest::hij.. lmn", meta: "ETH · Maker · 3s ago", amount: "+18 ROCKY", self: false },
  { id: "f4", user: "visitor::opq.. rst", meta: "LTC · Taker · 4s ago", amount: "+22 ROCKY", self: false },
  { id: "f5", user: "user::uvw.. xyz", meta: "DOGE · Maker · 5s ago", amount: "+15 ROCKY", self: false },
  { id: "f6", user: "member::abc.. def", meta: "XRP · Taker · 6s ago", amount: "+30 ROCKY", self: false },
];

const RANDOM_SYMBOLS = ["BTC", "ETH", "SOL", "LTC", "XRP", "DOGE", "AVAX", "ARB", "OP", "LINK"];
const RANDOM_SIDES = ["Taker", "Maker"] as const;
const RANDOM_PREFIXES = ["party", "guest", "user", "visitor", "trader", "miner", "whale", "shark"];

function randomHex(len = 3): string {
  let s = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateFeedItem(): FeedItem {
  const prefix = RANDOM_PREFIXES[Math.floor(Math.random() * RANDOM_PREFIXES.length)];
  const symbol = RANDOM_SYMBOLS[Math.floor(Math.random() * RANDOM_SYMBOLS.length)];
  const side = RANDOM_SIDES[Math.floor(Math.random() * RANDOM_SIDES.length)];
  const amount = 8 + Math.floor(Math.random() * 38);
  return {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user: `${prefix}::${randomHex()}.. ${randomHex()}`,
    meta: `${symbol} · ${side} · just now`,
    amount: `+${amount} ROCKY`,
    self: false,
  };
}

export default function LighterMiningPage() {
  const history = useHistory();
  const [activeTab, setActiveTab] = useState<(typeof TRACKER_TABS)[number]["key"]>("pending");
  const [claimOpen, setClaimOpen] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>(INITIAL_FEED);
  const feedRef = useRef(feed);
  feedRef.current = feed;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFeed((prev) => [generateFeedItem(), ...prev].slice(0, 9));
    }, 2600);
    return () => window.clearInterval(interval);
  }, []);

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
        <div className={styles.header}>
          <div className={styles.title}>Mining Center</div>
          <div className={styles.subtitle}>Trading is Mining · Every transaction generates a ROCKY reward.</div>
        </div>

        <div className={styles.statsRow}>
          {STATS.map((s) => (
            <div key={s.label} className={styles.card}>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statValueRow}>
                <CountUp
                  value={s.value}
                  decimals={s.decimals ?? 0}
                  prefix={s.prefix ?? ""}
                  className={styles.statValue}
                />
                {s.suffix ? <span className={styles.statSuffix}>{s.suffix}</span> : null}
                {s.unit ? <span className={styles.statUnit}>{s.unit}</span> : null}
              </div>
              {s.badge ? <span className={styles.statBadge}>{s.badge}</span> : null}
              {s.note ? <div className={styles.statNote}>{s.note}</div> : null}
            </div>
          ))}
        </div>

        <div className={styles.mainRow}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10" />
                  <path d="M16 12h6" />
                  <circle cx="17" cy="12" r="1" />
                </svg>
                My Rewards Tracker
              </div>
              <div className={styles.panelAside}>
                <CountUp value={1047.5} decimals={1} /> ROCKY
              </div>
            </div>

            <div className={styles.tracker}>
              {TRACKER_STEPS.map((step) => (
                <div key={step.label} className={styles.trackerChip}>
                  <span className={styles.trackerLabel}>{step.label}</span>
                  <CountUp value={step.value} className={styles.trackerValue} />
                </div>
              ))}
            </div>

            <div className={styles.tabsRow}>
              {TRACKER_TABS.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(t.key)}
                  type="button"
                >
                  {t.label} <span className={styles.tabCount}>{t.count}</span>
                </button>
              ))}
              <div className={styles.tabSpacer} />
              <button type="button" className={styles.tabViewAll} onClick={() => emitToast("Full rewards history coming soon", "info")}>
                View all
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className={styles.rewardList}>
              {REWARDS.map((r) => (
                <div key={`${r.symbol}-${r.time}`} className={styles.rewardRow}>
                  <div>
                    <div className={styles.rewardSymbol}>{r.symbol} - {r.side}</div>
                    <div className={styles.rewardMeta}>{r.time} · Round {r.round}</div>
                  </div>
                  <div className={styles.rewardRight}>
                    <div className={styles.rewardAmount}>{r.amount}</div>
                    <div className={styles.rewardStatus}>{r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3a9 9 0 0 1 9 9h-9V3z" fill="currentColor" stroke="none" />
                </svg>
                My Income Distribution
              </div>
            </div>

            <div className={styles.donutWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={INCOME}
                    dataKey="value"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {INCOME.map((seg) => (
                      <Cell key={seg.key} fill={seg.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutCenter}>
                <div className={styles.donutCenterValue}>
                  <CountUp value={1247.5} decimals={1} />
                </div>
                <div className={styles.donutCenterLabel}>ROCKY Total</div>
              </div>
            </div>

            <div className={styles.legendGrid}>
              {INCOME.map((seg) => (
                <div key={seg.key} className={styles.legendItem}>
                  <span className={styles.legendSwatch} style={{ background: seg.color }} />
                  <span className={styles.legendLabel}>{seg.label}</span>
                  <span className={styles.legendValue}>{seg.value} ROCKY</span>
                </div>
              ))}
            </div>

            <div className={styles.ratioBlock}>
              <div className={styles.ratioTitle}>Taker vs Maker</div>
              <div className={styles.ratioBar}>
                <div className={`${styles.ratioSeg} ${styles.ratioTaker}`} style={{ width: `${TAKER_MAKER.taker}%` }}>
                  {TAKER_MAKER.taker}% · Taker
                </div>
                <div className={`${styles.ratioSeg} ${styles.ratioMaker}`} style={{ width: `${TAKER_MAKER.maker}%` }}>
                  Maker · {TAKER_MAKER.maker}%
                </div>
              </div>
              <div className={styles.ratioNote}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="0.8" fill="currentColor" />
                </svg>
                <span>
                  The average across the entire network is Taker 65% / Maker 35%. Your Maker ratio is higher, indicating a market maker approach.
                </span>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>
                <svg className={styles.panelTitleIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Live Mining Feed
              </div>
            </div>
            <div className={styles.feedHint}>
              WebSocket pushes cross-platform anonymous mining events, updated every 1 second
            </div>
            <div className={styles.feedList}>
              {feed.map((f) => (
                <div key={f.id} className={`${styles.feedRow} ${styles.feedRowEnter}`}>
                  <div>
                    <div className={`${styles.feedUser} ${f.self ? styles.feedUserSelf : ""}`}>{f.user}</div>
                    <div className={styles.feedMeta}>{f.meta}</div>
                  </div>
                  <div className={styles.feedAmount}>{f.amount}</div>
                </div>
              ))}
            </div>
            <div className={styles.feedFooter}>24H · 12,485 miners · 2.8M ROCKY</div>
          </div>
        </div>

        <div className={styles.actionRow}>
          <div className={styles.actionCard}>
            <div className={styles.actionBody}>
              <div className={styles.actionTitle}>Claim available rewards</div>
              <div className={styles.actionDesc}>
                You have <strong>1,082.5 ROCKY</strong> available to claim to your wallet.
              </div>
            </div>
            <button type="button" className={styles.claimBtn} onClick={() => setClaimOpen(true)}>
              Claim 1,082.5 ROCKY
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
          <div className={styles.actionCard}>
            <div className={styles.actionBody}>
              <div className={styles.actionTitle}>
                Stake to earn <span className={`${styles.statBadge} ${styles.stakeBadge}`}>15% APY</span>
              </div>
              <div className={styles.actionDesc}>Staking rewards to receive fee dividends (CC)</div>
            </div>
            <button type="button" className={styles.stakeBtn} onClick={() => { emitToast("Redirecting to staking...", "info"); history.push("/vip"); }}>
              Stake for Dividends
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ClaimRewardsFlow open={claimOpen} onClose={() => setClaimOpen(false)} />
      <LighterToastContainer />
      <MiningBadgeContainer />
    </div>
  );
}

function RealtimeMining() {
  return (
    <div className={styles.rtMining}>
      Real-time mining: <span className={styles.rtMiningValue}>+2.5 ROCKY/s</span>
    </div>
  );
}
