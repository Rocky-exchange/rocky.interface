import { useLingui } from "@lingui/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";

import {
  claimMission as claimCampaignMission,
  getCampaign,
  getLeaderboard,
  getMissions,
  getRewards,
  startMission,
  startWalletBoundXOAuth,
  submitMission as submitCampaignMission,
  verifyMission,
  type LeaderboardEntry as ActivityLeaderboardEntry,
  type MissionKey,
  type MissionList,
  type MissionState,
  type RewardSummary,
} from "@/modules/campaigns/api/campaign.api";
import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useCantonWallet } from "@/shared/lib/canton-wallet/useCantonWallet";
import { helperToast } from "@/shared/lib/helperToast";
import { ModalWithPortal, TooltipWithPortal } from "@/shared/ui";

import "@/modules/lighter/styles/global.scss";
import styles from "./SeasonZeroLeaderboardPage.module.scss";

type CampaignTab = "missions" | "leaderboard" | "rewards";
type TaskStatus = "not_started" | "verifying" | "pending" | "claimable" | "claiming" | "claimed" | "retry";
type OriginalPostStatus = "idle" | "pending" | "claimable" | "claimed" | "rejected";
type OriginalPostDialog = "submit" | "claimed" | "rejected" | null;
type OriginalPostProgress = {
  activityDay: number;
  approvedToday: number;
  pendingToday: number;
  limit: number;
};

type DisplayLeaderboardEntry = {
  rank: number;
  name: string;
  address: string;
  volume: string;
  reward: string;
  avatar?: string;
};

type Mission = {
  description: string;
  id: string;
  icon?: string;
  iconText?: string;
  reward: string;
  title: string;
};

type TaskStatusPresentation = {
  disabled: boolean;
  icon: string;
  iconFirst?: boolean;
  label: string;
};

const CAMPAIGN_ZH_TW: Record<string, string> = {
  Start: "開始",
  Verify: "驗證",
  Pending: "審核中",
  Claim: "領取",
  "Claiming...": "領取中...",
  "Checking...": "驗證中...",
  Claimed: "已領取",
  Retry: "重試",
  "Retry shortly": "稍後重試",
  Rejected: "未通過",
  "Rocky First Ascent": "ROCKY 初次登頂",
  "Rewards Panel": "獎勵面板",
  "Rocky Trading Challenge": "ROCKY 交易挑戰賽",
  "Earn free R Diamonds · Unlock CC rewards": "免費賺取 R 鑽石 · 解鎖 CC 獎勵",
  "Track your R Diamonds, future rewards, and exclusive benefits. More rewards coming soon.":
    "追蹤你的 R 鑽石、未來獎勵與專屬權益。更多獎勵即將推出。",
  "Top 50 Traders. Highest Volume. R Diamonds Rewards.": "交易量最高的前 50 名交易者可獲得 R 鑽石獎勵。",
  "Start Trading": "開始交易",
  "View Leaderboard": "查看排行榜",
  "Ends in": "距離結束",
  Missions: "任務",
  Leaderboard: "排行榜",
  "My Rewards": "我的獎勵",
  "Campaign sections": "活動分頁",
  "Claim Reward": "領取獎勵",
  "R Diamonds": "R 鑽石",
  "Claim Now": "立即領取",
  "must be claimed manually.": "必須手動領取。",
  "Completed missions do not auto-credit rewards.": "完成任務後，獎勵不會自動入帳。",
  Close: "關閉",
  Mission: "任務",
  "How to complete": "完成方式",
  "Open your X profile": "開啟你的 X 個人檔案",
  "Add 🪨ROCKY to your name": "在名稱中加入 🪨ROCKY",
  "Return and verify": "返回並進行驗證",
  "Open the quote composer": "開啟引用貼文編輯器",
  "Publish your quote post": "發佈你的引用貼文",
  "Paste the published post URL below": "在下方貼上已發佈貼文的連結",
  "Your X URL": "你的 X 連結",
  Cancel: "取消",
  "Open X": "開啟 X",
  "Submit Your Post": "提交你的貼文",
  "Submit your original post on X to earn R Diamonds.": "提交你在 X 發佈的原創貼文以賺取 R 鑽石。",
  "Submission progress": "提交進度",
  "Paste Link": "貼上連結",
  Confirm: "確認",
  "X Post Link": "X 貼文連結",
  "Paste the link to your original post on X (Twitter).": "貼上你在 X（Twitter）發佈的原創貼文連結。",
  "Please enter a valid public X post link.": "請輸入有效且公開的 X 貼文連結。",
  Requirements: "要求",
  "Original content only": "僅限原創內容",
  "Must be related to Rocky or Canton": "內容必須與 Rocky 或 Canton 相關",
  "Public post visible to everyone": "貼文必須公開且所有人可見",
  "No edited or deleted posts": "不得編輯或刪除貼文",
  "Max 2 posts per day": "每日最多 2 篇貼文",
  "Rewards are distributed after review": "審核通過後發放獎勵",
  Submit: "提交",
  "Submitting...": "提交中...",
  "X verification is temporarily unavailable. Please try again shortly.":
    "X 驗證服務暫時無法使用，請稍後再試。",
  "Too many attempts. Please wait before trying again.": "嘗試次數過多，請稍候再試。",
  "This X post link is invalid. Check the URL and try again.": "X 貼文連結無效，請檢查後再試。",
  "This post belongs to another X account.": "此貼文不屬於目前連接的 X 帳號。",
  "This post does not quote the Rocky launch post.": "此貼文未引用 Rocky 上線貼文。",
  "This post could not be found or is not public.": "找不到此貼文，或貼文並非公開。",
  "X authorization expired. Reconnect X and try again.": "X 授權已失效，請重新連接 X 後再試。",
  "The requirement was not detected yet. Check it and retry shortly.":
    "尚未偵測到任務要求，請確認完成後稍候再試。",
  "Submission received. Verification is pending.": "已收到提交，正在等待驗證。",
  "Mission verified. Reward is ready to claim.": "任務驗證成功，獎勵已可領取。",
  "The request failed. Please try again shortly.": "請求失敗，請稍後再試。",
  "Post Not Approved": "貼文未通過審核",
  "Your post did not meet our requirements.": "你的貼文未符合活動要求。",
  "Please check the reason below and try again.": "請查看下方原因後重試。",
  Reason: "原因",
  "Content is not related to Rocky or Canton.": "內容與 Rocky 或 Canton 無關。",
  "Try Again": "重新提交",
  "Reward Claimed!": "獎勵已領取！",
  "Your R Diamonds have been claimed successfully.": "你的 R 鑽石已成功領取。",
  "The reward has been added to your account.": "獎勵已加入你的帳戶。",
  "Claim Complete": "領取完成",
  "Your qualified post reward is now complete.": "符合資格的貼文獎勵已領取完成。",
  Done: "完成",
  "Submit Post": "提交貼文",
  "Original Posts": "原創貼文",
  "Up to 2 / day • cumulative": "每日最多 2 篇 • 可累積",
  "Earn cumulative R Diamonds from qualified original posts each day.": "每日透過符合資格的原創貼文累積 R 鑽石。",
  Post: "貼文",
  "Daily progress resets at 00:00 UTC.": "每日進度於 UTC 00:00 重置。",
  "Qualified Today": "今日已通過",
  "R Diamonds Earned": "已獲得 R 鑽石",
  "Daily Complete": "今日已完成",
  "Next Reward": "下一筆獎勵",
  "Rewards Claimed": "獎勵已領取",
  "Complete missions to earn R Diamonds": "完成任務以賺取 R 鑽石",
  "X Connected": "X 已連接",
  "Connect X": "連接 X",
  "Connect Wallet First": "請先連接錢包",
  "Connecting...": "連接中...",
  "Loading...": "載入中...",
  "This wallet is already connected to another X account. Please authorize the previously connected X account.":
    "此錢包已綁定另一個 X 帳號，請使用原先綁定的 X 帳號授權。",
  "Your Progress": "你的進度",
  Claimable: "可領取",
  "Follow Rocky + Canton On X": "在 X 關注 Rocky + Canton",
  "Follow both official accounts on X.": "在 X 關注兩個官方帳號。",
  "Like Launch Post": "按讚上線貼文",
  "Like the official Rocky launch post.": "按讚 Rocky 官方上線貼文。",
  "Join Community": "加入社群",
  "Join Rocky's official Discord community.": "加入 Rocky 官方 Discord 社群。",
  "Add 🪨ROCKY To Your X Name": "在你的 X 名稱加入 🪨ROCKY",
  "Add 🪨ROCKY as a suffix to your X display name.": "在你的 X 顯示名稱後加入 🪨ROCKY。",
  "Quote Launch Post": "引用上線貼文",
  "Quote the campaign post and share an original point of view.": "引用活動貼文並分享原創觀點。",
  "Complete Your First Perpetual Trade": "完成首筆合約交易",
  "Deposit funds from your wallet, open a perpetual position according to your trading plan, and close it when appropriate to complete the mission.":
    "將資金從錢包充值至交易所，依照你的交易計畫開立合約倉位，並在合適時機平倉，即可完成此任務。",
  "Important Note": "重要提示",
  "Complete each mission using the connected wallet.": "請使用已連接的錢包完成每項任務。",
  "Social content must relate to Rocky, Canton, or the Beta campaign.": "社群內容必須與 Rocky、Canton 或本活動相關。",
  "R Diamonds are relative contribution records and must be claimed manually.": "R 鑽石是相對貢獻紀錄，必須手動領取。",
  "Fraudulent, copied, or automated submissions may be rejected.": "欺詐、抄襲或自動化提交可能會被拒絕。",
  Ranking: "排行榜",
  "Qualified accounts ranked by trading volume": "符合資格的帳戶依交易量排名",
  Rank: "排名",
  User: "用戶",
  "Volume (USD)": "交易量（USD）",
  "Est. R Diamonds Reward": "預估 R 鑽石獎勵",
  "Season 0 leaderboard": "Season 0 排行榜",
  "No qualified traders yet.": "目前尚無符合資格的交易者。",
  "Leaderboard pages": "排行榜分頁",
  "Previous page": "上一頁",
  "Next page": "下一頁",
  Page: "第",
  "Top 50 Rewards": "前 50 名獎勵",
  "Top 1": "第 1 名",
  "Top 2 – 3": "第 2–3 名",
  "Top 4 – 10": "第 4–10 名",
  "Top 11 – 20": "第 11–20 名",
  "Top 21 – 50": "第 21–50 名",
  "Ranking Rules": "排名規則",
  "This is a real-funds trading competition. Only eligible accounts enter the leaderboard, ranked by total qualified trading volume in descending order.":
    "本活動為真實資金交易競賽。僅符合資格的帳戶可進入排行榜，並按有效總交易量由高至低排名。",
  "Eligibility requires time-weighted average equity of at least $200, at least $2,000 in qualified notional trading volume, 10 effective trades, and activity on 2 or more trading days.":
    "參賽資格要求時間加權平均權益不少於 200 美元、有效名義交易量不少於 2,000 美元、至少 10 筆有效交易，且交易日不少於 2 天。",
  "Wash trading, related-account self-dealing, and other abnormal activity are excluded and may result in disqualification.":
    "對敲交易、關聯帳戶自成交及其他異常行為將不計入，並可能導致取消資格。",
  "The leaderboard closes at 24:00 UTC+8 on Day 14. Only qualifying trades completed before the deadline count toward the final volume ranking.":
    "排行榜於第 14 天 UTC+8 24:00 截止。僅截止前完成的合格交易會計入最終交易量排名。",
  "The Top 50 share 56,500,000 R Diamonds by the tiers above. Traders with at least 10 effective trades across 2 trading days who finish outside the Top 50 receive 500 R Diamonds.":
    "前 50 名依上述級距共享 56,500,000 枚 R 鑽石。未進入前 50 名、但在至少 2 個交易日完成 10 筆有效交易的交易者，可獲得 500 枚 R 鑽石。",
  "Coming Soon": "即將推出",
  "Track your rewards, status, and exclusive benefits.": "追蹤你的獎勵、狀態與專屬權益。",
  "（Reward Breakdown）": "（獎勵明細）",
  "R Diamonds（Reward Breakdown）": "R 鑽石（獎勵明細）",
  "Total Rewards": "總獎勵",
  "About total rewards": "關於總獎勵",
  "Earned from missions and campaign participation.": "來自任務與活動參與。",
  "Task Rewards": "任務獎勵",
  "About task rewards": "關於任務獎勵",
  "Earned from missions.": "來自任務。",
  "Campaign Rewards": "活動獎勵",
  "About campaign rewards": "關於活動獎勵",
  CLAIMED: "已領取",
  "Referral Rewards": "推薦獎勵",
  "About referral rewards": "關於推薦獎勵",
  "Earned from successful referrals.": "來自成功推薦。",
  "R Points (Future)": "R Points（未來）",
  "Total R Points": "R Points 總數",
  "Your Referrals": "你的推薦",
  "Total Earned --": "累計獲得 --",
  "Total Referred Users": "推薦用戶總數",
  "Reward Rate": "獎勵比例",
  "Your Referral Link": "你的推薦連結",
  "Copy referral link": "複製推薦連結",
  "Code:": "代碼：",
  "Copy referral code": "複製推薦代碼",
  Copied: "已複製",
  "Copy Link": "複製連結",
  "How It Works": "運作方式",
  "Share Your Link": "分享你的連結",
  "Copy and share your unique referral link.": "複製並分享你的專屬推薦連結。",
  "Friends Join": "好友加入",
  "They sign up and start earning using your link.": "他們透過你的連結註冊並開始獲得獎勵。",
  "Earn Rewards": "獲得獎勵",
  "Get 10% R Diamonds": "獲得 10% R 鑽石",
  Badges: "徽章",
  "Rocky OG badge": "Rocky OG 徽章",
  "OG Badges · Rare": "OG 徽章 · 稀有",
  Eligible: "符合資格",
  "Eligible OG users will receive the badge after the activity review.": "符合資格的 OG 用戶將在活動審核後獲得徽章。",
  "Limited 102/500": "限量 102/500",
  "Learn More →": "了解更多 →",
  "CC Rewards": "CC 獎勵",
  "Specific ratios, schedules, and conditions are subject to the final announcement.":
    "具體比例、時程與條件以最終公告為準。",
  "Redemption ratio": "兌換比例",
  "Unlock schedule": "解鎖時程",
  Eligibility: "資格條件",
};

