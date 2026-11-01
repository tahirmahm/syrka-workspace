"use client";
import { useEffect, useState } from "react";
import { FileInput, Check, X } from "lucide-react";
import {
  calendarActionSchema,
  type CalendarAction,
} from "@/lib/native/contracts";
import { validateEvent, type Calendar } from "@/lib/native/calendar";
import { rows, put, nativeRequest } from "@/lib/native/client";
type Proposal = {
  id: string;
  source: string;
  payload: CalendarAction;
  status: "pending" | "approved" | "rejected";
  idempotency_key: string;
};
export function IntegrationInbox({
  uid,
  demo,
  calendars,
  onSaved,
}: {
  uid: string;
  demo: boolean;
  calendars: Calendar[];
  onSaved: () => Promise<void>;
}) {
  const [items, setItems] = useState<Proposal[]>([]),
    [input, setInput] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    rows<Proposal>("native_proposals")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposal failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="native-panel native-stack native-integrations">
      <details>
        <summary>
          <FileInput size={17} />
          Integration proposals
        </summary>
        <p>
          Import a versioned proposal from Mail, Campus, Dashboard, Roadmaps or
          Passport. Review it before creating a personal event. These are manual
          proposals, not live account connections or institutional timetable
          edits.
        </p>
        <label>
          CalendarAction JSON
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'{"contract":"syrka.calendar-action.v1",…}'}
          />
        </label>
        <button
          disabled={!input || busy}
          onClick={() =>
            void act(async () => {
              const action = calendarActionSchema.parse(JSON.parse(input));
              if (demo) {
                if (
                  items.some(
                    (p) =>
                      p.source === action.source &&
                      p.idempotency_key === action.idempotency_key,
                  )
                )
                  throw Error("This proposal has already been imported.");
                await put("native_proposals", {
                  id: crypto.randomUUID(),
                  owner_id: uid,
                  source: action.source,
                  idempotency_key: action.idempotency_key,
                  payload: action,
                  status: "pending",
                });
              } else await nativeRequest("proposals", action);
              setInput("");
              await load();
            })
          }
        >
          Import for review
        </button>
        <label>
          Destination calendar
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a calendar</option>
            {calendars
              .filter((c) => c.role !== "viewer")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {items.map((p) => (
          <article className="native-response" key={p.id}>
            <span className="native-pill">
              {p.source} • {p.status}
            </span>
            <h3>{p.payload.event.title}</h3>
            <p>
              {p.payload.event.start_local} – {p.payload.event.end_local} •{" "}
              {p.payload.event.time_zone}
            </p>
            <p>{p.payload.event.description}</p>
            {p.payload.event.references.map((r) => (
              <a
                key={r.record_id}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {r.label}
              </a>
            ))}
            {p.status === "pending" && (
              <div className="native-row">
                <button
                  disabled={busy || !selected}
                  onClick={() =>
                    void act(async () => {
                      const event = validateEvent({
                        id: p.id,
                        calendar_id: selected,
                        ...p.payload.event,
                        source: {
                          system: p.source,
                          record_id: p.idempotency_key,
                          authoritative: false,
                        },
                      });
                      await put("native_events", {
                        id: event.id,
                        owner_id: uid,
                        calendar_id: selected,
                        data: event,
                        revision: 0,
                      });
                      await put("native_proposals", {
                        id: p.id,
                        status: "approved",
                      });
                      await load();
                      await onSaved();
                    })
                  }
                >
                  <Check size={16} />
                  Approve event
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await put("native_proposals", {
                        id: p.id,
                        status: "rejected",
                      });
                      await load();
                    })
                  }
                >
                  <X size={16} />
                  Reject
                </button>
              </div>
            )}
          </article>
        ))}
        {error && <p role="alert">{error}</p>}
      </details>
    </section>
  );
}
