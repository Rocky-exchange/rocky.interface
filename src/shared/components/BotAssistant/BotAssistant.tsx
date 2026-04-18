import { Trans } from "@lingui/macro";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import botDefault from "img/bot/bot.png";
import botActive from "img/bot/bot_active.png";

import { BotChatDialog } from "./BotChatDialog";

type BotAssistantProps = {
  className?: string;
};

const BUBBLE_VARIANTS = {
  hidden: { opacity: 0, scale: 0.8, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

const TRANSITION = { duration: 0.2, ease: "easeOut" };

export function BotAssistant({ className }: BotAssistantProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleClick = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  return (
    <>
      <div
        className={cx(
          "fixed bottom-80 right-24 z-[1001]",
          className
        )}
      >
        {/* Bubble tooltip - absolute positioned above the bot, right-aligned */}
        <AnimatePresence>
          {isHovered && !isDialogOpen && (
            <motion.div
              className="absolute bottom-full right-0 mb-8 whitespace-nowrap rounded-8 bg-slate-800 px-16 py-10 text-14 text-typography-primary shadow-lg border border-slate-700"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={BUBBLE_VARIANTS}
              transition={TRANSITION}
            >
              <Trans>Need some help?</Trans>
              {/* Triangle pointer */}
              <div className="absolute -bottom-6 right-16 w-0 h-0 border-l-6 border-r-6 border-t-6 border-l-transparent border-r-transparent border-t-slate-800" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bot icon button */}
        <button
          type="button"
          className="cursor-pointer transition-transform duration-200 hover:scale-110"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          aria-label="Open assistant"
        >
          <img
            src={isHovered ? botActive : botDefault}
            alt="Bot Assistant"
            className="size-56"
          />
        </button>
      </div>

      {/* Chat dialog */}
      <BotChatDialog isOpen={isDialogOpen} onClose={handleCloseDialog} />
    </>
  );
}

export default BotAssistant;