function useCampaignCopy() {
  const { i18n } = useLingui();
  const isTraditionalChinese = i18n.locale === "zh";
  const copy = (text: string) => (isTraditionalChinese ? CAMPAIGN_ZH_TW[text] ?? text : text);

  return { copy, isTraditionalChinese };
}

const TASK_STATUS_PRESENTATION: Record<TaskStatus, TaskStatusPresentation> = {
  not_started: {
    label: "Start",
    icon: "/campaign/status-start.svg",
    disabled: false,
  },
  verifying: {
    label: "Verify",
    icon: "/campaign/status-verify.svg",
    disabled: false,
  },
  pending: {
    label: "Pending",
    icon: "/campaign/status-pending.svg",
    disabled: true,
  },
  claimable: {
    label: "Claim",
    icon: "/campaign/status-claim.svg",
    disabled: false,
  },
  claiming: {
    label: "Claiming...",
    icon: "/campaign/status-loading.svg",
    iconFirst: true,
    disabled: true,
  },
  claimed: {
    label: "Claimed",
    icon: "/campaign/status-claimed.svg",
    disabled: true,
  },
  retry: {
    label: "Retry",
    icon: "/campaign/status-retry.svg",
    disabled: false,
  },
};

const TASK_STATUSES = Object.keys(TASK_STATUS_PRESENTATION) as TaskStatus[];

const LEADERBOARD_PAGE_SIZE = 10;

const REWARD_TIERS = [
  { label: "Top 1", reward: "5,000,000", showDiamond: true, tone: "gold" },
  { label: "Top 2 – 3", reward: "3,000,000", showDiamond: true, tone: "silver" },
  { label: "Top 4 – 10", reward: "1,600,000", showDiamond: true, tone: "bronze" },
  { label: "Top 11 – 20", reward: "1,050,000", showDiamond: true, tone: "muted" },
  { label: "Top 21 – 50", reward: "910,000", showDiamond: true, tone: "muted" },
] as const;

const MISSIONS: Mission[] = [
  {
    id: "follow-both",
    title: "Follow Rocky + Canton On X",
    description: "Follow both official accounts on X.",
    reward: "+100",
    icon: "/campaign/mission-x.jpg",
  },
  {
    id: "like-launch",
    title: "Like Launch Post",
    description: "Like the official Rocky launch post.",
    reward: "+50",
    iconText: "♥",
  },
  {
    id: "join-discord",
    title: "Join Community",
    description: "Join Rocky's official Discord community.",
    reward: "+100",
    icon: "/campaign/mission-discord.jpg",
  },
  {
    id: "nickname-rocky",
    title: "Add 🪨ROCKY To Your X Name",
    description: "Add 🪨ROCKY as a suffix to your X display name.",
    reward: "+50",
    iconText: "$",
  },
  {
    id: "quote-launch",
    title: "Quote Launch Post",
    description: "Quote the campaign post and share an original point of view.",
    reward: "+150",
    iconText: "•••",
  },
  {
    id: "first-trade",
    title: "Complete Your First Perpetual Trade",
    description:
      "Deposit funds from your wallet, open a perpetual position according to your trading plan, and close it when appropriate to complete the mission.",
    reward: "+100",
    iconText: "💰",
  },
];

const MISSION_KEY_BY_ID: Record<string, MissionKey> = {
  "follow-both": "FOLLOW_BOTH",
  "like-launch": "LIKE_LAUNCH",
  "join-discord": "JOIN_DISCORD",
  "nickname-rocky": "NICKNAME_ROCKY",
  "quote-launch": "QUOTE_LAUNCH",
  "first-trade": "FIRST_TRADE",
};

