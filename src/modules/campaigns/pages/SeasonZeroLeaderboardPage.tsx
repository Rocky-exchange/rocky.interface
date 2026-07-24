import { type ReactNode, useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { ModalWithPortal, TooltipWithPortal } from "@/shared/ui";

import "@/modules/lighter/styles/global.scss";
import styles from "./SeasonZeroLeaderboardPage.module.scss";

type CampaignTab = "missions" | "leaderboard" | "rewards";
type TaskStatus = "not_started" | "verifying" | "pending" | "claimable" | "claiming" | "claimed" | "retry";
type OriginalPostStatus = "idle" | "pending" | "claimable" | "claimed" | "rejected";
type OriginalPostDialog = "submit" | "claimed" | "rejected" | null;

type LeaderboardEntry = {
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

function leaderboardRewardForRank(rank: number) {
  if (rank === 1) return "4,000,000";
  if (rank <= 3) return "2,500,000";
  if (rank <= 10) return "1,500,000";
  if (rank <= 20) return "1,000,000";
  return "900,000";
}

const FEATURED_TRADERS = [
  { name: "Rocky Trader", avatar: "/campaign/avatar-rocky.png" },
  { name: "PerpMaster", avatar: "/campaign/avatar-perp.png" },
  { name: "CantonWhale", avatar: "/campaign/avatar-canton.jpg" },
  { name: "OrbitMaker", avatar: "/campaign/avatar-user.png" },
] as const;

const TRADER_ALIASES = ["Nova", "Rift", "Atlas", "Vector", "Quartz", "Cipher", "Helix", "Apex"];

const LEADERBOARD: LeaderboardEntry[] = Array.from({ length: 50 }, (_, index) => {
  const rank = index + 1;
  const featured = FEATURED_TRADERS[index];
  const addressStart = (0xba3 + rank * 113).toString(16).padStart(3, "0").toUpperCase();
  const addressEnd = ((rank * 977 + 0x7f3c) % 0xffff).toString(16).padStart(4, "0").toUpperCase();
  const volume = 5_240_000 - index * 83_000;

  return {
    rank,
    name: featured?.name ?? `${TRADER_ALIASES[index % TRADER_ALIASES.length]}Trader${rank}`,
    address: `0x${addressStart}...${addressEnd}`,
    volume: `$${volume.toLocaleString("en-US")}`,
    reward: leaderboardRewardForRank(rank),
    avatar: featured?.avatar,
  };
});

const REWARD_TIERS = [
  { label: "Top 1", reward: "4,000,000", showDiamond: true, tone: "gold" },
  { label: "Top 2 – 3", reward: "2,500,000", showDiamond: true, tone: "silver" },
  { label: "Top 4 – 10", reward: "1,500,000", showDiamond: true, tone: "bronze" },
  { label: "Top 11 – 20", reward: "1,000,000", showDiamond: true, tone: "muted" },
  { label: "Top 21 – 50", reward: "900,000", showDiamond: true, tone: "muted" },
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
];

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
  if (rank <= 3) {
    return <span className={`${styles.crown} ${styles[`crown${rank}`]}`} aria-label={`Rank ${rank}`} />;
  }

  return <span className={styles.rankNumber}>{rank}</span>;
}

function CampaignCountdown() {
  return (
    <div className={styles.countdown} aria-label="Event countdown: 5 days 12 hours 45 minutes 30 seconds">
      <span className={styles.countdownLabel}>Ends in</span>
      <span className={styles.countdownValue}>05</span>
      <span>D</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>12</span>
      <span>H</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>45</span>
      <span>M</span>
      <span className={styles.countdownColon}>:</span>
      <span className={styles.countdownValue}>30</span>
      <span>S</span>
    </div>
  );
}

function CampaignHero({ activeTab, onTabChange }: { activeTab: CampaignTab; onTabChange: (tab: CampaignTab) => void }) {
  const history = useHistory();
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
            <h1>{isMissions ? "Rocky First Ascent" : isRewards ? "Rewards Panel" : "Rocky Trading Challenge"}</h1>
            <p>
              {isMissions
                ? "Earn free R Diamonds · Unlock CC rewards"
                : isRewards
                  ? "Track your R Diamonds, future rewards, and exclusive benefits. More rewards coming soon."
                  : "Top 50 Traders. Highest Volume. R Diamonds Rewards."}
            </p>
          </div>

          {!isRewards ? (
            <div className={styles.heroActions}>
              <button type="button" className={styles.primaryButton} onClick={() => history.push("/trade")}>
                <span>Start Trading</span>
                <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
              </button>
              {isMissions ? (
                <button type="button" className={styles.secondaryButton} onClick={() => onTabChange("leaderboard")}>
                  <span>View Leaderboard</span>
                  <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.heroFooter}>
          <CampaignCountdown />
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
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      <p>{description}</p>
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

function MissionStatusButton({ status, onClick }: { status: TaskStatus; onClick: () => void }) {
  const presentation = TASK_STATUS_PRESENTATION[status];
  const icon = (
    <img
      className={status === "claiming" ? styles.spinningStatusIcon : ""}
      src={presentation.icon}
      alt=""
      aria-hidden="true"
    />
  );

  return (
    <button
      type="button"
      className={`${styles.missionStatusButton} ${styles[`missionStatus_${status}`]}`}
      disabled={presentation.disabled}
      onClick={onClick}
    >
      {presentation.iconFirst ? icon : null}
      <span>{presentation.label}</span>
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
      <h2>Claim Reward</h2>
      <div className={styles.claimRewardAmount}>
        <strong>{reward}</strong>
        <span>R Diamonds</span>
      </div>
      <button type="button" className={styles.claimNowButton} onClick={onClaim}>
        Claim Now
      </button>
      <div className={styles.claimRewardNotice}>
        <img src="/campaign/claim-alert.svg" alt="" aria-hidden="true" />
        <div className={styles.claimRewardNoticeCopy}>
          <p>
            R Diamonds <strong>must be claimed manually.</strong>
          </p>
          <p>Completed missions do not auto-credit rewards.</p>
        </div>
      </div>
    </ModalWithPortal>
  );
}

function MissionSubmitModal({
  mission,
  onClose,
  onContinue,
}: {
  mission: Mission | null;
  onClose: () => void;
  onContinue: (xUrl: string) => void;
}) {
  const [xUrl, setXUrl] = useState("");
  const reward = mission?.reward ?? "+0";

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
      <button type="button" className={styles.missionSubmitClose} aria-label="Close" onClick={onClose}>
        <img src="/campaign/submit-close.svg" alt="" aria-hidden="true" />
      </button>

      <header className={styles.missionSubmitHeader}>
        <h2>{mission?.title ?? "Mission"}</h2>
        <p>{mission?.description}</p>
      </header>

      <section className={styles.missionSubmitSteps} aria-labelledby="mission-submit-steps-title">
        <h3 id="mission-submit-steps-title">How to complete</h3>
        <ol>
          <li>Open your X profile</li>
          <li>Add 🪨ROCKY to your name</li>
          <li>Return and verify</li>
        </ol>
      </section>

      <div className={styles.missionSubmitDetails}>
        <label>
          <span>Your X URL</span>
          <input
            type="url"
            value={xUrl}
            onChange={(event) => setXUrl(event.target.value)}
            placeholder="Https://X.Com/Username/Status/."
          />
        </label>

        <div className={styles.missionSubmitReward}>
          <img src="/campaign/submit-reward-icon.png" alt="" aria-hidden="true" />
          <span>{reward}</span>
          <span>R Diamonds</span>
        </div>
      </div>

      <div className={styles.missionSubmitActions}>
        <button type="button" className={styles.missionSubmitCancel} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.missionSubmitPrimary} onClick={() => onContinue(xUrl)}>
          <span>Open X</span>
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
  isVisible,
  onClose,
  onSubmit,
}: {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (postUrl: string) => void;
}) {
  const [postUrl, setPostUrl] = useState("");
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setPostUrl("");
      setShowError(false);
    }
  }, [isVisible]);

  const submitPost = () => {
    if (!isValidXPostUrl(postUrl)) {
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
      <button type="button" className={styles.originalPostModalClose} aria-label="Close" onClick={onClose}>
        <img src="/campaign/submit-close.svg" alt="" aria-hidden="true" />
      </button>

      <header className={styles.originalPostSubmitHeader}>
        <h2>Submit Your Post</h2>
        <p>Submit your original post on X to earn R Diamonds.</p>
      </header>

      <ol className={styles.originalPostSubmitSteps} aria-label="Submission progress">
        <li className={styles.originalPostSubmitStepActive}>
          <span>1</span>
          <strong>Paste Link</strong>
        </li>
        <img src="/campaign/post-submit-line-active.svg" alt="" aria-hidden="true" />
        <li>
          <span>2</span>
          <strong>Verify</strong>
        </li>
        <img src="/campaign/post-submit-line-muted.svg" alt="" aria-hidden="true" />
        <li>
          <span>3</span>
          <strong>Confirm</strong>
        </li>
      </ol>

      <label className={styles.originalPostUrlField}>
        <span>X Post Link</span>
        <small>Paste the link to your original post on X (Twitter).</small>
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
        {showError ? <em>Please enter a valid public X post link.</em> : null}
      </label>

      <section className={styles.originalPostRequirements}>
        <h3>
          <img src="/campaign/post-submit-alert.svg" alt="" aria-hidden="true" />
          Requirements
        </h3>
        <ul>
          {ORIGINAL_POST_REQUIREMENTS.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>

      <div className={styles.originalPostSubmitActions}>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={submitPost}>
          <span>Submit</span>
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
            <h2>Post Not Approved</h2>
            <p>
              Your post did not meet our requirements.
              <br />
              Please check the reason below and try again.
            </p>
          </header>
          <section className={styles.originalPostRejectReason}>
            <strong>Reason</strong>
            <p>Content is not related to Rocky or Canton.</p>
          </section>
          <button type="button" className={styles.originalPostResultButton} onClick={onRetry}>
            Try Again
          </button>
        </>
      ) : (
        <>
          <header className={styles.originalPostResultHeader}>
            <h2>Reward Claimed!</h2>
            <p>
              Your R Diamonds have been claimed successfully.
              <br />
              The reward has been added to your account.
            </p>
          </header>
          <section className={styles.originalPostRewardResult}>
            <div>
              <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
              <span>
                <strong>+{reward}</strong>
                <small>R Diamonds</small>
              </span>
            </div>
            <span>Claim Complete</span>
            <p>Your qualified post reward is now complete.</p>
          </section>
          <button type="button" className={styles.originalPostResultButton} onClick={onClose}>
            Done
          </button>
        </>
      )}
    </ModalWithPortal>
  );
}

