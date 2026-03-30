"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Paperclip, Send, ChevronRight } from "lucide-react";
import type { ChatMessage, ClientChatMessage } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import dynamic from "next/dynamic";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

// ChatMessage    = DB-stored message shape (from lib/types)
// ClientChatMessage = runtime UI message with id + Date timestamp (from lib/types)

interface ChatClientProps {
  userProfile?: string;
  userName: string;
  planTier: string;
  conversationId?: string;
  initialMessages?: ChatMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLACEHOLDERS = [
  "What tasks do I have today?",
  "Create a task for…",
  "Show me what's blocked",
  "Summarise this week",
  "What's due tomorrow?",
  "Draft a standup update",
];

const SUGGESTED_PROMPTS = [
  "What tasks do I have in progress?",
  "Create a task: Review API documentation",
  "Show me my blocked tasks",
  "Mark all done tasks from yesterday",
];

const LOADING_WORDS = [
  "Cooking",
  "Pondering",
  "Analysing",
  "Drafting",
  "Building",
  "Processing",
  "Plotting",
  "Actioning",
];

// ─── Animated SVG Loader ──────────────────────────────────────────────────────

const LOADER_KEYFRAMES = `
  @keyframes drawStroke {
    0% { stroke-dashoffset: var(--path-length); animation-timing-function: ease-in-out; }
    50% { stroke-dashoffset: 0; animation-timing-function: ease-in-out; }
    100% { stroke-dashoffset: calc(var(--path-length) * -1); }
  }
  @keyframes textShimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
`;

let _cachedPathLength = 0;
let _stylesInjected = false;

function AnimatedLoader({ size = 16 }: { size?: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(_cachedPathLength);

  useEffect(() => {
    if (!_stylesInjected) {
      _stylesInjected = true;
      const style = document.createElement("style");
      style.innerHTML = LOADER_KEYFRAMES;
      document.head.appendChild(style);
    }
    if (!_cachedPathLength && pathRef.current) {
      _cachedPathLength = pathRef.current.getTotalLength();
      setPathLength(_cachedPathLength);
    }
  }, []);

  return (
    <svg viewBox="0 0 19 19" fill="none" width={size} height={size} className="text-white/55 flex-shrink-0">
      <path
        ref={pathRef}
        d="M4.43431 2.42415C-0.789139 6.90104 1.21472 15.2022 8.434 15.9242C15.5762 16.6384 18.8649 9.23035 15.9332 4.5183C14.1316 1.62255 8.43695 0.0528911 7.51841 3.33733C6.48107 7.04659 15.2699 15.0195 17.4343 16.9241"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        style={
          pathLength > 0
            ? ({ strokeDasharray: pathLength, "--path-length": pathLength } as React.CSSProperties)
            : undefined
        }
        className={pathLength > 0 ? "opacity-100 animate-[drawStroke_2.5s_infinite]" : "opacity-0"}
      />
    </svg>
  );
}

// ─── Loading Breadcrumb ───────────────────────────────────────────────────────

function LoadingBreadcrumb() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % LOADING_WORDS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-[14px] font-medium">
      <AnimatedLoader size={16} />
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.38) 38%, rgba(255,255,255,0.92) 50%, rgba(255,255,255,0.38) 62%, rgba(255,255,255,0.38) 100%)",
          backgroundSize: "200% auto",
          animation: "textShimmer 2.5s ease-in-out infinite",
        }}
      >
        {LOADING_WORDS[wordIndex]}
      </span>
      <ChevronRight size={13} className="text-white/22" strokeWidth={2} />
    </div>
  );
}

// ─── Animated Chat Input ──────────────────────────────────────────────────────

const letterVariants = {
  initial: { opacity: 0, filter: "blur(10px)", y: 8 },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: {
      opacity: { duration: 0.22 },
      filter: { duration: 0.35 },
      y: { type: "spring" as const, stiffness: 80, damping: 20 },
    },
  },
  exit: {
    opacity: 0,
    filter: "blur(10px)",
    y: -8,
    transition: {
      opacity: { duration: 0.18 },
      filter: { duration: 0.28 },
      y: { type: "spring" as const, stiffness: 80, damping: 20 },
    },
  },
};

