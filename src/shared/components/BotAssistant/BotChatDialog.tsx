import { Trans } from "@lingui/macro";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import CloseIcon from "img/ic_close.svg?react";
import ArrowRightIcon from "img/ic_arrow_right.svg?react";
import botActive from "img/bot/bot_active.png";

type BotChatDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

const DIALOG_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

const TRANSITION = { duration: 0.2, ease: "easeOut" };

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm your trading assistant. How can I help you today?",
  timestamp: Date.now(),
};

export function BotChatDialog({ isOpen, onClose }: BotChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState("");

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
    },
    []
  );

  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputValue("");

    // Simulate assistant response (placeholder for future AI integration)
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content:
          "Thanks for your message! This feature is coming soon. Our team is working on integrating AI assistance.",
        timestamp: Date.now(),
      };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);
    }, 1000);
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const stopPropagation = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000]"
          onClick={onClose}
        >
          <motion.div
            className="absolute bottom-24 right-24 flex w-[380px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-16 border border-slate-700 bg-slate-900 shadow-2xl"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={DIALOG_VARIANTS}
            transition={TRANSITION}
            onClick={stopPropagation}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-16 py-12">
              <div className="flex items-center gap-10">
                <img src={botActive} alt="Bot" className="size-32" />
                <div>
                  <div className="text-14 font-medium text-typography-primary">
                    <Trans>Trading Assistant</Trans>
                  </div>
                  <div className="text-12 text-green-400">
                    <Trans>Online</Trans>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full p-4 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
                onClick={onClose}
                aria-label="Close"
              >
                <CloseIcon className="size-20" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex h-[400px] flex-col gap-12 overflow-y-auto p-16">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-slate-700 p-12">
              <div className="flex items-center gap-8 rounded-8 bg-slate-800 px-12 py-8">
                <input
                  type="text"
                  className="flex-1 bg-transparent text-14 text-typography-primary placeholder:text-slate-500 outline-none"
                  placeholder="Type a message..."
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />
                <button
                  type="button"
                  className={cx(
                    "rounded-full p-6 transition-colors",
                    inputValue.trim()
                      ? "bg-green-500 text-white hover:bg-green-600"
                      : "bg-slate-700 text-slate-500"
                  )}
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  aria-label="Send message"
                >
                  <ArrowRightIcon className="size-16" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

type MessageBubbleProps = {
  message: ChatMessage;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cx("flex", {
        "justify-start": isAssistant,
        "justify-end": !isAssistant,
      })}
    >
      <div
        className={cx("max-w-[80%] rounded-12 px-12 py-8 text-14", {
          "bg-slate-800 text-typography-primary": isAssistant,
          "bg-green-600 text-white": !isAssistant,
        })}
      >
        {message.content}
      </div>
    </div>
  );
}

export default BotChatDialog;
