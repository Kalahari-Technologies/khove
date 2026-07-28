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
  // Key of the in-flight NEW-conversation stream shown on a fresh /chat (before it
  // gets a real id in the URL). Independent of activeId so no navigation race.
  const [newKey, setNewKey] = useState<string | null>(null);
  const nonceRef = useRef(0);
  const nowRef = useRef<() => string>(() => new Date().toISOString());
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Any real navigation (new chat, or switching conversations) drops the fresh
  // new-stream reference so a finished stream never leaks onto another view.
  useEffect(() => { setNewKey(null); }, [activeId]);

  // Re-seed the list when server data changes, preserving in-flight flags.
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

  useEffect(() => {
    if (activeId) markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const patchStream = useCallback((key: string, fn: (s: StreamState) => StreamState) => {
    setStreams((prev) => (prev[key] ? { ...prev, [key]: fn(prev[key]) } : prev));
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const startId = activeId;
      const isNew = !startId;
      const key = startId ?? `new-${++nonceRef.current}`;

      setStreams((prev) => ({
        ...prev,
        [key]: { userMessage: trimmed, assistantText: "", steps: [], status: "streaming" },
      }));
      if (isNew) {
        setNewKey(key);
      } else {
        setList((prev) => prev.map((c) => (c.id === key ? { ...c, generating: true, updatedAt: nowRef.current() } : c)));
      }

      let realId = startId;

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
              realId = e.conversationId as string;
              if (isNew && realId) {
                // Add the sidebar item now, with the REAL id (never a placeholder).
                setList((prev) =>
                  prev.some((c) => c.id === realId)
                    ? prev
                    : [{ id: realId as string, title: trimmed.slice(0, 60), updatedAt: nowRef.current(), unseen: false, generating: true }, ...prev],
                );
              }
            } else if (t === "step") {
              const tool = e.tool as string;
              const label = e.label as string;
              const status = e.status as string;
              patchStream(key, (s) => {
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
              patchStream(key, (s) => ({ ...s, assistantText: s.assistantText + (e.delta as string) }));
            } else if (t === "blocked") {
              patchStream(key, (s) => ({ ...s, assistantText: e.response as string, status: "done" }));
            } else if (t === "error") {
              patchStream(key, (s) => ({ ...s, assistantText: s.assistantText + `\n\n_${e.message as string}_`, status: "error" }));
            } else if (t === "done") {
              patchStream(key, (s) => ({ ...s, status: "done", steps: s.steps.map((x) => ({ ...x, done: true })) }));
            }
          };

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // SSE frames are separated by a blank line; each carries one `data:` line.
            const frames = buf.split("\n\n");
            buf = frames.pop() ?? "";
            for (const frame of frames) {
              const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue; // skip comments (": ...")
              const json = dataLine.replace(/^data:\s?/, "");
              if (!json) continue;
              try { handle(JSON.parse(json)); } catch { /* skip partial */ }
            }
          }

          patchStream(key, (s) => (s.status === "streaming" ? { ...s, status: "done" } : s));
          if (realId) {
            setList((prev) =>
              prev.map((c) =>
                c.id === realId
                  ? { ...c, generating: false, updatedAt: nowRef.current(), unseen: activeIdRef.current !== realId }
                  : c,
              ),
            );
          }
          // For a brand-new conversation, move to its real URL exactly once, at the
          // end — so the next message continues it and a reload restores history.
          if (isNew && realId && activeIdRef.current !== realId) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("conversationId", realId);
            router.replace(`${pathname}?${params.toString()}`);
          }
        } catch {
          patchStream(key, (s) => ({ ...s, status: "error", assistantText: s.assistantText || "Something went wrong. Please try again." }));
          if (realId) setList((prev) => prev.map((c) => (c.id === realId ? { ...c, generating: false } : c)));
          setNewKey((k) => (k === key ? null : k));
        }
      })();
    },
    [activeId, backendFetch, workspaceId, patchStream, router, pathname, searchParams],
  );

  const activeStream = activeId
    ? streams[activeId] ?? null
    : newKey
      ? streams[newKey] ?? null
      : null;
  const sending = activeStream?.status === "streaming";

  const value = useMemo<ConversationsCtx>(
    () => ({ list, activeId, activeStream, sending, send, markRead }),
    [list, activeId, activeStream, sending, send, markRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