function OriginalPostsModule() {
  const [status, setStatus] = useState<OriginalPostStatus>("idle");
  const [dialog, setDialog] = useState<OriginalPostDialog>(null);
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const reviewTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (reviewTimerRef.current !== null) window.clearTimeout(reviewTimerRef.current);
    },
    []
  );

  const handleSubmit = () => {
    setDialog(null);
    setStatus("pending");

    reviewTimerRef.current = window.setTimeout(() => {
      const shouldReject = new URLSearchParams(window.location.search).get("postReview") === "rejected";
      setStatus(shouldReject ? "rejected" : "claimable");
      if (shouldReject) setDialog("rejected");
    }, 2200);
  };

  const handleAction = () => {
    if (status === "idle") {
      setDialog("submit");
      return;
    }

    if (status === "claimable") {
      setQualifiedCount((count) => Math.min(count + 1, ORIGINAL_POST_REWARDS.length));
      setStatus("claimed");
      setDialog("claimed");
      return;
    }

    if (status === "rejected") setDialog("rejected");
  };

  const statusPresentation: Record<OriginalPostStatus, { label: string; icon?: string }> = {
    idle: { label: "Submit Post", icon: "/campaign/original-post-arrow.svg" },
    pending: { label: "Pending", icon: "/campaign/status-pending.svg" },
    claimable: { label: "Claim", icon: "/campaign/original-post-arrow.svg" },
    claimed: { label: "Claimed", icon: "/campaign/status-claimed.svg" },
    rejected: { label: "Rejected", icon: "/campaign/status-retry.svg" },
  };
  const action = statusPresentation[status];
  const displayedRewards = ORIGINAL_POST_REWARDS.slice(0, qualifiedCount).reduce(
    (total, post) => total + post.reward,
    0
  );
  const nextReward = ORIGINAL_POST_REWARDS[qualifiedCount]?.reward ?? 0;
  const isDailyComplete = qualifiedCount === ORIGINAL_POST_REWARDS.length;

  return (
    <section className={styles.originalPostsModule} aria-labelledby="original-posts-title">
      <header className={styles.originalPostsHeader}>
        <div>
          <h2 id="original-posts-title">Original Posts</h2>
          <span>Up to 2 / day • cumulative</span>
        </div>
        <p>Earn cumulative R Diamonds from qualified original posts each day.</p>
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
                    <small>Post {post.id}</small>
                    <strong className={isCompleted ? styles.originalPostEarned : ""}>+{post.reward}</strong>
                    <small>R Diamonds</small>
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.originalPostsReset}>
            <img src="/campaign/original-post-baseline.svg" alt="" aria-hidden="true" />
            <p>Daily progress resets at 00:00 UTC.</p>
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
              <small>Qualified Today</small>
            </span>
            <span className={styles.originalPostStatDivider} aria-hidden="true">
              <img src="/campaign/original-post-stat-divider.svg" alt="" />
            </span>
            <span className={styles.originalPostStat}>
              <span>
                <strong>{displayedRewards}</strong>
                <em>/ 400</em>
              </span>
              <small>R Diamonds Earned</small>
            </span>
          </div>

          <div className={styles.originalPostNextReward}>
            <div>
              <small>{isDailyComplete ? "Daily Complete" : "Next Reward"}</small>
              <strong>{isDailyComplete ? "2 / 2" : `+${nextReward}`}</strong>
              <span>
                <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
                {isDailyComplete ? "Rewards Claimed" : "R Diamonds"}
              </span>
            </div>
            <button
              type="button"
              className={`${styles.originalPostSubmitButton} ${styles[`originalPostSubmitButton_${status}`]}`}
              disabled={status === "pending" || status === "claimed"}
              onClick={handleAction}
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
        isVisible={dialog === "submit"}
        onClose={() => setDialog(null)}
        onSubmit={handleSubmit}
      />
      {dialog === "claimed" || dialog === "rejected" ? (
        <OriginalPostResultModal
          mode={dialog}
          reward={ORIGINAL_POST_REWARDS[Math.max(qualifiedCount - 1, 0)].reward}
          onClose={() => {
            setDialog(null);
            if (!isDailyComplete) setStatus("idle");
          }}
          onRetry={() => {
            setStatus("idle");
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
  const [isXConnected, setIsXConnected] = useState(false);
  const timersRef = useRef<number[]>([]);
  const submittedUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const updateTaskStatus = (missionId: string, status: TaskStatus) => {
    setTaskStatuses((current) => ({ ...current, [missionId]: status }));
  };

  const scheduleTaskStatus = (missionId: string, status: TaskStatus, delay: number) => {
    const timer = window.setTimeout(() => updateTaskStatus(missionId, status), delay);
    timersRef.current.push(timer);
  };

  const handleMissionAction = (mission: Mission) => {
    const status = taskStatuses[mission.id];

    if (status === "not_started") {
      if (mission.id === "nickname-rocky") {
        setSubmitMission(mission);
        return;
      }

      updateTaskStatus(mission.id, "verifying");
      return;
    }

    if (status === "verifying" || status === "retry") {
      updateTaskStatus(mission.id, "pending");
      scheduleTaskStatus(mission.id, "claimable", 1200);
      return;
    }

    if (status === "claimable") {
      setClaimMission(mission);
    }
  };

  const handleClaim = () => {
    if (!claimMission) return;
    const missionId = claimMission.id;
    setClaimMission(null);
    updateTaskStatus(missionId, "claiming");
    scheduleTaskStatus(missionId, "claimed", 1000);
  };

  const handleMissionSubmit = (xUrl: string) => {
    if (!submitMission) return;
    const missionId = submitMission.id;
    submittedUrlsRef.current[missionId] = xUrl.trim();
    setSubmitMission(null);
    updateTaskStatus(missionId, "verifying");
    window.open("https://x.com/settings/profile", "_blank", "noopener,noreferrer");
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
          onClick={() => setIsXConnected((connected) => !connected)}
        >
          <span>{isXConnected ? "X Connected" : "Connect X"}</span>
          {!isXConnected ? <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" /> : null}
        </button>
      </div>

      <div className={styles.progressOverview}>
        <span>Your Progress</span>
        <span
          className={styles.progressTrack}
          role="img"
          aria-label={`${completedCount} of ${MISSIONS.length} missions completed`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span className={index < completedCount ? styles.completedProgressStep : ""} key={index} />
          ))}
        </span>
        <span className={styles.progressValue}>
          <strong>{completedCount}</strong> / {MISSIONS.length}
        </span>
        <span>Claimable</span>
      </div>

      <div className={styles.missionList}>
        {MISSIONS.map((mission, index) => (
          <article className={styles.missionRow} key={mission.title}>
            <span className={styles.missionNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.missionIcon}>
              {mission.icon ? <img src={mission.icon} alt="" aria-hidden="true" /> : mission.iconText}
            </span>
            <span className={styles.missionCopy}>
              <strong>{mission.title}</strong>
              <small>{mission.description}</small>
            </span>
            <span className={styles.missionReward}>
              <DiamondAmount>{mission.reward}</DiamondAmount>
              <small>R Diamonds</small>
            </span>
            <MissionStatusButton status={taskStatuses[mission.id]} onClick={() => handleMissionAction(mission)} />
          </article>
        ))}
      </div>

      <OriginalPostsModule />

      <ClaimRewardModal mission={claimMission} onClaim={handleClaim} onClose={() => setClaimMission(null)} />
      <MissionSubmitModal
        mission={submitMission}
        onClose={() => setSubmitMission(null)}
        onContinue={handleMissionSubmit}
      />

      <aside className={styles.rules}>
        <h2>
          <img src="/campaign/alert.svg" alt="" aria-hidden="true" />
          Important Note
        </h2>
        <ul>
          <li>Complete each mission using the connected wallet.</li>
          <li>Social content must relate to Rocky, Canton, or the Beta campaign.</li>
          <li>R Diamonds are relative contribution records and must be claimed manually.</li>
          <li>Fraudulent, copied, or automated submissions may be rejected.</li>
        </ul>
      </aside>
    </section>
  );
}

function LeaderboardContent() {
  const [currentPage, setCurrentPage] = useState(2);
  const totalPages = Math.ceil(LEADERBOARD.length / LEADERBOARD_PAGE_SIZE);
  const pageEntries = LEADERBOARD.slice((currentPage - 1) * LEADERBOARD_PAGE_SIZE, currentPage * LEADERBOARD_PAGE_SIZE);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  };

  return (
    <section className={`${styles.content} ${styles.leaderboardContent}`}>
      <SectionHeading title="Ranking" description="Qualified accounts ranked by trading volume" />

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader} aria-hidden="true">
          <span>Rank</span>
          <span>User</span>
          <span>Volume (USD)</span>
          <span>Est. R Diamonds Reward</span>
        </div>

        <div className={styles.leaderboard} role="table" aria-label="Season 0 leaderboard">
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

      <nav className={styles.pagination} aria-label="Leaderboard pages">
        <button
          type="button"
          aria-label="Previous page"
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
            aria-label={`Page ${page}`}
            onClick={() => goToPage(page)}
            key={page}
          >
            {String(page).padStart(2, "0")}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={currentPage === totalPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          <img src="/campaign/chevron-right.svg" alt="" aria-hidden="true" />
        </button>
      </nav>

      <section className={styles.rewards}>
        <h2>
          <img src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
          Top 50 Rewards
        </h2>
        <div className={styles.rewardTiers}>
          {REWARD_TIERS.map((tier) => (
            <div className={styles.rewardTier} key={tier.label}>
              <span className={styles[tier.tone]}>{tier.label}</span>
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
          Ranking Rules
        </h2>
        <ul>
          <li>
            This is a real-funds trading competition. Only eligible accounts enter the leaderboard, ranked by total
            qualified trading volume in descending order.
          </li>
          <li>
            Eligibility requires time-weighted average equity of at least $200, at least $2,000 in qualified notional
            trading volume, 10 effective trades, and activity on 2 or more trading days.
          </li>
          <li>
            Wash trading, related-account self-dealing, and other abnormal activity are excluded and may result in
            disqualification.
          </li>
          <li>
            The leaderboard closes at 24:00 UTC+8 on Day 14. Only qualifying trades completed before the deadline count
            toward the final volume ranking.
          </li>
          <li>
            The Top 50 share 56,500,000 R Diamonds by the tiers above. Traders with at least 10 effective trades across
            2 trading days who finish outside the Top 50 receive 500 R Diamonds.
          </li>
        </ul>
      </aside>
    </section>
  );
}

function ComingSoon() {
  return (
    <div className={styles.comingSoon}>
      <img src="/campaign/lock.svg" alt="" aria-hidden="true" />
      <span>Coming Soon</span>
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
  const referralLink = "Https://xxxxxx.xxxxx.xxx.xxxxxxx";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className={`${styles.content} ${styles.rewardsContent}`}>
      <SectionHeading title="My Rewards" description="Track your rewards, status, and exclusive benefits." />

      <div className={styles.rewardDashboard}>
        <article className={`${styles.dashboardCard} ${styles.diamondCard}`}>
          <h3>
            R Diamonds<small>（Reward Breakdown）</small>
          </h3>
          <img className={styles.dashboardArtwork} src="/campaign/r-diamond.png" alt="" aria-hidden="true" />
          <div className={styles.diamondStats}>
            <div className={styles.totalRewardLabel}>
              <span className={styles.metricLabel}>Total Rewards</span>
              <RewardInfoTooltip
                ariaLabel="About total rewards"
                content="Earned from missions and campaign participation."
              />
            </div>
            <strong className={styles.totalRewards}>2,000</strong>
            <div className={styles.rewardBreakdown}>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>Task Rewards</small>
                  <RewardInfoTooltip ariaLabel="About task rewards" content="Earned from missions." />
                </span>
                <strong>900</strong>
              </span>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>Campaign Rewards</small>
                  <RewardInfoTooltip
                    ariaLabel="About campaign rewards"
                    content={
                      <>
                        <span className={styles.rewardTooltipMuted}>CLAIMED</span>
                        <span> 750 R Diamonds</span>
                      </>
                    }
                  />
                </span>
                <strong>1,100</strong>
              </span>
              <span>
                <span className={styles.breakdownRewardLabel}>
                  <small>Referral Rewards</small>
                  <RewardInfoTooltip ariaLabel="About referral rewards" content="Earned from successful referrals." />
                </span>
                <strong>900</strong>
              </span>
            </div>
            <div className={styles.claimPanel}>
              <span>
                <small>Claimable</small>
                <strong>1,250</strong>
              </span>
              <button type="button" className={styles.primaryButton}>
                Claim
                <img src="/campaign/arrow-up-right.svg" alt="" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.pointsCard}`}>
          <h3>R Points (Future)</h3>
          <div className={styles.pointsBody}>
            <img src="/campaign/r-points.png" alt="" aria-hidden="true" />
            <span>
              <small className={styles.metricLabel}>Total R Points</small>
              <strong>0</strong>
            </span>
          </div>
          <ComingSoon />
        </article>

        <article className={`${styles.dashboardCard} ${styles.referralsCard}`}>
          <h3>Your Referrals</h3>
          <div className={styles.referralMetrics}>
            <span className={styles.earnedMetric}>
              <strong>
                0.00
                <img src="/campaign/r-diamond.png" alt="R Diamonds" />
              </strong>
              <small>Total Earned --</small>
            </span>
            <span>
              <strong>0</strong>
              <small>Total Referred Users</small>
            </span>
            <span>
              <strong className={styles.coolMetric}>10%</strong>
              <small>Reward Rate</small>
            </span>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.referralLinkCard}`}>
          <h3>Your Referral Link</h3>
          <div className={styles.copyRow}>
            <span>{referralLink}</span>
            <button type="button" onClick={handleCopy} aria-label="Copy referral link">
              <img src="/campaign/copy.svg" alt="" aria-hidden="true" />
            </button>
          </div>
          <div className={styles.copyRow}>
            <span>
              Code: <strong>GLZ885</strong>
            </span>
            <button type="button" onClick={handleCopy} aria-label="Copy referral code">
              <img src="/campaign/copy.svg" alt="" aria-hidden="true" />
            </button>
          </div>
          <button type="button" className={styles.copyButton} onClick={handleCopy}>
            <img src="/campaign/share.svg" alt="" aria-hidden="true" />
            {copied ? "Copied" : "Copy Link"}
          </button>
        </article>

        <article className={`${styles.dashboardCard} ${styles.howItWorksCard}`}>
          <h3>How It Works</h3>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Share Your Link</strong>
                <small>Copy and share your unique referral link.</small>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Friends Join</strong>
                <small>They sign up and start earning using your link.</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Earn Rewards</strong>
                <small>Get 10% R Diamonds</small>
              </div>
            </li>
          </ol>
        </article>

        <article className={`${styles.dashboardCard} ${styles.badgeCard}`}>
          <h3>Badges</h3>
          <div className={styles.badgeBody}>
            <span className={styles.badgeArtwork}>
              <img src="/campaign/og-badge.png" alt="Rocky OG badge" />
              <small>OG Badges · Rare</small>
            </span>
            <span className={styles.badgeCopy}>
              <strong>
                Eligible
                <img src="/campaign/eligible-check.svg" alt="" aria-hidden="true" />
              </strong>
              <p>Eligible OG users will receive the badge after the activity review.</p>
              <em>Limited 102/500</em>
              <small>Learn More →</small>
            </span>
          </div>
        </article>

        <article className={`${styles.dashboardCard} ${styles.ccCard}`}>
          <h3>CC Rewards</h3>
          <p>Specific ratios, schedules, and conditions are subject to the final announcement.</p>
          <div className={styles.ccBody}>
            <img src="/campaign/cc-chest.png" alt="" aria-hidden="true" />
            <span>
              {["Redemption ratio", "Unlock schedule", "Eligibility"].map((item) => (
                <span className={styles.ccLine} key={item}>
                  <img src="/campaign/reward-bullet.png" alt="" aria-hidden="true" />
                  <span>{item}</span>
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

  useEffect(() => {
    document.documentElement.classList.add("campaign-active");
    document.body.classList.add("lighter-active");
    return () => {
      document.documentElement.classList.remove("campaign-active");
      document.body.classList.remove("lighter-active");
    };
  }, []);

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
        <CampaignHero activeTab={activeTab} onTabChange={handleTabChange} />

        <nav className={styles.campaignTabs} aria-label="Campaign sections">
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
                {isActive ? `[ ${label} ]` : label}
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