interface AIChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

function AIChatInput({ value, onChange, onSend, onKeyDown, disabled, textareaRef }: AIChatInputProps) {
  const [isActive, setIsActive] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    if (isActive || value) return;
    const id = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 380);
    }, 3000);
    return () => clearInterval(id);
  }, [isActive, value]);

  const expanded = isActive || !!value;

  return (
    <motion.div
      className="w-full max-w-2xl rounded-[28px] bg-white/[0.07] border border-white/[0.10] overflow-hidden cursor-text"
      style={{
        boxShadow: expanded
          ? "0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.5)"
          : "0 0 0 1px rgba(255,255,255,0.08)",
      }}
      animate={{ height: expanded ? 96 : 56 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      onClick={() => { setIsActive(true); textareaRef.current?.focus(); }}
    >
      {/* Input row */}
      <div className="flex items-center gap-1 px-2 h-14 flex-shrink-0">
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          aria-label="Attach file"
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all duration-[120ms] disabled:opacity-30"
        >
          <Paperclip size={17} strokeWidth={1.75} />
        </button>

        {/* Textarea + animated placeholder */}
        <div className="relative flex-1 h-full flex items-center">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsActive(true)}
            onBlur={() => { if (!value) setIsActive(false); }}
            disabled={disabled}
            rows={1}
            className="relative z-10 w-full bg-transparent border-none outline-none resize-none text-[15px] text-white leading-relaxed py-0 disabled:opacity-40"
            style={{ minHeight: 24, maxHeight: 64 }}
          />

          {/* Animated placeholder */}
          {!value && !isActive && (
            <div className="absolute inset-0 flex items-center pointer-events-none">
              <AnimatePresence mode="wait">
                {showPlaceholder && (
                  <motion.span
                    key={placeholderIndex}
                    className="text-[15px] text-white/30 select-none whitespace-nowrap"
                    variants={{
                      initial: {},
                      animate: { transition: { staggerChildren: 0.022 } },
                      exit: { transition: { staggerChildren: 0.012, staggerDirection: -1 } },
                    }}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {PLACEHOLDERS[placeholderIndex].split("").map((char, i) => (
                      <motion.span key={i} variants={letterVariants} style={{ display: "inline-block" }}>
                        {char === " " ? "\u00A0" : char}
                      </motion.span>
                    ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-[120ms]"
        >
          <Send size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Hint when expanded */}
      <motion.p
        className="text-center text-[11px] text-white/25 pb-2 leading-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: 0.18, delay: expanded ? 0.1 : 0 }}
      >
        Enter to send · Shift+Enter for new line
      </motion.p>
    </motion.div>
  );
}

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

function SuggestionChips({ onSelect }: { onSelect: (p: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-2xl w-full px-2">
      {SUGGESTED_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="text-[13px] text-white/60 border border-white/[0.14] rounded-full px-3.5 py-1.5 hover:bg-white/[0.06] hover:text-white/88 hover:border-white/25 transition-all duration-[120ms] leading-snug"
          style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ClientChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-semibold ${
          isUser
            ? "bg-white text-black"
            : "border border-white/[0.14]"
        }`}
      >
        {isUser ? "U" : (
          <img src="/assets/khove-white.png" alt="Khove" className="w-3.5 h-3.5 object-contain" draggable={false} />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        {isUser ? (
          <div className="inline-block bg-white/[0.08] text-white text-[14px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-tr-md max-w-[78%]">
            {message.content}
          </div>
        ) : (
          <div className="text-[14px] text-white/88 leading-relaxed max-w-2xl">
            <MessageContent content={message.content} />
          </div>
        )}

        <div className={`flex items-center gap-2 mt-1 ${isUser ? "flex-row-reverse" : ""}`}>
          <span className="text-[10px] text-white/22">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.model && (
            <span className="text-[10px] text-white/20 font-mono">{message.model}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Message Content (markdown) ───────────────────────────────────────────────

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("# "))  return <p key={i} className="font-semibold text-white text-base">{line.slice(2)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="font-medium text-white">{line.slice(3)}</p>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-white/30 mt-0.5 flex-shrink-0">·</span>
              <span>{formatInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-[12px] bg-white/[0.08] px-1.5 py-0.5 rounded text-white/80">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ChatClient({ userName, conversationId: initialConvId, initialMessages = [] }: ChatClientProps) {
  const workspace = useWorkspace();
  const [messages, setMessages] = useState<ClientChatMessage[]>(() =>
    initialMessages.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    }))
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConvId);
  const [isBlocked, setIsBlocked] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const splineContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Make the Spline bot react when the user types — dispatch synthetic mousemove
  useEffect(() => {
    if (!input || !splineContainerRef.current) return;
    const el = splineContainerRef.current;
    const rect = el.getBoundingClientRect();
    // Nudge position slightly based on input length so the bot keeps moving
    const jitter = (input.length * 13) % 80;
    el.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: rect.left + rect.width / 2 + (jitter - 40),
      clientY: rect.top + rect.height / 2 - 20,
    }));
  }, [input]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const fiveLineHeight = 122; // 15px font × 1.625 leading-relaxed × 5 lines
    const newHeight = Math.min(ta.scrollHeight, fiveLineHeight);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = ta.scrollHeight > fiveLineHeight ? "auto" : "hidden";
  }, [input]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: new Date() },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId, workspaceId: workspace.id }),
      });
      const data = await res.json();

      if (data.blocked) setIsBlocked(true);
      if (data.conversationId) setConversationId(data.conversationId);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response ?? "Something went wrong. Please try again.",
          timestamp: new Date(),
          model: data.model,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Network error. Please check your connection and try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [isLoading, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Messages / empty state */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-between py-10 px-6">
            {/* Centre greeting */}
            <div className="flex-1 relative flex flex-col items-center justify-center text-center">
              {/* Spline scene — absolute, centered, behind text */}
              <div
                ref={splineContainerRef}
                className="absolute inset-0 flex items-center justify-center overflow-hidden z-0"
              >
                <div className="w-[700px] h-[700px] flex-shrink-0">
                  <Spline style={{scale: .8}}  scene="https://prod.spline.design/oJJP0xwASvkGC4IM/scene.splinecode" />
                </div>
              </div>
              {/* Text — sits on top of the scene */}
              <div className="relative z-10 flex flex-col items-center mt-52">
                <h1 className="text-[28px] font-semibold text-white tracking-tight mb-2">
                  Hey {userName.split(" ")[0]}
                </h1>
                <p className="text-[15px] text-white/45 leading-relaxed">
                  What do you want to get done today?
                </p>
              </div>
            </div>

            {/* Bottom: chips → input */}
            <div className="flex flex-col items-center gap-4 w-full">
              <SuggestionChips onSelect={(p) => sendMessage(p)} />
              <AIChatInput
                value={input}
                onChange={setInput}
                onSend={() => sendMessage(input)}
                onKeyDown={handleKeyDown}
                disabled={isLoading || isBlocked}
                textareaRef={textareaRef}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex gap-3 items-center">
                <div className="w-6 h-6 rounded-full flex-shrink-0 border border-white/[0.14] flex items-center justify-center text-[10px] font-semibold text-white/40">
                  K
                </div>
                <LoadingBreadcrumb />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Blocked banner */}
      {isBlocked && (
        <div className="w-full flex justify-center">
          <div className="mx-6 mb-3 w-full max-w-2xl px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-[13px] text-white/55 flex items-center gap-2">
            <span className="text-white/35">⚠</span>
            <span>Monthly message limit reached. Upgrade your plan to continue.</span>
          </div>
        </div>
      )}

      {/* Input bar (conversation mode) */}
      {!isEmpty && (
        <div className="px-6 pb-6 pt-2 flex justify-center">
          <AIChatInput
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || isBlocked}
            textareaRef={textareaRef}
          />
        </div>
      )}
    </div>
  );
}
