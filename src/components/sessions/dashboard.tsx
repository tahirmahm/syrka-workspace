"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Video,
  NotebookPen,
  Plus,
  Search,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import { sessionsApi, searchSessions } from "@/lib/sessions/client";
import {
  meetingLink,
  type SessionRoom,
  type SessionSource,
  type Capabilities,
  type SearchHit,
} from "@/lib/sessions/model";
import { setDemoMode, isDemoMode } from "@/lib/storage";
export default function SessionsDashboard({
  mode = "sessions",
  source = "workspace",
}: {
  mode?: "sessions" | "notes";
  source?: SessionSource;
}) {
  const [rooms, setRooms] = useState<SessionRoom[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [initialDate] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const [join, setJoin] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await sessionsApi(source);
      setRooms(result.rooms);
      setCaps(result.capabilities);
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [source]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const results = await searchSessions(source, query.trim());
        if (active) setHits(results);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, query]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      const result = await sessionsApi(source, {
        action: "create",
        data: {
          title: f.get("title"),
          description: f.get("description"),
          starts_at: new Date(String(f.get("starts_at"))).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          project: f.get("project"),
          recurrence: f.get("recurrence"),
          occurrences: Number(f.get("occurrences")),
          kind: "meeting",
        },
      });
      setRooms((previous) => [...result.rooms, ...previous]);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const suffix = source === "campus" ? "?source=campus" : "";
  return (
    <div className="sessions-app">
      <header className="page-heading">
        <div className="eyebrow">MEET. UNDERSTAND. KEEP WHAT MATTERS.</div>
        <h1>{mode === "notes" ? "Syrka Notes" : "Syrka Sessions"}</h1>
        <p>
          {mode === "notes"
            ? "Search transcripts, review summaries and organize meeting and lecture knowledge."
            : "Host meetings, teach online classes, transcribe discussions and generate intelligent notes."}
        </p>
      </header>
      <nav className="session-nav">
        <Link href={`/sessions${suffix}`}>
          <Video size={18} />
          Sessions
        </Link>
        <Link href={`/tools/notes${suffix}`}>
          <NotebookPen size={18} />
          Notes
        </Link>
        <a href="https://www.syrka.co/cam">
          Campus classes <ArrowUpRight size={15} />
        </a>
      </nav>
      {error && (
        <div className="error" role="alert">
          {error}
          <Link href="/">Sign in to Workspace</Link>
          {source === "workspace" && (
            <button
              onClick={() => {
                setDemoMode(true);
                void load();
              }}
            >
              Explore fictional examples
            </button>
          )}
        </div>
      )}
      {caps && (
        <div className="session-notice">
          {isDemoMode() && source === "workspace" ? (
            <strong>
              Fictional local demo — these are not real university or company
              records.
            </strong>
          ) : (
            <strong>Private, account-based records</strong>
          )}
          {caps.missing.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <div className="session-actions">
        {mode === "sessions" && source === "workspace" && (
          <button
            className="session-primary"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={17} />
            New / schedule meeting
          </button>
        )}
        <label className="tools-search">
          <Search size={18} />
          <input
            aria-label="Search sessions"
            placeholder="Search meetings, transcripts and notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {creating && (
        <form className="session-form" onSubmit={create}>
          <h2>Schedule a meeting</h2>
          <label>
            Title
            <input name="title" required maxLength={160} />
          </label>
          <label>
            Description
            <textarea name="description" maxLength={4000} />
          </label>
          <label>
            Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <input
              name="starts_at"
              type="datetime-local"
              required
              defaultValue={initialDate}
            />
          </label>
          <label>
            Project label
            <input name="project" maxLength={120} />
          </label>
          <label>
            Repeat
            <select name="recurrence">
              <option value="none">Once</option>
              <option value="weekly">Every 7 days (same UTC time)</option>
            </select>
          </label>
          <label>
            Occurrences
            <input
              type="number"
              min={1}
              max={12}
              name="occurrences"
              defaultValue={1}
            />
          </label>
          <p>
            Weekly occurrences retain UTC time; review local times around
            daylight-saving changes.
          </p>
          <button disabled={busy} className="session-primary">
            {busy ? "Creating…" : "Create session"}
          </button>
        </form>
      )}
      {mode === "sessions" && (
        <form
          className="session-join"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const value = join.includes("/")
                ? new URL(join, location.origin).pathname
                    .split("/")
                    .filter(Boolean)
                    .at(-1)
                : join;
              if (!value || !/^[-a-f0-9]{36}$/i.test(value))
                throw Error("Paste a meeting link or UUID.");
              location.href = meetingLink(source, value);
            } catch (err) {
              setError(String(err));
            }
          }}
        >
          <label>
            Join using a meeting link
            <input
              aria-label="Meeting link or ID"
              value={join}
              onChange={(e) => setJoin(e.target.value)}
              placeholder="Paste a secure meeting link or ID"
            />
          </label>
          <button type="submit">Request to join</button>
        </form>
      )}
      {searching && <p role="status">Searching authorized records…</p>}
      {query.trim().length >= 2 && (
        <section aria-label="Transcript and note matches">
          <h2>Transcript & note matches</h2>
          {hits.map((hit, i) => (
            <Link
              className="session-card"
              key={`${hit.room_id}-${i}`}
              href={`/sessions/meeting/${hit.room_id}${suffix}${hit.segment_id ? `#segment-${hit.segment_id}` : `${suffix ? "&" : "?"}view=notes`}`}
            >
              <div>
                <small>{hit.kind}</small>
                <h3>{hit.title}</h3>
                <p>{hit.snippet.slice(0, 400)}</p>
              </div>
            </Link>
          ))}
          {!hits.length && !searching && <p>No transcript or note matches.</p>}
        </section>
      )}
      <h2>
        {mode === "notes"
          ? "Your session knowledge"
          : "Upcoming & recent sessions"}
      </h2>
      <div className="session-list">
        {rooms
          .filter((room) =>
            `${room.title} ${room.description} ${room.project}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((room) => (
            <Link
              key={room.id}
              className="session-card"
              href={`/sessions/meeting/${room.id}${suffix}${mode === "notes" ? (suffix ? "&" : "?") + "view=notes" : ""}`}
            >
              <span
                className={`file-icon ${room.kind === "lecture" ? "session-lecture" : ""}`}
              >
                {room.kind === "lecture" ? (
                  <NotebookPen size={20} />
                ) : (
                  <Video size={20} />
                )}
              </span>
              <div>
                <small>
                  {room.kind === "lecture" ? "Lecture" : "Meeting"} ·{" "}
                  {room.status}
                </small>
                <h3>{room.title}</h3>
                <p>
                  <CalendarDays size={14} />
                  {new Date(room.starts_at).toLocaleString()} ·{" "}
                  {room.project || "Personal session"}
                </p>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
      </div>
      {!rooms.length && !error && (
        <p className="empty">
          No sessions yet. Create a meeting or join one with its link.
        </p>
      )}
    </div>
  );
}
