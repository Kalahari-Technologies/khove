"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBackendFetch } from "@/lib/trpc/api";
import { trpc } from "@/lib/trpc/client";
import type { ChatStep } from "@/lib/types/conversation";

const PENDING = "__pending__";

export interface ConvListItem {
  id: string;
  title: string;
  updatedAt: string; // ISO
  unseen: boolean;
  generating: boolean;
}

export interface LiveStep extends ChatStep {
  done: boolean;
}

export interface StreamState {
  userMessage: string;
  assistantText: string;
  steps: LiveStep[];
  status: "streaming" | "done" | "error";
}

interface ConversationsCtx {
  list: ConvListItem[];
  activeId: string | null;
  activeStream: StreamState | null;
  sending: boolean;
  send: (text: string) => void;
  markRead: (id: string) => void;
}

const Ctx = createContext<ConversationsCtx | null>(null);

export function useConversations(): ConversationsCtx {
  return (
    useContext(Ctx) ?? {
      list: [],
      activeId: null,
      activeStream: null,
      sending: false,
      send: () => {},
      markRead: () => {},
    }
  );
}

export function ConversationsProvider({
  initial,
  workspaceId,
  children,
}: {
  initial: Array<{ id: string; title: string; updatedAt: string; lastReadAt: string | null }>;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const backendFetch = useBackendFetch();
  const markReadMut = trpc.conversation.markRead.useMutation();

  const onChat = !!pathname && /\/chat\/?$/.test(pathname);
  const activeId = onChat ? searchParams.get("conversationId") : null;

  const [list, setList] = useState<ConvListItem[]>(() =>
    initial.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      unseen: c.lastReadAt ? new Date(c.updatedAt) > new Date(c.lastReadAt) : false,
      generating: false,
    })),
  );
  const [streams, setStreams] = useState<Record<string, StreamState>>({});
  const nowRef = useRef<() => string>(() => new Date().toISOString());

  // Re-seed the list when the server data changes (e.g. after router.refresh),
  // preserving any client-side generating/unseen flags for in-flight streams.
  useEffect(() => {
    setList((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      return initial.map((c) => {
        const existing = byId.get(c.id);
        return {
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
          generating: existing?.generating ?? false,
          unseen: existing?.unseen ?? (c.lastReadAt ? new Date(c.updatedAt) > new Date(c.lastReadAt) : false),
        };
      });
    });
  }, [initial]);

  const markRead = useCallback(
    (id: string) => {
      setList((l) => l.map((c) => (c.id === id ? { ...c, unseen: false } : c)));
      markReadMut.mutate({ id });
    },
    [markReadMut],
  );

  // Clear the unseen flag whenever the user views a conversation.
  useEffect(() => {
    if (activeId) markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const patchStream = useCallback((key: string, fn: (s: StreamState) => StreamState) => {
    setStreams((prev) => (prev[key] ? { ...prev, [key]: fn(prev[key]) } : prev));
  }, []);

  // Ref of the current activeId so an async completion can decide "unseen".
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const startId = activeId;
      const key = startId ?? PENDING;

      setStreams((prev) => ({
        ...prev,
        [key]: { userMessage: trimmed, assistantText: "", steps: [], status: "streaming" },
      }));

      setList((prev) => {
        if (startId) {
          return prev.map((c) => (c.id === startId ? { ...c, generating: true, updatedAt: nowRef.current() } : c));
        }
        return [
          { id: PENDING, title: trimmed.slice(0, 60), updatedAt: nowRef.current(), unseen: false, generating: true },
          ...prev,
        ];
      });

      let currentKey = key;

      (async () => {
        try {
          const res = await backendFetch(
            "/api/chat",
            { method: "POST", body: JSON.stringify({ message: trimmed, conversationId: startId ?? undefined, workspaceId }) },
            workspaceId,
          );
          if (!res.ok || !res.body) throw new Error("stream failed");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";

          const handle = (e: Record<string, unknown>) => {
            const t = e.t as string;
            if (t === "meta") {
              const real = e.conversationId as string;
              if (currentKey !== real) {
                setStreams((prev) => {
                  const s = prev[currentKey];
                  if (!s) return prev;
                  const next = { ...prev, [real]: s };
                  delete next[currentKey];
                  return next;
                });
                setList((prev) => prev.map((c) => (c.id === currentKey ? { ...c, id: real } : c)));
                if (key === PENDING) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("conversationId", real);
                  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                }
                currentKey = real;
              }
            } else if (t === "step") {
              const tool = e.tool as string;
              const label = e.label as string;
              const status = e.status as string;
              patchStream(currentKey, (s) => {
                const idx = s.steps.findIndex((x) => x.tool === tool && !x.done);
                if (status === "done" && idx >= 0) {
                  const steps = [...s.steps];
                  steps[idx] = { ...steps[idx], done: true };
                  return { ...s, steps };
                }
                if (status === "running") return { ...s, steps: [...s.steps, { tool, label, done: false }] };
                return s;
              });
            } else if (t === "text") {
              patchStream(currentKey, (s) => ({ ...s, assistantText: s.assistantText + (e.delta as string) }));
            } else if (t === "blocked") {
              patchStream(currentKey, (s) => ({ ...s, assistantText: e.response as string, status: "done" }));
            } else if (t === "error") {
              patchStream(currentKey, (s) => ({ ...s, assistantText: s.assistantText + `\n\n_${e.message as string}_`, status: "error" }));
            } else if (t === "done") {
              patchStream(currentKey, (s) => ({ ...s, status: "done", steps: s.steps.map((x) => ({ ...x, done: true })) }));
            }
          };

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try { handle(JSON.parse(line)); } catch { /* skip partial */ }
            }
          }

          // Finalize the list entry.
          setList((prev) =>
            prev.map((c) =>
              c.id === currentKey
                ? { ...c, generating: false, updatedAt: nowRef.current(), unseen: activeIdRef.current !== currentKey }
                : c,
            ),
          );
        } catch {
          patchStream(currentKey, (s) => ({ ...s, status: "error", assistantText: s.assistantText || "Something went wrong. Please try again." }));
          setList((prev) => prev.map((c) => (c.id === currentKey ? { ...c, generating: false } : c)));
        }
      })();
    },
    [activeId, backendFetch, workspaceId, patchStream, router, pathname, searchParams],
  );

  const activeStream = activeId ? streams[activeId] ?? null : streams[PENDING] ?? null;
  const sending = activeStream?.status === "streaming";

  const value = useMemo<ConversationsCtx>(
    () => ({ list, activeId, activeStream, sending, send, markRead }),
    [list, activeId, activeStream, sending, send, markRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
