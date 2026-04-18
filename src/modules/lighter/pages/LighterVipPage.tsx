import { useEffect, useState } from "react";

import "../styles/global.scss";
import { ClaimRewardsFlow } from "../components/ClaimRewardsFlow/ClaimRewardsFlow";
import { TopNav } from "../components/TopNav/TopNav";
import styles from "./LighterVipPage.module.scss";

type TierStatus =
  | { kind: "achieved" }
  | { kind: "current" }
  | { kind: "close"; remaining: string }
  | { kind: "locked" };

type Tier = {
  name: string;
  sub: string;
  holdings: string;
  volume: string;
  maker: string;
  taker: string;
  discountMain: string;
  discountSub?: string;
  status: TierStatus;
  makerExtra?: "star";
};

const TIERS: Tier[] = [
  {
    name: "VIP 0",
    sub: "Starter",
    holdings: "--",
    volume: "< $1M",
    maker: "1.0 bps",
    taker: "2.5 bps",
    discountMain: "Base",
    status: { kind: "achieved" },
  },
  {
    name: "VIP 1",
    sub: "Active user",
    holdings: "≥ 1,000",
    volume: "≥ $1M",
    maker: "0.8 bps",
    taker: "0.8 bps",
    discountMain: "-12%",
    discountSub: "Save $30 / $100K",
    status: { kind: "achieved" },
  },
  {
    name: "VIP 2",
    sub: "Current Tier",
    holdings: "≥ 5,000",
    volume: "≥ $5M",
    maker: "0.6 bps",
    taker: "2.0 bps",
    discountMain: "-20%",
    discountSub: "Save $50 / $100K",
    status: { kind: "current" },
  },
  {
    name: "VIP 3",
    sub: "Close to Achieving",
    holdings: "≥ 5,000",
    volume: "≥ $5M",
    maker: "0.6 bps",
    taker: "2.0 bps",
    discountMain: "-20%",
    discountSub: "Save $50 / $100K",
    status: { kind: "close", remaining: "14,680 Remaining" },
  },
  {
    name: "VIP 4",
    sub: "Whale Tier",
    holdings: "≥ 100,000",
    volume: "≥ $100M",
    maker: "0.2 bps",
    taker: "1.5 bps",
    discountMain: "-40%",
    discountSub: "Save $100 / $100K",
    status: { kind: "locked" },
  },
  {
    name: "Market Maker",
    sub: "Market Maker Exclusive",
    holdings: "≥ 500,000",
    volume: "--",
    maker: "-0.1 bps",
    taker: "1.2 bps",
    discountMain: "Rebate",
    discountSub: "Negative Fee Rebates",
    status: { kind: "locked" },
    makerExtra: "star",
  },
];

