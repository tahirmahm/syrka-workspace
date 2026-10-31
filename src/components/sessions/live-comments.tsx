"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import type { ReceivedChatMessage } from "@livekit/components-react";

type Comment = {
  id: string;
  name: string;
  text: string;
  expires: number;
  pausedAt?: number;
};
export default function LiveComments({
  messages,
  active,
  hidden,
  obstructed,
  compact = false,
  connected,
  sending,
  canSend,
  send,
  onHistory,
  onClose,
  onError,
}: {
  messages: ReceivedChatMessage[];
  active: boolean;
  hidden: boolean;
  obstructed: boolean;
  compact?: boolean;
  connected: boolean;
  sending: boolean;
  canSend: boolean;
  send: (text: string) => Promise<unknown>;
  onHistory: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [keyboard, setKeyboard] = useState(0);
  const seen = useRef(
    new Set(
      messages
        .slice(-1000)
        .map((m) => m.id || `${m.from?.identity}:${m.timestamp}:${m.message}`),
    ),
  );
  const processed = useRef(messages.length);
  const received = useRef(new Map<string, number>());
  const lastSent = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const additions: Comment[] = [];
    // Process arrivals only: pruning deduplication must never replay old history.
    const arrivals = messages.slice(processed.current);
    processed.current = messages.length;
    for (const m of arrivals) {
      const id = m.id || `${m.from?.identity}:${m.timestamp}:${m.message}`;
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      const sender = m.from?.identity || "unknown";
      // Receive-side flood protection also applies to modified clients. Full history is untouched.
      if (now - (received.current.get(sender) || 0) < 1500) continue;
      received.current.set(sender, now);
      additions.push({
        id,
        name: (m.from?.name || "Participant").slice(0, 80),
        text: m.message.slice(0, 500),
        expires: now + 7000,
      });
    }
    if (additions.length)
      setComments((old) =>
        [
          ...old.filter((c) => c.pausedAt || c.expires > now),
          ...additions,
        ].slice(-3),
      );
    // The transport already retains this call's history; bound only our deduplication cache.
    if (seen.current.size > 2000)
      seen.current = new Set(
        messages
          .slice(-1000)
          .map(
            (m) => m.id || `${m.from?.identity}:${m.timestamp}:${m.message}`,
          ),
      );
  }, [messages]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setComments((old) =>
          old.some((c) => !c.pausedAt && c.expires <= Date.now())
            ? old.filter((c) => c.pausedAt || c.expires > Date.now())
            : old,
        ),
      250,
    );
    const viewport = window.visualViewport;
    const resize = () =>
      setKeyboard(
        viewport && window.innerHeight - viewport.height > 140
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop,
            )
          : 0,
      );
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      clearInterval(timer);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  function pause(id: string) {
    setComments((old) =>
      old.map((c) =>
        c.id === id && !c.pausedAt ? { ...c, pausedAt: Date.now() } : c,
      ),
    );
  }
  function resume(id: string) {
    setComments((old) =>
      old.map((c) =>
        c.id === id && c.pausedAt
          ? {
              ...c,
              expires: c.expires + Date.now() - c.pausedAt,
              pausedAt: undefined,
            }
          : c,
      ),
    );
  }
  return (
    <>
      {!hidden && compact && comments.length > 0 && (
        <button
          className="call-mini-chat-notice"
          onClick={onHistory}
          aria-label="Return to call chat"
        >
          <MessageSquare size={14} />
          {comments.length} new
        </button>
      )}
      {!hidden && !compact && !obstructed && (
        <div
          className="call-live-comments"
          data-keyboard={!!keyboard}
          style={keyboard ? { bottom: keyboard + 74 } : undefined}
          role="region"
          aria-label="Live comments"
        >
          <div className="sr-only" role="status" aria-live="polite">
            {comments.at(-1)
              ? `${comments.at(-1)!.name}: ${comments.at(-1)!.text}`
              : ""}
          </div>
          {(keyboard ? comments.slice(-1) : comments).map((c) => (
            <button
              key={c.id}
              className="call-live-comment"
              data-paused={!!c.pausedAt}
              onFocus={() => pause(c.id)}
              onBlur={() => resume(c.id)}
              onPointerEnter={() => pause(c.id)}
              onPointerLeave={() => resume(c.id)}
              onPointerDown={() => pause(c.id)}
              onPointerUp={() => resume(c.id)}
              onPointerCancel={() => resume(c.id)}
              onClick={() => {
                resume(c.id);
                onHistory();
              }}
              aria-label={`Open chat: ${c.name}: ${c.text}`}
            >
              <strong>{c.name}</strong>
              <span>{c.text}</span>
            </button>
          ))}
        </div>
      )}
      {active && (
        <form
          className="call-live-composer"
          style={keyboard ? { bottom: keyboard + 12 } : undefined}
          aria-label="Send a call comment"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = text.trim();
            if (!value || !connected || !canSend || sending) return;
            if (Date.now() - lastSent.current < 1500) {
              onError("Please wait a moment before sending another message.");
              return;
            }
            lastSent.current = Date.now();
            try {
              await send(value.slice(0, 2000));
              setText("");
            } catch {
              onError(
                "Message could not be sent. Check your connection and try again.",
              );
            }
          }}
        >
          <button
            type="button"
            aria-label="Open full chat history"
            onClick={onHistory}
          >
            <MessageSquare size={18} />
          </button>
          <label className="sr-only" htmlFor="session-chat-message">
            Message
          </label>
          <input
            id="session-chat-message"
            aria-label="Call message"
            placeholder="Message everyone…"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!connected || !canSend}
          />
          <button
            aria-label="Send message"
            disabled={!connected || !canSend || sending || !text.trim()}
          >
            <Send size={18} />
          </button>
          <button
            type="button"
            aria-label="Collapse message input"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </form>
      )}
    </>
  );
}
