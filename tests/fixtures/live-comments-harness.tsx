import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import LiveComments from "../../src/components/sessions/live-comments";
import type { ReceivedChatMessage } from "@livekit/components-react";
function Harness() {
  const [messages, setMessages] = useState<ReceivedChatMessage[]>([]),
    [history, setHistory] = useState(false),
    [hidden, setHidden] = useState(false),
    [active, setActive] = useState(true),
    [compact, setCompact] = useState(false),
    [allowed, setAllowed] = useState(true);
  const receive = (text: string, sender: string) =>
    setMessages((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        message: text,
        from: { identity: sender, name: sender },
      } as ReceivedChatMessage,
    ]);
  useEffect(() => {
    const listener = (e: Event) => {
      const { text, sender } = (
        e as CustomEvent<{ text: string; sender: string }>
      ).detail;
      receive(text, sender);
    };
    window.addEventListener("qa-comment", listener);
    document.body.dataset.commentsReady = "true";
    return () => window.removeEventListener("qa-comment", listener);
  }, []);
  return (
    <>
      <button onClick={() => setHidden(!hidden)}>Hide live comments</button>
      <button onClick={() => setCompact(!compact)}>Minimize call</button>
      <button onClick={() => setAllowed(!allowed)}>
        Change chat permission
      </button>
      {history && (
        <>
          <div role="log">
            {messages.map((m) => (
              <p key={m.id}>{m.message}</p>
            ))}
          </div>
          <button onClick={() => setHistory(false)}>Close history</button>
        </>
      )}
      <LiveComments
        messages={messages}
        active={active && !compact}
        compact={compact}
        hidden={hidden}
        obstructed={history}
        connected
        sending={false}
        canSend={allowed}
        send={async (text) => receive(text, "Me")}
        onHistory={() => setHistory(true)}
        onClose={() => setActive(false)}
        onError={(text) => {
          throw Error(text);
        }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
