import { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import "../styles/global.scss";
import { ClaimRewardsFlow } from "../components/ClaimRewardsFlow/ClaimRewardsFlow";
import { LighterToastContainer } from "../components/LighterToast/LighterToast";
import { emitToast } from "../components/LighterToast/toastBus";
import { TopNav } from "../components/TopNav/TopNav";
import styles from "./LighterMiningPage.module.scss";

type StatCard = {
  label: string;
  value: string;
  suffix?: string;
  unit?: string;
  badge?: string;
  note?: string;
};

const STATS: StatCard[] = [
  {
    label: "Today's Total Mining Output",
    value: "2,847,320",
    suffix: "ROCKY",
    badge: "↑ +18.4% vs. yesterday",
  },
  {
    label: "My Ranking",
    value: "#347",
    unit: "/ 12,313",
    badge: "↑ 12 places",
  },
  {
    label: "My Proportion",
    value: "0.032",
    suffix: "%",
    note: "Daily Contributions 1,247 ROCKY",
  },
  {
    label: "Currently Online Miners",
    value: "3,432",
    note: "Active in the last 5 minutes",
  },
];

const TRACKER_STEPS = [
  { label: "PENDING", value: "45" },
  { label: "MINTED", value: "120" },
  { label: "CLAIMED", value: "1080" },
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

const FEED = [
  { user: "party::abc.. xyz", meta: "BTC · Taker · 1s ago", amount: "+25 ROCKY", self: false },
  { user: "You", meta: "BTC · Taker · 2s ago", amount: "+20 ROCKY", self: true },
  { user: "party: :def...uvw", meta: "RTH · Taker · 2s ago", amount: "+12 ROCKY", self: false },
  { user: "guest::hij.. lmn", meta: "ETH · Maker · 3s ago", amount: "+18 ROCKY", self: false },
  { user: "visitor::opq.. rst", meta: "LTC · Taker · 4s ago", amount: "+22 ROCKY", self: false },
  { user: "user::uvw.. xyz", meta: "DOGE · Maker · 5s ago", amount: "+15 ROCKY", self: false },
  { user: "member::abc.. def", meta: "XRP · Taker · 6s ago", amount: "+30 ROCKY", self: false },
];

export default function LighterMiningPage() {
  const history = useHistory();
  const [activeTab, setActiveTab] = useState<(typeof TRACKER_TABS)[number]["key"]>("pending");
  const [claimOpen, setClaimOpen] = useState(false);

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
                <span className={styles.statValue}>{s.value}</span>
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
              <div className={styles.panelAside}>1,047.5 ROCKY</div>
            </div>

            <div className={styles.tracker}>
              {TRACKER_STEPS.map((step) => (
                <div key={step.label} className={styles.trackerChip}>
                  <span className={styles.trackerLabel}>{step.label}</span>
                  <span className={styles.trackerValue}>{step.value}</span>
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
                <div className={styles.donutCenterValue}>1,247.5</div>
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
              {FEED.map((f, i) => (
                <div key={i} className={styles.feedRow}>
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
