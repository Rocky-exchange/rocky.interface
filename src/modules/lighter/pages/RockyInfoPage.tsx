import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { TopNav } from "../components/TopNav/TopNav";
import "../styles/global.scss";
import styles from "./RockyInfoPage.module.scss";

type Metric = {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
};

type Row = string[];

type PageConfig = {
  route: "portfolio" | "mining" | "vip" | "explorer";
  navExtra: string;
  kicker: string;
  title: string;
  subtitle: string;
  primaryAction?: string;
  secondaryAction?: string;
  metrics: Metric[];
  tableTitle: string;
  tableColumns: string[];
  tableRows: Row[];
};

const PAGES: Record<PageConfig["route"], PageConfig> = {
  portfolio: {
    route: "portfolio",
    navExtra: "Real-time mining: +2.5 ROCKY/s",
    kicker: "Portfolio",
    title: "Total Mined",
    subtitle: "Track rewards, PnL, trading volume, and ROCKY mining progress from one dashboard.",
    primaryAction: "Claim Rewards",
    secondaryAction: "Start Trading",
    metrics: [
      { label: "Total Mined", value: "1,247.5 ROCKY", trend: "+12.5%", detail: "+125 ROCKY" },
      { label: "Profit and losses", value: "$837.2", detail: "Today's PnL" },
      { label: "Today's Trading Volume", value: "$15,210.21", detail: "24 transactions" },
      { label: "VIP Level", value: "VIP2", detail: "Another 15,000 ROCKY unlocks VIP 3" },
    ],
    tableTitle: "Today's Activity",
    tableColumns: ["Market", "Volume", "Reward", "Status"],
    tableRows: [
      ["BTC-USDT", "$6,050", "+42.5 ROCKY", "Minted"],
      ["ETH-USDT", "$4,820", "+33.7 ROCKY", "Pending"],
      ["CC-USDT", "$4,340", "+30.4 ROCKY", "Claimed"],
    ],
  },
  mining: {
    route: "mining",
    navExtra: "Real-time mining: +2.5 ROCKY/s",
    kicker: "Mining Center",
    title: "Trading is Mining",
    subtitle: "Every transaction generates a ROCKY reward and contributes to daily mining output.",
    primaryAction: "View Rewards",
    metrics: [
      { label: "Today's Total Mining Output", value: "2,847,320 ROCKY", trend: "+18.4%", detail: "vs. yesterday" },
      { label: "My Ranking", value: "#347 / 12,313", trend: "+12 places" },
      { label: "My Proportion", value: "0.032%", detail: "Daily Contributions" },
      { label: "Currently Online Miners", value: "3,432", detail: "Active in the last 5 minutes" },
    ],
    tableTitle: "My Rewards Tracker",
    tableColumns: ["Market", "Reward", "State", "Time"],
    tableRows: [
      ["BTC-USDT", "+45 ROCKY", "Pending", "2 min ago"],
      ["ETH-USDT", "+120 ROCKY", "Minted", "18 min ago"],
      ["BTC-USDT", "+1,080 ROCKY", "Claimed", "Today"],
    ],
  },
  vip: {
    route: "vip",
    navExtra: "ROCKY Holding: 5,320",
    kicker: "VIP",
    title: "VIP 2",
    subtitle: "Hold ROCKY and keep trading to unlock lower maker and taker fees.",
    primaryAction: "Upgrade VIP",
    metrics: [
      { label: "Current Grade", value: "VIP 2", detail: "Already hold 5,320 ROCKY" },
      { label: "Next Tier", value: "VIP 3", detail: "Hold more 14,680 ROCKY" },
      { label: "Fee Discount", value: "20% OFF", detail: "Current trading fee discount" },
      { label: "Estimated Savings", value: "$870", detail: "Annual estimate after VIP 3" },
    ],
    tableTitle: "Fee Tiers",
    tableColumns: ["Tier", "ROCKY Holdings", "30D Trading Volume", "Maker Fee", "Taker Fee"],
    tableRows: [
      ["VIP0", "--", "< $1M", "1.0 bps", "2.5 bps"],
      ["VIP1", "2,000 ROCKY", "$1M", "0.8 bps", "2.2 bps"],
      ["VIP2", "5,000 ROCKY", "$5M", "0.6 bps", "2.0 bps"],
      ["VIP3", "20,000 ROCKY", "$20M", "0.4 bps", "1.8 bps"],
    ],
  },
  explorer: {
    route: "explorer",
    navExtra: "Block 214,241,984",
    kicker: "Explorer",
    title: "Rocky Explorer",
    subtitle: "Track blocks, transactions, and mining activity across the Rocky network.",
    secondaryAction: "Search",
    metrics: [
      { label: "Latest Block", value: "214,241,984", detail: "Produced 1.2s ago" },
      { label: "Avg Block Time", value: "1.8s", detail: "Rolling 24h average" },
      { label: "24H Mining Output", value: "2,847,320 ROCKY", trend: "+18.4%", detail: "vs. yesterday" },
      { label: "Active Miners", value: "3,432", detail: "Online now" },
    ],
    tableTitle: "Latest Blocks",
    tableColumns: ["Block", "Proposer", "Transactions", "Reward"],
    tableRows: [
      ["#214,241,984", "validator-07", "186 txns", "+2.5 ROCKY"],
      ["#214,241,983", "validator-03", "142 txns", "+2.5 ROCKY"],
      ["#214,241,982", "validator-11", "158 txns", "+2.5 ROCKY"],
    ],
  },
};

function getPageKey(pathname: string): PageConfig["route"] {
  if (pathname.startsWith("/mining")) return "mining";
  if (pathname.startsWith("/vip")) return "vip";
  if (pathname.startsWith("/explorer")) return "explorer";
  return "portfolio";
}

function HeaderMetric({ children }: { children: string }) {
  return <div className={styles.headerMetric}>{children}</div>;
}

export default function RockyInfoPage() {
  const { pathname } = useLocation();
  const page = useMemo(() => PAGES[getPageKey(pathname)], [pathname]);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav rightExtra={<HeaderMetric>{page.navExtra}</HeaderMetric>} />
      </div>
      <main className={styles.content}>
        <section className={styles.hero}>
          <div>
            <div className={styles.kicker}>{page.kicker}</div>
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
          </div>
          <div className={styles.actions}>
            {page.primaryAction ? <button className={styles.primary}>{page.primaryAction}</button> : null}
            {page.secondaryAction ? <button className={styles.secondary}>{page.secondaryAction}</button> : null}
          </div>
        </section>

        <section className={styles.metrics} aria-label={`${page.kicker} metrics`}>
          {page.metrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <div>
                {metric.trend ? <em>{metric.trend}</em> : null}
                {metric.detail ? <small>{metric.detail}</small> : null}
              </div>
            </article>
          ))}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>{page.tableTitle}</h2>
            <button type="button">View all</button>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {page.tableColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.tableRows.map((row) => (
                  <tr key={row.join(":")}>
                    {row.map((cell, index) => (
                      <td key={`${cell}-${index}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
