"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Upload,
  Bell,
  Sparkles,
  X,
  Video,
  Trash2,
} from "lucide-react";
import { IntegrationInbox } from "./integrations";
import { NativeFrame, ErrorNotice } from "./frame";
import {
  rows,
  put,
  remove,
  nativeRequest,
  saveDownload,
} from "@/lib/native/client";
import {
  categories,
  colours,
  validateEvent,
  expandEvent,
  rangeFor,
  today,
  conflicts,
  moveDisplayedOccurrence,
  freeSlots,
  timedLayout,
  type Calendar,
  type CalendarEvent,
  type CalendarException,
  type Occurrence,
} from "@/lib/native/calendar";
import { exportICS, importICS } from "@/lib/native/ics";
type EventRow = {
  id: string;
  owner_id: string;
  calendar_id: string;
  data: CalendarEvent;
  revision: number;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export default function CalendarApp() {
  return (
    <NativeFrame app="calendar">
      {(identity) => <CalendarContent {...identity} />}
    </NativeFrame>
  );
}
function CalendarContent({ id: uid, demo }: { id: string; demo: boolean }) {
  const [zone] = useState(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Prague",
    ),
    [date, setDate] = useState(() => today(zone)),
    [view, setView] = useState<"month" | "week" | "day" | "agenda">("month"),
    [calendars, setCalendars] = useState<Calendar[]>([]),
    [events, setEvents] = useState<EventRow[]>([]),
    [exceptions, setExceptions] = useState<CalendarException[]>([]),
    [shares, setShares] = useState<
      { calendar_id: string; user_id: string; role: string }[]
    >([]),
    [hidden, setHidden] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [edit, setEdit] = useState<CalendarEvent | null>(null),
    [editingRevision, setEditingRevision] = useState<number | null>(null),
    [occurrence, setOccurrence] = useState<Occurrence | null>(null),
    [scope, setScope] = useState<"series" | "occurrence">("series"),
    [calendarName, setCalendarName] = useState(""),
    [notice, setNotice] = useState(""),
    [notifications, setNotifications] = useState<
      { id: string; title: string; due_at: string; read: boolean }[]
    >([]),
    [showInbox, setShowInbox] = useState(false),
    [showCalendars, setShowCalendars] = useState(false),
    [assistant, setAssistant] = useState(false),
    [prompt, setPrompt] = useState(""),
    [consent, setConsent] = useState(false),
    [proposals, setProposals] = useState<Partial<CalendarEvent>[]>([]);
  const load = useCallback(async () => {
    try {
      const [c, e, x, n, memberships] = await Promise.all([
        rows<Calendar>("native_calendars"),
        rows<EventRow>("native_events"),
        rows<CalendarException>("native_exceptions"),
        rows<{ id: string; title: string; due_at: string; read: boolean }>(
          "native_notifications",
        ),
        rows<{ calendar_id: string; user_id: string; role: string }>(
          "native_calendar_shares",
        ),
      ]);
      setShares(memberships);
      setCalendars(
        c.map((item) => ({
          ...item,
          role:
            item.owner_id === uid
              ? "owner"
              : (memberships.find(
                  (m) => m.calendar_id === item.id && m.user_id === uid,
                )?.role as Calendar["role"]) || "viewer",
        })),
      );
      setEvents(e);
      setExceptions(x);
      setNotifications(n);
      setReady(true);
    } catch (e) {
      setError(message(e));
      setReady(true);
    }
  }, [uid]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);
  const range = useMemo(() => rangeFor(date, view, zone), [date, view, zone]);
  const expansion = useMemo(() => {
    const invalid: string[] = [];
    const items = events
      .filter((e) => !hidden.includes(e.calendar_id))
      .flatMap((e) => {
        try {
          return expandEvent(e.data, exceptions, range.from, range.to);
        } catch {
          invalid.push(e.id);
          return [];
        }
      })
      .filter(
        (o) =>
          !query ||
          [
            o.event.title,
            o.event.description,
            o.event.location,
            o.event.category,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      );
    return { items, invalid };
  }, [events, hidden, exceptions, range, query]);
  const expanded = expansion.items;
  const clashes = conflicts(expanded);
  const conflictKeys = new Set(clashes.flatMap((p) => [p.a, p.b]));
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  async function createCalendar(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      await put("native_calendars", {
        id: crypto.randomUUID(),
        owner_id: uid,
        name: calendarName,
        colour: colours[calendars.length % colours.length],
        time_zone: zone,
        is_default: !calendars.length,
      });
      setCalendarName("");
      await load();
    });
  }
  function newEvent(day = date, hour = 9) {
    if (!calendars.some((c) => c.role !== "viewer")) {
      setError("Create a calendar first.");
      return;
    }
    setOccurrence(null);
    setEditingRevision(null);
    setScope("series");
    setEdit(
      validateEvent({
        id: crypto.randomUUID(),
        calendar_id: (
          calendars.find((c) => c.is_default && c.role !== "viewer") ||
          calendars.find((c) => c.role !== "viewer")!
        ).id,
        title: "New event",
        start_local: `${day}T${String(hour).padStart(2, "0")}:00`,
        end_local: Temporal.PlainDateTime.from(
          `${day}T${String(hour).padStart(2, "0")}:00`,
        )
          .add({ hours: 1 })
          .toString({ smallestUnit: "minute" }),
        time_zone: zone,
      }),
    );
  }
  function open(o: Occurrence) {
    setOccurrence(o);
    setEditingRevision(
      events.find((e) => e.id === o.event_id)?.revision ?? null,
    );
    setScope(
      events.find((e) => e.id === o.event_id)?.data.recurrence
        ? "occurrence"
        : "series",
    );
    setEdit({ ...o.event, start_local: o.start_local, end_local: o.end_local });
  }
  async function schedule(id: string) {
    if (!demo) {
      const n = await nativeRequest("calendar", { id });
      setNotice(n.message);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    await act(async () => {
      const value = validateEvent(edit);
      const latestRow = events.find((e) => e.id === value.id);
      if (
        latestRow &&
        editingRevision !== null &&
        latestRow.revision !== editingRevision
      )
        throw Error(
          "This event changed in another session. Reopen it before saving; your changes remain in this dialog.",
        );
      if (
        scope === "occurrence" &&
        occurrence &&
        events.find((e) => e.id === value.id)?.data.recurrence
      ) {
        await put("native_exceptions", {
          event_id: value.id,
          original_start: occurrence.original_start,
          cancelled: false,
          override: value,
        });
      } else {
        const existing = events.find((e) => e.id === value.id);
        await put(
          "native_events",
          {
            id: value.id,
            owner_id: existing?.owner_id || uid,
            calendar_id: value.calendar_id,
            data: value,
            revision: (existing?.revision ?? -1) + 1,
            updated_at: new Date().toISOString(),
          },
          existing?.revision,
        );
      }
      await load();
      setEdit(null);
      try {
        await schedule(value.id);
      } catch (e) {
        setError(
          "Event saved, but reminders were not scheduled: " + message(e),
        );
      }
    });
  }
  async function reschedule(o: Occurrence, day: string, hour?: number) {
    await act(async () => {
      const changed = {
        ...o.event,
        ...moveDisplayedOccurrence(o, day, zone, hour),
      };
      if (events.find((e) => e.id === o.event_id)?.data.recurrence)
        await put("native_exceptions", {
          event_id: o.event_id,
          original_start: o.original_start,
          cancelled: false,
          override: changed,
        });
      else {
        const original = events.find((e) => e.id === o.event_id)!;
        await put(
          "native_events",
          {
            ...original,
            data: validateEvent(changed),
            revision: original.revision + 1,
          },
          original.revision,
        );
      }
      await load();
      await schedule(o.event_id);
    });
  }
  const move = (direction: number) =>
    setDate(
      Temporal.PlainDate.from(date)
        .add(
          view === "month"
            ? { months: direction }
            : view === "week"
              ? { days: 7 * direction }
              : view === "agenda"
                ? { days: 30 * direction }
                : { days: direction },
        )
        .toString(),
    );
  const days = Array.from(
    { length: view === "month" ? 42 : view === "week" ? 7 : 1 },
    (_, i) => Temporal.PlainDate.from(range.start).add({ days: i }).toString(),
  );
  const itemsByDay = Object.fromEntries(
    days.map((day) => {
      const w = rangeFor(day, "day", zone);
      return [
        day,
        expanded.filter(
          (o) =>
            Date.parse(o.start) < Date.parse(w.to) &&
            Date.parse(o.end) > Date.parse(w.from),
        ),
      ];
    }),
  );
  const allDayRows = Math.max(
    1,
    ...days.map((day) => itemsByDay[day].filter((o) => o.event.all_day).length),
  );
  const timeBase = 42 + allDayRows * 28;
  const layouts =
    view === "week" || view === "day"
      ? Object.fromEntries(
          days.map((day) => [day, timedLayout(expanded, day, zone)]),
        )
      : {};
  const eventChip = (o: Occurrence, day?: string) => (
    <button
      key={o.key}
      className={
        "native-event " + (conflictKeys.has(o.key) ? "native-conflict" : "")
      }
      style={{
        ...(day && (view === "week" || view === "day")
          ? o.event.all_day
            ? {
                position: "absolute" as const,
                top:
                  35 +
                  itemsByDay[day]
                    .filter((item) => item.event.all_day)
                    .findIndex((item) => item.key === o.key) *
                    28,
                left: 3,
                right: 3,
                height: 28,
              }
            : {
                position: "absolute" as const,
                top: timeBase + ((layouts[day]?.[o.key]?.start || 0) / 60) * 32,
                left: `calc(${((layouts[day]?.[o.key]?.lane || 0) / (layouts[day]?.[o.key]?.count || 1)) * 100}% + 4px)`,
                width: `calc(${100 / (layouts[day]?.[o.key]?.count || 1)}% - 8px)`,
                height: Math.max(
                  25,
                  (((layouts[day]?.[o.key]?.end || 0) -
                    (layouts[day]?.[o.key]?.start || 0)) /
                    60) *
                    32,
                ),
              }
          : {}),
        borderLeftColor: calendars.find((c) => c.id === o.event.calendar_id)
          ?.colour,
      }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", o.key)}
      onClick={() => open(o)}
      title={`${o.event.title} — ${o.start_local} ${o.event.time_zone}${conflictKeys.has(o.key) ? " • Overlaps another event" : ""}`}
    >
      <time>
        {o.event.all_day
          ? "All day"
          : new Intl.DateTimeFormat(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: zone,
            }).format(new Date(o.start))}
      </time>
      <strong>{o.event.title}</strong>
      {o.event.category !== "personal" && (
        <small>{o.event.category.replace("_", " ")}</small>
      )}
    </button>
  );
  return (
    <>
      <header className="native-title">
        <div>
          <span className="native-eyebrow">
            A LITTLE ORDER. MORE POSSIBILITY.
          </span>
          <h1>Calendar</h1>
          <p>Your time, thoughtfully arranged.</p>
        </div>
        <button
          className="native-mobile-only"
          onClick={() => setShowCalendars(!showCalendars)}
        >
          <CalendarDays size={18} />
          Calendars
        </button>
        <button
          className="native-primary"
          disabled={busy || !calendars.some((c) => c.role !== "viewer")}
          onClick={() => newEvent()}
        >
          <Plus size={18} />
          New event
        </button>
      </header>
      <ErrorNotice error={error} clear={() => setError("")} />
      {expansion.invalid.length > 0 && (
        <div role="alert" className="native-notice">
          <span>
            {expansion.invalid.length} event records could not be displayed.
            Their original data is retained.
          </span>
          <button
            onClick={() =>
              saveDownload(
                "calendar-recovery.json",
                JSON.stringify(
                  events.filter((e) => expansion.invalid.includes(e.id)),
                  null,
                  2,
                ),
                "application/json",
              )
            }
          >
            Export recovery data
          </button>
        </div>
      )}
      {notice && (
        <div className="native-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      <div className="native-calendar-layout">
        <aside
          className={
            "native-panel calendar-rail " + (showCalendars ? "mobile-open" : "")
          }
        >
          <div className="native-row">
            <CalendarDays size={20} />
            <strong>Your calendars</strong>
          </div>
          <input
            type="date"
            aria-label="Navigate to date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <div className="mini-month">
            {Array.from({ length: 31 }, (_, i) => {
              try {
                const d = Temporal.PlainDate.from(date)
                  .with({ day: i + 1 }, { overflow: "reject" })
                  .toString();
                return (
                  <button
                    key={i}
                    className={d === date ? "selected" : ""}
                    onClick={() => setDate(d)}
                  >
                    {i + 1}
                  </button>
                );
              } catch {
                return null;
              }
            })}
          </div>
          {calendars.map((c) => (
            <div key={c.id} className="native-calendar-label">
              <label>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.id)}
                  onChange={() =>
                    setHidden(
                      hidden.includes(c.id)
                        ? hidden.filter((x) => x !== c.id)
                        : [...hidden, c.id],
                    )
                  }
                />
                <span style={{ background: c.colour }} />
                {c.name}
              </label>
              {c.owner_id === uid && (
                <details className="native-calendar-manage">
                  <summary>Manage</summary>
                  <form
                    className="native-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void act(async () => {
                        await put("native_calendars", {
                          ...c,
                          name: String(form.get("name")),
                          colour: String(form.get("colour")),
                        });
                        await load();
                      });
                    }}
                  >
                    <label>
                      Name
                      <input
                        name="name"
                        defaultValue={c.name}
                        required
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Colour
                      <input
                        name="colour"
                        type="color"
                        defaultValue={c.colour}
                      />
                    </label>
                    <button disabled={busy}>Save calendar</button>
                  </form>
                  <form
                    className="native-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void act(async () => {
                        if (demo)
                          throw Error("Sharing requires a signed-in account.");
                        const user_id = String(form.get("user"));
                        if (!/^[0-9a-f-]{36}$/i.test(user_id))
                          throw Error("Use the recipient’s Syrka account ID.");
                        const result = await import("@/lib/storage");
                        const { error } = await result
                          .supabase!.from("native_calendar_shares")
                          .upsert({
                            calendar_id: c.id,
                            user_id,
                            role: String(form.get("role")),
                          });
                        if (error) throw error;
                        await load();
                      });
                    }}
                  >
                    <label>
                      Recipient account ID
                      <input
                        name="user"
                        required
                        placeholder="Ask them to copy Account ID"
                      />
                    </label>
                    <select name="role" aria-label="Calendar member permission">
                      <option value="viewer">View public events</option>
                      <option value="editor">Edit events</option>
                    </select>
                    <button disabled={demo || busy}>Share calendar</button>
                  </form>
                  {shares
                    .filter((m) => m.calendar_id === c.id)
                    .map((m) => (
                      <div key={m.user_id}>
                        <small>
                          {m.user_id.slice(0, 8)} • {m.role}
                        </small>
                        <button
                          onClick={() =>
                            void act(async () => {
                              const { supabase } =
                                await import("@/lib/storage");
                              const { error } = await supabase!
                                .from("native_calendar_shares")
                                .delete()
                                .eq("calendar_id", c.id)
                                .eq("user_id", m.user_id);
                              if (error) throw error;
                              await load();
                            })
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                </details>
              )}
              <button
                aria-label={`Set ${c.name} as default`}
                disabled={c.owner_id !== uid}
                title="Set as default"
                onClick={() =>
                  void act(async () => {
                    for (const item of calendars)
                      if (item.owner_id === uid)
                        await put("native_calendars", {
                          ...item,
                          is_default: item.id === c.id,
                        });
                    await load();
                  })
                }
              >
                {c.is_default ? "Default" : "Set default"}
              </button>
            </div>
          ))}
          <form onSubmit={createCalendar} className="native-stack">
            <input
              required
              maxLength={100}
              placeholder="New calendar name"
              aria-label="New calendar name"
              value={calendarName}
              onChange={(e) => setCalendarName(e.target.value)}
            />
            <button disabled={busy || !calendarName.trim()}>
              <Plus size={16} />
              Add calendar
            </button>
          </form>
          <hr />
          <button onClick={() => setAssistant(true)}>
            <Sparkles size={17} />
            Plan my time
          </button>
          <button onClick={() => setShowInbox(!showInbox)}>
            <Bell size={17} />
            Reminders {notifications.filter((n) => !n.read).length || ""}
          </button>
          <label className="native-upload">
            <Upload size={16} />
            Import ICS
            <input
              type="file"
              accept=".ics,text/calendar"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void act(async () => {
                    if (!calendars.length)
                      throw Error("Create a calendar first.");
                    const imported = importICS(
                      await file.text(),
                      calendars[0].id,
                      zone,
                    );
                    for (const value of imported.filter(
                      (value) =>
                        !events.some(
                          (e) =>
                            e.calendar_id === value.calendar_id &&
                            e.data.source?.system === "ical" &&
                            e.data.source.record_id === value.source?.record_id,
                        ),
                    ))
                      await put("native_events", {
                        id: value.id,
                        owner_id: uid,
                        calendar_id: value.calendar_id,
                        data: value,
                        revision: 0,
                      });
                    await load();
                    setNotice(
                      `Imported ${imported.length} event series. Static import; not a synchronized calendar.`,
                    );
                  });
                e.target.value = "";
              }}
            />
          </label>
          <small>
            Displayed in {zone}. Reminders are delivered to your Syrka inbox.
            Email and browser push are not configured.
          </small>
        </aside>
        <section className="native-panel calendar-main">
          <div className="native-calendar-toolbar">
            <div className="native-row">
              <button onClick={() => setDate(today(zone))}>Today</button>
              <button aria-label="Previous period" onClick={() => move(-1)}>
                <ChevronLeft size={18} />
              </button>
              <button aria-label="Next period" onClick={() => move(1)}>
                <ChevronRight size={18} />
              </button>
              <h2>
                {new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(date + "T12:00:00Z"))}
              </h2>
            </div>
            <div className="native-row">
              <label className="native-search">
                <Search size={16} />
                <input
                  aria-label="Search events"
                  placeholder="Search events"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Calendar view"
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                {["month", "week", "day", "agenda"].map((v) => (
                  <option key={v} value={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!ready ? (
            <p role="status">Loading your calendar…</p>
          ) : view === "agenda" ? (
            <div className="native-agenda">
              {expanded.length ? (
                expanded.map((o) => (
                  <div className="native-agenda-row" key={o.key}>
                    <time>{o.start_local.slice(0, 10)}</time>
                    {eventChip(o)}
                  </div>
                ))
              ) : (
                <div className="native-empty">
                  <CalendarDays size={36} />
                  <h2>A little room in your day.</h2>
                  <p>No events in this period.</p>
                </div>
              )}
            </div>
          ) : (
            <div className={`native-calendar-grid view-${view}`}>
              {days.map((day) => (
                <div
                  className={
                    "native-day " + (day === today(zone) ? "is-today" : "")
                  }
                  key={day}
                  style={
                    view === "week" || view === "day"
                      ? { minHeight: timeBase + 768 }
                      : undefined
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const o = expanded.find(
                      (o) => o.key === e.dataTransfer.getData("text/plain"),
                    );
                    if (o) {
                      const hour =
                        view === "week" || view === "day"
                          ? Math.max(
                              0,
                              Math.min(
                                23,
                                Math.floor(
                                  (e.clientY -
                                    e.currentTarget.getBoundingClientRect()
                                      .top -
                                    timeBase) /
                                    32,
                                ),
                              ),
                            )
                          : undefined;
                      void reschedule(o, day, hour);
                    }
                  }}
                >
                  <button
                    className="native-day-number"
                    aria-label={`Create event on ${day}`}
                    onClick={() => newEvent(day)}
                  >
                    <span>
                      {new Intl.DateTimeFormat(undefined, {
                        weekday: "short",
                        timeZone: "UTC",
                      }).format(new Date(day + "T12:00Z"))}
                    </span>
                    <strong>{day.slice(-2)}</strong>
                  </button>
                  {(view === "day" || view === "week") && (
                    <div className="native-hour-grid" style={{ top: timeBase }}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <button
                          key={h}
                          aria-label={`Create event on ${day} at ${h}:00`}
                          onClick={() => newEvent(day, h)}
                        >
                          {String(h).padStart(2, "0")}:00
                        </button>
                      ))}
                    </div>
                  )}
                  {itemsByDay[day].map((o) => eventChip(o, day))}
                </div>
              ))}
            </div>
          )}
          {clashes.length > 0 && (
            <p className="native-notice">
              {clashes.length} overlapping event pair
              {clashes.length === 1 ? "" : "s"} in this view. Marked events may
              need your attention.
            </p>
          )}
          <p className="native-hint">
            Drag events to another date, or open an event to edit its time and
            duration.{" "}
            {view === "month"
              ? "Recurring events move one occurrence at a time."
              : ""}
          </p>
        </section>
      </div>
      <IntegrationInbox
        uid={uid}
        demo={demo}
        calendars={calendars}
        onSaved={load}
      />
      {showInbox && (
        <div className="native-overlay">
          <section className="native-dialog">
            <div className="native-row between">
              <h2>Reminder inbox</h2>
              <button
                aria-label="Close reminders"
                onClick={() => setShowInbox(false)}
              >
                <X />
              </button>
            </div>
            {notifications.length ? (
              notifications.map((n) => (
                <div key={n.id} className="native-response">
                  <strong>{n.title}</strong>
                  <p>{new Date(n.due_at).toLocaleString()}</p>
                  <button
                    disabled={n.read}
                    onClick={() =>
                      void act(async () => {
                        await put("native_notifications", { ...n, read: true });
                        await load();
                      })
                    }
                  >
                    {n.read ? "Read" : "Mark read"}
                  </button>
                </div>
              ))
            ) : (
              <p>
                No delivered reminders yet. Configure reminders in an event.
                Delivery occurs server-side, even while Calendar is closed.
              </p>
            )}
          </section>
        </div>
      )}
      {edit && (
        <div className="native-overlay">
          <form
            className="native-dialog native-stack"
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-label="Event editor"
          >
            <div className="native-row between">
              <h2>
                {events.some((e) => e.id === edit.id)
                  ? "Edit event"
                  : "New event"}
              </h2>
              <button
                type="button"
                aria-label="Close event"
                onClick={() => setEdit(null)}
              >
                <X />
              </button>
            </div>
            <label>
              Title
              <input
                required
                maxLength={180}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            {occurrence &&
              events.find((e) => e.id === edit.id)?.data.recurrence && (
                <label>
                  Edit
                  <select
                    value={scope}
                    onChange={(e) => {
                      const s = e.target.value as typeof scope;
                      setScope(s);
                      setEdit(
                        s === "series"
                          ? events.find((x) => x.id === edit.id)!.data
                          : {
                              ...occurrence.event,
                              start_local: occurrence.start_local,
                              end_local: occurrence.end_local,
                            },
                      );
                    }}
                  >
                    <option value="occurrence">Only this occurrence</option>
                    <option value="series">Entire series</option>
                  </select>
                </label>
              )}
            <div className="native-two">
              <label>
                Start
                <input
                  type="datetime-local"
                  required
                  value={edit.start_local.slice(0, 16)}
                  onChange={(e) =>
                    setEdit({ ...edit, start_local: e.target.value })
                  }
                />
              </label>
              <label>
                End
                <input
                  type="datetime-local"
                  required
                  value={edit.end_local.slice(0, 16)}
                  onChange={(e) =>
                    setEdit({ ...edit, end_local: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="native-two">
              <label>
                Timezone
                <input
                  required
                  value={edit.time_zone}
                  onChange={(e) =>
                    setEdit({ ...edit, time_zone: e.target.value })
                  }
                  aria-label="Timezone"
                  list="native-timezones"
                />
                <datalist id="native-timezones">
                  {[
                    "Europe/Prague",
                    "Europe/London",
                    "America/New_York",
                    "Asia/Kolkata",
                    "Asia/Dubai",
                    "Asia/Singapore",
                    "UTC",
                  ].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Autumn clock ambiguity
                <select
                  value={edit.dst_policy}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      dst_policy: e.target.value as "earlier" | "later",
                    })
                  }
                >
                  <option value="earlier">Earlier offset</option>
                  <option value="later">Later offset</option>
                </select>
              </label>
            </div>
            <label className="native-check">
              <input
                type="checkbox"
                checked={edit.all_day}
                onChange={(e) =>
                  setEdit({ ...edit, all_day: e.target.checked })
                }
              />
              All day (end date is exclusive)
            </label>
            <div className="native-two">
              <label>
                Calendar
                <select
                  value={edit.calendar_id}
                  onChange={(e) =>
                    setEdit({ ...edit, calendar_id: e.target.value })
                  }
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      category: e.target.value as CalendarEvent["category"],
                    })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </label>
            <label>
              Location
              <input
                value={edit.location}
                onChange={(e) => setEdit({ ...edit, location: e.target.value })}
              />
            </label>
            <label>
              Existing meeting URL
              <input
                placeholder="https://…"
                value={edit.meeting_url}
                onChange={(e) =>
                  setEdit({ ...edit, meeting_url: e.target.value })
                }
              />
            </label>
            {edit.meeting_url && (
              <a
                href={edit.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Video size={16} />
                Open linked meeting
              </a>
            )}
            <small>
              Attach an existing Sessions invitation or provider meeting link.
              Calendar does not fabricate rooms.
            </small>
            <label>
              Attendees (comma-separated email addresses)
              <input
                value={edit.attendees.map((a) => a.email).join(", ")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    attendees: e.target.value
                      .split(",")
                      .map((s) => ({ name: "", email: s.trim() })),
                  })
                }
              />
            </label>
            <label>
              Visibility
              <select
                value={edit.visibility}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    visibility: e.target.value as CalendarEvent["visibility"],
                  })
                }
              >
                <option value="calendar">Visible to calendar members</option>
                <option value="private">Private to editors</option>
                <option value="busy">Private / busy</option>
              </select>
            </label>
            {scope === "series" && (
              <>
                <label>
                  Repeat
                  <select
                    value={edit.recurrence?.freq || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        recurrence: e.target.value
                          ? {
                              freq: e.target.value as
                                "daily" | "weekly" | "monthly",
                              interval: 1,
                              weekdays: [],
                              count: null,
                              until: null,
                            }
                          : null,
                      })
                    }
                  >
                    <option value="">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                {edit.recurrence && (
                  <div className="native-two">
                    <label>
                      Every
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={edit.recurrence.interval}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            recurrence: {
                              ...edit.recurrence!,
                              interval: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Stop after occurrences (optional)
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={edit.recurrence.count || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            recurrence: {
                              ...edit.recurrence!,
                              count: e.target.value
                                ? Number(e.target.value)
                                : null,
                              until: null,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Or end on
                      <input
                        type="date"
                        value={edit.recurrence.until || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            recurrence: {
                              ...edit.recurrence!,
                              until: e.target.value || null,
                              count: null,
                            },
                          })
                        }
                      />
                    </label>
                    {edit.recurrence.freq === "weekly" && (
                      <fieldset>
                        <legend>Weekdays</legend>
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (d, i) => (
                            <label className="native-check" key={d}>
                              <input
                                type="checkbox"
                                checked={edit.recurrence!.weekdays.includes(
                                  i + 1,
                                )}
                                onChange={() => {
                                  const w = edit.recurrence!.weekdays;
                                  setEdit({
                                    ...edit,
                                    recurrence: {
                                      ...edit.recurrence!,
                                      weekdays: w.includes(i + 1)
                                        ? w.filter((x) => x !== i + 1)
                                        : [...w, i + 1],
                                    },
                                  });
                                }}
                              />
                              {d}
                            </label>
                          ),
                        )}
                      </fieldset>
                    )}
                  </div>
                )}
              </>
            )}
            <label>
              Series reminders (minutes before, comma-separated)
              <input
                disabled={demo || scope === "occurrence"}
                placeholder="0, 15, 60, 1440"
                value={edit.reminders.join(", ")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    reminders: e.target.value
                      ? e.target.value.split(",").map((s) => Number(s.trim()))
                      : [],
                  })
                }
              />
            </label>
            <div className="native-row wrap">
              <button
                type="submit"
                className="native-primary"
                disabled={
                  busy ||
                  calendars.find((c) => c.id === edit.calendar_id)?.role ===
                    "viewer"
                }
              >
                Save event
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    saveDownload(
                      edit.title + ".ics",
                      exportICS(edit, exceptions),
                      "text/calendar;charset=utf-8",
                    );
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                <Download size={16} />
                Export ICS
              </button>
              {events.some((e) => e.id === edit.id) &&
                calendars.find((c) => c.id === edit.calendar_id)?.role !==
                  "viewer" && (
                  <button
                    type="button"
                    className="native-danger"
                    onClick={() =>
                      void act(async () => {
                        if (scope === "occurrence" && occurrence)
                          await put("native_exceptions", {
                            event_id: edit.id,
                            original_start: occurrence.original_start,
                            cancelled: true,
                            override: null,
                          });
                        else await remove("native_events", edit.id);
                        setEdit(null);
                        await load();
                        if (scope === "occurrence") await schedule(edit.id);
                      })
                    }
                  >
                    <Trash2 size={16} />
                    Delete {scope === "occurrence" ? "occurrence" : "event"}
                  </button>
                )}
            </div>
          </form>
        </div>
      )}
      {assistant && (
        <div className="native-overlay">
          <section
            className="native-dialog native-stack"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule assistant"
          >
            <div className="native-row between">
              <h2>Make time for what matters.</h2>
              <button
                aria-label="Close assistant"
                onClick={() => setAssistant(false)}
              >
                <X />
              </button>
            </div>
            <p>
              Find free one-hour slots in your visible calendars. Other
              attendees’ availability is not connected.
            </p>
            <button
              onClick={() =>
                setProposals(
                  freeSlots(expanded, date, zone)
                    .slice(0, 3)
                    .map((s) => ({
                      ...s,
                      title: "Study session",
                      time_zone: zone,
                    })),
                )
              }
            >
              Suggest three study blocks locally
            </button>
            <label>
              Optional AI request
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Plan three economics study sessions before Friday"
              />
            </label>
            <label className="native-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Send this request and my visible free/busy times to Qwen in
              Singapore.
            </label>
            <button
              disabled={demo || busy || !consent || !prompt}
              onClick={() =>
                void act(async () => {
                  const result = await nativeRequest("ai", {
                    action: "calendar",
                    consent,
                    prompt,
                    date,
                    zone,
                    busy: expanded.map((o) => ({ start: o.start, end: o.end })),
                  });
                  setProposals(result.events);
                })
              }
            >
              <Sparkles size={16} />
              Propose with Qwen
            </button>
            {proposals.map((p, i) => (
              <div key={i} className="native-response">
                <strong>{p.title}</strong>
                <p>
                  {p.start_local} – {p.end_local} {p.time_zone}
                </p>
                <button
                  disabled={!calendars.length}
                  onClick={() => {
                    setAssistant(false);
                    setScope("series");
                    setOccurrence(null);
                    setEdit(
                      validateEvent({
                        id: crypto.randomUUID(),
                        calendar_id: calendars[0].id,
                        ...p,
                      }),
                    );
                  }}
                >
                  Review event
                </button>
                <button
                  onClick={() =>
                    setProposals(proposals.filter((_, j) => i !== j))
                  }
                >
                  Reject
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
