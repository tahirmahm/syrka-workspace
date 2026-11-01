import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
export const colours = [
  "#5379b8",
  "#8b6eaf",
  "#c08b42",
  "#4a8d7a",
  "#bf6d73",
  "#577e8c",
] as const;
export const categories = [
  "personal",
  "class",
  "lecture",
  "seminar",
  "tutorial",
  "exam",
  "assignment",
  "office_hours",
  "meeting",
  "interview",
  "application",
  "milestone",
  "training",
  "other",
] as const;
export const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(365).default(1),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    count: z.number().int().min(1).max(1000).nullable().default(null),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .refine(
    (r) => !(r.count && r.until),
    "Use an end date or occurrence count, not both.",
  );
export type Recurrence = z.infer<typeof recurrenceSchema>;
export const referenceSchema = z.object({
  app: z.enum([
    "workspace",
    "mail",
    "campus",
    "sessions",
    "dashboard",
    "roadmaps",
    "passport",
  ]),
  record_id: z.string().max(200),
  label: z.string().max(200),
  url: z
    .string()
    .max(2000)
    .refine(
      (u) => u.startsWith("/workspace/") || /^https:\/\/[^\s]+$/.test(u),
      "Use an HTTPS link or a Workspace route.",
    ),
});
export const eventSchema = z.object({
  id: z.uuid(),
  calendar_id: z.uuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().max(10000).default(""),
  start_local: z.string().min(16).max(30),
  end_local: z.string().min(16).max(30),
  time_zone: z.string().min(1).max(100),
  all_day: z.boolean().default(false),
  location: z.string().max(1000).default(""),
  meeting_url: z
    .string()
    .max(2000)
    .default("")
    .refine(
      (u) =>
        !u ||
        /^https:\/\/[^\s]+$/.test(u) ||
        /^\/workspace\/sessions\/meeting\/[0-9a-f-]+$/.test(u),
      "Use a valid HTTPS or Syrka Sessions link.",
    ),
  attendees: z
    .array(
      z.object({
        name: z.string().max(120),
        email: z.email().or(z.literal("")),
      }),
    )
    .max(100)
    .default([]),
  category: z.enum(categories).default("personal"),
  visibility: z.enum(["calendar", "private", "busy"]).default("calendar"),
  recurrence: recurrenceSchema.nullable().default(null),
  references: z.array(referenceSchema).max(20).default([]),
  reminders: z.array(z.number().int().min(0).max(43200)).max(5).default([]),
  dst_policy: z.enum(["earlier", "later"]).default("earlier"),
  source: z
    .object({
      system: z.string().max(80),
      record_id: z.string().max(200),
      authoritative: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  revision: z.number().int().min(0).default(0),
});
export type CalendarEvent = z.infer<typeof eventSchema> & {
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
};
export type Calendar = {
  id: string;
  owner_id: string;
  name: string;
  colour: string;
  is_default: boolean;
  role: "owner" | "editor" | "viewer";
  archived: boolean;
  time_zone: string;
};
export type CalendarException = {
  event_id: string;
  original_start: string;
  cancelled: boolean;
  override: Partial<CalendarEvent> | null;
};
export type Occurrence = {
  key: string;
  event_id: string;
  original_start: string;
  start: string;
  end: string;
  start_local: string;
  end_local: string;
  event: CalendarEvent;
  exception: boolean;
};
export function zoneValid(zone: string) {
  try {
    Temporal.Now.zonedDateTimeISO(zone);
    return true;
  } catch {
    return false;
  }
}
/** Reject nonexistent spring times; explicitly choose an offset for an autumn fold. */
export function zoned(
  local: string,
  zone: string,
  policy: "earlier" | "later" = "earlier",
) {
  const p = Temporal.PlainDateTime.from(local);
  const a = p.toZonedDateTime(zone, { disambiguation: "earlier" }),
    b = p.toZonedDateTime(zone, { disambiguation: "later" });
  if (!a.toPlainDateTime().equals(p) && !b.toPlainDateTime().equals(p))
    throw Error(
      "This local time does not exist because the clocks move forward. Choose another time.",
    );
  return policy === "later" ? b : a;
}
export function validateEvent(input: unknown): CalendarEvent {
  const e = eventSchema.parse(input);
  if (!zoneValid(e.time_zone)) throw Error("Choose a valid IANA timezone.");
  const start = zoned(e.start_local, e.time_zone, e.dst_policy),
    end = zoned(e.end_local, e.time_zone, e.dst_policy);
  if (end.epochMilliseconds <= start.epochMilliseconds)
    throw Error("The event must end after it starts.");
  if (end.epochMilliseconds - start.epochMilliseconds > 366 * 86400000)
    throw Error("An event duration cannot exceed one year.");
  if (e.recurrence?.until) {
    Temporal.PlainDate.from(e.recurrence.until);
    if (e.recurrence.until < e.start_local.slice(0, 10))
      throw Error("The recurrence end cannot precede the event.");
  }
  return e;
}
export function expandEvent(
  event: CalendarEvent,
  exceptions: CalendarException[],
  from: string,
  to: string,
  limit = 2000,
): Occurrence[] {
  const e = validateEvent(event),
    base = Temporal.PlainDateTime.from(e.start_local),
    baseDate = base.toPlainDate();
  const duration = Temporal.PlainDateTime.from(e.end_local).since(base, {
    largestUnit: "days",
  });
  const rangeStart = Temporal.Instant.from(from).epochMilliseconds,
    rangeEnd = Temporal.Instant.from(to).epochMilliseconds;
  const maxDate = Temporal.Instant.from(to)
    .toZonedDateTimeISO(e.time_zone)
    .toPlainDate()
    .add({ days: 2 });
  const overrides = new Map(
    exceptions
      .filter((x) => x.event_id === e.id)
      .map((x) => [x.original_start, x]),
  );
  const out: Occurrence[] = [];
  let count = 0,
    iterations = 0;
  const rule = e.recurrence;
  for (
    let date = baseDate;
    Temporal.PlainDate.compare(date, maxDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    if (++iterations > 37000) throw Error("Choose a shorter recurrence range.");
    const days = date.since(baseDate, { largestUnit: "days" }).days;
    const months =
      (date.year - baseDate.year) * 12 + date.month - baseDate.month;
    const weeks = Math.floor((days + baseDate.dayOfWeek - 1) / 7);
    if (rule?.until && date.toString() > rule.until) break;
    const match = !rule
      ? days === 0
      : rule.freq === "daily"
        ? days % rule.interval === 0
        : rule.freq === "weekly"
          ? weeks % rule.interval === 0 &&
            (rule.weekdays.length
              ? rule.weekdays
              : [baseDate.dayOfWeek]
            ).includes(date.dayOfWeek)
          : months % rule.interval === 0 && date.day === baseDate.day;
    if (!match) continue;
    const original = date
      .toPlainDateTime(base.toPlainTime())
      .toString({ smallestUnit: "minute" });
    let start;
    try {
      start = zoned(original, e.time_zone, e.dst_policy);
    } catch {
      continue;
    }
    count++;
    if (rule?.count && count > rule.count) break;
    const ex = overrides.get(original);
    if (ex?.cancelled) continue;
    const current = ex?.override
      ? validateEvent({
          ...e,
          ...ex.override,
          id: e.id,
          calendar_id: e.calendar_id,
          recurrence: null,
        })
      : e;
    const localStart = ex?.override?.start_local || original;
    const localEnd =
      ex?.override?.end_local ||
      Temporal.PlainDateTime.from(localStart)
        .add(duration)
        .toString({ smallestUnit: "minute" });
    start = zoned(localStart, current.time_zone, current.dst_policy);
    const end = zoned(localEnd, current.time_zone, current.dst_policy);
    if (
      end.epochMilliseconds > rangeStart &&
      start.epochMilliseconds < rangeEnd
    )
      out.push({
        key: e.id + ":" + original,
        event_id: e.id,
        original_start: original,
        start: start.toInstant().toString(),
        end: end.toInstant().toString(),
        start_local: localStart,
        end_local: localEnd,
        event: current,
        exception: !!ex,
      });
    if (out.length >= limit)
      throw Error("Too many occurrences in this view. Narrow the date range.");
    if (!rule) break;
  }
  // A moved exception may enter this range from a date outside the visible recurrence range.
  for (const ex of exceptions.filter(
    (x) => x.event_id === e.id && !x.cancelled && x.override?.start_local,
  )) {
    if (out.some((x) => x.original_start === ex.original_start)) continue;
    const changed = validateEvent({ ...e, ...ex.override, recurrence: null });
    const a = zoned(changed.start_local, changed.time_zone, changed.dst_policy),
      b = zoned(changed.end_local, changed.time_zone, changed.dst_policy);
    if (b.epochMilliseconds > rangeStart && a.epochMilliseconds < rangeEnd)
      out.push({
        key: e.id + ":" + ex.original_start,
        event_id: e.id,
        original_start: ex.original_start,
        start: a.toInstant().toString(),
        end: b.toInstant().toString(),
        start_local: changed.start_local,
        end_local: changed.end_local,
        event: changed,
        exception: true,
      });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
export function conflicts(items: Occurrence[]) {
  const pairs: { a: string; b: string }[] = [];
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length; i++)
    for (
      let j = i + 1;
      j < sorted.length && sorted[j].start < sorted[i].end;
      j++
    )
      if (sorted[i].start < sorted[j].end)
        pairs.push({ a: sorted[i].key, b: sorted[j].key });
  return pairs;
}
export function rangeFor(
  date: string,
  view: "month" | "week" | "day" | "agenda",
  zone: string,
) {
  const day = Temporal.PlainDate.from(date);
  let start = day,
    end = day.add({ days: 1 });
  if (view === "month") {
    const first = day.with({ day: 1 });
    start = first.subtract({ days: first.dayOfWeek - 1 });
    end = start.add({ days: 42 });
  }
  if (view === "week") {
    start = day.subtract({ days: day.dayOfWeek - 1 });
    end = start.add({ days: 7 });
  }
  if (view === "agenda") end = day.add({ days: 90 });
  return {
    start: start.toString(),
    end: end.toString(),
    from: start.toZonedDateTime(zone).toInstant().toString(),
    to: end.toZonedDateTime(zone).toInstant().toString(),
  };
}
export function localNow(zone: string) {
  return Temporal.Now.zonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function today(zone: string) {
  return Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
}
export function shiftOccurrence(item: Occurrence, targetLocal: string) {
  const duration = Temporal.PlainDateTime.from(item.end_local).since(
    Temporal.PlainDateTime.from(item.start_local),
    { largestUnit: "days" },
  );
  return {
    start_local: targetLocal,
    end_local: Temporal.PlainDateTime.from(targetLocal)
      .add(duration)
      .toString({ smallestUnit: "minute" }),
  };
}
export function freeSlots(
  items: Occurrence[],
  fromDate: string,
  zone: string,
  minutes = 60,
  days = 7,
) {
  const out: { start_local: string; end_local: string }[] = [];
  for (let d = 0; d < days; d++)
    for (let hour = 9; hour + minutes / 60 <= 18; hour++) {
      const day = Temporal.PlainDate.from(fromDate).add({ days: d });
      if (day.dayOfWeek > 5) continue;
      const a = day.toPlainDateTime({ hour }),
        b = a.add({ minutes });
      const start = zoned(a.toString(), zone).toInstant().toString(),
        end = zoned(b.toString(), zone).toInstant().toString();
      if (!items.some((e) => e.start < end && e.end > start))
        out.push({
          start_local: a.toString({ smallestUnit: "minute" }),
          end_local: b.toString({ smallestUnit: "minute" }),
        });
    }
  return out.slice(0, 20);
}
/** Clip multi-day intervals to a display day and assign non-overlapping visual lanes. */
export function timedLayout(items: Occurrence[], day: string, zone: string) {
  const window = rangeFor(day, "day", zone),
    from = Date.parse(window.from),
    to = Date.parse(window.to);
  const intervals = items
    .filter(
      (o) =>
        !o.event.all_day &&
        Date.parse(o.start) < to &&
        Date.parse(o.end) > from,
    )
    .map((o) => {
      const a = Temporal.Instant.from(o.start).toZonedDateTimeISO(zone),
        b = Temporal.Instant.from(o.end).toZonedDateTimeISO(zone);
      const start = Date.parse(o.start) < from ? 0 : a.hour * 60 + a.minute,
        end = Date.parse(o.end) >= to ? 1440 : b.hour * 60 + b.minute;
      return { key: o.key, start, end: Math.max(start + 15, end) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Record<
    string,
    { start: number; end: number; lane: number; count: number }
  > = {};
  let group: typeof intervals = [],
    maxEnd = 0;
  const flush = () => {
    const ends: number[] = [];
    const placed = group.map((item) => {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = item.end;
      return { ...item, lane };
    });
    for (const p of placed) result[p.key] = { ...p, count: ends.length };
    group = [];
  };
  for (const item of intervals) {
    if (group.length && item.start >= maxEnd) flush();
    if (!group.length) maxEnd = 0;
    group.push(item);
    maxEnd = Math.max(maxEnd, item.end);
  }
  flush();
  return result;
}
export function moveDisplayedOccurrence(
  item: Occurrence,
  day: string,
  displayZone: string,
  hour?: number,
) {
  if (item.event.all_day) return shiftOccurrence(item, day + "T00:00");
  const displayed = Temporal.Instant.from(item.start).toZonedDateTimeISO(
    displayZone,
  );
  const time =
    hour === undefined
      ? displayed.toPlainTime().toString({ smallestUnit: "minute" })
      : String(hour).padStart(2, "0") + ":00";
  const local = zoned(day + "T" + time, displayZone, item.event.dst_policy)
    .withTimeZone(item.event.time_zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
  return shiftOccurrence(item, local);
}
/** RFC DATE/all-day values stay on their named dates across display timezones. */
export function expandInView(
  event: CalendarEvent,
  exceptions: CalendarException[],
  startDate: string,
  endDate: string,
  displayZone: string,
) {
  const from = Temporal.PlainDate.from(startDate)
      .toZonedDateTime(displayZone)
      .toInstant(),
    to = Temporal.PlainDate.from(endDate)
      .toZonedDateTime(displayZone)
      .toInstant();
  return expandEvent(
    event,
    exceptions,
    from.subtract({ hours: 48 }).toString(),
    to.add({ hours: 48 }).toString(),
  )
    .map((o) => {
      if (!o.event.all_day) return o;
      const a = Temporal.PlainDate.from(o.start_local.slice(0, 10)),
        rawEnd = Temporal.PlainDate.from(o.end_local.slice(0, 10)),
        b =
          Temporal.PlainDate.compare(rawEnd, a) > 0
            ? rawEnd
            : a.add({ days: 1 });
      return {
        ...o,
        start: a.toZonedDateTime(displayZone).toInstant().toString(),
        end: b.toZonedDateTime(displayZone).toInstant().toString(),
      };
    })
    .filter(
      (o) =>
        Date.parse(o.end) > from.epochMilliseconds &&
        Date.parse(o.start) < to.epochMilliseconds,
    );
}
