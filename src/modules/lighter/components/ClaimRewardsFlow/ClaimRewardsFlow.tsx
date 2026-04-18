import { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";

import { emitToast } from "../LighterToast/toastBus";
import styles from "./ClaimRewardsFlow.module.scss";

const TX_HASH = "0xa1b2c3d4e5f6789012345678901234567890abcd1234ef5678901234567890ef";

export type ClaimStep = "claim" | "processing" | "success";

type Props = {
  open: boolean;
  onClose: () => void;
  initialStep?: ClaimStep;
};

const SOURCES = [
  { label: "As Taker", note: "(40%)", amount: "+418.8", unit: "ROCKY", muted: false },
  { label: "As Maker", note: "(30%)", amount: "+314.2", unit: "ROCKY", muted: false },
  { label: "Referral Bonus", note: "", amount: "+52.3", unit: "ROCKY", muted: false },
  { label: "VIP 2 Boosted Rewards", note: "", amount: "+261.1", unit: "ROCKY", muted: false },
  { label: "Canton Network Fee", note: "(Estimated)", amount: "~0.005 CC", unit: "(≈ $0.01)", muted: true },
];

export function ClaimRewardsFlow({ open, onClose, initialStep = "claim" }: Props) {
  const [step, setStep] = useState<ClaimStep>(initialStep);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
  }, [open, initialStep]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-advance processing -> success
  useEffect(() => {
    if (!open || step !== "processing") return;
    const t = setTimeout(() => setStep("success"), 2800);
    return () => clearTimeout(t);
  }, [open, step]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {step === "claim" ? <ClaimStepView onClaim={() => setStep("processing")} /> : null}
        {step === "processing" ? <ProcessingStepView /> : null}
        {step === "success" ? <SuccessStepView onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function ClaimStepView({ onClaim }: { onClaim: () => void }) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.title}>Claim Your Rewards</div>
        <div className={styles.subtitle}>Trading is mining，get your mining rewards</div>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryLabel}>AVAILABLE TO CLAIM</div>
        <div className={styles.summaryValueRow}>
          <span className={styles.summaryValue}>1,047.5</span>
          <span className={styles.summaryUnit}>ROCKY</span>
        </div>
        <div className={styles.summaryUsd}>≈ $523.75 USD</div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryStats}>
          <div>
            <div className={styles.statValue}>123</div>
            <div className={styles.statLabel}>Transactions</div>
          </div>
          <div>
            <div className={styles.statValue}>30</div>
            <div className={styles.statLabel}>Days Active</div>
          </div>
          <div>
            <div className={styles.statValue}>5</div>
            <div className={styles.statLabel}>Mining Rounds</div>
          </div>
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <span>SOURCES</span>
        <button type="button" className={styles.expandBtn}>
          Expand
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <div className={styles.sourceList}>
        {SOURCES.map((s) => (
          <div key={s.label} className={styles.sourceRow}>
            <span className={styles.sourceLabel}>
              {s.label}
              {s.note ? <span className={styles.sourceLabelMuted}>{s.note}</span> : null}
            </span>
            <span className={s.muted ? styles.sourceAmountMuted : styles.sourceAmount}>
              {s.amount}
              {s.unit ? <small>{s.unit === "ROCKY" ? ` ${s.unit}` : ` ${s.unit}`}</small> : null}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className={styles.ctaPrimary} onClick={onClaim}>
        Claim All 1,047.5 ROCKY
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      <button
        type="button"
        className={styles.ctaOutline}
        onClick={() => emitToast("Staking UI not yet implemented in demo", "info")}
      >
        Stake to Earn Fee Rewards(cc)
        <span className={styles.apyPill}>15% APY</span>
      </button>

      <div className={styles.footNote}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        All signatures are completed in your wallet · Your funds never leave the Canton Protocol
      </div>
      <div className={styles.footLinks}>
        <button type="button" className={styles.footLink} onClick={() => emitToast("Opening mining docs...", "info")}>Learn How Mining Works</button>
        <button type="button" className={styles.footLink} onClick={() => emitToast("Opening staking rewards...", "info")}>View Staking Rewards</button>
      </div>
    </>
  );
}

function ProcessingStepView() {
  return (
    <>
      <div className={styles.header}>
        <svg className={styles.headerIcon} width="64" height="54" viewBox="0 0 64 54" fill="none">
          <rect x="40" y="4" width="10" height="10" rx="1" stroke="#B4B4B6" strokeWidth="1.5" />
          <rect x="50" y="18" width="8" height="8" rx="1" stroke="#B4B4B6" strokeWidth="1.5" />
          <rect x="20" y="30" width="10" height="10" rx="1" stroke="#B4B4B6" strokeWidth="1.5" />
          <circle cx="8" cy="24" r="2" fill="#B4B4B6" />
          <circle cx="46" cy="42" r="2" fill="#B4B4B6" />
          <circle cx="32" cy="10" r="1.5" fill="#B4B4B6" />
        </svg>
        <div className={styles.title}>Processing on Canton</div>
        <div className={styles.subtitle}>Please wait, confirming on-chain...</div>
      </div>

      <div className={styles.stepList}>
        <div className={`${styles.stepRow} ${styles.stepDone}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#3dd68c" fillOpacity="0.2" stroke="#3dd68c" strokeWidth="1.5" />
            <polyline points="8 12 11 15 16 10" stroke="#3dd68c" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Wallet Signature
        </div>
        <div className={`${styles.stepRow} ${styles.stepActive}`}>
          <svg className={styles.stepIconSpin} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#f7a43b" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M21 12a9 9 0 0 1-9 9" stroke="#f7a43b" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          Submitting to Canton
        </div>
        <div className={styles.stepRow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#26262e" />
            <circle cx="8" cy="12" r="1" fill="#6e6e72" />
            <circle cx="12" cy="12" r="1" fill="#6e6e72" />
            <circle cx="16" cy="12" r="1" fill="#6e6e72" />
          </svg>
          Mining Round Finalization
        </div>
      </div>

      <div className={styles.procFooter}>
        <span>
          Estimated to complete in <strong>5–10</strong> seconds
        </span>
        <span className={styles.txChip}>Tx: 0xa1b2...c3d4</span>
      </div>
    </>
  );
}

function SuccessStepView({ onClose }: { onClose: () => void }) {
  const history = useHistory();
  const handleContinue = () => {
    onClose();
    history.push("/trade");
  };
  const handleViewTx = async () => {
    try {
      await navigator.clipboard.writeText(TX_HASH);
      emitToast(`Tx hash copied: ${TX_HASH.slice(0, 10)}...`, "success");
    } catch {
      emitToast("Unable to copy tx hash", "error");
    }
  };
  return (
    <>
      <div className={styles.header}>
        <svg className={styles.headerIcon} width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#f7a43b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 50l18-28 12 8L14 50z" fill="rgba(247, 164, 59, 0.1)" />
          <path d="M34 20l3-5M42 14l3-3M46 22l4-1M50 30l5 1M40 28l3 4M28 12l1-4" />
          <circle cx="46" cy="12" r="1.5" fill="#f7a43b" />
          <circle cx="54" cy="18" r="1.5" fill="#f7a43b" />
          <circle cx="52" cy="38" r="1.5" fill="#f7a43b" />
        </svg>
        <div className={styles.title}>Claimed Successfully!</div>
        <div className={styles.subtitle}>1,047.5 ROCKY has been credited to your wallet</div>
      </div>

      <div className={styles.successCard}>
        <div className={styles.successLabel}>YOUR NEW BALANCE</div>
        <div className={styles.successValueRow}>
          <span className={styles.successValue}>12,567.5</span>
          <span className={styles.successUnit}>ROCKY</span>
        </div>
        <div className={styles.successDelta}>↑ +1,047.5</div>
      </div>

      <div className={styles.successMeta}>
        <span>
          7,432.5 ROCKY to reach <span className={styles.successMetaHighlight}>VIP 3</span>
        </span>
        <span className={styles.successMetaItalic}>Keep trading to unlock lower fees</span>
      </div>

      <button type="button" className={styles.ctaPrimary} onClick={handleContinue}>
        Continue Trading
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      <button type="button" className={styles.ctaOutline} onClick={handleViewTx}>View Transaction</button>
    </>
  );
}
