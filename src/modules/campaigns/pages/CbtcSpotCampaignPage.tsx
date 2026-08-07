import { useLingui } from "@lingui/react";
import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  CampaignApiError,
  getCbtcCampaign,
  getCbtcLeaderboard,
  getCbtcRewardTiers,
  getCbtcUserView,
  submitCbtcContent,
  type CbtcCampaignSummary,
  type CbtcLeaderboardPage,
  type CbtcRewardTiers,
  type CbtcUserView,
} from "@/modules/campaigns/api/campaign.api";
import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { getExchangeSessionToken } from "@/shared/lib/canton-wallet/session";
import ccIcon from "@/shared/lib/canton-wallet/token-icons/CC.webp";
import { ModalWithPortal } from "@/shared/ui";

import "@/modules/lighter/styles/global.scss";
import styles from "./CbtcSpotCampaignPage.module.scss";

type LocaleCopy = {
  en: string;
  zh: string;
};

const rewardTracks = [
  {
    number: "01",
    title: { en: "FIRST QUALIFYING TRADE", zh: "首筆有效交易" },
    pool: "$4,000",
    share: "20%",
    reward: "$1.90",
    rewardLabel: { en: "WORTH OF CC / USER", zh: "等值 CC / 每位用戶" },
    description: {
      en: "Complete a qualifying CBTC spot trade worth at least $10. Limited to the first 2,100 qualified users.",
      zh: "完成一筆不少於 10 美元的有效 CBTC 現貨交易。僅限前 2,100 名通過資格驗證的用戶。",
    },
    status: { en: "NOT STARTED", zh: "尚未開始" },
    action: { en: "START TRADING", zh: "開始交易" },
    href: "/spot/CBTC-CUSD",
  },
  {
    number: "02",
    title: { en: "VOLUME LEADERBOARD", zh: "交易量排行榜" },
    pool: "$12,000",
    share: "60%",
    reward: "TOP 50",
    rewardLabel: { en: "QUALIFIED TRADERS", zh: "名有效交易者" },
    description: {
      en: "Ranked by qualified CBTC spot volume. Trade on at least one UTC calendar day to qualify.",
      zh: "按有效 CBTC 現貨累計成交量排名。需在至少 1 個 UTC 自然日完成交易。",
    },
    status: { en: "0 / 1 ACTIVE DAY", zh: "0 / 1 個活躍日" },
    action: { en: "VIEW LEADERBOARD", zh: "查看排行榜" },
    href: "#leaderboard",
  },
  {
    number: "03",
    title: { en: "CBTC CONTENT MISSION", zh: "CBTC 原創內容任務" },
    pool: "$4,000",
    share: "20%",
    reward: "$1.14",
    rewardLabel: { en: "WORTH OF CC / POST", zh: "等值 CC / 每篇內容" },
    description: {
      en: "Publish one original public post about the Rocky × CBTC integration, trading experience, or Canton ecosystem.",
      zh: "發布一篇圍繞 Rocky × CBTC 整合、交易體驗或 Canton 生態的原創公開內容。",
    },
    status: { en: "NOT SUBMITTED", zh: "尚未提交" },
    action: { en: "SUBMIT CONTENT", zh: "提交內容" },
    href: "#content-mission",
  },
] satisfies Array<{
  number: string;
  title: LocaleCopy;
  pool: string;
  share: string;
  reward: string;
  rewardLabel: LocaleCopy;
  description: LocaleCopy;
  status: LocaleCopy;
  action: LocaleCopy;
  href: string;
}>;

const userStats = [
  { label: { en: "ELIGIBILITY", zh: "參與資格" }, value: { en: "PENDING", zh: "待確認" }, tone: "amber" },
  { label: { en: "QUALIFYING VOLUME", zh: "有效成交量" }, value: { en: "$0", zh: "$0" } },
  { label: { en: "ACTIVE TRADING DAYS", zh: "活躍交易日" }, value: { en: "0 / 5", zh: "0 / 5" } },
  { label: { en: "CURRENT RANK", zh: "目前排名" }, value: { en: "—", zh: "—" } },
  { label: { en: "FIRST TRADE", zh: "首筆交易" }, value: { en: "NOT STARTED", zh: "尚未開始" } },
  { label: { en: "CONTENT MISSION", zh: "內容任務" }, value: { en: "NOT SUBMITTED", zh: "尚未提交" } },
  { label: { en: "REWARD VALUE", zh: "獎勵價值" }, value: { en: "$0", zh: "$0" }, tone: "gradient" },
  {
    label: { en: "FINAL CC", zh: "最終 CC" },
    value: { en: "PENDING SETTLEMENT", zh: "等待結算" },
    tone: "blue",
  },
] satisfies Array<{ label: LocaleCopy; value: LocaleCopy; tone?: string }>;

const leaderboardTiers = [
  { rank: "TOP 1", winners: "1", value: "$1,000", note: { en: "worth of CC", zh: "等值 CC" } },
  { rank: "TOP 2–3", winners: "2", value: "$600", note: { en: "each", zh: "每人" } },
  { rank: "TOP 4–20", winners: "17", value: "$255", note: { en: "each", zh: "每人" } },
  { rank: "TOP 21–50", winners: "30", value: "≈ $182.17", note: { en: "each", zh: "每人" } },
] satisfies Array<{ rank: string; winners: string; value: string; note: LocaleCopy }>;