const MISSION_ID_BY_KEY: Partial<Record<MissionKey, string>> = Object.fromEntries(
  Object.entries(MISSION_KEY_BY_ID).map(([id, key]) => [key, id])
);

const ORIGINAL_POST_REWARDS = [
  { id: "01", reward: 200 },
  { id: "02", reward: 200 },
] as const;

const ORIGINAL_POST_REQUIREMENTS = [
  "Original content only",
  "Must be related to Rocky or Canton",
  "Public post visible to everyone",
  "No edited or deleted posts",
  "Max 2 posts per day",
  "Rewards are distributed after review",
] as const;

function getCampaignTab(search: string): CampaignTab {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "leaderboard" || tab === "rewards") return tab;
  return "missions";
}

function DiamondAmount({ children }: { children: string }) {
  return (
    <span className={styles.diamondAmount}>
      <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const { copy, isTraditionalChinese } = useCampaignCopy();

  if (rank <= 3) {
    return (
      <span
        className={`${styles.crown} ${styles[`crown${rank}`]}`}
        aria-label={isTraditionalChinese ? `${copy("Rank")} ${rank}` : `Rank ${rank}`}
      />
    );
  }

  return <span className={styles.rankNumber}>{rank}</span>;
}

function CampaignCountdown({ endsAt }: { endsAt: string | null }) {
  const { copy, isTraditionalChinese } = useCampaignCopy();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const deadline = endsAt === null ? Number.NaN : Date.parse(endsAt);
  const remaining = Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <div
      className={styles.countdown}
      aria-label={
        isTraditionalChinese
          ? `活動倒數：${days} 天 ${hours} 小時 ${minutes} 分鐘 ${seconds} 秒`
          : `Event countdown: ${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`
      }
    >
      <span className={styles.countdownLabel}>{copy("Ends in")}</span>
      <span className={styles.countdownValue}>{pad(days)}</span>
      <span>{isTraditionalChinese ? "天" : "D"}</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>{pad(hours)}</span>
      <span>{isTraditionalChinese ? "時" : "H"}</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>{pad(minutes)}</span>
      <span>{isTraditionalChinese ? "分" : "M"}</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>{pad(seconds)}</span>
      <span>{isTraditionalChinese ? "秒" : "S"}</span>
    </div>
  );
}

