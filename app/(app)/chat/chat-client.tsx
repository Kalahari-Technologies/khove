"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
}

interface ChatClientProps {
  userName: string;
  planTier: string;
  conversationId?: string;
}

const SUGGESTED_PROMPTS = [
  "What tasks do I have in progress?",
  "Create a task: Review API documentation",
  "Show me my blocked tasks",
  "Mark all done tasks from yesterday",
];

export function ChatClient({ userName, planTier, conversationId: initialConvId }: ChatClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConvId);
  const [isBlocked, setIsBlocked] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
        }),
      });

      const data = await res.json();

      if (data.blocked) {
        setIsBlocked(true);
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response ?? "Something went wrong. Please try again.",
        timestamp: new Date(),
        model: data.model,
      };

      setMessages((prev) => [...prev, assistantMessage]);
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
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState
            userName={userName}
            planTier={planTier}
            onPrompt={(p) => sendMessage(p)}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Blocked state banner */}
      {isBlocked && (
        <div className="mx-6 mb-3 px-4 py-3 rounded-lg bg-accent-amber/10 border border-accent-amber/20 text-sm text-accent-amber flex items-center gap-2">
          <span>⚠</span>
          <span>Monthly message limit reached. Upgrade your plan to continue.</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-bg-elevated rounded-xl border border-border focus-within:border-brand-primary transition-colors duration-fast px-4 py-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything…"
              rows={1}
              disabled={isLoading || isBlocked}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-disabled resize-none outline-none leading-relaxed min-h-[24px] max-h-40 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading || isBlocked}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-primary hover:bg-brand-primaryHover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-fast flex items-center justify-center"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-[11px] text-text-disabled mt-2 text-center">
            Enter to send · Shift+Enter for new line · {planTier} plan
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  userName,
  planTier,
  onPrompt,
}: {
  userName: string;
  planTier: string;
  onPrompt: (p: string) => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-lg w-full">
        {/* Logo mark */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-primary/20">
          <span className="text-white font-bold text-xl font-display">K</span>
        </div>

        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          Hey {userName.split(" ")[0]}
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-8">
          What do you want to get done today?
        </p>

        {/* Suggested prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPrompt(prompt)}
              className="px-4 py-3 rounded-lg bg-bg-elevated hover:bg-bg-overlay border border-border hover:border-brand-primary/40 text-sm text-text-secondary hover:text-text-primary transition-all duration-fast text-left leading-snug"
            >
              {prompt}
            </button>
          ))}
        </div>

        {planTier === "FREE" && (
          <p className="text-[11px] text-text-disabled mt-6">
            Free plan · 30 messages/month · Connect GitHub and Calendar on Pro ($9/mo)
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium ${
          isUser
            ? "bg-brand-primary text-white"
            : "bg-bg-elevated border border-border text-text-secondary"
        }`}
      >
        {isUser ? "U" : "K"}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        <div
          className={`inline-block max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
            isUser
              ? "bg-brand-primary text-white rounded-tr-sm"
              : "bg-bg-elevated border border-border text-text-primary rounded-tl-sm"
          }`}
        >
          <MessageContent content={message.content} isAssistant={!isUser} />
        </div>

        <div className={`flex items-center gap-2 mt-1 ${isUser ? "flex-row-reverse" : ""}`}>
          <span className="text-[10px] text-text-disabled">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.model && (
            <span className="text-[10px] text-text-disabled font-mono">{message.model}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render assistant messages with basic markdown: bold, code, newlines.
 * Avoids a full markdown library dependency for now.
 */
function MessageContent({ content, isAssistant }: { content: string; isAssistant: boolean }) {
  if (!isAssistant) return <span>{content}</span>;

  // Split on code blocks first, then handle inline formatting
  const lines = content.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <p key={i} className="font-semibold text-text-primary text-base">
              {line.slice(2)}
            </p>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="font-medium text-text-primary">
              {line.slice(3)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-text-disabled mt-0.5 flex-shrink-0">·</span>
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
  // Handle **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="font-mono text-xs bg-bg-overlay px-1.5 py-0.5 rounded text-accent-sky">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full flex-shrink-0 bg-bg-elevated border border-border flex items-center justify-center text-xs font-medium text-text-secondary">
        K
      </div>
      <div className="bg-bg-elevated border border-border rounded-xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-text-disabled animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