const leaderboardEntries = [
  {
    rank: 1,
    name: "SatoshiNova",
    wallet: "rockywallet-1...A7C4",
    volume: "$482,760.42",
    activeDays: "12 / 5",
    reward: "$1,000",
  },
  {
    rank: 2,
    name: "CantonPilot",
    wallet: "rockywallet-8...B91E",
    volume: "$365,118.90",
    activeDays: "9 / 5",
    reward: "$600",
  },
  {
    rank: 3,
    name: "OrangeNode",
    wallet: "rockywallet-3...7F20",
    volume: "$312,405.75",
    activeDays: "11 / 5",
    reward: "$600",
  },
  {
    rank: 4,
    name: "Trader #004",
    wallet: "rockywallet-6...D48A",
    volume: "$288,160.12",
    activeDays: "8 / 5",
    reward: "$255",
  },
  {
    rank: 5,
    name: "BTCRunner",
    wallet: "rockywallet-2...91D7",
    volume: "$250,804.66",
    activeDays: "7 / 5",
    reward: "$255",
  },
  {
    rank: 6,
    name: "CantonWhale",
    wallet: "rockywallet-4...5CE1",
    volume: "$219,483.30",
    activeDays: "10 / 5",
    reward: "$255",
  },
  {
    rank: 7,
    name: "Trader #007",
    wallet: "rockywallet-9...2BA6",
    volume: "$198,542.08",
    activeDays: "6 / 5",
    reward: "$255",
  },
  {
    rank: 8,
    name: "OrangeStack",
    wallet: "rockywallet-7...8F33",
    volume: "$176,905.44",
    activeDays: "8 / 5",
    reward: "$255",
  },
  {
    rank: 9,
    name: "Trader #009",
    wallet: "rockywallet-5...C204",
    volume: "$153,680.91",
    activeDays: "5 / 5",
    reward: "$255",
  },
  {
    rank: 10,
    name: "CantonSats",
    wallet: "rockywallet-0...62FE",
    volume: "$141,250.63",
    activeDays: "7 / 5",
    reward: "$255",
  },
] as const;

const cbtcLogo = "/campaign/cbtc-logo.svg";
const CAMPAIGN_START_DATE = "2026.08.12";
const CAMPAIGN_END_DATE = "2026.09.12";

function CbtcRotatingCoin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("CanvasRenderingContext2D" in window)) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const logicalSize = 214;
    const center = logicalSize / 2;
    const radius = 87;
    const halfDepth = 9;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const logo = new Image();
    let animationFrame = 0;
    let disposed = false;
    let animationStart: number | null = null;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = logicalSize * pixelRatio;
    canvas.height = logicalSize * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const drawEllipse = (centerX: number, radiusX: number, fill: CanvasGradient | string) => {
      context.beginPath();
      context.ellipse(centerX, center, Math.max(radiusX, 0.75), radius, 0, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
    };

    const drawFace = (centerX: number, scaleX: number, opacity: number) => {
      context.save();
      context.globalAlpha = opacity;
      context.translate(centerX, center);
      context.scale(Math.max(scaleX, 0.012), 1);

      const faceGradient = context.createLinearGradient(-radius, -radius, radius, radius);
      faceGradient.addColorStop(0, "#ffab83");
      faceGradient.addColorStop(0.38, "#f26633");
      faceGradient.addColorStop(1, "#a72a0d");

      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fillStyle = faceGradient;
      context.fill();

      context.save();
      context.clip();
      context.drawImage(logo, -radius + 8, -radius + 8, (radius - 8) * 2, (radius - 8) * 2);
      context.restore();

      context.beginPath();
      context.arc(0, 0, radius - 2, 0, Math.PI * 2);
      context.lineWidth = 4;
      context.strokeStyle = "#d74a22";
      context.stroke();

      context.beginPath();
      context.arc(0, 0, radius - 8, 0, Math.PI * 2);
      context.lineWidth = 2;
      context.strokeStyle = "rgba(255, 197, 169, 0.82)";
      context.stroke();
      context.restore();
    };

    const drawFrame = (timestamp: number) => {
      if (disposed) return;
      if (animationStart === null) animationStart = timestamp;

      const elapsed = reducedMotion ? 250 : (timestamp - animationStart) % 5000;
      const angle = (elapsed / 5000) * Math.PI * 2;
      const faceScale = Math.abs(Math.cos(angle));
      const radiusX = Math.max(radius * faceScale, 0.75);
      const depthOffset = Math.sin(angle) * halfDepth;
      const depthSpan = Math.abs(depthOffset);
      const faceCenterX = center + Math.sin(angle) * Math.cos(angle) * halfDepth;
      const faceOpacity = Math.min(1, faceScale * 10);

      context.clearRect(0, 0, logicalSize, logicalSize);

      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.48)";
      context.shadowBlur = 28;
      context.shadowOffsetY = 14;
      drawEllipse(center, radiusX + depthSpan, "rgba(92, 18, 2, 0.96)");
      context.restore();

      const sideGradient = context.createLinearGradient(center - radius, 0, center + radius, 0);
      sideGradient.addColorStop(0, "#571202");
      sideGradient.addColorStop(0.2, "#a82a0d");
      sideGradient.addColorStop(0.4, "#f17146");
      sideGradient.addColorStop(0.5, "#ffac86");
      sideGradient.addColorStop(0.72, "#bf3715");
      sideGradient.addColorStop(1, "#511001");

      const leftCenterX = center - depthSpan;
      const rightCenterX = center + depthSpan;
      const sideRadius = radius + 0.75;
      context.beginPath();
      context.moveTo(leftCenterX, center - sideRadius);
      context.lineTo(rightCenterX, center - sideRadius);
      context.ellipse(rightCenterX, center, radiusX + 0.35, sideRadius, 0, -Math.PI / 2, Math.PI / 2);
      context.lineTo(leftCenterX, center + sideRadius);
      context.ellipse(leftCenterX, center, radiusX + 0.35, sideRadius, 0, Math.PI / 2, (Math.PI * 3) / 2);
      context.closePath();
      context.fillStyle = sideGradient;
      context.fill();

      drawFace(faceCenterX, faceScale, faceOpacity);

      if (!reducedMotion) animationFrame = window.requestAnimationFrame(drawFrame);
    };

    logo.addEventListener("load", () => {
      if (!disposed) animationFrame = window.requestAnimationFrame(drawFrame);
    });
    logo.src = cbtcLogo;

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.coinCanvas} aria-hidden="true" />;
}

