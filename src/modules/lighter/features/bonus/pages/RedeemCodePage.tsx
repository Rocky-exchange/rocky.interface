import { Trans } from "@lingui/macro";
import { useEffect, useRef, useState } from "react";
import { Link, useHistory } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import "../../../styles/global.scss";
import styles from "./RedeemCodePage.module.scss";
import { redeemBonusCode } from "../api/bonus.api";
import { BonusApiError } from "../api/bonus.types";
import { notifyBonusDataChanged } from "../api/useBonus";

export const MIN_REDEEM_CODE_LENGTH = 4;
const MAX_REDEEM_CODE_LENGTH = 32;

type Feedback =
  | { type: "minimum" }
  | { type: "api"; message: string }
  | { type: "generic" }
  | { type: "connect" }
  | null;

export function RedeemCodePage() {
  const history = useHistory();
  const { connected } = useCantonSession();
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useLighterBody();
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;

    if (!connected) {
      setFeedback({ type: "connect" });
      return;
    }
    if (code.length < MIN_REDEEM_CODE_LENGTH) {
      setFeedback({ type: "minimum" });
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setFeedback(null);
    const requestId = createRedeemRequestId();
    const attemptPathname = history.location.pathname;
    const canCommitAttempt = () => mountedRef.current && history.location.pathname === attemptPathname;

    try {
      await redeemBonusCode({ code, request_id: requestId });
      notifyBonusDataChanged();
      if (canCommitAttempt()) history.replace("/bonus");
    } catch (error) {
      if (canCommitAttempt()) {
        setFeedback(error instanceof BonusApiError ? { type: "api", message: error.message } : { type: "generic" });
      }
    } finally {
      pendingRef.current = false;
      if (canCommitAttempt()) setPending(false);
    }
  };

  const updateCode = (raw: string) => {
    setCode(normalizeRedeemCode(raw));
    setFeedback(null);
  };

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <main className={styles.main}>
        <Link to="/bonus" className={styles.backLink}>
          <span aria-hidden="true">←</span>
          <Trans>Back to bonus</Trans>
        </Link>

        <div className={styles.redeemGrid}>
          <section className={styles.intro}>
            <div className={styles.stationMark} aria-hidden="true">
              01 / CLAIM
            </div>
            <p className={styles.eyebrow}>
              <Trans>Rocky trial funds</Trans>
            </p>
            <h1 className={styles.title}>
              <Trans>Redeem trading credit</Trans>
            </h1>
            <p className={styles.introCopy}>
              <Trans>Activate an eligible code for a seven-day bonus lifecycle on your current Canton account.</Trans>
            </p>

            <ol className={styles.process}>
              <li>
                <span>01</span>
                <Trans>Enter your single-use Rocky code</Trans>
              </li>
              <li>
                <span>02</span>
                <Trans>Trade within the bonus risk controls</Trans>
              </li>
              <li>
                <span>03</span>
                <Trans>Keep profits as principal</Trans>
              </li>
            </ol>
          </section>

          <section className={styles.formPanel} aria-labelledby="redeem-form-heading">
            <div className={styles.formHeader}>
              <p className={styles.eyebrow}>
                <Trans>Secure redemption</Trans>
              </p>
              <h2 id="redeem-form-heading" className={styles.formTitle}>
                <Trans>Apply bonus code</Trans>
              </h2>
            </div>

            <form className={styles.form} aria-labelledby="redeem-form-heading" onSubmit={submit} noValidate>
              <label className={styles.label} htmlFor="bonus-redemption-code">
                <Trans>Redemption code</Trans>
              </label>
              <div className={styles.inputFrame}>
                <span className={styles.inputPrefix} aria-hidden="true">
                  RX
                </span>
                <input
                  id="bonus-redemption-code"
                  className={styles.input}
                  value={code}
                  onChange={(event) => updateCode(event.target.value)}
                  placeholder="ROCKY-2026"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={MAX_REDEEM_CODE_LENGTH}
                  disabled={pending}
                  aria-describedby="redeem-code-help redeem-feedback"
                  aria-invalid={feedback !== null}
                />
                <span className={styles.counter} aria-hidden="true">
                  {String(code.length).padStart(2, "0")}/{MAX_REDEEM_CODE_LENGTH}
                </span>
              </div>
              <p id="redeem-code-help" className={styles.help}>
                <Trans>Letters, numbers, and hyphens only. Minimum 4 characters.</Trans>
              </p>

              {!connected ? (
                <button type="button" className={styles.connectAction} onClick={openCantonConnect}>
                  <Trans>Connect wallet</Trans>
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.submit}
                disabled={!connected || pending || code.length < MIN_REDEEM_CODE_LENGTH}
              >
                <span>{pending ? <Trans>Redeeming…</Trans> : <Trans>Redeem code</Trans>}</span>
                <span aria-hidden="true">↗</span>
              </button>

              <div id="redeem-feedback" className={styles.feedback} aria-live="polite">
                <FeedbackMessage feedback={feedback} />
              </div>
            </form>

            <div className={styles.policyStrip}>
              <div>
                <span className={styles.policyValue}>7</span>
                <span className={styles.policyLabel}>
                  <Trans>Days</Trans>
                </span>
              </div>
              <div>
                <span className={styles.policyValue}>50/50</span>
                <span className={styles.policyLabel}>
                  <Trans>Cost split</Trans>
                </span>
              </div>
              <div>
                <span className={styles.policyValue}>USDCx</span>
                <span className={styles.policyLabel}>
                  <Trans>Display asset</Trans>
                </span>
              </div>
            </div>
          </section>
        </div>

        <p className={styles.fineprint}>
          <Trans>
            Trial funds can support margin but cannot be withdrawn. The backend remains authoritative for code
            eligibility, leverage, direction, attribution, and expiry.
          </Trans>
        </p>
      </main>
    </div>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  if (feedback.type === "minimum") {
    return (
      <p className={styles.error}>
        <Trans>Enter at least 4 characters.</Trans>
      </p>
    );
  }
  if (feedback.type === "connect") {
    return (
      <p className={styles.error}>
        <Trans>Connect your wallet before redeeming.</Trans>
      </p>
    );
  }
  if (feedback.type === "api") {
    return <p className={styles.error}>{feedback.message}</p>;
  }
  return (
    <p className={styles.error}>
      <Trans>Redemption failed. Please try again.</Trans>
    </p>
  );
}

function normalizeRedeemCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, MAX_REDEEM_CODE_LENGTH);
}

function createRedeemRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  const nonce =
    typeof randomUuid === "function"
      ? randomUuid.call(globalThis.crypto)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `bonus-redeem-${nonce}`;
}

function useLighterBody(): void {
  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);
}