function CampaignHero({
  activeTab,
  campaignEndsAt,
  onTabChange,
}: {
  activeTab: CampaignTab;
  campaignEndsAt: string | null;
  onTabChange: (tab: CampaignTab) => void;
}) {
  const history = useHistory();
  const { copy } = useCampaignCopy();
  const isMissions = activeTab === "missions";
  const isLeaderboard = activeTab === "leaderboard";
  const isRewards = activeTab === "rewards";

  return (
    <section
      className={`${styles.hero} ${isMissions ? styles.missionsHero : ""} ${isLeaderboard ? styles.leaderboardHero : ""} ${isRewards ? styles.rewardsHero : ""}`}
    >
      {isMissions ? (
        <video
          className={`${styles.heroImage} ${styles.missionsVideo}`}
          src="/campaign/missions-hero.mp4"
          poster="/campaign/missions-hero.png"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
      ) : (
        <img
          className={`${styles.heroImage} ${isRewards ? styles.rewardsImage : styles.leaderboardImage}`}
          src={isRewards ? "/campaign/rewards-hero.png" : "/campaign/hero-background.png"}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className={styles.heroShade} />
      <div className={styles.heroContent}>
        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            <h1>{copy(isMissions ? "Rocky First Ascent" : isRewards ? "Rewards Panel" : "Rocky Trading Challenge")}</h1>
            <p>
              {copy(
                isMissions
                  ? "Earn free R Diamonds · Unlock CC rewards"
                  : isRewards
                    ? "Track your R Diamonds, future rewards, and exclusive benefits. More rewards coming soon."
                    : "Top 50 Traders. Highest Volume. R Diamonds Rewards."
              )}
            </p>
          </div>

          {!isRewards ? (
            <div className={styles.heroActions}>
              <button type="button" className={styles.primaryButton} onClick={() => history.push("/trade")}>
                <span>{copy("Start Trading")}</span>
                <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
              </button>
              {isMissions ? (
                <button type="button" className={styles.secondaryButton} onClick={() => onTabChange("leaderboard")}>
                  <span>{copy("View Leaderboard")}</span>
                  <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.heroFooter}>
          <CampaignCountdown endsAt={campaignEndsAt} />
          <div className={styles.heroDots} aria-hidden="true">
            {(["missions", "leaderboard", "rewards"] as CampaignTab[]).map((tab) => (
              <span className={tab === activeTab ? styles.activeDot : ""} key={tab} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  const { copy } = useCampaignCopy();

  return (
    <div className={styles.sectionHeading}>
      <h2>{copy(title)}</h2>
      <p>{copy(description)}</p>
    </div>
  );
}

function getInitialTaskStatuses(): Record<string, TaskStatus> {
  const previewStatus = new URLSearchParams(window.location.search).get("missionState");
  const initialStatus = TASK_STATUSES.includes(previewStatus as TaskStatus)
    ? (previewStatus as TaskStatus)
    : "not_started";

  return Object.fromEntries(MISSIONS.map((mission) => [mission.id, initialStatus]));
}

function MissionStatusButton({
  status,
  busy,
  coolingDown,
  onClick,
}: {
  status: TaskStatus;
  busy: boolean;
  coolingDown: boolean;
  onClick: () => void;
}) {
  const presentation = TASK_STATUS_PRESENTATION[status];
  const { copy } = useCampaignCopy();
  const label = busy ? "Checking..." : coolingDown ? "Retry shortly" : presentation.label;
  const icon = (
    <img
      className={status === "claiming" || busy ? styles.spinningStatusIcon : ""}
      src={busy ? "/campaign/status-loading.svg" : presentation.icon}
      alt=""
      aria-hidden="true"
    />
  );

  return (
    <button
      type="button"
      className={`${styles.missionStatusButton} ${styles[`missionStatus_${status}`]}`}
      disabled={presentation.disabled || busy || coolingDown}
      onClick={onClick}
    >
      {presentation.iconFirst ? icon : null}
      <span>{copy(label)}</span>
      {!presentation.iconFirst ? icon : null}
    </button>
  );
}

function ClaimRewardModal({
  mission,
  onClaim,
  onClose,
}: {
  mission: Mission | null;
  onClaim: () => void;
  onClose: () => void;
}) {
  const reward = mission?.reward.replace(/^\+/, "") ?? "0";
  const { copy } = useCampaignCopy();

  return (
    <ModalWithPortal
      className={styles.claimRewardModal}
      contentClassName={styles.claimRewardPanel}
      contentPadding={false}
      disableOverflowHandling
      isVisible={mission !== null}
      setIsVisible={(isVisible) => {
        if (!isVisible) onClose();
      }}
      variant="default"
    >
      <div className={styles.claimRewardArtwork} aria-hidden="true">
        <img src="/campaign/claim-reward-art.png" alt="" />
      </div>
      <h2>{copy("Claim Reward")}</h2>
      <div className={styles.claimRewardAmount}>
        <strong>{reward}</strong>
        <span>{copy("R Diamonds")}</span>
      </div>
      <button type="button" className={styles.claimNowButton} onClick={onClaim}>
        {copy("Claim Now")}
      </button>
      <div className={styles.claimRewardNotice}>
        <img src="/campaign/claim-alert.svg" alt="" aria-hidden="true" />
        <div className={styles.claimRewardNoticeCopy}>
          <p>
            {copy("R Diamonds")} <strong>{copy("must be claimed manually.")}</strong>
          </p>
          <p>{copy("Completed missions do not auto-credit rewards.")}</p>
        </div>
      </div>
    </ModalWithPortal>
  );
}

function MissionSubmitModal({
  mission,
  busy,
  coolingDown,
  errorMessage,
  onClose,
  onContinue,
}: {
  mission: Mission | null;
  busy: boolean;
  coolingDown: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onContinue: (xUrl: string) => void;
}) {
  const [xUrl, setXUrl] = useState("");
  const reward = mission?.reward ?? "+0";
  const isQuoteMission = mission?.id === "quote-launch";
  const { copy } = useCampaignCopy();

  useEffect(() => {
    if (mission) setXUrl("");
  }, [mission]);

  return (
    <ModalWithPortal
      className={styles.missionSubmitModal}
      contentClassName={styles.missionSubmitPanel}
      contentPadding={false}
      disableOverflowHandling
      isVisible={mission !== null}
      setIsVisible={(isVisible) => {
        if (!isVisible) onClose();
      }}
      variant="default"
    >
      <button type="button" className={styles.missionSubmitClose} aria-label={copy("Close")} onClick={onClose}>
        <img src="/campaign/submit-close.svg" alt="" aria-hidden="true" />
      </button>

      <header className={styles.missionSubmitHeader}>
        <h2>{copy(mission?.title ?? "Mission")}</h2>
        <p>{mission?.description ? copy(mission.description) : null}</p>
      </header>

      <section className={styles.missionSubmitSteps} aria-labelledby="mission-submit-steps-title">
        <h3 id="mission-submit-steps-title">{copy("How to complete")}</h3>
        {isQuoteMission ? (
          <ol>
            <li>{copy("Open the quote composer")}</li>
            <li>{copy("Publish your quote post")}</li>
            <li>{copy("Paste the published post URL below")}</li>
          </ol>
        ) : (
          <ol>
            <li>{copy("Open your X profile")}</li>
            <li>{copy("Add 🪨ROCKY to your name")}</li>
            <li>{copy("Return and verify")}</li>
          </ol>
        )}
      </section>

      <div className={styles.missionSubmitDetails}>
        <label>
          <span>{copy("Your X URL")}</span>
          <input
            type="url"
            value={xUrl}
            disabled={busy}
            onChange={(event) => setXUrl(event.target.value)}
            placeholder="Https://X.Com/Username/Status/."
            aria-invalid={errorMessage ? "true" : undefined}
            aria-describedby={errorMessage ? "mission-submit-error" : undefined}
          />
        </label>
        {errorMessage ? (
          <p id="mission-submit-error" className={styles.missionSubmitError} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className={styles.missionSubmitReward}>
          <img src="/campaign/submit-reward-icon.png" alt="" aria-hidden="true" />
          <span>{reward}</span>
          <span>{copy("R Diamonds")}</span>
        </div>
      </div>

      <div className={styles.missionSubmitActions}>
        <button type="button" className={styles.missionSubmitCancel} onClick={onClose}>
          {copy("Cancel")}
        </button>
        <button
          type="button"
          className={styles.missionSubmitPrimary}
          disabled={busy || coolingDown || (isQuoteMission && !isValidXPostUrl(xUrl))}
          onClick={() => onContinue(xUrl)}
        >
          <span>
            {copy(busy ? "Submitting..." : coolingDown ? "Retry shortly" : isQuoteMission ? "Submit" : "Open X")}
          </span>
          <img src="/campaign/submit-open-x.svg" alt="" aria-hidden="true" />
        </button>
      </div>
    </ModalWithPortal>
  );
}

function isValidXPostUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const isXHost = url.hostname === "x.com" || url.hostname === "www.x.com";
    const isTwitterHost = url.hostname === "twitter.com" || url.hostname === "www.twitter.com";
    return (isXHost || isTwitterHost) && /\/status\/\d+/.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

function OriginalPostSubmitModal({
  busy,
  errorMessage,
  isVisible,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  errorMessage: string | null;
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (postUrl: string) => void;
}) {
  const [postUrl, setPostUrl] = useState("");
  const [showError, setShowError] = useState(false);
  const { copy } = useCampaignCopy();

  useEffect(() => {
    if (isVisible) {
      setPostUrl("");
      setShowError(false);
    }
  }, [isVisible]);

  const submitPost = () => {
    if (busy || !isValidXPostUrl(postUrl)) {
      setShowError(true);
      return;
    }

    onSubmit(postUrl.trim());
  };

  return (
    <ModalWithPortal
      className={styles.originalPostSubmitModal}
      contentClassName={styles.originalPostSubmitPanel}
      contentPadding={false}
      disableOverflowHandling
      isVisible={isVisible}
      setIsVisible={(visible) => {
        if (!visible) onClose();
      }}
      variant="default"
    >
      <button type="button" className={styles.originalPostModalClose} aria-label={copy("Close")} onClick={onClose}>
        <img src="/campaign/submit-close.svg" alt="" aria-hidden="true" />
      </button>

      <header className={styles.originalPostSubmitHeader}>
        <h2>{copy("Submit Your Post")}</h2>
        <p>{copy("Submit your original post on X to earn R Diamonds.")}</p>
      </header>

      <ol className={styles.originalPostSubmitSteps} aria-label={copy("Submission progress")}>
        <li className={styles.originalPostSubmitStepActive}>
          <span>1</span>
          <strong>{copy("Paste Link")}</strong>
        </li>
        <img src="/campaign/post-submit-line-active.svg" alt="" aria-hidden="true" />
        <li>
          <span>2</span>
          <strong>{copy("Verify")}</strong>
        </li>
        <img src="/campaign/post-submit-line-muted.svg" alt="" aria-hidden="true" />
        <li>
          <span>3</span>
          <strong>{copy("Confirm")}</strong>
        </li>
      </ol>

      <label className={styles.originalPostUrlField}>
        <span>{copy("X Post Link")}</span>
        <small>{copy("Paste the link to your original post on X (Twitter).")}</small>
        <input
          type="url"
          value={postUrl}
          aria-invalid={showError}
          placeholder="https://x.com/username/status/1234567890"
          onChange={(event) => {
            setPostUrl(event.target.value);
            if (showError) setShowError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitPost();
          }}
        />
        {showError ? <em>{copy("Please enter a valid public X post link.")}</em> : null}
        {errorMessage ? <em role="alert">{errorMessage}</em> : null}
      </label>

      <section className={styles.originalPostRequirements}>
        <h3>
          <img src="/campaign/post-submit-alert.svg" alt="" aria-hidden="true" />
          {copy("Requirements")}
        </h3>
        <ul>
          {ORIGINAL_POST_REQUIREMENTS.map((requirement) => (
            <li key={requirement}>{copy(requirement)}</li>
          ))}
        </ul>
      </section>

      <div className={styles.originalPostSubmitActions}>
        <button type="button" disabled={busy} onClick={onClose}>
          {copy("Cancel")}
        </button>
        <button type="button" disabled={busy} onClick={submitPost}>
          <span>{copy(busy ? "Submitting..." : "Submit")}</span>
          <img src="/campaign/original-post-arrow.svg" alt="" aria-hidden="true" />
        </button>
      </div>
    </ModalWithPortal>
  );
}

function OriginalPostResultModal({
  mode,
  onClose,
  onRetry,
  reward,
}: {
  mode: Exclude<OriginalPostDialog, "submit" | null>;
  onClose: () => void;
  onRetry: () => void;
  reward: number;
}) {
  const isRejected = mode === "rejected";
  const { copy } = useCampaignCopy();

  return (
    <ModalWithPortal
      className={styles.originalPostResultModal}
      contentClassName={`${styles.originalPostResultPanel} ${isRejected ? styles.originalPostRejectedPanel : ""}`}
      contentPadding={false}
      disableOverflowHandling
      isVisible
      setIsVisible={(visible) => {
        if (!visible) onClose();
      }}
      variant="default"
    >
      <img
        className={styles.originalPostResultBadge}
        src={isRejected ? "/campaign/post-review-rejected.svg" : "/campaign/post-review-approved.svg"}
        alt=""
        aria-hidden="true"
      />

      {isRejected ? (
        <>
          <header className={styles.originalPostResultHeader}>
            <h2>{copy("Post Not Approved")}</h2>
            <p>
              {copy("Your post did not meet our requirements.")}
              <br />
              {copy("Please check the reason below and try again.")}
            </p>
          </header>
          <section className={styles.originalPostRejectReason}>
            <strong>{copy("Reason")}</strong>
            <p>{copy("Content is not related to Rocky or Canton.")}</p>
          </section>
          <button type="button" className={styles.originalPostResultButton} onClick={onRetry}>
            {copy("Try Again")}
          </button>
        </>
      ) : (
        <>
          <header className={styles.originalPostResultHeader}>
            <h2>{copy("Reward Claimed!")}</h2>
            <p>
              {copy("Your R Diamonds have been claimed successfully.")}
              <br />
              {copy("The reward has been added to your account.")}
            </p>
          </header>
          <section className={styles.originalPostRewardResult}>
            <div>
              <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
              <span>
                <strong>+{reward}</strong>
                <small>{copy("R Diamonds")}</small>
              </span>
            </div>
            <span>{copy("Claim Complete")}</span>
            <p>{copy("Your qualified post reward is now complete.")}</p>
          </section>
          <button type="button" className={styles.originalPostResultButton} onClick={onClose}>
            {copy("Done")}
          </button>
        </>
      )}
    </ModalWithPortal>
  );
}

function OriginalPostsModule({
  missionState,
  onRefresh,
  progress,
}: {
  missionState: MissionState;
  onRefresh: () => Promise<void>;
  progress: OriginalPostProgress;
}) {
  const [dialog, setDialog] = useState<OriginalPostDialog>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [locallyPending, setLocallyPending] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const { copy } = useCampaignCopy();

  useEffect(() => {
    if (progress.pendingToday > 0) setLocallyPending(false);
  }, [progress.pendingToday]);

  const dailyLimit = Math.min(progress.limit || ORIGINAL_POST_REWARDS.length, ORIGINAL_POST_REWARDS.length);
  const qualifiedCount = Math.min(progress.approvedToday, dailyLimit);
  const isDailyComplete = qualifiedCount >= dailyLimit;
  let status: OriginalPostStatus = "idle";
  if (
    isSubmitting ||
    isClaiming ||
    locallyPending ||
    progress.pendingToday > 0 ||
    missionState === "pending"
  ) {
    status = "pending";
  } else if (missionState === "claimable") {
    status = "claimable";
  } else if (missionState === "retry") {
    status = "rejected";
  } else if (isDailyComplete && missionState === "claimed") {
    status = "claimed";
  }

  const handleSubmit = async (postUrl: string) => {
    if (isSubmitting || locallyPending || progress.pendingToday > 0) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await startMission("ORIGINAL_TWEET");
      await submitCampaignMission("ORIGINAL_TWEET", postUrl);
      setDialog(null);
      setLocallyPending(true);
      helperToast.success(copy("Submission received. Verification is pending."));
      void onRefresh()
        .then(() => setLocallyPending(false))
        .catch(() => {
          // Keep the safe pending state when the authoritative refresh is unavailable.
        });
    } catch (_error) {
      const message = copy("The request failed. Please try again shortly.");
      setSubmissionError(message);
      helperToast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (status === "idle") {
      setSubmissionError(null);
      setDialog("submit");
      return;
    }

    if (status === "claimable") {
      if (isClaiming) return;
      setIsClaiming(true);
      try {
        await claimCampaignMission("ORIGINAL_TWEET");
        await onRefresh();
        setDialog("claimed");
      } catch (_error) {
        helperToast.error(copy("The request failed. Please try again shortly."));
      } finally {
        setIsClaiming(false);
      }
      return;
    }

    if (status === "rejected") setDialog("rejected");
  };

  const statusPresentation: Record<OriginalPostStatus, { label: string; icon?: string }> = {
    idle: { label: copy("Submit Post"), icon: "/campaign/original-post-arrow.svg" },
    pending: { label: copy("Pending"), icon: "/campaign/status-pending.svg" },
    claimable: { label: copy("Claim"), icon: "/campaign/original-post-arrow.svg" },
    claimed: { label: copy("Claimed"), icon: "/campaign/status-claimed.svg" },
    rejected: { label: copy("Rejected"), icon: "/campaign/status-retry.svg" },
  };
  const action = isClaiming
    ? { label: copy("Claiming..."), icon: "/campaign/status-pending.svg" }
    : statusPresentation[status];
  const displayedRewards = ORIGINAL_POST_REWARDS.slice(0, qualifiedCount).reduce(
    (total, post) => total + post.reward,
    0
  );
  const nextReward = ORIGINAL_POST_REWARDS[qualifiedCount]?.reward ?? 0;

  return (
    <section className={styles.originalPostsModule} aria-labelledby="original-posts-title">
      <header className={styles.originalPostsHeader}>
        <div>
          <h2 id="original-posts-title">{copy("Original Posts")}</h2>
          <span>{copy("Up to 2 / day • cumulative")}</span>
        </div>
        <p>{copy("Earn cumulative R Diamonds from qualified original posts each day.")}</p>
      </header>

      <div className={styles.originalPostsBody}>
        <div className={styles.originalPostsProgress}>
          <div className={styles.originalPostTimeline}>
            {isDailyComplete ? (
              <span
                className={`${styles.originalPostConnector} ${styles.originalPostConnectorAllComplete}`}
                aria-hidden="true"
              />
            ) : (
              <img
                className={`${styles.originalPostConnector} ${
                  qualifiedCount >= 1 ? styles.originalPostConnectorComplete : styles.originalPostConnectorPending
                }`}
                src={
                  qualifiedCount >= 1
                    ? "/campaign/original-post-connector-complete.svg"
                    : "/campaign/original-post-connector-pending.svg"
                }
                alt=""
                aria-hidden="true"
              />
            )}

            {ORIGINAL_POST_REWARDS.map((post, index) => {
              const isCompleted = index < qualifiedCount;

              return (
                <div
                  className={`${styles.originalPostNode} ${isCompleted ? styles.originalPostNodeCompleted : ""}`}
                  key={post.id}
                >
                  <span className={styles.originalPostBadge}>
                    <img
                      src={isCompleted ? "/campaign/original-post-complete.svg" : "/campaign/original-post-pending.svg"}
                      alt=""
                      aria-hidden="true"
                    />
                    {!isCompleted ? <strong>{post.id}</strong> : null}
                  </span>
                  <span className={styles.originalPostNodeCopy}>
                    <small>
                      {copy("Post")} {post.id}
                    </small>
                    <strong className={isCompleted ? styles.originalPostEarned : ""}>+{post.reward}</strong>
                    <small>{copy("R Diamonds")}</small>
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.originalPostsReset}>
            <img src="/campaign/original-post-baseline.svg" alt="" aria-hidden="true" />
            <p>{copy("Daily progress resets at 00:00 UTC.")}</p>
          </div>
        </div>

        <span className={styles.originalPostsDivider} aria-hidden="true">
          <img src="/campaign/original-post-divider.svg" alt="" />
        </span>

        <div className={styles.originalPostsSummary}>
          <div className={styles.originalPostStats}>
            <span className={styles.originalPostStat}>
              <span>
                <strong>{qualifiedCount}</strong>
                <em>/ 2</em>
              </span>
              <small>{copy("Qualified Today")}</small>
            </span>
            <span className={styles.originalPostStatDivider} aria-hidden="true">
              <img src="/campaign/original-post-stat-divider.svg" alt="" />
            </span>
            <span className={styles.originalPostStat}>
              <span>
                <strong>{displayedRewards}</strong>
                <em>/ 400</em>
              </span>
              <small>{copy("R Diamonds Earned")}</small>
            </span>
          </div>

          <div className={styles.originalPostNextReward}>
            <div>
              <small>{copy(isDailyComplete ? "Daily Complete" : "Next Reward")}</small>
              <strong>{isDailyComplete ? "2 / 2" : `+${nextReward}`}</strong>
              <span>
                <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
                {copy(isDailyComplete ? "Rewards Claimed" : "R Diamonds")}
              </span>
            </div>
            <button
              type="button"
              className={`${styles.originalPostSubmitButton} ${styles[`originalPostSubmitButton_${status}`]}`}
              disabled={status === "pending" || status === "claimed" || (isDailyComplete && status !== "claimable")}
              onClick={() => void handleAction()}
            >
              <span>{action.label}</span>
              {action.icon ? (
                <img
                  className={status === "pending" ? styles.spinningStatusIcon : ""}
                  src={action.icon}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </div>
        </div>
      </div>

      <OriginalPostSubmitModal
        busy={isSubmitting}
        errorMessage={submissionError}
        isVisible={dialog === "submit"}
        onClose={() => setDialog(null)}
        onSubmit={(postUrl) => void handleSubmit(postUrl)}
      />
      {dialog === "claimed" || dialog === "rejected" ? (
        <OriginalPostResultModal
          mode={dialog}
          reward={ORIGINAL_POST_REWARDS[Math.max(qualifiedCount - 1, 0)].reward}
          onClose={() => {
            setDialog(null);
          }}
          onRetry={() => {
            setDialog("submit");
          }}
        />
      ) : null}
    </section>
  );
}

function MissionsContent() {
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>(getInitialTaskStatuses);
  const [claimMission, setClaimMission] = useState<Mission | null>(null);
  const [submitMission, setSubmitMission] = useState<Mission | null>(null);
  const [busyMissionIds, setBusyMissionIds] = useState<Set<string>>(() => new Set());
  const [coolingDownMissionIds, setCoolingDownMissionIds] = useState<Set<string>>(() => new Set());
  const [missionSubmitError, setMissionSubmitError] = useState<string | null>(null);
  const [isXConnected, setIsXConnected] = useState(false);
  const [isXConnecting, setIsXConnecting] = useState(false);
  const [hasLoadedMissions, setHasLoadedMissions] = useState(false);
  const [originalMissionState, setOriginalMissionState] = useState<MissionState>("not_started");
  const [originalPostProgress, setOriginalPostProgress] = useState<OriginalPostProgress>({
    activityDay: 1,
    approvedToday: 0,
    pendingToday: 0,
    limit: ORIGINAL_POST_REWARDS.length,
  });
  const inFlightMissionIdsRef = useRef(new Set<string>());
  const cooldownTimersRef = useRef<Record<string, number>>({});
  const submittedUrlsRef = useRef<Record<string, string>>({});
  const { copy, isTraditionalChinese } = useCampaignCopy();
  const history = useHistory();
  const { connected, locked } = useCantonSession();
  const { unlock } = useCantonWallet();

  const applyMissionList = useCallback((result: MissionList) => {
    const statuses = getInitialTaskStatuses();
    let xConnected = false;
    let originalState: MissionState = "not_started";
    result.missions.forEach((mission) => {
      if (mission.key === "BIND_X") {
        xConnected = mission.state === "claimed";
        return;
      }
      if (mission.key === "ORIGINAL_TWEET") {
        originalState = mission.state;
        return;
      }
      const missionId = MISSION_ID_BY_KEY[mission.key];
      if (missionId) statuses[missionId] = mission.state;
    });
    setTaskStatuses(statuses);
    setIsXConnected(xConnected);
    setOriginalMissionState(originalState);
    if (result.progress.originalTweet) {
      setOriginalPostProgress(result.progress.originalTweet);
    }
    setHasLoadedMissions(true);
  }, []);

  const refreshMissions = useCallback(async () => {
    applyMissionList(await getMissions());
  }, [applyMissionList]);

  useEffect(() => {
    let active = true;
    void getMissions()
      .then((result) => {
        if (!active) return;
        applyMissionList(result);
      })
      .catch(() => {
        // Keep controls usable so retryable API errors can be retried by the user.
      });
    return () => {
      active = false;
    };
  }, [applyMissionList]);

  useEffect(() => {
    if (originalPostProgress.pendingToday <= 0 && originalMissionState !== "pending") return;
    const timer = window.setInterval(() => {
      void refreshMissions().catch(() => {
        // Preserve the last authoritative state and retry on the next interval.
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [originalMissionState, originalPostProgress.pendingToday, refreshMissions]);

  useEffect(
    () => () => {
      Object.values(cooldownTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const updateTaskStatus = (missionId: string, status: TaskStatus) => {
    setTaskStatuses((current) => ({ ...current, [missionId]: status }));
  };

  const setMissionBusy = (missionId: string, busy: boolean) => {
    setBusyMissionIds((current) => {
      const next = new Set(current);
      if (busy) next.add(missionId);
      else next.delete(missionId);
      return next;
    });
  };

  const beginMissionCooldown = (missionId: string, durationSeconds = 5) => {
    setCoolingDownMissionIds((current) => new Set(current).add(missionId));
    const existingTimer = cooldownTimersRef.current[missionId];
    if (existingTimer) window.clearTimeout(existingTimer);
    cooldownTimersRef.current[missionId] = window.setTimeout(() => {
      setCoolingDownMissionIds((current) => {
        const next = new Set(current);
        next.delete(missionId);
        return next;
      });
      delete cooldownTimersRef.current[missionId];
    }, durationSeconds * 1_000);
  };

  const errorRetryAfterSeconds = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number"
      ? error.retryAfterSeconds
      : undefined;

  const campaignActionError = (error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : "";
    switch (code) {
      case "DEPENDENCY_UNAVAILABLE":
        return copy("X verification is temporarily unavailable. Please try again shortly.");
      case "REQUEST_RATE_LIMITED":
      case "X_RATE_LIMITED":
        return copy("Too many attempts. Please wait before trying again.");
      case "MISSION_SUBMISSION_INVALID":
        return copy("This X post link is invalid. Check the URL and try again.");
      case "SOCIAL_POST_AUTHOR_MISMATCH":
        return copy("This post belongs to another X account.");
      case "SOCIAL_QUOTE_RELATION_INVALID":
        return copy("This post does not quote the Rocky launch post.");
      case "SOCIAL_POST_NOT_FOUND":
        return copy("This post could not be found or is not public.");
      case "SOCIAL_REAUTH_REQUIRED":
        return copy("X authorization expired. Reconnect X and try again.");
      default:
        return copy("The request failed. Please try again shortly.");
    }
  };

  const handleMissionAction = async (mission: Mission) => {
    const status = taskStatuses[mission.id];
    const missionKey = MISSION_KEY_BY_ID[mission.id];
    if (!missionKey) return;
    if (inFlightMissionIdsRef.current.has(mission.id)) return;

    if (status === "not_started") {
      if (mission.id === "nickname-rocky") {
        setSubmitMission(mission);
        return;
      }
      inFlightMissionIdsRef.current.add(mission.id);
      try {
        const result = await startMission(missionKey);
        updateTaskStatus(mission.id, result.state);
        if ((mission.id === "like-launch" || mission.id === "quote-launch") && result.actionUrls?.[0]) {
          window.open(result.actionUrls[0], "_blank", "noopener,noreferrer");
        }
        if (mission.id === "quote-launch") setSubmitMission(mission);
        if (mission.id === "first-trade") history.push("/trade");
      } catch (_error) {
        updateTaskStatus(mission.id, "retry");
      } finally {
        inFlightMissionIdsRef.current.delete(mission.id);
      }
      return;
    }

    if (status === "verifying" || status === "retry") {
      if (mission.id === "quote-launch") {
        setSubmitMission(mission);
        return;
      }
      inFlightMissionIdsRef.current.add(mission.id);
      setMissionBusy(mission.id, true);
      updateTaskStatus(mission.id, "pending");
      try {
        const result = await verifyMission(missionKey);
        updateTaskStatus(mission.id, result.state);
        if (result.state === "claimable") {
          helperToast.success(copy("Mission verified. Reward is ready to claim."));
        } else if (result.state === "retry") {
          helperToast.info(copy("The requirement was not detected yet. Check it and retry shortly."));
          beginMissionCooldown(mission.id, 60);
        } else if (result.state === "pending") {
          helperToast.info(copy("Submission received. Verification is pending."));
        }
      } catch (error) {
        updateTaskStatus(mission.id, "retry");
        helperToast.error(campaignActionError(error));
        beginMissionCooldown(mission.id, Math.max(60, errorRetryAfterSeconds(error) ?? 0));
      } finally {
        setMissionBusy(mission.id, false);
        inFlightMissionIdsRef.current.delete(mission.id);
      }
      return;
    }

    if (status === "claimable") {
      setClaimMission(mission);
    }
  };

  const handleClaim = async () => {
    if (!claimMission) return;
    const missionId = claimMission.id;
    const missionKey = MISSION_KEY_BY_ID[missionId];
    if (!missionKey) return;
    setClaimMission(null);
    updateTaskStatus(missionId, "claiming");
    try {
      await claimCampaignMission(missionKey);
      updateTaskStatus(missionId, "claimed");
    } catch (_error) {
      updateTaskStatus(missionId, "retry");
    }
  };

  const handleMissionSubmit = async (xUrl: string) => {
    if (!submitMission) return;
    const missionId = submitMission.id;
    const missionKey = MISSION_KEY_BY_ID[missionId];
    if (!missionKey) return;
    submittedUrlsRef.current[missionId] = xUrl.trim();
    if (missionId === "quote-launch") {
      if (!isValidXPostUrl(xUrl) || inFlightMissionIdsRef.current.has(missionId)) return;
      inFlightMissionIdsRef.current.add(missionId);
      setMissionBusy(missionId, true);
      setMissionSubmitError(null);
      updateTaskStatus(missionId, "pending");
      try {
        const result = await submitCampaignMission(missionKey, xUrl.trim());
        updateTaskStatus(missionId, result.state);
        if (result.state === "retry") {
          const message = copy("The requirement was not detected yet. Check it and retry shortly.");
          setMissionSubmitError(message);
          helperToast.info(message);
          beginMissionCooldown(missionId);
        } else {
          setSubmitMission(null);
          helperToast.success(copy("Submission received. Verification is pending."));
        }
      } catch (error) {
        updateTaskStatus(missionId, "retry");
        const message = campaignActionError(error);
        setMissionSubmitError(message);
        helperToast.error(message);
        beginMissionCooldown(missionId, errorRetryAfterSeconds(error) ?? 5);
      } finally {
        setMissionBusy(missionId, false);
        inFlightMissionIdsRef.current.delete(missionId);
      }
      return;
    }
    setSubmitMission(null);
    try {
      const result = await startMission(missionKey);
      updateTaskStatus(missionId, result.state);
    } catch (_error) {
      updateTaskStatus(missionId, "retry");
      return;
    }
    window.open("https://x.com/settings/profile", "_blank", "noopener,noreferrer");
  };

  const handleXConnect = async () => {
    if (isXConnected || isXConnecting || (connected && !hasLoadedMissions)) return;
    if (!connected) {
      openCantonConnect();
      return;
    }
    setIsXConnecting(true);
    try {
      if (locked) await unlock();
      window.location.assign(await startWalletBoundXOAuth());
    } catch (_error) {
      setIsXConnecting(false);
    }
  };

  const completedCount = MISSIONS.filter((mission) =>
    ["claimable", "claiming", "claimed"].includes(taskStatuses[mission.id])
  ).length;

  return (
    <section className={`${styles.content} ${styles.missionsContent}`}>
      <div className={styles.missionsHeading}>
        <SectionHeading title="Missions" description="Complete missions to earn R Diamonds" />
        <button
          type="button"
          className={`${styles.xConnectButton} ${isXConnected ? styles.xConnectButtonConnected : ""}`}
          aria-pressed={isXConnected}
          disabled={isXConnecting || (connected && !hasLoadedMissions)}
          onClick={() => void handleXConnect()}
        >
          <span>
            {copy(
              isXConnected
                ? "X Connected"
                : isXConnecting
                  ? "Connecting..."
                  : connected && !hasLoadedMissions
                    ? "Loading..."
                  : connected
                    ? "Connect X"
                    : "Connect Wallet First"
            )}
          </span>
          {!isXConnected ? <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" /> : null}
        </button>
      </div>

      <div className={styles.progressOverview}>
        <span>{copy("Your Progress")}</span>
        <span
          className={styles.progressTrack}
          role="img"
          aria-label={
            isTraditionalChinese
              ? `已完成 ${completedCount}/${MISSIONS.length} 項任務`
              : `${completedCount} of ${MISSIONS.length} missions completed`
          }
        >
          {Array.from({ length: MISSIONS.length }, (_, index) => (
            <span className={index < completedCount ? styles.completedProgressStep : ""} key={index} />
          ))}
        </span>
        <span className={styles.progressValue}>
          <strong>{completedCount}</strong> / {MISSIONS.length}
        </span>
        <span>{copy("Claimable")}</span>
      </div>

      <div className={styles.missionList}>
        {MISSIONS.map((mission, index) => (
          <article className={styles.missionRow} key={mission.title}>
            <span className={styles.missionNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.missionIcon}>
              {mission.icon ? <img src={mission.icon} alt="" aria-hidden="true" /> : mission.iconText}
            </span>
            <span className={styles.missionCopy}>
              <strong>{copy(mission.title)}</strong>
              <small>{copy(mission.description)}</small>
            </span>
            <span className={styles.missionReward}>
              <DiamondAmount>{mission.reward}</DiamondAmount>
              <small>{copy("R Diamonds")}</small>
            </span>
            <MissionStatusButton
              status={taskStatuses[mission.id]}
              busy={busyMissionIds.has(mission.id)}
              coolingDown={coolingDownMissionIds.has(mission.id)}
              onClick={() => void handleMissionAction(mission)}
            />
          </article>
        ))}
      </div>

      <OriginalPostsModule
        missionState={originalMissionState}
        onRefresh={refreshMissions}
        progress={originalPostProgress}
      />

      <ClaimRewardModal
        mission={claimMission}
        onClaim={() => void handleClaim()}
        onClose={() => setClaimMission(null)}
      />
      <MissionSubmitModal
        mission={submitMission}
        busy={submitMission ? busyMissionIds.has(submitMission.id) : false}
        coolingDown={submitMission ? coolingDownMissionIds.has(submitMission.id) : false}
        errorMessage={missionSubmitError}
        onClose={() => {
          setMissionSubmitError(null);
          setSubmitMission(null);
        }}
        onContinue={(xUrl) => void handleMissionSubmit(xUrl)}
      />

      <aside className={styles.rules}>
        <h2>
          <img src="/campaign/alert.svg" alt="" aria-hidden="true" />
          {copy("Important Note")}
        </h2>
        <ul>
          <li>{copy("Complete each mission using the connected wallet.")}</li>
          <li>{copy("Social content must relate to Rocky, Canton, or the Beta campaign.")}</li>
          <li>{copy("R Diamonds are relative contribution records and must be claimed manually.")}</li>
          <li>{copy("Fraudulent, copied, or automated submissions may be rejected.")}</li>
        </ul>
      </aside>
    </section>
  );
}

function LeaderboardContent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageEntries, setPageEntries] = useState<DisplayLeaderboardEntry[]>([]);
  const totalPages = Math.max(1, Math.ceil(totalEntries / LEADERBOARD_PAGE_SIZE));
  const { copy, isTraditionalChinese } = useCampaignCopy();

  useEffect(() => {
    let active = true;
    void getLeaderboard(currentPage)
      .then((page) => {
        if (!active) return;
        setTotalEntries(page.total);
        setPageEntries(page.entries.map(toDisplayLeaderboardEntry));
      })
      .catch(() => {
        if (active) setPageEntries([]);
      });
    return () => {
      active = false;
    };
  }, [currentPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  };

  return (
    <section className={`${styles.content} ${styles.leaderboardContent}`}>
      <SectionHeading title="Ranking" description="Qualified accounts ranked by trading volume" />

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader} aria-hidden="true">
          <span>{copy("Rank")}</span>
          <span>{copy("User")}</span>
          <span>{copy("Volume (USD)")}</span>
          <span>{copy("Est. R Diamonds Reward")}</span>
        </div>

        <div className={styles.leaderboard} role="table" aria-label={copy("Season 0 leaderboard")}>
          {pageEntries.length === 0 ? (
            <div className={styles.row} role="row">
              <span className={styles.userCell} role="cell">
                {copy("No qualified traders yet.")}
              </span>
            </div>
          ) : null}
          {pageEntries.map((entry) => (
            <div className={`${styles.row} ${entry.rank <= 3 ? styles.podiumRow : ""}`} role="row" key={entry.rank}>
              <div className={styles.rankCell} role="cell">
                <RankBadge rank={entry.rank} />
              </div>
              <div className={styles.userCell} role="cell">
                <span className={styles.avatar}>
                  {entry.avatar ? <img src={entry.avatar} alt="" aria-hidden="true" /> : null}
                </span>
                <span className={styles.userCopy}>
                  <strong>{entry.name}</strong>
                  <small>{entry.address}</small>
                </span>
              </div>
              <span className={styles.volume} role="cell">
                {entry.volume}
              </span>
              <span className={styles.rewardCell} role="cell">
                <DiamondAmount>{entry.reward}</DiamondAmount>
              </span>
            </div>
          ))}
        </div>
      </div>

      <nav className={styles.pagination} aria-label={copy("Leaderboard pages")}>
        <button
          type="button"
          aria-label={copy("Previous page")}
          disabled={currentPage === 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          <img src="/campaign/chevron-left.svg" alt="" aria-hidden="true" />
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <button
            type="button"
            className={page === currentPage ? styles.currentPage : ""}
            aria-current={page === currentPage ? "page" : undefined}
            aria-label={isTraditionalChinese ? `${copy("Page")} ${page} 頁` : `Page ${page}`}
            onClick={() => goToPage(page)}
            key={page}
          >
            {String(page).padStart(2, "0")}
          </button>
        ))}
        <button
          type="button"
          aria-label={copy("Next page")}
          disabled={currentPage === totalPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          <img src="/campaign/chevron-right.svg" alt="" aria-hidden="true" />
        </button>
      </nav>

      <section className={styles.rewards}>
        <h2>
          <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
          {copy("Top 50 Rewards")}
        </h2>
        <div className={styles.rewardTiers}>
          {REWARD_TIERS.map((tier) => (
            <div className={styles.rewardTier} key={tier.label}>
              <span className={styles[tier.tone]}>{copy(tier.label)}</span>
              {tier.showDiamond ? (
                <DiamondAmount>{tier.reward}</DiamondAmount>
              ) : (
                <span className={styles.plainReward}>{tier.reward}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <aside className={styles.rules}>
        <h2>
          <img src="/campaign/alert.svg" alt="" aria-hidden="true" />
          {copy("Ranking Rules")}
        </h2>
        <ul>
          <li>
            {copy(
              "This is a real-funds trading competition. Only eligible accounts enter the leaderboard, ranked by total qualified trading volume in descending order."
            )}
          </li>
          <li>
            {copy(
              "Eligibility requires time-weighted average equity of at least $200, at least $2,000 in qualified notional trading volume, 10 effective trades, and activity on 2 or more trading days."
            )}
          </li>
          <li>
            {copy(
              "Wash trading, related-account self-dealing, and other abnormal activity are excluded and may result in disqualification."
            )}
          </li>
          <li>
            {copy(
              "The leaderboard closes at 24:00 UTC+8 on Day 14. Only qualifying trades completed before the deadline count toward the final volume ranking."
            )}
          </li>
          <li>
            {copy(
              "The Top 50 share 56,500,000 R Diamonds by the tiers above. Traders with at least 10 effective trades across 2 trading days who finish outside the Top 50 receive 500 R Diamonds."
            )}
          </li>
        </ul>
      </aside>
    </section>
  );
}

function toDisplayLeaderboardEntry(entry: ActivityLeaderboardEntry): DisplayLeaderboardEntry {
  return {
    rank: entry.rank,
    name: `Trader #${entry.rank}`,
    address: entry.wallet,
    volume: `$${formatDecimal(entry.effectiveVolume)}`,
    reward: formatInteger(entry.estimatedReward),
  };
}

function formatInteger(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch (_error) {
    return value;
  }
}

function formatDecimal(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}

function ComingSoon() {
  const { copy } = useCampaignCopy();

  return (
    <div className={styles.comingSoon}>
      <img src="/campaign/lock.svg" alt="" aria-hidden="true" />
      <span>{copy("Coming Soon")}</span>
    </div>
  );
}

function RewardInfoTooltip({ ariaLabel, content }: { ariaLabel: string; content: ReactNode }) {
  return (
    <TooltipWithPortal
      content={content}
      handle={
        <button type="button" className={styles.rewardInfoButton} aria-label={ariaLabel}>
          <img src="/campaign/reward-tooltip-info.svg" alt="" aria-hidden="true" />
        </button>
      }
      position="right-start"
      openDelay={0}
      closeDelay={80}
      maxAllowedWidth={230}
      tooltipClassName={styles.rewardTooltip}
      variant="none"
    />
  );
}

function MyRewardsContent() {
  const [copied, setCopied] = useState(false);
  const [rewards, setRewards] = useState<RewardSummary | null>(null);
  const referralLink = "Https://xxxxxx.xxxxx.xxx.xxxxxxx";
  const { copy } = useCampaignCopy();

  useEffect(() => {
    let active = true;
    void getRewards()
      .then((summary) => {
        if (active) setRewards(summary);
      })
      .catch(() => {
        // The zero state remains truthful when the authenticated read is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const totalRewards = rewards?.totalRewards ?? "0";
  const taskRewards = rewards?.taskRewards ?? "0";
  const campaignRewards = rewards?.campaignRewards ?? "0";
  const referralRewards = rewards?.referralRewards ?? "0";
  const claimable = rewards?.claimable ?? "0";

  return (
    <section className={`${styles.content} ${styles.rewardsContent}`}>
      <SectionHeading title="My Rewards" description="Track your rewards, status, and exclusive benefits." />

      <div className={styles.rewardDashboard}>
        <article className={`${styles.dashboardCard} ${styles.diamondCard}`}>
          <h3>
            {copy("R Diamonds")}
            <small>{copy("（Reward Breakdown）")}</small>
          </h3>
          <img className={styles.dashboardArtwork} src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
          <div className={styles.diamondStats}>
            <div className={styles.totalRewardLabel}>
              <span className={styles.metricLabel}>{copy("Total Rewards")}</span>
              <RewardInfoTooltip
                ariaLabel={copy("About total rewards")}
                content={copy("Earned from missions and campaign participation.")}
              />
            </div>
            <strong className={styles.totalRewards}>{formatInteger(totalRewards)}</strong>
            <div className={styles.rewardBreakdown}>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>{copy("Task Rewards")}</small>
                  <RewardInfoTooltip ariaLabel={copy("About task rewards")} content={copy("Earned from missions.")} />
                </span>
                <strong>{formatInteger(taskRewards)}</strong>
              </span>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>{copy("Campaign Rewards")}</small>
                  <RewardInfoTooltip
                    ariaLabel={copy("About campaign rewards")}
                    content={
                      <>
                        <span className={styles.rewardTooltipMuted}>{copy("CLAIMED")}</span>
                        <span>
                          {" "}
                          {formatInteger(rewards?.ledgerBalance ?? "0")} {copy("R Diamonds")}
                        </span>
                      </>
                    }
                  />
                </span>
                <strong>{formatInteger(campaignRewards)}</strong>
              </span>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>{copy("Referral Rewards")}</small>
                  <RewardInfoTooltip
                    ariaLabel={copy("About referral rewards")}
                    content={copy("Earned from successful referrals.")}
                  />
                </span>
                <strong>{formatInteger(referralRewards)}</strong>
              </span>
            </div>
            <div className={styles.claimPanel}>
              <span>
                <small>{copy("Claimable")}</small>
                <strong>{formatInteger(claimable)}</strong>
              </span>
              <button type="button" className={styles.primaryButton}>
                {copy("Claim")}
                <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.pointsCard}`}>
          <h3>{copy("R Points (Future)")}</h3>
          <div className={styles.pointsBody}>
            <img src="/campaign/r-points.png" alt="" aria-hidden="true" />
            <span>
              <small className={styles.metricLabel}>{copy("Total R Points")}</small>
              <strong>{formatInteger(rewards?.rPoints.total ?? "0")}</strong>
            </span>
          </div>
          <ComingSoon />
        </article>

        <article className={`${styles.dashboardCard} ${styles.referralsCard}`}>
          <h3>{copy("Your Referrals")}</h3>
          <div className={styles.referralMetrics}>
            <span className={styles.earnedMetric}>
              <strong>
                {formatInteger(referralRewards)}
                <img src="/campaign/r-diamond.png" alt={copy("R Diamonds")} />
              </strong>
              <small>{copy("Total Earned --")}</small>
            </span>
            <span>
              <strong>0</strong>
              <small>{copy("Total Referred Users")}</small>
            </span>
            <span>
              <strong className={styles.coolMetric}>10%</strong>
              <small>{copy("Reward Rate")}</small>
            </span>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.referralLinkCard}`}>
          <h3>{copy("Your Referral Link")}</h3>
          <div className={styles.copyRow}>
            <span>{referralLink}</span>
            <button type="button" onClick={handleCopy} aria-label={copy("Copy referral link")}>
              <img src="/campaign/copy.svg" alt="" aria-hidden="true" />
            </button>
          </div>
          <div className={styles.copyRow}>
            <span>
              {copy("Code:")} <strong>GLZ885</strong>
            </span>
            <button type="button" onClick={handleCopy} aria-label={copy("Copy referral code")}>
              <img src="/campaign/copy.svg" alt="" aria-hidden="true" />
            </button>
          </div>
          <button type="button" className={styles.copyButton} onClick={handleCopy}>
            <img src="/campaign/share.svg" alt="" aria-hidden="true" />
            {copy(copied ? "Copied" : "Copy Link")}
          </button>
        </article>

        <article className={`${styles.dashboardCard} ${styles.howItWorksCard}`}>
          <h3>{copy("How It Works")}</h3>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>{copy("Share Your Link")}</strong>
                <small>{copy("Copy and share your unique referral link.")}</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>{copy("Friends Join")}</strong>
                <small>{copy("They sign up and start earning using your link.")}</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>{copy("Earn Rewards")}</strong>
                <small>{copy("Get 10% R Diamonds")}</small>
              </div>
            </li>
          </ol>
        </article>

        <article className={`${styles.dashboardCard} ${styles.badgeCard}`}>
          <h3>{copy("Badges")}</h3>
          <div className={styles.badgeBody}>
            <span className={styles.badgeArtwork}>
              <img src="/campaign/og-badge.png" alt={copy("Rocky OG badge")} />
              <small>{copy("OG Badges · Rare")}</small>
            </span>
            <span className={styles.badgeCopy}>
              <strong>
                {copy(
                  rewards?.badge.status === "eligible" || rewards?.badge.status === "approved"
                    ? "Eligible"
                    : "Coming Soon"
                )}
                {rewards?.badge.status === "eligible" || rewards?.badge.status === "approved" ? (
                  <img src="/campaign/eligible-check.svg" alt="" aria-hidden="true" />
                ) : null}
              </strong>
              <p>{copy("Eligible OG users will receive the badge after the activity review.")}</p>
              <em>
                {copy("Limited")} {rewards?.badge.approved ?? 0}/{rewards?.badge.cap ?? 500}
              </em>
              <small>{copy("Learn More →")}</small>
            </span>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.ccCard}`}>
          <h3>{copy("CC Rewards")}</h3>
          <p>{copy("Specific ratios, schedules, and conditions are subject to the final announcement.")}</p>
          <div className={styles.ccBody}>
            <img src="/campaign/cc-chest.png" alt="" aria-hidden="true" />
            <span>
              {["Redemption ratio", "Unlock schedule", "Eligibility"].map((item) => (
                <span className={styles.ccLine} key={item}>
                  <img src="/campaign/reward-bullet.png" alt="" aria-hidden="true" />
                  <span>{copy(item)}</span>
                  <small>TBA</small>
                </span>
              ))}
              <ComingSoon />
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function SeasonZeroLeaderboardPage() {
  const history = useHistory();
  const location = useLocation();
  const activeTab = getCampaignTab(location.search);
  const [campaignEndsAt, setCampaignEndsAt] = useState<string | null>(null);
  const { copy, isTraditionalChinese } = useCampaignCopy();

  useEffect(() => {
    let active = true;
    void getCampaign()
      .then((campaign) => {
        if (active) setCampaignEndsAt(campaign.endsAt);
      })
      .catch(() => {
        // Keep the page available if campaign metadata is temporarily unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("campaign-active");
    document.body.classList.add("lighter-active");
    return () => {
      document.documentElement.classList.remove("campaign-active");
      document.body.classList.remove("lighter-active");
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("x_error") !== "X_IDENTITY_IMMUTABLE") return;

    helperToast.error(
      isTraditionalChinese
        ? CAMPAIGN_ZH_TW[
            "This wallet is already connected to another X account. Please authorize the previously connected X account."
          ]
        : "This wallet is already connected to another X account. Please authorize the previously connected X account.",
    );
    params.delete("x");
    params.delete("x_error");
    history.replace({
      pathname: location.pathname,
      search: params.toString(),
    });
  }, [history, isTraditionalChinese, location.pathname, location.search]);

  const handleTabChange = (tab: CampaignTab) => {
    const search = tab === "missions" ? "" : `?tab=${tab}`;
    history.push({ pathname: location.pathname, search });
  };

  return (
    <div className={`lighter-root ${styles.page}`}>
      <header className={styles.topnav}>
        <TopNav transparent />
      </header>

      <main>
        <CampaignHero activeTab={activeTab} campaignEndsAt={campaignEndsAt} onTabChange={handleTabChange} />

        <nav className={styles.campaignTabs} aria-label={copy("Campaign sections")}>
          {(
            [
              ["missions", "Missions"],
              ["leaderboard", "Leaderboard"],
              ["rewards", "My Rewards"],
            ] as const
          ).map(([tab, label]) => {
            const isActive = activeTab === tab;
            return (
              <button
                type="button"
                className={isActive ? styles.activeTab : ""}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleTabChange(tab)}
                key={tab}
              >
                {isActive ? `[ ${copy(label)} ]` : copy(label)}
              </button>
            );
          })}
        </nav>

        {activeTab === "missions" ? (
          <MissionsContent />
        ) : activeTab === "leaderboard" ? (
          <LeaderboardContent />
        ) : (
          <MyRewardsContent />
        )}
      </main>
    </div>
  );
}