type CampaignData = {
  campaign: CbtcCampaignSummary | null;
  tiers: CbtcRewardTiers | null;
  board: CbtcLeaderboardPage | null;
  me: CbtcUserView | null;
  offline: boolean;
};

const EMPTY_DATA: CampaignData = {
  campaign: null,
  tiers: null,
  board: null,
  me: null,
  offline: false,
};

/**
 * Public sections load unauthenticated; `/v1/me/cbtc-spot` is only requested
 * when a wallet session exists. A backend that is down leaves `offline` set and
 * every panel falls back to its placeholder copy rather than blanking the page.
 */
function useCbtcCampaignData(): { data: CampaignData; reload: () => void } {
  const [data, setData] = useState<CampaignData>(EMPTY_DATA);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const hasSession = getExchangeSessionToken() !== "";
      const [campaign, tiers, board, me] = await Promise.all([
        getCbtcCampaign().catch(() => null),
        getCbtcRewardTiers().catch(() => null),
        getCbtcLeaderboard(1).catch(() => null),
        hasSession ? getCbtcUserView().catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setData({ campaign, tiers, board, me, offline: campaign === null });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { data, reload };
}

const literal = (value: string): LocaleCopy => ({ en: value, zh: value });

function formatUsd(value: string | undefined): string {
  if (value === undefined) return "$0";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";
  // Whole dollars read better in the hero and tier table; cents only appear
  // when they carry information (e.g. the $182.16 TOP 21-50 tier).
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function isValidPublicContentUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function CbtcContentSubmitModal({
  isVisible,
  isZh,
  rewardValue,
  onClose,
  onSubmitted,
}: {
  isVisible: boolean;
  isZh: boolean;
  rewardValue: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [contentUrl, setContentUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    setContentUrl("");
    setBusy(false);
    setErrorMessage(null);
    setSubmitted(false);
  }, [isVisible]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!isValidPublicContentUrl(contentUrl)) {
      setErrorMessage(
        isZh ? "請輸入有效的公開內容連結（http:// 或 https://）。" : "Enter a valid public http:// or https:// URL."
      );
      return;
    }

    if (getExchangeSessionToken() === "") {
      setErrorMessage(isZh ? "提交內容前，請先連接錢包。" : "Connect your wallet before submitting content.");
      return;
    }

    setBusy(true);
    try {
      await submitCbtcContent(contentUrl.trim());
      setSubmitted(true);
      onSubmitted();
    } catch (error) {
      if (error instanceof CampaignApiError) {
        if (error.status === 401) {
          setErrorMessage(isZh ? "錢包連接已失效，請重新連接後再提交。" : "Reconnect your wallet, then try again.");
        } else if (error.status === 409) {
          setErrorMessage(
            isZh ? "此內容已提交或正在審核中，請勿重複提交。" : "This content is already submitted or under review."
          );
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setErrorMessage(isZh ? "暫時無法提交，請稍後再試。" : "Unable to submit right now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalWithPortal
      className={styles.contentSubmitModal}
      contentClassName={styles.contentSubmitPanel}
      contentPadding={false}
      disableOverflowHandling
      isVisible={isVisible}
      setIsVisible={(visible) => {
        if (!visible && !busy) onClose();
      }}
      variant="default"
    >
      <button
        type="button"
        className={styles.contentSubmitClose}
        aria-label={isZh ? "關閉" : "Close"}
        disabled={busy}
        onClick={onClose}
      >
        <img src="/campaign/submit-close.svg" alt="" aria-hidden="true" />
      </button>

      {submitted ? (
        <div className={styles.contentSubmitSuccess}>
          <span className={styles.contentSubmitSuccessIcon} aria-hidden="true">
            ✓
          </span>
          <p>{isZh ? "提交成功" : "SUBMISSION RECEIVED"}</p>
          <h2>{isZh ? "內容正在審核中" : "YOUR CONTENT IS UNDER REVIEW"}</h2>
          <span>
            {isZh
              ? "審核通過後，獎勵狀態會自動更新。請在審核期間保持內容公開。"
              : "Your reward status will update after approval. Keep the content public while it is reviewed."}
          </span>
          <button type="button" className={styles.contentSubmitPrimary} onClick={onClose}>
            {isZh ? "完成" : "DONE"}
          </button>
        </div>
      ) : (
        <form className={styles.contentSubmitForm} onSubmit={handleSubmit}>
          <header className={styles.contentSubmitHeader}>
            <p>CBTC CONTENT MISSION</p>
            <h2>{isZh ? "提交 CBTC 原創內容" : "SUBMIT YOUR CBTC CONTENT"}</h2>
            <span>
              {isZh
                ? "貼上 X 推文、文章、影片或其他公開媒體內容的連結。"
                : "Paste the link to your X post, article, video, or other public media content."}
            </span>
          </header>

          <label className={styles.contentSubmitField} htmlFor="cbtc-content-url">
            <span>{isZh ? "內容連結" : "CONTENT URL"}</span>
            <input
              id="cbtc-content-url"
              type="url"
              value={contentUrl}
              disabled={busy}
              placeholder="https://x.com/username/status/..."
              aria-invalid={errorMessage ? "true" : undefined}
              aria-describedby={errorMessage ? "cbtc-content-submit-error" : undefined}
              autoComplete="url"
              onChange={(event) => {
                setContentUrl(event.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
            />
          </label>

          {errorMessage ? (
            <p id="cbtc-content-submit-error" className={styles.contentSubmitError} role="alert">
              {errorMessage}
            </p>
          ) : null}

          <section className={styles.contentSubmitRequirements}>
            <strong>{isZh ? "提交要求" : "REQUIREMENTS"}</strong>
            <ul>
              <li>{isZh ? "內容必須原創並保持公開" : "Original content that remains public"}</li>
              <li>
                {isZh
                  ? "圍繞 Rocky × CBTC 整合、交易體驗或 Canton 生態"
                  : "Related to Rocky × CBTC, the trading experience, or Canton"}
              </li>
              <li>{isZh ? "每位用戶最多獲得一次內容獎勵" : "One content reward per user"}</li>
            </ul>
          </section>

          <div className={styles.contentSubmitReward}>
            <span>{isZh ? "審核通過獎勵" : "REWARD AFTER APPROVAL"}</span>
            <strong>{rewardValue}</strong>
            <span>{isZh ? "等值 CC" : "WORTH OF CC"}</span>
          </div>

          <div className={styles.contentSubmitActions}>
            <button type="button" className={styles.contentSubmitCancel} disabled={busy} onClick={onClose}>
              {isZh ? "取消" : "CANCEL"}
            </button>
            <button
              type="submit"
              className={styles.contentSubmitPrimary}
              disabled={busy || !isValidPublicContentUrl(contentUrl)}
            >
              {busy ? (isZh ? "提交中..." : "SUBMITTING...") : isZh ? "提交連結" : "SUBMIT LINK"} <span>→</span>
            </button>
          </div>
        </form>
      )}
    </ModalWithPortal>
  );
}

export default function CbtcSpotCampaignPage() {
  const { i18n } = useLingui();
  const isZh = i18n.locale === "zh";
  const copy = (value: LocaleCopy) => (isZh ? value.zh : value.en);
  const { data, reload } = useCbtcCampaignData();
  const { campaign, tiers, board, me } = data;
  const [isContentSubmitOpen, setIsContentSubmitOpen] = useState(false);

  const handleSmoothScroll = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", href);
  }, []);

  const phaseLabel = useMemo(() => {
    switch (campaign?.phase) {
      case "active":
        return isZh ? "进行中" : "LIVE";
      case "review":
        return isZh ? "审核中" : "UNDER REVIEW";
      case "settled":
        return isZh ? "已结算" : "SETTLED";
      case "upcoming":
        return isZh ? "即將開始" : "COMING SOON";
      default:
        return isZh ? "即將開始" : "COMING SOON";
    }
  }, [campaign?.phase, isZh]);

  const liveDays = campaign
    ? Math.max(1, Math.round((Date.parse(campaign.endsAt) - Date.parse(campaign.startsAt)) / 86_400_000))
    : 30;

  const requiredDays = me?.requiredActiveDays ?? campaign?.requiredActiveDays ?? 1;

  const liveStats = useMemo(() => {
    const trackStatus = (kind: "first" | "volume" | "content"): LocaleCopy => {
      if (!me) return { en: "CONNECT WALLET", zh: "請連接錢包" };
      if (kind === "first") {
        if (me.firstTrade.status === "qualified") return { en: "QUALIFIED", zh: "已達成" };
        if (me.firstTrade.status === "over_capacity") return { en: "CAPACITY REACHED", zh: "名額已滿" };
        return { en: "NOT STARTED", zh: "尚未開始" };
      }
      if (kind === "volume") {
        return {
          en: `${me.activeDays} / ${requiredDays} ACTIVE DAYS`,
          zh: `${me.activeDays} / ${requiredDays} 個活躍日`,
        };
      }
      if (me.content.status === "approved") return { en: "APPROVED", zh: "已通過" };
      if (me.content.status === "pending") return { en: "UNDER REVIEW", zh: "審核中" };
      if (me.content.status === "rejected") return { en: "REJECTED", zh: "未通過" };
      return { en: "NOT SUBMITTED", zh: "尚未提交" };
    };
    return { trackStatus };
  }, [me, requiredDays]);

  const statCards = useMemo(() => {
    const eligibility: LocaleCopy = !me
      ? { en: "CONNECT WALLET", zh: "請連接錢包" }
      : me.eligibility === "qualified"
        ? { en: "QUALIFIED", zh: "符合資格" }
        : me.eligibility === "disqualified"
          ? { en: "DISQUALIFIED", zh: "已取消資格" }
          : { en: "PENDING", zh: "待確認" };
    return [
      { label: { en: "ELIGIBILITY", zh: "參與資格" }, value: eligibility, tone: "amber" },
      {
        label: { en: "QUALIFYING VOLUME", zh: "有效成交量" },
        value: literal(formatUsd(me?.qualifyingVolumeUsd ?? "0")),
      },
      {
        label: { en: "ACTIVE TRADING DAYS", zh: "活躍交易日" },
        value: literal(`${me?.activeDays ?? 0} / ${requiredDays}`),
      },
      {
        label: { en: "CURRENT RANK", zh: "目前排名" },
        value: literal(me?.rank === null || me?.rank === undefined ? "—" : `#${me.rank}`),
      },
      { label: { en: "FIRST TRADE", zh: "首筆交易" }, value: liveStats.trackStatus("first") },
      { label: { en: "CONTENT MISSION", zh: "內容任務" }, value: liveStats.trackStatus("content") },
      {
        label: { en: "REWARD VALUE", zh: "獎勵價值" },
        value: literal(formatUsd(me?.rewardValueUsd ?? "0")),
        tone: "gradient",
      },
      {
        label: { en: "FINAL CC", zh: "最終 CC" },
        value:
          me?.finalCc.status === "settled" && me.finalCc.amount !== null
            ? literal(me.finalCc.amount)
            : { en: "PENDING SETTLEMENT", zh: "等待結算" },
        tone: "blue",
      },
    ] satisfies Array<{ label: LocaleCopy; value: LocaleCopy; tone?: string }>;
  }, [me, requiredDays, liveStats]);

  const tierRows = useMemo(() => {
    if (!tiers) return leaderboardTiers;
    return tiers.leaderboard.map((tier) => ({
      rank: tier.from === tier.to ? `TOP ${tier.from}` : `TOP ${tier.from}–${tier.to}`,
      winners: String(tier.winners),
      value: formatUsd(tier.rewardUsd),
      note: tier.winners === 1 ? { en: "worth of CC", zh: "等值 CC" } : { en: "each", zh: "每人" },
    }));
  }, [tiers]);

  const boardRows = board?.entries ?? null;

  const displayRows = useMemo(
    () =>
      boardRows
        ? boardRows.map((entry) => ({
            rank: entry.rank,
            name: `Trader #${String(entry.rank).padStart(3, "0")}`,
            wallet: entry.wallet,
            volume: formatUsd(entry.qualifyingVolumeUsd),
            activeDays: `${entry.activeDays} / ${requiredDays}`,
            reward: formatUsd(entry.estimatedRewardUsd),
            qualified: entry.eligible,
          }))
        : leaderboardEntries.map((entry) => ({ ...entry, qualified: true })),
    [boardRows, requiredDays]
  );

  useEffect(() => {
    document.documentElement.classList.add("campaign-active");
    document.body.classList.add("lighter-active");
    return () => {
      document.documentElement.classList.remove("campaign-active");
      document.body.classList.remove("lighter-active");
    };
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <header className={styles.topnav}>
        <TopNav transparent />
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="cbtc-campaign-title">
          <div className={styles.heroBackdrop} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroShell}>
            <div className={styles.coBrand} aria-label="Rocky and BitSafe">
              <span className={styles.rockyBrand}>
                <img src="/logo.svg" alt="Rocky" />
              </span>
              <span className={styles.brandDivider}>×</span>
              <span className={styles.bitsafeBrand}>
                <img src="/campaign/bitsafe-logo-dark.svg" alt="BitSafe" />
              </span>
              <span className={styles.productMark}>
                <img src={cbtcLogo} alt="" aria-hidden="true" />
                <span>
                  <b>CBTC</b>
                  <small>BY BITSAFE</small>
                </span>
              </span>
            </div>

            <div className={styles.heroLayout}>
              <div className={styles.heroContent}>
                <div className={styles.liveStatus}>
                  <span /> {phaseLabel} · {liveDays} {isZh ? "天" : "DAYS"}
                </div>
                <p className={styles.heroKicker}>
                  {isZh ? "在 CANTON 釋放比特幣效用" : "UNLOCK BITCOIN UTILITY ON CANTON"}
                </p>
                <h1 id="cbtc-campaign-title">
                  <span>CBTC SPOT</span>
                  <span>CAMPAIGN</span>
                </h1>
                <div className={styles.heroReward}>
                  <span>{isZh ? "最高" : "UP TO"}</span>
                  <strong>{formatUsd(campaign?.pools.totalUsd ?? "20000")}</strong>
                  <span>{isZh ? "等值 CC 獎勵" : "IN CC REWARDS"}</span>
                </div>
                <p className={styles.heroDescription}>
                  {isZh
                    ? "交易 CBTC 現貨、參與有效交易量排行，或發布原創內容，贏取等值 CC 獎勵。"
                    : "Trade CBTC spot, compete by qualifying volume, or publish original content to earn CC rewards."}
                </p>
                <div className={styles.heroActions}>
                  <Link className={styles.primaryButton} to="/spot/CBTC-CUSD">
                    {isZh ? "交易 CBTC" : "TRADE CBTC"} <span>→</span>
                  </Link>
                  <a
                    className={styles.secondaryButton}
                    href="#tracks"
                    onClick={(event) => handleSmoothScroll(event, "#tracks")}
                  >
                    {isZh ? "查看獎勵" : "EXPLORE REWARDS"} <span>↓</span>
                  </a>
                </div>
                <p className={styles.heroFootnote}>
                  {isZh
                    ? "CBTC 是 Canton Network 上 1:1 比特幣支持的代幣，由 BitSafe 構建。"
                    : "CBTC is a 1:1 Bitcoin-backed token on the Canton Network, built by BitSafe."}
                </p>
              </div>

              <div className={styles.heroVisual} aria-hidden="true">
                <span className={styles.orbitOuter} />
                <span className={styles.orbitInner} />
                <span className={styles.orbitAxis} />
                <div className={styles.heroToken}>
                  <CbtcRotatingCoin />
                </div>
                <div className={`${styles.signalCard} ${styles.signalCardTop}`}>
                  <span>01</span>
                  <strong>1:1 BTC</strong>
                  <small>{isZh ? "比特幣支持" : "BITCOIN-BACKED"}</small>
                </div>
                <div className={`${styles.signalCard} ${styles.signalCardBottom}`}>
                  <span>02</span>
                  <strong>CANTON</strong>
                  <small>{isZh ? "隱私增強架構" : "PRIVACY-ENABLED"}</small>
                </div>
              </div>
            </div>

            <div className={styles.heroFooter}>
              <dl className={styles.heroMeta}>
                <div>
                  <dt>{isZh ? "活動週期" : "CAMPAIGN PERIOD"}</dt>
                  <dd>{`${CAMPAIGN_START_DATE} – ${CAMPAIGN_END_DATE} UTC`}</dd>
                </div>
                <div>
                  <dt>{isZh ? "現貨市場" : "SPOT MARKET"}</dt>
                  <dd>{campaign ? campaign.symbol.replace("-", " / ") : "CBTC / [QUOTE ASSET]"}</dd>
                </div>
                <div>
                  <dt>{isZh ? "獎勵結算" : "REWARD SETTLEMENT"}</dt>
                  <dd>{isZh ? "CC · 聯合審核後鎖定" : "CC · LOCKED AFTER REVIEW"}</dd>
                </div>
              </dl>
              <div className={styles.heroCountdown}>
                <span>{isZh ? "開始時間" : "START TIME"}</span>
                <strong>{CAMPAIGN_START_DATE}</strong>
              </div>
            </div>
          </div>
        </section>

        <nav className={styles.sectionNav} aria-label={isZh ? "活動內容" : "Campaign sections"}>
          <a href="#progress">{isZh ? "我的進度" : "MY PROGRESS"}</a>
          <a href="#tracks">{isZh ? "獎勵任務" : "REWARD TRACKS"}</a>
          <a href="#leaderboard">{isZh ? "排行榜" : "LEADERBOARD"}</a>
          <a href="#rules">{isZh ? "活動規則" : "RULES"}</a>
        </nav>

        <div className={styles.content}>
          <section className={styles.section} id="progress">
            <header className={styles.sectionHeading}>
              <p>MY CBTC CAMPAIGN REWARDS</p>
              <h2>{isZh ? "我的活動進度" : "CAMPAIGN OVERVIEW"}</h2>
              <span>
                {isZh
                  ? "連接錢包後查看你的有效成交量、參與資格與獎勵狀態。"
                  : "Connect your wallet to view qualifying volume, eligibility, and reward status."}
              </span>
            </header>

            <div className={styles.statsGrid}>
              {statCards.map((stat) => (
                <article className={styles.statCard} key={stat.label.en}>
                  <p>{copy(stat.label)}</p>
                  <strong className={stat.tone ? styles[stat.tone] : undefined}>{copy(stat.value)}</strong>
                </article>
              ))}
            </div>

            <aside className={styles.ledgerNotice}>
              <div className={styles.ledgerIcon}>
                <img src={ccIcon} alt="CC" />
              </div>
              <div>
                <p>{isZh ? "獨立 CC 獎勵帳戶" : "DEDICATED CC REWARD LEDGER"}</p>
                <strong>
                  {isZh ? "CBTC 活動獎勵不計入 R 鑽石總額" : "CBTC CAMPAIGN REWARDS DO NOT ENTER YOUR R DIAMONDS TOTAL"}
                </strong>
              </div>
              <span>
                {isZh
                  ? "活動期間展示美元等值獎勵；最終 CC 數量將在活動結束、雙方完成審核並確認價格來源後鎖定。"
                  : "USD reward value is shown during the campaign. Final CC amounts are locked after review and settlement pricing is confirmed."}
              </span>
            </aside>
          </section>

          <section className={styles.section} id="tracks">
            <header className={styles.sectionHeading}>
              <p>THREE WAYS TO EARN</p>
              <h2>{isZh ? "獎勵任務" : "REWARD TRACKS"}</h2>
              <span>
                {isZh
                  ? "三個板塊獨立計算，所有獎勵均以等值 CC 發放。"
                  : "Each track is calculated separately and paid in CC."}
              </span>
            </header>

            <div className={styles.trackGrid}>
              {rewardTracks.map((track) => (
                <article
                  className={styles.trackCard}
                  id={track.number === "03" ? "content-mission" : undefined}
                  key={track.number}
                >
                  <div className={styles.trackTopline}>
                    <span>{track.number}</span>
                    <p>
                      {isZh ? "最高獎池" : "POOL UP TO"} <strong>{track.pool}</strong> / {track.share}
                    </p>
                  </div>
                  <div className={styles.trackIcon} aria-hidden="true">
                    {track.number}
                  </div>
                  <h3>{copy(track.title)}</h3>
                  <p className={styles.trackDescription}>{copy(track.description)}</p>
                  <div className={styles.trackReward}>
                    <strong>{track.reward}</strong>
                    <span>{copy(track.rewardLabel)}</span>
                  </div>
                  <div className={styles.trackStatus}>
                    <span>{isZh ? "你的狀態" : "YOUR STATUS"}</span>
                    <strong>
                      {copy(
                        track.number === "01"
                          ? liveStats.trackStatus("first")
                          : track.number === "02"
                            ? liveStats.trackStatus("volume")
                            : liveStats.trackStatus("content")
                      )}
                    </strong>
                  </div>
                  {track.number === "03" ? (
                    <button type="button" className={styles.trackAction} onClick={() => setIsContentSubmitOpen(true)}>
                      {copy(track.action)} <span>→</span>
                    </button>
                  ) : track.href.startsWith("/") ? (
                    <Link className={styles.trackAction} to={track.href}>
                      {copy(track.action)} <span>→</span>
                    </Link>
                  ) : (
                    <a
                      className={styles.trackAction}
                      href={track.href}
                      onClick={(event) => handleSmoothScroll(event, track.href)}
                    >
                      {copy(track.action)} <span>→</span>
                    </a>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className={`${styles.section} ${styles.leaderboardSection}`} id="leaderboard">
            <header className={styles.sectionHeading}>
              <p>$12,000 VOLUME POOL</p>
              <h2>{isZh ? "CBTC 交易量排行榜" : "CBTC VOLUME LEADERBOARD"}</h2>
              <span>
                {isZh
                  ? "按有效 CBTC 現貨累計成交量排名。需完成至少 1 個 UTC 活躍交易日。"
                  : "Ranked by qualified CBTC spot volume. At least one active UTC trading day is required."}
              </span>
            </header>

            <div className={styles.yourRank}>
              <div>
                <span>{isZh ? "你的排名" : "YOUR RANK"}</span>
                <strong>{me?.rank ? `#${me.rank}` : "—"}</strong>
              </div>
              <div>
                <span>{isZh ? "有效成交量" : "QUALIFYING VOLUME"}</span>
                <strong>{formatUsd(me?.qualifyingVolumeUsd ?? "0")}</strong>
              </div>
              <div>
                <span>{isZh ? "活躍日" : "ACTIVE DAYS"}</span>
                <strong>
                  {me?.activeDays ?? 0} / {requiredDays}
                </strong>
              </div>
              <p>
                {!me
                  ? isZh
                    ? "連接錢包後查看你的排名與資格。"
                    : "Connect your wallet to see your rank and eligibility."
                  : me.activeDays >= requiredDays
                    ? isZh
                      ? "已滿足排行資格。"
                      : "You meet the leaderboard requirement."
                    : isZh
                      ? `再完成 ${requiredDays - me.activeDays} 個活躍交易日即可滿足排行資格。`
                      : `Complete ${requiredDays - me.activeDays} more active trading days to become eligible.`}
              </p>
            </div>

            <div className={styles.rankingPanel}>
              <div className={styles.rankingMeta}>
                <div>
                  <span>{isZh ? "目前排名" : "CURRENT STANDINGS"}</span>
                  <strong>{isZh ? "有效成交量前 50 名" : "TOP 50 BY QUALIFYING VOLUME"}</strong>
                </div>
                {boardRows ? (
                  <span className={styles.previewBadge}>
                    {isZh ? `${board?.total ?? 0} 位合格交易者` : `${board?.total ?? 0} QUALIFIED`}
                  </span>
                ) : (
                  <span className={styles.previewBadge}>{isZh ? "演示資料" : "PREVIEW DATA"}</span>
                )}
              </div>

              <div className={styles.rankingScroller}>
                <div
                  className={styles.rankingTable}
                  role="table"
                  aria-label={isZh ? "CBTC 交易量排名" : "CBTC volume rankings"}
                >
                  <div className={styles.rankingHeader} role="row">
                    <span role="columnheader">{isZh ? "排名" : "RANK"}</span>
                    <span role="columnheader">{isZh ? "用戶" : "USER"}</span>
                    <span role="columnheader">{isZh ? "有效成交量" : "QUALIFYING VOLUME"}</span>
                    <span role="columnheader">{isZh ? "活躍交易日" : "ACTIVE DAYS"}</span>
                    <span role="columnheader">{isZh ? "預估獎勵" : "EST. REWARD"}</span>
                    <span role="columnheader">{isZh ? "資格" : "STATUS"}</span>
                  </div>

                  <div className={styles.rankingBody}>
                    {displayRows.map((entry) => (
                      <div
                        className={`${styles.rankingRow} ${entry.rank <= 3 ? styles.podiumRankingRow : ""}`}
                        role="row"
                        key={entry.rank}
                      >
                        <div className={styles.rankingRank} role="cell">
                          {entry.rank <= 3 ? (
                            <span
                              className={`${styles.rankingCrown} ${styles[`rankingCrown${entry.rank}`]}`}
                              aria-label={isZh ? `第 ${entry.rank} 名` : `Rank ${entry.rank}`}
                            />
                          ) : (
                            <strong>{String(entry.rank).padStart(2, "0")}</strong>
                          )}
                        </div>
                        <div className={styles.rankingUser} role="cell">
                          <span className={styles.rankingAvatar}>{entry.name.slice(0, 1)}</span>
                          <span>
                            <strong>{entry.name}</strong>
                            <small>{entry.wallet}</small>
                          </span>
                        </div>
                        <strong className={styles.rankingVolume} role="cell">
                          {entry.volume}
                        </strong>
                        <span className={styles.rankingDays} role="cell">
                          {entry.activeDays}
                        </span>
                        <span className={styles.rankingReward} role="cell">
                          <img src={ccIcon} alt="" aria-hidden="true" />
                          <strong>{entry.reward}</strong>
                          <small>{isZh ? "等值 CC" : "IN CC"}</small>
                        </span>
                        <span className={styles.qualifiedStatus} role="cell">
                          <i aria-hidden="true" />{" "}
                          {entry.qualified ? (isZh ? "符合資格" : "QUALIFIED") : isZh ? "待確認" : "PENDING"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.rewardTable} role="table" aria-label={isZh ? "排行榜獎勵" : "Leaderboard rewards"}>
              <div className={styles.tableHeader} role="row">
                <span role="columnheader">{isZh ? "排名" : "RANK"}</span>
                <span role="columnheader">{isZh ? "獲獎人數" : "WINNERS"}</span>
                <span role="columnheader">{isZh ? "每人獎勵價值" : "REWARD VALUE"}</span>
                <span role="columnheader">{isZh ? "發放資產" : "PAID IN"}</span>
              </div>
              {tierRows.map((tier) => (
                <div className={styles.tableRow} role="row" key={tier.rank}>
                  <strong role="cell">{tier.rank}</strong>
                  <span role="cell">{tier.winners}</span>
                  <span role="cell">
                    <b>{tier.value}</b> {copy(tier.note)}
                  </span>
                  <span className={styles.ccCell} role="cell">
                    <img src={ccIcon} alt="" /> CC
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.tableFootnote}>
              *{" "}
              {isZh
                ? "頁面僅計入通過有效交易標準的成交量，而非帳戶顯示的全部成交量。"
                : "Only volume that passes the qualifying trade criteria is counted."}
            </p>
          </section>

          <section className={styles.section} id="rules">
            <header className={styles.sectionHeading}>
              <p>CAMPAIGN TERMS</p>
              <h2>{isZh ? "活動規則與結算" : "RULES & SETTLEMENT"}</h2>
            </header>

            <div className={styles.rulesGrid}>
              <article>
                <span>01</span>
                <h3>{isZh ? "活動市場" : "QUALIFYING MARKET"}</h3>
                <p>
                  {isZh
                    ? "交易必須在活動期內於指定 CBTC 現貨市場完成，單筆成交金額不低於 10 美元，並可透過 Rocky Party ID 與指定路徑追蹤。"
                    : "Trades must be completed in the designated CBTC spot market during the campaign, be worth at least $10, and be traceable through the approved Party ID and path."}
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>{isZh ? "有效交易" : "QUALIFIED ACTIVITY"}</h3>
                <p>
                  {isZh
                    ? "失敗、撤銷、重複、自成交、刷量及關聯帳戶操縱行為不計入活動，並可能導致取消資格。"
                    : "Failed, cancelled, duplicate, self, wash, or related-account manipulation is excluded and may result in disqualification."}
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>{isZh ? "聯合審核" : "JOINT REVIEW"}</h3>
                <p>
                  {isZh
                    ? "活動結束後由 Rocky 與 BitSafe 共同審核最終名單。活動期間顯示的獎勵為美元等值，不代表最終 CC 數量。"
                    : "Rocky and BitSafe jointly review the final list after the campaign. Values shown during the campaign do not represent final CC amounts."}
                </p>
              </article>
              <article>
                <span>04</span>
                <h3>{isZh ? "獎勵結算" : "CC SETTLEMENT"}</h3>
                <p>
                  {isZh
                    ? "最終 CC 數量按雙方確認的價格來源及結算時間點換算。BitSafe 提供審核後的 CC 獎池，Rocky 負責向用戶發放。"
                    : "Final CC amounts use the jointly confirmed price source and settlement time. BitSafe provides the approved pool and Rocky distributes rewards."}
                </p>
              </article>
            </div>

            <aside className={styles.prelaunch}>
              <strong>{isZh ? "上線前待確認" : "PRE-LAUNCH CONFIRMATION"}</strong>
              <span>{isZh ? "UTC 起止時間" : "UTC START / END"}</span>
              <span>{isZh ? "最終交易對" : "FINAL TRADING PAIR"}</span>
              <span>PARTY ID &amp; PATH</span>
              <span>{isZh ? "CC 定價來源" : "CC PRICE SOURCE"}</span>
            </aside>
          </section>
        </div>
      </main>
      <CbtcContentSubmitModal
        isVisible={isContentSubmitOpen}
        isZh={isZh}
        rewardValue={formatUsd(me?.content.rewardUsd ?? tiers?.content.rewardUsd ?? "1.14")}
        onClose={() => setIsContentSubmitOpen(false)}
        onSubmitted={reload}
      />
    </div>
  );
}
