"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import type { ReceivedChatMessage } from "@livekit/components-react";

type Comment = { id: string; name: string; text: string; expires: number };
export default function LiveComments({
  messages,
  active,
  hidden,
  obstructed,
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
  const seen = useRef(new Set<string>());
  const received = useRef(new Map<string, number>());
  const lastSent = useRef(0);
  useEffect(() => {
    const now = Date.now();
    const additions: Comment[] = [];
    for (const m of messages) {
      const id = m.id || `${m.from?.identity}:${m.timestamp}:${m.message}`;
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      const sender = m.from?.identity || "unknown";
      // Receive-side flood protection also applies to modified clients. Full history is untouched.
      if (
        now - m.timestamp > 8000 ||
        now - (received.current.get(sender) || 0) < 1500
      )
        continue;
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
        [...old.filter((c) => c.expires > now), ...additions].slice(-3),
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
          old.some((c) => c.expires <= Date.now())
            ? old.filter((c) => c.expires > Date.now())
            : old,
        ),
      250,
    );
    const viewport = window.visualViewport;
    const resize = () =>
      setKeyboard(
        viewport && window.innerHeight - viewport.height > 140
          ? window.innerHeight - viewport.height - viewport.offsetTop
          : 0,
      );
    viewport?.addEventListener("resize", resize);
    return () => {
      clearInterval(timer);
      viewport?.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <>
      {!hidden && !obstructed && !keyboard && (
        <div
          className="call-live-comments"
          role="region"
          aria-label="Live comments"
        >
          <div className="sr-only" role="status" aria-live="polite">
            {comments.at(-1)
              ? `${comments.at(-1)!.name}: ${comments.at(-1)!.text}`
              : ""}
          </div>
          {comments.map((c) => (
            <button
              key={c.id}
              className="call-live-comment"
              onClick={onHistory}
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
            placeholder="Send a message…"
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