export default function LighterVipPage() {
  const [claimOpen, setClaimOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav rightExtra={<HoldingBadge />} />
      </div>
      <div className={styles.content}>
        <div className={`${styles.panel} ${styles.statusPanel}`}>
          <div className={styles.rockWrap}>
            <img src="/vip2.png" alt="VIP 2" className={styles.rockImg} />
            <span className={styles.offBadge}>
              <span className={styles.offBadgePercent}>20%</span>&nbsp;OFF FEES
            </span>
          </div>
          <div className={styles.statusMain}>
            <div className={styles.statusTop}>
              <div className={styles.statusTopLeft}>
                <div className={styles.statusTitleRow}>
                  <span className={styles.currentChip}>VIP 2</span>
                  <span className={styles.currentLabel}>Current Grade</span>
                </div>
                <div className={styles.currentHold}>Already hold 5,320 ROCKY</div>
              </div>
              <div className={styles.statusTopRight}>
                <div className={styles.nextLabel}>VIP 3</div>
                <div className={styles.nextSub}>Next Tier</div>
              </div>
            </div>

            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ ["--p" as any]: "72%" }} />
            </div>

            <div className={styles.progressMeta}>
              <span>5,000 ROCKY (VIP 2)</span>
              <span className={styles.progressMetaCenter}>
                Hold more <strong>14,680 ROCKY</strong> to unlock VIP 3
              </span>
              <span className={styles.progressMetaEnd}>20,000 ROCKY (VIP 3)</span>
            </div>

            <div className={styles.infoCallout}>
              <svg className={styles.infoCalloutIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.8c.5.4.8 1 .8 1.6V17h5.4v-1.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" />
              </svg>
              <span>
                After upgrading to VIP 3：Maker fee 0.6 → 0.4 bps，Taker 2.0 → 1.8 bps，Estimated annual savings $870
              </span>
            </div>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.tiersPanel}`}>
          <div className={styles.tiersHeader}>
            <div className={styles.tiersTitle}>Fee Tiers</div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: "#f7a43b" }} />
                Current
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: "#3dd68c" }} />
                Close to Achieving
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: "#5bb4f7" }} />
                Achieved
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: "#6e6e72" }} />
                Unlock
              </span>
            </div>
          </div>

          <div className={styles.tiersTable}>
            <div className={styles.tiersHead}>
              <div>TIER</div>
              <div>ROCKY HOLDINGS</div>
              <div>30D TRADING VOLUME</div>
              <div>MAKER FEE</div>
              <div>TAKER FEE</div>
              <div>DISCOUNT</div>
              <div style={{ textAlign: "right" }}>STATUS</div>
            </div>

            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`${styles.tierRow} ${
                  t.status.kind === "current" ? styles.tierRowCurrent : ""
                } ${t.status.kind === "close" ? styles.tierRowClose : ""}`}
              >
                <div className={styles.tierCell}>
                  <div className={styles.tierIcon}>{t.name.startsWith("VIP") ? t.name.replace(" ", "") : "MM"}</div>
                  <div>
                    <div
                      className={`${styles.tierTitle} ${
                        t.status.kind === "current" ? styles.tierCurrentText : ""
                      } ${t.status.kind === "close" ? styles.tierCloseText : ""}`}
                    >
                      {t.name}
                    </div>
                    <div className={styles.tierSub}>{t.sub}</div>
                  </div>
                </div>
                <div>{t.holdings}</div>
                <div>{t.volume}</div>
                <div>
                  {t.maker}
                  {t.makerExtra === "star" ? " ⭐" : ""}
                </div>
                <div>{t.taker}</div>
                <div>
                  <div className={styles.tierDiscountMain}>{t.discountMain}</div>
                  {t.discountSub ? <div className={styles.tierDiscountSub}>{t.discountSub}</div> : null}
                </div>
                <div className={styles.tierStatus}>
                  <StatusPill status={t.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.compareRow}>
          <div className={styles.compareCard}>
            <div>
              <div className={styles.compareTitleRow}>
                <span>Current Grade</span>
                <span className={styles.compareTitleEm}>VIP2</span>
              </div>
            </div>
            <div>
              <div className={styles.compareSubLabel}>Fee Rate</div>
              <div className={styles.compareFeeRow}>
                <span className={`${styles.compareFeeValue} ${styles.compareFeeValueOrange}`}>$25</span>
                <span className={styles.compareFeeDesc}>Fees paid for a $100K notional trade</span>
              </div>
            </div>
            <div className={styles.compareList}>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Maker (0.6 bps): $6</div>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Taker (2.0 bps): $20</div>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Total: $26 (based on a 3:7 Maker/Taker ratio)</div>
            </div>
          </div>

          <div className={styles.compareArrow}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </div>

          <div className={styles.compareCard}>
            <div>
              <div className={styles.compareTitleRow}>
                <span>Upgrade to</span>
                <span className={styles.compareTitleEm}>VIP3</span>
              </div>
            </div>
            <div>
              <div className={styles.compareSubLabel}>Fee Rate</div>
              <div className={styles.compareFeeRow}>
                <span className={styles.compareFeeValue}>$18</span>
                <span className={styles.compareFeeDesc}>For the same $100K trade, you only pay</span>
              </div>
            </div>
            <div className={styles.compareList}>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Maker (0.4 bps): $4</div>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Taker (1.8 bps): $13</div>
              <div className={styles.compareListItem}><span className={styles.compareDot}>·</span> Total: $17 (save $9, 35% reduction)</div>
            </div>
          </div>

          <div className={styles.compareCard}>
            <div className={styles.compareTitleRow}>
              <span className={styles.compareTitleEm}>Save</span>
            </div>
            <div>
              <div className={styles.compareSubLabel}>Estimated Based On Current Trading Frequency</div>
              <div className={styles.compareFeeRow}>
                <span className={styles.saveValue}>$870</span>
                <span className={styles.saveUnit}>/Year</span>
              </div>
            </div>
            <div className={styles.saveNote}>Based on $8.7M volume over the past 30 days × 12 months</div>
          </div>
        </div>

        <div className={styles.ctaRow}>
          <div className={styles.ctaLeft}>
            <button type="button" className={styles.btnOutline}>Buy ROCKY</button>
            <button type="button" className={styles.btnOutline}>Check Staking Details</button>
          </div>
          <button type="button" className={styles.btnPrimaryLg} onClick={() => setClaimOpen(true)}>
            Start Earning ROCKY Now
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      <ClaimRewardsFlow open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  );
}

function StatusPill({ status }: { status: TierStatus }) {
  if (status.kind === "achieved") {
    return (
      <span className={`${styles.statusPill} ${styles.statusAchieved}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Achieved
      </span>
    );
  }
  if (status.kind === "current") {
    return (
      <span className={`${styles.statusPill} ${styles.statusCurrent}`}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", display: "inline-block" }} />
        Current
      </span>
    );
  }
  if (status.kind === "close") {
    return <span className={`${styles.statusPill} ${styles.statusClose}`}>{status.remaining}</span>;
  }
  return (
    <span className={`${styles.statusPill} ${styles.statusLocked}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="9" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      Unlock
    </span>
  );
}

function HoldingBadge() {
  return (
    <div className={styles.holdingBadge}>
      ROCKY Holding: <span className={styles.holdingValue}>5,320</span>
    </div>
  );
}
