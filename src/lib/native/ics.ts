import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { zoned } from "./calendar";
import {
  validateEvent,
  type CalendarEvent,
  type CalendarException,
} from "./calendar";
const clean = (s: string) =>
  s
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r", "");
const stamp = (s: string) =>
  s.replaceAll("-", "").replaceAll(":", "").slice(0, 15) +
  (s.length === 16 ? "00" : "");
export function exportICS(
  event: CalendarEvent,
  exceptions: CalendarException[] = [],
) {
  const e = validateEvent(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Syrka//Calendar 1.0//EN",
    "CALSCALE:GREGORIAN",
  ];
  // Include VTIMEZONE observances, so clients without an IANA registry retain DST.
  const zones = new Set([
    e.time_zone,
    ...exceptions
      .filter((x) => x.event_id === e.id)
      .map((x) => x.override?.time_zone)
      .filter((x): x is string => !!x),
  ]);
  for (const zone of zones) {
    let cursor = Temporal.PlainDate.from(e.start_local.slice(0, 10))
      .with({ month: 1, day: 1 })
      .subtract({ years: 1 })
      .toZonedDateTime(zone);
    const finalYear = Math.min(
      2100,
      Math.max(
        cursor.year + 16,
        Number(e.recurrence?.until?.slice(0, 4) || 0) + 1,
      ),
    );
    const offset = (n: number) => {
      const minutes = Math.abs(Math.round(n / 60_000_000_000));
      return (
        (n < 0 ? "-" : "+") +
        String(Math.floor(minutes / 60)).padStart(2, "0") +
        String(minutes % 60).padStart(2, "0")
      );
    };
    lines.push(
      "BEGIN:VTIMEZONE",
      "TZID:" + zone,
      "X-LIC-LOCATION:" + zone,
      "BEGIN:STANDARD",
      "DTSTART:" +
        stamp(cursor.toPlainDateTime().toString({ smallestUnit: "second" })),
      "TZOFFSETFROM:" + offset(cursor.offsetNanoseconds),
      "TZOFFSETTO:" + offset(cursor.offsetNanoseconds),
      "END:STANDARD",
    );
    for (let count = 0; count < 160; count++) {
      const transition = cursor.getTimeZoneTransition("next");
      if (!transition || transition.year > finalYear) break;
      const before = transition.subtract({ nanoseconds: 1 });
      const local = before.toPlainDateTime().add({ nanoseconds: 1 });
      const kind =
        transition.offsetNanoseconds > before.offsetNanoseconds
          ? "DAYLIGHT"
          : "STANDARD";
      lines.push(
        "BEGIN:" + kind,
        "DTSTART:" + stamp(local.toString({ smallestUnit: "second" })),
        "TZOFFSETFROM:" + offset(before.offsetNanoseconds),
        "TZOFFSETTO:" + offset(transition.offsetNanoseconds),
        "END:" + kind,
      );
      cursor = transition;
    }
    lines.push("END:VTIMEZONE");
  }
  const block = (item: CalendarEvent, original?: string) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@syrka.co`,
      `DTSTAMP:${stamp(new Date().toISOString().slice(0, 19))}Z`,
      `SUMMARY:${clean(item.title)}`,
      `DESCRIPTION:${clean(item.description)}`,
      `LOCATION:${clean(item.location)}`,
    );
    if (item.all_day) {
      lines.push(
        `DTSTART;VALUE=DATE:${stamp(item.start_local).slice(0, 8)}`,
        `DTEND;VALUE=DATE:${(item.end_local.slice(0, 10) > item.start_local.slice(0, 10) ? item.end_local.slice(0, 10) : Temporal.PlainDate.from(item.start_local.slice(0, 10)).add({ days: 1 }).toString()).replaceAll("-", "")}`,
      );
    } else
      lines.push(
        `DTSTART;TZID=${item.time_zone}:${stamp(item.start_local)}`,
        `DTEND;TZID=${item.time_zone}:${stamp(item.end_local)}`,
      );
    if (original)
      lines.push(
        e.all_day
          ? `RECURRENCE-ID;VALUE=DATE:${stamp(original).slice(0, 8)}`
          : `RECURRENCE-ID;TZID=${e.time_zone}:${stamp(original)}`,
      );
    if (!original && e.recurrence) {
      const r = e.recurrence;
      const parts = [`FREQ=${r.freq.toUpperCase()}`, `INTERVAL=${r.interval}`];
      if (r.count) parts.push(`COUNT=${r.count}`);
      if (r.until)
        parts.push(
          `UNTIL=${stamp(
            zoned(r.until + "T23:59:59", e.time_zone, e.dst_policy)
              .toInstant()
              .toString()
              .slice(0, 19),
          )}Z`,
        );
      if (r.weekdays.length)
        parts.push(
          `BYDAY=${r.weekdays.map((d) => ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][d - 1]).join(",")}`,
        );
      lines.push("RRULE:" + parts.join(";"));
      for (const ex of exceptions.filter(
        (x) => x.event_id === e.id && x.cancelled,
      ))
        lines.push(
          e.all_day
            ? `EXDATE;VALUE=DATE:${stamp(ex.original_start).slice(0, 8)}`
            : `EXDATE;TZID=${e.time_zone}:${stamp(ex.original_start)}`,
        );
    }
    if (item.meeting_url?.startsWith("https:"))
      lines.push(`URL:${clean(item.meeting_url)}`);
    lines.push("END:VEVENT");
  };
  block(e);
  for (const ex of exceptions.filter(
    (x) => x.event_id === e.id && !x.cancelled && x.override,
  ))
    block({ ...e, ...ex.override, recurrence: null }, ex.original_start);
  lines.push("END:VCALENDAR");
  return (
    lines
      .map((line) => {
        const chunks: string[] = [];
        let chunk = "",
          bytes = 0;
        for (const char of line) {
          const size = new TextEncoder().encode(char).length;
          if (bytes + size > 72) {
            chunks.push(chunk);
            chunk = "";
            bytes = 0;
          }
          chunk += char;
          bytes += size;
        }
        chunks.push(chunk);
        return chunks.join("\r\n ");
      })
      .join("\r\n") + "\r\n"
  );
}
export function importICS(
  text: string,
  calendarId: string,
  zone: string,
): CalendarEvent[] {
  if (text.length > 2_000_000)
    throw Error("Calendar imports are limited to 2 MB.");
  const root = new ICAL.Component(ICAL.parse(text));
  for (const timezone of root.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(new ICAL.Timezone(timezone));
  const items = root.getAllSubcomponents("vevent");
  if (items.length > 1000) throw Error("Import at most 1,000 event series.");
  return items.map((c) => {
    if (c.hasProperty("recurrence-id") || c.hasProperty("exdate"))
      throw Error(
        "This import contains recurrence exceptions. Import without exceptions or add them in Syrka; nothing was imported.",
      );
    const v = new ICAL.Event(c);
    if (!v.uid)
      throw Error(
        "Every imported event must have an iCalendar UID. Nothing was imported.",
      );
    const r = c.getFirstPropertyValue("rrule") as ICAL.Recur | null;
    const allowed = ["DAILY", "WEEKLY", "MONTHLY"];
    if (
      r &&
      (!allowed.includes(r.freq) ||
        Object.keys(r.parts).some((k) => k !== "BYDAY") ||
        (r.parts.BYDAY && r.freq !== "WEEKLY") ||
        r.parts.BYDAY?.some(
          (x: string) =>
            !["MO", "TU", "WE", "TH", "FR", "SA", "SU"].includes(x),
        ))
    )
      throw Error("Unsupported recurrence rule; nothing was imported.");
    const fmt = (t: ICAL.Time) =>
      t.toString().replace(/Z$/, "") + (t.isDate ? "T00:00" : "");
    const timezone = String(
      c.getFirstProperty("dtstart")?.getParameter("tzid") ||
        v.startDate.zone.tzid,
    );
    const eventZone =
      timezone === "floating" ? zone : timezone === "Z" ? "UTC" : timezone;
    let until: string | null = null;
    if (r?.until) {
      if (r.until.isDate) until = r.until.toString();
      else {
        const local = r.until.toString().endsWith("Z")
          ? Temporal.Instant.from(r.until.toString())
              .toZonedDateTimeISO(eventZone)
              .toPlainDateTime()
          : Temporal.PlainDateTime.from(r.until.toString());
        const baseTime = Temporal.PlainDateTime.from(
          fmt(v.startDate),
        ).toPlainTime();
        until = (
          Temporal.PlainTime.compare(local.toPlainTime(), baseTime) < 0
            ? local.toPlainDate().subtract({ days: 1 })
            : local.toPlainDate()
        ).toString();
      }
    }
    return validateEvent({
      id: crypto.randomUUID(),
      calendar_id: calendarId,
      title: v.summary || "Imported event",
      source: {
        system: "ical",
        record_id: v.uid || crypto.randomUUID(),
        authoritative: false,
      },
      description: v.description || "",
      start_local: fmt(v.startDate),
      end_local: fmt(v.endDate),
      time_zone:
        timezone === "floating" ? zone : timezone === "Z" ? "UTC" : timezone,
      all_day: v.startDate.isDate,
      location: v.location || "",
      recurrence: r
        ? {
            freq: r.freq.toLowerCase(),
            interval: r.interval || 1,
            count: r.count || null,
            until,
            weekdays: (r.parts.BYDAY || []).map(
              (x: string) =>
                ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].indexOf(x) + 1,
            ),
          }
        : null,
    });
  });
}
