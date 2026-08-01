"use client";

import { useState, useRef, useEffect, useCallback, Children, isValidElement, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Paperclip, Send, ChevronRight, Sparkles, Check, Brain, Wrench, ListTodo, Calendar, GitBranch, Link2, SquareKanban } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ClientChatMessage } from "@/lib/types";
import { useConversations, type StreamState } from "@/lib/conversations/conversations-context";
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

const MAX_INPUT_HEIGHT = 184; // ~7 lines before the textarea scrolls internally

interface AIChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
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
      className="w-full max-w-3xl rounded-[24px] bg-white/[0.07] border border-white/[0.10] cursor-text"
      style={{
        boxShadow: expanded
          ? "0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.5)"
          : "0 0 0 1px rgba(255,255,255,0.08)",
      }}
      transition={{ type: "spring", stiffness: 200, damping: 26 }}
      onClick={() => { setIsActive(true); textareaRef.current?.focus(); }}
    >
      {/* Input row — items-end keeps the buttons at the bottom as the text grows */}
      <div className="flex items-end gap-1 px-2 pt-1.5 pb-1.5">
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
        <div className="relative flex-1 min-w-0 py-1.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsActive(true)}
            onBlur={() => { if (!value) setIsActive(false); }}
            disabled={disabled}
            rows={1}
            className="block relative z-10 w-full bg-transparent border-none outline-none resize-none text-[15px] text-white leading-relaxed disabled:opacity-40"
            style={{ maxHeight: MAX_INPUT_HEIGHT }}
          />

          {/* Animated placeholder */}
          {!value && !isActive && (
            <div className="absolute inset-x-0 top-1.5 flex items-center pointer-events-none">
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

      {/* Hint when expanded — sits below the text, never overlapping */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
          >
            <p className="text-center text-[11px] text-white/25 leading-none pb-2">
              Enter to send · Shift+Enter for new line
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Suggestion Chips ─────────────────────────────────────────────────────────

function SuggestionChips({ onSelect }: { onSelect: (p: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-3xl w-full px-2">
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

// ─── Process block (AI tool-process trail) ────────────────────────────────────

interface ProcItem {
  kind?: "tool" | "thought";
  label: string;
  detail?: string;
  category?: string;
  done?: boolean;
}

const CATEGORY_ICON: Record<string, typeof Wrench> = {
  tasks: ListTodo,
  calendar: Calendar,
  github: GitBranch,
  jira: SquareKanban,
  threads: Link2,
  other: Wrench,
};

function ProcessRow({ item, streaming }: { item: ProcItem; streaming: boolean }) {
  const isThought = item.kind === "thought";
  const Icon = isThought ? Brain : CATEGORY_ICON[item.category ?? "other"] ?? Wrench;
  const running = streaming && !isThought && !item.done;
  return (
    <div className="flex items-center gap-2 text-[12.5px] py-0.5">
      <Icon size={13} className="text-white/35 flex-shrink-0" />
      <span className="text-white/65 flex-shrink-0">{item.label}</span>
      {item.detail && (
        <span className="text-white/45 bg-white/[0.04] border border-white/[0.07] rounded-md px-1.5 py-[1px] truncate max-w-[320px]">
          {item.detail}
        </span>
      )}
      {running && <span className="w-2.5 h-2.5 rounded-full border border-white/25 border-t-white/70 animate-spin flex-shrink-0" />}
      {!isThought && item.done && <Check size={12} className="text-emerald-400/55 flex-shrink-0" />}
    </div>
  );
}

function ProcessBlock({ items, streaming = false }: { items: ProcItem[]; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const running = streaming ? items.find((i) => !i.done) : undefined;

  return (
    <div className="mb-3 w-full">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white/75 transition-colors">
        <ChevronRight size={14} className={`transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`} />
        {running ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <Sparkles size={12} className="text-violet-300 animate-pulse flex-shrink-0" />
            <span className="truncate text-white/55">
              {running.label}
              {running.detail ? ` · ${running.detail}` : ""}…
            </span>
          </span>
        ) : (
          <span>
            {items.length} step{items.length > 1 ? "s" : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 ml-[6px] pl-3 border-l border-white/[0.08] space-y-0.5">
          {items.map((it, i) => (
            <ProcessRow key={i} item={it} streaming={streaming} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ClientChatMessage }) {
  const isUser = message.role === "user";
  const { user } = useUser();

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center overflow-hidden text-[10px] font-semibold ${
          isUser
            ? "bg-white text-black"
            : "border border-white/[0.14]"
        }`}
      >
        {isUser ? (
          user?.imageUrl ? (
            <img src={user.imageUrl} alt="You" className="w-full h-full object-cover" draggable={false} />
          ) : (
            (user?.firstName?.[0] ?? "U").toUpperCase()
          )
        ) : (
          <img src="/assets/khove-white.png" alt="Khove" className="w-3.5 h-3.5 object-contain" draggable={false} />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        {isUser ? (
          <div className="inline-block bg-white/[0.08] text-white text-[14px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-tr-md max-w-[78%]">
            {message.content}
          </div>
        ) : (
          <div className="text-[15px] text-white/88 leading-7 max-w-3xl">
            {message.steps && message.steps.length > 0 && (
              <ProcessBlock items={message.steps.map((s) => ({ ...s, done: true }))} />
            )}
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

/**
 * Auto-emphasise a leading "Label: explanation" in a bullet so the topic word is
 * always bold, regardless of whether the model wrote `- **Label:** ...` or plain
 * `- Label: ...`. Kept deterministic (renderer-side) so the look is consistent
 * across models. Conservative: only fires on a short, punctuation-free label
 * followed by ": " and more text, and never double-styles a model-bolded lead-in.
 */
function autoLabelBullet(children: ReactNode): ReactNode {
  const nodes = Children.toArray(children);
  if (nodes.length === 0) return children;
  const first = nodes[0];
  // Model already emphasised the lead-in (e.g. **Label:**) — leave it untouched.
  if (isValidElement(first)) return children;
  if (typeof first !== "string") return children;
  const m = first.match(/^([^:\n]{1,40}):[ \t]+(.+)$/);
  if (!m) return children;
  const [, label, rest] = m;
  // Skip false positives: sentence-y prefixes, URLs, or an empty remainder.
  if (/[.!?]$/.test(label.trim()) || /https?$/i.test(label) || !rest) return children;
  return [
    <strong key="__lbl" className="font-semibold text-white">{label}:</strong>,
    ` ${rest}`,
    ...nodes.slice(1),
  ];
}

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-3.5 last:mb-0 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 space-y-2 mb-4 last:mb-0 marker:text-white/30">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 space-y-2 mb-4 last:mb-0 marker:text-white/40">{children}</ol>,
  li: ({ children }) => <li className="leading-7 pl-1">{autoLabelBullet(children)}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/90">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-violet-300 underline underline-offset-2 hover:text-violet-200">
      {children}
    </a>
  ),
  // Clear, well-spaced heading hierarchy — each level is visibly larger than the
  // 15px body and than the level below it, with generous top margin so sections breathe.
  h1: ({ children }) => <h1 className="font-bold text-white text-[24px] leading-tight mt-7 mb-3.5 first:mt-0 pb-2 border-b border-white/[0.1]">{children}</h1>,
  h2: ({ children }) => <h2 className="font-semibold text-white text-[19.5px] leading-snug mt-7 mb-3 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold text-white text-[16.5px] leading-snug mt-5 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="font-semibold text-white/60 text-[12.5px] uppercase tracking-wider mt-4 mb-1.5 first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-400/40 pl-3.5 text-white/70 my-3.5 italic">{children}</blockquote>,
  hr: () => <hr className="border-white/[0.08] my-5" />,
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} text-[13px]`}>{children}</code>
    ) : (
      <code className="font-mono text-[12.5px] bg-white/[0.08] px-1.5 py-0.5 rounded text-violet-200/90">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 overflow-x-auto font-mono my-3 leading-relaxed">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.09]">
      <table className="w-full text-[13.5px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-white/90 border-b border-white/[0.09]">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-white/[0.05] text-white/80 align-top">{children}</td>,
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
};

function MessageContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Smoothly reveals `target` character-by-character while `active` (streaming), so
 * the text types in evenly instead of jumping in network-sized chunks. Catches up
 * proportionally to the backlog so it never lags far behind.
 */
function useSmoothReveal(target: string, active: boolean): string {
  const [shown, setShown] = useState(() => (active ? "" : target));
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (!active) {
      setShown(targetRef.current);
      return;
    }
    const id = window.setInterval(() => {
      setShown((cur) => {
        const t = targetRef.current;
        if (cur.length >= t.length) return t;
        const backlog = t.length - cur.length;
        return t.slice(0, cur.length + Math.max(1, Math.ceil(backlog / 12)));
      });
    }, 20);
    return () => window.clearInterval(id);
  }, [active]);
  return shown;
}

/** The live (streaming) assistant turn — process trail + smoothly-typed markdown. */
function LiveAssistant({ stream }: { stream: StreamState }) {
  const streaming = stream.status === "streaming";
  const revealed = useSmoothReveal(stream.assistantText, streaming);
  return (
    <div className="flex-1 min-w-0">
      {stream.process.length > 0 && <ProcessBlock items={stream.process} streaming={streaming} />}
      {revealed ? (
        <div className="text-[15px] text-white/88 leading-7">
          <MessageContent content={revealed} />
          {streaming && (
            <span className="inline-block align-middle w-[6px] h-[16px] ml-0.5 rounded-[1px] bg-white/50 animate-pulse" />
          )}
        </div>
      ) : stream.process.length === 0 ? (
        <LoadingBreadcrumb />
      ) : null}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ChatClient({ userName, initialMessages = [] }: ChatClientProps) {
  const { activeStream, send, sending } = useConversations();
  const [messages, setMessages] = useState<ClientChatMessage[]>(() =>
    initialMessages.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      model: m.model,
      steps: m.steps,
    }))
  );
  const [input, setInput] = useState("");
  const foldedRef = useRef<StreamState | null>(null);
  const isLoading = sending;

  // Fold a completed live stream into the message list (dedup vs already-loaded history).
  useEffect(() => {
    if (!activeStream || activeStream.status === "streaming") return;
    if (foldedRef.current === activeStream) return;
    foldedRef.current = activeStream;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.content === activeStream.assistantText) return prev;
      return [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: activeStream.userMessage, timestamp: new Date() },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: activeStream.assistantText,
          timestamp: new Date(),
          steps: activeStream.process.map((s) => ({ kind: s.kind, tool: s.tool, label: s.label, detail: s.detail, category: s.category })),
        },
      ];
    });
  }, [activeStream]);

  const showLive = !!activeStream && foldedRef.current !== activeStream;

  const bottomRef = useRef<HTMLDivElement>(null);
  const splineContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeStream]);

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
    const newHeight = Math.min(ta.scrollHeight, MAX_INPUT_HEIGHT);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  }, [input]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    send(trimmed); // provider owns the streaming fetch (survives navigation)
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [send, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0 && !showLive;

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
                disabled={isLoading}
                textareaRef={textareaRef}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {showLive && activeStream && (
              <>
                <MessageBubble
                  message={{ id: "live-user", role: "user", content: activeStream.userMessage, timestamp: new Date() }}
                />
                <div className="flex gap-3 flex-row">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center border border-white/[0.14]">
                    <img src="/assets/khove-white.png" alt="Khove" className="w-3.5 h-3.5 object-contain" draggable={false} />
                  </div>
                  <LiveAssistant key={activeStream.userMessage} stream={activeStream} />
                </div>
              </>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar (conversation mode) */}
      {!isEmpty && (
        <div className="px-6 pb-6 pt-2 flex justify-center">
          <AIChatInput
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            textareaRef={textareaRef}
          />
        </div>
      )}
    </div>
  );
}
